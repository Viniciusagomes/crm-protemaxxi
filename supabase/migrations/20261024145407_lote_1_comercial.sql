-- Lote 1 aprovado: histórico preservado, contatos atômicos e fechamento com confirmação.
alter table public.prospeccao add column interacao_id bigint references public.interacoes(id) on delete set null;
create index prospeccao_interacao_id_idx on public.prospeccao(interacao_id) where interacao_id is not null;
alter table public.atividades add column arquivada_em timestamptz;
alter table public.atividades add column arquivada_motivo text;
alter table public.atividades add column revisada_em timestamptz;
alter table public.avaliacoes add column preparado_em timestamptz;

-- Abertura do WhatsApp continua pendente até confirmação explícita do operador.
-- A coluna separada mantém os emissores de e-mail existentes compatíveis.

create or replace function public.prospeccao_registrar(p_id bigint, p_resultado text, p_esperado text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare x public.prospeccao; i public.interacoes; ator text := public.eu(); retorno date;
begin
  if ator is null then raise exception 'Sessão inválida'; end if;
  if p_resultado is not null and p_resultado not in ('respondeu','orcamento','comprou','sem_resposta','sem_interesse','numero_errado','pular') then
    raise exception 'Resultado inválido';
  end if;
  select * into x from public.prospeccao where id=p_id for update;
  if not found then raise exception 'Contato não encontrado ou sem permissão'; end if;
  -- Repetição da mesma requisição não duplica histórico nem retorno.
  if x.resultado is not distinct from p_resultado then
    select * into i from public.interacoes where id=x.interacao_id;
    return jsonb_build_object('prospeccao',to_jsonb(x),'interacao',case when i.id is not null then to_jsonb(i) end);
  end if;
  if x.resultado is distinct from p_esperado then raise exception 'Este contato mudou. Atualize a campanha antes de registrar novamente.'; end if;
  if x.interacao_id is not null then
    -- Cancela somente o retorno anterior, mantendo a anotação histórica.
    update public.interacoes set feito=true where id=x.interacao_id;
    if not found then raise exception 'Sem permissão para ajustar o retorno anterior. Peça ao autor ou diretor para revisar.'; end if;
  end if;
  if p_resultado is not null and p_resultado <> 'pular' then
    retorno := case p_resultado when 'orcamento' then (now() at time zone 'America/Sao_Paulo')::date+2
                                    when 'sem_resposta' then (now() at time zone 'America/Sao_Paulo')::date+3 end;
    insert into public.interacoes(cliente_chave,cliente_nome,autor_id,tipo,texto,proximo_contato)
    values(x.cliente_chave,x.cliente_nome,ator,'whatsapp','Prospecção ('||x.lista||'): '||p_resultado||'. '||coalesce(x.motivo,''),retorno)
    returning * into i;
  end if;
  update public.prospeccao set resultado=p_resultado,resultado_em=case when p_resultado is not null then now() end,interacao_id=i.id
    where id=x.id returning * into x;
  return jsonb_build_object('prospeccao',to_jsonb(x),'interacao',case when i.id is not null then to_jsonb(i) end);
end $$;
revoke all on function public.prospeccao_registrar(bigint,text,text) from public,anon;
grant execute on function public.prospeccao_registrar(bigint,text,text) to authenticated;

create or replace function public.atividade_concluir(p_id bigint,p_resultado text,p_proxima_data date default null,p_proxima_tipo text default 'followup',p_proxima_titulo text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a public.atividades; prox public.atividades; i public.interacoes; n public.negocios; ator text:=public.eu();
begin
  if ator is null then raise exception 'Sessão inválida'; end if;
  -- Mesma ordem de locks do fechamento: negócio, depois atividade.
  select g.* into n from public.negocios g join public.atividades t on t.negocio_id=g.id where t.id=p_id for update of g;
  select * into a from public.atividades where id=p_id for update;
  if not found or a.arquivada_em is not null then raise exception 'Atividade indisponível'; end if;
  if a.negocio_id is not null and n.id is null then raise exception 'Negócio indisponível'; end if;
  if a.feito then return jsonb_build_object('atividade',to_jsonb(a)); end if;
  if p_proxima_data is not null then
    if p_proxima_data < (now() at time zone 'America/Sao_Paulo')::date or nullif(trim(p_proxima_titulo),'') is null then
      raise exception 'Informe o próximo passo e uma data de hoje em diante';
    end if;
    if n.etapa in ('ganho','perdido') then raise exception 'Negócio encerrado. Revise a necessidade de uma nova atividade.'; end if;
    insert into public.atividades(negocio_id,cliente_chave,cliente_nome,pessoa_id,tipo,titulo,quando,criado_por)
    values(a.negocio_id,a.cliente_chave,a.cliente_nome,a.pessoa_id,p_proxima_tipo,trim(p_proxima_titulo),p_proxima_data,ator) returning * into prox;
  end if;
  if a.cliente_chave is not null then
    insert into public.interacoes(cliente_chave,cliente_nome,autor_id,tipo,texto)
    values(a.cliente_chave,a.cliente_nome,ator,case a.tipo when 'whatsapp' then 'whatsapp' when 'ligar' then 'ligacao' when 'visita' then 'visita' else 'nota' end,
      a.titulo||case when nullif(trim(p_resultado),'') is not null then ' → '||trim(p_resultado) else '' end) returning * into i;
  end if;
  update public.atividades set feito=true,feito_em=now(),resultado=nullif(trim(p_resultado),'') where id=a.id returning * into a;
  return jsonb_build_object('atividade',to_jsonb(a),'proxima',case when prox.id is not null then to_jsonb(prox) end,'interacao',case when i.id is not null then to_jsonb(i) end);
end $$;
revoke all on function public.atividade_concluir(bigint,text,date,text,text) from public,anon;
grant execute on function public.atividade_concluir(bigint,text,date,text,text) to authenticated;

-- Apenas cobranças automáticas sem finalidade após fechamento saem da rotina.
-- Pós-venda, tarefas gerais e histórico concluído permanecem intactos.
create or replace function seg.crm_arquivar_cobrancas() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.etapa in ('ganho','perdido') then
    update public.atividades set arquivada_em=now(),arquivada_motivo='Cobrança automática de negócio encerrado'
    where negocio_id=new.id and not feito and arquivada_em is null and tipo='followup' and automatica like 'cobrar:%';
  end if;
  return new;
end $$;
revoke all on function seg.crm_arquivar_cobrancas() from public,anon,authenticated;
create trigger crm_arquivar_cobrancas after update of etapa on public.negocios
for each row when (old.etapa is distinct from new.etapa) execute function seg.crm_arquivar_cobrancas();
update public.atividades a set arquivada_em=now(),arquivada_motivo='Cobrança automática de negócio encerrado'
from public.negocios n where n.id=a.negocio_id and n.etapa in ('ganho','perdido')
and not a.feito and a.arquivada_em is null and a.tipo='followup' and a.automatica like 'cobrar:%';

-- Uma cobrança gerada ao mesmo tempo que um fechamento também deve ser arquivada.
create function seg.crm_conferir_cobranca() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare fase text;
begin
  if new.negocio_id is not null and new.tipo='followup' and new.automatica like 'cobrar:%' and not new.feito then
    select etapa into fase from public.negocios where id=new.negocio_id for update;
    if fase in ('ganho','perdido') then
      new.arquivada_em=coalesce(new.arquivada_em,now());
      new.arquivada_motivo='Cobrança automática de negócio encerrado';
    end if;
  end if;
  return new;
end $$;
revoke all on function seg.crm_conferir_cobranca() from public,anon,authenticated;
create trigger crm_conferir_cobranca before insert on public.atividades
for each row execute function seg.crm_conferir_cobranca();

-- Compras posteriores e sobreposição de produtos são indícios para revisão humana.
-- O sincronizador continua reconhecendo a conclusão explícita do orçamento no Tiny.
create or replace function public.crm_ganhos() returns integer
language sql security invoker set search_path = '' as $$ select 0 $$;

create view public.v_crm_revisoes with (security_invoker=true) as
select n.id as negocio_id,
  greatest(coalesce(n.orcamento_data,n.criado_em::date),coalesce(n.mov_em::date,n.criado_em::date)) < (now() at time zone 'America/Sao_Paulo')::date-15 as inativo,
  coalesce(p.numeros,'') as pedidos_conferir,
  exists(select 1 from public.negocios b where b.cliente_chave=n.cliente_chave and b.id<>n.id
    and b.etapa not in ('ganho','perdido') and b.orcamento_id is not null and n.orcamento_id is not null
    and exists(select 1 from public.negocio_itens x join public.negocio_itens y on y.produto_id=x.produto_id and y.negocio_id=b.id where x.negocio_id=n.id)) as proposta_semelhante
from public.negocios n
left join lateral (select string_agg(q.numero::text,', ' order by q.data,q.id) as numeros from (
  select p.id,p.numero,p.data from public.pedidos p where p.cliente_chave=n.cliente_chave
  and p.data>=coalesce(n.orcamento_data,n.criado_em::date) and p.data<=(now() at time zone 'America/Sao_Paulo')::date
  and p.numero_ecommerce is null and coalesce(p.situacao,'') !~* 'cancel' order by p.data desc,p.id desc limit 10
) q) p on true where n.etapa not in ('ganho','perdido');
revoke all on public.v_crm_revisoes from public,anon;
grant select on public.v_crm_revisoes to authenticated,service_role;

create or replace function public.crm_limpeza(p_dias integer default 15) returns jsonb
language sql security invoker set search_path = '' as $$
select jsonb_build_object('repetidas',0,'sem_movimento',0,'em_risco',count(*))
from public.negocios n where n.etapa not in ('ganho','perdido')
and greatest(coalesce(n.orcamento_data,n.criado_em::date),coalesce(n.mov_em::date,n.criado_em::date))
  < (now() at time zone 'America/Sao_Paulo')::date-greatest(coalesce(p_dias,15),1)
$$;
-- As permissões service_role-only das duas funções existentes são preservadas.
-- A carteira mede exatamente a janela móvel de 12 meses. Primeira compra segue histórica.
create or replace view public.v_clientes with (security_invoker=true) as
 WITH base AS (
         SELECT pedidos.cliente_chave,
            pedidos.vendedor_id,
            pedidos.data,
            pedidos.valor,
            pedidos.situacao
           FROM pedidos
          WHERE coalesce(pedidos.situacao,'') !~* 'cancel' AND pedidos.cliente_chave IS NOT NULL
          AND pedidos.data >= ((now() at time zone 'America/Sao_Paulo')::date - interval '12 months')::date
          AND pedidos.data <= (now() at time zone 'America/Sao_Paulo')::date
        ), vend AS (
         SELECT DISTINCT ON (x.cliente_chave) x.cliente_chave,
            x.vendedor_id
           FROM ( SELECT base.cliente_chave,
                    base.vendedor_id,
                    count(*) AS n,
                    max(base.data) AS u
                   FROM base
                  GROUP BY base.cliente_chave, base.vendedor_id) x
          ORDER BY x.cliente_chave, x.n DESC, x.u DESC
        )
 SELECT c.chave,
    c.nome,
    c.doc,
    c.tipo_pessoa,
    c.cidade,
    c.uf,
    COALESCE(tc.telefone, tf.telefone, NULLIF(c.celular, ''::text), NULLIF(c.fone, ''::text)) AS fone,
    NULLIF(c.email, ''::text) AS email,
    sum(b.valor) AS total,
    count(*) AS pedidos,
    (select min(p.data) from public.pedidos p where p.cliente_chave=c.chave and coalesce(p.situacao,'') !~* 'cancel' and p.data <= (now() at time zone 'America/Sao_Paulo')::date) AS primeira,
    max(b.data) AS ultima,
    count(DISTINCT to_char(b.data::timestamp with time zone, 'YYYY-MM'::text)) AS meses,
    (now() at time zone 'America/Sao_Paulo')::date - max(b.data) AS dias_sem_comprar,
    v.vendedor_id,
    c.tipo_cliente,
    c.nao_contatar,
    c.obs,
    c.bairro,
    tf.telefone,
    tc.telefone AS celular
   FROM clientes c
     JOIN base b ON b.cliente_chave = c.chave
     LEFT JOIN vend v ON v.cliente_chave = c.chave
     LEFT JOIN LATERAL ( SELECT t.telefone
           FROM cliente_telefones t
          WHERE t.cliente_chave = c.chave AND t.celular
          ORDER BY t.validado_em DESC NULLS LAST, (t.origem = 'manual'::text) DESC, t.criado_em DESC
         LIMIT 1) tc ON true
     LEFT JOIN LATERAL ( SELECT t.telefone
           FROM cliente_telefones t
          WHERE t.cliente_chave = c.chave AND NOT t.celular
          ORDER BY (t.origem = 'manual'::text) DESC, t.criado_em DESC
         LIMIT 1) tf ON true
  GROUP BY c.chave, c.nome, c.doc, c.tipo_pessoa, c.cidade, c.uf, c.fone, c.celular, c.email, tc.telefone, tf.telefone, v.vendedor_id, c.tipo_cliente, c.nao_contatar, c.obs, c.bairro;

CREATE OR REPLACE FUNCTION public.crm_automacoes(p_data date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare cfg jsonb; n int := 0; k int;
begin
  select valor into cfg from public.config where chave = 'crm';
  -- pós-venda: pedido da loja de 7 dias atrás, acima do mínimo, para o vendedor do pedido
  insert into public.atividades (pessoa_id, cliente_chave, cliente_nome, tipo, titulo, quando, automatica)
  select pe.id, p.cliente_chave, p.cliente_nome, 'posvenda',
         'Pós-venda do pedido ' || p.numero || ' (R$ ' || round(p.valor) || '): chegou tudo? Precisa de instalação ou algo mais?', p_data, 'posvenda:' || p.id
    from public.pedidos p join public.pessoas pe on pe.tiny_vendedor_id = p.vendedor_id and pe.ativo
   where p.data = p_data - coalesce((cfg->>'posvenda_dias')::int, 7) and p.numero_ecommerce is null
     and p.valor >= coalesce((cfg->>'posvenda_minimo')::numeric, 500) and coalesce(p.situacao, '') !~* 'cancel'
  on conflict do nothing;
  get diagnostics k = row_count; n := n + k;
  -- orçamento parado: negócio na etapa orçamento sem atividade aberta há X dias
  insert into public.atividades (negocio_id, pessoa_id, cliente_chave, cliente_nome, tipo, titulo, quando, automatica)
  select g.id, g.pessoa_id, g.cliente_chave, g.cliente_nome, 'followup',
         'Retomar conversa sobre o orçamento ' || coalesce(g.orcamento_numero, '') || ' (R$ ' || round(g.valor) || ')', p_data, 'cobrar:' || g.id || ':' || p_data
    from public.negocios g
   where g.etapa in ('orcamento', 'negociacao') and g.pessoa_id is not null
     and g.etapa_em::date <= p_data - coalesce((cfg->>'dias_cobrar_orcamento')::int, 2)
     and not exists (select 1 from public.atividades a where a.negocio_id = g.id and not a.feito and a.arquivada_em is null)
  on conflict do nothing;
  get diagnostics k = row_count; n := n + k;
  return n;
end $function$;

