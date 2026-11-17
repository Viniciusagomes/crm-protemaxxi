# WhatsApp: enviar modelo aprovado e arrastar arquivo (17/11)

## O que mudou
- **Edge Function `whatsapp-enviar`** (publicada, v7; a cópia aqui é igual):
  - `{acao: "modelos"}` devolve os modelos **aprovados** da Meta, com corpo, número de variáveis e botões.
    Só funciona para quem tem login ligado a colaborador.
  - `{conversa, modelo: {nome, idioma, params}}` envia o modelo, inclusive fora das 24 h. Antes de enviar:
    - confere na Meta que o modelo está aprovado;
    - valida as variáveis: sem vazio, sem quebra de linha e sem 4 espaços seguidos, que é a regra da Meta;
    - recusa cliente marcado como `nao_contatar`.
  - Grava em `wa_mensagens` como `tipo = 'template'`, com o texto já preenchido.
  - O envio de texto e de arquivo continua igual. Só a mensagem de erro de "fora das 24 h" agora aponta o botão novo.
- **Config**: `config.whatsapp.modelos_waba_id = 300148245015943`, a conta de modelos (Messaging Account).
  O `waba_id` antigo continua lá, e a função tenta os dois.
- **Tela**:
  - Botão "Enviar modelo" na faixa das 24 h e um ícone no rodapé da conversa.
  - Na janela do modelo: escolhe o modelo, os campos já vêm preenchidos (primeiro nome do cliente e o seu) e a prévia aparece igual ao WhatsApp.
  - A bolha de modelo mostra "Modelo aprovado" e não tem "Tentar de novo".
- **Arrastar arquivo** para a conversa, ou **colar imagem** com Ctrl+V na caixa de texto, anexa o arquivo pelo mesmo caminho do clipe.
  Só dentro das 24 h e fora do modo nota; um arquivo por vez; até 16 MB.

## Validação
- Testes novos em `whatsapp.cjs` (função) e `whatsapp-etiquetas.cjs` (tela); 30/30.
- `acao: "modelos"` chamada de verdade com o login do Vinícius: respondeu `[]`, porque os 5 modelos ainda estão PENDING na Meta.
- Prévia com dados de exemplo: a janela do modelo e o arrastar (DragEvent simulado) funcionando.

## Fica para conferir
- Quando a Meta aprovar o primeiro modelo, confirmar que a lista vem cheia. Se vier vazia, o token não lê a conta 300148245015943.
- Revisão do Codex: o Codex não está instalado neste PC.
