# Compras: excluir o cadastro de um fornecedor

## O que mudou

- Botão **🗑 Excluir cadastro** na ficha do fornecedor (Compras › Fornecedores). Só aparece se ele não enviou proposta;
  com proposta enviada, a ficha indica usar a situação "Bloqueado".
- Função `compras_excluir_fornecedor(p_id)` (`SECURITY DEFINER`, só `pode_compras()`): recusa se houver proposta enviada,
  apaga os convites de cadastro dele, o fornecedor (convites em oportunidades e rascunhos saem em cascata) e o login do portal,
  nunca o de alguém da equipe (`pessoas.user_id`).
- Gatilho `seg.forn_login_fixo`: a tela não pode mais gravar ou trocar `fornecedores.user_id`; só as funções do banco
  (cadastro por convite) mexem nesse vínculo.

## Como foi validado

- `node tests/rodar-todos.cjs` (o `tests/portal-cadastro.cjs` testa o botão com e sem proposta e as guardas da função).
- Migration executada em transação revertida: sem permissão recusado; fornecedor com proposta recusado; fornecedor de teste,
  convite e login apagados; login da equipe preservado; troca de `user_id` pela tela recusada; edição normal continua.
- Codex em duas rodadas: a 1ª apontou troca de `user_id` pela tela e corrida com proposta sendo enviada; a 2ª confirmou as correções.

## Ao publicar

Aplicar `compras_excluir_fornecedor.sql`, renomear com a versão e fazer o merge.
