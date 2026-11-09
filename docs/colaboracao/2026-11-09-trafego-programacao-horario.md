# Tráfego · programação de horário pela fila — 09/11/2026 (Claude)

Pedido do Vinícius: cortar os anúncios da madrugada (0h–5h custaram R$ 681 em 30 dias, ~R$ 11 por conversão contra ~R$ 3 à tarde).
A fila `gads_acoes` não tinha como mexer em programação; entrou um tipo novo, aprovado só pelo dono, como os outros.

## O que mudou
- `gads-aplicar`: tipo `programacao_horario {campanha_ids, inicio_hora, fim_hora=24}`. Cria 7 critérios `adSchedule`
  (segunda a domingo, minutos ZERO) por campanha. Recusa campanha que já tem programação (não mistura com a existente) e
  janela menor que 4 h. Desfazer = `remover_programacao` (remove só os critérios que a ação criou).
- Migration `20261109170000_trafego_programacao_horario`: `gads_acoes_tipo_check` aceita o tipo novo.
- `js/trafego.js`: descrição da proposta ("Anúncios só das 05h às 24h…"); cache `trafego.js?v=20261109a`.
- Teste: `tests/programacao-horario.cjs` (descrição, escape do nome, travas no servidor, migration).

## Como foi validado
- `node tests/rodar-todos.cjs`: 20/20.
- **Sem revisão do Codex:** o Codex de linha de comando ainda não foi instalado no PC novo. Revisão própria do formato
  da API (DayOfWeek, MinuteOfHour ZERO, endHour 24).

## Pendente
- Aplicar a migration e publicar a função `gads-aplicar` (o filtro do Claude Code barrou o deploy; precisa do ok do Vinícius).
- Depois: criar a proposta (5 campanhas de Pesquisa + Haiz, 5h→24h), testar no Google e o Vinícius aprova.

## Para o Codex
- O Demand Gen fica de fora da proposta (está para ser pausado pela nº 33).
