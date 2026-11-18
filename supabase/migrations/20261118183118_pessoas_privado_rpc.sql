-- Pessoas (18/11): e-mail e permissões deixam de ser lidos direto da tabela por qualquer colaborador.
-- Esta função entrega só o que cada um pode ver:
--   e-mail: o próprio e o dono vê todos;
--   permissões: as próprias, as da equipe (quem a pessoa supervisiona, direto ou indireto) e o dono vê todas;
--   dos demais colegas, só a marca "atendimento" (a tela do WhatsApp lista para quem dá para transferir a conversa).
create or replace function public.pessoas_privado()
returns table (id text, email text, permissoes jsonb)
language sql stable security definer set search_path = public as $$
  select p.id,
    case when public.eh_dono() or (p.user_id is not null and p.user_id = seg.uid()) then p.email end,
    case when p.id in (select seg.pessoas_visiveis()) then coalesce(p.permissoes, '{}'::jsonb)
         when coalesce((p.permissoes->>'atendimento')::boolean, false) then '{"atendimento": true}'::jsonb
         else '{}'::jsonb end
  from public.pessoas p
  where seg.eh_membro()
$$;
revoke all on function public.pessoas_privado() from public, anon;
grant execute on function public.pessoas_privado() to authenticated;
