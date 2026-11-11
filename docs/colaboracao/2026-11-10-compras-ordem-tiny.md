# 10/11/2026 — Compras: ordem de compra no Tiny + pedido no portal do fornecedor (Claude)

## O que mudou
- **Edge Function `compras-oc`** (nova, só o dono): `{acao:"gerar", op}` monta e cria a ordem no Tiny (`POST /ordem-compra` da v3)
  a partir da proposta vencedora, relê a ordem e grava número, previsão e total em `oportunidades.oc_*`.
  - Fornecedor: usa `fornecedores.tiny_contato_id` ou busca `/contatos?cpfCnpj=` (com e sem pontuação) e guarda o id.
  - Itens: cada item cotado precisa de `produto_codigo` (SKU) existente em `produtos`; senão nada é criado e a tela diz qual item falta.
    Item que o vencedor não cotou fica fora da ordem.
  - Previsão = hoje (horário de SP) + prazo da proposta; frete > 0 → `fretePorConta: D`, frete grátis → `R`;
    condição = pagamento da proposta (ou da oportunidade); observações com o nº da cotação, validade e obs. do fornecedor.
  - Trava contra ordem duplicada: `oc_status='enviando'` é gravado por update condicional ANTES do POST; POST não é repetido em 429;
    tentativa sem resposta só pode ser refeita depois de 10 min (a tela pede para conferir no Tiny).
- **Migration `compras_ordem_tiny`**: colunas `oc_*` em `oportunidades`; gatilho `seg.oc_trava` (anon/authenticated não mexem nos `oc_*`;
  `oc_confirmada_em` só pela `forn_pedido_confirmar`); `op_vencedor` não troca/desfaz o vencedor com ordem gerada;
  `forn_portal`/`forn_oportunidade` devolvem `pedido` só ao fornecedor vencedor; RPC nova `forn_pedido_confirmar`.
- **Tela (`js/compras.js`)**: botão "Gerar ordem de compra no Tiny" ligado (só dono); campo para ligar item sem código ao SKU;
  depois de gerada mostra nº, previsão e se o fornecedor confirmou; "Desfazer escolha" some.
- **Portal (`js/fornecedor.js`)**: o vencedor vê "📦 Pedido de compra nº X", total e previsão, e o botão "Confirmar recebimento do pedido".

## Validação
- `tests/compras-oc.cjs` (montagem da ordem, erros de item, travas no código e no SQL); `node tests/rodar-todos.cjs` ok.
- Esquema do POST conferido no swagger oficial da v3 (`CriarOrdemCompraModelRequest`, só `contato` obrigatório) e
  formato real lido com `GET /ordem-compra` (só leitura).
- **Ainda não testado ponta a ponta no Tiny**: a 1ª ordem real será feita junto com o Vinícius (não há cotação concluída hoje).

## Ficou de fora
- Revisão do Codex: o Codex do PC novo é o app da loja, sem o comando `codex` no terminal. **Entrega sem revisão cruzada.**
- Situação da ordem no Tiny (atendida/cancelada) não é relida; a Entrada de NF segue como hoje.
- ~~O nome do arquivo da migration troca de `VERSAO_` para a versão remota quando for aplicada.~~ Feito.

## Publicação (11/11/2026)
- Migration aplicada no banco como `20261111190853_compras_ordem_tiny` (arquivo renomeado). Antes de aplicar, conferi que
  `op_vencedor`, `forn_portal` e `forn_oportunidade` no banco eram idênticas à base desta mudança (nada de outra entrega sobrescrito).
- Conferido depois: 9 colunas `oc_*`, gatilho `oc_trava`, `forn_pedido_json` sem execute para anon, `forn_pedido_confirmar` com execute para anon.
- Edge Function `compras-oc` publicada (v1) igual à cópia deste PR.
- Merge feito a pedido do Vinícius ("autorizo acesso total"). O check "Workers Builds" da Cloudflare falha em todos os PRs
  (inclusive os já publicados) — é a prévia de branch, não bloqueia o deploy da `main`.

## Para o Codex
- Se mexer em `oportunidades` pelo site, lembre do gatilho `oc_trava`: os campos `oc_*` só mudam pela função `compras-oc`.
