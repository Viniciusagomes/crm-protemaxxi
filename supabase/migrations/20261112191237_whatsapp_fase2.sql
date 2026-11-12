-- WhatsApp na Intranet — fase 2: expediente, presença, avisos/bloqueio e distribuição automática (setor + carteira).
-- Regras (pedido do Vinícius, 12/11/2026):
--  • Recebe conversa nova só quem está "trabalhando" (botão Iniciar expediente), com a Intranet aberta na tela do WhatsApp
--    e sem bloqueio. Botões: Iniciar expediente, Almoço / Retornar e Finalizar expediente.
--  • Sair sem apertar (Intranet fechada > 5 min estando "trabalhando", ou almoço > 3 h sem "Retornar") = falha.
--    1ª falha: aviso. 2ª: aviso de que a próxima bloqueia. 3ª: bloqueio de 3 dias corridos sem conversas novas (contagem zera).
--  • Cliente que já comprou vai para o vendedor da carteira (vendedor principal no Tiny), se ele estiver disponível.
--    Senão, rodízio entre os disponíveis do setor; ninguém disponível = fila "sem dono", distribuída quando alguém ficar disponível.
--  • Cliente de vendedor que estava fora: quem atende tem o botão "Enviar para o vendedor" quando ele volta (wa_enviar_vendedor).
--  • Horário de atendimento por colaborador (wa_horarios): só informativo; vai para a mensagem do bot na fase 3.
--  • Perfil de atendimento (wa_atendentes.assinatura): "Nome - Setor" em negrito em cima de cada mensagem (whatsapp-enviar).

-- ─── tabelas ───
create table if not exists public.wa_atendentes (
  pessoa text primary key references public.pessoas(id) on delete cascade,
  setores text[] not null default '{vendas}',
  estado text not null default 'fora' check (estado in ('fora', 'trabalhando', 'almoco')),
  desde timestamptz,                 -- quando entrou no estado atual
  visto_em timestamptz,              -- último sinal da Intranet aberta (qualquer tela)
  tela_em timestamptz,               -- último sinal com a tela do WhatsApp aberta
  ultimo_lead_em timestamptz,        -- rodízio: quem recebeu há mais tempo recebe primeiro
  faltas int not null default 0,     -- saídas sem apertar o botão desde o último bloqueio
  bloqueado_ate timestamptz,
  aviso text,                        -- aviso pendente para a pessoa (some quando ela clica "Entendi")
  aviso_em timestamptz,
  assinatura text                    -- perfil de atendimento: nome que sai em cima das mensagens (vazio = "Nome - Setor")
);

create table if not exists public.wa_expediente_log (
  id bigint generated always as identity primary key,
  pessoa text not null references public.pessoas(id) on delete cascade,
  evento text not null check (evento in ('inicio', 'almoco', 'retorno', 'fim', 'falha', 'bloqueio', 'desbloqueio')),
  detalhe text,
  por text,
  em timestamptz not null default now()
);
create index if not exists wa_expediente_log_pessoa on public.wa_expediente_log (pessoa, em desc);

create table if not exists public.wa_horarios (
  id bigint generated always as identity primary key,
  pessoa text not null references public.pessoas(id) on delete cascade,
  dia smallint not null check (dia between 0 and 6),   -- 0 = domingo
  inicio time not null,
  fim time not null,
  check (fim > inicio)
);
create index if not exists wa_horarios_pessoa on public.wa_horarios (pessoa, dia, inicio);

alter table public.wa_conversas add column if not exists setor text not null default 'vendas';
alter table public.wa_conversas add column if not exists vendedor_carteira text references public.pessoas(id);

-- ─── leitura (escrita só pelas funções abaixo; horários: o dono) ───
alter table public.wa_atendentes enable row level security;
alter table public.wa_expediente_log enable row level security;
alter table public.wa_horarios enable row level security;
drop policy if exists wa_atend_sel on public.wa_atendentes;
create policy wa_atend_sel on public.wa_atendentes for select to authenticated using (seg.pode_atendimento());
drop policy if exists wa_explog_sel on public.wa_expediente_log;
create policy wa_explog_sel on public.wa_expediente_log for select to authenticated using (public.eh_dono() or pessoa = seg.minha_pessoa());
drop policy if exists wa_hor_sel on public.wa_horarios;
create policy wa_hor_sel on public.wa_horarios for select to authenticated using (seg.pode_atendimento());
drop policy if exists wa_hor_dono on public.wa_horarios;
create policy wa_hor_dono on public.wa_horarios for all to authenticated using (public.eh_dono()) with check (public.eh_dono());

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wa_atendentes') then
    alter publication supabase_realtime add table public.wa_atendentes; end if;
end $$;

-- ─── regras ───
-- Disponível para conversa nova: trabalhando, Intranet aberta na tela do WhatsApp nos últimos 3 min e sem bloqueio.
create or replace function seg.wa_disponivel(p_pessoa text)
 returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from public.wa_atendentes a join public.pessoas p on p.id = a.pessoa
    where a.pessoa = p_pessoa and p.ativo and a.estado = 'trabalhando'
      and a.visto_em > now() - interval '3 minutes' and a.tela_em > now() - interval '3 minutes'
      and (a.bloqueado_ate is null or a.bloqueado_ate <= now()))
$$;

-- Vendedor da carteira: o vendedor principal do cliente no Tiny (mais pedidos da loja, depois o mais recente), se for alguém ativo.
create or replace function seg.wa_vendedor_carteira(p_cli text)
 returns text language sql stable security definer set search_path to 'public'
as $$
  select pe.id from public.pessoas pe
   where p_cli is not null and pe.ativo and pe.tiny_vendedor_id = (
     select x.vendedor_id from public.pedidos x
      where x.cliente_chave = p_cli and x.vendedor_id is not null and x.numero_ecommerce is null and coalesce(x.situacao, '') !~* 'cancel'
      group by x.vendedor_id order by count(*) desc, max(x.data) desc limit 1)
   limit 1
$$;

-- Escolhe e grava o responsável de uma conversa sem dono. Devolve a pessoa (ou null: fica na fila).
create or replace function seg.wa_atribuir(p_conv bigint)
 returns text language plpgsql security definer set search_path to 'public'
as $$
declare c public.wa_conversas; quem text; como text;
begin
  select * into c from public.wa_conversas where id = p_conv for update;
  if c.id is null or c.responsavel is not null or c.status <> 'aberta' then return c.responsavel; end if;
  if c.vendedor_carteira is not null and seg.wa_disponivel(c.vendedor_carteira) then
    quem := c.vendedor_carteira; como := 'cliente da carteira';
  else
    select a.pessoa into quem from public.wa_atendentes a
     where c.setor = any(a.setores) and seg.wa_disponivel(a.pessoa)
     order by a.ultimo_lead_em nulls first, a.pessoa
     limit 1 for update of a skip locked;
    como := 'rodízio';
  end if;
  if quem is null then return null; end if;
  update public.wa_conversas set responsavel = quem where id = p_conv;
  update public.wa_atendentes set ultimo_lead_em = now() where pessoa = quem;
  insert into public.wa_mensagens (conversa_id, direcao, tipo, texto, status, por)
    values (p_conv, 'nota', 'evento', 'recebeu a conversa (' || como || ')', 'enviada', quem);
  return quem;
end $$;

-- Distribui a fila (conversas abertas sem dono), da mais antiga para a mais nova, enquanto houver alguém disponível.
create or replace function seg.wa_distribuir_fila()
 returns int language plpgsql security definer set search_path to 'public'
as $$
declare r record; n int := 0;
begin
  for r in select id from public.wa_conversas where status = 'aberta' and responsavel is null order by ultima_entrada_em nulls last, id loop
    if seg.wa_atribuir(r.id) is null then exit; end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Saídas sem apertar o botão: aviso → aviso final → bloqueio de 3 dias corridos (a contagem zera no bloqueio).
create or replace function seg.wa_verificar_presenca()
 returns int language plpgsql security definer set search_path to 'public'
as $$
declare a record; n int := 0; f int; motivo text; msg text;
begin
  for a in select * from public.wa_atendentes
            where (estado = 'trabalhando' and coalesce(visto_em, desde, now()) < now() - interval '5 minutes')
               or (estado = 'almoco' and coalesce(desde, now()) < now() - interval '3 hours')
            for update skip locked loop
    motivo := case when a.estado = 'almoco' then 'ficou mais de 3 h em almoço sem apertar "Retornar do almoço"'
                   else 'saiu da Intranet sem apertar "Almoço" ou "Finalizar expediente"' end;
    f := a.faltas + 1;
    if f >= 3 then
      msg := 'Você ' || motivo || ' pela 3ª vez. Você está bloqueado e não vai receber conversas novas por 3 dias, até '
             || to_char(now() at time zone 'America/Sao_Paulo' + interval '3 days', 'DD/MM "às" HH24:MI') || '.';
      update public.wa_atendentes set estado = 'fora', desde = now(), faltas = 0, bloqueado_ate = now() + interval '3 days', aviso = msg, aviso_em = now()
       where pessoa = a.pessoa;
      insert into public.wa_expediente_log (pessoa, evento, detalhe) values (a.pessoa, 'falha', motivo), (a.pessoa, 'bloqueio', '3 dias');
    else
      msg := case when f = 1 then 'Atenção: você ' || motivo || '. Este é o 1º aviso. Use sempre os botões de expediente.'
                  else 'Último aviso: você ' || motivo || ' pela 2ª vez. Na próxima vez você fica 3 dias sem receber conversas novas.' end;
      update public.wa_atendentes set estado = 'fora', desde = now(), faltas = f, aviso = msg, aviso_em = now() where pessoa = a.pessoa;
      insert into public.wa_expediente_log (pessoa, evento, detalhe) values (a.pessoa, 'falha', f || 'ª vez: ' || motivo);
    end if;
    n := n + 1;
  end loop;
  perform seg.wa_distribuir_fila();
  return n;
end $$;

revoke execute on function seg.wa_disponivel(text), seg.wa_vendedor_carteira(text), seg.wa_atribuir(bigint), seg.wa_distribuir_fila(), seg.wa_verificar_presenca()
  from public, anon, authenticated;

-- ─── botões do expediente (e o sinal de presença a cada 30 s) ───
create or replace function public.wa_expediente(p_acao text, p_tela boolean default false)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare eu text := seg.minha_pessoa(); a public.wa_atendentes; ev text;
begin
  if eu is null or not seg.pode_atendimento() then raise exception 'sem permissão de atendimento'; end if;
  insert into public.wa_atendentes (pessoa) values (eu) on conflict do nothing;
  perform seg.wa_verificar_presenca();          -- registra antes uma saída sem botão que ainda não tinha sido contada
  select * into a from public.wa_atendentes where pessoa = eu for update;
  if p_acao = 'inicio' and a.estado = 'fora' then ev := 'inicio'; a.estado := 'trabalhando';
  elsif p_acao = 'almoco' and a.estado = 'trabalhando' then ev := 'almoco'; a.estado := 'almoco';
  elsif p_acao = 'retorno' and a.estado = 'almoco' then ev := 'retorno'; a.estado := 'trabalhando';
  elsif p_acao = 'fim' and a.estado <> 'fora' then ev := 'fim'; a.estado := 'fora';
  elsif p_acao = 'aviso_ok' then update public.wa_atendentes set aviso = null, aviso_em = null where pessoa = eu;
  elsif p_acao not in ('ping', 'inicio', 'almoco', 'retorno', 'fim') then raise exception 'ação inválida';
  end if;
  update public.wa_atendentes set estado = a.estado, desde = case when ev is not null then now() else desde end,
      visto_em = now(), tela_em = case when p_tela then now() else tela_em end
   where pessoa = eu;
  if ev is not null then insert into public.wa_expediente_log (pessoa, evento, por) values (eu, ev, eu); end if;
  if a.estado = 'trabalhando' then perform seg.wa_distribuir_fila(); end if;
  select * into a from public.wa_atendentes where pessoa = eu;
  return to_jsonb(a);
end $$;

-- ─── dono: setores, bloqueio ───
create or replace function public.wa_atendente_cfg(p_pessoa text, p_setores text[])
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$ begin
  if not public.eh_dono() then raise exception 'só o administrador'; end if;
  if exists (select 1 from unnest(coalesce(p_setores, '{}')) s where s not in ('vendas', 'suporte')) then raise exception 'setor inválido'; end if;
  insert into public.wa_atendentes (pessoa, setores) values (p_pessoa, coalesce(p_setores, '{}'))
    on conflict (pessoa) do update set setores = excluded.setores;
  perform seg.wa_distribuir_fila();
  return jsonb_build_object('ok', true);
end $$;

-- Perfil de atendimento: o nome que aparece em negrito em cima de cada mensagem enviada ("Felipe Moreira - Vendas").
create or replace function public.wa_atendente_assinatura(p_pessoa text, p_texto text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$ begin
  if not public.eh_dono() then raise exception 'só o administrador'; end if;
  insert into public.wa_atendentes (pessoa, assinatura) values (p_pessoa, nullif(left(trim(p_texto), 60), ''))
    on conflict (pessoa) do update set assinatura = excluded.assinatura;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.wa_desbloquear(p_pessoa text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$ begin
  if not public.eh_dono() then raise exception 'só o administrador'; end if;
  update public.wa_atendentes set bloqueado_ate = null, faltas = 0, aviso = null, aviso_em = null where pessoa = p_pessoa;
  insert into public.wa_expediente_log (pessoa, evento, detalhe, por) values (p_pessoa, 'desbloqueio', 'avisos zerados', seg.minha_pessoa());
  perform seg.wa_distribuir_fila();
  return jsonb_build_object('ok', true);
end $$;

-- ─── "Enviar para o vendedor": devolve o cliente ao vendedor da carteira quando ele está disponível ───
create or replace function public.wa_enviar_vendedor(p_id bigint)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$ declare c public.wa_conversas := seg.wa_conv_minha(p_id); eu text := seg.minha_pessoa(); begin
  if c.vendedor_carteira is null or c.vendedor_carteira = c.responsavel then raise exception 'esta conversa não tem outro vendedor da carteira'; end if;
  if c.responsavel is not null and c.responsavel <> eu and not public.eh_dono() then raise exception 'só quem está atendendo pode enviar'; end if;
  if not seg.wa_disponivel(c.vendedor_carteira) then
    raise exception '% ainda não está disponível (precisa estar em expediente e com a tela do WhatsApp aberta)', (select nome from public.pessoas where id = c.vendedor_carteira);
  end if;
  update public.wa_conversas set responsavel = c.vendedor_carteira where id = p_id;
  insert into public.wa_mensagens (conversa_id, direcao, tipo, texto, status, por)
    values (p_id, 'nota', 'evento', 'enviou para o vendedor ' || (select nome from public.pessoas where id = c.vendedor_carteira), 'enviada', eu);
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.wa_expediente(text, boolean), public.wa_atendente_cfg(text, text[]), public.wa_atendente_assinatura(text, text), public.wa_desbloquear(text), public.wa_enviar_vendedor(bigint) from public, anon;
grant execute on function public.wa_expediente(text, boolean), public.wa_atendente_cfg(text, text[]), public.wa_atendente_assinatura(text, text), public.wa_desbloquear(text), public.wa_enviar_vendedor(bigint) to authenticated;

-- ─── entrada: conversa nova (ou que reabre depois de encerrada) passa pela distribuição ───
create or replace function public.wa_entrada(p jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare c public.wa_conversas; antes public.wa_conversas; tel text := seg.fone_norm(p->>'de'); mid bigint; quando timestamptz := coalesce((p->>'em')::timestamptz, now());
  cli text := (select ct.cliente_chave from public.cliente_telefones ct where ct.telefone = seg.fone_norm(p->>'de') and ct.errado_em is null order by ct.celular desc limit 1);
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
end $$;
revoke execute on function public.wa_entrada(jsonb) from public, anon, authenticated;

-- Ligar a conversa a outro cliente também recalcula o vendedor da carteira.
create or replace function public.wa_ligar_cliente(p_id bigint, p_chave text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$ declare c public.wa_conversas := seg.wa_conv_minha(p_id); begin
  if p_chave is not null and not exists (select 1 from public.clientes where chave = p_chave) then raise exception 'cliente não encontrado'; end if;
  update public.wa_conversas set cliente_chave = p_chave, vendedor_carteira = seg.wa_vendedor_carteira(p_chave) where id = p_id;
  if p_chave is not null and c.telefone is not null then
    insert into public.cliente_telefones (telefone, cliente_chave, celular, origem, por) values (c.telefone, p_chave, length(c.telefone) = 13, 'whatsapp', seg.minha_pessoa())
      on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Confere as saídas sem botão e distribui a fila a cada minuto, mesmo sem ninguém com a Intranet aberta.
select cron.schedule('wa-presenca', '* * * * *', $$select seg.wa_verificar_presenca()$$);
