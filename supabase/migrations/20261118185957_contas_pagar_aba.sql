-- Contas a pagar (18/11, pedido do Vinícius): uma lista só do que há para pagar, com três origens:
--   e-mail (boletos lidos em boletos@, como já era), planilha do fornecedor (importada pela aba) e lançamento manual.
-- Só os donos (public.eh_dono()) mexem nesta aba. A tabela continua boletos_pagar (o resumo das 17h já lê dela).

-- 1) colunas novas; boleto de planilha/manual pode não ter linha digitável ainda
alter table public.boletos_pagar alter column linha drop not null;
alter table public.boletos_pagar add column if not exists origem text not null default 'email',
  add column if not exists documento text, add column if not exists parcela text, add column if not exists criado_por text;
alter table public.boletos_pagar drop constraint if exists boletos_pagar_origem_check;
alter table public.boletos_pagar add constraint boletos_pagar_origem_check check (origem in ('email', 'planilha', 'manual'));
create index if not exists boletos_pagar_venc_idx on public.boletos_pagar (status, vencimento);

-- 2) CNPJ com dígitos verificadores certos (a leitura do e-mail pegava números do código de barras)
create or replace function seg.cnpj_valido(c text) returns boolean language plpgsql immutable set search_path = public as $$
declare d text := regexp_replace(coalesce(c, ''), '\D', '', 'g'); s int; i int; dv1 int; dv2 int;
  p1 int[] := '{5,4,3,2,9,8,7,6,5,4,3,2}'; p2 int[] := '{6,5,4,3,2,9,8,7,6,5,4,3,2}';
begin
  if length(d) <> 14 or d ~ '^(\d)\1{13}$' then return false; end if;
  s := 0; for i in 1..12 loop s := s + substr(d, i, 1)::int * p1[i]; end loop; dv1 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  s := 0; for i in 1..13 loop s := s + substr(d, i, 1)::int * p2[i]; end loop; dv2 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  return dv1 = substr(d, 13, 1)::int and dv2 = substr(d, 14, 1)::int;
end $$;
grant execute on function seg.cnpj_valido(text) to authenticated;
-- limpa os CNPJs lidos errado (e o alerta que vinha deles); a releitura dos PDFs preenche de novo o que achar
update public.boletos_pagar set cnpj = null, fornecedor_id = null,
  alerta = nullif(regexp_replace(coalesce(alerta, ''), '(^| · )CNPJ do beneficiário não está no cadastro de fornecedores', '', 'g'), '')
where cnpj is not null and not seg.cnpj_valido(cnpj);

-- 3) só os donos lançam e apagam (apagar só o que não veio do e-mail)
drop policy if exists boletos_pagar_ins on public.boletos_pagar;
create policy boletos_pagar_ins on public.boletos_pagar for insert to authenticated with check (public.eh_dono() and origem in ('planilha', 'manual'));
drop policy if exists boletos_pagar_del on public.boletos_pagar;
create policy boletos_pagar_del on public.boletos_pagar for delete to authenticated using (public.eh_dono() and origem <> 'email');

-- 4) importar a planilha do fornecedor: [{documento, parcela, valor, vencimento}]
--    pula o que já foi importado (mesmo fornecedor, documento e parcela); se o boleto da parcela já chegou por e-mail,
--    só completa o documento/parcela nele; o que venceu antes de p_pagos_antes entra como pago.
create or replace function public.contas_pagar_importar(p_fornecedor text, p_cnpj text, p_itens jsonb, p_pagos_antes date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; v_doc text; v_par text; v_valor numeric; v_venc date; v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), '');
  v_forn text := nullif(trim(coalesce(p_fornecedor, '')), ''); v_fid bigint; v_id bigint; n_novos int := 0; n_pagos int := 0; n_ja int := 0; n_lig int := 0;
begin
  if not public.eh_dono() then raise exception 'Só os donos importam contas a pagar.'; end if;
  if v_forn is null then raise exception 'Informe o fornecedor.'; end if;
  if v_cnpj is not null and not seg.cnpj_valido(v_cnpj) then raise exception 'CNPJ inválido.'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'Nenhuma parcela para importar.'; end if;
  if jsonb_array_length(p_itens) > 500 then raise exception 'No máximo 500 parcelas por vez.'; end if;
  if v_cnpj is not null then select id into v_fid from fornecedores where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = v_cnpj limit 1; end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    v_doc := nullif(left(trim(coalesce(it->>'documento', '')), 60), ''); v_par := nullif(left(trim(coalesce(it->>'parcela', '')), 20), '');
    v_valor := round((it->>'valor')::numeric, 2); v_venc := (it->>'vencimento')::date;
    if v_valor is null or v_valor <= 0 or v_venc is null then raise exception 'Parcela sem valor ou vencimento: %', it; end if;
    if exists (select 1 from boletos_pagar where origem <> 'email' and beneficiario = v_forn and coalesce(documento, '') = coalesce(v_doc, '')
               and coalesce(parcela, '') = coalesce(v_par, '') and vencimento = v_venc) then n_ja := n_ja + 1; continue; end if;
    select id into v_id from boletos_pagar where origem = 'email' and documento is null and vencimento = v_venc and abs(valor - v_valor) <= 0.01
      and (v_cnpj is null or cnpj is null or cnpj = v_cnpj) order by (cnpj = v_cnpj) desc nulls last limit 1;
    if v_id is not null then
      update boletos_pagar set documento = v_doc, parcela = v_par, beneficiario = coalesce(beneficiario, v_forn), cnpj = coalesce(cnpj, v_cnpj),
        fornecedor_id = coalesce(fornecedor_id, v_fid) where id = v_id;
      n_lig := n_lig + 1; continue;
    end if;
    insert into boletos_pagar (origem, linha, valor, vencimento, beneficiario, cnpj, fornecedor_id, documento, parcela, status, pago_em, obs, criado_por)
    values ('planilha', null, v_valor, v_venc, v_forn, v_cnpj, v_fid, v_doc, v_par,
      case when v_venc < p_pagos_antes then 'pago' else 'a_pagar' end,
      case when v_venc < p_pagos_antes then v_venc::timestamptz end,
      case when v_venc < p_pagos_antes then 'Venceu antes da importação: considerado pago.' end, seg.minha_pessoa());
    n_novos := n_novos + 1; if v_venc < p_pagos_antes then n_pagos := n_pagos + 1; end if;
  end loop;
  return jsonb_build_object('novos', n_novos, 'pagos', n_pagos, 'ja_tinha', n_ja, 'ligados_email', n_lig);
end $$;
revoke all on function public.contas_pagar_importar(text, text, jsonb, date) from public, anon;
grant execute on function public.contas_pagar_importar(text, text, jsonb, date) to authenticated;

-- 5) boleto que chega por e-mail depois: se casa com uma parcela da planilha/manual (mesmo valor e vencimento,
--    CNPJ compatível, sem boleto ainda), fica um registro só: o do e-mail, com o documento/parcela da planilha.
create or replace function public.contas_pagar_casar_email() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; n int;
begin
  select count(*) into n from boletos_pagar b where b.origem <> 'email' and b.linha is null and b.status = 'a_pagar' and b.vencimento = new.vencimento
    and abs(b.valor - new.valor) <= 0.01 and (new.cnpj is null or b.cnpj is null or b.cnpj = new.cnpj);
  if n <> 1 then return null; end if;
  select * into p from boletos_pagar b where b.origem <> 'email' and b.linha is null and b.status = 'a_pagar' and b.vencimento = new.vencimento
    and abs(b.valor - new.valor) <= 0.01 and (new.cnpj is null or b.cnpj is null or b.cnpj = new.cnpj);
  update boletos_pagar set documento = p.documento, parcela = p.parcela, beneficiario = coalesce(new.beneficiario, p.beneficiario),
    cnpj = coalesce(new.cnpj, p.cnpj), fornecedor_id = coalesce(new.fornecedor_id, p.fornecedor_id), criado_por = coalesce(criado_por, p.criado_por) where id = new.id;
  delete from boletos_pagar where id = p.id;
  return null;
end $$;
revoke all on function public.contas_pagar_casar_email() from public, anon, authenticated;
drop trigger if exists boletos_pagar_casar on public.boletos_pagar;
create trigger boletos_pagar_casar after insert on public.boletos_pagar for each row when (new.origem = 'email' and new.vencimento is not null and new.valor is not null)
  execute function public.contas_pagar_casar_email();

-- 6) pedido do Vinícius: tudo o que venceu antes de hoje já foi pago
update public.boletos_pagar set status = 'pago', pago_em = vencimento::timestamptz, obs = coalesce(obs || ' · ', '') || 'Venceu antes de 18/11/2026: considerado pago.'
where status = 'a_pagar' and vencimento < date '2026-11-18';
