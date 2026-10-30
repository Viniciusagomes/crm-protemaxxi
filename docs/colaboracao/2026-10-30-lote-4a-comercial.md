# Lote 4 · entrega A — prioridade, recompra, mensagens e motivo do orçamento parado — 30/10/2026 (Claude)

Versão enxuta aprovada pelo Vinícius da proposta "fase 4" do Codex: passos 31, 32, 34 e só o motivo do 36.
Boa parte dos passos 31, 35, 36, 37 e 39 já existia (lotes 2 e 3). Os passos 33, 35, 37, 38 e 39 esperam duas semanas de uso real
com o Felipe Menezes; o 40 entra junto com a 3C.

## O que mudou

- **Passo 31, Meu dia:** ordem da fila: compromisso (retorno combinado, atividade com hora ou com data reagendada) → lead do anúncio →
  demais por atraso. O `prio` continua dando a cor; o novo `grupo` decide a ordem. Motivos novos: "Compromisso às HH:MM", "Data combinada",
  "Pediu contato pelo anúncio". O teste `lote-2a` foi ajustado: retorno combinado agora vem antes de tarefa atrasada.
- **Passo 32, recompra:** `seg.recompra_ciclo` calcula o intervalo real por produto: 3+ datas (qualquer produto, 7+ dias) ou 2 datas de material
  de reposição (14+ dias), entre 1,2 e 3 ciclos sem comprar, no máximo 240 dias. Serviço e frete fora. `prospeccao_gerar` usa isso primeiro na lista
  `recompra`; a regra antiga completa a cota. Limites da campanha (30/90 dias, pausa, não contatar) continuam valendo.
- **Dispensa:** botão "Compra eventual" grava `recompra_dispensas` e pula o contato de hoje. Sem desfazer na tela por enquanto.
- **Passo 34, mensagens:** `mensagemLead`, `mensagemRetorno`, `mensagemTrava` e recompra por produto; recompra e reativação têm duas versões.
  O WhatsApp abre com o texto para o vendedor revisar. Cliente pausado ou "não contatar" não recebe botão de mensagem.
- **Passo 36 (só o motivo):** `negocios.travado_motivo` (sem resposta, preço, estoque, prazo, decisão), marcado na aba Recuperar, com sugestão e mensagem próprias.

## RLS

Tabela nova `recompra_dispensas`: select e insert só para quem enxerga a campanha do cliente; sem update/delete. Nenhuma política existente foi ampliada.

## Validação

- `tests/lote-4a.cjs` (novo, com dados fictícios) e `node tests/rodar-todos.cjs`.
- SQL revertido, gerando a lista de 35 dias à frente: 21 sugestões pelo ciclo, dispensa tira o produto, vendedor barrado em cliente de outro,
  vendedor consegue marcar o motivo.

## O que os dados mostraram

Com 3+ compras só 11 clientes entram hoje (2 livres do limite de 30 dias). Com 2 compras de material de reposição, o volume sobe. O histórico de itens
começa em out/2025, então os ciclos devem melhorar com o tempo. Recompra é sugestão de contato, não previsão de venda.

## Para o Codex

- Não colocar telefone ou nome real de cliente em testes e notas: o repositório é público.
- `recompra_dispensas.produto` guarda `repor_chave` (código, ou descrição em minúsculas).
