-- Pessoas (18/11), passo 2: e-mail e permissões deixam de ser legíveis direto na tabela.
-- A tela lê só as colunas abaixo e pega e-mail/permissões por public.pessoas_privado() (cada um vê o que pode).
-- Escrita não muda: continua só o dono (RLS pessoas_dono); as funções SECURITY DEFINER e a chave de serviço não são afetadas.
revoke select on public.pessoas from anon, authenticated;
grant select (id, nome, cargo, papel, supervisor_id, vinculo, dias, ativo, inicio, cor, tiny_vendedor_id, user_id, ordem, criado_em)
  on public.pessoas to authenticated;
