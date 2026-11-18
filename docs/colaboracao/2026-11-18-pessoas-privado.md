# Pessoas: e-mail e permissões fechados (18/11)

Pendência baixa do pentest: qualquer colaborador logado lia o e-mail de login e as permissões de todos direto da tabela
`pessoas`. Pedido do Vinícius: fechar.

## O que muda
- **Banco** (migration `20261118183118_pessoas_privado_rpc`, já aplicada): função `pessoas_privado()` (`SECURITY DEFINER`,
  sem `anon`) que devolve `id, email, permissoes` só com o que cada um pode ver:
  - e-mail: o próprio; o dono vê todos;
  - permissões: as próprias e as da equipe (`seg.pessoas_visiveis`); o dono vê todas;
  - dos demais colegas, só `{"atendimento": true}`. A tela do WhatsApp usa isso para listar para quem dá para transferir.
- **Tela**:
  - `carregarTudo` lê da tabela só as colunas da tela (`PESSOAS_COLS`) e junta o resto com a função (`juntarPrivado`);
  - "Logins e acessos" recarrega o e-mail pela função;
  - salvar pessoa trocou o `upsert` por `update ... select('id')` e, se não houver linha, `insert`. O upsert lê de volta as colunas que ele grava, e as permissões vão deixar de ser legíveis.

## Passo 2: depois do merge (fecha as colunas)
Só pode ser aplicado depois que a tela nova estiver no ar. Antes disso, a tela antiga (`select('*')`) para de carregar.
```sql
revoke select on public.pessoas from anon, authenticated;
grant select (id,nome,cargo,papel,supervisor_id,vinculo,dias,ativo,inicio,cor,tiny_vendedor_id,user_id,ordem,criado_em) on public.pessoas to authenticated;
```
O arquivo da migration entra num PR pequeno logo depois, com a versão em que for aplicada.

## Validação
- `tests/pessoas-privado.cjs`:
  - nenhuma leitura de `pessoas` com `*`, `email` ou `permissoes`;
  - nenhum upsert em `pessoas`;
  - junção e conteúdo da migration.
- `tests/email-access.cjs` ganhou o `rpc` no cliente falso. 39/39.
- No banco, simulando cada login (dono, Marcos, Pedro, Felipe Menezes, Fefão):
  - cada um vê só o próprio e-mail, e o dono vê 9 de 12 (3 sem login);
  - as permissões ficam só nas próprias e nas da equipe.
- Passo 2 simulado numa transação desfeita:
  - o Pedro fica **bloqueado** ao ler `email`/`permissoes`, mas lê as colunas da tela;
  - o elogio a colega funciona (a política lê `pessoas.ativo`);
  - o Pedro não consegue alterar pessoa;
  - o dono salva (`update ... returning id`), cria e apaga pessoa normalmente.
- Edge Functions conferidas: nenhuma lê `email`/`permissoes` com o login do usuário (usam RPC `SECURITY DEFINER` ou a chave de serviço).

## Passo 2 aplicado (18/11)
- Migration `20261118184807_pessoas_colunas_fechadas`, aplicada depois que a tela nova (#63) entrou no ar.
- Conferido no site como dono:
  - `select('id,email')` e `select('*')` em `pessoas` agora dão "permission denied";
  - a tela carrega as 12 pessoas e os 9 e-mails pela função;
  - salvar pessoa (update + `select('id')`) funciona.
- **Para quem mexer depois:** não use `select('*')` nem `upsert` em `pessoas`. Leia `PESSOAS_COLS` e use `pessoasComPrivado()` (o teste `pessoas-privado.cjs` barra isso).
