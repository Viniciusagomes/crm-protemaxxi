# Intranet Protemaxxi — regras para quem mexe no código

Vale para o **Codex** e para o **Claude** (o `CLAUDE.md` só aponta para cá). Se uma regra mudar, mude aqui, num PR.

## O que é

Site estático (HTML + JS puro, sem build) servido pela Cloudflare em portalprotemaxxi.com.br, com dados no
Supabase (projeto `qeacyyccxgytqrwmddyl`: Postgres com RLS + Edge Functions). Integra Tiny, Mercado Livre, e-mails da
assistência (Intelcamp), Google Ads e a rotina da equipe.

- `index.html` (Intranet), `os.html` (OS pública), `avaliar.html`, `fornecedor.html`, `privacidade.html`, `termos.html`.
- `js/` — scripts clássicos carregados em ordem pelo HTML. **Todos dividem o mesmo escopo global.**
- `css/`, `img/`, `sw.js` (service worker: rede primeiro, cache só de reserva).
- `supabase/migrations/` — cópia das migrations aplicadas; `supabase/functions/` — cópia das Edge Functions.
- `tests/*.cjs` — testes em Node (estilo `vm`); `docs/colaboracao/` — notas de passagem entre os agentes.

## Quem faz o quê

- **Vinícius** é o dono. Ele revisa e faz o **merge**. Merge na `main` = deploy automático no site.
- **Codex** trabalha em branches `codex/...`; **Claude** em `claude/...`. Nunca commitar direto na `main`.
- Os dois podem estar mexendo ao mesmo tempo: `git fetch` + atualizar a branch antes de começar, e ler as notas novas
  em `docs/colaboracao/` antes de alterar a mesma área. Preserve o que a outra parte pediu ali.

## Fluxo de toda entrega

1. Branch nova a partir da `main` atualizada.
2. Mudança + teste em `tests/` quando der para testar a lógica (siga o estilo `vm` dos testes que já existem).
3. `node tests/rodar-todos.cjs` passando (o GitHub roda o mesmo em todo PR).
4. **Mudança grande** (Edge Function, migration, regra de negócio, vários arquivos, algo que mexe em dado real):
   pedir revisão do outro agente antes de entregar, corrigir o que proceder e registrar na nota.
5. Nota em `docs/colaboracao/AAAA-MM-DD-<assunto>.md`: o que mudou, como foi validado, o que ficou de fora,
   e um trecho "Para o Codex"/"Para o Claude" quando houver recado.
6. PR com descrição clara. O Vinícius faz o merge.

## Regras técnicas

- **Nomes globais:** `const`/`let`/`class` repetido entre dois `js/*.js` derruba o script e a tela fica em branco.
  Antes de criar um nome no topo do arquivo, procure se ele já existe. `tests/globais.cjs` barra isso no CI.
- **Cache:** ao mudar um `js/` ou `css/`, suba o `?v=AAAAMMDDx` desse arquivo em todas as páginas que o carregam.
- **Migrations:** salvar em `supabase/migrations/<versão_remota>_<nome>.sql` com a mesma versão aplicada no banco.
  Funções novas: `SECURITY INVOKER` quando possível, `search_path` fixo, sem `execute` para `anon/PUBLIC`.
  Não ampliar políticas de RLS sem dizer na nota.
- **Edge Functions:** a cópia em `supabase/functions/<nome>/` tem que ficar igual à versão publicada.
  Chamadas internas usam o header `x-sync-secret`; o segredo fica no banco, nunca no código.
- **Segredos:** nada de chave, token ou senha no repositório (o repositório é público). A `anonKey` do `js/config.js`
  é pública por natureza; a proteção dos dados é a RLS.
- **Publicação:** o `.assetsignore` impede que `.git`, `docs`, `tests`, `supabase` e estes arquivos de regra
  sejam servidos no site. Pasta nova que não seja do site entra nessa lista.
- Interface e textos em português do Brasil, curtos e sem jargão.

## Regras do negócio (não mudar sem o Vinícius pedir)

- Orçamento que nasce de e-mail da assistência fica **sempre como rascunho**; só uma pessoa envia ao cliente.
- Nada de mandar e-mail/WhatsApp para cliente automaticamente sem pedido explícito.
- Nota fiscal: a conferência barra o que estiver fora da regra; não "corrigir" CFOP/tributação no código sem
  confirmação (na dúvida, o contador decide). Dentro de SP são aceitos 5102 e 5405 (ICMS-ST).
- Google Ads: alterações só pela fila de aprovação (`gads_acoes`).
- Teste com dado real: desfazer tudo ao terminar (transação revertida ou limpeza), sem deixar registro de teste.
- Nunca pedir senha ou chave pelo chat; login em serviços é sempre o Vinícius quem faz.
