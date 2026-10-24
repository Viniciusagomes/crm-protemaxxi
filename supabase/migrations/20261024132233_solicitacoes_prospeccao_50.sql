-- Preserva outras opções da campanha; distribui as 50 vagas entre os perfis existentes.
update public.config
set valor = coalesce(valor, '{}'::jsonb) || '{"por_dia":50,"cotas":{"complemento":10,"recompra":12,"reativacao":15,"indicacao":5,"instalador":8}}'::jsonb
where chave='prospeccao';

CREATE OR REPLACE FUNCTION public.prospeccao_gerar(p_data date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v record; cfg jsonb; n int; total int := 0; eu text := seg.minha_pessoa(); dono boolean := public.eh_dono();
  lista_k text; cota int; meta int;
begin
  if auth.uid() is not null and eu is null then raise exception 'Sem acesso.'; end if;
  select valor into cfg from public.config where chave = 'prospeccao';
  cfg := coalesce(cfg, '{"por_dia": 50, "cotas": {}}');
  meta := greatest(1, least(coalesce((cfg->>'por_dia')::int, 50), 50));
  for v in select p.id, p.tiny_vendedor_id from public.pessoas p
            where p.ativo and p.tiny_vendedor_id is not null and p.papel in ('vendedor', 'supervisor')
              and (auth.uid() is null or dono or p.id = eu) loop
    if (select count(*) from public.prospeccao x where x.data = p_data and x.pessoa_id = v.id) >= meta then continue; end if;
    -- carteira do vendedor: clientes da loja (sem marketplace) cujo vendedor principal é ele
    create temp table if not exists _cart (chave text primary key, nome text, total numeric, pedidos int, meses int, ultima date, primeira date, fone text) on commit drop;
    truncate _cart;
    insert into _cart
    select b.cliente_chave, max(b.cliente_nome), sum(b.valor), count(*), count(distinct to_char(b.data, 'YYYY-MM')), max(b.data), min(b.data),
           max(coalesce(nullif(c.celular, ''), nullif(c.fone, '')))
      from public.pedidos b join public.clientes c on c.chave = b.cliente_chave
     where b.situacao is distinct from 'Cancelado' and b.numero_ecommerce is null and b.cliente_chave is not null and b.data > p_data - 365
       and not c.nao_contatar
       and (select x.vendedor_id from public.pedidos x where x.cliente_chave = b.cliente_chave and x.situacao is distinct from 'Cancelado'
            group by x.vendedor_id order by count(*) desc, max(x.data) desc limit 1) = v.tiny_vendedor_id
       -- não incomodar: abordado nos últimos 30 dias, ou "sem interesse/número errado" nos últimos 90
       and not exists (select 1 from public.prospeccao x where x.cliente_chave = b.cliente_chave
            and (x.data > p_data - 30 or (x.resultado in ('sem_interesse', 'numero_errado') and x.data > p_data - 90)))
       and not exists (select 1 from public.interacoes i where i.cliente_chave=b.cliente_chave
            and i.tipo in ('ligacao','whatsapp','visita','email')
            and i.criado_em >= (p_data - 30)::timestamp at time zone 'America/Sao_Paulo'
            and i.criado_em < (p_data + 1)::timestamp at time zone 'America/Sao_Paulo')
     group by b.cliente_chave;

    for lista_k, cota in select key, (value)::int from jsonb_each_text(coalesce(cfg->'cotas', '{}'))
                          order by array_position(array['complemento', 'recompra', 'reativacao', 'indicacao', 'instalador'], key) loop
      cota := least(greatest(cota - (select count(*) from public.prospeccao x where x.data=p_data and x.pessoa_id=v.id and x.lista=lista_k), 0),
                    greatest(meta - (select count(*) from public.prospeccao x where x.data=p_data and x.pessoa_id=v.id), 0));
      if cota <= 0 then continue; end if;
      if lista_k = 'complemento' then
        -- comprou gravador (DVR/NVR) nos últimos 120 dias e nunca comprou HD; ou central de alarme sem sensor
        insert into public.prospeccao (data, pessoa_id, cliente_chave, cliente_nome, lista, motivo, dados)
        select p_data, v.id, k.chave, k.nome, 'complemento', z.motivo, jsonb_build_object('produto', z.produto, 'sugestao', z.sugestao)
          from _cart k cross join lateral (
            select 'Comprou ' || i.descricao || ' e nunca comprou HD' motivo, i.descricao produto, 'HD para gravação' sugestao
              from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
             where p.cliente_chave = k.chave and p.data > p_data - 120 and i.descricao ~* '(\mdvr|\mnvr|mhdx|\mnvd|gravador digital)' and i.descricao !~* 'conversor'
               and not exists (select 1 from public.pedido_itens i2 join public.pedidos p2 on p2.id = i2.pedido_id
                               where p2.cliente_chave = k.chave and i2.descricao ~* '(\mhd\M|disco r[ií]gido|hdd|purple|skyhawk)')
            union all
            select 'Comprou ' || i.descricao || ' e nunca comprou sensores', i.descricao, 'sensores e baterias'
              from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
             where p.cliente_chave = k.chave and p.data > p_data - 120 and i.descricao ~* '(central de alarme|\mamt ?\d)'
               and not exists (select 1 from public.pedido_itens i2 join public.pedidos p2 on p2.id = i2.pedido_id
                               where p2.cliente_chave = k.chave and i2.descricao ~* '(sensor|\mivp|\mxas)')
            limit 1) z
         where not exists (select 1 from public.prospeccao x where x.data = p_data and x.cliente_chave = k.chave)
         order by (k.fone is not null) desc, k.total desc limit cota
        on conflict do nothing;
      elsif lista_k = 'recompra' then
        -- compra material de reposição (cabo, conector, fonte, bateria…) e a última foi há 40–150 dias
        insert into public.prospeccao (data, pessoa_id, cliente_chave, cliente_nome, lista, motivo, dados)
        select p_data, v.id, k.chave, k.nome, 'recompra', 'Costuma repor ' || z.itens || ' · última compra há ' || (p_data - z.ult) || ' dias',
               jsonb_build_object('itens', z.itens, 'dias', p_data - z.ult)
          from _cart k cross join lateral (
            select max(p.data) ult, count(distinct p.id) n,
                   string_agg(distinct lower(substring(i.descricao from '(?i)(cabo|conector|fonte|bateria|balun|abra[cç]adeira|caixa)')), ', ') itens
              from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
             where p.cliente_chave = k.chave and p.situacao is distinct from 'Cancelado' and i.descricao ~* '(cabo|conector|fonte|bateria|balun|abra[cç]adeira|caixa)') z
         where z.n >= 2 and z.ult between p_data - 150 and p_data - 40
           and not exists (select 1 from public.prospeccao x where x.data = p_data and x.cliente_chave = k.chave)
         order by (k.fone is not null) desc, k.total desc limit cota
        on conflict do nothing;
      elsif lista_k = 'reativacao' then
        insert into public.prospeccao (data, pessoa_id, cliente_chave, cliente_nome, lista, motivo, dados)
        select p_data, v.id, k.chave, k.nome, 'reativacao', 'Comprou em ' || k.meses || ' meses diferentes (R$ ' || round(k.total) || ') e está há ' || (p_data - k.ultima) || ' dias sem comprar',
               jsonb_build_object('dias', p_data - k.ultima, 'total', round(k.total))
          from _cart k
         where k.meses >= 2 and k.ultima between p_data - 365 and p_data - 90
           and not exists (select 1 from public.prospeccao x where x.data = p_data and x.cliente_chave = k.chave)
         order by (k.fone is not null) desc, k.total desc limit cota
        on conflict do nothing;
      elsif lista_k = 'indicacao' then
        insert into public.prospeccao (data, pessoa_id, cliente_chave, cliente_nome, lista, motivo, dados)
        select p_data, v.id, k.chave, k.nome, 'indicacao', 'Cliente forte (' || k.pedidos || ' pedidos, R$ ' || round(k.total) || ') com compra recente: pedir indicação',
               jsonb_build_object('pedidos', k.pedidos, 'total', round(k.total))
          from _cart k
         where k.pedidos >= 3 and k.ultima between p_data - 45 and p_data - 7
           and not exists (select 1 from public.prospeccao x where x.data = p_data and x.cliente_chave = k.chave)
         order by (k.fone is not null) desc, k.total desc limit cota
        on conflict do nothing;
      elsif lista_k = 'instalador' then
        insert into public.prospeccao (data, pessoa_id, cliente_chave, cliente_nome, lista, motivo, dados)
        select p_data, v.id, k.chave, k.nome, 'instalador', 'Instalador/revenda (' || k.pedidos || ' pedidos no ano): novidades e condição especial',
               jsonb_build_object('pedidos', k.pedidos)
          from _cart k join public.clientes c on c.chave = k.chave
         where (c.tipo_cliente in ('instalador', 'revenda') or k.pedidos >= 6) and k.ultima between p_data - 60 and p_data - 10
           and not exists (select 1 from public.prospeccao x where x.data = p_data and x.cliente_chave = k.chave)
         order by (k.fone is not null) desc, k.pedidos desc limit cota
        on conflict do nothing;
      end if;
    end loop;
    -- completa até o total do dia com reativação (a lista mais ampla)
    get diagnostics n = row_count;
    select count(*) into n from public.prospeccao where data = p_data and pessoa_id = v.id;
    if n < meta then
      insert into public.prospeccao (data, pessoa_id, cliente_chave, cliente_nome, lista, motivo, dados)
      select p_data, v.id, k.chave, k.nome, 'reativacao', 'Está há ' || (p_data - k.ultima) || ' dias sem comprar (R$ ' || round(k.total) || ' no ano)',
             jsonb_build_object('dias', p_data - k.ultima, 'total', round(k.total))
        from _cart k
       where k.ultima <= p_data - 60
         and not exists (select 1 from public.prospeccao x where x.data = p_data and x.cliente_chave = k.chave)
       order by (k.fone is not null) desc, k.total desc limit meta - n
      on conflict do nothing;
    end if;
    select count(*) into n from public.prospeccao where data = p_data and pessoa_id = v.id;
    total := total + n;
  end loop;

-- A sugestão usa um item real da compra mais recente, sem afirmar estoque ou compatibilidade.
update public.prospeccao x
set dados = coalesce(x.dados, '{}'::jsonb) || jsonb_build_object('ultima_compra', u.data, 'produto_ultima_compra', u.produto)
from (
  select x0.id, p.data, i.descricao as produto
  from public.prospeccao x0
  cross join lateral (
    select p0.id, p0.data from public.pedidos p0
    where p0.cliente_chave=x0.cliente_chave and p0.numero_ecommerce is null
      and p0.situacao is distinct from 'Cancelado' and p0.data <= p_data
    order by p0.data desc, p0.id desc limit 1
  ) p
  cross join lateral (
    select i0.descricao from public.pedido_itens i0 where i0.pedido_id=p.id
    order by i0.quantidade*i0.valor_unitario desc nulls last, i0.codigo, i0.descricao limit 1
  ) i
  where x0.data=p_data and (auth.uid() is null or dono or x0.pessoa_id=eu)
) u where x.id=u.id;

  return (select count(*)::int from public.prospeccao x where x.data=p_data and (auth.uid() is null or dono or x.pessoa_id=eu));
end $function$;

