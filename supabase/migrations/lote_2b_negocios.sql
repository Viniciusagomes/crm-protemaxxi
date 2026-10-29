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

/** Orçamento novo do Tiny para um cliente que já tem negócio aberto vindo da prospecção (últimos 30 dias, ainda sem
 *  orçamento): o negócio do Tiny é criado normalmente (o sync recebe o id dele) e absorve o da prospecção —
 *  vínculo com a campanha, origem, título, previsão, observações e atividades passam para ele; o negócio vazio sai.
 *  Só vale para negócios da prospecção. */
create or replace function public.negocio_juntar_orcamento() returns trigger
language plpgsql set search_path = '' as $$
declare g public.negocios;
begin
  if new.orcamento_id is null or new.cliente_chave is null or new.prospeccao_id is not null then return new; end if;
  select * into g from public.negocios n
   where n.cliente_chave = new.cliente_chave and n.prospeccao_id is not null and n.orcamento_id is null and n.id <> new.id
     and n.etapa not in ('ganho', 'perdido') and n.criado_em >= now() - interval '30 days'
     and (new.pessoa_id is null or n.pessoa_id = new.pessoa_id)
   order by n.criado_em desc limit 1 for update;
  if not found then return new; end if;
  update public.negocios set prospeccao_id = null where id = g.id;   -- libera o índice único
  update public.negocios set prospeccao_id = g.prospeccao_id, origem = 'prospeccao', titulo = g.titulo,
    pessoa_id = coalesce(new.pessoa_id, g.pessoa_id), previsao = coalesce(new.previsao, g.previsao),
    etapa = case when g.etapa = 'negociacao' and new.etapa = 'orcamento' then 'negociacao' else new.etapa end,
    obs = nullif(concat_ws(E'\n', g.obs, new.obs), ''), criado_por = coalesce(new.criado_por, g.criado_por), mov_em = now()
   where id = new.id;
  update public.atividades set negocio_id = new.id where negocio_id = g.id;
  delete from public.negocios where id = g.id;
  return new;
end $$;
drop trigger if exists negocio_juntar_orcamento on public.negocios;
create trigger negocio_juntar_orcamento after insert on public.negocios
  for each row execute function public.negocio_juntar_orcamento();

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
