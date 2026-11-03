# Tráfego congelava a página — 30/10/2026 (Claude)

`vTrafego` chamava `carregarTrafego().then(render)` a cada render. Com uma carga em andamento, `carregarTrafego` devolvia `TR.d` (nulo) na hora, e o `then(render)`
rodava de novo, sem parar, em microtarefas: a página travava em "Carregando o Google Ads…". Bastava um segundo render durante a carga.
O defeito é antigo; a carga de campanhas no Meu dia (lote 4A) pode ter deixado esse segundo render mais comum.

Correção: só dispara a carga se não houver outra em andamento (`trafego.js`); mesma proteção em `blocoCampanhasDia`. Teste: `tests/trafego-carregando.cjs`.
Correção pequena, sem revisão do Codex.
