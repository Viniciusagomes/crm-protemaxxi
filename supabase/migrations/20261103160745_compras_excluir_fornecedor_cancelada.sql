-- Excluir fornecedor: proposta enviada em oportunidade cancelada não impede mais a exclusão
-- (oportunidade cancelada não tem decisão de compra a preservar; serve para limpar testes).
create or replace function public.compras_excluir_fornecedor(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f fornecedores; n int;
begin
  if not public.pode_compras() then raise exception 'sem permissão'; end if;
  select * into f from fornecedores where id = p_id for update;   -- proposta nova espera (a FK trava o fornecedor)
  if f.id is null then raise exception 'Fornecedor não encontrado.'; end if;
  perform 1 from propostas where fornecedor_id = p_id for update;   -- rascunho sendo enviado agora: espera e conta certo
  select count(*) into n from propostas pr join oportunidades o on o.id = pr.oportunidade_id
   where pr.fornecedor_id = p_id and pr.status <> 'rascunho' and o.status <> 'cancelada';
  if n > 0 then raise exception 'Este fornecedor já enviou % proposta(s). Para tirar do portal sem perder o histórico, mude a situação para Bloqueado.', n; end if;
  delete from forn_convites where fornecedor_id = p_id;
  delete from fornecedores where id = p_id;   -- op_fornecedores e propostas saem em cascata
  -- o login só sai se for de fornecedor: nunca apaga o acesso de alguém da equipe
  if f.user_id is not null and not exists (select 1 from pessoas where user_id = f.user_id) then
    delete from auth.users where id = f.user_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;
