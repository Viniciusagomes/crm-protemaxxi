# Lote 3 · entrega B — venda ligada ao negócio — 29/10/2026 (Claude)

Versão enxuta aprovada (passos 3, 4, 5 e 7). Passo 6 — dividir um pedido entre projetos — fica para quando houver um
caso real: hoje só 3 negócios tinham pedido. Um pedido ativo vai para um negócio só; um negócio pode ter vários pedidos.

## O que mudou

- `negocio_pedidos`: vínculo pedido × negócio com quem ligou e quando; desfazer guarda quem, quando e motivo
  (índice único parcial: um vínculo ativo por pedido). RLS só leitura (quem enxerga o negócio e o pedido).
- `negocio_pedido_ligar` (definer): confirmação do vendedor; mesmo cliente ou cadastro conferido como "mesmo cliente"
  (`cliente_pares`), pedido não cancelado, não ligado a outro negócio; idempotente; **não muda a etapa**.
- `negocio_pedido_desfazer` (definer): motivo obrigatório.
- `seg.mover_pedidos_negocio` + `negocio_juntar` (2B) passam a levar os pedidos ligados na junção.
- `v_negocio_vendas` (invoker): pedidos, vendido sem cancelados, cancelados. `v_crm_revisoes` deixa de listar em
  "Conferir compra" o pedido já ligado.
- Tela:
  - negócio → **🧾 Venda deste negócio**: negociado, vendido, saldo, pedidos ligados (cancelado não conta, com aviso),
    desfazer, "Marcar como ganho" quando já há venda, e candidatos do cliente (loja, não cancelados, sem negócio,
    a partir de 7 dias antes do orçamento) com "Ver itens" e "Ligar";
  - Funil → **🧾 Pedidos para ligar**: pedidos da loja dos últimos 60 dias sem negócio, de clientes com negociação aberta;
  - tags "Venda parcial" e "Pedido ligado cancelado" (também em negócio ganho) e item na Central de pendências.

## Validação

- `tests/lote-3b.cjs` (novo) e todos os `tests/*.cjs` + `globais.cjs` passando.
- SQL revertido como vendedor: ligar, repetição sem efeito, pedido de outro cliente recusado, soma correta,
  "Conferir compra" limpo, desfazer com motivo e histórico, insert direto bloqueado; junção levando o pedido ligado.

## Revisão do Codex

- 1ª rodada (3 P2): junção não levava os pedidos; cancelamento após ganho sem alerta; par "mesmo cliente" sem efeito
  na tela. Corrigidos.
- 2ª rodada: "ok para aplicar".

## Para o Codex

- 3C (origem e indicadores) pode somar `v_negocio_vendas` por `negocios.prospeccao_id`; pedido sem vínculo não entra.

## Publicação

- Migration aplicada em produção: `20261029231148_lote_3b_vendas`.
