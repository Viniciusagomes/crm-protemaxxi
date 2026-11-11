-- WhatsApp na Intranet — fase 1: caixa de entrada (API oficial da Meta / Cloud API).
-- Entrada: Edge Function whatsapp-webhook (service_role) → wa_entrada / wa_status. Saída: whatsapp-enviar (com o login de quem envia).
-- Quem vê: o dono, e quem tem a permissão 'atendimento' (só as conversas sem dono, as suas e as da sua equipe).
-- O site não grava direto nas tabelas: tudo passa pelas funções wa_* (assumir, transferir, encerrar, nota, lida).

create table if not exists public.wa_conversas (
  id bigint generated always as identity primary key,
  wa_id text not null unique,                       -- número do cliente como a Meta manda (ex.: 5519987654321)
  telefone text,                                    -- normalizado (seg.fone_norm), o mesmo de cliente_telefones
  nome_perfil text,                                 -- nome do perfil do WhatsApp do cliente
  cliente_chave text,
  status text not null default 'aberta' check (status in ('aberta', 'encerrada')),
  responsavel text references public.pessoas(id),
  ultima_msg_em timestamptz,
  ultima_msg_texto text,
  ultima_entrada_em timestamptz,                    -- janela de 24 h da Meta para mensagem livre
  nao_lidas int not null default 0,
  criado_em timestamptz not null default now(),
  encerrada_em timestamptz,
  encerrada_por text,
  motivo text
);
create index if not exists wa_conversas_ultima on public.wa_conversas (ultima_msg_em desc);

create table if not exists public.wa_mensagens (
  id bigint generated always as identity primary key,
  conversa_id bigint not null references public.wa_conversas(id) on delete cascade,
  wa_msg_id text unique,                            -- id da Meta (wamid...); nulo em nota interna
  direcao text not null check (direcao in ('entrada', 'saida', 'nota')),
  tipo text not null default 'text',
  texto text,
  midia_id text, midia_path text, midia_mime text, midia_nome text,
  status text not null default 'recebida' check (status in ('recebida', 'enviando', 'enviada', 'entregue', 'lida', 'falhou')),
  erro text,
  por text,                                         -- pessoa que enviou (saida/nota)
  resposta_a text,                                  -- wamid da mensagem citada
  em timestamptz not null default now()
);
create index if not exists wa_mensagens_conversa on public.wa_mensagens (conversa_id, em);

create table if not exists public.wa_respostas (
  id bigint generated always as identity primary key,
  atalho text not null,
  texto text not null,
  criado_por text,
  criado_em timestamptz not null default now()
);

-- ─── quem pode ───
create or replace function seg.pode_atendimento()
 returns boolean language sql stable security definer set search_path to 'public'
as $$ select public.eh_dono() or seg.minha_permissao('atendimento') $$;

create or replace function seg.ve_conversa(p_resp text)
 returns boolean language sql stable security definer set search_path to 'public'
as $$ select seg.pode_atendimento() and (public.eh_dono() or p_resp is null or p_resp in (select seg.pessoas_visiveis())) $$;

alter table public.wa_conversas enable row level security;
alter table public.wa_mensagens enable row level security;
alter table public.wa_respostas enable row level security;
drop policy if exists wa_conv_sel on public.wa_conversas;
create policy wa_conv_sel on public.wa_conversas for select to authenticated using (seg.ve_conversa(responsavel));
drop policy if exists wa_msg_sel on public.wa_mensagens;
create policy wa_msg_sel on public.wa_mensagens for select to authenticated
  using (exists (select 1 from public.wa_conversas c where c.id = conversa_id and seg.ve_conversa(c.responsavel)));
drop policy if exists wa_resp_all on public.wa_respostas;
create policy wa_resp_all on public.wa_respostas for all to authenticated using (seg.pode_atendimento()) with check (seg.pode_atendimento());

-- tempo real (a RLS acima vale também para o Realtime)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wa_conversas') then
    alter publication supabase_realtime add table public.wa_conversas; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wa_mensagens') then
    alter publication supabase_realtime add table public.wa_mensagens; end if;
end $$;

-- ─── mídias (bucket privado) ───
insert into storage.buckets (id, name, public, file_size_limit) values ('whatsapp', 'whatsapp', false, 20971520) on conflict (id) do nothing;
drop policy if exists wa_midia_sel on storage.objects;
create policy wa_midia_sel on storage.objects for select to authenticated using (
  bucket_id = 'whatsapp' and (
    exists (select 1 from public.wa_mensagens m join public.wa_conversas c on c.id = m.conversa_id where m.midia_path = objects.name and seg.ve_conversa(c.responsavel))
    or (objects.name like 'saida/' || coalesce(seg.minha_pessoa(), '-') || '/%' and seg.pode_atendimento())));
drop policy if exists wa_midia_ins on storage.objects;
create policy wa_midia_ins on storage.objects for insert to authenticated with check (
  bucket_id = 'whatsapp' and seg.pode_atendimento() and name like 'saida/' || coalesce(seg.minha_pessoa(), '-') || '/%');

-- ─── segredo do webhook (o "token de verificação" que vai no painel da Meta) ───
insert into privado.segredos (chave, valor)
  values ('wa_verify', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) on conflict do nothing;
create or replace function public.wa_verify_ok(s text)
 returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from privado.segredos where chave = 'wa_verify' and valor = s) $$;
revoke execute on function public.wa_verify_ok(text) from public, anon, authenticated;
create or replace function public.wa_webhook_info()
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$ begin
  if not public.eh_dono() then raise exception 'só o administrador'; end if;
  return jsonb_build_object('verify_token', (select valor from privado.segredos where chave = 'wa_verify'));
end $$;
revoke execute on function public.wa_webhook_info() from public, anon;
grant execute on function public.wa_webhook_info() to authenticated;

-- ─── entrada (só a Edge Function, com service_role) ───
create or replace function public.wa_entrada(p jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare c public.wa_conversas; tel text := seg.fone_norm(p->>'de'); mid bigint; quando timestamptz := coalesce((p->>'em')::timestamptz, now());
  cli text := (select ct.cliente_chave from public.cliente_telefones ct where ct.telefone = seg.fone_norm(p->>'de') and ct.errado_em is null order by ct.celular desc limit 1);
begin
  insert into public.wa_conversas (wa_id, telefone, nome_perfil, cliente_chave) values (p->>'de', nullif(tel, ''), nullif(p->>'nome', ''), cli)
    on conflict (wa_id) do update set nome_perfil = coalesce(excluded.nome_perfil, wa_conversas.nome_perfil) returning * into c;
  insert into public.wa_mensagens (conversa_id, wa_msg_id, direcao, tipo, texto, midia_id, midia_mime, midia_nome, status, resposta_a, em)
    values (c.id, p->>'wa_msg_id', 'entrada', coalesce(p->>'tipo', 'text'), p->>'texto', p->>'midia_id', p->>'midia_mime', p->>'midia_nome', 'recebida', p->>'resposta_a', quando)
    on conflict (wa_msg_id) do nothing returning id into mid;
  if mid is null then return jsonb_build_object('repetida', true); end if;   -- a Meta reenvia: não duplica
  update public.wa_conversas set ultima_msg_em = quando, ultima_entrada_em = quando, nao_lidas = nao_lidas + 1,
      ultima_msg_texto = left(coalesce(nullif(p->>'texto', ''), '[' || coalesce(p->>'tipo', 'mensagem') || ']'), 200),
      status = 'aberta', encerrada_em = null, encerrada_por = null, motivo = null, cliente_chave = coalesce(cliente_chave, cli)
    where id = c.id;
  return jsonb_build_object('conversa', c.id, 'mensagem', mid);
end $$;
revoke execute on function public.wa_entrada(jsonb) from public, anon, authenticated;

-- status de entrega das mensagens enviadas: só avança (enviada → entregue → lida); falha sempre registra
create or replace function public.wa_status(p_wa_msg_id text, p_status text, p_erro text default null)
 returns void language sql security definer set search_path to 'public'
as $$
  update public.wa_mensagens set status = p_status, erro = coalesce(p_erro, erro)
   where wa_msg_id = p_wa_msg_id and direcao = 'saida' and (p_status = 'falhou'
     or array_position(array['enviando', 'enviada', 'entregue', 'lida'], p_status) > coalesce(array_position(array['enviando', 'enviada', 'entregue', 'lida'], status), 0))
$$;
revoke execute on function public.wa_status(text, text, text) from public, anon, authenticated;

-- ─── ações da equipe ───
create or replace function seg.wa_conv_minha(p_id bigint)
 returns public.wa_conversas language plpgsql stable security definer set search_path to 'public'
as $$ declare c public.wa_conversas; begin
  select * into c from public.wa_conversas where id = p_id;
  if c.id is null or not seg.ve_conversa(c.responsavel) then raise exception 'conversa não encontrada'; end if;
  return c;
end $$;

create or replace function public.wa_assumir(p_id bigint)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$ declare c public.wa_conversas := seg.wa_conv_minha(p_id); eu text := seg.minha_pessoa(); begin
  if c.responsavel is not null and c.responsavel <> eu and not public.eh_dono() then raise exception 'esta conversa já é de outra pessoa; peça a transferência'; end if;
  update public.wa_conversas set responsavel = eu where id = p_id;
  insert into public.wa_mensagens (conversa_id, direcao, tipo, texto, status, por) values (p_id, 'nota', 'evento', 'assumiu a conversa', 'enviada', eu);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.wa_transferir(p_id bigint, p_pessoa text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$ declare c public.wa_conversas := seg.wa_conv_minha(p_id); eu text := seg.minha_pessoa(); begin
  if p_pessoa is not null and not exists (select 1 from public.pessoas p where p.id = p_pessoa and p.ativo
      and (p.papel = 'dono' or coalesce((p.permissoes->>'atendimento')::boolean, false))) then
    raise exception 'essa pessoa não atende o WhatsApp (dê a permissão "Atendimento WhatsApp")'; end if;
  update public.wa_conversas set responsavel = p_pessoa where id = p_id;
  insert into public.wa_mensagens (conversa_id, direcao, tipo, texto, status, por)
    values (p_id, 'nota', 'evento', case when p_pessoa is null then 'devolveu para a fila' else 'transferiu para ' || (select nome from public.pessoas where id = p_pessoa) end, 'enviada', eu);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.wa_encerrar(p_id bigint, p_motivo text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$ declare c public.wa_conversas := seg.wa_conv_minha(p_id); eu text := seg.minha_pessoa(); begin
  update public.wa_conversas set status = 'encerrada', encerrada_em = now(), encerrada_por = eu, motivo = nullif(trim(p_motivo), ''), nao_lidas = 0 where id = p_id;
  insert into public.wa_mensagens (conversa_id, direcao, tipo, texto, status, por) values (p_id, 'nota', 'evento', 'encerrou' || coalesce(': ' || nullif(trim(p_motivo), ''), ''), 'enviada', eu);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.wa_nota(p_id bigint, p_texto text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$ declare c public.wa_conversas := seg.wa_conv_minha(p_id); begin
  if coalesce(trim(p_texto), '') = '' then raise exception 'nota vazia'; end if;
  insert into public.wa_mensagens (conversa_id, direcao, tipo, texto, status, por) values (p_id, 'nota', 'nota', left(trim(p_texto), 4000), 'enviada', seg.minha_pessoa());
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.wa_lida(p_id bigint)
 returns void language plpgsql security definer set search_path to 'public'
as $$ declare c public.wa_conversas := seg.wa_conv_minha(p_id); begin
  update public.wa_conversas set nao_lidas = 0 where id = p_id and nao_lidas > 0;
end $$;

create or replace function public.wa_ligar_cliente(p_id bigint, p_chave text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$ declare c public.wa_conversas := seg.wa_conv_minha(p_id); begin
  if p_chave is not null and not exists (select 1 from public.clientes where chave = p_chave) then raise exception 'cliente não encontrado'; end if;
  update public.wa_conversas set cliente_chave = p_chave where id = p_id;
  if p_chave is not null and c.telefone is not null then
    insert into public.cliente_telefones (telefone, cliente_chave, celular, origem, por) values (c.telefone, p_chave, length(c.telefone) = 13, 'whatsapp', seg.minha_pessoa())
      on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Ficha resumida do cliente ao lado da conversa (quem atende vê, mesmo sem ver todos os clientes da loja).
create or replace function public.wa_ficha(p_id bigint)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$ declare c public.wa_conversas := seg.wa_conv_minha(p_id); cl public.clientes; begin
  if c.cliente_chave is null then return null; end if;
  select * into cl from public.clientes where chave = c.cliente_chave;
  if cl.chave is null then return null; end if;
  return jsonb_build_object('chave', cl.chave, 'nome', cl.nome, 'doc', cl.doc, 'cidade', cl.cidade, 'uf', cl.uf, 'email', cl.email, 'nao_contatar', cl.nao_contatar,
    'vendedor', (select p.vendedor_nome from public.pedidos p where p.cliente_chave = cl.chave and p.vendedor_nome is not null order by p.data desc limit 1),
    'total_12m', (select coalesce(sum(p.valor), 0) from public.pedidos p where p.cliente_chave = cl.chave and p.data >= current_date - 365 and p.situacao not ilike '%cancel%'),
    'pedidos', coalesce((select jsonb_agg(x) from (select p.numero, p.data, p.valor, p.situacao, p.canal from public.pedidos p where p.cliente_chave = cl.chave order by p.data desc, p.numero desc limit 5) x), '[]'::jsonb));
end $$;

-- Busca de cliente para ligar à conversa (nome, documento ou telefone); mesma regra: só quem atende.
create or replace function public.wa_buscar_cliente(p_q text)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$ declare q text := trim(coalesce(p_q, '')); d text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g'); begin
  if not seg.pode_atendimento() then raise exception 'sem permissão'; end if;
  if length(q) < 3 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x) from (select cl.chave, cl.nome, cl.cidade, cl.uf from public.clientes cl
     where cl.nome ilike '%' || q || '%' or (length(d) >= 8 and (cl.doc like d || '%' or exists (select 1 from public.cliente_telefones t where t.cliente_chave = cl.chave and t.telefone like '%' || d || '%')))
     order by cl.nome limit 15) x), '[]'::jsonb);
end $$;

revoke execute on function public.wa_assumir(bigint), public.wa_transferir(bigint, text), public.wa_encerrar(bigint, text), public.wa_nota(bigint, text),
  public.wa_lida(bigint), public.wa_ligar_cliente(bigint, text), public.wa_ficha(bigint), public.wa_buscar_cliente(text) from public, anon;
grant execute on function public.wa_assumir(bigint), public.wa_transferir(bigint, text), public.wa_encerrar(bigint, text), public.wa_nota(bigint, text),
  public.wa_lida(bigint), public.wa_ligar_cliente(bigint, text), public.wa_ficha(bigint), public.wa_buscar_cliente(text) to authenticated;
revoke execute on function seg.wa_conv_minha(bigint), seg.pode_atendimento(), seg.ve_conversa(text) from public, anon;
grant execute on function seg.pode_atendimento(), seg.ve_conversa(text) to authenticated;   -- usadas nas políticas de RLS
revoke execute on function seg.wa_conv_minha(bigint) from authenticated;

insert into public.config (chave, valor) values ('whatsapp', '{"phone_number_id": null, "waba_id": null, "graph_version": "v23.0"}'::jsonb) on conflict (chave) do nothing;
