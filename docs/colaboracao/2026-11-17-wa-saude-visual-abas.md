# WhatsApp (páginas, reenvio, saúde) + visual de 4 abas (17/11/2026, madrugada)

Feito na retomada automática combinada com o Vinícius. Só WhatsApp teve função nova; nas outras abas, só visual.

## WhatsApp (js/atendimento.js)

- **Mensagens em páginas de 50**: abre a conversa com as 50 últimas; "Carregar mensagens anteriores" no topo ou rolando
  até o começo busca mais 50 (sem duplicar, mantendo a posição da tela). Antes eram até 1000 de uma vez.
- **Falhou → motivo em português** (131047 janela de 24 h, 131026 sem WhatsApp, 190 token, 131056/131048 limite…;
  o texto original da Meta fica no `title`) + botão **"Tentar de novo"**, que reenvia pela `whatsapp-enviar` só ao
  clicar (respeita a janela de 24 h; arquivo só se foi a própria pessoa que subiu).
- **Painel "Saúde"** (só dono): última mensagem recebida (alerta com +12 h), último envio OK, falhas e mídias sem
  arquivo nas últimas 24 h, com lista clicável que abre a conversa.
- **Otimização**: o menu lateral só é redesenhado quando muda (antes a cada evento do tempo real).

## Visual (Início, Meu dia, Funil, Pedidos)

- Esqueleto de carregamento (`esqueleto()` em util.js) no Funil e no Meu dia.
- Estados vazios sem emoji, cartão vazio tracejado e mais leve.
- Pedidos: situação em pílula com ponto colorido (`pedSitCls`: cancelado vermelho, entregue/faturado verde,
  aberto/aprovado âmbar) — só visual.
- KPIs com rótulo em caixa alta pequena e leve elevação ao passar o mouse; números tabulares.

## Validação

- `node tests/rodar-todos.cjs`: 29/29 (novos `tests/whatsapp-saude.cjs` e `tests/visual-abas.cjs`).
- Sem revisão do Codex (não instalado). Não testado com login real: conferir com Ctrl+F5 depois do merge.
