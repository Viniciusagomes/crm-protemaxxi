-- Lote 3, entrega B: pedido ligado ao negócio por confirmação, vários pedidos por negócio, saldo, cancelamento e histórico.
-- Um pedido vai para um negócio só (dividir um pedido entre projetos fica para quando aparecer um caso real).

create table if not exists public.negocio_pedidos (
  id bigserial primary key,
  negocio_id bigint not null references public.negocios(id) on delete cascade,
  pedido_id text not null references public.pedidos(id) on delete cascade,
  vinculado_por text not null, vinculado_em timestamptz not null default now(),
  desfeito_por text, desfeito_em timestamptz, motivo_desfazer text
);
create unique index if not exists negocio_pedidos_ativo_uk on public.negocio_pedidos (pedido_id) where desfeito_em is null;
create index if not exists negocio_pedidos_negocio on public.negocio_pedidos (negocio_id);
alter table public.negocio_pedidos enable row level security;
-- leitura: quem enxerga o negócio e o pedido; escrita só pelas funções abaixo (histórico não se apaga)
drop policy if exists negped_sel on public.negocio_pedidos;
create policy negped_sel on public.negocio_pedidos for select to authenticated
  using (exists (select 1 from public.negocios n where n.id = negocio_id) and exists (select 1 from public.pedidos p where p.id = pedido_id));
revoke all on public.negocio_pedidos from anon;
revoke insert, update, delete, truncate on public.negocio_pedidos from authenticated;
grant select on public.negocio_pedidos to authenticated;

/** Quem pode mexer no negócio: dono, o vendedor dele ou quem o enxerga pela hierarquia (mesma regra da RLS). */
create or replace function seg.pode_mexer_negocio(p_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.negocios n where n.id = p_id
                   and (public.eh_dono() or n.pessoa_id = seg.minha_pessoa() or n.pessoa_id in (select seg.pessoas_visiveis())))
$$;
revoke execute on function seg.pode_mexer_negocio(bigint) from public, anon;
grant execute on function seg.pode_mexer_negocio(bigint) to authenticated;

/** Liga um pedido ao negócio, por confirmação do vendedor. O pedido precisa ser do mesmo cliente (ou de um cadastro
 *  conferido como "mesmo cliente"), não estar cancelado e não estar ligado a outro negócio. Não muda a etapa. */
create or replace function public.negocio_pedido_ligar(p_negocio bigint, p_pedido text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ator text := seg.minha_pessoa(); n public.negocios; p public.pedidos; v public.negocio_pedidos; outro bigint;
begin
  if ator is null then raise exception 'Sessão inválida'; end if;
  if not seg.pode_mexer_negocio(p_negocio) then raise exception 'Negócio não encontrado ou sem permissão.'; end if;
  select * into n from public.negocios where id = p_negocio for update;
  select * into p from public.pedidos where id = p_pedido;
  if p.id is null or not seg.pode_ver_pedido(p.vendedor_id, p.numero_ecommerce) then raise exception 'Pedido não encontrado ou sem permissão.'; end if;
  if n.etapa = 'perdido' then raise exception 'Negócio perdido: reabra antes de ligar um pedido.'; end if;
  if coalesce(p.situacao, '') ~* 'cancel' then raise exception 'Pedido cancelado não entra na venda.'; end if;
  if p.cliente_chave is distinct from n.cliente_chave and not exists (
       select 1 from public.cliente_pares c where c.status = 'mesmo'
          and c.a = least(p.cliente_chave, n.cliente_chave) and c.b = greatest(p.cliente_chave, n.cliente_chave)) then
    raise exception 'O pedido é de outro cliente. Se for o mesmo cliente com dois cadastros, confira em Cadastros parecidos.';
  end if;
  -- repetição do mesmo pedido: devolve o vínculo existente
  select * into v from public.negocio_pedidos where pedido_id = p.id and desfeito_em is null;
  if found then
    if v.negocio_id = n.id then return jsonb_build_object('vinculo', to_jsonb(v), 'repetido', true); end if;
    raise exception 'Este pedido já está ligado a outro negócio (%). Desfaça lá antes.', v.negocio_id;
  end if;
  insert into public.negocio_pedidos (negocio_id, pedido_id, vinculado_por) values (n.id, p.id, ator) returning * into v;
  update public.negocios set mov_em = now(), pedido_numero = coalesce(pedido_numero, p.numero) where id = n.id;
  return jsonb_build_object('vinculo', to_jsonb(v), 'repetido', false);
end $$;
revoke execute on function public.negocio_pedido_ligar(bigint, text) from public, anon;
grant execute on function public.negocio_pedido_ligar(bigint, text) to authenticated;

/** Desfaz um vínculo com motivo. O registro fica guardado (quem ligou, quem desfez, por quê). */
create or replace function public.negocio_pedido_desfazer(p_vinculo bigint, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ator text := seg.minha_pessoa(); v public.negocio_pedidos; m text := left(trim(coalesce(p_motivo, '')), 300);
begin
  if ator is null then raise exception 'Sessão inválida'; end if;
  if m = '' then raise exception 'Diga o motivo.'; end if;
  select * into v from public.negocio_pedidos where id = p_vinculo for update;
  if not found or not seg.pode_mexer_negocio(v.negocio_id) then raise exception 'Vínculo não encontrado ou sem permissão.'; end if;
  if v.desfeito_em is not null then return jsonb_build_object('vinculo', to_jsonb(v), 'repetido', true); end if;
  update public.negocio_pedidos set desfeito_por = ator, desfeito_em = now(), motivo_desfazer = m where id = v.id returning * into v;
  update public.negocios set mov_em = now() where id = v.negocio_id;
  return jsonb_build_object('vinculo', to_jsonb(v), 'repetido', false);
end $$;
revoke execute on function public.negocio_pedido_desfazer(bigint, text) from public, anon;
grant execute on function public.negocio_pedido_desfazer(bigint, text) to authenticated;

-- negocio_pedidos não aceita escrita direta; a junção (que roda com as permissões de quem chama) usa este ajudante.
create or replace function seg.mover_pedidos_negocio(p_de bigint, p_para bigint) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not (seg.pode_mexer_negocio(p_de) and seg.pode_mexer_negocio(p_para)) then raise exception 'Sem permissão nos dois negócios.'; end if;
  update public.negocio_pedidos set negocio_id = p_para where negocio_id = p_de and desfeito_em is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function seg.mover_pedidos_negocio(bigint, bigint) from public, anon;
grant execute on function seg.mover_pedidos_negocio(bigint, bigint) to authenticated;

-- negocio_juntar (lote 2B) passa a levar os pedidos ligados junto com as atividades.
create or replace function public.negocio_juntar(p_tiny bigint, p_prospeccao_negocio bigint)
returns jsonb language plpgsql set search_path = '' as $$
declare t public.negocios; p public.negocios; ator text := public.eu(); pid bigint;
begin
  if ator is null then raise exception 'Sessão inválida'; end if;
  -- trava os dois na ordem do id (evita deadlock entre juntadas simultâneas)
  perform 1 from public.negocios where id in (p_tiny, p_prospeccao_negocio) order by id for update;
  select * into t from public.negocios where id = p_tiny;
  select * into p from public.negocios where id = p_prospeccao_negocio;
  if t.id is null or p.id is null then raise exception 'Negócio não encontrado ou sem permissão.'; end if;
  -- repetição do mesmo pedido
  if p.juntado_a = t.id then return jsonb_build_object('negocio', to_jsonb(t), 'juntado', to_jsonb(p), 'repetido', true); end if;
  if t.cliente_chave is distinct from p.cliente_chave then raise exception 'Os negócios são de clientes diferentes.'; end if;
  if t.orcamento_id is null or t.prospeccao_id is not null then raise exception 'O primeiro negócio precisa ser o do orçamento do Tiny, sem campanha ligada.'; end if;
  if p.prospeccao_id is null or p.orcamento_id is not null then raise exception 'O segundo negócio precisa ser o da prospecção, sem orçamento.'; end if;
  if t.etapa in ('ganho', 'perdido') or p.etapa in ('ganho', 'perdido') then raise exception 'Um dos negócios já foi encerrado.'; end if;
  pid := p.prospeccao_id;
  -- atividades primeiro: o encerramento do negócio da prospecção não deve arquivar o que continua valendo
  update public.atividades set negocio_id = t.id where negocio_id = p.id;
  -- pedidos ligados também passam (lote 3B): a venda continua contando no negócio que fica
  perform seg.mover_pedidos_negocio(p.id, t.id);
  update public.negocios set prospeccao_id = null, etapa = 'perdido', juntado_a = t.id,
    motivo_perda = 'Juntado ao orçamento ' || coalesce(t.orcamento_numero, '') where id = p.id
  returning * into p;
  if not found then raise exception 'Sem permissão para alterar o negócio da prospecção.'; end if;
  update public.negocios set prospeccao_id = pid, origem = 'prospeccao', previsao = coalesce(t.previsao, p.previsao),
    obs = nullif(concat_ws(E'\n', t.obs, 'Da prospecção: ' || p.titulo, p.obs), ''), mov_em = now()
   where id = t.id returning * into t;
  if not found then raise exception 'Sem permissão para alterar o negócio do orçamento.'; end if;
  return jsonb_build_object('negocio', to_jsonb(t), 'juntado', to_jsonb(p), 'repetido', false);
end $$;
revoke execute on function public.negocio_juntar(bigint, bigint) from public, anon;
grant execute on function public.negocio_juntar(bigint, bigint) to authenticated;


/** Venda de cada negócio: soma dos pedidos ligados que não foram cancelados, pedidos cancelados (divergência) e saldo. */
create or replace view public.v_negocio_vendas with (security_invoker = true) as
select v.negocio_id,
       count(*) filter (where coalesce(p.situacao, '') !~* 'cancel') as pedidos,
       coalesce(sum(p.valor) filter (where coalesce(p.situacao, '') !~* 'cancel'), 0) as vendido,
       count(*) filter (where coalesce(p.situacao, '') ~* 'cancel') as cancelados,
       coalesce(sum(p.valor) filter (where coalesce(p.situacao, '') ~* 'cancel'), 0) as valor_cancelado
  from public.negocio_pedidos v join public.pedidos p on p.id = v.pedido_id
 where v.desfeito_em is null
 group by v.negocio_id;
grant select on public.v_negocio_vendas to authenticated;

-- "Conferir compra" (lote 1) deixa de listar o pedido que já foi ligado a algum negócio.
do $$
declare def text := pg_get_viewdef('public.v_crm_revisoes'::regclass); novo text;
begin
  novo := replace(def, $a$(COALESCE(p_1.situacao, ''::text) !~* 'cancel'::text))$a$,
    $b$(COALESCE(p_1.situacao, ''::text) !~* 'cancel'::text) AND (NOT (EXISTS ( SELECT 1 FROM negocio_pedidos v WHERE ((v.pedido_id = p_1.id) AND (v.desfeito_em IS NULL))))))$b$);
  if novo = def then raise exception 'v_crm_revisoes mudou desde a revisão; ajuste a migration'; end if;
  execute 'create or replace view public.v_crm_revisoes with (security_invoker = true) as ' || novo;
end $$;
