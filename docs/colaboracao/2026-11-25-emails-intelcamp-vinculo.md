# E-mails da Intelcamp que não chegavam à OS (25/11/2026)

O Vinícius contou que o Marcos não via alguns e-mails da caixa **os.intelbras@**, ou via incompletos.

## O que a revisão achou
- **Acesso e entrada estão certos.** Na simulação do login do Marcos (RLS), ele vê os 34 e-mails da caixa e os 15 anexos. Nos logs, todo e-mail que chegou à função `email-entrada` respondeu 200.
- **O problema é o vínculo com a OS.** Desde 28/10, só 5 dos 34 e-mails foram ligados à OS. Os outros ficaram só na Caixa de e-mails, sem status, etapa nem rascunho na ficha da OS. Para quem trabalha pela OS, é como se o e-mail não tivesse chegado. Há três causas:
  1. **O e-mail chega antes do envio registrado.** A Intelcamp manda a primeira notificação antes de a loja registrar o envio (RMA) na Intranet. Exemplo: o e-mail da T943 chegou em 23/11 e o RMA dela foi aberto em 24/11. O e-mail era lido uma vez só, na chegada, e nunca mais.
  2. **O campo "Nº OS Terceiros" não era usado.** Ele traz o número da **nossa** OS (941 = T941). Quando vinha vazio, o leitor pegava a linha seguinte (":", "Acessórios: SEM HD E FONTE").
  3. **A série digitada com lixo não batia.** Exemplos: "NS: YQ8K500(*)50779NS:" na T937, e "592" na T938. Além disso, a T929 tem dois RMAs abertos, e com dois candidatos o e-mail não era aplicado a nenhum.
- **"Incompleto":** o logo da Intelcamp vem como anexo (`src="Mlogo.jpg"`) e aparecia quebrado no leitor. A NFS-e de Campinas vem sem corpo, só com o PDF e o XML anexados.

## O que mudou
- **`supabase/functions/email-entrada/index.ts`**:
  - `lerSHOficina`: "Nº OS Terceiros" só vale se for número (`T?` seguido de 2 a 6 dígitos).
  - `acharOS`: procura a OS nesta ordem:
    1. a OS deles já ligada;
    2. **o número da nossa OS (Terceiros)**;
    3. a série igual, ou **contida** na outra (com 10 caracteres ou mais);
    4. a série com 1 caractere diferente, que fica como provável.
    - Nos dois RMAs abertos da mesma OS, fica o que já está ligado a esta OS da assistência ou, sem isso, o mais novo.
    - Caso novo, **`sem_rma`**: achou a nossa OS, mas o envio ainda não foi registrado. O e-mail fica ligado à OS (`ref_tipo = 'os'`), e a ficha da OS ganha um evento pedindo para registrar o envio.
  - `processarOS`:
    - não troca a situação da assistência por um e-mail mais velho que o último status (`situacao_em`);
    - não sobrescreve a OS da assistência já ligada, a não ser no botão "É a OS";
    - **não cria rascunho** de orçamento quando a OS já está aprovada ou finalizada na assistência.
  - Ação nova **`{acao:"reler_pendentes"}`**, só servidor: relê, do mais velho ao mais novo, os e-mails dos últimos 60 dias que ainda não estão ligados. É para rodar no pg_cron a cada 15 minutos.
  - `relerEmail()`: uma releitura só, usada pelo "É a OS" e pelo `reler_pendentes`. Não mexe no vínculo de boleto ou NF.
- **`js/emails.js`** (`?v=20261125a`):
  - etiqueta "(envio não registrado)" e aviso para registrar o envio na OS;
  - o orçamento ignorado aparece com o motivo;
  - as **imagens que vêm como anexo** (`Mlogo.jpg`, `cid:`) passam a abrir por link assinado de 1 hora.

## Validação
- `tests/intelcamp-vinculo.cjs` (novo) roda o código da própria função, com os tipos removidos pelo `stripTypeScriptTypes` do Node. Cobre:
  - o Terceiros com número e vazio;
  - um orçamento do SHOficina;
  - a série contida;
  - os dois RMAs da mesma OS.
- `tests/intelcamp-email.cjs`: o caso `sem_rma`, o orçamento ignorado e as imagens anexas.
- `node tests/rodar-todos.cjs`: 43/43.
- Simulação com os dados de hoje (não aplicada): pelo Terceiros, os e-mails das T941, T938, T939 e T942 passam a achar a OS. Pela série contida, os da T937 também. A T944 (OS 102338) aparece como `sem_rma`, porque o envio ainda não foi registrado.
- Sem revisão do Codex (não está instalado neste PC).

## Para ativar (depende do Vinícius)
1. Publicar a função `email-entrada` com esta versão (`verify_jwt` false, como já é).
2. Criar o cron:
   `select cron.schedule('emails-reler-pendentes', '8-59/15 * * * *', $$select net.http_post(url := 'https://qeacyyccxgytqrwmddyl.supabase.co/functions/v1/email-entrada', headers := jsonb_build_object('Content-Type','application/json','x-sync-secret',(select valor from privado.segredos where chave='sync')), body := '{"acao":"reler_pendentes"}'::jsonb, timeout_milliseconds := 120000)$$);`
3. Na primeira rodada, os e-mails antigos são relidos. Isso pode criar **rascunhos** de orçamento nas OS ainda não aprovadas. Ninguém recebe nada: a loja confere e envia.

## Para o Codex
"Nº OS Terceiros" no SHOficina é o número da nossa OS. Ele é a chave mais confiável, e a série vem depois.
