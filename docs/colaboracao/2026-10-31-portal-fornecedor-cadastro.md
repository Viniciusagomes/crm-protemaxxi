# Portal do fornecedor: convite com CNPJ e cadastro com login

## O que mudou

- **Convite:** nasce com o CNPJ (obrigatório, dígitos conferidos na tela e no banco). Só um link vale por CNPJ, e uso único com bloqueio no consumo. CNPJ já cadastrado é recusado.
- **Cadastro** (`fornecedor.html?c=`): e-mail de login, senha, CNPJ travado, razão social, telefone, WhatsApp, nome do contato (opcional) e endereço.
- **Edge Function nova `forn-cadastro`** (sem JWT, autorizada pelo convite): cria o login e chama `forn_cadastrar(p_convite, p, p_user)`, só para service role. O CNPJ vem do convite. Se falhar, apaga o login criado (3 tentativas).
- **Login:** e-mail e senha, com "Esqueci a senha". Sai o link mágico. Fornecedor com login não entra mais pelo token; o link de cotação dele é `?o=<id>`.
- **Sem login:** fornecedor cadastrado direto pela equipe segue com o link de token.
- **RLS:** `campanhas_venda` era legível por qualquer usuário logado; agora exige `eu()`. Mudança restringe, não amplia.

## Como foi validado

- `node tests/rodar-todos.cjs` e `tests/portal-cadastro.cjs` (novo).
- Regras principais da migration executadas no banco em transação revertida: CNPJ inválido, derrubada do convite anterior, uso único, CNPJ repetido, token recusado para quem tem login, login reconhecido.
- Usuário logado sem pessoa, simulado em todas as tabelas e views de `public`: só `campanhas_venda` aparecia.
- Edge Functions: leitura por busca das guardas em `crm-protemaxxi/supabase/functions`, não uma auditoria linha a linha.
- Não testado de ponta a ponta: exige migration aplicada e função publicada.

## Revisão do Codex

- Corrigidos: enumeração de e-mail (validação antes de criar o login e convite vence na 5ª tentativa), convites simultâneos (bloqueio por CNPJ), login órfão (repetição da exclusão).
- Mantido de propósito: `cnpj not null` sem preenchimento; a tabela está vazia e a migration deve parar se houver convite antigo.
- Limite conhecido: se as 3 exclusões falharem, o login órfão fica só no log e precisa de limpeza manual.
- Estas correções não passaram por nova rodada.

## Ao publicar

Conferir `forn_convites` vazia, aplicar a migration, publicar `forn-cadastro` com `verify_jwt` desligado e testar o "Esqueci a senha": a URL do portal precisa estar na lista de redirecionamento do Supabase Auth.

## Fora desta entrega

Segmentos, leitura de catálogos e sugestão de fornecedores por segmento: a lista de segmentos aguarda a conferência do Vinícius.
