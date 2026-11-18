'use strict';
/* Contas a pagar (18/11, pedido do Vinícius). Só os donos.
 * Uma lista só do que há para pagar (tabela boletos_pagar), com três origens:
 *   e-mail   — boletos lidos em boletos@ (como já era);
 *   planilha — títulos que o fornecedor manda (.xls, .xlsx, .ods, .csv ou linhas copiadas do Excel), importados pela RPC
 *              contas_pagar_importar. Quando o boleto da parcela chega depois por e-mail, o banco junta os dois sozinho;
 *   manual   — lançado aqui.
 * A planilha é lida no navegador com o SheetJS (js/vendor/xlsx.full.min.js, 0.20.3), carregado só quando alguém importa. */

const CPA = { lista: null, carregando: false, em: 0, filtro: 'aberto', imp: null };
const veContas = () => ehDono();
const CPA_ORIGEM = { email: 'e-mail', planilha: 'planilha', manual: 'manual' };

async function carregarContas(forcar) {
  if (CPA.carregando || (!forcar && CPA.lista && Date.now() - CPA.em < 60e3)) return;
  CPA.carregando = true;
  try {
    CPA.lista = await todas(() => sb.from('boletos_pagar').select('*')
      .or(`status.eq.a_pagar,and(status.eq.pago,pago_em.gte.${addDias(hoje(), -90)})`).order('vencimento', { nullsFirst: false }).order('id'));
    CPA.em = Date.now();
  } finally { CPA.carregando = false; }
}

// ─── números (funções puras, testadas em tests/contas-pagar.cjs) ───
/** Segunda-feira da semana de d. */
const cpaSegunda = d => addDias(d, -((pd(d).getDay() + 6) % 7));
/** Resumo do que está em aberto: vencidos, esta semana (até domingo), próximos 30 dias, por semana e por fornecedor. */
function cpaResumo(lista, h = hoje()) {
  const ab = (lista || []).filter(b => b.status === 'a_pagar'), v = l => soma(l.map(b => +b.valor || 0));
  const dom = addDias(cpaSegunda(h), 6), ate30 = addDias(h, 30);
  const vencidos = ab.filter(b => b.vencimento && b.vencimento < h), semana = ab.filter(b => b.vencimento && b.vencimento >= h && b.vencimento <= dom);
  const mes = ab.filter(b => b.vencimento && b.vencimento >= h && b.vencimento <= ate30);
  const semanas = Array.from({ length: 8 }, (_, i) => { const ini = addDias(cpaSegunda(h), 7 * i), fim = addDias(ini, 6);
    const l = ab.filter(b => b.vencimento && b.vencimento >= (i ? ini : '0000') && b.vencimento <= fim);   // a 1ª semana leva também os vencidos
    return { ini, fim, n: l.length, total: v(l) }; });
  const forn = {};
  for (const b of ab) { const k = b.beneficiario || 'Fornecedor não identificado'; (forn[k] ||= { nome: k, n: 0, total: 0 }); forn[k].n++; forn[k].total += +b.valor || 0; }
  return { aberto: { n: ab.length, total: v(ab) }, vencidos: { n: vencidos.length, total: v(vencidos) }, semana: { n: semana.length, total: v(semana), ate: dom },
    mes: { n: mes.length, total: v(mes) }, semanas, porFornecedor: Object.values(forn).sort((a, b) => b.total - a.total), semData: ab.filter(b => !b.vencimento).length };
}

// ─── leitura da planilha ───
/** Número de célula: 1234.5, "1.234,50", "R$ 1.234,50", "1234.50". */
function cpaNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v ?? '').replace(/[R$\s]/g, ''); if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  const n = Number(s); return isFinite(n) ? n : null;
}
/** Data de célula: Date, "AAAA-MM-DD", "DD/MM/AAAA" (ou DD/MM/AA) ou número de série do Excel. */
function cpaData(v) {
  const p2 = n => String(n).padStart(2, '0');
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${p2(m[2])}-${p2(m[1])}`;
  return null;
}
const cpaSemAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\w ]+/g, ' ').trim();
/** Acha as colunas pelo cabeçalho e devolve as parcelas: [{documento, parcela, valor, vencimento}].
 *  Linhas sem valor ou sem vencimento (total, em branco) ficam de fora e são contadas em "ignoradas". */
function cpaLerPlanilha(linhas) {
  const L = (linhas || []).filter(l => Array.isArray(l));
  const qual = h => { const s = cpaSemAcento(h);
    if (/venc/.test(s)) return 'vencimento';
    if (/^(sq|seq|parc)|parcela|prestac/.test(s)) return 'parcela';
    if (/liquido/.test(s)) return 'valor_liq';
    if (/valor|vlr|total|montante/.test(s)) return 'valor';
    if (/emiss/.test(s)) return 'emissao';
    if (/lanc|doc|titulo|nota|^nf|fatura|duplicata|^n /.test(s) || s === 'n') return 'documento';
    return null; };
  let cab = -1, mapa = {};
  for (let i = 0; i < Math.min(L.length, 15) && cab < 0; i++) {
    const m = {}; L[i].forEach((c, j) => { const k = qual(c); if (k && m[k] == null) m[k] = j; });
    if (m.vencimento != null && (m.valor != null || m.valor_liq != null)) { cab = i; mapa = m; }
  }
  if (cab < 0) return { erro: 'Não achei as colunas de vencimento e valor no cabeçalho da planilha.', itens: [], ignoradas: 0 };
  const colValor = mapa.valor_liq ?? mapa.valor, itens = []; let ignoradas = 0;
  for (const l of L.slice(cab + 1)) {
    const valor = cpaNum(l[colValor]), venc = cpaData(l[mapa.vencimento]);
    if (!valor || valor <= 0 || !venc) { if (l.some(c => String(c ?? '').trim())) ignoradas++; continue; }
    const par = mapa.parcela != null ? l[mapa.parcela] : '';
    itens.push({ documento: mapa.documento != null ? String(l[mapa.documento] ?? '').trim() : '', parcela: par === '' || par == null ? '' : String(typeof par === 'number' ? Math.round(par) : par).trim(),
      valor: Math.round(valor * 100) / 100, vencimento: venc });
  }
  return { itens, ignoradas, colunas: Object.fromEntries(Object.entries(mapa).map(([k, j]) => [k, String(L[cab][j] ?? '').trim()])) };
}
/** Linhas coladas do Excel (tabulação entre as colunas). */
const cpaColado = txt => String(txt || '').split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t'));

// ─── tela ───
function vContas() {
  if (!CPA.lista) { if (!CPA.carregando) carregarContas().then(render).catch(e => avisar(e.message)); return topo('Contas a pagar', '') + '<div class="card vazio">Carregando…</div>'; }
  const h = hoje(), r = cpaResumo(CPA.lista, h);
  const botoes = `<button class="btn" data-a="cpaAtualizar">↻ Atualizar</button><button class="btn" data-a="cpaNovo">+ Lançar conta</button><button class="btn pri" data-a="cpaImportar">Importar planilha</button>`;
  const kpis = `<div class="pain-kpis">
      ${painKpi('Em aberto', R0(r.aberto.total), `${r.aberto.n} conta(s)${r.semData ? ` · ${r.semData} sem vencimento` : ''}`, '', 'destaque')}
      ${painKpi('Vencidas', `<span class="${r.vencidos.n ? 'c-ruim' : 'c-ok'}">${R0(r.vencidos.total)}</span>`, r.vencidos.n ? `${r.vencidos.n} conta(s): pague ou marque como paga` : 'nada vencido', '', r.vencidos.n ? 'pede' : '')}
      ${painKpi('Esta semana', R0(r.semana.total), `${r.semana.n} conta(s) até ${fmtCurta(r.semana.ate)}`)}
      ${painKpi('Próximos 30 dias', R0(r.mes.total), `${r.mes.n} conta(s) até ${fmtCurta(addDias(h, 30))}`)}</div>`;
  const graf = `<div class="pain-grade">
      <div class="pain-col"><div class="card pain-card"><div class="secao-titulo"><h2>Vence por semana</h2><small>as próximas 8 semanas; a primeira inclui o que já venceu</small></div>
        ${painDist(r.semanas.map((s, i) => ({ rot: `${fmtCurta(s.ini)} a ${fmtCurta(s.fim)}`, v: s.total, sub: s.n ? `${s.n} conta(s)` : '', cls: i === 0 ? 'med' : 'ok' })), v => R0(v))}</div></div>
      <div class="pain-col"><div class="card pain-card"><div class="secao-titulo"><h2>Por fornecedor</h2><small>em aberto</small></div>
        ${r.porFornecedor.length ? painDist(r.porFornecedor.slice(0, 8).map(f => ({ rot: esc(f.nome), v: f.total, sub: `${f.n} conta(s)` })), v => R0(v)) : '<div class="vazio">Nada em aberto.</div>'}</div></div></div>`;
  const abas = `<div class="subabas sec">${[['aberto', `Em aberto (${r.aberto.n})`], ['pagos', 'Pagas (90 dias)']].map(([k, n]) => `<button class="${CPA.filtro === k ? 'on' : ''}" data-a="cpaFiltro" data-v="${k}">${n}</button>`).join('')}</div>`;
  let corpo;
  if (CPA.filtro === 'pagos') {
    const pagos = CPA.lista.filter(b => b.status === 'pago').sort((a, b) => (b.pago_em || '').localeCompare(a.pago_em || ''));
    corpo = pagos.length ? `<div class="card">${listaCurta('cpaPagos', cpaTabela(pagos, true), 'Buscar fornecedor, documento…')}</div>` : '<div class="card vazio">Nenhuma conta paga nos últimos 90 dias.</div>';
  } else {
    const ab = CPA.lista.filter(b => b.status === 'a_pagar');
    const grupos = [['Vencidas', ab.filter(b => b.vencimento && b.vencimento < h)], ['Esta semana', ab.filter(b => b.vencimento && b.vencimento >= h && b.vencimento <= r.semana.ate)],
      ['Depois', ab.filter(b => b.vencimento && b.vencimento > r.semana.ate)], ['Sem vencimento', ab.filter(b => !b.vencimento)]].filter(g => g[1].length);
    corpo = grupos.length ? grupos.map(([t, l]) => `<div class="card mt"><div class="secao-titulo"><h2>${t}</h2><small>${l.length} conta(s) · ${R(soma(l.map(b => +b.valor || 0)))}</small></div>
      ${l.length > 12 ? listaCurta('cpa' + t.replace(/\W/g, ''), cpaTabela(l), 'Buscar fornecedor, documento…') : cpaTabela(l)}</div>`).join('')
      : `<div class="card vazio">Nada em aberto. Importe a planilha de um fornecedor ou lance uma conta.</div>`;
  }
  return topo('Contas a pagar', 'Boletos que chegam por e-mail, planilhas dos fornecedores e lançamentos à mão, num lugar só.', botoes) + kpis + graf + `<div class="mt">${abas}</div>` + corpo;
}
function cpaTabela(l, pagos) {
  const h = hoje();
  return `<div class="rolagem"><table class="tabela"><thead><tr><th>Fornecedor</th><th>Documento</th><th class="dir">${pagos ? 'Pago em' : 'Vencimento'}</th><th class="dir">Valor</th><th></th></tr></thead><tbody>
    ${l.map(b => `<tr><td><b>${esc(b.beneficiario || 'Fornecedor não identificado')}</b><br><small class="mut">${b.cnpj ? esc(b.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')) + ' · ' : ''}${CPA_ORIGEM[b.origem] || b.origem}${b.linha ? ' · com boleto' : ' · sem boleto ainda'}</small>
        ${b.alerta ? `<br><small class="c-med">${esc(b.alerta)}</small>` : ''}${b.obs ? `<br><small class="mut">${esc(b.obs)}</small>` : ''}</td>
      <td>${esc(b.documento || '')}${b.parcela ? ` <small class="mut">parcela ${esc(b.parcela)}</small>` : ''}${b.nf_numero ? `<br><small>NF ${esc(b.nf_numero)}</small>` : ''}</td>
      <td class="dir ${!pagos && b.vencimento && b.vencimento < h ? 'c-ruim' : ''}">${pagos ? (b.pago_em ? fmtCurta(b.pago_em.slice(0, 10)) : '—') : b.vencimento ? fmtCurta(b.vencimento) : '—'}</td>
      <td class="dir num"><b>${b.valor ? R(b.valor) : '—'}</b></td>
      <td class="dir cpa-acoes">${b.linha ? `<button class="btn peq" data-a="emCopiar" data-v="${esc(b.linha)}" title="Copiar a linha digitável">Copiar linha</button>` : ''}
        ${b.email_id ? `<button class="btn peq" data-a="cpaVerEmail" data-id="${b.email_id}">E-mail</button>` : ''}
        ${pagos ? `<button class="btn peq" data-a="cpaReabrir" data-id="${b.id}">Desfazer</button>`
          : `<button class="btn pri peq" data-a="cpaPago" data-id="${b.id}">Paga</button>${b.origem === 'email' ? `<button class="btn peq" data-a="cpaIgnorar" data-id="${b.id}" title="Duplicado, cancelado ou não é nosso">Ignorar</button>` : `<button class="btn peq" data-a="cpaExcluir" data-id="${b.id}">Excluir</button>`}`}</td></tr>`).join('')}
  </tbody></table></div>`;
}

// ─── ações ───
const cpaItem = id => (CPA.lista || []).find(b => String(b.id) === String(id));
async function cpaMudar(id, mud, msg) {
  const r = await ok(sb.from('boletos_pagar').update(mud).eq('id', id).select().single());
  const b = cpaItem(id); if (b) Object.assign(b, r);
  avisar(msg); if (typeof EM !== 'undefined') EM.em = 0; render();
}
async function cpaPago(id) {
  const b = cpaItem(id); if (!b || !confirm(`Marcar como PAGA a conta de ${b.beneficiario || ''} (${R(b.valor)}, vence ${b.vencimento ? fmtCurta(b.vencimento) : '—'})?`)) return;
  await cpaMudar(id, { status: 'pago', pago_em: new Date().toISOString(), pago_por: EU.id }, 'Conta marcada como paga.');
}
async function cpaReabrir(id) { await cpaMudar(id, { status: 'a_pagar', pago_em: null, pago_por: null }, 'A conta voltou para em aberto.'); }
async function cpaIgnorar(id) {
  const b = cpaItem(id); if (!b) return;
  const motivo = prompt('Por que ignorar este boleto? (duplicado, cancelado, não é nosso…)'); if (motivo == null) return;
  await cpaMudar(id, { status: 'ignorado', obs: [b.obs, motivo].filter(Boolean).join(' · ') || null }, 'Boleto ignorado.');
}
async function cpaExcluir(id) {
  const b = cpaItem(id); if (!b || !confirm(`Excluir a conta de ${b.beneficiario || ''} (${R(b.valor)})? Isso não tem volta.`)) return;
  await ok(sb.from('boletos_pagar').delete().eq('id', id).select('id'));
  CPA.lista = CPA.lista.filter(x => x !== b); avisar('Conta excluída.'); render();
}
/** Fornecedores já conhecidos (nome → CNPJ), para sugerir no lançamento e na importação. */
function cpaFornecedores() {
  const m = new Map();
  for (const b of CPA.lista || []) if (b.beneficiario && !m.has(b.beneficiario)) m.set(b.beneficiario, b.cnpj || '');
  return [...m].sort((a, b) => a[0].localeCompare(b[0]));
}
const cpaListaForn = () => `<datalist id="cpaForns">${cpaFornecedores().map(([n]) => `<option value="${esc(n)}">`).join('')}</datalist>`;
function cpaNovo() {
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Lançar conta a pagar</h2>
    <div class="form-grid">
      <label class="campo inteiro">Fornecedor *<input id="cpaForn" list="cpaForns" maxlength="120" data-c="cpaFornEscolhido"></label>
      <label class="campo">CNPJ<input id="cpaCnpj" maxlength="18" placeholder="opcional"></label>
      <label class="campo">Documento / NF<input id="cpaDoc" maxlength="60"></label>
      <label class="campo">Valor (R$) *<input id="cpaValor" type="number" step="0.01" min="0.01"></label>
      <label class="campo">Vencimento *<input id="cpaVenc" type="date" value="${hoje()}"></label>
      <label class="campo inteiro">Linha digitável do boleto<input id="cpaLinha" maxlength="60" placeholder="opcional: dá para copiar depois na hora de pagar"></label>
      <label class="campo inteiro">Observação<input id="cpaObs" maxlength="300"></label></div>${cpaListaForn()}
    <div class="mt"><button class="btn pri" data-a="cpaSalvar">Lançar</button></div>`);
}
async function cpaSalvar() {
  const v = s => ($(s)?.value ?? '').trim(), forn = v('#cpaForn'), valor = Number(v('#cpaValor')), venc = v('#cpaVenc');
  const cnpj = v('#cpaCnpj').replace(/\D/g, ''), linha = v('#cpaLinha').replace(/\D/g, '');
  if (!forn) return avisar('Informe o fornecedor.');
  if (!(valor > 0)) return avisar('Informe o valor.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) return avisar('Informe o vencimento.');
  if (cnpj && cnpj.length !== 14) return avisar('O CNPJ precisa ter 14 números.');
  if (linha && ![47, 48].includes(linha.length)) return avisar('A linha digitável tem 47 números (boleto) ou 48 (conta de consumo).');
  const n = await ok(sb.from('boletos_pagar').insert({ origem: 'manual', beneficiario: forn, cnpj: cnpj || null, documento: v('#cpaDoc') || null, valor: Math.round(valor * 100) / 100,
    vencimento: venc, linha: linha || null, banco: linha.length === 47 ? linha.slice(0, 3) : null, obs: v('#cpaObs') || null, criado_por: EU.id }).select().single());
  CPA.lista.push(n); fecharModal(); avisar('Conta lançada.'); render();
}

// ─── importar planilha ───
function cpaImportar() {
  CPA.imp = null;
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Importar planilha do fornecedor</h2>
    <p class="mut">A planilha de títulos ou boletos que o fornecedor manda (.xls, .xlsx, .ods ou .csv). Também dá para copiar as linhas no Excel e colar aqui.</p>
    <div class="cpa-drop" id="cpaDrop"><input type="file" id="cpaArq" accept=".xls,.xlsx,.ods,.csv"><span>Arraste a planilha aqui ou <b>clique para escolher</b></span></div>
    <label class="campo mt">Ou cole as linhas (com o cabeçalho)<textarea id="cpaCola" rows="3" placeholder="Nº Lancto	Sq	Valor	Vencimento…"></textarea></label>
    <div class="form-grid mt">
      <label class="campo">Fornecedor *<input id="cpaImpForn" list="cpaForns" maxlength="120" data-c="cpaFornEscolhido" data-cnpj="#cpaImpCnpj"></label>
      <label class="campo">CNPJ<input id="cpaImpCnpj" maxlength="18" placeholder="liga aos boletos do e-mail"></label>
      <label class="campo inteiro"><span><input type="checkbox" id="cpaImpPagos" checked> O que venceu antes de hoje entra como <b>pago</b></span></label></div>${cpaListaForn()}
    <div id="cpaPrev" class="mt"></div>`, true);
}
let cpaSheetJS = null;
function cpaCarregarSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return cpaSheetJS ||= new Promise((ok, falha) => { const s = document.createElement('script'); s.src = 'js/vendor/xlsx.full.min.js?v=0.20.3'; s.onload = () => ok(window.XLSX); s.onerror = () => { cpaSheetJS = null; falha(new Error('Não consegui carregar o leitor de planilhas.')); }; document.head.appendChild(s); });
}
async function cpaLerArquivo(arq) {
  if (!arq) return;
  if (arq.size > 3 * 1048576) return avisar('Planilha grande demais (máximo 3 MB).');
  if (!/\.(xls|xlsx|ods|csv)$/i.test(arq.name)) return avisar('Use uma planilha .xls, .xlsx, .ods ou .csv.');
  try {
    const X = await cpaCarregarSheetJS();
    const wb = X.read(new Uint8Array(await arq.arrayBuffer()), { type: 'array', cellDates: true, dense: true });
    const linhas = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }).slice(0, 1000);
    cpaPrevia(cpaLerPlanilha(linhas), arq.name);
  } catch (e) { avisar('Não consegui ler a planilha: ' + e.message); }
}
function cpaPrevia(res, origem) {
  CPA.imp = res.erro ? null : res;
  const el = $('#cpaPrev'); if (!el) return;
  if (res.erro) { el.innerHTML = `<div class="alerta ruim"><span class="ic">!</span><span>${esc(res.erro)}</span></div>`; return; }
  const h = hoje(), venc = res.itens.filter(i => i.vencimento < h), tot = l => soma(l.map(i => i.valor));
  el.innerHTML = `<div class="card"><div class="secao-titulo"><h3>${res.itens.length} parcela(s) · ${R(tot(res.itens))}</h3><small>${esc(origem || '')}</small></div>
    <p class="mut" style="margin-top:0">Colunas usadas: ${Object.entries(res.colunas).filter(([k]) => k !== 'emissao').map(([k, n]) => `<b>${esc(n)}</b> (${k.replace('_liq', '')})`).join(', ')}${res.ignoradas ? ` · ${res.ignoradas} linha(s) sem valor ou vencimento ficaram de fora (ex.: total)` : ''}.</p>
    ${venc.length ? `<p class="c-med" style="margin:0 0 8px">${venc.length} parcela(s) venceram antes de hoje (${R(tot(venc))}).</p>` : ''}
    <div class="rolagem" style="max-height:260px"><table class="tabela"><thead><tr><th>Documento</th><th>Parcela</th><th class="dir">Vencimento</th><th class="dir">Valor</th></tr></thead><tbody>
      ${res.itens.map(i => `<tr class="${i.vencimento < h ? 'mut' : ''}"><td>${esc(i.documento)}</td><td>${esc(i.parcela)}</td><td class="dir">${fmtCurta(i.vencimento)}/${i.vencimento.slice(2, 4)}</td><td class="dir">${R(i.valor)}</td></tr>`).join('')}</tbody></table></div>
    <div class="mt"><button class="btn pri" data-a="cpaImportarOk">Importar ${res.itens.length} parcela(s)</button></div></div>`;
}
async function cpaImportarOk(el) {
  const forn = ($('#cpaImpForn')?.value || '').trim(), cnpj = ($('#cpaImpCnpj')?.value || '').replace(/\D/g, '');
  if (!CPA.imp?.itens?.length) return avisar('Escolha a planilha primeiro.');
  if (!forn) return avisar('Informe o fornecedor.');
  if (cnpj && cnpj.length !== 14) return avisar('O CNPJ precisa ter 14 números.');
  el.disabled = true;
  try {
    const { data, error } = await sb.rpc('contas_pagar_importar', { p_fornecedor: forn, p_cnpj: cnpj || null, p_itens: CPA.imp.itens, p_pagos_antes: $('#cpaImpPagos')?.checked ? hoje() : null });
    if (error) throw error;
    fecharModal();
    avisar(`Importado: ${data.novos} nova(s)${data.pagos ? ` (${data.pagos} já como paga)` : ''}${data.ligados_email ? `, ${data.ligados_email} ligada(s) ao boleto do e-mail` : ''}${data.ja_tinha ? `, ${data.ja_tinha} já estava(m) aqui` : ''}.`);
    await carregarContas(true); render();
  } catch (e) { avisar(e.message); el.disabled = false; }
}
// arquivo escolhido, arrastado ou linhas coladas (o modal não passa pelo render, então os eventos ficam aqui)
if (typeof document !== 'undefined') {
  document.addEventListener('change', e => { if (e.target.id === 'cpaArq') cpaLerArquivo(e.target.files?.[0]); });
  document.addEventListener('input', e => { if (e.target.id === 'cpaCola' && e.target.value.trim()) cpaPrevia(cpaLerPlanilha(cpaColado(e.target.value)), 'linhas coladas'); });
  document.addEventListener('dragover', e => { const z = e.target.closest?.('#cpaDrop'); if (z) { e.preventDefault(); z.classList.add('sobre'); } });
  document.addEventListener('dragleave', e => { e.target.closest?.('#cpaDrop')?.classList.remove('sobre'); });
  document.addEventListener('drop', e => { const z = e.target.closest?.('#cpaDrop'); if (!z) return; e.preventDefault(); z.classList.remove('sobre'); cpaLerArquivo(e.dataTransfer.files?.[0]); });
}
