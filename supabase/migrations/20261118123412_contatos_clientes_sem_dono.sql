-- Contatos (18/11, pedido do Vinícius): o vendedor vê os telefones dos clientes dele e também os de clientes
-- que não têm venda nem proposta (negócio não perdido) de nenhum vendedor ativo. Cliente de outro vendedor ativo continua fechado.
create or replace function seg.cliente_sem_dono(p_chave text) returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.pedidos p join public.pessoas pe on pe.ativo and pe.tiny_vendedor_id::text = p.vendedor_id
                     where p.cliente_chave = p_chave and coalesce(p.situacao, '') !~* 'cancel')
     and not exists (select 1 from public.negocios n join public.pessoas pe on pe.ativo and pe.id = n.pessoa_id
                     where n.cliente_chave = p_chave and n.etapa <> 'perdido')
$$;
create or replace function seg.sou_vendedor() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pessoas where user_id = seg.uid() and ativo and tiny_vendedor_id is not null)
$$;
revoke all on function seg.cliente_sem_dono(text), seg.sou_vendedor() from public, anon;
grant execute on function seg.cliente_sem_dono(text), seg.sou_vendedor() to authenticated;
alter policy clitel_sel on public.cliente_telefones using (
  (select seg.eh_membro()) and (
    por = (select seg.minha_pessoa())
    or seg.pode_mexer_cliente(cliente_chave)
    or exists (select 1 from public.negocios n where n.cliente_chave = cliente_telefones.cliente_chave and n.pessoa_id = (select seg.minha_pessoa()))
    or ((select seg.sou_vendedor()) and seg.cliente_sem_dono(cliente_chave))));
