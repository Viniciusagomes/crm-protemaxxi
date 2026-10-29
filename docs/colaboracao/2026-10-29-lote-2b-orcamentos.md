# Lote 2 · entrega B — orçamentos e próximo passo — 29/10/2026 (Claude)

Segue o plano do lote 2 revisado (ver `2026-10-29-lote-2a-rotina-vendedor.md`). Entrega C (linha do tempo do
cliente + central de pendências da supervisão com adesão) vem depois.

## O que mudou

- **Funil → 🔁 Recuperar orçamentos.** Orçamentos/negociações com 7+ dias, do maior valor para o menor, com dias,
  tentativas de contato (ligar, WhatsApp, visita, follow-up concluídos; tarefas internas não contam), última anotação e
  próximo passo. Com 3+ tentativas aparece "Decidir". A cobrança automática (`crm_automacoes`, "Retomar conversa sobre o
  orçamento") continua igual.
- **"Pediu orçamento" vira negócio (passo 16).** Ao marcar o resultado, abre a janela para criar o negócio já
  preenchido (cliente, vendedor, origem prospecção, próximo passo em dia útil) ou ligar a um negócio aberto do mesmo
  cliente. RPC `prospeccao_negocio`: idempotente (um negócio por contato, índice único em `negocios.prospeccao_id`),
  encerra o retorno automático da prospecção (falha inteira se não tiver permissão para isso). No cartão da campanha:
  "🎯 Criar negócio" / "🎯 Ver negócio".
- **Orçamento do Tiny junta no negócio da prospecção.** Trigger `negocio_juntar_orcamento` (AFTER INSERT): quando o
  `orcamentos-sync` cria o negócio de um orçamento novo e o cliente tem negócio aberto da prospecção (30 dias, sem
  orçamento, mesmo vendedor), o negócio do Tiny absorve o da prospecção (vínculo, origem, título, previsão, obs e
  atividades) e o vazio é apagado. O sync continua recebendo o id do insert normalmente.
- **"Para avançar com segurança" (passo 19, leve).** No negócio: próximo passo, orçamento ligado (a partir da etapa
  orçamento), previsão e valor, com ✓/○ e campo rápido de previsão. Não bloqueia nenhuma mudança de etapa.
- **Calendário comercial (passo 15).** Dia útil = segunda a sábado, sem os feriados da configuração da Equipe
  (`config.feriados`, já existente). `diaUtil` na tela e `public.dia_util` no banco (mesma regra). Datas sugeridas
  e os retornos automáticos da prospecção (+2/+3 dias) caem em dia útil.
- **Reagendar com motivo.** Botão ⇢ nas atividades (Meu dia e negócio). RPC `atividade_reagendar`: motivo
  obrigatório, guarda a data combinada (`quando_original`) e o histórico (`reagendamentos`), trava negócio → atividade
  (mesma ordem do `atividade_concluir`). Aviso ao escolher domingo/feriado.

## Validação

- `tests/lote-2b.cjs` (novo) e todos os `tests/*.cjs` + `globais.cjs` passando.
- SQL em transação revertida, autenticado como vendedor: retorno do "pediu orçamento" em dia útil; negócio criado e
  clique repetido sem duplicar; reagendar com histórico e motivo obrigatório; insert do Tiny devolvendo o id novo,
  absorvendo o negócio da prospecção (1 negócio aberto, atividade movida). Nada ficou gravado.

## Revisão do Codex

- 1ª rodada: P1 — o `return null` do trigger BEFORE fazia o PostgREST (`.select().single()`) reverter a junção;
  trocado pelo AFTER INSERT que absorve. P2 — ordem de locks do reagendar; encerramento do retorno sem checar
  permissão; "3 tentativas" contando tarefas internas. Tudo corrigido.
- 2ª rodada: "ok para aplicar".

## Para o Codex

- `negocios.prospeccao_id` é a base da atribuição (lote 3). Não use origem/coincidência de compra para isso.
- Ao gerar datas de retorno no banco, use `public.dia_util`.
