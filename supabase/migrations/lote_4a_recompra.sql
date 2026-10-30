-- Lote 4, entrega A: recompra pelo ciclo real de cada produto, dispensa de sugestão e motivo do orçamento parado.

-- Motivo do orçamento parado (passo 36): cada motivo pede uma ação diferente.
alter table public.negocios add column if not exists travado_motivo text
  check (travado_motivo in ('resposta', 'preco', 'estoque', 'prazo', 'decisao'));

-- "Compra eventual": este produto não volta como sugestão de recompra para este cliente.
create table if not exists public.recompra_dispensas (
  cliente_chave text not null,
  produto text not null,
  dispensado_por text not null default public.eu(),
  dispensado_em timestamptz not null default now(),
  primary key (cliente_chave, produto)
);
alter table public.recompra_dispensas enable row level security;
-- quem enxerga a campanha daquele cliente (a RLS da prospeccao vale dentro do exists)
drop policy if exists recdisp_sel on public.recompra_dispensas;
create policy recdisp_sel on public.recompra_dispensas for select to authenticated
  using (exists (select 1 from public.prospeccao x where x.cliente_chave = recompra_dispensas.cliente_chave));
drop policy if exists recdisp_ins on public.recompra_dispensas;
create policy recdisp_ins on public.recompra_dispensas for insert to authenticated
  with check (dispensado_por = public.eu() and exists (select 1 from public.prospeccao x where x.cliente_chave = recompra_dispensas.cliente_chave));
revoke all on public.recompra_dispensas from anon;
revoke update, delete, truncate on public.recompra_dispensas from authenticated;
grant select, insert on public.recompra_dispensas to authenticated;

/** Produto que o cliente recompra e já passou da hora: 3 datas de compra ou mais (qualquer produto, intervalo de 7 dias ou mais)
 *  ou 2 datas se for material de reposição (intervalo de 14 dias ou mais); entre 1,2 e 3 ciclos sem comprar, no máximo 240 dias.
 *  Serviço e frete não contam. Mais compras primeiro, depois o que acabou de vencer. */
create or replace function seg.recompra_ciclo(p_cliente text, p_data date)
returns table (pk text, produto text, vezes int, ciclo int, ult date)
language sql stable set search_path = '' as $$
  with c as (
    select coalesce(nullif(i.codigo, ''), lower(i.descricao)) pk, max(i.descricao) produto,
           count(distinct p.data)::int vezes, min(p.data) pri, max(p.data) ult
      from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
     where p.cliente_chave = p_cliente and p.numero_ecommerce is null and coalesce(p.situacao, '') !~* 'cancel' and p.data <= p_data
       and i.descricao !~* '(frete|servi[cç]o|m[aã]o de obra|taxa|instala[cç])'
     group by 1 having count(distinct p.data) >= 2
  ), d as (select c.*, ((c.ult - c.pri) / (c.vezes - 1))::int ciclo from c)
  select d.pk, d.produto, d.vezes, d.ciclo, d.ult from d
   where (d.vezes >= 3 and d.ciclo >= 7
          or d.vezes = 2 and d.ciclo >= 14 and d.produto ~* '(cabo|conector|fonte|bateria|balun|abra[cç]adeira|caixa|fio )')
     and (p_data - d.ult) >= ceil(d.ciclo * 1.2) and (p_data - d.ult) <= least(d.ciclo * 3, 240)
     and not exists (select 1 from public.recompra_dispensas r where r.cliente_chave = p_cliente and r.produto = d.pk)
   order by d.vezes desc, (p_data - d.ult) - d.ciclo, d.pk
$$;
revoke execute on function seg.recompra_ciclo(text, date) from public, anon, authenticated;

-- prospeccao_gerar: a lista de recompra usa primeiro o ciclo real; a regra antiga completa a cota.
do $$
declare def text := pg_get_functiondef('public.prospeccao_gerar'::regproc); novo text;
begin
  novo := replace(def, $a$elsif lista_k = 'recompra' then$a$, $b$elsif lista_k = 'recompra' then
        -- ciclo real de compra do produto (lote 4A)
        insert into public.prospeccao (data, pessoa_id, cliente_chave, cliente_nome, lista, motivo, dados)
        select p_data, v.id, k.chave, k.nome, 'recompra',
               'Comprou ' || z.produto || ' em ' || z.vezes || ' datas, a cada ' || z.ciclo || ' dias em média · última há ' || (p_data - z.ult) || ' dias',
               jsonb_build_object('produto_repor', z.produto, 'repor_chave', z.pk, 'ciclo_dias', z.ciclo, 'vezes', z.vezes, 'dias', p_data - z.ult, 'ultima_repor', z.ult)
          from _cart k cross join lateral (select * from seg.recompra_ciclo(k.chave, p_data) limit 1) z
         where not exists (select 1 from public.prospeccao x where x.data = p_data and x.cliente_chave = k.chave)
         order by (k.fone is not null) desc, k.total desc limit cota
        on conflict do nothing;
        get diagnostics n = row_count;
        cota := greatest(cota - n, 0);$b$);
  if novo = def then raise exception 'prospeccao_gerar mudou desde a revisão; ajuste a migration'; end if;
  execute novo;
end $$;
