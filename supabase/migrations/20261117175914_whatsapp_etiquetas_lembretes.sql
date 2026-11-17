-- WhatsApp: etiquetas, lembretes e busca do cliente pelo telefone com/sem o 9 (17/11)

alter table public.wa_conversas
  add column if not exists etiquetas text[] not null default '{}',
  add column if not exists lembrete_em timestamptz,
  add column if not exists lembrete_txt text,
  add column if not exists lembrete_por text;

-- Acha o cliente do Tiny pelo número, aceitando o celular com ou sem o 9 depois do DDD
create or replace function seg.wa_cliente_por_fone(p_tel text)
returns text language sql stable security definer set search_path = public, extensions as $$
  with n as (select seg.fone_norm(p_tel) v),
  alt as (select v, case when length(v) = 13 then left(v, 4) || substr(v, 6)
                         when length(v) = 12 and substr(v, 5, 1) between '6' and '9' then left(v, 4) || '9' || substr(v, 5) end a from n)
  select ct.cliente_chave from public.cliente_telefones ct, alt
   where ct.errado_em is null and ct.telefone in (alt.v, alt.a)
   order by (ct.telefone = alt.v) desc, ct.celular desc limit 1
$$;

create or replace function public.wa_entrada(p jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare c public.wa_conversas; antes public.wa_conversas; tel text := seg.fone_norm(p->>'de'); mid bigint; quando timestamptz := coalesce((p->>'em')::timestamptz, now());
  cli text := seg.wa_cliente_por_fone(p->>'de');
begin
  select * into antes from public.wa_conversas where wa_id = p->>'de';
  insert into public.wa_conversas (wa_id, telefone, nome_perfil, cliente_chave) values (p->>'de', nullif(tel, ''), nullif(p->>'nome', ''), cli)
    on conflict (wa_id) do update set nome_perfil = coalesce(excluded.nome_perfil, wa_conversas.nome_perfil) returning * into c;
  insert into public.wa_mensagens (conversa_id, wa_msg_id, direcao, tipo, texto, midia_id, midia_mime, midia_nome, status, resposta_a, em)
    values (c.id, p->>'wa_msg_id', 'entrada', coalesce(p->>'tipo', 'text'), p->>'texto', p->>'midia_id', p->>'midia_mime', p->>'midia_nome', 'recebida', p->>'resposta_a', quando)
    on conflict (wa_msg_id) do nothing returning id into mid;
  if mid is null then return jsonb_build_object('repetida', true); end if;   -- a Meta reenvia: não duplica
  update public.wa_conversas set ultima_msg_em = quando, ultima_entrada_em = quando, nao_lidas = nao_lidas + 1,
      ultima_msg_texto = left(coalesce(nullif(p->>'texto', ''), '[' || coalesce(p->>'tipo', 'mensagem') || ']'), 200),
      status = 'aberta', encerrada_em = null, encerrada_por = null, motivo = null, cliente_chave = coalesce(cliente_chave, cli),
      -- contato novo (primeira vez ou depois de encerrada) volta para a distribuição
      responsavel = case when antes.id is null or antes.status = 'encerrada' then null else responsavel end
    where id = c.id returning * into c;
  if c.responsavel is null then
    update public.wa_conversas set vendedor_carteira = seg.wa_vendedor_carteira(c.cliente_chave) where id = c.id;
    perform seg.wa_atribuir(c.id);
  end if;
  return jsonb_build_object('conversa', c.id, 'mensagem', mid);
end $function$;

-- Etiquetas: só as da lista fixa (evita variações de grafia)
create or replace function public.wa_etiquetas(p_id bigint, p_etiquetas text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.wa_conversas := seg.wa_conv_minha(p_id);
  ok text[] := array['orcamento','instalador','tecnico','pos_venda','aguardando','fechou','perdido'];
begin
  if exists (select 1 from unnest(coalesce(p_etiquetas, '{}')) e where e <> all(ok)) then raise exception 'etiqueta desconhecida'; end if;
  update public.wa_conversas set etiquetas = (select coalesce(array_agg(distinct e order by e), '{}') from unnest(coalesce(p_etiquetas, '{}')) e) where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Lembrete: um por conversa; p_em nulo apaga
create or replace function public.wa_lembrete(p_id bigint, p_em timestamptz, p_txt text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.wa_conversas := seg.wa_conv_minha(p_id);
begin
  update public.wa_conversas set lembrete_em = p_em, lembrete_txt = case when p_em is null then null else left(nullif(trim(p_txt), ''), 200) end,
         lembrete_por = case when p_em is null then null else seg.minha_pessoa() end where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.wa_etiquetas(bigint, text[]) from public, anon;
revoke all on function public.wa_lembrete(bigint, timestamptz, text) from public, anon;
revoke all on function seg.wa_cliente_por_fone(text) from public, anon, authenticated;
grant execute on function public.wa_etiquetas(bigint, text[]) to authenticated;
grant execute on function public.wa_lembrete(bigint, timestamptz, text) to authenticated;

-- Liga as conversas antigas que agora são encontradas
update public.wa_conversas c set cliente_chave = seg.wa_cliente_por_fone(c.wa_id), vendedor_carteira = coalesce(c.vendedor_carteira, seg.wa_vendedor_carteira(seg.wa_cliente_por_fone(c.wa_id)))
 where c.cliente_chave is null and seg.wa_cliente_por_fone(c.wa_id) is not null;
