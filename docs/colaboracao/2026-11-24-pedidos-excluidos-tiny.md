# Pedidos excluídos no Tiny somando nas vendas (24/11/2026)

O Vinícius notou uma diferença nas vendas do Pedro em novembro: o Tiny mostra cerca de R$ 63 mil, e a Intranet mostrava mais de R$ 80 mil.

## Causa
Quando alguém **exclui** um pedido no Tiny (em vez de cancelar), ele some da API:
- `pedidos.pesquisa` não traz mais o pedido;
- `pedido.obter` responde "Pedido não localizado".

O `tiny-sync` só atualiza o que a pesquisa devolve. Por isso, o pedido ficava para sempre no banco com a última situação que teve, e continuava somando nas vendas, nas metas e na expedição.

Conferência feita em 24/11 (comparação dos ids do Tiny com os do banco, confirmando um a um no `pedido.obter`):
- **novembro:** 24 pedidos fantasmas. Do Pedro são 5, que somam R$ 16.541,71. Os outros são do Felipe e do Vinícius. Vários foram excluídos e refeitos no mesmo dia, com o mesmo número (78334, 78337).
- **outubro:** 13 fantasmas, R$ 48,6 mil só do Felipe.

## O que mudou
- **Migration** `20261124205053_pedidos_excluido_tiny` (já aplicada): coluna `pedidos.excluido_tiny_em`.
- **`supabase/functions/tiny-sync/index.ts`**, que entra no repositório nesta PR (antes não tinha cópia aqui):
  - `conferirExcluidos`, que roda depois do incremental e no máximo 1 vez por hora:
    - confere o mês atual e o anterior;
    - compara os ids do Tiny com os do banco;
    - confirma cada suspeito no `pedido.obter`;
    - só então grava `situacao = 'Cancelado'` e `excluido_tiny_em`.
  - A fila fica em `sync_estado.conferencia_excluidos`. Dá para pôr meses antigos nela para uma limpeza retroativa, e ela anda 1 mês por rodada.
  - `detalharUm`: um pedido excluído antes de ser detalhado era um "não localizado" que derrubava a rodada inteira. Agora o pedido é marcado como excluído.
- Nenhuma tela mudou: todas já descartam `situacao === 'Cancelado'`.

## Ativação (24/11)
- O Vinícius pediu para limpar **só novembro**: outubro e os meses anteriores ficam como estão, porque a comissão já foi fechada.
- Por isso, a conferência automática olha só o mês atual. O mês anterior entra apenas do dia 1 ao dia 5, para pegar exclusões da virada.
- A função `tiny-sync` foi publicada (versão 22, igual à deste PR), e a fila começou com `["2026-11"]`.
- Para limpar um mês antigo no futuro, é só pô-lo na fila:
  `update sync_estado set valor = jsonb_build_object('fila', '["2026-10"]'::jsonb, 'em', now()) where chave = 'conferencia_excluidos'`.

## Validação
- A comparação Tiny × banco de novembro e outubro foi feita por script local (API v2, só leitura).
- Pedro em novembro sem os 5 fantasmas: R$ 63.594,43. A soma do Tiny pela API dá R$ 63.594,72.
- `tsc --noEmit` na função, com o Deno simulado: sem erros no código novo.

## Para o Codex
Pedido que some do Tiny **não** é apagado do banco, porque `expedicao` e `negocio_pedidos` têm cascade. Ele vira "Cancelado", e `excluido_tiny_em` diz por quê.
