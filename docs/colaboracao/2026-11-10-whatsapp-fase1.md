# 10/11/2026 — WhatsApp na Intranet, fase 1: caixa de entrada (Claude)

API oficial da Meta (Cloud API), sem intermediário. Plano geral: `projetos/ATENDIMENTO-OMNICANAL.md` (fora do repositório);
passo a passo da Meta para o Vinícius: `projetos/WHATSAPP-META-PASSO-A-PASSO.md`.

## O que mudou
- **Migration `whatsapp_fase1`**:
  - Tabelas `wa_conversas`, `wa_mensagens` e `wa_respostas` (respostas prontas), no Realtime.
  - Bucket privado `whatsapp`: mídias recebidas em `entrada/<conversa>/`; arquivos para enviar em `saida/<pessoa>/`.
  - **Quem vê:** o dono e quem tem a permissão nova `atendimento`. Esses veem as conversas sem dono, as próprias e as da equipe (`seg.pessoas_visiveis`).
  - **O site não grava direto nas conversas nem nas mensagens.** As ações passam pelas RPCs `wa_assumir`, `wa_transferir`, `wa_encerrar`, `wa_nota`, `wa_lida` e `wa_ligar_cliente`. A `wa_ligar_cliente` também grava o número em `cliente_telefones`, com origem 'whatsapp'.
  - `wa_ficha` mostra um resumo do cliente para quem atende: vendedor, total em 12 meses e os 5 últimos pedidos. **Isso amplia a visão de quem atende** (vê o resumo mesmo de cliente de outro vendedor), de propósito.
  - `wa_buscar_cliente` busca por nome, documento ou telefone para ligar a conversa a um cliente.
  - `wa_entrada` e `wa_status` só rodam com service_role.
  - O token de verificação do webhook é gerado em `privado.segredos` ('wa_verify'); só o dono lê, por `wa_webhook_info`.
  - Config `whatsapp` = {phone_number_id, waba_id, graph_version}.
- **Função `whatsapp-webhook`** (verify_jwt **false**, quem chama é a Meta):
  - GET faz a verificação do webhook.
  - POST **só aceita com a assinatura `X-Hub-Signature-256` certa** (HMAC com o secret `META_APP_SECRET`).
  - Grava a mensagem sem duplicar (`wa_msg_id` único), baixa a mídia para o bucket (até 20 MB) e atualiza o status das mensagens enviadas.
- **Função `whatsapp-enviar`** (com o login de quem envia):
  - Lê a conversa pela RLS e envia texto ou arquivo; fora da janela de 24 h, recusa com explicação.
  - Quem responde uma conversa sem dono vira o responsável.
  - Token da Meta só no secret `META_WA_TOKEN`.
- **Tela "💬 WhatsApp"** (`js/atendimento.js`):
  - Abas Minhas / Sem dono / Todas abertas / Encerradas, com busca.
  - Chat em tempo real: imagem, áudio, vídeo e PDF por link assinado; ✓✓ de entregue/lida; notas internas.
  - Ficha do cliente ao lado; assumir, transferir e encerrar com motivo; respostas prontas; anexo; Enter envia.
  - Som e notificação do navegador para mensagem nova minha ou sem dono, em qualquer tela; contador no menu.
  - O dono configura os IDs e vê a URL e o token do webhook em ⚙ Configurar.
  - Os botões usam `data-wa` com ouvinte próprio no arquivo (o `A` do main.js ainda não existe quando ele carrega).
- `index.html`: CSP ganhou `media-src` (áudio e vídeo do Supabase). Permissão "Atendimento WhatsApp" na lista de colaboradores.

## Validação
- `tests/whatsapp.cjs`: leitura dos tipos de mensagem da Meta, assinatura HMAC (certa, corpo alterado, segredo errado, sem segredo), tipo de mídia, janela de 24 h, regras do SQL e filtros/contador/escape da tela.
- `tests/email-access.cjs` ganhou o stub `veAtendimento`. `node tests/rodar-todos.cjs` ok.
- **Não testado com a Meta ainda:** o Vinícius está criando o portfólio empresarial e o app. Teste ponta a ponta com o número de teste da Meta.

## Ficou de fora (próximas fases)
- Filas, rodízio, carteira automática pelo vendedor do Tiny e horário de atendimento (fase 2).
- Modelos aprovados, para escrever fora das 24 h (fase 6), Instagram, robô/IA e ligações.
- Revisão do Codex: o CLI não está no PC novo. **Entrega sem revisão cruzada.**

## Para o Codex
- `atendimento.js` usa globais com prefixo `WA`/`wa`. Não criar nomes com esse prefixo em outros arquivos.
- Conflito esperado com o PR #25 só em `index.html` e `main.js` (versões `?v=`): ao rebasear, manter as duas mudanças.

## Publicação (11/11/2026)
- Branch atualizada com a `main` (conflito só nas versões do `index.html`: mantidos `compras.js?v=20261110a` do #25 e
  `atendimento.js`; `main.js` juntou as duas mudanças e subiu para `?v=20261111a`). 23/23 testes ok.
- Antes de aplicar: conferidas todas as dependências (seg.fone_norm/minha_permissao/pessoas_visiveis/minha_pessoa,
  privado.segredos, colunas de cliente_telefones/pessoas/clientes/pedidos) e que nenhum objeto `wa_*` existia.
- Migration aplicada como `20261111204044_whatsapp_fase1` (arquivo renomeado). Conferido: 3 tabelas, 13 funções `wa_*`,
  bucket `whatsapp`, segredo `wa_verify`, Realtime nas 2 tabelas; `wa_entrada` sem execute para anon/authenticated.
- Edge Functions publicadas (v1) iguais às cópias: `whatsapp-webhook` (verify_jwt false) e `whatsapp-enviar` (verify_jwt true).
- Teste de fumaça do webhook (sem gravar nada): GET com token errado → 403; POST sem assinatura → 401; assinatura falsa → 401.
- **Falta para funcionar de verdade:** secrets `META_APP_SECRET` e `META_WA_TOKEN` no Supabase e os IDs em ⚙ Configurar
  (depende do app da Meta que o Vinícius está criando). Sem eles o envio responde "ainda não está configurado".
- Merge feito a pedido do Vinícius ("autorizo acesso total"), sem revisão do Codex (CLI fora do PC novo).
