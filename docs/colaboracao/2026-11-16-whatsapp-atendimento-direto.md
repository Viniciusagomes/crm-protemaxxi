# WhatsApp: atendimento direto para o Pedro (16/11/2026)

Pedido do Vinícius: o número comercial ainda funciona no celular do Pedro, então **por enquanto toda conversa nova vai
direto para ele**, o botão "Iniciar expediente" fica desligado e todos saem do expediente.

## O que mudou

- **Banco** (`20261116143312_whatsapp_atendimento_direto.sql`, já aplicada):
  - `config.whatsapp.responsavel_fixo` (hoje `"pedro"`) liga o modo direto. `seg.wa_fixo()` devolve essa pessoa se estiver ativa.
  - `seg.wa_atribuir`: com responsável fixo, a conversa vai para ele sem olhar expediente, carteira ou rodízio
    (nota na conversa: "recebeu a conversa (atendimento direto)").
  - `public.wa_expediente`: com responsável fixo, `inicio` e `retorno` dão erro com a explicação. `fim`, `ping` e
    `aviso_ok` continuam funcionando.
  - Dados: todos foram para `fora` (log `fim` por `vinicius`, **sem contar falta**) e a fila "Sem dono" foi distribuída.
- **Tela** (`js/atendimento.js`, `?v=20261116a`): a barra de expediente mostra "⏸ Expediente desligado — toda conversa
  nova vai direto para Pedro", sem botões.
- `tests/whatsapp-direto.cjs` novo; `tests/whatsapp-fase2.cjs` deixou de travar a versão de cache do `atendimento.js`.

## Ajuste manual feito no banco

As conversas 249 (Camp Doces) e 256 (Jefferson) tinham caído no rodízio para o Felipe Menezes às 10:55, minutos antes
da mudança. As duas são clientes do Pedro (mensagens "Olá Pedro…"), então foram passadas para ele com nota de evento.
As outras ~70 conversas abertas continuam com o Felipe Menezes (aguardando decisão do Vinícius).

## Como voltar ao rodízio com expediente

Tirar a chave: `update config set valor = valor - 'responsavel_fixo' where chave = 'whatsapp';`
(a tela e as regras voltam sozinhas; o `configSalvar` da tela preserva as chaves do JSON).

## Validação

- `node tests/rodar-todos.cjs`: 25/25.
- Conferido no banco: `responsavel_fixo = pedro`, ninguém em expediente, fila "Sem dono" = 0.
- **Sem revisão do Codex**: o `codex` não está instalado neste PC novo (exit 127).

## Para o Codex

Se mexer na distribuição, preserve a ordem: responsável fixo → carteira → rodízio.
