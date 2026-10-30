-- Lote 2, entrega B: "Pediu orçamento" vira negócio, calendário comercial (dia útil) e reagendamento com motivo.

-- Negócio nascido de um contato da prospecção (base para a atribuição do lote 3).
alter table public.negocios add column if not exists prospeccao_id bigint references public.prospeccao(id) on delete set null;
create unique index if not exists negocios_prospeccao_uk on public.negocios (prospeccao_id) where prospeccao_id is not null;

-- Reagendar guarda a data combinada primeiro e o histórico de mudanças.
alter table public.atividades
  add column if not exists quando_original date,
  add column if not exists reagendamentos jsonb not null default '[]'::jsonb;

/** Primeiro dia útil a partir da data: a loja abre de segunda a sábado; feriados vêm da configuração da Equipe. */
create or replace function public.dia_util(p_data date) returns date
language plpgsql stable set search_path = '' as $$
declare d date := p_data; f jsonb := coalesce((select c.valor from public.config c where c.chave = 'feriados'), '[]'::jsonb);
begin
  if d is null then return null; end if;
  for i in 1..30 loop
    exit when extract(dow from d) <> 0 and not f ? to_char(d, 'YYYY-MM-DD');
    d := d + 1;
  end loop;
  return d;
end $$;
revoke execute on function public.dia_util(date) from public, anon;
grant execute on function public.dia_util(date) to authenticated, service_role;

/** Reagenda uma atividade aberta com motivo; a data original e o histórico ficam guardados. */
create or replace function public.atividade_reagendar(p_id bigint, p_data date, p_motivo text)
returns jsonb language plpgsql set search_path = '' as $$
declare a public.atividades; ator text := public.eu(); m text := left(trim(coalesce(p_motivo, '')), 300);
begin
  if ator is null then raise exception 'Sessão inválida'; end if;
  if m = '' then raise exception 'Diga o motivo do reagendamento.'; end if;
  if p_data is null or p_data < (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Escolha hoje ou uma data futura.'; end if;
  -- Mesma ordem de locks do atividade_concluir: negócio, depois atividade.
  perform 1 from public.negocios g join public.atividades t on t.negocio_id = g.id where t.id = p_id for update of g;
  select * into a from public.atividades where id = p_id for update;
  if not found then raise exception 'Atividade não encontrada ou sem permissão.'; end if;
  if a.feito or a.arquivada_em is not null then raise exception 'Esta atividade já foi concluída.'; end if;
  -- repetição do mesmo pedido não duplica o histórico
  if a.quando = p_data then return to_jsonb(a); end if;
  update public.atividades set quando_original = coalesce(quando_original, quando), quando = p_data,
    reagendamentos = reagendamentos || jsonb_build_array(jsonb_build_object('de', a.quando, 'para', p_data, 'motivo', m, 'por', ator, 'em', now()))
   where id = a.id returning * into a;
  if not found then raise exception 'Sem permissão para reagendar esta atividade.'; end if;
  if a.negocio_id is not null then update public.negocios set mov_em = now() where id = a.negocio_id; end if;
  return to_jsonb(a);
end $$;
revoke execute on function public.atividade_reagendar(bigint, date, text) from public, anon;
grant execute on function public.atividade_reagendar(bigint, date, text) to authenticated;

/** "Pediu orçamento" na prospecção: cria o negócio já preenchido ou liga a um negócio aberto do cliente,
 *  e agenda o próximo passo nele. O retorno automático da prospecção é encerrado (o próximo passo passa a ser do negócio). */
create or replace function public.prospeccao_negocio(p_prospeccao bigint, p_negocio bigint, p_titulo text, p_valor numeric,
                                                     p_atv_data date, p_atv_titulo text)
returns jsonb language plpgsql set search_path = '' as $$
declare x public.prospeccao; g public.negocios; a public.atividades; ator text := public.eu();
begin
  if ator is null then raise exception 'Sessão inválida'; end if;
  select * into x from public.prospeccao where id = p_prospeccao for update;
  if not found then raise exception 'Contato não encontrado ou sem permissão.'; end if;
  if x.resultado is distinct from 'orcamento' then raise exception 'Marque "Pediu orçamento" antes de criar o negócio.'; end if;
  -- já virou negócio: devolve o mesmo (clique repetido não duplica)
  select * into g from public.negocios where prospeccao_id = x.id;
  if found then return jsonb_build_object('negocio', to_jsonb(g), 'repetido', true); end if;
  if p_atv_data is null or p_atv_data < (now() at time zone 'America/Sao_Paulo')::date or trim(coalesce(p_atv_titulo, '')) = '' then
    raise exception 'Defina a data e o próximo passo.';
  end if;
  if p_negocio is not null then
    update public.negocios set prospeccao_id = x.id, mov_em = now()
     where id = p_negocio and prospeccao_id is null and etapa not in ('ganho', 'perdido') and cliente_chave = x.cliente_chave
    returning * into g;
    if not found then raise exception 'Negócio não encontrado, já encerrado ou de outro cliente.'; end if;
  else
    if trim(coalesce(p_titulo, '')) = '' then raise exception 'Diga o que é o negócio.'; end if;
    insert into public.negocios (titulo, cliente_chave, cliente_nome, pessoa_id, etapa, valor, origem, criado_por, prospeccao_id, mov_em)
    values (left(trim(p_titulo), 160), x.cliente_chave, x.cliente_nome, x.pessoa_id, 'qualificado', greatest(coalesce(p_valor, 0), 0),
            'prospeccao', ator, x.id, now())
    returning * into g;
  end if;
  insert into public.atividades (negocio_id, cliente_chave, cliente_nome, pessoa_id, tipo, titulo, quando, criado_por)
  values (g.id, g.cliente_chave, g.cliente_nome, g.pessoa_id, 'orcamento', left(trim(p_atv_titulo), 200), p_atv_data, ator)
  returning * into a;
  if x.interacao_id is not null then
    update public.interacoes set feito = true where id = x.interacao_id;
    if not found then raise exception 'Sem permissão para encerrar o retorno desta prospecção. Peça ao vendedor da campanha.'; end if;
  end if;
  return jsonb_build_object('negocio', to_jsonb(g), 'atividade', to_jsonb(a), 'repetido', false);
end $$;
revoke execute on function public.prospeccao_negocio(bigint, bigint, text, numeric, date, text) from public, anon;
grant execute on function public.prospeccao_negocio(bigint, bigint, text, numeric, date, text) to authenticated;

-- Negócio da prospecção que foi juntado a um orçamento do Tiny: fica guardado (histórico), apontando para o negócio que continuou.
alter table public.negocios add column if not exists juntado_a bigint references public.negocios(id) on delete set null;

/** Junta, por decisão do vendedor, o negócio da prospecção ao negócio do orçamento do Tiny do mesmo cliente:
 *  o do Tiny passa a carregar o vínculo com a campanha, a previsão, as observações e as atividades abertas e feitas;
 *  o da prospecção fica encerrado como "juntado" (não conta como perda) e continua consultável. */
create or replace function public.negocio_juntar(p_tiny bigint, p_prospeccao_negocio bigint)
returns jsonb language plpgsql set search_path = '' as $$
declare t public.negocios; p public.negocios; ator text := public.eu(); pid bigint;
begin
  if ator is null then raise exception 'Sessão inválida'; end if;
  -- trava os dois na ordem do id (evita deadlock entre juntadas simultâneas)
  perform 1 from public.negocios where id in (p_tiny, p_prospeccao_negocio) order by id for update;
  select * into t from public.negocios where id = p_tiny;
  select * into p from public.negocios where id = p_prospeccao_negocio;
  if t.id is null or p.id is null then raise exception 'Negócio não encontrado ou sem permissão.'; end if;
  -- repetição do mesmo pedido
  if p.juntado_a = t.id then return jsonb_build_object('negocio', to_jsonb(t), 'juntado', to_jsonb(p), 'repetido', true); end if;
  if t.cliente_chave is distinct from p.cliente_chave then raise exception 'Os negócios são de clientes diferentes.'; end if;
  if t.orcamento_id is null or t.prospeccao_id is not null then raise exception 'O primeiro negócio precisa ser o do orçamento do Tiny, sem campanha ligada.'; end if;
  if p.prospeccao_id is null or p.orcamento_id is not null then raise exception 'O segundo negócio precisa ser o da prospecção, sem orçamento.'; end if;
  if t.etapa in ('ganho', 'perdido') or p.etapa in ('ganho', 'perdido') then raise exception 'Um dos negócios já foi encerrado.'; end if;
  pid := p.prospeccao_id;
  -- atividades primeiro: o encerramento do negócio da prospecção não deve arquivar o que continua valendo
  update public.atividades set negocio_id = t.id where negocio_id = p.id;
  update public.negocios set prospeccao_id = null, etapa = 'perdido', juntado_a = t.id,
    motivo_perda = 'Juntado ao orçamento ' || coalesce(t.orcamento_numero, '') where id = p.id
  returning * into p;
  if not found then raise exception 'Sem permissão para alterar o negócio da prospecção.'; end if;
  update public.negocios set prospeccao_id = pid, origem = 'prospeccao', previsao = coalesce(t.previsao, p.previsao),
    obs = nullif(concat_ws(E'\n', t.obs, 'Da prospecção: ' || p.titulo, p.obs), ''), mov_em = now()
   where id = t.id returning * into t;
  if not found then raise exception 'Sem permissão para alterar o negócio do orçamento.'; end if;
  return jsonb_build_object('negocio', to_jsonb(t), 'juntado', to_jsonb(p), 'repetido', false);
end $$;
revoke execute on function public.negocio_juntar(bigint, bigint) from public, anon;
grant execute on function public.negocio_juntar(bigint, bigint) to authenticated;

-- Botão "+" das atividades: devolve também os números marcados como errados, para a tela não oferecer
-- um número que veio escrito no nome do cliente ("19 99999-0000 ~Fulano") e já foi marcado como errado.
create or replace function public.contato_atividade(p_atividade bigint)
 returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with a as (
    select a.*, g.cliente_tiny_id, coalesce(a.cliente_chave, g.cliente_chave) chave, coalesce(a.cliente_nome, g.cliente_nome) nome
      from atividades a left join negocios g on g.id = a.negocio_id
     where a.id = p_atividade and (public.eh_dono() or a.pessoa_id in (select seg.pessoas_visiveis())))
  select jsonb_build_object(
    'nome', a.nome,
    -- primeiro o celular que a agenda usa (incluído/confirmado na Intranet), depois os do Tiny
    'celular', (select x from unnest(array[(select ct.telefone from cliente_telefones ct where ct.cliente_chave = a.chave and ct.celular and ct.errado_em is null
                    order by ct.validado_em desc nulls last, (ct.origem = 'manual') desc, ct.criado_em desc limit 1),
                  nullif(c.celular, ''), nullif(t.fone, ''), nullif(c.fone, ''),
                  (select nullif(k.fone, '') from contatos_tiny k where k.doc = c.doc and k.doc is not null and k.fone <> '' limit 1)]) with ordinality u(x, o)
                 where x is not null and not seg.fone_errado(a.chave, x) order by o limit 1),
    'fone', case when not seg.fone_errado(a.chave, c.fone) then nullif(c.fone, '') end,
    'errados', coalesce((select jsonb_agg(e.telefone) from cliente_telefones e where e.cliente_chave = a.chave and e.errado_em is not null), '[]'::jsonb),
    'email', coalesce(nullif(t.email, ''), nullif(c.email, ''), (select nullif(k.email, '') from contatos_tiny k where k.doc = c.doc and k.doc is not null and k.email <> '' limit 1)),
    'cidade', coalesce(t.cidade, c.cidade), 'uf', coalesce(t.uf, c.uf), 'doc', coalesce(t.doc, c.doc), 'chave', a.chave)
  from a left join contatos_tiny t on t.id = a.cliente_tiny_id left join clientes c on c.chave = a.chave
$function$;

-- Retornos automáticos da prospecção caem em dia útil (sem domingo nem feriado).
do $$
declare def text := pg_get_functiondef('public.prospeccao_registrar(bigint,text,text,text)'::regprocedure); novo text;
begin
  novo := replace(def, $a$then (now() at time zone 'America/Sao_Paulo')::date+2$a$, $b$then public.dia_util((now() at time zone 'America/Sao_Paulo')::date+2)$b$);
  novo := replace(novo, $a$then (now() at time zone 'America/Sao_Paulo')::date+3 end$a$, $b$then public.dia_util((now() at time zone 'America/Sao_Paulo')::date+3) end$b$);
  if (length(novo) - length(replace(novo, 'public.dia_util(', ''))) / length('public.dia_util(') <> 2 then
    raise exception 'prospeccao_registrar mudou desde a revisão; ajuste a migration';
  end if;
  execute novo;
end $$;
