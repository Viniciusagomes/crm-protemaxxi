-- WhatsApp: mensagens enviadas pelo app WhatsApp Business no celular (coexistência) entram no histórico da Intranet.
-- A Meta manda essas mensagens no campo "smb_message_echoes"; a Edge Function whatsapp-webhook chama wa_eco.
-- Não conta como não lida, não manda nada ao cliente e não mexe na distribuição (só dá dono a conversa nova).
create or replace function public.wa_eco(p jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare c public.wa_conversas; tel text := seg.fone_norm(p->>'para'); mid bigint; quando timestamptz := coalesce((p->>'em')::timestamptz, now());
  cli text := (select ct.cliente_chave from public.cliente_telefones ct where ct.telefone = seg.fone_norm(p->>'para') and ct.errado_em is null order by ct.celular desc limit 1);
  quem text;
begin
  if coalesce(p->>'para', '') = '' or coalesce(p->>'wa_msg_id', '') = '' then return jsonb_build_object('ignorada', true); end if;
  insert into public.wa_conversas (wa_id, telefone, cliente_chave) values (p->>'para', nullif(tel, ''), cli)
    on conflict (wa_id) do update set cliente_chave = coalesce(wa_conversas.cliente_chave, excluded.cliente_chave) returning * into c;
  quem := coalesce(c.responsavel, seg.wa_fixo());
  insert into public.wa_mensagens (conversa_id, wa_msg_id, direcao, tipo, texto, midia_id, midia_mime, midia_nome, status, por, resposta_a, em)
    values (c.id, p->>'wa_msg_id', 'saida', coalesce(p->>'tipo', 'text'), p->>'texto', p->>'midia_id', p->>'midia_mime', p->>'midia_nome', 'enviada', quem, p->>'resposta_a', quando)
    on conflict (wa_msg_id) do nothing returning id into mid;
  if mid is null then return jsonb_build_object('repetida', true); end if;
  update public.wa_conversas set
      ultima_msg_em = greatest(coalesce(ultima_msg_em, quando), quando),
      ultima_msg_texto = case when quando >= coalesce(ultima_msg_em, quando) then left(coalesce(nullif(p->>'texto', ''), '[' || coalesce(p->>'tipo', 'mensagem') || ']'), 200) else ultima_msg_texto end,
      nao_lidas = case when quando >= coalesce(ultima_entrada_em, quando) then 0 else nao_lidas end,
      responsavel = coalesce(responsavel, quem)
    where id = c.id;
  return jsonb_build_object('conversa', c.id, 'mensagem', mid);
end $$;
revoke execute on function public.wa_eco(jsonb) from public, anon, authenticated;
