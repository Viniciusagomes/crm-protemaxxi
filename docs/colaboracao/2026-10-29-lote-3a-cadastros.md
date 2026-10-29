# Lote 3 · entrega A — cadastros parecidos — 29/10/2026 (Claude)

Lote 3 proposto pelo Codex, aprovado com ajustes: 3A (passos 1 e 2) agora; 3B enxuta (vínculo pedido × negócio com
confirmação, vários pedidos por negócio, saldo, cancelamento e histórico; divisão de um pedido entre projetos só quando
aparecer um caso real); 3C (origem e indicadores) em 3–4 semanas, quando houver dado de campanha → negócio, com a
conciliação dentro da Central de pendências que já existe.

## Números que guiaram a 3A

- 747 pares de telefone em comum em `cliente_telefones`, mas só 62 entre cadastros que existem em `clientes`
  (49 com os dois lados com movimento).
- 3.579 cadastros sem CPF/CNPJ (`n:`) têm o mesmo nome de um com documento, mas só 7 têm pedido: o resto são cascas.

## O que mudou

- Tabela `cliente_pares` (a < b, motivos, força, quantos têm movimento, status, quem decidiu, quando, observação).
  RLS: leitura só para quem enxerga **os dois** clientes; escrita só pelas funções.
- `cliente_pares_atualizar` (definer; dono ou cron diário 06:20): telefone em 2–3 cadastros (fora o fixo da loja),
  mesmo contato do Tiny, mesmo nome com um sem CPF/CNPJ que tem movimento. Mantém as decisões; tira da fila só os
  pendentes que deixaram de ser candidatos.
- `cliente_par_decidir` (definer): mesmo cliente / clientes diferentes / precisa conferir (obs obrigatória) / desfazer;
  exige acesso aos dois cadastros. **Não altera os cadastros.**
- `cliente_pares_lista` (definer): os dois lados com dados, telefones, compras (só pedidos que a pessoa pode ver),
  vendedor e negócios visíveis.
- Tela: Clientes → 🔎 Cadastros parecidos (filtro por status, os dois lados com os motivos, decisão com observação)
  e aviso na ficha do cliente com link para o outro cadastro.

## Validação

- `tests/lote-3a.cjs` (novo) e todos os `tests/*.cjs` + `globais.cjs` passando.
- SQL revertido: 62 pendentes (49 com os dois ativos, ~0,1 s para recalcular); vendedor decide; "conferir" sem
  obs recusado; vendedor não recalcula; depois da correção, vendedor só vê par com acesso aos dois (1 de 58).

## Revisão do Codex

- 1ª rodada: dois P1 de vazamento — a lista e o SELECT direto mostravam o outro cadastro a quem só enxergava um dos
  lados. Corrigido (acesso aos dois + agregados por `pode_ver_pedido`).
- 2ª rodada: "ok para aplicar".

## Para o Codex

- "Mesmo cliente" é só registro por enquanto; usar na 3B/3C para juntar histórico na leitura, sem fundir cadastros.
