# Checklist no Meu dia e edição mais fácil (04/11/2026)

## O que mudou
- **Meu dia** (`js/crm.js`): ganhou o card **☑ Checklist de hoje**, montado por `cardChecklistHoje` em `js/equipe.js`, nas duas versões da tela (vendedor e operação).
  - As tarefas diárias aparecem separadas por bloco, e as semanais e mensais aparecem só enquanto estão pendentes.
  - Dá para marcar ali mesmo, pelo mesmo `chk` do checklist.
- **Aba Checklist**: quem tem tarefas passa a ver o próprio checklist mesmo sem equipe, como a Diana. Antes a aba só existia para quem
  supervisionava alguém (`abasDoPerfil` em `js/main.js`).
- **Edição**:
  - O editor de tarefas saiu de dentro do `vConfig` para a função `editorTarefas(pi)`, usada nas Configurações e no novo botão
    **✎ Editar tarefas**, que aparece só para o dono, direto na tela do checklist da pessoa.
  - Nova opção **📋 Adicionar várias de uma vez**: uma tarefa por linha, com a escolha de diária por bloco, semanal ou mensal
    (`tarefasDoLote`, ação `addTarefasLote`).
- **Conferência**:
  - A própria pessoa não marca mais o "conferido" do próprio dia.
  - Quem conferiu fica guardado em `conferidoPor`. Antes, qualquer gravação posterior do dia, como a pessoa marcando uma tarefa, trocava o
    `conferido_por` para quem estava logado. Esse bug era antigo e ficou mais visível com o card do Meu dia.
- Versões: `equipe.js`, `crm.js`, `dados.js` e `main.js`.

## Validação
- `tests/checklist-meu-dia.cjs` cobre:
  - o card do Meu dia;
  - o lote, incluindo o número que faz parte do texto;
  - o editor;
  - o botão Editar só para o dono;
  - o "conferido" travado para a própria pessoa;
  - a aba liberada.
- `node tests/rodar-todos.cjs`: 18/18.
- Revisão do Codex, com dois achados, os dois corrigidos: o dono ainda conseguia se conferir, e o `conferido_por` era sobrescrito.

## Fora
- O Vinicius Gonçalves (`vinicius_g`) ainda não tem login e está com início em 31/12/2099. O checklist dele só aparece depois que
  o Vinícius criar o login e acertar a data de início.
- A gravação de tarefas continua apagando e inserindo de novo as tarefas da pessoa (`GRAVAR.pessoa`). As marcações ficam, porque o id da tarefa se mantém.
