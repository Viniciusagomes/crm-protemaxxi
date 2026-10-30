-- Claude · 26/10/2026 · Intelcamp (assistência Intelbras) automática pela caixa os.intelbras@.
-- A função email-entrada lê os e-mails do sistema SHOficina da Intelcamp (OS deles, modelo, nº de série, status, itens do orçamento)
-- e liga à nossa OS (pelo nº da OS deles já conhecido, pelo nº de série normalizado ou com 1 caractere diferente).
--  • at_rma.os_assistencia: número da OS na assistência (liga os próximos e-mails sem adivinhar)
--  • at_rma.situacao_assistencia / situacao_em: último status informado pela assistência
--  • at_orcamentos.email_id / origem: o orçamento que veio por e-mail entra SEMPRE como rascunho (pedido do Vinícius:
--    ele confere antes de ir ao cliente). O valor ao cliente já sai com a margem (config assistencia.margem_orcamento).

alter table public.at_rma add column if not exists os_assistencia text;
alter table public.at_rma add column if not exists situacao_assistencia text;
alter table public.at_rma add column if not exists situacao_em timestamptz;
create index if not exists at_rma_os_assistencia on public.at_rma (os_assistencia) where os_assistencia is not null;

alter table public.at_orcamentos add column if not exists email_id bigint references public.emails (id) on delete set null;
alter table public.at_orcamentos add column if not exists origem text not null default 'manual';   -- manual | email
create unique index if not exists at_orcamentos_email_unico on public.at_orcamentos (os_id, email_id) where email_id is not null;
