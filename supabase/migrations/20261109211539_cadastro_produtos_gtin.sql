-- Cadastro de produtos (09/11/2026): a rotina da manhã (Brain) pesquisa GTIN, peso, medidas e textos do Mercado Livre
-- para 30 produtos ativos sem GTIN e grava SUGESTÕES aqui. Nada vai para o Tiny sem o dono aprovar na Intranet
-- (função produto-sugestoes). Pedido do Vinícius: lista para aprovar em lote.

-- GTIN-8/12/13/14 com dígito verificador (módulo 10, pesos 3 e 1 a partir da direita).
create or replace function seg.gtin_valido(t text) returns boolean
language sql immutable set search_path = '' as $$
  select t ~ '^(\d{8}|\d{12,14})$' and (
    (10 - (select sum((substr(t, length(t) - i, 1))::int * case when i % 2 = 1 then 3 else 1 end)
             from generate_series(1, length(t) - 1) i) % 10) % 10
  ) = right(t, 1)::int
$$;

create table public.produto_sugestoes (
  id bigint generated always as identity primary key,
  produto_id text not null,                 -- id do produto no Tiny (= produtos.id)
  codigo text,
  nome text,
  lote date not null default current_date,  -- dia da rotina
  gtin text check (gtin is null or seg.gtin_valido(gtin)),
  gtin_fonte text,                          -- link da página onde o GTIN foi achado
  gtin_certeza text check (gtin_certeza in ('alta', 'media', 'baixa')),
  peso_bruto numeric check (peso_bruto is null or (peso_bruto > 0 and peso_bruto < 200)),     -- kg
  peso_liquido numeric check (peso_liquido is null or (peso_liquido > 0 and peso_liquido < 200)),
  altura numeric check (altura is null or (altura > 0 and altura < 300)),                     -- cm (embalagem)
  largura numeric check (largura is null or (largura > 0 and largura < 300)),
  comprimento numeric check (comprimento is null or (comprimento > 0 and comprimento < 300)),
  medidas_fonte text,
  ml_titulo text check (ml_titulo is null or char_length(ml_titulo) <= 60),
  ml_descricao text,
  obs text,                                 -- observação da pesquisa (ex.: "kit: GTIN da unidade não serve")
  status text not null default 'pendente' check (status in ('pendente', 'aplicada', 'recusada', 'erro', 'sem_dados')),
  decidido_por text references public.pessoas(id),
  decidido_em timestamptz,
  aplicado_em timestamptz,
  resultado jsonb,                          -- o que mudou no Tiny (ou o erro)
  criado_em timestamptz not null default now()
);
-- um produto não volta para a fila enquanto tiver sugestão aberta ou aplicada
create unique index produto_sugestoes_um_aberto on public.produto_sugestoes (produto_id) where status in ('pendente', 'aplicada', 'erro');
create index produto_sugestoes_lote on public.produto_sugestoes (lote desc, status);

alter table public.produto_sugestoes enable row level security;
create policy ps_sel on public.produto_sugestoes for select to authenticated using ((select public.eh_dono()));
create policy ps_upd on public.produto_sugestoes for update to authenticated using ((select public.eh_dono())) with check ((select public.eh_dono()));
-- inserir: só a rotina (service role / SQL do servidor); aplicar no Tiny: só a função produto-sugestoes.
grant select, update on public.produto_sugestoes to authenticated;

-- Próximos produtos para a rotina: ativos, sem GTIN, sem sugestão aberta, recusada nem "sem dados" nos últimos 90 dias.
-- Kits ficam de fora (o GTIN do fabricante é da unidade). Ordem: mais vendidos em 180 dias, depois com estoque.
create or replace function seg.produtos_para_sugerir(n int default 30)
returns table (produto_id text, codigo text, nome text, peso_bruto numeric, vendidos_180d numeric, saldo numeric)
language sql stable set search_path = '' as $$
  select p.id, p.codigo, p.nome, p.peso_bruto,
         coalesce((select sum(i.quantidade) from public.pedido_itens i join public.pedidos pe on pe.id = i.pedido_id
                    where i.produto_id = p.id and pe.data >= current_date - 180), 0) as vend,
         p.saldo
    from public.produtos p
   where p.situacao = 'A' and coalesce(p.gtin, '') = '' and coalesce(p.tipo, '') <> 'K'
     and p.nome !~* '^\s*kit\b'
     and not exists (select 1 from public.produto_sugestoes s where s.produto_id = p.id
                      and (s.status in ('pendente', 'aplicada', 'erro') or s.criado_em > now() - interval '90 days'))
   order by vend desc, coalesce(p.saldo, 0) > 0 desc, p.nome
   limit greatest(1, least(n, 60))
$$;
revoke all on function seg.produtos_para_sugerir(int) from public, anon, authenticated;
-- gtin_valido é usada no CHECK da tabela: quem edita (dono, na tela) precisa poder executá-la. É uma conta pura, sem dados.
revoke all on function seg.gtin_valido(text) from public, anon;
grant execute on function seg.gtin_valido(text) to authenticated;
