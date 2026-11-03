# Tráfego · Propostas recarregam sozinhas — 30/10/2026 (Claude)

## Problema
A aba Tráfego carrega todas as tabelas `gads_*` uma vez, ao abrir. Propostas novas na fila (`gads_acoes`), criadas pelo
Brain direto no banco, só apareciam depois de F5 ou de "Sincronizar agora". Aconteceu em 30/10: a proposta nº 31 estava no
banco e não aparecia na tela.

## O que mudou
- `js/trafego.js`: nova `trRecarregarAcoes()` relê só `gads_acoes` (200 mais recentes) e redesenha.
- `vTrafego()` chama essa função quando a aba ativa é **Propostas** e a lista tem mais de 20 s. O horário da leitura
  (`TR.acoesEm`) é marcado antes de a leitura começar e de novo quando termina, então o `render()` seguinte não repete.
  Uma leitura em andamento nunca é duplicada (`TR.recarregandoAcoes`).
- Se a leitura falhar, a lista que já está na tela continua (só um `console.warn`).
- Cache do `trafego.js` em `index.html`: `?v=20261030a`.

## O que ficou de fora
- A bolinha de pendências no menu continua usando a lista carregada; ela só muda ao entrar em Propostas ou no F5.
  Dá para recarregar em segundo plano por `setInterval` se o Vinícius quiser.

## Validação
- `tests/trafego-propostas.cjs` (novo): sem leitura com lista recente; uma única leitura depois de 20 s mesmo com dois
  `render`; lista e contador de pendentes atualizados; outras abas não leem; falha mantém a lista. O teste **falha** sem a
  correção (conferido).
- `node tests/rodar-todos.cjs`: 12/12, incluindo `globais.cjs` (nenhum nome global novo repetido).

## Revisão do Codex
Ajuste pequeno (uma função e uma linha), sem Edge Function, migration ou regra de negócio: sem revisão cruzada, conforme
o `AGENTS.md`.

## Para o Codex
Nada pendente. `trRecarregarAcoes` é o ponto para, se quiser, atualizar a lista também ao voltar para a aba do navegador.
