-- Lote 2, entrega A: regras de contato do cliente e números marcados como errados.
-- Número errado não é apagado: fica marcado, some do cadastro em uso (v_clientes) e o cliente sai da campanha
-- até alguém incluir um número novo ou confirmar que o número estava certo.

alter table public.cliente_telefones
  add column if not exists errado_em timestamptz,
  add column if not exists errado_por text;

-- A marca de errado só entra pela função telefone_errado (que confere o acesso ao cliente), nunca pelo insert direto.
drop policy if exists clitel_ins on public.cliente_telefones;
create policy clitel_ins on public.cliente_telefones for insert to authenticated
  with check (seg.eh_membro() and origem = 'manual' and por = seg.minha_pessoa() and telefone = seg.fone_norm(telefone)
              and errado_em is null and errado_por is null);

/** O número (em qualquer formato) está marcado como errado para este cliente? */
create or replace function seg.fone_errado(p_chave text, p_fone text) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.cliente_telefones e
                  where e.cliente_chave = p_chave and e.errado_em is not null and e.telefone = seg.fone_norm(p_fone))
$$;

alter table public.clientes
  add column if not exists contato_pausa_ate date,
  add column if not exists contato_canal text,
  add column if not exists contato_motivo text;
alter table public.clientes drop constraint if exists clientes_contato_canal_chk;
alter table public.clientes add constraint clientes_contato_canal_chk
  check (contato_canal is null or contato_canal in ('whatsapp', 'ligacao', 'email', 'visita'));

-- v_clientes: mesmas colunas de antes + regras de contato; números marcados como errados ficam de fora.
create or replace view public.v_clientes with (security_invoker = true) as
 WITH base AS (
         SELECT pedidos.cliente_chave, pedidos.vendedor_id, pedidos.data, pedidos.valor, pedidos.situacao
           FROM public.pedidos
          WHERE COALESCE(pedidos.situacao, ''::text) !~* 'cancel'::text AND pedidos.cliente_chave IS NOT NULL
            AND pedidos.data >= (((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date - '1 year'::interval)::date
            AND pedidos.data <= ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date
        ), vend AS (
         SELECT DISTINCT ON (x.cliente_chave) x.cliente_chave, x.vendedor_id
           FROM ( SELECT base.cliente_chave, base.vendedor_id, count(*) AS n, max(base.data) AS u
                   FROM base GROUP BY base.cliente_chave, base.vendedor_id) x
          ORDER BY x.cliente_chave, x.n DESC, x.u DESC
        )
 SELECT c.chave, c.nome, c.doc, c.tipo_pessoa, c.cidade, c.uf,
    COALESCE(tc.telefone, tf.telefone,
      CASE WHEN NOT seg.fone_errado(c.chave, c.celular) THEN NULLIF(c.celular, ''::text) END,
      CASE WHEN NOT seg.fone_errado(c.chave, c.fone) THEN NULLIF(c.fone, ''::text) END) AS fone,
    NULLIF(c.email, ''::text) AS email,
    sum(b.valor) AS total, count(*) AS pedidos,
    ( SELECT min(p.data) FROM public.pedidos p
          WHERE p.cliente_chave = c.chave AND COALESCE(p.situacao, ''::text) !~* 'cancel'::text
            AND p.data <= ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date) AS primeira,
    max(b.data) AS ultima,
    count(DISTINCT to_char(b.data::timestamp with time zone, 'YYYY-MM'::text)) AS meses,
    ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date - max(b.data) AS dias_sem_comprar,
    v.vendedor_id, c.tipo_cliente, c.nao_contatar, c.obs, c.bairro,
    tf.telefone, tc.telefone AS celular,
    c.contato_pausa_ate, c.contato_canal, c.contato_motivo
   FROM public.clientes c
     JOIN base b ON b.cliente_chave = c.chave
     LEFT JOIN vend v ON v.cliente_chave = c.chave
     LEFT JOIN LATERAL ( SELECT t.telefone FROM public.cliente_telefones t
          WHERE t.cliente_chave = c.chave AND t.celular AND t.errado_em IS NULL
          ORDER BY t.validado_em DESC NULLS LAST, (t.origem = 'manual'::text) DESC, t.criado_em DESC LIMIT 1) tc ON true
     LEFT JOIN LATERAL ( SELECT t.telefone FROM public.cliente_telefones t
          WHERE t.cliente_chave = c.chave AND NOT t.celular AND t.errado_em IS NULL
          ORDER BY (t.origem = 'manual'::text) DESC, t.criado_em DESC LIMIT 1) tf ON true
  GROUP BY c.chave, c.nome, c.doc, c.tipo_pessoa, c.cidade, c.uf, c.fone, c.celular, c.email, tc.telefone, tf.telefone,
           v.vendedor_id, c.tipo_cliente, c.nao_contatar, c.obs, c.bairro, c.contato_pausa_ate, c.contato_canal, c.contato_motivo;

-- Quem pode mexer no cliente: a mesma regra do cliente_marcar, ou quem tem o cliente na própria campanha.
create or replace function seg.pode_mexer_cliente(p_chave text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_dono() or seg.minha_permissao('vendas_todas')
    or exists (select 1 from public.pedidos p where p.cliente_chave = p_chave and seg.pode_ver_pedido(p.vendedor_id, p.numero_ecommerce))
    or exists (select 1 from public.prospeccao x where x.cliente_chave = p_chave and x.pessoa_id = seg.minha_pessoa())
$$;
revoke execute on function seg.pode_mexer_cliente(text) from public, anon;
grant execute on function seg.pode_mexer_cliente(text) to authenticated;

/** Marca (ou desmarca) um número como errado. Desmarcar com p_confirmar = alguém confirmou que o número está certo
 *  (passa na frente dos outros); sem confirmar = só desfaz um registro feito por engano. */
create or replace function public.telefone_errado(p_chave text, p_telefone text, p_errado boolean, p_confirmar boolean default true)
returns text language plpgsql security definer set search_path = '' as $$
declare f text := seg.fone_norm(p_telefone); ator text := seg.minha_pessoa();
begin
  if ator is null then raise exception 'Sessão inválida'; end if;
  if not seg.pode_mexer_cliente(p_chave) then raise exception 'Sem acesso a este cliente.'; end if;
  if f is null then raise exception 'Número inválido.'; end if;
  if p_errado then
    insert into public.cliente_telefones (telefone, cliente_chave, celular, origem, por, errado_em, errado_por)
    values (f, p_chave, length(f) = 13, 'manual', ator, now(), ator)
    on conflict (telefone, cliente_chave) do update set errado_em = coalesce(public.cliente_telefones.errado_em, now()),
      errado_por = coalesce(public.cliente_telefones.errado_por, ator);
  else
    update public.cliente_telefones set errado_em = null, errado_por = null,
      validado_em = case when p_confirmar then now() else validado_em end
     where cliente_chave = p_chave and telefone = f;
  end if;
  return f;
end $$;
revoke execute on function public.telefone_errado(text, text, boolean, boolean) from public, anon;
grant execute on function public.telefone_errado(text, text, boolean, boolean) to authenticated;

/** Regras de contato do cliente: não contatar, pausa até uma data, canal preferido e motivo. */
create or replace function public.contato_regras(p_chave text, p_nao_contatar boolean, p_pausa_ate date, p_canal text, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if seg.minha_pessoa() is null then raise exception 'Sessão inválida'; end if;
  if not seg.pode_mexer_cliente(p_chave) then raise exception 'Sem acesso a este cliente.'; end if;
  if p_canal is not null and p_canal not in ('', 'whatsapp', 'ligacao', 'email', 'visita') then raise exception 'Canal inválido.'; end if;
  if p_pausa_ate is not null and p_pausa_ate < (now() at time zone 'America/Sao_Paulo')::date then raise exception 'A pausa precisa terminar hoje ou depois.'; end if;
  update public.clientes set nao_contatar = coalesce(p_nao_contatar, nao_contatar), contato_pausa_ate = p_pausa_ate,
    contato_canal = nullif(p_canal, ''), contato_motivo = nullif(left(trim(coalesce(p_motivo, '')), 300), '')
   where chave = p_chave;
  if not found then raise exception 'Cliente não encontrado.'; end if;
end $$;
revoke execute on function public.contato_regras(text, boolean, date, text, text) from public, anon;
grant execute on function public.contato_regras(text, boolean, date, text, text) to authenticated;

-- prospeccao_registrar: "número errado" marca o número que estava na tela; trocar o resultado desfaz a marca.
drop function if exists public.prospeccao_registrar(bigint, text, text);
create or replace function public.prospeccao_registrar(p_id bigint, p_resultado text, p_esperado text, p_fone text default null)
 returns jsonb language plpgsql set search_path to '' as $function$
declare x public.prospeccao; i public.interacoes; ator text := public.eu(); retorno date; f text;
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
  -- Saiu de "número errado": o número volta a valer (foi engano no registro).
  if x.resultado = 'numero_errado' and x.dados ? 'fone_errado' then
    perform public.telefone_errado(x.cliente_chave, x.dados->>'fone_errado', false, false);
    x.dados := x.dados - 'fone_errado';
  end if;
  if p_resultado = 'numero_errado' then
    f := coalesce(seg.fone_norm(p_fone), (select seg.fone_norm(v.fone) from public.v_clientes v where v.chave = x.cliente_chave));
    if f is not null then
      perform public.telefone_errado(x.cliente_chave, f, true);
      x.dados := coalesce(x.dados, '{}'::jsonb) || jsonb_build_object('fone_errado', f);
    end if;
  end if;
  if p_resultado is not null and p_resultado <> 'pular' then
    retorno := case p_resultado when 'orcamento' then (now() at time zone 'America/Sao_Paulo')::date+2
                                    when 'sem_resposta' then (now() at time zone 'America/Sao_Paulo')::date+3 end;
    insert into public.interacoes(cliente_chave,cliente_nome,autor_id,tipo,texto,proximo_contato)
    values(x.cliente_chave,x.cliente_nome,ator,'whatsapp','Prospecção ('||x.lista||'): '||p_resultado||'. '||coalesce(x.motivo,''),retorno)
    returning * into i;
  end if;
  update public.prospeccao set resultado=p_resultado,resultado_em=case when p_resultado is not null then now() end,interacao_id=i.id,dados=x.dados
    where id=x.id returning * into x;
  return jsonb_build_object('prospeccao',to_jsonb(x),'interacao',case when i.id is not null then to_jsonb(i) end);
end $function$;
revoke execute on function public.prospeccao_registrar(bigint, text, text, text) from public, anon;
grant execute on function public.prospeccao_registrar(bigint, text, text, text) to authenticated;

-- Botão "+" das atividades: não oferece número marcado como errado.
create or replace function public.contato_atividade(p_atividade bigint)
 returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with a as (
    select a.*, g.cliente_tiny_id, coalesce(a.cliente_chave, g.cliente_chave) chave, coalesce(a.cliente_nome, g.cliente_nome) nome
      from atividades a left join negocios g on g.id = a.negocio_id
     where a.id = p_atividade and (public.eh_dono() or a.pessoa_id in (select seg.pessoas_visiveis())))
  select jsonb_build_object(
    'nome', a.nome,
    -- primeiro o celular que a agenda usa (incluído/confirmado na Intranet), depois os do Tiny
    'celular', (select x from unnest(array[(select ct.telefone from cliente_telefones ct where ct.cliente_chave = a.chave and ct.celular and ct.errado_em is null
                    order by ct.validado_em desc nulls last, (ct.origem = 'manual') desc, ct.criado_em desc limit 1),
                  nullif(c.celular, ''), nullif(t.fone, ''), nullif(c.fone, ''),
                  (select nullif(k.fone, '') from contatos_tiny k where k.doc = c.doc and k.doc is not null and k.fone <> '' limit 1)]) with ordinality u(x, o)
                 where x is not null and not seg.fone_errado(a.chave, x) order by o limit 1),
    'fone', case when not seg.fone_errado(a.chave, c.fone) then nullif(c.fone, '') end,
    'email', coalesce(nullif(t.email, ''), nullif(c.email, ''), (select nullif(k.email, '') from contatos_tiny k where k.doc = c.doc and k.doc is not null and k.email <> '' limit 1)),
    'cidade', coalesce(t.cidade, c.cidade), 'uf', coalesce(t.uf, c.uf), 'doc', coalesce(t.doc, c.doc), 'chave', a.chave)
  from a left join contatos_tiny t on t.id = a.cliente_tiny_id left join clientes c on c.chave = a.chave
$function$;

-- Números já registrados como errados na prospecção (90 dias): marca o número que o cliente tem hoje no cadastro,
-- só quando nenhum número foi incluído ou confirmado depois do registro (senão pode ser justamente a correção).
with alvo as (
  select distinct on (x.cliente_chave) x.id, x.cliente_chave, seg.fone_norm(v.fone) f, x.pessoa_id, x.resultado_em
    from public.prospeccao x join public.v_clientes v on v.chave = x.cliente_chave
   where x.resultado = 'numero_errado' and x.data > (now() at time zone 'America/Sao_Paulo')::date - 90
     and seg.fone_norm(v.fone) is not null and x.resultado_em is not null
     and not exists (select 1 from public.cliente_telefones t where t.cliente_chave = x.cliente_chave
                      and (t.criado_em > x.resultado_em or t.validado_em > x.resultado_em))
   order by x.cliente_chave, x.resultado_em desc nulls last
), marca as (
  insert into public.cliente_telefones (telefone, cliente_chave, celular, origem, por, errado_em, errado_por)
  select f, cliente_chave, length(f) = 13, 'manual', pessoa_id, coalesce(resultado_em, now()), pessoa_id from alvo
  on conflict (telefone, cliente_chave) do update set errado_em = coalesce(public.cliente_telefones.errado_em, excluded.errado_em),
    errado_por = coalesce(public.cliente_telefones.errado_por, excluded.errado_por)
  returning cliente_chave
)
update public.prospeccao x set dados = coalesce(x.dados, '{}'::jsonb) || jsonb_build_object('fone_errado', a.f)
  from alvo a where x.id = a.id;

-- prospeccao_gerar: duas trocas pontuais no texto da função publicada (o resto fica igual).
--  1) respeita a pausa de contato e não escolhe cliente cujo(s) número(s) estão todos marcados como errados;
--  2) "número errado" deixa de bloquear por 90 dias fixos: o bloqueio dura até o número ser corrigido (regra 1).
do $$
declare def text := pg_get_functiondef('public.prospeccao_gerar(date)'::regprocedure); novo text;
begin
  novo := replace(def, $a$and not c.nao_contatar$a$,
    $b$and not c.nao_contatar
       and (c.contato_pausa_ate is null or c.contato_pausa_ate < p_data)
       and (not exists (select 1 from public.cliente_telefones e where e.cliente_chave = c.chave and e.errado_em is not null)
            or exists (select 1 from public.cliente_telefones t where t.cliente_chave = c.chave and t.errado_em is null))$b$);
  novo := replace(novo, $a$(x.resultado in ('sem_interesse', 'numero_errado') and x.data > p_data - 90)$a$,
    $b$(x.resultado = 'sem_interesse' and x.data > p_data - 90)$b$);
  novo := replace(novo, $a$ou "sem interesse/número errado" nos últimos 90$a$, $b$ou "sem interesse" nos últimos 90 (número errado: até corrigir)$b$);
  if novo = def or position('contato_pausa_ate' in novo) = 0 or position($c$'numero_errado'$c$ in novo) > 0 then
    raise exception 'prospeccao_gerar mudou desde a revisão; ajuste a migration';
  end if;
  execute novo;
end $$;
