# Leads do site ficam na campanha até o vendedor tratar (19/11)

Pedido do Vinícius: "o lead tem que ficar lá até o vendedor tratar".

## O problema
A campanha de prospecção só mostra as linhas do dia (`prospeccao.data = hoje`). Os 29 leads do site lançados em 16/11
(o último lote às 20h34) apareceram só naquele dia e sumiram da tela em 17/11. Ninguém tratou nenhum.

## O que foi feito em 19/11 (dados)
- Os 29 de 16/11 foram conferidos: WhatsApp, interações, atividades, negócios, clientes e outras prospecções.
  - Nenhum foi trabalhado.
  - 3 já estavam na fila do Pedro como atividade `lead_ads` pendente desde 04/11 e ficaram só lá.
  - **26 reenviados** na campanha de 19/11, com o mesmo vendedor, `motivo` começando com "Reenviado em 19/11" e `dados.reenviado_de`.
- 11 leads novos (16/11 23:41 a 19/11 11:57), colados pelo Vinícius:
  - 4 já conversavam com o Pedro no WhatsApp e ficaram de fora;
  - **7 lançados em 19/11** (4 para o Felipe Menezes e 3 para o Felipe Moreira, porque o Pedro já ficou com os 4 do WhatsApp).
- Campanha de 19/11 (lista `site`): Felipe Menezes 12, Felipe Moreira 12, Pedro 9.

## Regra nova (migration `20261119153706_prospeccao_leads_pendentes`, aplicada)
- `prospeccao_levar_leads(p_data)`: o lead do site sem resultado passa para o dia (mesmo vendedor) e `dados.desde` guarda o primeiro dia.
- Fica de fora:
  - a linha que já tem uma mais nova do mesmo cliente;
  - o lead de vendedor desligado;
  - o lead que está na fila de alguém como atividade `lead_ads` pendente.
- A rodada `prospeccao-diaria` (seg a sáb, 07:00) agora roda `prospeccao_levar_leads()` antes de `prospeccao_gerar()`, então os leads contam na cota do dia.
- Simulado para 20/11 numa transação desfeita: os 33 de hoje passam, e as linhas antigas de 16/11 ficam onde estão.
- Tela (`js/carteira.js`): etiqueta "esperando desde dd/mm · N dias" (âmbar com 1 dia, vermelha a partir de 2).

## Validação
- `tests/leads-pendentes.cjs`; o `tests/leads-site.cjs` deixou de exigir a versão exata do arquivo. 41/41.
