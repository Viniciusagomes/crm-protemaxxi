# Cadastro de produtos · rotina dos GTINs — 09/11/2026 (Claude)

Pedido do Vinícius: toda manhã, 30 produtos ativos sem GTIN; buscar GTIN, peso e medidas aproximados na internet e já
preparar título e descrição para o Mercado Livre. Decisão dele: **lista para aprovar em lote** (nada vai ao Tiny sozinho).
Hoje são 1.168 produtos ativos sem GTIN (~39 dias de rotina).

## O que mudou
- Migration `cadastro_produtos_gtin`:
  - `seg.gtin_valido(text)`: GTIN-8/12/13/14 com dígito verificador (usada no CHECK; `execute` para `authenticated`).
  - Tabela `produto_sugestoes` (gtin + fonte + certeza, peso bruto/líquido, A×L×C da embalagem, título/descrição ML,
    status pendente/aplicada/recusada/erro/sem_dados, resultado). RLS: só o dono lê e altera; inserir só pelo servidor.
    Índice único: um produto não tem duas sugestões abertas.
  - `seg.produtos_para_sugerir(n)`: fila da rotina (ativos sem GTIN, sem kits, sem sugestão aberta nem decidida há
    menos de 90 dias; mais vendidos em 180 dias primeiro). Sem `execute` para `anon/authenticated`.
- Edge Function `produto-sugestoes` (`verify_jwt` desligado, autentica pelo JWT do dono): `aplicar {ids}` até 8 por chamada,
  1,5 s entre produtos, trava `sync_travar('produto_sugestoes')`. Só **preenche vazios** no Tiny (GTIN vazio, peso/medida 0,
  descrição complementar vazia); PUT v3 com `sku`/`descricao` iguais e o bloco `dimensoes` inteiro relido. Relê e confere:
  campo fora de `gtin|descricaoComplementar|dimensoes.(peso*/altura/largura/comprimento)` mudou → status `erro` com a diferença.
- Tela `js/cadastroprod.js` (menu Operação › 🧩 Cadastro de produtos, só dono; `SO_DONO`): filtros, edição na linha,
  aprovar um, selecionados ou "os de certeza alta"; recusar com motivo. Cache: `cadastroprod.js?v=20261109a`, `main.js?v=20261109a`.
- Teste `tests/cadastro-produtos.cjs`: dígito do GTIN (casos reais: 7896637683913 ok, 789618808981 inválido), PUT só com
  vazios, escape de nome e de link (só http/https), filtro padrão.

## Como foi validado
- `node tests/rodar-todos.cjs`: 20/20.
- Formato do produto na v3 conferido lendo um produto real (`dimensoes.{pesoBruto,pesoLiquido,altura,largura,comprimento}`).
- **Sem revisão do Codex** (só o app de desktop está instalado; o Vinícius pediu para não mexer nisso agora).

## Pendente
- Aplicar a migration e publicar a função (precisa do ok do Vinícius: o filtro do Claude Code barra deploy em produção).
- Primeira aprovação real: conferir no Tiny o 1º produto gravado (a conferência automática já compara antes/depois).
- A rotina da manhã (agendamento do Brain) grava as sugestões direto na tabela.

## Para o Codex
- A rotina insere com o papel do servidor; a tela nunca insere. Se mexer na tabela, mantenha o CHECK do GTIN.
