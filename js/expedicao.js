'use strict';
/* CRM Protemaxxi — Expedição e estoque: pedidos a separar e despachar, ocorrências (item faltante, erro, atraso),
   contagem diária de estoque (corrige o Tiny aos poucos), estoque baixo → solicitação de compra, e indicadores. */

const veExp = () => ehDono() || !!EU?.permissoes?.expedicao || !!EU?.permissoes?.ecommerce;
const SIT_ABERTA_EXP = ['Aprovado', 'Preparando envio', 'Faturado', 'Pronto para envio'];
const SIT_DESPACHADA = ['Enviado', 'Entregue'];
const TIPOS_OC = {
  item_faltante: ['📦', 'Item faltante'], erro_separacao: ['❌', 'Erro de separação'], atraso: ['⏰', 'Atraso no despacho'],
  avaria: ['💥', 'Avaria / embalagem'], devolucao: ['↩', 'Devolução'], etiqueta: ['🏷', 'Problema de etiqueta'], outro: ['📌', 'Outro'],
};
const ST_CONT = {
  ajustado: ['Corrigido no Tiny', 'ok'], sem_diferenca: ['Bateu com o Tiny', 'ok'], aguardando_aprovacao: ['Aguardando aprovação', 'med'],
  recontar: ['Recontar', 'med'], recusado: ['Recusado', 'ruim'], erro: ['Erro ao gravar', 'ruim'],
};
const ETAPA_EXP = { aguardando: ['Aguardando aprovação', ''], a_separar: ['A separar', 'ruim'], separado: ['Separado', 'med'], conferido: ['Conferido e embalado', 'azul'], despachado: ['Despachado', 'ok'] };
let EXP = null;
const EXP_ATUALIZANDO = { v: false };   // fora do UI para não ficar salvo no navegador

const pedaco = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const dataHora = d => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const horasEntre = (a, b) => (new Date(b) - new Date(a)) / 3600e3;
const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const dataSP = d => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
/** Soma horas e empurra sábado/domingo para segunda (mesmo horário). */
function maisHorasUteis(d, h) { const x = new Date(new Date(d).getTime() + h * 3600e3); while ([0, 6].includes(x.getDay())) x.setDate(x.getDate() + 1); return x; }

async function carregarExp(forcar) {
  if (EXP && !forcar) return EXP;
  const desde = new Date(Date.now() - 100 * 864e5).toISOString();
  const [exp, ocs, evs, cont, mlp, cfg, alertas, plano] = await Promise.all([
    todas(() => sb.from('expedicao').select('*').gte('atualizado_em', desde)),
    todas(() => sb.from('expedicao_ocorrencias').select('*').gte('quando', desde).order('quando', { ascending: false })),
    todas(() => sb.from('pedido_eventos').select('pedido_id,situacao,em').gte('em', desde).order('em')),
    todas(() => sb.from('contagens').select('*').gte('quando', desde).order('quando', { ascending: false })),
    todas(() => sb.from('ml_pedidos').select('id,pack_id,envio_id,envio_status,envio_substatus,prazo_despacho').gte('data', desde)),
    sb.from('config').select('valor').eq('chave', 'expedicao').maybeSingle().then(r => r.data?.valor || {}),
    ok(sb.rpc('estoque_alertas')),
    chamarFuncao('estoque', { acao: 'plano' }).then(r => r.plano || []).catch(() => []),
  ]);
  const ecom = D.pedidos.filter(p => p.numero_ecommerce && p.data >= addDias(hoje(), -100));
  const abertos = ecom.filter(p => [...SIT_ABERTA_EXP, 'Em aberto'].includes(p.situacao));
  const itens = [];
  for (const lote of pedaco(abertos.map(p => p.id), 150)) itens.push(...await ok(sb.from('pedido_itens').select('*').in('pedido_id', lote).order('seq')));
  const idsProd = [...new Set([...itens.map(i => i.produto_id), ...plano.map(x => x.produto_id)].filter(Boolean).map(String))];
  const produtos = [];
  for (const lote of pedaco(idsProd, 150)) produtos.push(...await ok(sb.from('produtos').select('*').in('id', lote)));
  EXP = {
    cfg: { sla_horas: 24, meta_contagem: 15, ajuste_auto_max_unid: 5, ajuste_auto_max_pct: 20, inicio: hoje(), ...cfg },
    exp: Object.fromEntries(exp.map(e => [e.pedido_id, e])), ocs, cont, alertas, plano,
    eventos: evs.reduce((m, e) => ((m[e.pedido_id] ||= []).push(e), m), {}),
    ml: Object.fromEntries(mlp.flatMap(m => [[String(m.id), m], ...(m.pack_id ? [[String(m.pack_id), m]] : [])])),
    itens: itens.reduce((m, i) => ((m[i.pedido_id] ||= []).push(i), m), {}),
    prod: Object.fromEntries(produtos.map(p => [String(p.id), p])),
    ecom,
  };
  return EXP;
}

/** Situação de um pedido na expedição: etapa, prazo, despacho e atraso. */
function infoPedido(p) {
  const e = EXP.exp[p.id] || {}, evs = EXP.eventos[p.id] || [];
  const ml = EXP.ml[String(p.numero_ecommerce)] || null;
  const evAprov = evs.find(x => SIT_ABERTA_EXP.includes(x.situacao));
  const evDesp = evs.find(x => SIT_DESPACHADA.includes(x.situacao));
  const base = evAprov?.em || (SIT_ABERTA_EXP.includes(p.situacao) || SIT_DESPACHADA.includes(p.situacao) ? `${p.data}T09:00:00-03:00` : null);
  const prazo = ml?.prazo_despacho ? new Date(ml.prazo_despacho) : base ? maisHorasUteis(base, +EXP.cfg.sla_horas || 24) : null;
  const mlSaiu = ml && ['shipped', 'delivered', 'not_delivered'].includes(ml.envio_status);
  const tempos = [e.despachado_em, evDesp?.em].filter(Boolean).sort();
  const despachado = tempos.length > 0 || mlSaiu || SIT_DESPACHADA.includes(p.situacao);
  const despachoEm = tempos[0] || null;
  const etapa = despachado ? 'despachado' : p.situacao === 'Em aberto' ? 'aguardando' : e.conferido_em ? 'conferido' : e.separado_em ? 'separado' : 'a_separar';
  const atrasado = prazo && (despachoEm ? new Date(despachoEm) > prazo : !despachado && Date.now() > prazo);
  const canal = p.canal || (ml ? 'ML - Viny' : 'E-commerce');
  return { p, e, ml, base, prazo, despachado, despachoEm, etapa, atrasado, canal };
}
const nomeCanal = c => /ml|mercado/i.test(c) ? 'Mercado Livre' : /tray/i.test(c) ? 'Site (Tray)' : /amazon/i.test(c) ? 'Amazon' : c;

// ─── métricas (para a tela e para as metas do Felippe) ───
function expMetricas(m) {
  if (!EXP) return null;
  const ini = EXP.cfg.inicio || hoje();
  const lista = EXP.ecom.map(infoPedido).filter(x => x.base && dataSP(x.base) >= ini);
  const desp = lista.filter(x => x.despachoEm && dataSP(x.despachoEm).startsWith(m));
  const noPrazo = desp.filter(x => !x.atrasado);
  const doMes = lista.filter(x => dataSP(x.base).startsWith(m));
  const ocs = EXP.ocs.filter(o => dataSP(o.quando).startsWith(m));
  const pedFalt = new Set(ocs.filter(o => o.tipo === 'item_faltante').map(o => o.pedido_id || o.pedido_numero));
  const erros = ocs.filter(o => o.tipo === 'erro_separacao').length;
  const cont = EXP.cont.filter(c => c.data.startsWith(m) && c.status !== 'recusado');
  const bateu = cont.filter(c => c.status === 'sem_diferenca').length;
  const tempos = desp.map(x => horasEntre(x.base, x.despachoEm)).filter(h => h >= 0);
  return {
    despachados: desp.length, noPrazo: noPrazo.length, prazoPct: desp.length ? noPrazo.length / desp.length * 100 : null,
    atrasadosMes: desp.length - noPrazo.length, atrasadosAgora: EXP.ecom.map(infoPedido).filter(x => !x.despachado && x.atrasado).length,
    tempoMedio: tempos.length ? soma(tempos) / tempos.length : null,
    pedidosMes: doMes.length, faltantes: pedFalt.size, faltantesPct: doMes.length ? pedFalt.size / doMes.length * 100 : null,
    erros, erroPct: desp.length ? erros / desp.length * 100 : (erros ? 100 : null),
    avarias: ocs.filter(o => ['avaria', 'devolucao'].includes(o.tipo)).length, ocorrencias: ocs.length,
    contados: cont.length, acuraciaPct: cont.length ? bateu / cont.length * 100 : null,
    unidadesCorrigidas: soma(cont.filter(c => c.status === 'ajustado').map(c => Math.abs(+c.diferenca || 0))),
    aguardandoAprov: EXP.cont.filter(c => c.status === 'aguardando_aprovacao').length, porCanal: desp.reduce((o, x) => { const k = nomeCanal(x.canal); const s = (o[k] ||= { d: 0, ok: 0 }); s.d++; if (!x.atrasado) s.ok++; return o; }, {}),
  };
}
const FONTES_EXP = { exp_despachados: 'despachados', exp_prazo_pct: 'prazoPct', exp_erro_pct: 'erroPct', exp_faltantes: 'faltantes', exp_contagens: 'contados', exp_acuracia_pct: 'acuraciaPct' };
function expKpiMes(fonte, m) { const r = expMetricas(m); return r ? r[FONTES_EXP[fonte]] ?? null : null; }
function expKpiDia(fonte, d) {
  if (!EXP) return 0;
  if (fonte === 'exp_despachados') return EXP.ecom.map(infoPedido).filter(x => x.despachoEm && dataSP(x.despachoEm) === d && dataSP(x.base || x.despachoEm) >= (EXP.cfg.inicio || d)).length;
  if (fonte === 'exp_contagens') return EXP.cont.filter(c => c.data === d && c.status !== 'recusado').length;
  if (fonte === 'exp_faltantes') return EXP.ocs.filter(o => o.tipo === 'item_faltante' && dataSP(o.quando) === d).length;
  return 0;
}

// ═══════════════════════════ tela ═══════════════════════════
function vExpedicao() {
  if (!EXP) { carregarExp().then(render).catch(e => avisar(e.message)); return topo('Expedição e estoque', '') + '<div class="card vazio">Carregando a expedição…</div>'; }
  UI.expAba ||= 'pedidos';
  const todos = EXP.ecom.map(infoPedido);
  const aFazer = todos.filter(x => !x.despachado && x.etapa !== 'aguardando');
  const atrasados = aFazer.filter(x => x.atrasado);
  const contHoje = EXP.cont.filter(c => c.data === hojeSP() && c.status !== 'recusado');
  const abas = [['pedidos', '📦 Pedidos', aFazer.length], ['contagem', '🔢 Contagem do dia', `${contHoje.length}/${EXP.cfg.meta_contagem}`], ['estoque', '📉 Estoque baixo', EXP.alertas.length], ['indicadores', '📊 Indicadores', '']];
  return topo('Expedição e estoque', `Separação, despacho e organização do estoque · pedidos do Tiny atualizados a cada 10 min`,
    `<button class="btn" data-a="expAtualizar" ${EXP_ATUALIZANDO.v ? 'disabled' : ''}>${EXP_ATUALIZANDO.v ? '⏳ Atualizando…' : '↻ Atualizar'}</button><button class="btn" data-a="expOcorrencia">⚠ Registrar ocorrência</button>`)
    + `<div class="grid g4">
      <div class="card kpi-card"><div class="rot">A despachar</div><div class="val">${aFazer.length}</div><div class="sub">${aFazer.filter(x => x.etapa === 'a_separar').length} a separar · ${aFazer.filter(x => x.etapa !== 'a_separar').length} em andamento</div></div>
      <div class="card kpi-card"><div class="rot">Atrasados agora</div><div class="val ${atrasados.length ? 'c-ruim' : 'c-ok'}">${atrasados.length}</div><div class="sub">passaram do prazo de despacho</div></div>
      <div class="card kpi-card"><div class="rot">Contagem de hoje</div><div class="val ${contHoje.length >= EXP.cfg.meta_contagem ? 'c-ok' : 'c-med'}">${contHoje.length} de ${EXP.cfg.meta_contagem}</div><div class="sub">itens conferidos no estoque</div></div>
      <div class="card kpi-card"><div class="rot">Estoque baixo</div><div class="val ${EXP.alertas.length ? 'c-med' : ''}">${EXP.alertas.length}</div><div class="sub">produtos para pedir compra</div></div></div>
    <div class="chips mt">${abas.map(([k, n, b]) => `<button class="chip ${UI.expAba === k ? 'on' : ''}" data-a="expAba" data-v="${k}">${n}${b !== '' ? `<span class="n">${b}</span>` : ''}</button>`).join('')}</div>
    <div class="mt">${{ pedidos: () => abaPedidos(todos), contagem: abaContagem, estoque: abaEstoque, indicadores: abaIndicadores }[UI.expAba]?.() || ''}</div>`;
}

function abaPedidos(todos) {
  UI.expFiltro ||= 'fazer';
  const filtros = {
    fazer: ['A fazer', x => !x.despachado && x.etapa !== 'aguardando'], atrasados: ['Atrasados', x => !x.despachado && x.atrasado],
    aguardando: ['Aguardando aprovação', x => x.etapa === 'aguardando'], hoje: ['Despachados hoje', x => x.despachoEm && dataSP(x.despachoEm) === hojeSP()],
  };
  const lista = todos.filter(filtros[UI.expFiltro][1]).sort((a, b) => (a.prazo || 9e15) - (b.prazo || 9e15));
  const linha = x => {
    const { p, e, ml, prazo } = x;
    const its = EXP.itens[p.id] || [];
    const etiqueta = ml && ['ready_to_print', 'printed'].includes(ml.envio_substatus) && ml.envio_status === 'ready_to_ship';
    const semNF = ml && ml.envio_substatus === 'invoice_pending';
    const ocs = EXP.ocs.filter(o => o.pedido_id === p.id && !o.resolvido);
    return `<div class="coment" style="border-left-color:var(--${x.atrasado ? 'ruim' : x.etapa === 'a_separar' ? 'med' : 'ok'})">
      <div class="secao-titulo" style="margin:0;align-items:flex-start"><div>
        <b>Pedido ${esc(p.numero || '')}</b> · <span class="tag azul">${esc(nomeCanal(x.canal))}</span> · ${esc(p.cliente_nome || '')}
        <br><small class="mut">${p.situacao ? 'Tiny: ' + esc(p.situacao) : ''}${ml?.envio_substatus ? ' · ML: ' + esc(SUBSTATUS_NOME[ml.envio_substatus] || ml.envio_substatus) : ''}</small></div>
        <div style="text-align:right"><span class="tag ${ETAPA_EXP[x.etapa][1]}">${ETAPA_EXP[x.etapa][0]}</span><br>
        <small class="${x.atrasado ? 'c-ruim' : 'mut'}">${prazo ? (x.despachado ? 'prazo era ' : 'despachar até ') + dataHora(prazo) : 'sem prazo'}${x.atrasado ? ' · ATRASADO' : ''}</small></div></div>
      <table class="tabela" style="margin-top:6px"><tbody>${its.map(i => { const pr = EXP.prod[String(i.produto_id)];
        return `<tr><td style="width:60px" class="num"><b>${N(i.quantidade)}×</b></td><td><b>${esc(i.codigo || '')}</b> ${esc(i.descricao || '')}</td><td><small>${pr ? '📍 ' + esc(pr.localizacao || pr.unidade || '—') : ''}</small></td><td class="dir"><small>${pr?.saldo != null ? 'estoque ' + N(pr.saldo) : ''}</small></td></tr>`; }).join('') || '<tr><td class="mut">Itens ainda não carregados do Tiny.</td></tr>'}</tbody></table>
      ${ocs.map(o => `<div class="alerta med" style="margin-top:6px"><span class="ic">${TIPOS_OC[o.tipo][0]}</span><span>${TIPOS_OC[o.tipo][1]}${o.produto ? ': ' + esc(o.produto) : ''}${o.descricao ? ' — ' + esc(o.descricao) : ''}</span></div>`).join('')}
      ${semNF ? '<div class="alerta med" style="margin-top:6px"><span class="ic">🧾</span><span>Aguardando a nota fiscal. A etiqueta do ML só libera depois da NF.</span></div>' : ''}
      <div class="acoes" style="margin-top:8px">
        ${x.despachado ? `<small class="mut">Despachado ${x.despachoEm ? dataHora(x.despachoEm) : ''}${e.despachado_por ? ' por ' + esc(nomeP(e.despachado_por)) : ''}</small>` : x.etapa === 'aguardando' ? '<small class="mut">Ainda não aprovado no Tiny (pagamento ou conferência do pedido).</small>' : `
          ${!e.separado_em ? `<button class="btn pri peq" data-a="expEtapa" data-id="${p.id}" data-k="separado">✓ Separado</button>` : `<small class="mut">Separado ${dataHora(e.separado_em)}${e.separado_por ? ' · ' + esc(nomeP(e.separado_por)) : ''}</small>`}
          ${e.separado_em && !e.conferido_em ? `<button class="btn pri peq" data-a="expEtapa" data-id="${p.id}" data-k="conferido">✓ Conferido e embalado</button>` : e.conferido_em ? `<small class="mut">· Conferido ${dataHora(e.conferido_em)}</small>` : ''}
          ${e.conferido_em ? `<button class="btn pri peq" data-a="expEtapa" data-id="${p.id}" data-k="despachado">🚚 Despachado</button>` : ''}
          ${e.separado_em ? `<button class="btn peq" data-a="expDesfazer" data-id="${p.id}" title="Desfazer a última etapa">↺</button>` : ''}`}
        ${etiqueta ? `<button class="btn peq" data-a="imprimirEtiquetas" data-envios="${esc(String(ml.envio_id))}">🖨 Etiqueta</button>` : ''}
        <button class="btn peq" data-a="expOcorrencia" data-id="${p.id}">⚠ Ocorrência</button></div></div>`;
  };
  const etiquetasLote = lista.filter(x => x.ml && x.ml.envio_status === 'ready_to_ship' && x.ml.envio_substatus === 'ready_to_print').map(x => x.ml.envio_id);
  return `<div class="filtros"><div class="chips">${Object.entries(filtros).map(([k, [n, f]]) => `<button class="chip ${UI.expFiltro === k ? 'on' : ''}" data-a="expFiltro" data-v="${k}">${n}<span class="n">${todos.filter(f).length}</span></button>`).join('')}</div>
      ${etiquetasLote.length > 1 ? `<button class="btn pri peq" data-a="imprimirEtiquetas" data-envios="${etiquetasLote.join(',')}">🖨 Imprimir todas as etiquetas do ML (${etiquetasLote.length})</button>` : ''}</div>
    ${UI.expFiltro === 'aguardando' ? '<p class="explica">Pedidos que chegaram (Tray, ML, Amazon) mas ainda estão "Em aberto" no Tiny. Se um pedido da Tray não aparecer aqui, importe os pedidos da Tray no Tiny.</p>' : ''}
    ${lista.length ? lista.slice(0, 80).map(linha).join('') : '<div class="card vazio">Nada por aqui. 👏</div>'}`;
}

// ─── contagem do dia ───
function abaContagem() {
  const h = hojeSP();
  const contHoje = EXP.cont.filter(c => c.data === h);
  const ultimaDe = id => EXP.cont.find(c => c.produto_id === String(id) && c.data === h);
  const ult10 = Array.from({ length: 10 }, (_, i) => addDias(h, -i));
  const c10 = EXP.cont.filter(c => ult10.includes(c.data) && c.status !== 'recusado');
  const aprov = EXP.cont.filter(c => c.status === 'aguardando_aprovacao');
  const item = x => {
    const pr = EXP.prod[String(x.produto_id)] || {}, feita = ultimaDe(x.produto_id);
    return `<tr><td><b>${esc(pr.codigo || '')}</b><br><small>${esc(pr.nome || x.produto_id)}</small></td>
      <td><small>📍 ${esc(pr.localizacao || pr.unidade || '—')}</small></td>
      <td class="dir num">${pr.saldo != null ? N(pr.saldo) : '—'}<br><small class="mut">no Tiny</small></td>
      <td style="width:260px">${feita ? `<span class="tag ${ST_CONT[feita.status][1]}">${ST_CONT[feita.status][0]}</span> <small>contou ${N(feita.contado)} · Tiny tinha ${N(feita.saldo_tiny)}${+feita.diferenca ? ` (${feita.diferenca > 0 ? '+' : ''}${N(feita.diferenca)})` : ''}</small>`
        : `<div style="display:flex;gap:6px"><input type="number" min="0" step="1" id="cnt_${x.produto_id}" placeholder="Qtd na prateleira" style="width:130px"><button class="btn pri peq" data-a="expContar" data-id="${x.produto_id}">Gravar</button></div>`}</td></tr>`;
  };
  return `<div class="card"><div class="secao-titulo"><h2>🔢 Contagem de hoje · ${contHoje.filter(c => c.status !== 'recusado').length} de ${EXP.cfg.meta_contagem}</h2><small>${c10.length} itens conferidos nos últimos 10 dias</small></div>
      <p class="explica" style="margin-top:0">Todo dia o CRM escolhe ${EXP.cfg.meta_contagem} produtos, começando pelos que mais vendem e pelos que estão negativos no Tiny. Conte o que está <b>na prateleira</b> (sem contar o que já está separado para pedidos) e grave. Na hora de gravar, o CRM confere o saldo no Tiny e corrige sozinho diferenças de até ${EXP.cfg.ajuste_auto_max_unid} unidades (ou ${EXP.cfg.ajuste_auto_max_pct}%). Diferença maior vai para a aprovação do Vinícius.</p>
      ${EXP.plano.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Produto</th><th>Local</th><th class="dir">Saldo</th><th>Contagem</th></tr></thead><tbody>${EXP.plano.map(item).join('')}</tbody></table></div>` : '<div class="vazio">A lista de hoje ainda não está pronta: o CRM está carregando os produtos do Tiny. Volte em alguns minutos.</div>'}</div>
    <div class="card mt"><h2>Contar outro produto</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><input type="search" id="expBusca" placeholder="Código ou nome do produto" style="flex:1;min-width:220px"><button class="btn" data-a="expBuscar">Buscar</button></div><div id="expBuscaRes" class="mt"></div></div>
    ${aprov.length ? `<div class="card mt"><h2>⚖ Diferenças grandes aguardando aprovação</h2>${ehDono() ? '' : '<p class="mut">O Vinícius precisa aprovar estas correções.</p>'}
      <table class="tabela"><tbody>${aprov.map(c => `<tr><td><b>${esc(c.codigo || '')}</b> ${esc(c.nome || '')}<br><small>${dataHora(c.quando)} · ${esc(nomeP(c.pessoa_id))}${c.obs ? ' · ' + esc(c.obs) : ''}</small></td><td class="dir">Tiny ${N(c.saldo_tiny)} → contado <b>${N(c.contado)}</b><br><small class="${c.diferenca > 0 ? 'c-ok' : 'c-ruim'}">${c.diferenca > 0 ? '+' : ''}${N(c.diferenca)}</small></td>
        <td class="dir">${ehDono() ? `<button class="btn pri peq" data-a="expAprovar" data-id="${c.id}" data-k="aprovar">Aprovar</button><button class="btn peq" data-a="expAprovar" data-id="${c.id}" data-k="recontar">Recontar</button><button class="btn peq" data-a="expAprovar" data-id="${c.id}" data-k="recusar">Recusar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="card mt"><h2>Últimas contagens</h2><div class="rolagem"><table class="tabela"><thead><tr><th>Quando</th><th>Produto</th><th class="dir">Tiny</th><th class="dir">Contado</th><th class="dir">Diferença</th><th>Resultado</th></tr></thead><tbody>
      ${EXP.cont.slice(0, 60).map(c => `<tr><td><small>${dataHora(c.quando)}<br>${esc(nomeP(c.pessoa_id))}</small></td><td><b>${esc(c.codigo || '')}</b> <small>${esc(c.nome || '')}</small></td><td class="dir">${N(c.saldo_tiny)}</td><td class="dir"><b>${N(c.contado)}</b></td><td class="dir ${+c.diferenca > 0 ? 'c-ok' : +c.diferenca < 0 ? 'c-ruim' : ''}">${+c.diferenca > 0 ? '+' : ''}${N(c.diferenca)}</td><td><span class="tag ${ST_CONT[c.status][1]}">${ST_CONT[c.status][0]}</span>${c.erro ? `<br><small class="c-ruim">${esc(c.erro)}</small>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhuma contagem ainda.</td></tr>'}
    </tbody></table></div></div>`;
}

// ─── estoque baixo ───
function abaEstoque() {
  const pedidosCompra = new Set(D.solicitacoes.filter(s => s.tipo === 'compra' && ABERTAS.includes(s.status)).map(s => String(s.dados?.codigo || '').trim().toUpperCase()).filter(Boolean));
  const MOT = { abaixo_minimo: ['Abaixo do mínimo', 'ruim'], zerado: ['Zerado', 'ruim'], cobertura_curta: ['Acaba em menos de 15 dias', 'med'] };
  return `<div class="card"><h2>📉 Estoque baixo</h2>
    <p class="explica" style="margin-top:0">Entra aqui o produto que está abaixo do <b>estoque mínimo do Tiny</b>, ou que pelo ritmo de venda dos últimos 90 dias <b>acaba em menos de 15 dias</b>. Como o estoque do Tiny ainda tem erros, olhe a coluna "Conferido": o número só é confiável depois da contagem. Na dúvida, conte o item antes de pedir.</p>
    <div class="rolagem"><table class="tabela"><thead><tr><th>Produto</th><th>Motivo</th><th class="dir">Saldo</th><th class="dir">Mínimo</th><th class="dir">Vendeu 90d</th><th class="dir">Dura</th><th>Conferido</th><th></th></tr></thead><tbody>
    ${EXP.alertas.map(a => { const ja = pedidosCompra.has(String(a.codigo || '').trim().toUpperCase());
      return `<tr><td><b>${esc(a.codigo || '')}</b><br><small>${esc(a.nome || '')}</small></td><td><span class="tag ${MOT[a.motivo][1]}">${MOT[a.motivo][0]}</span></td>
        <td class="dir num">${N(a.saldo)}</td><td class="dir">${+a.estoque_minimo ? N(a.estoque_minimo) : '—'}</td><td class="dir">${N(a.vendido_90d)}</td><td class="dir">${a.cobertura_dias != null ? N(a.cobertura_dias) + ' d' : '—'}</td>
        <td>${a.contado_em ? `<span class="tag ok">✓ ${fmtCurta(dataSP(a.contado_em))}</span>` : '<span class="tag med">não conferido</span>'}</td>
        <td class="dir">${ja ? '<span class="tag azul">compra pedida</span>' : `<button class="btn peq" data-a="expPedirCompra" data-id="${esc(a.id)}">🛒 Pedir compra</button>`}</td></tr>`; }).join('') || '<tr><td colspan="8" class="vazio">Nenhum produto com estoque baixo. (Os saldos do Tiny ainda estão sendo carregados nas primeiras horas.)</td></tr>'}
    </tbody></table></div></div>`;
}

// ─── indicadores ───
function abaIndicadores() {
  const m = UI.mes, r = expMetricas(m), ra = expMetricas(addMes(m, -1));
  const pct = v => v == null ? '—' : `${N(Math.round(v * 10) / 10)}%`;
  const card = (rot, val, sub, cls = '') => `<div class="card kpi-card"><div class="rot">${rot}</div><div class="val ${cls}">${val}</div><div class="sub">${sub}</div></div>`;
  const comp = (a, b, fmt = N) => b == null ? '' : `mês anterior: ${fmt(b)}`;
  const ocs = EXP.ocs.filter(o => dataSP(o.quando).startsWith(m));
  return `${navMes()}<p class="explica">Os indicadores contam a partir de ${fmtCurta(EXP.cfg.inicio)} (quando a expedição entrou no CRM). Despacho = quando o Felippe marca "Despachado" ou quando o Tiny/ML mostram o pedido como enviado, o que vier primeiro. Prazo = o do Mercado Livre; nos outros canais, ${EXP.cfg.sla_horas} h úteis depois da aprovação.</p>
    <div class="grid g4">
      ${card('Pedidos despachados', N(r.despachados), comp(r.despachados, ra?.despachados))}
      ${card('Despachados no prazo', pct(r.prazoPct), `${r.noPrazo} de ${r.despachados} · ${comp(0, ra?.prazoPct, pct)}`, r.prazoPct == null ? '' : r.prazoPct >= 98 ? 'c-ok' : r.prazoPct >= 90 ? 'c-med' : 'c-ruim')}
      ${card('Pedidos em atraso', N(r.atrasadosMes), `${r.atrasadosAgora} atrasado(s) agora, ainda sem despacho`, r.atrasadosMes || r.atrasadosAgora ? 'c-ruim' : 'c-ok')}
      ${card('Tempo médio até o despacho', r.tempoMedio == null ? '—' : N(Math.round(r.tempoMedio * 10) / 10) + ' h', 'da aprovação até sair')}
    </div>
    <div class="grid g4 mt">
      ${card('Taxa de erro de separação', pct(r.erroPct), `${r.erros} erro(s) em ${r.despachados} despachos`, r.erroPct == null ? '' : r.erroPct <= 0.5 ? 'c-ok' : r.erroPct <= 2 ? 'c-med' : 'c-ruim')}
      ${card('Pedidos com item faltante', N(r.faltantes), `${pct(r.faltantesPct)} dos ${r.pedidosMes} pedidos do mês`, r.faltantes ? 'c-med' : 'c-ok')}
      ${card('Avarias e devoluções', N(r.avarias), `${r.ocorrencias} ocorrência(s) no total`)}
      ${card('Ocorrências em aberto', N(EXP.ocs.filter(o => !o.resolvido).length), 'sem solução registrada')}
    </div>
    <div class="grid g4 mt">
      ${card('Itens contados', N(r.contados), `meta: ${EXP.cfg.meta_contagem} por dia útil`)}
      ${card('Acurácia do estoque', pct(r.acuraciaPct), 'contagens que bateram com o Tiny', r.acuraciaPct == null ? '' : r.acuraciaPct >= 90 ? 'c-ok' : r.acuraciaPct >= 70 ? 'c-med' : 'c-ruim')}
      ${card('Unidades corrigidas no Tiny', N(r.unidadesCorrigidas), 'soma das diferenças ajustadas')}
      ${card('Aguardando aprovação', N(r.aguardandoAprov), 'diferenças grandes de contagem', r.aguardandoAprov ? 'c-med' : '')}
    </div>
    <div class="grid g2 mt">
      <div class="card"><h2>Por canal</h2><table class="tabela"><thead><tr><th>Canal</th><th class="dir">Despachados</th><th class="dir">No prazo</th></tr></thead><tbody>
        ${Object.entries(r.porCanal).map(([k, s]) => `<tr><td>${esc(k)}</td><td class="dir">${s.d}</td><td class="dir">${pct(s.ok / s.d * 100)}</td></tr>`).join('') || '<tr><td colspan="3" class="vazio">Nenhum despacho no mês.</td></tr>'}</tbody></table></div>
      <div class="card"><h2>Ocorrências do mês</h2><table class="tabela"><tbody>
        ${ocs.map(o => `<tr><td>${TIPOS_OC[o.tipo][0]} <b>${TIPOS_OC[o.tipo][1]}</b>${o.pedido_numero ? ' · pedido ' + esc(o.pedido_numero) : ''}<br><small>${esc(o.produto || '')}${o.quantidade ? ' (' + N(o.quantidade) + ')' : ''}${o.descricao ? ' — ' + esc(o.descricao) : ''}</small><br><small class="mut">${dataHora(o.quando)} · ${esc(nomeP(o.pessoa_id))}</small></td>
          <td class="dir">${o.resolvido ? `<span class="tag ok">resolvida</span>${o.solucao ? `<br><small>${esc(o.solucao)}</small>` : ''}` : `<button class="btn peq" data-a="expResolver" data-id="${o.id}">Resolver</button>`}</td></tr>`).join('') || '<tr><td class="vazio">Nenhuma ocorrência no mês. 👏</td></tr>'}</tbody></table></div>
    </div>`;
}

// ═══════════════════════════ ações ═══════════════════════════
async function expAtualizar() {
  if (EXP_ATUALIZANDO.v) return;
  EXP_ATUALIZANDO.v = true; render();
  try { await carregarPedidos(`${addMes(mesDe(hoje()), -13)}-01`); await carregarExp(true); avisar('Expedição atualizada ✓'); }
  catch (e) { avisar('Não atualizou: ' + e.message); }
  finally { EXP_ATUALIZANDO.v = false; render(); }
}
async function expEtapa(id, etapa) {
  if (etapa === 'despachado' && !confirm('Confirmar que este pedido saiu (coleta, Correios ou entrega)?')) return;
  const agora = new Date().toISOString(), atual = EXP.exp[id] || { pedido_id: id };
  const novo = { ...atual, pedido_id: id, [etapa + '_em']: agora, [etapa + '_por']: EU.id, atualizado_em: agora };
  try { const r = await ok(sb.from('expedicao').upsert(novo).select().single()); EXP.exp[id] = r; render(); }
  catch (e) { alert('Não gravou: ' + e.message); }
}
async function expDesfazer(id) {
  const e = EXP.exp[id]; if (!e) return;
  const etapa = e.despachado_em ? 'despachado' : e.conferido_em ? 'conferido' : 'separado';
  if (!confirm(`Desfazer "${ETAPA_EXP[etapa][0]}" deste pedido?`)) return;
  try { EXP.exp[id] = await ok(sb.from('expedicao').update({ [etapa + '_em']: null, [etapa + '_por']: null, atualizado_em: new Date().toISOString() }).eq('pedido_id', id).select().single()); render(); }
  catch (er) { alert('Não gravou: ' + er.message); }
}
function expFormOcorrencia(pedidoId) {
  const p = pedidoId ? D.pedidos.find(x => x.id === pedidoId) : null;
  const its = p ? EXP.itens[p.id] || [] : [];
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>⚠ Registrar ocorrência</h2>
    <p class="mut">Registre tudo que der errado na expedição: é assim que medimos e corrigimos. Erro de separação que o cliente reclamar depois também entra aqui.</p>
    <div class="form-grid">
      <label class="campo">Nº do pedido no Tiny *<input type="text" id="oc_pedido" value="${esc(p?.numero || '')}" ${p ? 'readonly' : ''} placeholder="Ex.: 77801"></label>
      <label class="campo">Tipo *<select id="oc_tipo">${Object.entries(TIPOS_OC).map(([k, [ic, n]]) => `<option value="${k}">${ic} ${n}</option>`).join('')}</select></label>
      <label class="campo">Produto${its.length ? `<select id="oc_produto"><option value="">—</option>${its.map(i => `<option>${esc((i.codigo || '') + ' ' + (i.descricao || ''))}</option>`).join('')}</select>` : '<input type="text" id="oc_produto">'}</label>
      <label class="campo">Quantidade<input type="number" min="0" step="1" id="oc_qtd"></label>
      <label class="campo inteiro">O que aconteceu<textarea id="oc_desc" rows="3"></textarea></label>
    </div><div class="mt"><button class="btn pri" data-a="expSalvarOcorrencia">Registrar</button></div>`);
}
async function expSalvarOcorrencia() {
  const v = id => ($('#' + id)?.value || '').trim();
  const num = v('oc_pedido'); if (!num) return avisar('Informe o número do pedido.');
  const p = D.pedidos.find(x => String(x.numero) === num);
  try {
    const r = await ok(sb.from('expedicao_ocorrencias').insert({ pedido_id: p?.id || null, pedido_numero: num, tipo: v('oc_tipo'), produto: v('oc_produto') || null, quantidade: v('oc_qtd') ? Number(v('oc_qtd')) : null, descricao: v('oc_desc') || null, pessoa_id: EU.id }).select().single());
    EXP.ocs.unshift(r); fecharModal(); avisar('Ocorrência registrada.'); render();
  } catch (e) { alert('Não gravou: ' + e.message); }
}
async function expResolver(id) {
  const sol = prompt('Como foi resolvido? (ex.: item enviado depois, troca feita, cliente reembolsado)');
  if (sol === null) return;
  try { const r = await ok(sb.from('expedicao_ocorrencias').update({ resolvido: true, resolvido_em: new Date().toISOString(), solucao: sol.trim() || null }).eq('id', id).select().single()); Object.assign(EXP.ocs.find(o => String(o.id) === String(id)), r); render(); }
  catch (e) { alert('Não gravou: ' + e.message); }
}
async function expContar(id) {
  const el = $('#cnt_' + id); const v = (el?.value || '').trim();
  if (v === '' || !(+v >= 0)) return avisar('Digite a quantidade contada.');
  const pr = EXP.prod[String(id)] || {};
  if (!confirm(`Gravar a contagem de ${pr.codigo || ''}: ${v} unidade(s) na prateleira?\n\nO CRM confere o saldo do Tiny agora e corrige se precisar.`)) return;
  try {
    const r = await chamarFuncao('estoque', { acao: 'contar', produto_id: id, contado: Number(v) });
    const c = r.contagem; EXP.cont.unshift(c);
    if (EXP.prod[String(id)]) EXP.prod[String(id)].saldo = c.status === 'ajustado' ? c.contado : c.saldo_tiny;
    avisar({ ajustado: `Corrigido no Tiny: ${N(c.saldo_tiny)} → ${N(c.contado)} ✓`, sem_diferenca: 'Bateu com o Tiny ✓', aguardando_aprovacao: `Diferença grande (${c.diferenca > 0 ? '+' : ''}${N(c.diferenca)}): foi para a aprovação do Vinícius.`, erro: 'Gravou a contagem, mas o Tiny recusou o ajuste.' }[c.status] || 'Contagem gravada.');
    render();
  } catch (e) { alert('Não gravou: ' + e.message); }
}
async function expBuscar() {
  const q = ($('#expBusca')?.value || '').trim().replace(/[%,()]/g, ' ');
  if (q.length < 2) return avisar('Digite pelo menos 2 letras.');
  const res = await ok(sb.from('produtos').select('*').eq('situacao', 'A').or(`codigo.ilike.%${q}%,nome.ilike.%${q}%`).order('codigo').limit(15));
  for (const p of res) EXP.prod[String(p.id)] = p;
  $('#expBuscaRes').innerHTML = res.length ? `<table class="tabela"><tbody>${res.map(p => `<tr><td><b>${esc(p.codigo)}</b><br><small>${esc(p.nome)}</small></td><td><small>📍 ${esc(p.localizacao || p.unidade || '—')}</small></td><td class="dir">${p.saldo != null ? N(p.saldo) : '—'}<br><small class="mut">no Tiny</small></td>
    <td style="width:260px"><div style="display:flex;gap:6px"><input type="number" min="0" step="1" id="cnt_${p.id}" placeholder="Qtd na prateleira" style="width:130px"><button class="btn pri peq" data-a="expContar" data-id="${p.id}">Gravar</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhum produto ativo encontrado.</div>';
}
async function expAprovar(id, acao) {
  const txt = { aprovar: 'Aprovar e corrigir o estoque no Tiny?', recontar: 'Pedir para contar de novo? O item volta na lista de amanhã.', recusar: 'Recusar esta contagem (o Tiny não muda)?' }[acao];
  if (!confirm(txt)) return;
  try { await chamarFuncao('estoque', { acao, id }); await carregarExp(true); avisar('Feito ✓'); render(); }
  catch (e) { alert('Não gravou: ' + e.message); }
}
async function expPedirCompra(id) {
  const a = EXP.alertas.find(x => String(x.id) === String(id)); if (!a) return;
  const vendaMes = (+a.vendido_90d || 0) / 3;
  const sugestao = Math.max(1, Math.ceil(Math.max(+a.estoque_minimo * 2 - Math.max(+a.saldo, 0), vendaMes * 1.5 - Math.max(+a.saldo, 0))));
  await formSolicitacao('compra');
  const set = (k, v) => { const el = $('#' + k); if (el) el.value = v; };
  set('sf_titulo', `Repor estoque: ${a.codigo} ${a.nome}`.slice(0, 120)); set('sf_produto', a.nome || ''); set('sf_codigo', a.codigo || '');
  set('sf_quantidade', sugestao); set('sf_motivo', 'Reposição de estoque');
  set('sf_descricao', `Estoque no Tiny: ${N(a.saldo)}${+a.estoque_minimo ? ` · mínimo ${N(a.estoque_minimo)}` : ''} · vendeu ${N(a.vendido_90d)} nos últimos 90 dias (≈ ${N(Math.round(vendaMes))} por mês)${a.cobertura_dias != null ? ` · dura ${N(a.cobertura_dias)} dias` : ''}.\n${a.contado_em ? `Estoque conferido em ${fmtCurta(dataSP(a.contado_em))}.` : 'Atenção: estoque ainda não conferido na contagem.'}\nQuantidade sugerida pelo CRM: ${sugestao} (cerca de 45 dias de venda).`);
}
