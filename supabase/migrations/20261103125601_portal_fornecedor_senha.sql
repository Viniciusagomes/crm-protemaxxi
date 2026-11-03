-- "Esqueci a senha" do portal do fornecedor: a Edge Function forn-senha reserva o envio com um único UPDATE
-- (só passa se o último pedido tem mais de 5 min), então pedidos simultâneos não mandam vários e-mails.
alter table public.fornecedores add column senha_pedida_em timestamptz;
