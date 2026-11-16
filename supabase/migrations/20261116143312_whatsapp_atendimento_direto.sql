-- WhatsApp: modo "atendimento direto" (pedido do Vinícius em 16/11/2026).
-- Com config.whatsapp.responsavel_fixo preenchido (ex.: "pedro"), toda conversa nova (e a fila "Sem dono") vai direto
-- para essa pessoa, sem depender de expediente; o botão "Iniciar expediente" fica desligado.
-- Para voltar ao rodízio com expediente: tirar a chave responsavel_fixo do config.whatsapp.

create or replace function seg.wa_fixo()
 returns text language sql stable security definer set search_path to 'public'
as $$
  select pe.id from public.config c join public.pessoas pe on pe.id = c.valor->>'responsavel_fixo' and pe.ativo
   where c.chave = 'whatsapp' limit 1
$$;

create or replace function seg.wa_atribuir(p_conv bigint)
 returns text language plpgsql security definer set search_path to 'public'
as $$
declare c public.wa_conversas; quem text; como text; fixo text := seg.wa_fixo();
begin
  select * into c from public.wa_conversas where id = p_conv for update;
  if c.id is null or c.responsavel is not null or c.status <> 'aberta' then return c.responsavel; end if;
  if fixo is not null then
    quem := fixo; como := 'atendimento direto';
  elsif c.vendedor_carteira is not null and seg.wa_disponivel(c.vendedor_carteira) then
    quem := c.vendedor_carteira; como := 'cliente da carteira';
  else
    select a.pessoa into quem from public.wa_atendentes a
     where c.setor = any(a.setores) and seg.wa_disponivel(a.pessoa)
     order by a.ultimo_lead_em nulls first, a.pessoa
     limit 1 for update of a skip locked;
    como := 'rodízio';
  end if;
  if quem is null then return null; end if;
  update public.wa_conversas set responsavel = quem where id = p_conv;
  insert into public.wa_atendentes (pessoa) values (quem) on conflict do nothing;
  update public.wa_atendentes set ultimo_lead_em = now() where pessoa = quem;
  insert into public.wa_mensagens (conversa_id, direcao, tipo, texto, status, por)
    values (p_conv, 'nota', 'evento', 'recebeu a conversa (' || como || ')', 'enviada', quem);
  return quem;
end $$;

create or replace function public.wa_expediente(p_acao text, p_tela boolean default false)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare eu text := seg.minha_pessoa(); a public.wa_atendentes; ev text;
begin
  if eu is null or not seg.pode_atendimento() then raise exception 'sem permissão de atendimento'; end if;
  if p_acao in ('inicio', 'retorno') and seg.wa_fixo() is not null then
    raise exception 'O expediente está desligado por enquanto: as conversas novas vão direto para %.', (select nome from public.pessoas where id = seg.wa_fixo());
  end if;
  insert into public.wa_atendentes (pessoa) values (eu) on conflict do nothing;
  perform seg.wa_verificar_presenca();
  select * into a from public.wa_atendentes where pessoa = eu for update;
  if p_acao = 'inicio' and a.estado = 'fora' then ev := 'inicio'; a.estado := 'trabalhando';
  elsif p_acao = 'almoco' and a.estado = 'trabalhando' then ev := 'almoco'; a.estado := 'almoco';
  elsif p_acao = 'retorno' and a.estado = 'almoco' then ev := 'retorno'; a.estado := 'trabalhando';
  elsif p_acao = 'fim' and a.estado <> 'fora' then ev := 'fim'; a.estado := 'fora';
  elsif p_acao = 'aviso_ok' then update public.wa_atendentes set aviso = null, aviso_em = null where pessoa = eu;
  elsif p_acao not in ('ping', 'inicio', 'almoco', 'retorno', 'fim') then raise exception 'ação inválida';
  end if;
  update public.wa_atendentes set estado = a.estado, desde = case when ev is not null then now() else desde end,
      visto_em = now(), tela_em = case when p_tela then now() else tela_em end
   where pessoa = eu;
  if ev is not null then insert into public.wa_expediente_log (pessoa, evento, por) values (eu, ev, eu); end if;
  if a.estado = 'trabalhando' then perform seg.wa_distribuir_fila(); end if;
  select * into a from public.wa_atendentes where pessoa = eu;
  return to_jsonb(a);
end $$;

revoke execute on function seg.wa_fixo(), seg.wa_atribuir(bigint) from public, anon, authenticated;
revoke execute on function public.wa_expediente(text, boolean) from public, anon;
grant execute on function public.wa_expediente(text, boolean) to authenticated;

-- liga o modo direto para o Pedro, tira todo mundo do expediente (sem contar falta) e manda a fila para ele
update public.config set valor = valor || '{"responsavel_fixo": "pedro"}'::jsonb where chave = 'whatsapp';
insert into public.wa_expediente_log (pessoa, evento, detalhe, por)
  select pessoa, 'fim', 'expediente desligado pelo administrador (atendimento direto para o Pedro)', 'vinicius'
    from public.wa_atendentes where estado <> 'fora';
update public.wa_atendentes set estado = 'fora', desde = now() where estado <> 'fora';
select seg.wa_distribuir_fila();
