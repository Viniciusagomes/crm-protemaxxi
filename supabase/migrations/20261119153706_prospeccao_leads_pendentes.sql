-- Prospecção (19/11, pedido do Vinícius): "o lead tem que ficar lá até o vendedor tratar".
-- A campanha só mostra as linhas do dia (data = hoje). Os leads do site lançados em 16/11 apareceram só naquele dia
-- e sumiram em 17/11 sem ninguém tratar. Agora, todo dia antes de montar a campanha, o lead do site ainda sem resultado
-- passa para o dia de hoje (mesmo vendedor), e dados.desde guarda o primeiro dia em que ele entrou.
-- Fica de fora: a linha que já tem uma mais nova do mesmo cliente (foi reenviada), vendedor desligado e lead que já está
-- na fila de alguém como atividade pendente (lead_ads), para não ter dois vendedores no mesmo cliente.
create or replace function public.prospeccao_levar_leads(p_data date default ((now() at time zone 'America/Sao_Paulo'))::date)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and not public.eh_dono() then raise exception 'Sem acesso.'; end if;
  update public.prospeccao x set data = p_data, dados = x.dados || jsonb_build_object('desde', coalesce(x.dados->>'desde', x.data::text))
  where x.lista = 'site' and x.resultado is null and x.data < p_data
    and exists (select 1 from public.pessoas p where p.id = x.pessoa_id and p.ativo)
    and not exists (select 1 from public.prospeccao y where y.cliente_chave = x.cliente_chave and y.data > x.data)
    and not exists (select 1 from public.atividades a where a.automatica like 'lead_ads:%' and not a.feito and a.arquivada_em is null
                    and right(a.automatica, 8) = right(coalesce(x.dados->>'fone', x.cliente_chave), 8));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.prospeccao_levar_leads(date) from public, anon;
grant execute on function public.prospeccao_levar_leads(date) to authenticated;

-- a rodada diária (seg a sáb, 07:00) leva os leads pendentes antes de montar a campanha: eles contam na cota do dia
select cron.alter_job((select jobid from cron.job where jobname = 'prospeccao-diaria'),
  command := 'select public.prospeccao_levar_leads(); select public.prospeccao_gerar();');
