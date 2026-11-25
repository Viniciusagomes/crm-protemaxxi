-- Pedido excluído no Tiny (não cancelado) some da API e ficava somando nas vendas. O tiny-sync agora marca como
-- "Cancelado" e grava aqui quando percebeu a exclusão.
alter table public.pedidos add column if not exists excluido_tiny_em timestamptz;
comment on column public.pedidos.excluido_tiny_em is 'Quando o tiny-sync confirmou que o pedido foi excluído no Tiny (situacao vira Cancelado).';
