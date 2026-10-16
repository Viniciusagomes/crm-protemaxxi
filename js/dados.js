'use strict';
/* CRM Protemaxxi — conexão com o Supabase: login, carga dos dados e gravação. */

const sb = window.supabase.createClient(window.CRM_CONFIG.url, window.CRM_CONFIG.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });

let D = null;      // tudo o que está carregado (mesmo formato do painel local + dados do Tiny)
let EU = null;     // pessoa logada
const UI_PADRAO = { view: 'inicio', pessoa: '', sup: '', remModo: 'projecao', simMeta: 100, simCheck: 95, remPessoa: '', cfgTab: 'pessoas', cfgPessoa: '', fbPessoa: '', metasDet: '', vendSel: '', cliFiltro: 'todos', cliBusca: '', cliVend: '', cliOrdem: 'total', solCaixa: 'para_mim', solStatus: 'abertas', pedBusca: '', pedVend: '', pedSit: '', pedPeriodo: '30', expAba: 'pedidos', expFiltro: 'fazer' };
const UI = (() => { try { return { ...UI_PADRAO, ...JSON.parse(localStorage.getItem('crm-ui') || '{}') }; } catch { return { ...UI_PADRAO }; } })();
UI.data = hoje(); UI.mes = mesDe(hoje());
const guardarUI = () => { try { const { data, mes, ...resto } = UI; if (resto.view === 'tvestoque') resto.view = 'expedicao'; localStorage.setItem('crm-ui', JSON.stringify(resto)); } catch { /* sem armazenamento */ } };

function statusSalvo(txt, erro) { const el = $('#salvo'); if (el) { el.textContent = txt; el.classList.toggle('erro', !!erro); } }
async function ok(q) { const { data, error } = await q; if (error) throw new Error(error.message); return data; }
/** Busca todas as linhas (o Supabase devolve no máximo 1000 por vez). */
async function todas(fazer) {
  let out = [], de = 0;
  for (;;) { const lote = await ok(fazer().range(de, de + 999)); out = out.concat(lote); if (lote.length < 1000) break; de += 1000; }
  return out;
}

// ─── papéis ───
const ehDono = () => !!EU && (EU.papel === 'dono' || EU.permissoes?.admin);
const veTudoVendas = () => ehDono() || !!EU?.permissoes?.vendas_todas;
const temEquipe = () => !!EU && (ehDono() || D.pessoas.some(p => p.supervisor === EU.id && p.ativo));

// ─── carga ───
const mapaPessoa = r => ({
  id: r.id, nome: r.nome, cargo: r.cargo, papel: r.papel, supervisor: r.supervisor_id, vinculo: r.vinculo, dias: r.dias || [],
  ativo: r.ativo, inicio: r.inicio || '', cor: r.cor, tiny: r.tiny_vendedor_id || '', user_id: r.user_id, email: r.email || '',
  permissoes: r.permissoes || {}, ordem: r.ordem, tarefas: [], kpis: [], regras: [],
});
async function carregarTudo() {
  const inicioReg = addDias(`${addMes(mesDe(hoje()), -3)}-01`, 0);
  const inicioVendas = `${addMes(mesDe(hoje()), -13)}-01`;
  const [pessoas, tarefasR, kpisR, regrasR, cfg, rdia, rsem, rmes, fbs, vend, est] = await Promise.all([
    ok(sb.from('pessoas').select('*').order('ordem')),
    todas(() => sb.from('tarefas').select('*').order('ordem')),
    ok(sb.from('kpis').select('*').order('ordem')),
    ok(sb.from('regras').select('*').order('ordem')),
    ok(sb.from('config').select('*')),
    todas(() => sb.from('registros_dia').select('*').gte('data', inicioReg)),
    todas(() => sb.from('registros_semana').select('*').gte('segunda', addDias(inicioReg, -7))),
    ok(sb.from('registros_mes').select('*')),
    ok(sb.from('feedbacks').select('*').order('data', { ascending: false })),
    ok(sb.from('vendedores_tiny').select('*').order('nome')),
    ok(sb.from('sync_estado').select('*')),
  ]);
  const ps = pessoas.map(mapaPessoa);
  const porId = Object.fromEntries(ps.map(p => [p.id, p]));
  for (const t of tarefasR) porId[t.pessoa_id]?.tarefas.push({ id: t.id, titulo: t.titulo, freq: t.freq, bloco: t.bloco, diaSemana: t.dia_semana, diaMes: t.dia_mes, conferir: t.conferir, critica: t.critica });
  for (const k of kpisR) porId[k.pessoa_id]?.kpis.push({ id: k.id, nome: k.nome, un: k.un, meta: Number(k.meta), entrada: k.entrada, agreg: k.agreg, dir: k.dir, fonte: k.fonte });
  for (const r of regrasR) porId[r.pessoa_id]?.regras.push(r.dados);
  const c = Object.fromEntries(cfg.map(x => [x.chave, x.valor]));
  D = {
    empresa: c.empresa || 'Protemaxxi / CFTV Clube',
    config: { encargos: c.encargos ?? 37, dsr: c.dsr ?? true, feriados: c.feriados || [], solicitacoes: c.solicitacoes || {}, inicioUso: c.inicio_uso || '' },
    pessoas: ps, reg: {}, sem: {}, mes: {}, feedbacks: [], vendedoresTiny: vend,
    sync: Object.fromEntries(est.map(x => [x.chave, { ...x.valor, em_db: x.atualizado_em }])),
    pedidos: [], vendas: {}, ecom: {}, clientes: null, solicitacoes: [], interacoes: [],
  };
  for (const r of rdia) (D.reg[r.pessoa_id] ||= {})[r.data] = { checks: r.checks || {}, notas: r.notas || {}, kpi: r.kpi || {}, status: r.status || undefined, conferido: r.conferido, conferidoEm: r.conferido_em, obs: r.obs };
  for (const r of rsem) (D.sem[r.pessoa_id] ||= {})[r.segunda] = r.checks || {};
  for (const r of rmes) (D.mes[r.pessoa_id] ||= {})[r.mes] = { checks: r.checks || {}, kpi: r.kpi || {} };
  D.feedbacks = fbs.map(f => ({ id: f.id, pessoa: f.pessoa_id, autor: f.autor_id, tipo: f.tipo, data: f.data, texto: f.texto }));
  const { data: { user } } = await sb.auth.getUser();
  EU = user ? ps.find(p => p.user_id === user.id) || null : null;
  D.mesesCarregados = new Set([0, -1, -2, -3].map(n => addMes(mesDe(hoje()), n)));
  await Promise.all([carregarPedidos(inicioVendas), carregarSolicitacoes(), carregarInteracoes()]);
  await Promise.all([carregarBonif(mesDe(hoje())), carregarBonif(addMes(mesDe(hoje()), -1))]).catch(e => console.warn('bonif', e));
}
async function carregarPedidos(desde) {
  D.pedidos = await todas(() => sb.from('pedidos').select('id,numero,numero_ecommerce,canal,data,cliente_nome,cliente_chave,vendedor_id,vendedor_nome,valor,situacao,total_produtos,desconto,detalhado').gte('data', desde).order('data', { ascending: false }).order('id'));
  for (const p of D.pedidos) { p.valor = Number(p.valor) || 0; p.total_produtos = Number(p.total_produtos) || 0; p.desconto = Number(p.desconto) || 0; }
  recalcularVendas();
}
/** Quantidades vendidas dos produtos bonificados no mês (por vendedor). */
async function carregarBonif(m) {
  const cods = [...new Set(D.pessoas.flatMap(p => p.regras.filter(r => r.tipo === 'bonus_produtos').flatMap(r => (r.itens || []).flatMap(it => (it.codigos || []).map(c => c.codigo)))))];
  D.bonif ||= {};
  if (!cods.length) { D.bonif[m] = []; return; }
  D.bonif[m] = await ok(sb.rpc('qtd_produtos_mes', { p_mes: m, p_codigos: cods }));
}
function recalcularVendas() {
  D.pedidos.sort((a, b) => b.data.localeCompare(a.data) || (+b.numero || 0) - (+a.numero || 0));
  D.vendas = {}; D.ecom = {};
  for (const p of D.pedidos) {
    if (p.situacao === 'Cancelado') continue;
    if (p.vendedor_id) { const s = ((D.vendas[p.vendedor_id] ||= {})[p.data] ||= { valor: 0, pedidos: 0 }); s.valor += p.valor; s.pedidos++; }
    if (p.numero_ecommerce) { const s = (D.ecom[p.data] ||= { valor: 0, pedidos: 0 }); s.valor += p.valor; s.pedidos++; }
  }
}
async function carregarClientes(forcar) {
  if (D.clientes && !forcar) return D.clientes;
  D.clientes = await todas(() => sb.from('v_clientes').select('*').order('total', { ascending: false }));
  for (const c of D.clientes) { c.total = Number(c.total) || 0; c.pedidos = Number(c.pedidos); c.meses = Number(c.meses); c.dias_sem_comprar = Number(c.dias_sem_comprar); }
  return D.clientes;
}
async function carregarSolicitacoes() {
  D.solicitacoes = await todas(() => sb.from('solicitacoes').select('*').order('criado_em', { ascending: false }));
}
async function carregarInteracoes() {
  D.interacoes = await todas(() => sb.from('interacoes').select('*').order('criado_em', { ascending: false }));
}
/** Garante registros de um mês antigo carregados (ao navegar para trás). */
async function garantirMes(m) {
  if (!D || D.mesesCarregados.has(m)) return false;
  const ini = `${m}-01`, fim = `${m}-${pad(ultimoDia(m))}`;
  const [rdia, rsem] = await Promise.all([
    todas(() => sb.from('registros_dia').select('*').gte('data', ini).lte('data', fim)),
    todas(() => sb.from('registros_semana').select('*').gte('segunda', addDias(ini, -7)).lte('segunda', fim)),
  ]);
  for (const r of rdia) (D.reg[r.pessoa_id] ||= {})[r.data] = { checks: r.checks || {}, notas: r.notas || {}, kpi: r.kpi || {}, status: r.status || undefined, conferido: r.conferido, conferidoEm: r.conferido_em, obs: r.obs };
  for (const r of rsem) (D.sem[r.pessoa_id] ||= {})[r.segunda] = r.checks || {};
  if (m < `${addMes(mesDe(hoje()), -13)}`) {
    const mais = await todas(() => sb.from('pedidos').select('id,numero,numero_ecommerce,canal,data,cliente_nome,cliente_chave,vendedor_id,vendedor_nome,valor,situacao,total_produtos,desconto,detalhado').gte('data', ini).lte('data', fim));
    const ja = new Set(D.pedidos.map(p => p.id));
    for (const p of mais) if (!ja.has(p.id)) { p.valor = Number(p.valor) || 0; D.pedidos.push(p); }
    recalcularVendas();
  }
  await carregarBonif(m).catch(() => {});
  D.mesesCarregados.add(m);
  return true;
}

// ─── gravação (cada mudança grava só o que mudou) ───
const pendentes = new Map();
let timerGravar = null;
function marcar(tipo, ...args) {
  pendentes.set(tipo + ':' + args.join('|'), () => GRAVAR[tipo](...args));
  statusSalvo('Salvando…');
  clearTimeout(timerGravar); timerGravar = setTimeout(gravarPendentes, 350);
}
async function gravarPendentes() {
  timerGravar = null;
  const fns = [...pendentes.values()]; pendentes.clear();
  try { for (const f of fns) await f(); statusSalvo('✓ Salvo às ' + hora()); }
  catch (e) { console.error(e); statusSalvo('⚠ Não salvou: ' + e.message, true); avisar('Erro ao salvar: ' + e.message); }
}
window.addEventListener('beforeunload', e => { if (timerGravar || pendentes.size) { gravarPendentes(); e.preventDefault(); } });

const GRAVAR = {
  dia: async (pid, d) => {
    const r = D.reg[pid]?.[d]; if (!r) return;
    await ok(sb.from('registros_dia').upsert({ pessoa_id: pid, data: d, checks: r.checks, notas: r.notas, kpi: r.kpi, status: r.status || null,
      conferido: !!r.conferido, conferido_em: r.conferidoEm || null, conferido_por: r.conferido ? EU?.id : null, obs: r.obs || null, atualizado_em: new Date().toISOString() }));
  },
  sem: async (pid, seg) => { await ok(sb.from('registros_semana').upsert({ pessoa_id: pid, segunda: seg, checks: D.sem[pid]?.[seg] || {} })); },
  mes: async (pid, m) => { const r = D.mes[pid]?.[m] || {}; await ok(sb.from('registros_mes').upsert({ pessoa_id: pid, mes: m, checks: r.checks || {}, kpi: r.kpi || {} })); },
  pessoa: async (pid) => {
    const p = pessoa(pid); if (!p) return;
    await ok(sb.from('pessoas').upsert({ id: p.id, nome: p.nome, cargo: p.cargo, papel: p.papel, supervisor_id: p.supervisor || null, vinculo: p.vinculo,
      dias: p.dias, ativo: p.ativo, inicio: p.inicio || null, cor: p.cor, tiny_vendedor_id: p.tiny || null, permissoes: p.permissoes || {}, ordem: D.pessoas.indexOf(p) }));
    await ok(sb.from('tarefas').delete().eq('pessoa_id', pid));
    if (p.tarefas.length) await ok(sb.from('tarefas').insert(p.tarefas.map((t, i) => ({ id: t.id, pessoa_id: pid, titulo: t.titulo, freq: t.freq, bloco: t.bloco || 'dia', dia_semana: +t.diaSemana || 5, dia_mes: +t.diaMes || 5, conferir: t.conferir || '', critica: !!t.critica, ordem: i }))));
    await ok(sb.from('kpis').delete().eq('pessoa_id', pid));
    if (p.kpis.length) await ok(sb.from('kpis').insert(p.kpis.map((k, i) => ({ id: k.id, pessoa_id: pid, nome: k.nome, un: k.un, meta: +k.meta || 0, entrada: k.entrada, agreg: k.agreg || 'soma', dir: k.dir || 'maior', fonte: k.fonte || 'manual', ordem: i }))));
    await ok(sb.from('regras').delete().eq('pessoa_id', pid));
    if (p.regras.length) await ok(sb.from('regras').insert(p.regras.map((r, i) => ({ pessoa_id: pid, ordem: i, dados: r }))));
  },
  ordem: async () => { for (const [i, p] of D.pessoas.entries()) await ok(sb.from('pessoas').update({ ordem: i }).eq('id', p.id)); },
  config: async () => {
    await ok(sb.from('config').upsert([
      { chave: 'empresa', valor: D.empresa }, { chave: 'encargos', valor: +D.config.encargos || 0 }, { chave: 'dsr', valor: !!D.config.dsr },
      { chave: 'feriados', valor: D.config.feriados }, { chave: 'solicitacoes', valor: D.config.solicitacoes || {} },
    ]));
  },
};
/** Qual pessoa/config um caminho de edição (data-path) afeta. */
function marcarPath(path) {
  const ks = path.split('.');
  if (ks[0] === 'pessoas') marcar('pessoa', D.pessoas[+ks[1]].id);
  else marcar('config');
}

// ─── funções do servidor ───
async function chamarFuncao(nome, corpo, query = '') {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(`${window.CRM_CONFIG.url}/functions/v1/${nome}${query}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, apikey: window.CRM_CONFIG.anonKey },
    body: JSON.stringify(corpo || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !j.ok) throw new Error(j.erro || j.motivo || `erro ${r.status}`);
  return j;
}
