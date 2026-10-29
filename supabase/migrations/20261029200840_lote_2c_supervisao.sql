-- Lote 2, entrega C: redistribuir negócio ou atividade para outro vendedor, com motivo (central de pendências da Supervisão).

/** Passa um negócio (com as atividades abertas dele) ou uma atividade solta para outro vendedor.
 *  Quem pode: o dono ou o supervisor que enxerga as duas pessoas (a RLS de negocios/atividades confere).
 *  O motivo fica registrado nas observações do negócio ou no texto da atividade. */
create or replace function public.crm_redistribuir(p_tipo text, p_id bigint, p_para text, p_motivo text)
returns jsonb language plpgsql set search_path = '' as $$
declare ator text := public.eu(); m text := left(trim(coalesce(p_motivo, '')), 300); g public.negocios; a public.atividades; de text; n int := 0;
begin
  if ator is null then raise exception 'Sessão inválida'; end if;
  if m = '' then raise exception 'Diga o motivo da redistribuição.'; end if;
  if not exists (select 1 from public.pessoas p where p.id = p_para and p.ativo and p.tiny_vendedor_id is not null) then
    raise exception 'Escolha um vendedor ativo.';
  end if;
  if not (public.eh_dono() or p_para in (select seg.pessoas_visiveis()) or p_para = seg.minha_pessoa()) then
    raise exception 'Você não pode passar trabalho para essa pessoa.';
  end if;
  if p_tipo = 'negocio' then
    select * into g from public.negocios where id = p_id for update;
    if not found then raise exception 'Negócio não encontrado ou sem permissão.'; end if;
    if g.etapa in ('ganho', 'perdido') then raise exception 'Negócio já encerrado.'; end if;
    if g.pessoa_id = p_para then return jsonb_build_object('negocio', to_jsonb(g), 'atividades', 0, 'repetido', true); end if;
    de := g.pessoa_id;
    -- mesma ordem de locks do atividade_concluir: negócio, depois atividades
    perform 1 from public.atividades where negocio_id = g.id and not feito and arquivada_em is null for update;
    update public.atividades set pessoa_id = p_para where negocio_id = g.id and not feito and arquivada_em is null;
    get diagnostics n = row_count;
    update public.negocios set pessoa_id = p_para, mov_em = now(),
      obs = nullif(concat_ws(E'\n', obs, to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM') || ' — passado de ' || coalesce(de, '?') || ' para ' || p_para || ' por ' || ator || ': ' || m), '')
     where id = g.id returning * into g;
    if not found then raise exception 'Sem permissão para alterar este negócio.'; end if;
    return jsonb_build_object('negocio', to_jsonb(g), 'atividades', n, 'repetido', false);
  elsif p_tipo = 'atividade' then
    perform 1 from public.negocios x join public.atividades t on t.negocio_id = x.id where t.id = p_id for update of x;
    select * into a from public.atividades where id = p_id for update;
    if not found then raise exception 'Atividade não encontrada ou sem permissão.'; end if;
    if a.feito or a.arquivada_em is not null then raise exception 'Atividade já concluída.'; end if;
    if a.negocio_id is not null then raise exception 'Esta atividade é de um negócio: redistribua o negócio inteiro.'; end if;
    if a.pessoa_id = p_para then return jsonb_build_object('atividade', to_jsonb(a), 'repetido', true); end if;
    update public.atividades set pessoa_id = p_para,
      titulo = left(a.titulo || ' (passada de ' || coalesce(a.pessoa_id, '?') || ': ' || m || ')', 200)
     where id = a.id returning * into a;
    if not found then raise exception 'Sem permissão para alterar esta atividade.'; end if;
    return jsonb_build_object('atividade', to_jsonb(a), 'repetido', false);
  end if;
  raise exception 'Tipo inválido.';
end $$;
revoke execute on function public.crm_redistribuir(text, bigint, text, text) from public, anon;
grant execute on function public.crm_redistribuir(text, bigint, text, text) to authenticated;
