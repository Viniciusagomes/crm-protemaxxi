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

Publicado em 03/11/2026 como `20261103142634_compras_excluir_fornecedor`.

## Ajuste: botão na lista e oportunidade cancelada

- Botão 🗑 na própria lista de fornecedores (além da ficha).
- Proposta enviada em oportunidade **cancelada** não impede mais excluir (migration `compras_excluir_fornecedor_cancelada.sql`);
  a tela usa a mesma regra (`propsTravam`).
- Validado: `tests/portal-cadastro.cjs` (lista e cancelada) e migration em transação revertida (cancelada exclui; aberta recusa).
- Codex: único ponto foi o limite de 300 oportunidades carregadas na tela; além disso o botão some (lado seguro). Deixado como está.
