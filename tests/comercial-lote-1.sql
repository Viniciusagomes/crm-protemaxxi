-- Integração com PostgreSQL/RLS. Todas as linhas e auditorias de teste são revertidas.
begin;
do $$
declare
  uid uuid; pid text; outro text; chave text:='teste-lote1-'||gen_random_uuid();
  ng bigint; atv bigint; pr bigint; pr_outro bigint; inter bigint; prox bigint;
  r jsonb; antes bigint; falhou boolean;
begin
  select id,user_id into pid,uid from public.pessoas where id='pedro' and ativo and user_id is not null;
  if uid is null then raise exception 'Fixture exige vendedor Pedro ativo'; end if;
  select id into outro from public.pessoas where ativo and id<>pid and supervisor_id is distinct from pid and user_id is not null limit 1;
  insert into public.negocios(titulo,pessoa_id,cliente_chave,cliente_nome,etapa,criado_por)
  values('Teste lote 1 (rollback)',pid,chave,'Cliente de teste','orcamento',pid) returning id into ng;
  insert into public.atividades(negocio_id,pessoa_id,cliente_chave,tipo,titulo,quando)
  values(ng,pid,chave,'whatsapp','Teste contato',(now() at time zone 'America/Sao_Paulo')::date) returning id into atv;
  insert into public.prospeccao(data,pessoa_id,cliente_chave,cliente_nome,lista)
  values('2099-12-01',pid,chave,'Cliente de teste','reativacao') returning id into pr;
  insert into public.prospeccao(data,pessoa_id,cliente_chave,cliente_nome,lista)
  values('2099-12-01',outro,chave||'-outro','Outro teste','reativacao') returning id into pr_outro;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
  execute 'set local role authenticated';
  if public.eu() is distinct from pid then raise exception 'Identidade de teste não reconhecida'; end if;
  r:=public.prospeccao_registrar(pr,'orcamento',null);
  inter:=(r->'interacao'->>'id')::bigint;
  if inter is null or (r->'interacao'->>'proximo_contato')::date <> (now() at time zone 'America/Sao_Paulo')::date+2 then raise exception 'Contato sem histórico/retorno'; end if;
  select count(*) into antes from public.interacoes where cliente_chave=chave;
  perform public.prospeccao_registrar(pr,'orcamento',null);
  if (select count(*) from public.interacoes where cliente_chave=chave)<>antes then raise exception 'Retry duplicou histórico'; end if;
  falhou:=false;
  begin perform public.prospeccao_registrar(pr,'comprou',null); exception when others then falhou:=true; end;
  if not falhou or (select resultado from public.prospeccao where id=pr)<>'orcamento' then raise exception 'Conflito não protegido'; end if;
  perform public.prospeccao_registrar(pr,'pular','orcamento');
  if not (select feito from public.interacoes where id=inter) then raise exception 'Retorno antigo ficou pendente'; end if;
  if (select count(*) from public.interacoes where cliente_chave=chave)<>antes then raise exception 'Pular criou contato'; end if;
  falhou:=false;
  begin perform public.prospeccao_registrar(pr_outro,'comprou',null); exception when others then falhou:=true; end;
  if not falhou then raise exception 'RLS permitiu editar outra carteira'; end if;
  falhou:=false;
  begin perform public.atividade_concluir(atv,'Teste',(now() at time zone 'America/Sao_Paulo')::date+1,'invalido','Retorno'); exception when check_violation then falhou:=true; end;
  if not falhou or (select feito from public.atividades where id=atv) then raise exception 'Falha parcial ao concluir'; end if;
  r:=public.atividade_concluir(atv,'Pediu cotação',(now() at time zone 'America/Sao_Paulo')::date+1,'followup','Revisar cotação');
  prox:=(r->'proxima'->>'id')::bigint;
  if prox is null or r->'interacao'->>'id' is null or not (r->'atividade'->>'feito')::boolean then raise exception 'Conclusão incompleta'; end if;
  select count(*) into antes from public.atividades where negocio_id=ng;
  perform public.atividade_concluir(atv,'Retry',(now() at time zone 'America/Sao_Paulo')::date+1,'followup','Repetido');
  if (select count(*) from public.atividades where negocio_id=ng)<>antes then raise exception 'Conclusão duplicou retorno'; end if;

  -- Fechamento arquiva apenas a cobrança automática, preservando manual e pós-venda.
  insert into public.atividades(negocio_id,pessoa_id,tipo,titulo,automatica)
  values(ng,pid,'followup','Cobrança automática','cobrar:teste:'||ng);
  insert into public.atividades(negocio_id,pessoa_id,tipo,titulo) values(ng,pid,'posvenda','Pós-venda válido');
  update public.negocios set etapa='ganho' where id=ng;
  if exists(select 1 from public.atividades where negocio_id=ng and automatica like 'cobrar:%' and arquivada_em is null) then raise exception 'Cobrança não arquivada'; end if;
  if exists(select 1 from public.atividades where negocio_id=ng and automatica is null and arquivada_em is not null) then raise exception 'Atividade manual arquivada automaticamente'; end if;
  insert into public.atividades(negocio_id,pessoa_id,tipo,titulo,automatica)
  values(ng,pid,'followup','Cobrança atrasada','cobrar:teste-tardio:'||ng);
  if exists(select 1 from public.atividades where negocio_id=ng and automatica like 'cobrar:%' and arquivada_em is null) then raise exception 'Inserção tardia não protegida'; end if;
  execute 'reset role';
  -- Inatividade e compras posteriores não alteram etapas sem confirmação.
  update public.negocios set etapa='orcamento' where id=ng;
  update public.negocios set mov_em=now()-interval '40 days',criado_em=now()-interval '40 days',orcamento_data=(now()-interval '40 days')::date where id=ng;
  perform public.crm_ganhos(); perform public.crm_limpeza(15);
  if (select etapa from public.negocios where id=ng)<>'orcamento' then raise exception 'Fechamento automático indevido'; end if;
  if not (select inativo from public.v_crm_revisoes where negocio_id=ng) then raise exception 'Alerta de recuperação ausente'; end if;
  execute 'set local role authenticated';
  insert into public.atividades(negocio_id,pessoa_id,cliente_chave,tipo,titulo,automatica)
  values(ng,pid,chave,'followup','Retomar negociação','cobrar:recuperar:'||ng) returning id into atv;
  if not (select inativo from public.v_crm_revisoes where negocio_id=ng) then raise exception 'Criar tarefa automática contou como movimento'; end if;
  perform public.atividade_concluir(atv,'Contato realizado');
  if (select inativo from public.v_crm_revisoes where negocio_id=ng) then raise exception 'Concluir contato automático não renovou movimento'; end if;
  execute 'reset role';
end $$;
rollback;
select 'OK: RPCs, idempotência, conflito, RLS, arquivamento e inatividade; dados de teste revertidos' as resultado;
