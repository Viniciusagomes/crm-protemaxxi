-- Compras: excluir o cadastro de um fornecedor (botão na ficha do fornecedor).
-- Só quem cuida de compras; só se ele ainda não enviou proposta (com histórico, o caminho é "Bloqueado").
-- Leva junto os convites de cadastro dele, os convites em oportunidades, os rascunhos de proposta e o login do portal.

-- O vínculo com o login (user_id) só muda pelas funções do banco (cadastro por convite), nunca pela tela:
-- senão daria para mover o login de um fornecedor com histórico para um cadastro vazio e apagá-lo junto.
create function seg.forn_login_fixo() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and (
       (tg_op = 'INSERT' and new.user_id is not null) or (tg_op = 'UPDATE' and new.user_id is distinct from old.user_id)) then
    raise exception 'O login do fornecedor não pode ser alterado por aqui.';
  end if;
  return new;
end $$;
revoke execute on function seg.forn_login_fixo() from anon, public;
create trigger forn_login_fixo before insert or update on public.fornecedores for each row execute function seg.forn_login_fixo();

create function public.compras_excluir_fornecedor(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f fornecedores; n int;
begin
  if not public.pode_compras() then raise exception 'sem permissão'; end if;
  select * into f from fornecedores where id = p_id for update;   -- proposta nova espera (a FK trava o fornecedor)
  if f.id is null then raise exception 'Fornecedor não encontrado.'; end if;
  perform 1 from propostas where fornecedor_id = p_id for update;   -- rascunho sendo enviado agora: espera e conta certo
  select count(*) into n from propostas where fornecedor_id = p_id and status <> 'rascunho';
  if n > 0 then raise exception 'Este fornecedor já enviou % proposta(s). Para tirar do portal sem perder o histórico, mude a situação para Bloqueado.', n; end if;
  delete from forn_convites where fornecedor_id = p_id;
  delete from fornecedores where id = p_id;   -- op_fornecedores e propostas (rascunhos) saem em cascata
  -- o login só sai se for de fornecedor: nunca apaga o acesso de alguém da equipe
  if f.user_id is not null and not exists (select 1 from pessoas where user_id = f.user_id) then
    delete from auth.users where id = f.user_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.compras_excluir_fornecedor(bigint) from anon, public;
grant execute on function public.compras_excluir_fornecedor(bigint) to authenticated;
