# Expedição: botão "Finalizado" no balcão (04/11/2026)

## O que mudou
- `js/expedicao2.js`: nos pedidos de balcão (retirada) ainda abertos aparece **✅ Finalizado**, para quando o Fefão já cobrou
  e entregou. Uma confirmação só, e a tela grava em sequência as etapas que faltam pela Edge Function `expedicao`, já existente:
  `separado` → `pago` (com `pago_como = 'retirada'`) → `despachado`. No Tiny o pedido vai para "Entregue".
- O botão não aparece quando:
  - o pagamento ainda precisa de aprovação (depósito, boleto, Tray);
  - o pedido é de faturamento e está sem NF liberada;
  - o pedido já está separado e pago, porque aí o "📦 Entregue ao cliente" já resolve;
  - o pedido é de envio ou de marketplace.
- As regras continuam no servidor, sem nenhuma mudança na Edge Function nem no banco.
- Trava contra clique duplo. Se uma etapa falhar, o que já foi gravado fica e a tela avisa.
- `js/main.js`: ação `expFinalizar`.
- `index.html`: versões `expedicao2.js?v=20261104a` e `main.js?v=20261104a`.

## Validação
- `tests/expedicao-finalizar.cjs` cobre:
  - quando o botão aparece e quando não aparece;
  - a ordem das etapas;
  - pular as etapas já feitas;
  - o `pago_como`;
  - o clique duplo.
- `node tests/rodar-todos.cjs`: 17/17.
- Revisão do Codex, com dois achados, os dois corrigidos:
  - cliques repetidos rodavam o fluxo em paralelo;
  - um erro no `exp_pago_como` era ignorado e agora vira aviso.

## Fora
- A tela antiga (`expedicao.js`, "Tela antiga") não ganhou o botão.
