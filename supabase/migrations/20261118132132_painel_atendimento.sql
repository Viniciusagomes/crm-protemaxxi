-- Meu dia (18/11): números de atendimento do WhatsApp de uma pessoa, para o resumo do dia.
-- Tempo de resposta = do primeiro "oi" do cliente (depois de uma resposta da loja) até a próxima resposta da loja,
-- contando só as respostas dadas por esta pessoa. Só para a própria pessoa, o supervisor dela ou o dono.
create or replace function public.painel_atendimento(p_pessoa text, p_dias int default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare desde timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  ini timestamptz := desde - make_interval(days => greatest(0, least(coalesce(p_dias, 7), 60)) - 1);
  r jsonb;
begin
  if p_pessoa is null or p_pessoa not in (select seg.pessoas_visiveis()) then raise exception 'sem permissão'; end if;
  with m as (
    select conversa_id, direcao, por, em, lag(direcao) over (partition by conversa_id order by em, id) ant
    from wa_mensagens where em >= ini - interval '2 days' and direcao in ('entrada', 'saida')),
  espera as (select conversa_id, em from m where direcao = 'entrada' and ant is distinct from 'entrada' and em >= ini),
  resp as (select e.em, s.em resp_em, s.por from espera e
    cross join lateral (select x.em, x.por from wa_mensagens x where x.conversa_id = e.conversa_id and x.direcao = 'saida' and x.em > e.em order by x.em limit 1) s)
  select jsonb_build_object(
    'conversas_hoje', (select count(distinct conversa_id) from wa_mensagens where direcao = 'saida' and por = p_pessoa and em >= desde),
    'enviadas_hoje', (select count(*) from wa_mensagens where direcao = 'saida' and por = p_pessoa and em >= desde),
    'respondidas', (select count(*) from resp where por = p_pessoa),
    'tempo_medio_min', (select round(avg(extract(epoch from resp_em - em)) / 60) from resp where por = p_pessoa),
    'tempo_hoje_min', (select round(avg(extract(epoch from resp_em - em)) / 60) from resp where por = p_pessoa and em >= desde),
    'esperando', (select count(*) from wa_conversas c where c.status = 'aberta' and c.responsavel = p_pessoa
                   and c.ultima_entrada_em is not null and c.ultima_entrada_em >= coalesce(c.ultima_msg_em, c.ultima_entrada_em)),
    'dias', greatest(1, least(coalesce(p_dias, 7), 60))) into r;
  return r;
end $$;
revoke all on function public.painel_atendimento(text, int) from public, anon;
grant execute on function public.painel_atendimento(text, int) to authenticated;
