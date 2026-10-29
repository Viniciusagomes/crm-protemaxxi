# Lote 2 · entrega C — linha do tempo e central da supervisão — 29/10/2026 (Claude)

Fecha o lote 2 revisado (A: rotina do vendedor; B: orçamentos e próximo passo; C: esta).

## O que mudou

- **Ficha do cliente → 📜 Linha do tempo (passo 11, só leitura).** Compras, contatos registrados (texto completo),
  campanha (resultado da lista; o que já virou contato aparece uma vez só, pelo `interacao_id`), negócios abertos,
  ganhos, perdidos e juntados, atividades concluídas e OS, do mais recente para o mais antigo (25 + "ver mais").
  Não funde cadastros parecidos (fica para depois, com conferência humana).
- **Supervisão → Central de pendências comerciais (passo 20).** Por vendedor da equipe (e o próprio supervisor, se
  vende): retornos vencidos (atividades e retornos combinados, como no Meu dia), negócios sem próximo passo, vendas
  para conferir, orçamento × campanha para juntar, telefones para corrigir e **prospecção sem registro** (adesão).
  Tabela de contagem + listas com "Abrir" e "Passar".
- **Passar para outra pessoa.** RPC `crm_redistribuir` (invoker, RLS de negocios/atividades): negócio com as
  atividades abertas, ou atividade solta; motivo obrigatório (registrado nas observações do negócio ou no título da
  atividade); repetição sem efeito; só para vendedor ativo que a pessoa enxerga. Atividade de negócio encerrado
  (pós-venda) não oferece "Passar".

## Validação

- `tests/lote-2c.cjs` (novo) e todos os `tests/*.cjs` + `globais.cjs` passando.
- SQL em transação revertida: supervisor (Felipe Menezes) passa negócio do Pedro com a atividade, repetição sem
  efeito, sem motivo recusado, atividade solta passada; vendedor (Pedro) não consegue passar para o supervisor.

## Revisão do Codex

- 1ª rodada (3 P2): retornos combinados fora da central; "Passar" quebrado no pós-venda; linha do tempo perdendo o texto
  do contato gerado pela campanha. Corrigidos.
- 2ª rodada (1 P2): texto do contato ainda cortado em 160 caracteres. Corrigido (sem corte).

## Para o Codex

- Lote 3 (atribuição de venda, vínculo pedido × negócio) parte de `negocios.prospeccao_id` e `juntado_a`.
- A central só lê o que já está carregado no CRM (120 dias de atividades feitas); se crescer, mover para uma view.
