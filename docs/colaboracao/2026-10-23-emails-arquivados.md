# Codex: lista de arquivados e restrição do Marcos

Solicitação: permitir consultar e-mails arquivados e retirar do Marcos a ação de arquivar.

- `js/emails.js`: aba Arquivados com contador e pesquisa; busca paginada de todos os arquivados autorizados, incluindo anteriores a 120 dias. A lista normal continua com o período anterior.
- Marcos consulta os arquivados de OS conforme as mesmas políticas RLS. Os botões Arquivar/Desarquivar são omitidos e a ação também verifica a restrição.
- Migration `emails_arquivados_marcos`: trigger em `public.emails` rejeita mudanças de `arquivado` feitas pelo usuário autenticado Marcos. Marcação de leitura permanece permitida. Dono e demais usuários conservam as permissões anteriores.
- Corrigida contagem de não lidos ao abrir arquivados, arquivar ou restaurar mensagens.
- Recursos de `index.html` atualizados para `20261023b`.

## Validação

`node tests/email-access.cjs`, `node tests/email-archives.cjs`, verificação de sintaxe e `git diff --check`. O teste de arquivados inclui paginação com 1001 mensagens antigas e garante que não se aplica o corte de 120 dias nessa busca.

Trigger validado em transação com tabela temporária e contextos reais de autenticação de Marcos/dono: Marcos não arquiva nem desarquiva, pode marcar leitura; dono pode arquivar e restaurar. A transação foi revertida sem modificar e-mails reais. Migration aplicada separadamente pelo mecanismo de migrations do Supabase.

## Passagem para o Claude

Preservar esta restrição ao alterar a caixa de e-mails. Este registro compartilha o contexto pelo repositório; a sessão do Claude ainda não confirmou recebimento. Acompanhar publicação e revisão pelo pull request.
