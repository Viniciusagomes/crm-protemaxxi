# 12/11/2026 — WhatsApp na Intranet, fase 2: expediente e distribuição (Claude)

Pedido do Vinícius: só recebe conversa nova quem está conectado na tela do WhatsApp e em expediente; botões de almoço e
fim de expediente com aviso/bloqueio; distribuição por setor + carteira; botão "Enviar para o vendedor".

## O que mudou
- **Migration `whatsapp_fase2`**:
  - `wa_atendentes` (estado fora/trabalhando/almoço, sinais de presença `visto_em`/`tela_em`, setores, rodízio, avisos, bloqueio),
    `wa_expediente_log` e `wa_horarios` (horário de atendimento por pessoa, só informativo — o bot usa na fase 3).
  - `wa_conversas` ganhou `setor` (padrão 'vendas') e `vendedor_carteira`.
  - **Disponível** (`seg.wa_disponivel`): trabalhando + sinal da tela do WhatsApp nos últimos 3 min + sem bloqueio.
  - **Distribuição** (`seg.wa_atribuir`): vendedor da carteira (vendedor principal do cliente no Tiny, sem marketplace/cancelados)
    se disponível; senão rodízio entre os disponíveis do setor (quem recebeu há mais tempo); ninguém = fila sem dono,
    distribuída quando alguém fica disponível (`seg.wa_distribuir_fila`).
  - `wa_entrada`: contato novo **ou que reabre depois de encerrado** volta para a distribuição (antes reabria com o mesmo dono).
    Conversa aberta com dono continua com ele.
  - **Avisos/bloqueio** (`seg.wa_verificar_presenca`, pg_cron `wa-presenca` a cada minuto e também a cada ação):
    "trabalhando" sem sinal da Intranet por 5 min, ou almoço > 3 h sem retornar = falha. 1ª aviso, 2ª aviso final,
    3ª bloqueio de 3 dias corridos (a contagem zera). O dono zera/desbloqueia em 👥 Equipe.
  - RPCs: `wa_expediente(acao, tela)` (inicio/almoco/retorno/fim/ping/aviso_ok), `wa_atendente_cfg` e `wa_desbloquear` (dono),
    `wa_enviar_vendedor` (quem atende ou o dono, só com o vendedor da carteira disponível). `wa_ligar_cliente` recalcula a carteira.
  - `wa_atendentes` só muda pelas funções; `wa_horarios` só o dono edita. Realtime em `wa_atendentes`.
- **Tela** (`js/atendimento.js`, `?v=20261112a`): barra de expediente (Iniciar / Almoço / Retornar / Finalizar), aviso em
  janela com "Entendi", sinal de presença a cada 30 s em qualquer tela (a tela do WhatsApp só conta quando está aberta e visível),
  botão "📤 Enviar para o vendedor: Nome" no cabeçalho da conversa, painel 👥 Equipe (dono: setores, avisos, desbloqueio,
  horários, últimos registros).

## Validação
- `tests/whatsapp-fase2.cjs`: regras do SQL (disponível, avisos/bloqueio, ordem carteira → rodízio → fila, segurança) e tela
  (mesma regra de disponível, botões por estado, quando aparece o "Enviar para o vendedor"). `node tests/rodar-todos.cjs`: 24/24.
- Simulação no banco real dentro de transação desfeita (rollback, conferido depois): 3ª falha bloqueia e zera; só quem está com a
  tela aberta recebe; carteira resolve para a pessoa certa pelo `tiny_vendedor_id`.

## Atenção
- A pessoa precisa da permissão **Atendimento WhatsApp** (hoje ninguém tem) e estar num setor (padrão: Vendas).
- O `config.whatsapp` ainda aponta para o número de teste da Meta: o Vinícius vai trocar para o número comercial em ⚙ Configurar.
- Navegador em segundo plano pode atrasar o sinal; a margem de 5 min cobre isso. PC que hiberna em expediente conta como saída.

## Ficou de fora (fase 3)
- Menu do bot (Vendas, Suporte Técnico com formulário WhatsApp Flows, Compras → compras@, Financeiro → contato@, Avaliação → link),
  mensagem de horário/"o vendedor parece conectado", modelos aprovados.
- Revisão do Codex: CLI ainda não instalado no PC novo. **Entrega sem revisão cruzada.**

## Para o Codex
- Novos globais em `atendimento.js` com prefixo `wa`/`WA_` (`waEu`, `waDisp`, `waBloq`, `WA_DIAS`, `waPing`…).
