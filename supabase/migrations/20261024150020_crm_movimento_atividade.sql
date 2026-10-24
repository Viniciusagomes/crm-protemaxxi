-- Criar tarefa automática não é movimento humano; concluí-la é.
create or replace function seg.atividade_movimenta() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.negocio_id is not null and new.arquivada_em is null and
    ((tg_op='INSERT' and new.automatica is null) or
     (tg_op='UPDATE' and new.feito and not old.feito)) then
    update public.negocios set mov_em=now() where id=new.negocio_id;
  end if;
  return new;
end $$;
revoke all on function seg.atividade_movimenta() from public,anon,authenticated;
