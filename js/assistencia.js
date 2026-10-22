'use strict';
/* Assistência técnica (OS + RMA). Módulo independente: textos, prazos e dados da empresa vêm de config 'assistencia'.
   Fluxo (obrigatório, o banco não deixa pular etapa): Recebido (fotos obrigatórias) → Em análise → [orçamento | peça | assistência
          do fabricante (RMA) → retornou] → Pronto para retirada → Entregue. Uma OS pode ter vários produtos (at_os_itens).
   Tiny: a OS é criada também no Tiny (ERP) ao ser aberta e cada mudança de situação vai para lá (função assistencia-tiny). Cada etapa gera aviso ao cliente (WhatsApp com um toque; e-mail automático quando configurado)
   e aparece na página pública "Acompanhe sua OS" (os.html?t=<código>). */

const AT = { os: null, rma: null, cfg: null, carregando: false, em: 0 };
const ST_OS = {
  recebido: ['📥 Recebido', ''], em_analise: ['🔬 Em análise', 'azul'], aguardando_cliente: ['💬 Aguardando cliente', 'med'], aguardando_peca: ['⏳ Aguardando peça', 'med'],
  na_assistencia: ['🏭 Assistência/fábrica', 'azul'], retornou: ['↩ Retornou', 'azul'], pronto: ['✅ Disponível p/ retirada', 'ok'], entregue: ['🏁 Entregue', ''], cancelado: ['✕ Cancelada', 'ruim'],
};
const TIPOS_OS = { garantia_fabrica: '🏭 Garantia do fabricante', garantia_loja: '🏪 Garantia da loja', manutencao: '🛠 Manutenção (paga)', troca: '🔁 Troca' };
const RES_OS = { reparado: '🛠 Reparado', trocado: '🔁 Trocado', sem_defeito: '✔ Sem defeito constatado', negado: '🚫 Garantia negada', devolvido: '↩ Devolvido sem reparo', credito: '💳 Virou crédito' };
const COLUNAS_OS = ['recebido', 'em_analise', 'aguardando_cliente', 'aguardando_peca', 'na_assistencia', 'retornou', 'pronto'];
const linkOS = o => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}os.html?t=${o.token}`;

async function carregarAT(forcar) {
  if (AT.carregando || (!forcar && AT.os && Date.now() - AT.em < 60e3)) return;
  AT.carregando = true;
  try {
    const desde = new Date(Date.now() - 180 * 864e5).toISOString();
    const [os, rma, cfg] = await Promise.all([
      todas(() => sb.from('at_os').select('*').or(`status.not.in.(entregue,cancelado),criado_em.gte.${desde}`).order('criado_em', { ascending: false })),
      todas(() => sb.from('at_rma').select('*').order('enviado_em', { ascending: false })),
      sb.from('config').select('valor').eq('chave', 'assistencia').maybeSingle().then(r => r.data?.valor || {}),
    ]);
    AT.os = os; AT.rma = rma; AT.cfg = cfg; AT.em = Date.now();
  } finally { AT.carregando = false; }
}
const diasDesde = d => Math.max(0, Math.round((Date.now() - new Date(d)) / 864e5));
/** Garantia pela data da compra: loja (dias) e fabricante (meses), conforme a configuração. */
function garantiaDe(data) {
  if (!data) return null;
  const dias = diasDesde(data + 'T12:00:00'), loja = +(AT.cfg?.garantia_loja_dias || 90), fab = +(AT.cfg?.garantia_fabrica_meses || 12) * 30.4;
  return { dias, loja: dias <= loja, fabrica: dias <= fab };
}
const garantiaOS = o => garantiaDe(o.data_compra);

// ─── compras do cliente (data da venda e produtos iguais já comprados) ───
const normTxt = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const grupo = (l, f) => l.reduce((a, x) => { const k = f(x); if (k) (a[k] ||= []).push(x); return a; }, {});
/** Pedidos do cliente nos últimos 3 anos (com itens), guardados por cliente. */
async function comprasDoCliente(chave, doc, nome) {
  const k = [chave, doc, nome].join('|'); AT.compras ||= {};
  if (!AT.compras[k]) { const { data, error } = await sb.rpc('at_compras_cliente', { p_chave: chave || null, p_doc: doc || null, p_nome: nome || null }); if (error) throw error; AT.compras[k] = data || []; }
  return AT.compras[k];
}
/** Compras do mesmo produto (pelo código ou por ≥60% das palavras da descrição), da mais recente para a mais antiga. */
function comprasIguais(compras, desc, codigo) {
  const tk = normTxt(desc).split(' ').filter(t => t.length >= 2), out = [];
  if (!tk.length && !codigo) return out;
  for (const p of compras || []) for (const i of p.itens || []) {
    let igual = !!(codigo && i.codigo && String(i.codigo) === String(codigo));
    if (!igual && tk.length) { const it = new Set(normTxt(i.descricao).split(' ')); igual = tk.filter(t => it.has(t)).length / tk.length >= 0.6; }
    if (igual) out.push({ numero: String(p.numero ?? ''), data: p.data, quantidade: +i.quantidade || 1, descricao: i.descricao });
  }
  return out.sort((a, b) => String(b.data).localeCompare(String(a.data)));
}
function resumoIguais(l) {
  if (!l.length) return 'Nenhuma compra deste produto encontrada para o cliente (últimos 3 anos).';
  const u = soma(l.map(x => x.quantidade)), g = garantiaDe(l[0].data);
  return `Última compra: pedido ${l[0].numero} em ${pd(l[0].data).toLocaleDateString('pt-BR')} (há ${g.dias} dia(s): ${g.loja ? 'na garantia da loja' : 'fora da garantia da loja'}, ${g.fabrica ? 'na do fabricante' : 'fora da do fabricante'})`
    + (l.length > 1 || u > 1 ? ` · ${N(u)} unidade(s) iguais em ${l.length} pedido(s): ${l.slice(0, 6).map(x => `${x.numero} (${pd(x.data).toLocaleDateString('pt-BR')})`).join(', ')}` : '');
}
function textoAviso(o, status, extra) {
  const t = AT.cfg?.textos?.[status]; if (!t) return '';
  return t.replace(/\{os\}/g, o.numero).replace(/\{cliente\}/g, (o.cliente_nome || '').split(' ')[0]).replace(/\{produto\}/g, o.produto_descricao || '')
    .replace(/\{empresa\}/g, AT.cfg?.empresa || '').replace(/\{link\}/g, linkOS(o)).replace(/\{extra\}/g, extra || '').replace(/\s+/g, ' ').trim();
}

// ─── tela principal ───
function vAssistencia() {
  if (!AT.os) { if (!AT.carregando) carregarAT().then(render).catch(e => avisar(e.message)); return topo('Assistência técnica', '') + '<div class="card vazio">Carregando as OS…</div>'; }
  if (!['visao', 'os'].includes(UI.atAba)) UI.atAba = 'os';
  if (!AT.hist && !AT.histCarregando) { AT.histCarregando = true; carregarHistAT().then(render).catch(() => {}).finally(() => { AT.histCarregando = false; }); }   // marca as reincidentes
  const abertas = AT.os.filter(o => !['entregue', 'cancelado'].includes(o.status));
  const cab = topo('Assistência técnica', 'Garantia, manutenção e RMA (assistência / fábrica): do recebimento do equipamento até a entrega, com aviso ao cliente em cada etapa. As OS do Tiny também estão aqui.',
      `<button class="btn" data-a="atAtualizar">↻ Atualizar</button><button class="btn pri" data-a="atNova">+ Nova OS</button>`)
    + `<div class="chips">${[['visao', '📊 Visão geral', ''], ['os', '🛠 Ordens de serviço', abertas.length]].map(([k, n, b]) => `<button class="chip ${UI.atAba === k ? 'on' : ''}" data-a="atAba" data-v="${k}">${n}${b !== '' ? `<span class="n">${b}</span>` : ''}</button>`).join('')}</div>`;
  return cab + (UI.atAba === 'visao' ? visaoAT(abertas) : abaOS(abertas));
}

/** Visão geral: números, o que pede atenção hoje, indicadores e reincidência. */
function visaoAT(abertas) {
  const p = pendenciasAT(), rmaAbertos = (AT.rma || []).filter(r => !r.retornou_em);
  const kpi = (rot, val, sub, cor, filtro) => `<div class="card kpi-card" style="cursor:pointer" data-a="atFiltro" data-v="${filtro}"><div class="rot">${rot}</div><div class="val ${cor}">${val}</div><div class="sub">${sub}</div></div>`;
  const v3 = D.sync?.v3 || {};
  return `${v3.conectado === false || v3.erro ? `<div class="alerta ruim mt"><span class="ic">🧾</span><span>A conexão com o Tiny v3 caiu: OS abertas no Tiny não entram e as situações não vão para lá. ${ehDono() ? '<a href="#/config" data-a="cfgTiny">Reconectar</a>' : 'Avise o administrador.'}</span></div>` : ''}
    <div class="grid g4 mt">${kpi('OS em aberto', abertas.length, `${abertas.filter(o => o.status === 'recebido').length} aguardando análise`, 'verde', 'todas')}
      ${kpi('Prontas para retirada', abertas.filter(o => o.status === 'pronto').length, `${p.prontasVelhas.length} há 7+ dias`, p.prontasVelhas.length ? 'c-med' : 'c-ok', 'prontas')}
      ${kpi('Na assistência / fábrica', p.fora.length, `${p.foraAtr.length} passaram da previsão`, p.foraAtr.length ? 'c-ruim' : '', 'fabrica')}
      ${kpi('Atrasadas', p.atrasadas.length, 'passaram da previsão ao cliente', p.atrasadas.length ? 'c-ruim' : 'c-ok', 'atrasadas')}</div>
    <div class="mt">${avisoAssistencia() || '<div class="alerta ok"><span class="ic">👏</span><span>Nada pendente na assistência hoje.</span></div>'}</div>
    <h2 class="mt2">📊 Indicadores</h2>${abaIndicadoresAT()}
    <h2 class="mt2">🔁 Reincidência</h2>${abaReincidencia()}`;
}

/** Ordens de serviço: quadro por etapa + lista, com filtros (assistência/fábrica, Tiny, reincidentes, atrasadas). */
function abaOS(abertas) {
  UI.atFiltro ||= 'todas';
  const rein = reincidencia()?.ids || new Set(), h = hoje();
  const filtros = {
    todas: ['🗂 Todas', () => true], fabrica: ['🏭 Na assistência / fábrica', o => o.status === 'na_assistencia' || (AT.rma || []).some(r => r.os_id === o.id)],
    prontas: ['✅ Prontas', o => o.status === 'pronto'], atrasadas: ['⏰ Atrasadas', o => !['entregue', 'cancelado', 'pronto'].includes(o.status) && o.previsao && o.previsao < h],
    reincidentes: ['🔁 Reincidentes', o => rein.has(o.id)], tiny: ['🧾 Vindas do Tiny', o => o.origem === 'tiny'],
  };
  const f = (filtros[UI.atFiltro] || filtros.todas)[1], lista = AT.os.filter(f), abertasF = abertas.filter(f);
  const chips = `<div class="chips mt">${Object.entries(filtros).map(([k, [n, fn]]) => `<button class="chip ${UI.atFiltro === k ? 'on' : ''}" data-a="atFiltro" data-v="${k}">${n}<span class="n">${abertas.filter(fn).length}</span></button>`).join('')}</div>`;
  const card = o => { const atr = o.previsao && o.previsao < h;
    return `<div class="kcard ${atr ? 'sem' : ''}" data-a="atAbrir" data-id="${o.id}"><div class="kcard-nome">OS ${esc(o.numero)} · ${esc(o.cliente_nome)}</div>
      <div class="kcard-tit">${esc(o.produto_descricao)}${o.numero_serie ? ` · SN ${esc(o.numero_serie)}` : ''}</div>
      <div class="kcard-pe"><span>${TIPOS_OS[o.tipo]?.split(' ')[0] || ''} há ${diasDesde(o.criado_em)} dia(s)${o.origem === 'tiny' ? ' · 🧾 Tiny' : ''}${rein.has(o.id) ? ' · 🔁' : ''}</span><span>${o.previsao ? (atr ? '⚠ ' : '') + fmtCurta(o.previsao) : ''}</span></div></div>`; };
  const quadro = UI.atFiltro === 'fabrica' ? abaRMA() : `<div class="kanban-crm kanban-os mt">${COLUNAS_OS.map(k => { const l = abertasF.filter(o => o.status === k);
      return `<div class="kcol"><div class="kcol-cab"><b>${ST_OS[k][0]}</b><span>${l.length}</span></div><div class="kcol-lista">${l.map(card).join('') || '<div class="kvazio">—</div>'}</div></div>`; }).join('')}</div>`;
  return chips + quadro + `<div class="card mt"><div class="secao-titulo"><h2>${UI.atFiltro === 'todas' ? 'Todas as OS' : filtros[UI.atFiltro][0]}</h2><small>${lista.length} · abertas + últimos 180 dias</small></div>
      ${listaCurta('atLista', `<table class="tabela"><thead><tr><th>OS</th><th>Cliente</th><th>Equipamento</th><th>Tipo</th><th>Etapa</th><th>Aberta</th></tr></thead><tbody>
      ${lista.map(o => `<tr class="clic" data-a="atAbrir" data-id="${o.id}"><td><b>${esc(o.numero)}</b>${o.origem === 'tiny' ? '<br><small class="mut">🧾 Tiny</small>' : ''}${rein.has(o.id) ? '<br><small class="c-med">🔁 reincidente</small>' : ''}</td><td>${esc(o.cliente_nome)}</td><td><small>${esc(o.produto_descricao)}${o.numero_serie ? '<br>SN ' + esc(o.numero_serie) : ''}</small></td>
        <td><small>${TIPOS_OS[o.tipo] || ''}</small></td><td><span class="tag ${ST_OS[o.status][1]}">${ST_OS[o.status][0]}</span>${o.resultado ? `<br><small>${RES_OS[o.resultado]}</small>` : ''}</td><td><small>${new Date(o.criado_em).toLocaleDateString('pt-BR')}</small></td></tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhuma OS com esse filtro.</td></tr>'}
      </tbody></table>`, 'Buscar OS, cliente, produto, nº de série…', true)}</div>`;
}

function abaRMA() {
  const osPor = Object.fromEntries(AT.os.map(o => [o.id, o]));
  const lista = (AT.rma || []).filter(r => osPor[r.os_id]);
  const abertos = lista.filter(r => !r.retornou_em), fechados = lista.filter(r => r.retornou_em);
  const porAss = Object.entries(abertos.reduce((a, r) => { a[r.assistencia] = (a[r.assistencia] || 0) + 1; return a; }, {}));
  const linha = r => { const o = osPor[r.os_id], atr = !r.retornou_em && r.previsao_retorno && r.previsao_retorno < hoje();
    return `<tr class="clic" data-a="atAbrir" data-id="${o.id}"><td><b>OS ${esc(o.numero)}</b><br><small>${esc(o.cliente_nome)}</small></td><td><small>${esc(o.produto_descricao)}${o.numero_serie ? '<br>SN ' + esc(o.numero_serie) : ''}</small></td>
      <td><b>${esc(r.assistencia)}</b><br><small>${r.protocolo ? 'protocolo ' + esc(r.protocolo) : 'sem protocolo'}${r.rastreio ? ' · rastreio ' + esc(r.rastreio) : ''}</small></td>
      <td><small>enviado ${fmtCurta(r.enviado_em)} · ${diasDesde(r.enviado_em + 'T12:00')} dia(s)</small>${r.previsao_retorno ? `<br><small class="${atr ? 'c-ruim' : ''}">${atr ? '⚠ ' : ''}previsão ${fmtCurta(r.previsao_retorno)}</small>` : ''}</td>
      <td>${r.retornou_em ? `<span class="tag ${r.resultado === 'negado' ? 'ruim' : 'ok'}">${RES_OS[r.resultado] || r.resultado || 'retornou'}</span><br><small>${fmtCurta(r.retornou_em)}</small>` : '<span class="tag azul">Fora (RMA)</span>'}</td></tr>`; };
  return `<p class="explica mt">Tudo o que saiu para conserto fora (assistência técnica, fábrica ou distribuidor) fica nesta lista única. Todo dia o sino e o Início lembram quantos produtos estão fora e quais passaram da previsão.</p>
    <div class="card mt"><div class="secao-titulo"><h2>Na assistência / fábrica agora</h2><small>${porAss.map(([a, n]) => `${esc(a)}: ${n}`).join(' · ')}</small></div>
      ${abertos.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>OS</th><th>Equipamento</th><th>Assistência</th><th>Tempo</th><th>Situação</th></tr></thead><tbody>${abertos.map(linha).join('')}</tbody></table></div>` : '<div class="vazio">Nenhum equipamento na assistência ou na fábrica.</div>'}</div>
    <div class="card mt"><div class="secao-titulo"><h2>Retornaram</h2><small>${fechados.length}</small></div>${fechados.length ? listaCurta('rmaFech', `<table class="tabela"><tbody>${fechados.map(linha).join('')}</tbody></table>`, 'Buscar…') : '<div class="vazio">—</div>'}</div>`;
}

function abaIndicadoresAT() {
  const ent = AT.os.filter(o => o.status === 'entregue' && o.entregue_em);
  const tempo = ent.length ? soma(ent.map(o => (new Date(o.entregue_em) - new Date(o.criado_em)) / 864e5)) / ent.length : null;
  const ret = (AT.rma || []).filter(r => r.retornou_em), tAss = ret.length ? soma(ret.map(r => (new Date(r.retornou_em) - new Date(r.enviado_em)) / 864e5)) / ret.length : null;
  const conta = (l, f) => Object.entries(l.reduce((a, x) => { const k = f(x) || '—'; a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const tab = (tit, l, nomes = {}) => `<div class="card"><h2>${tit}</h2><table class="tabela"><tbody>${l.slice(0, 12).map(([k, n]) => `<tr><td>${esc(nomes[k] || k)}</td><td class="dir"><b>${n}</b></td></tr>`).join('') || '<tr><td class="mut">—</td></tr>'}</tbody></table></div>`;
  return `<div class="grid g4 mt"><div class="card kpi-card"><div class="rot">Tempo médio da OS</div><div class="val">${tempo == null ? '—' : Math.round(tempo) + ' dia(s)'}</div><div class="sub">da entrada à entrega · ${ent.length} OS</div></div>
      <div class="card kpi-card"><div class="rot">Tempo na assistência</div><div class="val">${tAss == null ? '—' : Math.round(tAss) + ' dia(s)'}</div><div class="sub">${ret.length} retorno(s)</div></div>
      <div class="card kpi-card"><div class="rot">Garantias negadas</div><div class="val">${AT.os.filter(o => o.resultado === 'negado').length}</div></div>
      <div class="card kpi-card"><div class="rot">Sem defeito constatado</div><div class="val">${AT.os.filter(o => o.resultado === 'sem_defeito').length}</div></div></div>
    <div class="grid g3 mt">${tab('Marcas com mais OS', conta(AT.os, o => o.marca))}${tab('Produtos com mais OS', conta(AT.os, o => o.produto_descricao))}${tab('Resultado', conta(AT.os.filter(o => o.resultado), o => o.resultado), RES_OS)}</div>
    <p class="explica mt">Produtos com muitas OS são candidatos a sair da compra ou a ter um fornecedor alternativo.</p>`;
}

// ─── nova OS ───
function formOS() {
  if (!D.clientes) carregarClientes().catch(() => {});
  if (!AT.cfg) carregarAT().catch(() => {});
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Nova OS</h2><p class="mut">Registre o equipamento na frente do cliente. As fotos são obrigatórias: o produto inteiro e a etiqueta com o nº de série.</p>
    <div class="form-grid">
      <label class="campo inteiro">Cliente *<input type="text" id="osCli" list="osListaCli" placeholder="Nome do cliente"></label>
      <label class="campo">Telefone / WhatsApp<input type="tel" id="osFone" placeholder="DDD + número"></label>
      <label class="campo">E-mail<input type="email" id="osEmail"></label>
      <label class="campo">CPF / CNPJ <small class="mut">(para criar a OS no Tiny)</small><input type="text" id="osDoc" inputmode="numeric"></label>
      <label class="campo">Tipo<select id="osTipo">${Object.entries(TIPOS_OS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
      <label class="campo">Nº do pedido ou NF que o cliente trouxe <small class="mut">(opcional)</small><input type="text" id="osPedido" placeholder="Ex.: 77910"></label>
      <div class="campo inteiro" id="osCompras"></div>
      <div class="campo inteiro"><b>Produtos da OS</b> <small class="mut">(cada produto com as suas fotos; a data e o pedido da compra são puxados das vendas do cliente)</small><div id="osItens">${blocoItemOS(1)}</div>
        <button type="button" class="btn peq" data-a="atAddItem">＋ Adicionar mais produtos</button></div>
      <label class="campo inteiro">Defeito relatado pelo cliente *<textarea id="osDefeito" rows="2"></textarea></label>
      <label class="campo">Acessórios entregues<input type="text" id="osAcess" placeholder="Ex.: fonte, cabo, caixa"></label>
      <label class="campo">Estado físico<input type="text" id="osEstado" placeholder="Ex.: riscos na lateral, sem caixa"></label>
      <label class="campo">Previsão para o cliente<input type="date" id="osPrev" value="${addDias(hoje(), +(AT.cfg?.analise_dias || 3))}"></label>
      <label class="campo inteiro">📷 Outras fotos <small class="mut">(opcional: caixa, acessórios, defeito visível… mínimo de ${AT.cfg?.fotos_minimas || 2} fotos somando todas)</small><input type="file" id="osFotos" accept="image/*" capture="environment" multiple></label>
    </div>
    <datalist id="osListaCli">${(D.clientes || []).slice(0, 4000).map(c => `<option value="${esc(c.nome)}">`).join('')}</datalist>
    <datalist id="osListaComprados"></datalist>
    <datalist id="osListaMarca">${(AT.cfg?.assistencias || []).map(a => `<option value="${esc(a)}">`).join('')}</datalist>
    <div class="mt"><button class="btn pri" data-a="atSalvar">Abrir OS</button></div>`, true);
  $('#osCli').addEventListener('change', e => { const c = (D.clientes || []).find(x => x.nome === e.target.value); if (c) { if (c.fone && !$('#osFone').value) $('#osFone').value = c.fone; if (c.email && !$('#osEmail').value) $('#osEmail').value = c.email; if (c.doc && !$('#osDoc').value) $('#osDoc').value = c.doc; } atBuscarCompras(); });
  $('#osDoc').addEventListener('change', () => atBuscarCompras());
  $('#osPedido').addEventListener('change', e => { const p = (D.pedidos || []).find(x => String(x.numero) === e.target.value.trim()); if (p && !$('#osCli').value) { $('#osCli').value = p.cliente_nome; $('#osCli').dispatchEvent(new Event('change')); } });
  $('#osItens').addEventListener('change', e => { if (e.target.classList.contains('it-desc')) atCompraItem(e.target.closest('.os-item'));
    if (e.target.classList.contains('it-pedido') || e.target.classList.contains('it-data')) e.target.dataset.auto = ''; });
  AT.comprasForm = null;
}
/** Busca as vendas do cliente (nome, CPF/CNPJ ou cadastro) e mostra no formulário. */
async function atBuscarCompras() {
  const box = $('#osCompras'); if (!box) return;
  const nome = ($('#osCli')?.value || '').trim(), doc = ($('#osDoc')?.value || '').replace(/\D/g, ''), c = (D.clientes || []).find(x => x.nome === nome);
  if (!nome && !doc) { box.innerHTML = ''; return; }
  box.innerHTML = '<small class="mut">🛒 Buscando as compras do cliente…</small>';
  try {
    const l = await comprasDoCliente(c?.chave, doc, nome); AT.comprasForm = l;
    const lista = $('#osListaComprados'); if (lista) lista.innerHTML = [...new Set(l.flatMap(p => (p.itens || []).map(i => i.descricao)))].slice(0, 500).map(d => `<option value="${esc(d)}">`).join('');
    box.innerHTML = l.length ? `<div class="alerta ok"><span class="ic">🛒</span><span><b>${l.length} compra(s) do cliente nos últimos 3 anos</b> · última em ${pd(l[0].data).toLocaleDateString('pt-BR')} (pedido ${esc(String(l[0].numero))}). Ao escolher o produto, a data e o pedido da compra entram sozinhos e aparecem as outras unidades iguais que ele comprou.</span></div>`
      : '<div class="alerta med"><span class="ic">🛒</span><span>Não achamos vendas deste cliente nos últimos 3 anos. Confira o nome ou informe o CPF/CNPJ.</span></div>';
    document.querySelectorAll('#osItens .os-item').forEach(atCompraItem);
  } catch (e) { box.innerHTML = `<small class="c-ruim">Não deu para buscar as compras: ${esc(e.message)}</small>`; }
}
/** Para um produto do formulário: acha a compra, preenche pedido/data e mostra as compras iguais. */
function atCompraItem(b) {
  const info = b?.querySelector('.it-compra'); if (!info) return;
  const desc = b.querySelector('.it-desc')?.value.trim();
  if (!desc || !AT.comprasForm) { info.innerHTML = ''; return; }
  const l = comprasIguais(AT.comprasForm, desc), ped = b.querySelector('.it-pedido'), dt = b.querySelector('.it-data');
  if (l.length) { if (!ped.value || ped.dataset.auto) { ped.value = l[0].numero; ped.dataset.auto = '1'; } if (!dt.value || dt.dataset.auto) { dt.value = l[0].data; dt.dataset.auto = '1'; } }
  info.innerHTML = `<small class="${l.length ? '' : 'mut'}">🛒 ${esc(resumoIguais(l))}</small>`;
}
/** Bloco de um produto no cadastro da OS (o botão "Adicionar mais produtos" cria outro). */
function blocoItemOS(n) {
  return `<div class="os-item" data-item="${n}"><div class="os-item-cab"><b>Produto ${n}</b>${n > 1 ? `<button type="button" class="icone-btn" data-a="atRemItem" title="Remover este produto">✕</button>` : ''}</div>
    <div class="form-grid"><label class="campo inteiro">Equipamento *<input type="text" class="it-desc" list="osListaComprados" placeholder="Ex.: Câmera Intelbras VHD 1220 B"></label>
    <label class="campo">Marca<input type="text" class="it-marca" list="osListaMarca"></label><label class="campo">Modelo<input type="text" class="it-modelo"></label>
    <label class="campo">Nº de série<input type="text" class="it-serie"></label><label class="campo">Quantidade<input type="number" class="it-qtd" min="1" step="1" value="1"></label>
    <label class="campo inteiro">Defeito deste produto <small class="mut">(se for diferente do geral)</small><input type="text" class="it-defeito"></label>
    <label class="campo">Pedido da compra<input type="text" class="it-pedido" placeholder="puxado das vendas"></label><label class="campo">Data da compra<input type="date" class="it-data"></label>
    <div class="campo inteiro it-compra"></div>
    <label class="campo inteiro">📷 Fotos deste produto * <small class="mut">(produto inteiro + etiqueta com nº de série)</small><input type="file" class="it-fotos" accept="image/*" capture="environment" multiple></label></div></div>`;
}
function atAddItem() {
  const box = $('#osItens'); if (!box) return;
  box.insertAdjacentHTML('beforeend', blocoItemOS(box.querySelectorAll('.os-item').length + 1));
  box.lastElementChild.querySelector('.it-desc')?.focus();
}
function atRemItem(el) { el.closest('.os-item')?.remove(); document.querySelectorAll('#osItens .os-item').forEach((b, i) => { b.querySelector('.os-item-cab b').textContent = 'Produto ' + (i + 1); }); }
const itensDoForm = () => [...document.querySelectorAll('#osItens .os-item')].map((b, i) => { const q = c => (b.querySelector(c)?.value || '').trim();
  return { seq: i + 1, descricao: q('.it-desc'), marca: q('.it-marca') || null, modelo: q('.it-modelo') || null, numero_serie: q('.it-serie') || null, quantidade: Math.max(1, +q('.it-qtd') || 1), defeito: q('.it-defeito') || null, pedido_numero: q('.it-pedido') || null, data_compra: q('.it-data') || null }; });
/** Cria a OS no Tiny (em segundo plano: se o Tiny falhar, a OS fica na Intranet com o aviso e o botão "Enviar ao Tiny"). */
async function atEnviarTiny(o) {
  try { const r = await chamarFuncao('assistencia-tiny', { acao: 'enviar', os_id: o.id }); Object.assign(o, { tiny_os_id: r.tiny_os_id, tiny_os_numero: String(r.tiny_os_numero ?? o.tiny_os_numero ?? ''), tiny_erro: null }); return r; }
  catch (e) { o.tiny_erro = e.message; throw e; }
}
async function atSincTiny(o) { if (!o.tiny_os_id) return; try { await chamarFuncao('assistencia-tiny', { acao: 'situacao', os_id: o.id }); o.tiny_erro = null; } catch (e) { o.tiny_erro = e.message; avisar('OS salva, mas o Tiny não atualizou: ' + e.message); } }

async function atSalvar() {
  const v = id => ($('#' + id)?.value || '').trim();
  const itens = itensDoForm(), fotosIt = [...document.querySelectorAll('#osItens .os-item')].map(b => [...(b.querySelector('.it-fotos')?.files || [])]);
  const nome = v('osCli'), prod = itens[0]?.descricao, defeito = v('osDefeito'), fotos = [...($('#osFotos')?.files || [])];
  const minimo = +(AT.cfg?.fotos_minimas || 2), totalFotos = fotos.length + soma(fotosIt.map(f => f.length));
  if (!nome || !prod || !defeito) return avisar('Preencha o cliente, pelo menos um produto e o defeito.');
  if (itens.some(i => !i.descricao)) return avisar('Preencha o equipamento de cada produto (ou remova o bloco vazio).');
  const semFoto = fotosIt.findIndex(f => !f.length);
  if (semFoto >= 0) return avisar(`Tire a foto do produto ${semFoto + 1}: o produto inteiro e a etiqueta com o nº de série.`);
  if (totalFotos < minimo) return avisar(`Tire pelo menos ${minimo} fotos no total: o produto inteiro e a etiqueta com o nº de série.`);
  const c = (D.clientes || []).find(x => x.nome === nome);
  const btn = document.querySelector('[data-a="atSalvar"]'); if (btn) { btn.disabled = true; btn.textContent = 'Salvando e enviando fotos…'; }
  try {
    const resumo = itens.length > 1 ? `${prod} + ${itens.length - 1} produto(s)` : prod;
    const o = await ok(sb.from('at_os').insert({ cliente_nome: nome, cliente_chave: c?.chave || null, cliente_doc: v('osDoc').replace(/\D/g, '') || c?.doc || null, cliente_fone: v('osFone').replace(/\D/g, '') || null, cliente_email: v('osEmail') || null,
      tipo: v('osTipo'), pedido_numero: v('osPedido') || itens.find(i => i.pedido_numero)?.pedido_numero || null, produto_descricao: resumo, marca: itens[0].marca, modelo: itens[0].modelo, numero_serie: itens[0].numero_serie,
      data_compra: itens.find(i => i.data_compra)?.data_compra || null, defeito_relatado: defeito, acessorios: v('osAcess') || null, estado_fisico: v('osEstado') || null, previsao: v('osPrev') || null,
      criado_por: EU.id, responsavel_id: EU.id }).select().single());
    const salvos = await ok(sb.from('at_os_itens').insert(itens.map(i => ({ ...i, os_id: o.id }))).select());
    const idSeq = Object.fromEntries(salvos.map(x => [x.seq, x.id]));
    for (let k = 0; k < itens.length; k++) await enviarFotosOS(o, fotosIt[k], 'entrada', idSeq[itens[k].seq]);
    await enviarFotosOS(o, fotos, 'entrada');
    await gerarAvisos(o, 'recebido', '');
    AT.os.unshift(o); fecharModal(); avisar(`OS ${o.numero} aberta. Criando no Tiny…`); render(); atAbrir(o.id);
    atEnviarTiny(o).then(r => { avisar(`OS ${o.numero} criada no Tiny (nº ${r.tiny_os_numero}).`); atAbrir(o.id); }).catch(e => { avisar('A OS foi aberta, mas não foi criada no Tiny: ' + e.message); atAbrir(o.id); });
  } catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Abrir OS'; } throw e; }
}
async function enviarFotosOS(o, arquivos, etapa, itemId) {
  for (const a of arquivos) {
    if (!/^image\//.test(a.type)) continue;
    const blob = await reduzirFoto(a), caminho = `os/${o.id}/${etapa}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
    const { error } = await sb.storage.from('anexos').upload(caminho, blob, { contentType: 'image/jpeg' });
    if (error) throw new Error('Foto não enviada: ' + error.message);
    await ok(sb.from('at_fotos').insert({ os_id: o.id, etapa, caminho, por: EU.id, item_id: itemId || null }));
  }
}
/** Cria os avisos da etapa (WhatsApp para enviar com um toque; e-mail sai sozinho quando o envio de e-mail estiver configurado). */
async function gerarAvisos(o, status, extra, texto, assunto) {
  const msg = texto || textoAviso(o, status, extra); if (!msg) return;
  const linhas = [];
  if (o.avisar_whatsapp && o.cliente_fone) linhas.push({ os_id: o.id, canal: 'whatsapp', destino: o.cliente_fone, mensagem: msg, por: EU.id });
  if (o.avisar_email && o.cliente_email) linhas.push({ os_id: o.id, canal: 'email', destino: o.cliente_email, assunto: assunto || `${AT.cfg?.empresa || ''} · OS ${o.numero}: ${ST_OS[status]?.[0].replace(/^\S+\s/, '') || ''}`, mensagem: msg, por: EU.id });
  if (linhas.length) await ok(sb.from('at_avisos').insert(linhas));
}

// ─── ficha da OS ───
async function atAbrir(id) {
  const o = AT.os.find(x => String(x.id) === String(id)) || await ok(sb.from('at_os').select('*').eq('id', id).single());
  const [ev, fotos, avisos, itens, orcs] = await Promise.all([
    ok(sb.from('at_eventos').select('*').eq('os_id', o.id).order('em')), ok(sb.from('at_fotos').select('*').eq('os_id', o.id).order('em')), ok(sb.from('at_avisos').select('*').eq('os_id', o.id).order('criado_em', { ascending: false })),
    ok(sb.from('at_os_itens').select('*').eq('os_id', o.id).order('seq')), ok(sb.from('at_orcamentos').select('*').eq('os_id', o.id).order('criado_em', { ascending: false })),
  ]);
  const { data: urls } = fotos.length ? await sb.storage.from('anexos').createSignedUrls(fotos.map(f => f.caminho), 3600) : { data: [] };
  const rmas = (AT.rma || []).filter(r => r.os_id === o.id), g = garantiaOS(o), aberta = !['entregue', 'cancelado'].includes(o.status);
  const campo = (r, v) => v ? `<div><span>${r}</span><b>${esc(String(v))}</b></div>` : '';
  const acoes = {
    recebido: [['em_analise', '🔬 Iniciar análise', 'pri']],
    em_analise: [['na_assistencia', '🏭 Enviar à assistência / fábrica (RMA)', 'pri'], ['aguardando_cliente', '💬 Orçamento ao cliente', ''], ['aguardando_peca', '⏳ Aguardando peça', ''], ['pronto', '✅ Pronto (reparado / trocado / sem defeito)', '']],
    aguardando_cliente: o.orcamento_status === 'aguardando' ? [] : [['em_analise', '👍 Cliente aprovou (por telefone/loja)', 'pri'], ['pronto', '👎 Cliente recusou: devolver', '']],
    aguardando_peca: [['em_analise', '📦 Peça chegou', 'pri']],
    na_assistencia: [['retornou', '↩ Registrar retorno da assistência', 'pri']],
    retornou: [['pronto', '✅ Pronto para retirada', 'pri']],
    pronto: [['entregue', '🏁 Entregue ao cliente', 'pri']],
  }[o.status] || [];
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button>
    <small class="mut">${TIPOS_OS[o.tipo]} · aberta ${new Date(o.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} ${o.origem === 'tiny' ? 'no Tiny (importada)' : 'por ' + esc(nomeP(o.criado_por))}</small>
    <h2 style="margin:4px 0">OS ${esc(o.numero)} · ${esc(o.cliente_nome)} <span class="tag ${ST_OS[o.status][1]}">${ST_OS[o.status][0]}</span></h2>
    ${itens.length ? `<table class="tabela mt"><thead><tr><th>#</th><th>Produto</th><th>Marca / modelo</th><th>Nº de série</th><th class="dir">Qtd</th><th>Defeito</th><th>Compra</th></tr></thead><tbody>${itens.map(i => { const gi = garantiaDe(i.data_compra);
      return `<tr><td>${i.seq}</td><td><b>${esc(i.descricao)}</b></td><td>${esc([i.marca, i.modelo].filter(Boolean).join(' '))}</td><td>${esc(i.numero_serie || '—')}</td><td class="dir">${N(i.quantidade)}</td><td><small>${esc(i.defeito || '')}</small></td>
      <td>${gi ? `<small>${pd(i.data_compra).toLocaleDateString('pt-BR')}${i.pedido_numero ? ' · pedido ' + esc(i.pedido_numero) : ''}<br>há ${gi.dias} dia(s) · <span class="${gi.loja || gi.fabrica ? 'c-ok' : 'c-ruim'}">${gi.loja ? 'garantia loja' : gi.fabrica ? 'garantia fabricante' : 'fora da garantia'}</span></small>` : '<small class="mut">—</small>'}</td></tr>`; }).join('')}</tbody></table>` : ''}
    <div id="osComprasFicha" class="mt"></div>${blocoAssistencia(o)}${blocoOrcamento(o, orcs)}
    ${o.orcamento_resposta?.em ? `<div class="alerta ${o.orcamento_resposta.aprova ? 'ok' : 'ruim'} mt"><span class="ic">💬</span><span><b>Cliente ${o.orcamento_resposta.aprova ? 'APROVOU' : 'RECUSOU'} o orçamento pelo link</b> em ${new Date(o.orcamento_resposta.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${esc(o.orcamento_resposta.nome || '')} (CPF/CNPJ final ${esc(o.orcamento_resposta.doc_final || '')})${o.orcamento_resposta.obs ? '<br>Obs.: ' + esc(o.orcamento_resposta.obs) : ''}</span></div>` : ''}
    <div class="alerta ${o.tiny_os_id ? 'ok' : o.tiny_erro ? 'ruim' : 'med'} mt"><span class="ic">🧾</span><span>${o.tiny_os_id ? `<b>OS nº ${esc(o.tiny_os_numero || '')} no Tiny</b> · as mudanças de situação vão para lá sozinhas${o.tiny_erro ? `<br><small class="c-ruim">Última sincronização falhou: ${esc(o.tiny_erro)}</small>` : ''}` : o.tiny_erro ? `<b>Não foi criada no Tiny:</b> ${esc(o.tiny_erro)}` : 'Criando no Tiny…'}</span>
      ${!o.tiny_os_id ? `<button class="btn peq" data-a="atTinyEnviar" data-id="${o.id}">Enviar ao Tiny</button>` : o.tiny_erro ? `<button class="btn peq" data-a="atTinySinc" data-id="${o.id}">Sincronizar de novo</button>` : ''}</div>
    <div class="os-campos">${itens.length ? '' : campo('Equipamento', o.produto_descricao) + campo('Marca / modelo', [o.marca, o.modelo].filter(Boolean).join(' ')) + campo('Nº de série', o.numero_serie)}
      ${campo('Defeito relatado', o.defeito_relatado)}${campo('Acessórios', o.acessorios)}${campo('Estado físico', o.estado_fisico)}
      ${campo('Pedido / NF', [o.pedido_numero, o.nf_numero].filter(Boolean).join(' · '))}${campo('Compra', o.data_compra && pd(o.data_compra).toLocaleDateString('pt-BR'))}
      ${campo('Contato', [o.cliente_fone, o.cliente_email].filter(Boolean).join(' · '))}${campo('Previsão', o.previsao && pd(o.previsao).toLocaleDateString('pt-BR'))}
      ${campo('Diagnóstico', o.diagnostico)}${campo('Solução', o.solucao)}${campo('Resultado', RES_OS[o.resultado])}${campo('Orçamento', o.orcamento_valor && `${R(o.orcamento_valor)} (${o.orcamento_status || ''})`)}</div>
    ${g ? `<div class="alerta ${g.loja || g.fabrica ? 'ok' : 'ruim'} mt"><span class="ic">🛡</span><span>Comprado há ${g.dias} dia(s): ${g.loja ? 'dentro da garantia da loja' : 'fora da garantia da loja'} · ${g.fabrica ? 'dentro da garantia do fabricante' : 'fora da garantia do fabricante'}.</span></div>` : ''}
    <div class="acoes mt"><button class="btn peq" data-a="atCopiarLink" data-id="${o.id}">🔗 Copiar link "Acompanhe sua OS"</button><button class="btn peq" data-a="atTermo" data-id="${o.id}">🖨 Termo de recebimento</button>
      ${aberta ? `<button class="btn peq" data-a="atEditar" data-id="${o.id}">✎ Testes / diagnóstico</button>` : ''}${aberta && ehDono() ? `<button class="btn peq perigo" data-a="atMudar" data-id="${o.id}" data-v="cancelado">Cancelar OS</button>` : ''}</div>
    ${acoes.length ? `<div class="os-proximo"><b>Próximo passo:</b> ${acoes.map(([s, n, c]) => `<button class="btn ${c}" data-a="atMudar" data-id="${o.id}" data-v="${s}">${n}</button>`).join('')}</div>` : ''}
    <div class="grid g2 mt"><div>
      <h3>📷 Fotos</h3>${[...itens.map(i => [i.id, `Produto ${i.seq}: ${i.descricao}`]), [null, itens.length ? 'Gerais' : '']].map(([iid, tit]) => { const fs = fotos.map((f, k) => [f, urls?.[k]?.signedUrl]).filter(([f, u]) => u && (iid ? f.item_id === iid : !itens.some(i => i.id === f.item_id)));
        return fs.length ? `${tit ? `<small class="mut"><b>${esc(tit)}</b></small>` : ''}<div class="anexos">${fs.map(([f, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener" title="${esc(f.etapa)}"><img src="${esc(u)}" alt="${esc(f.etapa)}" loading="lazy"></a>`).join('')}</div>` : ''; }).join('')}
      <div class="anexos"><label class="novo">＋ Foto${itens.length > 1 ? `<select id="osFotoItem" style="margin-top:4px;font-size:11px">${itens.map(i => `<option value="${i.id}">produto ${i.seq}</option>`).join('')}<option value="">geral</option></select>` : itens.length ? `<input type="hidden" id="osFotoItem" value="${itens[0].id}">` : ''}<select id="osFotoEtapa" style="margin-top:4px;font-size:11px"><option value="teste">teste</option><option value="envio">envio</option><option value="retorno">retorno</option><option value="saida">saída</option><option value="entrada">entrada</option></select><input type="file" accept="image/*" capture="environment" multiple hidden data-c="atFotos" data-id="${o.id}"></label></div>
      ${rmas.length ? `<h3 class="mt">🏭 Assistência</h3>${rmas.map(r => `<div class="atv"><div><b>${esc(r.assistencia)}</b> · enviado ${fmtCurta(r.enviado_em)}${r.protocolo ? ' · protocolo ' + esc(r.protocolo) : ''}${r.rastreio ? ' · rastreio ' + esc(r.rastreio) : ''}<br>
        <small>${r.retornou_em ? `retornou ${fmtCurta(r.retornou_em)} · ${RES_OS[r.resultado] || ''}${r.laudo ? ' · ' + esc(r.laudo) : ''}${r.custo ? ' · custo ' + R(r.custo) : ''}` : r.previsao_retorno ? 'previsão ' + fmtCurta(r.previsao_retorno) : ''}</small></div></div>`).join('')}` : ''}
      <h3 class="mt">📲 Avisos ao cliente</h3>${avisos.map(a => `<div class="atv"><div style="flex:1"><b>${a.canal === 'whatsapp' ? '💬 WhatsApp' : '✉ E-mail'}</b> · <small>${{ pendente: 'pendente', enviado: 'enviado ✓', erro: 'erro', sem_config: 'aguardando configurar o e-mail', cancelado: 'cancelado' }[a.status]}</small><br><small>${esc(a.mensagem.slice(0, 140))}</small></div>
        ${a.canal === 'whatsapp' && a.status === 'pendente' ? `<button class="btn peq pri" data-a="atWa" data-id="${a.id}">Enviar</button>` : ''}</div>`).join('') || `<p class="mut">${o.cliente_fone || o.cliente_email ? 'Nenhum aviso ainda.' : 'Cadastre telefone ou e-mail do cliente para avisar.'}</p>`}
    </div><div><h3>Linha do tempo</h3>${ev.map(e => `<div class="tl ${e.publico ? '' : 'interno'}"><b>${esc(e.texto)}</b><small>${new Date(e.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${e.por ? ' · ' + esc(nomeP(e.por)) : ''}${e.publico ? '' : ' · interno'}</small></div>`).join('')}
      <div class="nova-atv"><input type="text" id="osNota" placeholder="Anotação na linha do tempo…"><label class="mut" style="font-size:12px"><input type="checkbox" id="osNotaPub"> cliente vê</label><button class="btn peq" data-a="atNota" data-id="${o.id}">+ Anotar</button></div></div></div>`, true);
  atComprasFicha(o, itens);
}
/** Na ficha: compras do cliente para cada produto da OS (data da venda e unidades iguais compradas). */
function atComprasFicha(o, itens) {
  comprasDoCliente(o.cliente_chave, o.cliente_doc, o.cliente_nome).then(l => {
    const box = $('#osComprasFicha'); if (!box || l == null) return;
    const lista = itens.length ? itens : [{ seq: 1, descricao: o.produto_descricao, produto_codigo: o.produto_codigo }];
    box.innerHTML = `<div class="alerta"><span class="ic">🛒</span><span><b>Compras do cliente</b> <small class="mut">(${l.length} pedido(s) nos últimos 3 anos)</small>${lista.map(i => `<br><b>Produto ${i.seq}:</b> ${esc(resumoIguais(comprasIguais(l, i.descricao, i.produto_codigo)))}`).join('')}</span></div>`;
  }).catch(() => {});
}

// mudar de etapa: pede os dados da etapa e a mensagem ao cliente
function atMudarForm(id, status) {
  if (status === 'aguardando_cliente') return atOrcForm(id);   // orçamento: tela própria (custo × margem)
  const o = AT.os.find(x => String(x.id) === String(id));
  const ass = AT.cfg?.assistencias || [];
  const extra = {
    na_assistencia: `<label class="campo">Assistência / fábrica *<input type="text" id="mdAss" list="mdListaAss" value="${esc(o.marca || '')}"></label><datalist id="mdListaAss">${ass.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
      <label class="campo">Protocolo / RMA do fabricante<input type="text" id="mdProt"></label><label class="campo">NF de remessa<input type="text" id="mdNF"></label>
      <label class="campo">Rastreio<input type="text" id="mdRast"></label><label class="campo">Previsão de retorno<input type="date" id="mdPrev" value="${addDias(hoje(), +(AT.cfg?.assistencia_dias || 30))}"></label>`,
    retornou: `<label class="campo">Resultado *<select id="mdRes">${['reparado', 'trocado', 'negado', 'credito'].map(k => `<option value="${k}">${RES_OS[k]}</option>`).join('')}</select></label>
      <label class="campo">Custo (R$)<input type="number" step="0.01" id="mdCusto"></label><label class="campo inteiro">Laudo da assistência<textarea id="mdLaudo" rows="2"></textarea></label>`,
    aguardando_cliente: `<label class="campo">Valor do orçamento (R$) *<input type="number" step="0.01" id="mdOrc"></label><label class="campo">Nº da OS no Tiny (cobrança)<input type="text" id="mdTiny"></label>
      <label class="campo">CPF / CNPJ do cliente${o.cliente_doc ? '' : ' <small class="c-med">(sem ele o cliente não aprova pelo link)</small>'}<input type="text" id="mdDoc" inputmode="numeric" value="${esc(o.cliente_doc || '')}"></label>
      <p class="explica inteiro">O cliente aprova ou recusa pelo link "Acompanhe sua OS", confirmando o CPF/CNPJ e o nome completo (<b>${esc(o.cliente_nome)}</b>). Se ele responder por telefone ou na loja, use os botões da ficha.</p>`,
    pronto: `<label class="campo">Resultado *<select id="mdRes">${['reparado', 'trocado', 'sem_defeito', 'negado', 'devolvido', 'credito'].map(k => `<option value="${k}" ${(o.resultado || (o.status === 'na_assistencia' ? (o.orcamento_status === 'recusado' ? 'devolvido' : 'reparado') : '')) === k ? 'selected' : ''}>${RES_OS[k]}</option>`).join('')}</select></label>
      <label class="campo inteiro">Solução / o que foi feito<textarea id="mdSol" rows="2">${esc(o.solucao || '')}</textarea></label>`,
    entregue: `<label class="campo">Retirado por *<input type="text" id="mdQuem" value="${esc(o.cliente_nome)}"></label>`,
    cancelado: `<label class="campo inteiro">Motivo *<input type="text" id="mdMotivo"></label>`,
  }[status] || '';
  modal(`<button class="btn peq fechar" data-a="atAbrirVolta" data-id="${o.id}">✕</button><h2>OS ${esc(o.numero)} → ${ST_OS[status][0]}</h2>
    <div class="form-grid">${extra}
      <label class="campo inteiro">Mensagem ao cliente <small class="mut">(vai pelo WhatsApp/e-mail e aparece no "Acompanhe sua OS")</small><textarea id="mdMsg" rows="3">${esc((t => status === 'aguardando_cliente' && !t.includes(linkOS(o)) ? `${t} Para aprovar ou recusar, acesse: ${linkOS(o)}`.trim() : t)(textoAviso(o, status, '')))}</textarea></label>
      <label class="campo"><span><input type="checkbox" id="mdAvisar" ${o.cliente_fone || o.cliente_email ? 'checked' : ''}> Avisar o cliente</span></label></div>
    <div class="mt"><button class="btn pri" data-a="atConfirmar" data-id="${o.id}" data-v="${status}">Confirmar</button></div>`, true);
}
async function atConfirmar(id, status) {
  const o = AT.os.find(x => String(x.id) === String(id)), v = k => ($('#' + k)?.value || '').trim();
  const upd = { status };
  if (status === 'na_assistencia') {
    if (!v('mdAss')) return avisar('Informe a assistência.');
    const r = await ok(sb.from('at_rma').insert({ os_id: o.id, assistencia: v('mdAss'), protocolo: v('mdProt') || null, nota_remessa: v('mdNF') || null, rastreio: v('mdRast') || null, previsao_retorno: v('mdPrev') || null, criado_por: EU.id }).select().single());
    AT.rma.unshift(r); upd.previsao = v('mdPrev') || o.previsao;
  }
  if (status === 'retornou') {
    const r = AT.rma.find(x => x.os_id === o.id && !x.retornou_em);
    if (r) Object.assign(r, await ok(sb.from('at_rma').update({ retornou_em: hoje(), resultado: v('mdRes'), laudo: v('mdLaudo') || null, custo: Number(v('mdCusto')) || null }).eq('id', r.id).select().single()));
    upd.resultado = v('mdRes');
  }
  if (status === 'aguardando_cliente') { if (!Number(v('mdOrc'))) return avisar('Informe o valor do orçamento.'); Object.assign(upd, { orcamento_valor: Number(v('mdOrc')), orcamento_status: 'aguardando', orcamento_resposta: null, tiny_os_numero: v('mdTiny') || o.tiny_os_numero }); if (v('mdDoc').replace(/\D/g, '')) upd.cliente_doc = v('mdDoc').replace(/\D/g, ''); }
  if (status === 'em_analise' && o.status === 'aguardando_cliente') upd.orcamento_status = 'aprovado';
  if (status === 'pronto') { Object.assign(upd, { resultado: v('mdRes'), solucao: v('mdSol') || null }); if (o.status === 'aguardando_cliente') upd.orcamento_status = 'recusado'; }
  if (status === 'pronto' && o.status === 'na_assistencia') {   // buscamos na assistência: fecha o envio direto, sem passar por "retornou"
    const r = AT.rma.find(x => x.os_id === o.id && !x.retornou_em);
    if (r) Object.assign(r, await ok(sb.from('at_rma').update({ retornou_em: hoje(), resultado: v('mdRes') }).eq('id', r.id).select().single()));
  }
  if (status === 'entregue') { if (!v('mdQuem')) return avisar('Informe quem retirou.'); upd.entregue_para = v('mdQuem'); }
  if (status === 'cancelado' && !v('mdMotivo')) return avisar('Informe o motivo.');
  Object.assign(o, await ok(sb.from('at_os').update(upd).eq('id', o.id).select().single()));
  const msg = v('mdMsg');
  if (status === 'cancelado') await ok(sb.from('at_eventos').insert({ os_id: o.id, texto: 'Motivo: ' + v('mdMotivo'), publico: true, por: EU.id }));
  if ($('#mdAvisar')?.checked && msg) await gerarAvisos(o, status, '', msg);
  avisar(`OS ${o.numero}: ${ST_OS[status][0]}.`); render(); atAbrir(o.id);
  atSincTiny(o).then(() => atAbrir(o.id));
}
function atEditarForm(id) {
  const o = AT.os.find(x => String(x.id) === String(id));
  modal(`<button class="btn peq fechar" data-a="atAbrirVolta" data-id="${o.id}">✕</button><h2>OS ${esc(o.numero)}: testes e diagnóstico</h2>
    <div class="form-grid"><label class="campo inteiro">Testes realizados (evidências)<textarea id="edTestes" rows="3" placeholder="Ex.: testado com fonte 12V da bancada, sem imagem em 2 canais; troca de cabo não resolveu">${esc(o.testes || '')}</textarea></label>
      <label class="campo inteiro">Diagnóstico<textarea id="edDiag" rows="2">${esc(o.diagnostico || '')}</textarea></label>
      <label class="campo">Nº de série<input type="text" id="edSerie" value="${esc(o.numero_serie || '')}"></label><label class="campo">Previsão<input type="date" id="edPrev" value="${o.previsao || ''}"></label>
      <label class="campo">Telefone<input type="tel" id="edFone" value="${esc(o.cliente_fone || '')}"></label><label class="campo">E-mail<input type="email" id="edEmail" value="${esc(o.cliente_email || '')}"></label>
      <label class="campo">Nº da OS no Tiny<input type="text" id="edTiny" value="${esc(o.tiny_os_numero || '')}"></label></div>
    <div class="mt"><button class="btn pri" data-a="atEditarSalvar" data-id="${o.id}">Salvar</button></div>`, true);
}
async function atEditarSalvar(id) {
  const o = AT.os.find(x => String(x.id) === String(id)), v = k => ($('#' + k)?.value || '').trim();
  Object.assign(o, await ok(sb.from('at_os').update({ testes: v('edTestes') || null, diagnostico: v('edDiag') || null, numero_serie: v('edSerie') || null, previsao: v('edPrev') || null,
    cliente_fone: v('edFone').replace(/\D/g, '') || null, cliente_email: v('edEmail') || null, tiny_os_numero: v('edTiny') || null }).eq('id', o.id).select().single()));
  if (v('edTestes') || v('edDiag')) await ok(sb.from('at_eventos').insert({ os_id: o.id, texto: 'Testes/diagnóstico atualizados' + (v('edDiag') ? ': ' + v('edDiag') : ''), publico: false, por: EU.id }));
  avisar('OS atualizada.'); render(); atAbrir(o.id);
}
async function atWa(id) {
  const { data: a } = await sb.from('at_avisos').select('*').eq('id', id).single(); if (!a) return;
  window.open(`${linkWa(a.destino)}?text=${encodeURIComponent(a.mensagem)}`, '_blank', 'noopener');
  await ok(sb.from('at_avisos').update({ status: 'enviado', enviado_em: new Date().toISOString(), por: EU.id }).eq('id', id));
  atAbrir(a.os_id);
}
async function atNota(id) {
  const t = $('#osNota')?.value.trim(); if (!t) return;
  await ok(sb.from('at_eventos').insert({ os_id: +id, texto: t, publico: $('#osNotaPub').checked, por: EU.id })); atAbrir(id);
}
async function atFotos(id, arquivos) {
  const o = AT.os.find(x => String(x.id) === String(id));
  avisar(`Enviando ${arquivos.length} foto(s)…`); await enviarFotosOS(o, arquivos, $('#osFotoEtapa')?.value || 'teste', +($('#osFotoItem')?.value || 0) || null); avisar('Foto(s) anexada(s).'); atAbrir(id);
}
function atCopiarLink(id) { const o = AT.os.find(x => String(x.id) === String(id)); navigator.clipboard?.writeText(linkOS(o)).then(() => avisar('Link copiado: envie ao cliente.')).catch(() => prompt('Copie o link:', linkOS(o))); }

/** Termo de recebimento para imprimir (o cliente assina; QR code leva ao "Acompanhe sua OS"). */
/** Carrega o gerador de QR code (só quando precisa). */
function carregarQR() {
  if (window.qrcode) return Promise.resolve();
  return new Promise((ok2, erro) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; sc.onload = ok2; sc.onerror = erro; document.head.appendChild(sc); });
}
async function atTermo(id) {
  const o = AT.os.find(x => String(x.id) === String(id)), c = AT.cfg || {}, link = linkOS(o);
  const w = window.open('', '_blank'); if (!w) return avisar('Libere as janelas pop-up para imprimir.');
  const itensT = await ok(sb.from('at_os_itens').select('*').eq('os_id', o.id).order('seq'));
  let qr = '';
  try { await carregarQR(); const q = window.qrcode(0, 'M'); q.addData(link); q.make(); qr = q.createDataURL(4, 4); } catch { /* sem QR */ }
  const linha = (r, v) => `<tr><th>${r}</th><td>${esc(v || '—')}</td></tr>`;
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>OS ${esc(o.numero)}</title><style>
    body{font:13px/1.45 Figtree,Arial,sans-serif;color:#11202F;margin:28px}h1{font:900 22px Archivo,Arial;margin:0}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #CFC7B9;padding:6px 8px;text-align:left;vertical-align:top}th{width:28%;background:#F5F2EC}
    .cab{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1FAE5A;padding-bottom:10px}.ass{display:flex;gap:40px;margin-top:50px}.ass div{flex:1;border-top:1px solid #11202F;text-align:center;padding-top:4px}
    .qr{text-align:center}.qr small{display:block;max-width:180px;word-break:break-all}@media print{button{display:none}}</style></head><body>
    <div class="cab"><div><h1>Termo de recebimento · OS ${esc(o.numero)}</h1><div>${esc(c.empresa || '')} · ${esc(c.endereco || '')} · ${esc(c.telefone || '')}</div><div>Recebido em ${new Date(o.criado_em).toLocaleString('pt-BR')} por ${esc(nomeP(o.criado_por))}</div></div>
      <div class="qr">${qr ? `<img src="${qr}" alt="QR code">` : ''}<small>Acompanhe sua OS: ${esc(link)}</small></div></div>
    <table>${linha('Cliente', o.cliente_nome)}${linha('Contato', [o.cliente_fone, o.cliente_email].filter(Boolean).join(' · '))}${linha('Tipo', TIPOS_OS[o.tipo]?.replace(/^\S+\s/, ''))}
      ${(itensT.length ? itensT : [{ seq: 1, descricao: o.produto_descricao, marca: o.marca, modelo: o.modelo, numero_serie: o.numero_serie, quantidade: 1 }]).map(i => linha(`Produto ${i.seq}`, `${+i.quantidade > 1 ? i.quantidade + 'x ' : ''}${i.descricao}${[i.marca, i.modelo].filter(Boolean).length ? ' · ' + [i.marca, i.modelo].filter(Boolean).join(' ') : ''}${i.numero_serie ? ' · SN ' + i.numero_serie : ''}${i.defeito ? ' · defeito: ' + i.defeito : ''}`)).join('')}${linha('Pedido / NF de compra', [o.pedido_numero, o.nf_numero].filter(Boolean).join(' · '))}${o.tiny_os_numero ? linha('OS no Tiny', o.tiny_os_numero) : ''}
      ${linha('Defeito relatado', o.defeito_relatado)}${linha('Acessórios entregues', o.acessorios)}${linha('Estado físico', o.estado_fisico)}${linha('Previsão', o.previsao && pd(o.previsao).toLocaleDateString('pt-BR'))}</table>
    <p>O equipamento foi recebido nas condições descritas acima e fotografado na entrada. Equipamentos em garantia seguem as regras do fabricante; o laudo da assistência técnica pode negar a garantia em caso de mau uso, oxidação ou violação.
      Equipamentos não retirados em até 90 dias após o aviso de "pronto para retirada" poderão ter destinação conforme a lei.</p>
    <div class="ass"><div>Cliente</div><div>${esc(c.empresa || '')}</div></div></body></html>`);
  w.document.close(); setTimeout(() => w.print(), 400);
}

// ─── reincidência: mesmo nº de série, mesmo cliente em 90 dias e produtos que mais voltam ───
async function carregarHistAT() {
  const [os, it] = await Promise.all([
    todas(() => sb.from('at_os').select('id,numero,origem,cliente_nome,cliente_chave,cliente_doc,produto_descricao,numero_serie,marca,criado_em,status,resultado').order('criado_em')),
    todas(() => sb.from('at_os_itens').select('os_id,descricao,numero_serie,marca,quantidade')),
  ]);
  AT.hist = { os, it, em: Date.now() };
}
/** Calcula a reincidência sobre todo o histórico (Intranet + Tiny). */
function reincidencia() {
  if (!AT.hist) return null;
  if (AT.rein?.em === AT.hist.em) return AT.rein;
  const { os, it } = AT.hist, osPor = Object.fromEntries(os.map(o => [o.id, o])), comItens = new Set(it.map(i => i.os_id));
  const prods = [...it.map(i => ({ ...i, o: osPor[i.os_id] })), ...os.filter(o => !comItens.has(o.id)).map(o => ({ os_id: o.id, descricao: o.produto_descricao, numero_serie: o.numero_serie, marca: o.marca, quantidade: 1, o }))].filter(x => x.o && x.o.status !== 'cancelado');
  const series = Object.values(grupo(prods.filter(x => x.numero_serie && normTxt(x.numero_serie).length >= 4), x => normTxt(x.numero_serie).replace(/ /g, ''))).filter(g => new Set(g.map(x => x.os_id)).size > 1);
  const chaveCli = o => o.cliente_chave || (o.cliente_doc || '').replace(/\D/g, '') || normTxt(o.cliente_nome);
  const clientes = Object.values(grupo(os.filter(o => o.status !== 'cancelado'), chaveCli)).map(g => g.sort((a, b) => a.criado_em.localeCompare(b.criado_em)))
    .map(g => g.filter((o, k) => (k > 0 && (new Date(o.criado_em) - new Date(g[k - 1].criado_em)) / 864e5 <= 90) || (k < g.length - 1 && (new Date(g[k + 1].criado_em) - new Date(o.criado_em)) / 864e5 <= 90))).filter(g => g.length > 1);
  const produtos = Object.values(grupo(prods, x => normTxt(x.descricao))).filter(g => g.length > 1).sort((a, b) => b.length - a.length);
  const ids = new Set([...series.flatMap(g => g.map(x => x.os_id)), ...clientes.flatMap(g => g.map(o => o.id))]);
  return (AT.rein = { em: AT.hist.em, series, clientes, produtos, ids, total: os.length });
}
function abaReincidencia() {
  if (!AT.hist || Date.now() - AT.hist.em > 5 * 60e3) { if (!AT.histCarregando) { AT.histCarregando = true; carregarHistAT().then(render).catch(e => avisar(e.message)).finally(() => { AT.histCarregando = false; }); } if (!AT.hist) return '<div class="card vazio mt">Carregando o histórico de OS…</div>'; }
  const { series, clientes, produtos, total } = reincidencia();
  const osLink = o => `<a href="#" data-a="atAbrir" data-id="${o.id}">OS ${esc(o.numero)}</a> <small class="mut">${new Date(o.criado_em).toLocaleDateString('pt-BR')}</small>`;
  return `<p class="explica">Produtos e clientes que voltam para a assistência (inclui o histórico do Tiny). Mesmo nº de série em mais de uma OS indica conserto que não resolveu; muitas OS do mesmo produto indicam problema de modelo ou de fornecedor.</p>
    <div class="grid g3 mt"><div class="card kpi-card" style="cursor:pointer" data-a="atFiltro" data-v="reincidentes"><div class="rot">Mesmo nº de série</div><div class="val ${series.length ? 'c-ruim' : 'c-ok'}">${series.length}</div><div class="sub">equipamento que voltou</div></div>
      <div class="card kpi-card" style="cursor:pointer" data-a="atFiltro" data-v="reincidentes"><div class="rot">Cliente voltou em 90 dias</div><div class="val ${clientes.length ? 'c-med' : 'c-ok'}">${clientes.length}</div><div class="sub">cliente(s)</div></div>
      <div class="card kpi-card"><div class="rot">Produtos com 2+ OS</div><div class="val">${produtos.length}</div><div class="sub">de ${total} OS no histórico</div></div></div>
    <div class="grid g2 mt"><div class="card"><h2>🔁 Mesmo nº de série</h2>${series.length ? listaCurta('reSerie', `<table class="tabela"><thead><tr><th>Nº de série</th><th>Produto / cliente</th><th>OS</th></tr></thead><tbody>${series.map(g => `<tr><td><b>${esc(g[0].numero_serie)}</b></td><td>${esc(g[0].descricao)}<br><small>${esc(g[0].o.cliente_nome)}</small></td><td>${[...new Map(g.map(x => [x.os_id, x.o])).values()].map(osLink).join('<br>')}</td></tr>`).join('')}</tbody></table>`, 'Buscar…') : '<div class="vazio">Nenhum nº de série repetido. 👏</div>'}</div>
      <div class="card"><h2>👤 Cliente com nova OS em até 90 dias</h2>${clientes.length ? listaCurta('reCli', `<table class="tabela"><thead><tr><th>Cliente</th><th>Histórico</th></tr></thead><tbody>${clientes.map(g => `<tr><td><b>${esc(g[0].cliente_nome)}</b><br><small>${g.length} OS</small></td><td>${g.map(o => `${osLink(o)} · <small>${esc(o.produto_descricao || '')}</small>`).join('<br>')}</td></tr>`).join('')}</tbody></table>`, 'Buscar…') : '<div class="vazio">Nenhum cliente voltou em menos de 90 dias.</div>'}</div></div>
    <div class="card mt"><h2>📦 Produtos que mais voltam</h2>${produtos.length ? `<table class="tabela"><thead><tr><th>Produto</th><th class="dir">OS</th><th class="dir">Clientes</th><th class="dir">Garantia negada</th></tr></thead><tbody>${produtos.slice(0, 20).map(g => `<tr><td><b>${esc(g[0].descricao)}</b>${g[0].marca ? ` <small class="mut">${esc(g[0].marca)}</small>` : ''}</td><td class="dir"><b>${g.length}</b></td><td class="dir">${new Set(g.map(x => x.o.cliente_nome)).size}</td><td class="dir">${g.filter(x => x.o.resultado === 'negado').length}</td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhum produto com mais de uma OS ainda.</div>'}</div>`;
}

// ─── lembretes internos (todo dia): o que está fora, prontas sem retirada, previsões vencidas, respostas de orçamento ───
const veAssist = () => !!EU && (ehDono() || !!EU.permissoes?.suporte);
function pendenciasAT() {
  if (!AT.os) return null;
  const h = hoje(), ab = AT.os.filter(o => !['entregue', 'cancelado'].includes(o.status));
  const rmaPor = Object.fromEntries((AT.rma || []).filter(r => !r.retornou_em).map(r => [r.os_id, r]));
  const fora = ab.filter(o => o.status === 'na_assistencia'), foraAtr = fora.filter(o => rmaPor[o.id]?.previsao_retorno && rmaPor[o.id].previsao_retorno < h);
  const prontasVelhas = ab.filter(o => o.status === 'pronto' && diasDesde(o.status_em) >= 7);
  const atrasadas = ab.filter(o => o.status !== 'na_assistencia' && o.status !== 'pronto' && o.previsao && o.previsao < h);
  const respondidas = AT.os.filter(o => o.orcamento_resposta?.em && diasDesde(o.orcamento_resposta.em) <= 2);
  return { fora, foraAtr, prontasVelhas, atrasadas, respondidas, rmaPor };
}
/** Faixa no Início / Meu dia de quem cuida da assistência. */
function avisoAssistencia() {
  if (!veAssist()) return '';
  const p = pendenciasAT(); if (!p || !(p.fora.length || p.prontasVelhas.length || p.atrasadas.length || p.respondidas.length)) return '';
  const diasFora = o => diasDesde(p.rmaPor[o.id]?.enviado_em ? p.rmaPor[o.id].enviado_em + 'T12:00' : o.status_em);
  const det = p.fora.slice().sort((a, b) => diasFora(b) - diasFora(a)).slice(0, 8).map(o => { const r = p.rmaPor[o.id], atr = r?.previsao_retorno && r.previsao_retorno < hoje();
    return `${atr ? '⚠ ' : ''}OS ${esc(o.numero)} · ${esc(o.produto_descricao || '')}${r ? ' · ' + esc(r.assistencia) : ''} · há ${diasFora(o)} dia(s)${r?.previsao_retorno ? ` · previsão ${fmtCurta(r.previsao_retorno)}` : ''}`; });
  const partes = [p.fora.length && `${p.fora.length} produto(s) na assistência/fábrica${p.foraAtr.length ? ` (${p.foraAtr.length} passou da previsão: cobre a assistência)` : ''}`,
    p.prontasVelhas.length && `${p.prontasVelhas.length} OS pronta(s) há 7+ dias sem retirada`, p.atrasadas.length && `${p.atrasadas.length} OS passou da previsão dada ao cliente`,
    p.respondidas.length && `cliente respondeu orçamento: ${p.respondidas.map(o => `OS ${esc(o.numero)} ${o.orcamento_resposta.aprova ? '✔ aprovou' : '✕ recusou'}`).join(', ')}`].filter(Boolean);
  return `<div class="alerta ${p.foraAtr.length || p.atrasadas.length ? 'ruim' : 'med'}" style="margin-bottom:14px;cursor:pointer" data-a="nav" data-v="suporte"><span class="ic">🏭</span><span><b>Assistência hoje:</b> ${partes.join(' · ')}.${det.length ? `<br><small>${det.join('<br>')}</small>` : ''} <u>Abrir assistência</u></span></div>`;
}
