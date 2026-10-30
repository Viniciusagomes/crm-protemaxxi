# Regras comuns + testes automáticos no GitHub — 29/10/2026 (Claude)

## O que mudou

- `AGENTS.md`: regras únicas para Codex e Claude (fluxo de branch/PR, nota, testes, revisão cruzada, regras técnicas
  e de negócio). `CLAUDE.md` só importa o `AGENTS.md` e diz como o Claude chama o Codex.
- `tests/globais.cjs`: para cada página `.html`, compila cada `js/` (erro de sintaxe) e depois carrega todos num mesmo
  contexto `vm` vazio, na ordem do HTML, como o navegador. A colisão aparece na criação dos nomes globais, antes de
  qualquer linha rodar; depois o código para no primeiro acesso a `document`/`fetch`/etc., que não existem ali.
- `tests/rodar-todos.cjs`: roda todos os `tests/*.cjs`, cada um no seu processo.
- `.github/workflows/testes.yml`: roda o item acima em todo PR e em todo push na `main` (Node 22). Não faz deploy.
- `.assetsignore`: o site servia **`/.git/`**, `/docs/`, `/tests/` e `/supabase/migrations/` (conferido com
  `curl` em portalprotemaxxi.com.br: 200 em `.git/config`, `.git/HEAD`, nas notas e nas migrations).
  O repositório já é público no GitHub e não há segredo no histórico (varredura por chaves/tokens), então não houve
  vazamento além do que o GitHub já mostra; mesmo assim essas pastas não são do site e agora ficam fora da publicação.

## Validação

- `node tests/rodar-todos.cjs`: 5/5 (4 testes existentes + `globais.cjs`). 6 páginas, 38 scripts.
- `globais.cjs` testado com páginas temporárias: `const`/`let` repetido e função em bloco + `let` de mesmo nome
  falham apontando o arquivo; `function` repetida (o navegador aceita), `'use strict'` só no primeiro arquivo,
  `'use strict'` sem `;`, diretiva dupla e `src='...'`/`src = "..."` passam corretamente. Arquivos temporários apagados.

## Revisão do Codex

1. A primeira versão concatenava os scripts: deixava passar função em bloco + `let` e podia espalhar o
   `'use strict'` de um arquivo para os outros. Trocado pelo carregamento em contexto compartilhado (acima).
2. `src` com aspas simples ou espaços em volta do `=` era ignorado. A leitura do HTML agora aceita esses formatos
   e pula `type="module"` (escopo próprio).
3. A segunda versão inseria um `throw` no começo de cada script, o que quebrava com diretivas sem `;` ou com
   `'use strict'` depois de outra diretiva. Trocado por rodar o script original num contexto vazio, com tempo-limite.

## Depois do merge

- O `.assetsignore` só pode ser conferido depois do merge: `curl https://portalprotemaxxi.com.br/.git/config` deve dar 404.

## Para o Codex

- A partir daqui, ler o `AGENTS.md` antes de começar. Mudanças nas regras entram por PR.
- `tests/comercial-lote-1.sql` não roda no CI (precisa do banco); continua sendo rodado à mão.
- Teste novo em `tests/*.cjs` entra no CI sozinho, sem configurar nada.
