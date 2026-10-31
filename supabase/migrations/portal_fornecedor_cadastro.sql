-- Portal do fornecedor: convite já com o CNPJ, de uso único, e cadastro com login (e-mail e senha), contatos e endereço.
-- A conta é criada pela Edge Function forn-cadastro (service role); o fornecedor com login não entra mais pelo link com token.

-- ─── cadastro ───
alter table public.fornecedores
  add column telefone text, add column cep text, add column logradouro text, add column numero text,
  add column complemento text, add column bairro text, add column cidade text, add column uf text;
create unique index fornecedores_cnpj_unico on public.fornecedores (cnpj) where cnpj is not null;

-- ─── convite: nasce com o CNPJ ───
-- Sem preenchimento de propósito: a tabela está vazia; se aparecer convite antigo, a migration para em vez de inventar CNPJ.
alter table public.forn_convites add column cnpj text not null check (cnpj ~ '^\d{14}$'), add column tentativas int not null default 0;

create or replace function seg.cnpj_valido(c text) returns boolean
language plpgsql immutable set search_path = public as $$
declare d int[]; p1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2]; p2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2]; s int := 0; i int; r int;
begin
  if c is null or c !~ '^\d{14}$' or c ~ '^(\d)\1{13}$' then return false; end if;
  d := array(select substr(c, g, 1)::int from generate_series(1, 14) g);
  for i in 1..12 loop s := s + d[i] * p1[i]; end loop;
  r := s % 11; if d[13] <> (case when r < 2 then 0 else 11 - r end) then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + d[i] * p2[i]; end loop;
  r := s % 11; return d[14] = case when r < 2 then 0 else 11 - r end;
end $$;
revoke execute on function seg.cnpj_valido(text) from anon, public;

-- CNPJ válido e ainda não cadastrado; um convite novo derruba o anterior do mesmo CNPJ (só um link vale por vez).
create or replace function seg.forn_convite_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.cnpj := regexp_replace(coalesce(new.cnpj, ''), '\D', '', 'g');
  if not seg.cnpj_valido(new.cnpj) then raise exception 'CNPJ inválido'; end if;
  perform pg_advisory_xact_lock(hashtext('forn_convite:' || new.cnpj));   -- dois convites ao mesmo tempo: o segundo vê e derruba o primeiro
  if exists (select 1 from fornecedores where cnpj = new.cnpj) then raise exception 'Este CNPJ já é fornecedor cadastrado'; end if;
  update forn_convites set expira_em = now() where cnpj = new.cnpj and usado_em is null and expira_em > now();
  return new;
end $$;
revoke execute on function seg.forn_convite_antes() from anon, public;
create trigger forn_convite_antes before insert on public.forn_convites for each row execute function seg.forn_convite_antes();

-- O CNPJ do convite não muda depois de criado.
create or replace function seg.forn_convite_fixo() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.cnpj is distinct from old.cnpj then raise exception 'O CNPJ do convite não pode mudar; gere outro convite'; end if;
  return new;
end $$;
revoke execute on function seg.forn_convite_fixo() from anon, public;
create trigger forn_convite_fixo before update on public.forn_convites for each row execute function seg.forn_convite_fixo();

create or replace function public.forn_convite_ver(p_convite text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nome', nome, 'cnpj', cnpj, 'email', email, 'whatsapp', whatsapp,
    'empresa', (select valor->>'empresa' from config where chave = 'assistencia'))
  from forn_convites where token = p_convite and length(p_convite) >= 32 and usado_em is null and expira_em > now()
$$;
grant execute on function public.forn_convite_ver(text) to service_role;

-- ─── cadastrar: só a Edge Function chama; o CNPJ vem sempre do convite ───
drop function public.forn_cadastrar(text, jsonb);
create function public.forn_cadastrar(p_convite text, p jsonb, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c forn_convites; f fornecedores; v text;
  campo constant text[] := array['telefone', 'whatsapp', 'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf'];
begin
  select * into c from forn_convites where token = p_convite and length(p_convite) >= 32 and usado_em is null and expira_em > now() for update;
  if c.id is null then raise exception 'convite inválido ou vencido'; end if;
  if p_user is null then raise exception 'login não criado'; end if;
  if length(trim(coalesce(p->>'nome', ''))) < 2 then raise exception 'informe a razão social'; end if;
  foreach v in array campo loop
    if trim(coalesce(p->>v, '')) = '' then raise exception 'preencha o campo %', v; end if;
  end loop;
  if exists (select 1 from fornecedores where cnpj = c.cnpj) then raise exception 'Este CNPJ já é fornecedor cadastrado'; end if;
  insert into fornecedores (nome, cnpj, contato, email, telefone, whatsapp, cep, logradouro, numero, complemento, bairro, cidade, uf, marcas, user_id, criado_por)
  values (left(trim(p->>'nome'), 160), c.cnpj, left(trim(p->>'contato'), 120), left(lower(trim(p->>'email')), 160),
    left(regexp_replace(p->>'telefone', '\D', '', 'g'), 15), left(regexp_replace(p->>'whatsapp', '\D', '', 'g'), 15),
    left(regexp_replace(p->>'cep', '\D', '', 'g'), 8), left(trim(p->>'logradouro'), 160), left(trim(p->>'numero'), 20), left(trim(p->>'complemento'), 80),
    left(trim(p->>'bairro'), 80), left(trim(p->>'cidade'), 80), upper(left(trim(p->>'uf'), 2)), c.marcas, p_user, 'convite:' || coalesce(c.criado_por, ''))
  returning * into f;
  update forn_convites set usado_em = now(), fornecedor_id = f.id where id = c.id;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.forn_cadastrar(text, jsonb, uuid) from anon, authenticated, public;
grant execute on function public.forn_cadastrar(text, jsonb, uuid) to service_role;

-- E-mail já usado: conta a tentativa; na 5ª o convite vence (o link não serve para testar quais e-mails têm conta).
create function public.forn_convite_tentativa(p_convite text) returns void
language sql security definer set search_path = public as $$
  update forn_convites set tentativas = tentativas + 1, expira_em = case when tentativas + 1 >= 5 then now() else expira_em end
  where token = p_convite and usado_em is null and expira_em > now()
$$;
revoke execute on function public.forn_convite_tentativa(text) from anon, authenticated, public;
grant execute on function public.forn_convite_tentativa(text) to service_role;

-- ─── quem tem login só entra com o login ───
create or replace function seg.forn_atual(p_token text) returns bigint
language sql stable security definer set search_path = public as $$
  select id from public.fornecedores where status = 'ativo' and (
    (p_token is not null and length(p_token) >= 32 and token = p_token and user_id is null)
    or (p_token is null and auth.uid() is not null and user_id = auth.uid())) limit 1
$$;

create or replace function public.forn_portal(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare fid bigint := seg.forn_atual(p_token); f fornecedores;
begin
  if fid is null then return null; end if;
  update fornecedores set ultimo_acesso = now() where id = fid returning * into f;
  return jsonb_build_object(
    'fornecedor', jsonb_build_object('nome', f.nome, 'cnpj', f.cnpj, 'contato', f.contato, 'email', f.email, 'telefone', f.telefone, 'whatsapp', f.whatsapp, 'marcas', f.marcas,
      'cep', f.cep, 'logradouro', f.logradouro, 'numero', f.numero, 'complemento', f.complemento, 'bairro', f.bairro, 'cidade', f.cidade, 'uf', f.uf, 'tem_login', f.user_id is not null),
    'empresa', (select valor->>'empresa' from config where chave = 'assistencia'),
    'oportunidades', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'titulo', o.titulo, 'prazo_resposta', o.prazo_resposta, 'publicada_em', o.publicada_em,
        'aberta', o.status = 'aberta' and (o.prazo_resposta is null or o.prazo_resposta > now()),
        'situacao', case when o.status = 'concluida' then 'concluida' when o.status = 'cancelada' then 'cancelada'
                         when o.status = 'aberta' and (o.prazo_resposta is null or o.prazo_resposta > now()) then 'aberta' else 'encerrada' end,
        'itens', (select count(*) from op_itens i where i.oportunidade_id = o.id),
        'proposta', pr.status, 'enviada_em', pr.enviada_em, 'vencedora', coalesce(pr.vencedora, false)) order by o.publicada_em desc nulls last)
      from op_fornecedores ofo join oportunidades o on o.id = ofo.oportunidade_id
      left join propostas pr on pr.oportunidade_id = o.id and pr.fornecedor_id = fid
      where ofo.fornecedor_id = fid and o.status <> 'rascunho'), '[]'::jsonb));
end $$;

-- O e-mail de quem tem login não muda por aqui: ele é o login.
create or replace function public.forn_meus_dados(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare fid bigint := seg.forn_atual(p_token);
begin
  if fid is null then raise exception 'acesso inválido'; end if;
  update fornecedores set contato = left(p->>'contato', 120),
    email = case when user_id is null then left(lower(trim(p->>'email')), 160) else email end,
    telefone = left(regexp_replace(coalesce(p->>'telefone', ''), '\D', '', 'g'), 15),
    whatsapp = left(regexp_replace(coalesce(p->>'whatsapp', ''), '\D', '', 'g'), 15),
    cep = left(regexp_replace(coalesce(p->>'cep', ''), '\D', '', 'g'), 8), logradouro = left(trim(p->>'logradouro'), 160), numero = left(trim(p->>'numero'), 20),
    complemento = left(trim(p->>'complemento'), 80), bairro = left(trim(p->>'bairro'), 80), cidade = left(trim(p->>'cidade'), 80), uf = upper(left(trim(p->>'uf'), 2)),
    marcas = coalesce((select array_agg(left(trim(x), 60)) from jsonb_array_elements_text(coalesce(p->'marcas', '[]'::jsonb)) x where trim(x) <> ''), '{}')
  where id = fid;
  return jsonb_build_object('ok', true);
end $$;

-- ─── login de fornecedor não enxerga nada interno ───
-- campanhas_venda era a única tabela legível por qualquer usuário logado.
drop policy campv_sel on public.campanhas_venda;
create policy campv_sel on public.campanhas_venda for select to authenticated using (public.eu() is not null);
