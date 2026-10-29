-- Lote 3, entrega A: fila de cadastros possivelmente duplicados e a conferência registrada.
-- Nada é fundido: os dois cadastros e os históricos continuam como estão; a decisão fica registrada com quem e quando.

create table if not exists public.cliente_pares (
  a text not null references public.clientes(chave) on delete cascade,
  b text not null references public.clientes(chave) on delete cascade,
  motivos text[] not null default '{}',
  forca int not null default 0,          -- 3 mesmo contato do Tiny · 2 telefone compartilhado · 1 nome igual
  ativos int not null default 0,          -- quantos dos dois têm movimento (pedido em 12 meses, negócio aberto ou campanha)
  status text not null default 'pendente' check (status in ('pendente', 'mesmo', 'diferentes', 'conferir')),
  decidido_por text, decidido_em timestamptz, obs text,
  atualizado_em timestamptz not null default now(),
  primary key (a, b), check (a < b)
);
create index if not exists cliente_pares_b on public.cliente_pares (b);
alter table public.cliente_pares enable row level security;
-- leitura: só quem enxerga OS DOIS clientes (a linha revela o outro cadastro); escrita só pelas funções abaixo
drop policy if exists cliente_pares_sel on public.cliente_pares;
create policy cliente_pares_sel on public.cliente_pares for select to authenticated
  using (seg.eh_membro() and seg.pode_mexer_cliente(a) and seg.pode_mexer_cliente(b));
revoke insert, update, delete, truncate on public.cliente_pares from anon, authenticated;
revoke all on public.cliente_pares from anon;
grant select on public.cliente_pares to authenticated;

/** Recalcula a fila: telefone compartilhado por 2 ou 3 cadastros (4+ costuma ser a loja ou um instalador que compra
 *  para vários), mesmo contato do Tiny e mesmo nome entre um cadastro sem documento que tem movimento e um com documento.
 *  Mantém as decisões já tomadas; tira da fila só os pendentes que deixaram de ser candidatos. */
create or replace function public.cliente_pares_atualizar() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is not null and not public.eh_dono() then raise exception 'Só o dono recalcula a fila.'; end if;
  create temp table if not exists _par (a text, b text, motivo text, forca int) on commit drop;
  truncate _par;
  insert into _par
  select distinct least(x.cliente_chave, y.cliente_chave), greatest(x.cliente_chave, y.cliente_chave), 'telefone ' || x.telefone, 2
    from public.cliente_telefones x join public.cliente_telefones y on y.telefone = x.telefone and y.cliente_chave <> x.cliente_chave
   where x.errado_em is null and y.errado_em is null
     and x.telefone in (select t.telefone from public.cliente_telefones t where t.errado_em is null group by t.telefone
                         having count(distinct t.cliente_chave) between 2 and 3)
     and x.telefone not in (select jsonb_array_elements_text(coalesce((select c.valor->'loja' from public.config c where c.chave = 'whatsapp_fixos'), '[]'::jsonb)));
  insert into _par
  select least(x.chave, y.chave), greatest(x.chave, y.chave), 'mesmo contato no Tiny', 3
    from public.clientes x join public.clientes y on y.tiny_contato_id = x.tiny_contato_id and y.chave > x.chave
   where x.tiny_contato_id is not null;
  insert into _par
  select least(s.chave, d.chave), greatest(s.chave, d.chave), 'mesmo nome (um sem CPF/CNPJ)', 1
    from public.clientes s join public.clientes d on d.chave not like 'n:%' and s.chave = seg.chave_cliente(null, d.nome)
   where s.chave like 'n:%' and length(s.chave) > 8
     and (exists (select 1 from public.pedidos p where p.cliente_chave = s.chave)
       or exists (select 1 from public.negocios g where g.cliente_chave = s.chave)
       or exists (select 1 from public.interacoes i where i.cliente_chave = s.chave)
       or exists (select 1 from public.prospeccao x where x.cliente_chave = s.chave));
  insert into public.cliente_pares (a, b, motivos, forca, ativos, atualizado_em)
  select p.a, p.b, array_agg(distinct p.motivo order by p.motivo), sum(distinct p.forca)::int,
         (select count(*) from unnest(array[p.a, p.b]) k(ch) where
            exists (select 1 from public.pedidos q where q.cliente_chave = k.ch and q.data > (now() at time zone 'America/Sao_Paulo')::date - 365)
            or exists (select 1 from public.negocios g where g.cliente_chave = k.ch and g.etapa not in ('ganho', 'perdido'))
            or exists (select 1 from public.prospeccao x where x.cliente_chave = k.ch and x.data > (now() at time zone 'America/Sao_Paulo')::date - 90))::int,
         now()
    from _par p
   where exists (select 1 from public.clientes c where c.chave = p.a) and exists (select 1 from public.clientes c where c.chave = p.b)
   group by p.a, p.b
  on conflict (a, b) do update set motivos = excluded.motivos, forca = excluded.forca, ativos = excluded.ativos, atualizado_em = now();
  delete from public.cliente_pares c where c.status = 'pendente' and not exists (select 1 from _par p where p.a = c.a and p.b = c.b);
  select count(*) into n from public.cliente_pares where status = 'pendente';
  return n;
end $$;
revoke execute on function public.cliente_pares_atualizar() from public, anon;
grant execute on function public.cliente_pares_atualizar() to authenticated;

/** Registra a conferência do par: mesmo cliente, clientes diferentes, precisa conferir (ou volta para pendente).
 *  Só quem pode mexer nos dois cadastros decide. Não altera os cadastros. */
create or replace function public.cliente_par_decidir(p_a text, p_b text, p_status text, p_obs text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ator text := seg.minha_pessoa(); r public.cliente_pares; x text := least(p_a, p_b); y text := greatest(p_a, p_b);
begin
  if ator is null then raise exception 'Sessão inválida'; end if;
  if p_status not in ('pendente', 'mesmo', 'diferentes', 'conferir') then raise exception 'Escolha uma decisão válida.'; end if;
  if not (seg.pode_mexer_cliente(x) and seg.pode_mexer_cliente(y)) then raise exception 'Você precisa ter acesso aos dois cadastros para decidir.'; end if;
  if p_status = 'conferir' and trim(coalesce(p_obs, '')) = '' then raise exception 'Diga o que precisa ser conferido.'; end if;
  update public.cliente_pares set status = p_status, obs = nullif(left(trim(coalesce(p_obs, '')), 500), ''),
    decidido_por = case when p_status = 'pendente' then null else ator end,
    decidido_em = case when p_status = 'pendente' then null else now() end
   where a = x and b = y returning * into r;
  if not found then raise exception 'Par não encontrado.'; end if;
  return to_jsonb(r);
end $$;
revoke execute on function public.cliente_par_decidir(text, text, text, text) from public, anon;
grant execute on function public.cliente_par_decidir(text, text, text, text) to authenticated;

/** Fila para a tela: os dois cadastros lado a lado (dados, compras, telefones, vendedor), do mais relevante para o menos.
 *  Só mostra o par a quem enxerga os dois clientes; os números de compra contam só os pedidos que a pessoa pode ver. */
create or replace function public.cliente_pares_lista(p_status text default 'pendente')
returns jsonb language sql stable security definer set search_path = '' as $$
  with l as (
    select c.* from public.cliente_pares c
     where seg.eh_membro() and c.status = coalesce(p_status, c.status)
       and seg.pode_mexer_cliente(c.a) and seg.pode_mexer_cliente(c.b)
     order by c.ativos desc, c.forca desc, c.a limit 300
  ), lado as (
    select k.chave, jsonb_build_object('chave', k.chave, 'nome', k.nome, 'doc', k.doc, 'cidade', k.cidade, 'uf', k.uf,
      'pedidos', (select count(*) from public.pedidos p where p.cliente_chave = k.chave and coalesce(p.situacao, '') !~* 'cancel' and seg.pode_ver_pedido(p.vendedor_id, p.numero_ecommerce)),
      'total12m', (select coalesce(sum(p.valor), 0) from public.pedidos p where p.cliente_chave = k.chave and coalesce(p.situacao, '') !~* 'cancel'
                    and seg.pode_ver_pedido(p.vendedor_id, p.numero_ecommerce) and p.data > (now() at time zone 'America/Sao_Paulo')::date - 365),
      'ultima', (select max(p.data) from public.pedidos p where p.cliente_chave = k.chave and coalesce(p.situacao, '') !~* 'cancel' and seg.pode_ver_pedido(p.vendedor_id, p.numero_ecommerce)),
      'vendedor', (select pe.nome from public.pedidos p join public.pessoas pe on pe.tiny_vendedor_id = p.vendedor_id
                    where p.cliente_chave = k.chave and seg.pode_ver_pedido(p.vendedor_id, p.numero_ecommerce) group by pe.nome order by count(*) desc limit 1),
      'telefones', coalesce((select jsonb_agg(t.telefone order by t.telefone) from public.cliente_telefones t where t.cliente_chave = k.chave and t.errado_em is null), '[]'::jsonb),
      'negocios', (select count(*) from public.negocios g where g.cliente_chave = k.chave
                    and (public.eh_dono() or g.pessoa_id = seg.minha_pessoa() or g.pessoa_id in (select seg.pessoas_visiveis())))) d
      from public.clientes k where k.chave in (select a from l union select b from l)
  )
  select coalesce(jsonb_agg(jsonb_build_object('a', la.d, 'b', lb.d, 'motivos', l.motivos, 'forca', l.forca, 'ativos', l.ativos,
           'status', l.status, 'obs', l.obs, 'decidido_por', l.decidido_por, 'decidido_em', l.decidido_em,
           'pode_decidir', true)
           order by l.ativos desc, l.forca desc, l.a), '[]'::jsonb)
    from l join lado la on la.chave = l.a join lado lb on lb.chave = l.b
$$;
revoke execute on function public.cliente_pares_lista(text) from public, anon;
grant execute on function public.cliente_pares_lista(text) to authenticated;

-- recalcula todo dia de manhã (06:20 de Brasília), antes da campanha das 07:00
select cron.unschedule('cliente-pares') where exists (select 1 from cron.job where jobname = 'cliente-pares');
select cron.schedule('cliente-pares', '20 9 * * *', $$select public.cliente_pares_atualizar()$$);
select public.cliente_pares_atualizar();
