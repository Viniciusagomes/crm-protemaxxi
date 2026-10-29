# Lote 2 · entrega A — rotina do vendedor — 29/10/2026 (Claude)

Lote 2 proposto pelo Codex e revisado com o Vinícius em 3 entregas (A: rotina do vendedor; B: recuperação de
orçamentos + 16 + 19 leve + 15; C: 11 linha do tempo + 20 supervisão com adesão). 17 e 18 (vínculo e atribuição
de venda) foram para o lote 3: hoje a prospecção tem 4 orçamentos e 1 compra registrados, e 89% das linhas
estão sem resultado — o gargalo é o registro, não a atribuição.

## O que mudou (passos 14 e 12+13)

- **Meu dia: fila única.** Atividades até hoje, retornos combinados (interações com `proximo_contato`) e negócios
  sem próximo passo/parados viram **um cartão por cliente**, com o motivo da prioridade
  (1 atrasado · 2 combinado para hoje · 3 negócio parado; dentro do grupo, o mais antigo e o de maior valor primeiro).
  Atividade sem `cliente_chave` usa o cliente do negócio. Substitui "Fazer hoje", "Negócios sem próxima atividade" e
  "Revisar e recuperar". Os KPIs, "Próximos 7 dias", revisar encerrados e arquivadas ficaram como estavam.
- **Meu dia: próximos contatos da campanha.** Os 5 próximos pendentes com mensagem editável (mesmo rascunho da
  campanha), WhatsApp e resultado em um clique. Cliente pausado ou "não contatar" fica só na campanha completa.
- **Número errado.** O resultado "Número errado" marca o número que estava na tela (`cliente_telefones.errado_em`);
  ele some de `v_clientes`, do botão "+" das atividades (`contato_atividade`) e aparece riscado na ficha. O cliente
  sai da campanha até ter um número válido. Trocar o resultado desfaz a marca (sem "confirmar" o número).
  Fila "📵 Telefones para corrigir" na Prospecção e no Meu dia: incluir número novo ou "Estava certo".
- **Regras de contato.** Ficha do cliente: pausa até uma data, canal preferido e motivo (`clientes.contato_*`,
  RPC `contato_regras`). A pausa tira o cliente das campanhas geradas (`prospeccao_gerar`) e esconde o WhatsApp
  nos cartões já gerados; pedidos e assistência seguem normais.
- `prospeccao_gerar`: duas trocas pontuais (pausa + números errados); "número errado" deixou de bloquear 90 dias
  fixos e passa a bloquear até a correção. "Sem interesse" continua 90 dias.

## Banco (`supabase/migrations/<versão>_lote_2a_contato.sql`)

- Colunas novas, `seg.fone_errado`, `seg.pode_mexer_cliente` (regra do `cliente_marcar` + cliente na própria
  campanha), `telefone_errado` e `contato_regras` (definer, `search_path` vazio, sem `anon/PUBLIC`).
- `prospeccao_registrar` ganhou `p_fone default null` (chamada antiga continua funcionando).
- Política `clitel_ins`: insert direto não pode trazer `errado_em/errado_por` (marca só pela RPC).
- Backfill: números de "número errado" dos últimos 90 dias, só quando nenhum número foi incluído ou confirmado
  depois do registro.
- **Aplicar a migration antes do merge** (o site novo manda `p_fone`; o banco novo aceita o site antigo).

## Validação

- `tests/lote-2a.cjs` (novo): ordem e agrupamento da fila, chave pelo negócio, contatos rápidos sem pausado e com
  mensagem editável, fila de telefones só do vendedor, selos de pausa/canal. `colaboradores.cjs` ajustado
  (fila de telefones pré-carregada). Todos os `tests/*.cjs` e `globais.cjs` passando.
- SQL em transação revertida, autenticado como vendedor (Pedro): marcar/desmarcar número errado no cadastro,
  insert direto com marca bloqueado, pausa gravada, cliente pausado fora da lista gerada; geração de amanhã com o
  mesmo total de antes (102). Nenhum dado de teste ficou.

## Revisão do Codex

- 1ª rodada, 8 pontos, todos corrigidos: RLS do insert, backfill que podia marcar número já corrigido, pausa na
  lista já gerada, telefone local zerado (agora relê `v_clientes`), ficha/`contato_atividade` com número errado,
  mensagem escondida no Meu dia, cartão duplicado por `n{id}`, número corrigido "sumindo".
- 2ª rodada, 2 pontos, corrigidos: `contato_atividade` passa a usar primeiro o celular da agenda; desfazer
  "número errado" não marca o número como confirmado (`p_confirmar=false`).

## Para o Codex

- Entregas B e C seguem nesta ordem, cada uma em PR próprio. Revisão cruzada continua valendo.
- Ao mexer em telefone, use `seg.fone_errado` / `errado_em is null`; não apague linha de número errado.
