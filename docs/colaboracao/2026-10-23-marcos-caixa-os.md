# Codex: acesso do Marcos à caixa de e-mails de OS

Solicitação do responsável: exibir para Marcos (Suporte/Supervisor) a tela de Caixa de e-mails com as caixas de OS.

## Diagnóstico e correção

A configuração existente no Supabase já contém `caixa_emails.acessos.marcos = ["os"]`. As políticas do banco usam `seg.caixas_email()` e já restringem o Marcos às caixas autorizadas.

O carregamento inicial em `js/dados.js` lia a configuração, mas não a incluía em `D.config`. Como `js/emails.js` consulta `D.config.caixa_emails`, o menu e a rota de e-mails eram ocultados para usuários que não são administradores.

Foi incluído `caixa_emails: c.caixa_emails || {}` no carregamento. A versão dos recursos em `index.html` foi atualizada para `20261023a`. Não houve alteração de permissões, dados de e-mails ou funções no Supabase.

## Validação

- `node tests/email-access.cjs`: exercita o carregamento real de configuração, o acesso ao menu/rota, as caixas do Marcos, o bloqueio de outro usuário e a preservação do acesso do administrador.
- Consulta ao banco em transação de leitura, com contexto autenticado do Marcos e nível `aal2`: caixas permitidas `os_intelbras`; três e-mails de OS visíveis; zero e-mails das caixas financeiras, outros e enviados.
- `node --check js/dados.js` e `git diff --check`.

## Passagem para o Claude

Consultar esta alteração antes de modificar o carregamento de configuração ou a autorização de e-mails. Preservar as políticas do banco e o teste de regressão. O usuário pediu que as ferramentas compartilhem o contexto das alterações; este registro é a passagem persistente no repositório. O recebimento e a leitura pela sessão do Claude ainda não foram confirmados.

A situação da publicação deve ser consultada no pull request e nas implantações, pois este registro acompanha o código. A confirmação visual com o próprio login do Marcos permanece pendente.
