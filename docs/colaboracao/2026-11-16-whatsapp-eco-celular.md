# WhatsApp: mensagens do celular no histórico + diagnóstico de mídia (16/11/2026)

## Problemas relatados pelo Vinícius

1. "Não consigo puxar o histórico total, só o que o cliente manda."
2. "Não consigo acessar os arquivos e áudios."

## Causas

1. O número +55 19 4141-7105 está em **coexistência** (app WhatsApp Business no celular do Pedro + API). O que o Pedro
   responde pelo app chega no webhook no campo `smb_message_echoes` (o app já estava inscrito nele), mas a função
   só lia `messages`. Resultado: 252 entradas e **0 saídas** do celular gravadas.
2. Nenhuma mídia foi baixada (34 com `midia_id`, 0 com `midia_path`). O `baixarMidia` saía calado quando a Meta não
   devolvia a URL. Junto com o envio que falhou em 13/11 com `190 Authentication Error`, a causa provável é o
   **token `META_WA_TOKEN` inválido/expirado**. Trocar por um token permanente de Usuário do Sistema
   (Business Settings › Usuários do sistema) e gravar no secret do Supabase. É o Vinícius quem faz (segredo).

## O que mudou

- Migration `20261116145004_whatsapp_eco_celular.sql` (aplicada): `public.wa_eco(p jsonb)`, só `service_role`.
  Cria/acha a conversa pelo cliente (`para`), grava `saida` com status `enviada` e `por` = responsável da conversa
  (ou o responsável fixo), zera as não lidas se a resposta for mais nova que a última entrada, não duplica
  (`wa_msg_id` único) e não manda nada ao cliente.
- `supabase/functions/whatsapp-webhook` (publicada, versão 5): lê `smb_message_echoes` → `lerEco` → `wa_eco` (+ mídia);
  `baixarMidia` agora registra no log o erro da Meta (código e mensagem) e o status do download.
- `tests/whatsapp.cjs`: `lerEco` e as checagens novas.

## Dados

As 70 conversas que estavam com o Felipe Menezes foram para o Pedro (nenhuma tinha contato real dele: 0 mensagens
enviadas com sucesso, sem pedido, interação ou prospecção com esses clientes). Nota de evento em cada uma.

## O que não volta

O histórico de antes de hoje das respostas do celular não é recuperável por aqui: a Meta só manda esse histórico
uma vez, na conexão do número (campo `history`), e a função ainda não lia esse campo naquela época.

## Validação

- `node tests/rodar-todos.cjs`: 26/26.
- `wa_eco` testada em transação revertida (gravou saída/pedro/enviada, zerou não lidas, repetição ignorada) e
  conferido que não ficou registro.
- Sem revisão do Codex (não instalado neste PC).

## Token novo e mídias antigas (16/11, fim da tarde)

- O Vinícius trocou o `META_WA_TOKEN` por um token permanente de Usuário do Sistema.
- A função ganhou `POST` com `x-sync-secret` e `{acao:"rebaixar_midias"}` (só o servidor; segredo `sync` do banco,
  chamado por `net.http_post`). Baixou as mídias pendentes: 37 de 39 com arquivo; as 2 restantes chegaram durante o
  processo e são baixadas pelo fluxo normal.
- Os ecos do celular já estão chegando (texto e documento enviados pelo Pedro aparecem como saída).
