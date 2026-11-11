-- Compras: ordem de compra no Tiny a partir da cotação vencedora + o pedido aparece no portal do fornecedor.
-- Quem cria a ordem é a Edge Function compras-oc (só o dono). Aqui ficam o registro, as travas e o que o fornecedor vê.

alter table public.oportunidades
  add column if not exists oc_status text check (oc_status in ('enviando', 'criada', 'erro')),
  add column if not exists oc_tiny_id bigint,
  add column if not exists oc_numero text,
  add column if not exists oc_previsao date,
  add column if not exists oc_total numeric(14,2),
  add column if not exists oc_em timestamptz,
  add column if not exists oc_por text,
  add column if not exists oc_erro text,
  add column if not exists oc_confirmada_em timestamptz;

-- Os campos oc_* só mudam pela função compras-oc (service_role); oc_confirmada_em só pela forn_pedido_confirmar.
create or replace function seg.oc_trava()
 returns trigger language plpgsql security invoker set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if (new.oc_status, new.oc_tiny_id, new.oc_numero, new.oc_previsao, new.oc_total, new.oc_em, new.oc_por, new.oc_erro)
       is distinct from (old.oc_status, old.oc_tiny_id, old.oc_numero, old.oc_previsao, old.oc_total, old.oc_em, old.oc_por, old.oc_erro)
      then raise exception 'A ordem de compra só é gerada pelo botão "Gerar ordem de compra no Tiny".'; end if;
    if new.oc_confirmada_em is distinct from old.oc_confirmada_em and current_setting('app.forn_confirma', true) is distinct from '1'
      then raise exception 'Só o fornecedor confirma o recebimento do pedido.'; end if;
  end if;
  return new;
end $function$;
drop trigger if exists oc_trava on public.oportunidades;
create trigger oc_trava before update on public.oportunidades for each row execute function seg.oc_trava();

-- Depois que a ordem existe no Tiny, não dá mais para trocar ou desfazer o vencedor pela Intranet.
create or replace function public.op_vencedor(p_op bigint, p_proposta bigint)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.pode_compras() then raise exception 'sem permissão'; end if;
  if exists (select 1 from oportunidades where id = p_op and oc_status in ('enviando', 'criada')) then
    raise exception 'A ordem de compra já foi gerada no Tiny. Para mudar o vencedor, cancele a ordem no Tiny e fale com o administrador.'; end if;
  if p_proposta is not null and not exists (select 1 from propostas where id = p_proposta and oportunidade_id = p_op and status = 'enviada') then
    raise exception 'proposta não encontrada nesta oportunidade'; end if;
  update propostas set vencedora = (id = p_proposta) where oportunidade_id = p_op;
  update oportunidades set vencedora_id = p_proposta, vencedor_em = case when p_proposta is null then null else now() end,
    vencedor_por = case when p_proposta is null then null else seg.minha_pessoa() end,
    status = case when p_proposta is null then 'encerrada' else 'concluida' end where id = p_op;
  return jsonb_build_object('ok', true);
end $function$;

-- O fornecedor vencedor vê o pedido (número, previsão, total) e confirma que recebeu.
create or replace function public.forn_pedido_json(o public.oportunidades, fid bigint)
 returns jsonb language sql stable security invoker set search_path to 'public'
as $function$
  select case when o.oc_status = 'criada' and exists (select 1 from propostas p where p.id = o.vencedora_id and p.fornecedor_id = fid)
    then jsonb_build_object('numero', o.oc_numero, 'emitido_em', o.oc_em, 'previsao', o.oc_previsao, 'total', o.oc_total, 'confirmado_em', o.oc_confirmada_em)
  end
$function$;
revoke execute on function public.forn_pedido_json(public.oportunidades, bigint) from public, anon, authenticated;

create or replace function public.forn_portal(p_token text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare fid bigint := seg.forn_atual(p_token); f fornecedores;
begin
  if fid is null then return null; end if;
  update fornecedores set ultimo_acesso = now() where id = fid returning * into f;
  return jsonb_build_object(
    'fornecedor', jsonb_build_object('nome', f.nome, 'cnpj', f.cnpj, 'contato', f.contato, 'email', f.email, 'telefone', f.telefone, 'whatsapp', f.whatsapp, 'marcas', f.marcas,
      'cep', f.cep, 'logradouro', f.logradouro, 'numero', f.numero, 'complemento', f.complemento, 'bairro', f.bairro, 'cidade', f.cidade, 'uf', f.uf, 'tem_login', f.user_id is not null),
    'empresa', (select valor->>'empresa' from config where chave = 'assistencia'),
    'oportunidades', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'titulo', o.titulo, 'prazo_resposta', o.prazo_resposta, 'publicada_em', o.publicada_em,
        'aberta', o.status = 'aberta' and (o.prazo_resposta is null or o.prazo_resposta > now()),
        'situacao', case when o.status = 'concluida' then 'concluida' when o.status = 'cancelada' then 'cancelada'
                         when o.status = 'aberta' and (o.prazo_resposta is null or o.prazo_resposta > now()) then 'aberta' else 'encerrada' end,
        'itens', (select count(*) from op_itens i where i.oportunidade_id = o.id),
        'proposta', pr.status, 'enviada_em', pr.enviada_em, 'vencedora', coalesce(pr.vencedora, false),
        'pedido', public.forn_pedido_json(o, fid)) order by o.publicada_em desc nulls last)
      from op_fornecedores ofo join oportunidades o on o.id = ofo.oportunidade_id
      left join propostas pr on pr.oportunidade_id = o.id and pr.fornecedor_id = fid
      where ofo.fornecedor_id = fid and o.status <> 'rascunho'), '[]'::jsonb));
end $function$;

create or replace function public.forn_oportunidade(p_token text, p_op bigint)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare fid bigint := seg.forn_atual(p_token); o oportunidades; pr propostas;
begin
  if fid is null then return null; end if;
  select op.* into o from oportunidades op join op_fornecedores x on x.oportunidade_id = op.id and x.fornecedor_id = fid where op.id = p_op and op.status <> 'rascunho';
  if o.id is null then return null; end if;
  update op_fornecedores set visto_em = coalesce(visto_em, now()) where oportunidade_id = p_op and fornecedor_id = fid;
  select * into pr from propostas where oportunidade_id = p_op and fornecedor_id = fid;
  return jsonb_build_object(
    'id', o.id, 'titulo', o.titulo, 'descricao', o.descricao, 'pagamento', o.pagamento, 'entrega', o.entrega, 'prazo_resposta', o.prazo_resposta,
    'aberta', o.status = 'aberta' and (o.prazo_resposta is null or o.prazo_resposta > now()),
    'situacao', case when o.status in ('concluida', 'cancelada') then o.status when o.status = 'aberta' and (o.prazo_resposta is null or o.prazo_resposta > now()) then 'aberta' else 'encerrada' end,
    'pedido', public.forn_pedido_json(o, fid),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'codigo', i.produto_codigo, 'descricao', i.descricao, 'quantidade', i.quantidade, 'unidade', i.unidade, 'especificacao', i.especificacao) order by i.ordem, i.id)
      from op_itens i where i.oportunidade_id = o.id), '[]'::jsonb),
    'proposta', case when pr.id is null then null else jsonb_build_object('status', pr.status, 'prazo_entrega_dias', pr.prazo_entrega_dias, 'frete', pr.frete, 'validade', pr.validade,
      'pagamento', pr.pagamento, 'obs', pr.obs, 'enviada_em', pr.enviada_em, 'atualizada_em', pr.atualizada_em, 'vencedora', pr.vencedora,
      'itens', coalesce((select jsonb_agg(jsonb_build_object('item_id', pi.item_id, 'preco_unit', pi.preco_unit, 'disponivel', pi.disponivel, 'marca_modelo', pi.marca_modelo, 'obs', pi.obs))
        from proposta_itens pi where pi.proposta_id = pr.id), '[]'::jsonb)) end);
end $function$;

-- Fornecedor confirma que recebeu o pedido (só o vencedor, só uma vez).
create or replace function public.forn_pedido_confirmar(p_token text, p_op bigint)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare fid bigint := seg.forn_atual(p_token); n int;
begin
  if fid is null then raise exception 'acesso inválido'; end if;
  perform set_config('app.forn_confirma', '1', true);
  update oportunidades o set oc_confirmada_em = now()
   where o.id = p_op and o.oc_status = 'criada' and o.oc_confirmada_em is null
     and exists (select 1 from propostas p where p.id = o.vencedora_id and p.fornecedor_id = fid);
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n = 1);
end $function$;
revoke execute on function public.forn_pedido_confirmar(text, bigint) from public;
grant execute on function public.forn_pedido_confirmar(text, bigint) to anon, authenticated;
