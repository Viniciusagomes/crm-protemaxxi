-- Leads Campanhas: campanhas de venda com lista de contatos por vendedor, no Meu dia.
-- Só o dono cria campanhas; cada vendedor vê e registra os próprios contatos. Nada é enviado sozinho: o vendedor revisa e envia.

create table if not exists public.campanhas_venda (
  id bigserial primary key,
  nome text not null,
  mensagem text not null,          -- {ola} {vendedor} {produto} {quando}
  mensagem_recompra text,          -- quando o cliente já comprou o item da campanha
  ativa boolean not null default true,
  criado_por text not null default public.eu(),
  criado_em timestamptz not null default now()
);
create table if not exists public.campanha_contatos (
  id bigserial primary key,
  campanha_id bigint not null references public.campanhas_venda(id) on delete cascade,
  pessoa_id text,                  -- sem vendedor: fica só com o dono até ser distribuído
  cliente_chave text,
  cliente_nome text not null,
  cidade text, celular text, email text, produto text, compra_data date,
  ja_comprou boolean not null default false,
  pedido_numero text,
  resultado text check (resultado in ('respondeu','orcamento','comprou','sem_resposta','sem_interesse','numero_errado','pular')),
  resultado_em timestamptz,
  interacao_id bigint,
  criado_em timestamptz not null default now(),
  unique (campanha_id, pedido_numero)
);
create index if not exists campanha_contatos_pessoa on public.campanha_contatos (pessoa_id, resultado);

alter table public.campanhas_venda enable row level security;
alter table public.campanha_contatos enable row level security;
drop policy if exists campv_sel on public.campanhas_venda;
create policy campv_sel on public.campanhas_venda for select to authenticated using (true);
drop policy if exists campv_dono on public.campanhas_venda;
create policy campv_dono on public.campanhas_venda for all to authenticated using (public.eh_dono()) with check (public.eh_dono());
drop policy if exists campc_sel on public.campanha_contatos;
create policy campc_sel on public.campanha_contatos for select to authenticated
  using (public.eh_dono() or pessoa_id = seg.minha_pessoa() or pessoa_id in (select seg.pessoas_visiveis()));
drop policy if exists campc_ins on public.campanha_contatos;
create policy campc_ins on public.campanha_contatos for insert to authenticated with check (public.eh_dono());
drop policy if exists campc_upd on public.campanha_contatos;
create policy campc_upd on public.campanha_contatos for update to authenticated
  using (public.eh_dono() or pessoa_id = seg.minha_pessoa() or pessoa_id in (select seg.pessoas_visiveis()))
  with check (public.eh_dono() or pessoa_id = seg.minha_pessoa() or pessoa_id in (select seg.pessoas_visiveis()));
revoke all on public.campanhas_venda, public.campanha_contatos from anon;
revoke insert, update, delete, truncate on public.campanha_contatos from authenticated;
grant select, insert, update, delete on public.campanhas_venda to authenticated;
grant select, insert on public.campanha_contatos to authenticated;
grant update (resultado, resultado_em, interacao_id) on public.campanha_contatos to authenticated;
grant usage on sequence public.campanhas_venda_id_seq, public.campanha_contatos_id_seq to authenticated;

/** Registra o resultado do contato (mesmas regras da prospecção): vira histórico do cliente, e a campanha diária respeita o limite de 30 dias. */
create or replace function public.campanha_registrar(p_id bigint, p_resultado text, p_esperado text)
returns jsonb language plpgsql set search_path = '' as $$
declare x public.campanha_contatos; i public.interacoes; ator text := public.eu(); retorno date; nome text; f text;
begin
  if ator is null then raise exception 'Sessão inválida'; end if;
  if p_resultado is not null and p_resultado not in ('respondeu','orcamento','comprou','sem_resposta','sem_interesse','numero_errado','pular') then
    raise exception 'Resultado inválido';
  end if;
  select * into x from public.campanha_contatos where id = p_id for update;
  if not found then raise exception 'Contato não encontrado ou sem permissão'; end if;
  if x.resultado is not distinct from p_resultado then return jsonb_build_object('contato', to_jsonb(x)); end if;
  if x.resultado is distinct from p_esperado then raise exception 'Este contato mudou. Atualize antes de registrar novamente.'; end if;
  if x.interacao_id is not null then update public.interacoes set feito = true where id = x.interacao_id; end if;
  f := seg.fone_norm(x.celular);
  if x.cliente_chave is not null and f is not null and (x.resultado = 'numero_errado' or p_resultado = 'numero_errado') then
    perform public.telefone_errado(x.cliente_chave, f, p_resultado = 'numero_errado', p_resultado = 'numero_errado');
  end if;
  if p_resultado is not null and p_resultado <> 'pular' and x.cliente_chave is not null then
    select c.nome into nome from public.campanhas_venda c where c.id = x.campanha_id;
    retorno := case p_resultado when 'orcamento' then public.dia_util((now() at time zone 'America/Sao_Paulo')::date + 2)
                                when 'sem_resposta' then public.dia_util((now() at time zone 'America/Sao_Paulo')::date + 3) end;
    insert into public.interacoes (cliente_chave, cliente_nome, autor_id, tipo, texto, proximo_contato)
    values (x.cliente_chave, x.cliente_nome, ator, 'whatsapp', 'Campanha (' || nome || '): ' || p_resultado || '.', retorno)
    returning * into i;
  end if;
  update public.campanha_contatos set resultado = p_resultado, resultado_em = case when p_resultado is not null then now() end, interacao_id = i.id
   where id = x.id returning * into x;
  return jsonb_build_object('contato', to_jsonb(x), 'interacao', case when i.id is not null then to_jsonb(i) end);
end $$;
revoke execute on function public.campanha_registrar(bigint, text, text) from public, anon;
grant execute on function public.campanha_registrar(bigint, text, text) to authenticated;
