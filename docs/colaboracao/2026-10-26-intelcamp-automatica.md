# Claude: e-mails da Intelcamp atualizam a OS sozinhos (orçamento sempre em rascunho)

Pedido do Vinícius (26/10): "Faz a atualização automática, mas o orçamento sempre fica como rascunho para eu conferir antes de ir ao cliente."

Li as passagens do Codex de 23 e 24/10 e preservei: Marcos sem arquivar e-mail (trigger + botão oculto), aba Arquivados,
carregamento de `D.config.caixa_emails` e os nomes novos das etapas da assistência.

## O que mudou

- Migration `20261026121109_intelcamp_automatica` (já aplicada): `at_rma.os_assistencia`, `situacao_assistencia`, `situacao_em`;
  `at_orcamentos.email_id` e `origem` (`manual` | `email`), com índice único (os_id, email_id).
- Função `email-entrada` v6 (cópia do código publicado em `supabase/functions/email-entrada/index.ts`). A caixa `os.intelbras@` lê o formato
  SHOficina da Intelcamp ("Orçamento Nº…" e "Notificação de status da OS …") e procura a OS com RMA aberto:
  1. OS da Intelcamp já ligada (`at_rma.os_assistencia`) ou nº de série igual (sem o "NS:" que a loja digita) → **certa**;
  2. série com 1 caractere diferente → **provável**: só registra evento interno na OS e pede confirmação no e-mail.
  Quando é certa: grava a OS deles e o status, avança a etapa (nunca volta; trigger `seg.at_rma_etapa` gera o evento público)
  e, se for orçamento, cria `at_orcamentos` com `status='rascunho'`, `origem='email'`, custo × `margem_orcamento`,
  validade = menor entre a config (7 dias) e a da Intelcamp. Não duplica se já existir orçamento com o mesmo custo.
  **Não envia nada ao cliente**: o envio continua pelo "✎ Editar e enviar" da ficha.
- `{acao:"reler", email_id, rma_id?}`: relê um e-mail. Aceita `x-sync-secret` ou o JWT do usuário que enxerga o e-mail (RLS) — é o que o
  botão "✓ É a OS …" usa nos casos prováveis.
- Web: `emLidoIntelcamp` e `emOsConfirmar` em `js/emails.js`; ação `emOsConfirmar` em `js/main.js`; ficha da OS mostra a OS deles e o último
  status do e-mail, e marca o orçamento "📧 do e-mail da assistência" (`js/os-orcamento.js`); faixa "Assistência hoje" mostra o status.
  Rascunho com validade vencida abre o formulário com validade nova. Versão `20261026a`.

## Resultado nos e-mails que já estavam na caixa

- 101201 (MHDX, R$ 390) → T923 certa: etapa "em análise", rascunho de R$ 624 (id 2).
- 101345 → T925 e 101346 → T927: prováveis (série digitada com 1 letra diferente: YQBH × YQ8H, UFPG × UFBG). Aguardam o botão.

## Validação

`node tests/intelcamp-email.cjs` (novo) e os testes existentes; checagem de nomes globais duplicados entre os scripts do `index.html`
(0) e `node --check` em `js/*.js`. O parser foi testado com o HTML real dos 3 e-mails e a função foi publicada e reprocessada em produção.

## Para o Codex

- Ao mexer na caixa de e-mails, manter `p.fonte === 'intelcamp'` em `emLido` e o botão de confirmação.
- As funções do Supabase não estavam no repositório; esta é a primeira. Se alterar `email-entrada`, publique a partir deste arquivo
  (o original continua em `crm-protemaxxi/supabase/functions/`, fora do repo — vou manter os dois iguais).
