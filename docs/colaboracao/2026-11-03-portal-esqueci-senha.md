# Portal do fornecedor: "Esqueci a senha" pelo Resend

## O que mudou

- **Edge Function nova `forn-senha`** (pública, `verify_jwt` desligado): recebe o e-mail e, só se for o login de um fornecedor ativo,
  gera o link de recuperação (`auth.admin.generateLink`) e manda pelo Resend (`compras@<domínio do remetente da assistência>`).
- O link leva o `hashed_token` no fragmento (`fornecedor#rec=`); a página troca por sessão com `verifyOtp({ token_hash, type: 'recovery' })`.
  Assim não depende do e-mail do Supabase Auth (que só entrega para a equipe do projeto) nem da lista de redirecionamento.
- Resposta sempre igual e enviada antes do trabalho (`EdgeRuntime.waitUntil`): nem o conteúdo nem o tempo revelam quem é cadastrado.
- Um pedido a cada 5 min por fornecedor, reservado num único UPDATE em `fornecedores.senha_pedida_em` (migration nova).
- `js/fornecedor.js`: botão chama a função; troca pendente fica no `sessionStorage` para sobreviver a recarregar a página.

## Como foi validado

- `node tests/rodar-todos.cjs` (o `tests/portal-cadastro.cjs` ganhou as checagens da nova senha).
- Revisão do Codex em duas rodadas: a 1ª apontou concorrência no limite, enumeração por tempo e perda da troca ao recarregar; a 2ª confirmou as correções.

## Ao publicar

Publicado em 03/11/2026: migration `20261103125601_portal_fornecedor_senha`, `forn-senha` v1 (`verify_jwt` desligado). Teste com o endereço de teste do Resend
(`delivered@resend.dev`), apagando o fornecedor e o login de teste no fim.
