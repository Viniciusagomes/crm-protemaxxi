'use strict';
/* Expedição — tela nova (20/10/2026). Mesmas regras e ações da tela antiga (expedicao.js), organizadas em duas trilhas por pedido:
   📦 MATERIAL (separar → [conferir e embalar] → entregar/despachar) e 💰 PAGAMENTO (já pago · a receber no balcão · a liberar).
   Filas: Aguardando liberação · Separar agora · Separados, esperando (diz o que falta) · Concluídos.
   A tela antiga fica de reserva: botão "Tela antiga" (UI.expClassica). */

const FILAS_EXP = {
  liberacao: ['📥 Aguardando liberação', 'pagamento a liberar, NF ou pedido em aberto', x => !x.despachado && x.etapa === 'aguardando'],
  separar: ['📦 Separar agora', 'fila de trabalho: balcão primeiro', x => !x.despachado && x.etapa === 'a_separar'],
  esperando: ['⏳ Separados, esperando', 'cliente, pagamento, NF ou envio', x => !x.despachado && ['separado', 'conferido'].includes(x.etapa)],
  concluidos: ['✅ Concluídos', 'entregues ou despachados hoje', x => x.despachado],
};
// atalhos antigos (Visão do estoque, links) → fila nova
const FILA_DE_ANTIGO = { recebido: 'liberacao', a_separar: 'separar', separado: 'esperando', pago: 'esperando', entregue: 'concluidos', hoje: 'concluidos', atrasados: 'separar', faturamento: 'esperando' };
const HORAS_PARADO = 24;   // separado e parado há mais que isso → aviso

/** Pagamento já resolvido para o material poder sair? */
const pagoOk = x => !x.pagPendente && (!x.loja || x.pago);
/** Situação do pagamento: [classe, texto]. */
function pagDe(x) {
  const { p, e } = x, forma = esc([p.pag_forma || p.forma_pagamento, p.pag_meio].filter(Boolean).join(' · ') || '?');
  if (x.pagPendente) return ['ruim', `🔒 ${ehBoleto(p) ? 'Faturamento a aprovar' : 'Pagamento a liberar'} · ${forma}`];
  if (e.pagamento_aprovado_em) return ['ok', `✅ ${ehBoleto(p) ? 'Faturamento aprovado' : 'Pagamento liberado'} por ${esc(nomeP(e.pagamento_aprovado_por))} · ${forma}`];
  if (!x.loja) return ['ok', `✅ Pago · ${forma}`];
  if (e.pago_em) return ['ok', `✅ ${e.pago_como === 'antes' ? 'Já estava pago (link)' : e.pago_como === 'retirada' ? 'Recebido no balcão' : 'Pago'} · ${forma}${e.pago_por ? ' · ' + esc(nomeP(e.pago_por)) : ''}`];
  return ['med', `🏪 A receber na retirada: <b>${R(p.valor)}</b> · ${forma}`];
}
/** O que falta para um pedido separado sair. */
function faltaDe(x) {
  const { e, ml } = x;
  if (x.faturamento && !x.nfOk) return '🧾 Aguardando a nota fiscal';
  if (x.loja) return x.pago ? '🙋 Pago · aguardando o cliente retirar' : '🙋 Aguardando o cliente pagar e retirar';
  if (!e.conferido_em) return '✓ Falta conferir e embalar';
  if (ml) return ml.envio_substatus === 'ready_to_print' ? '🖨 Imprimir a etiqueta e postar' : '📮 Aguardando postagem / coleta';
  return '🚚 Aguardando coleta / envio';
}
/** Atraso que depende da expedição: no balcão, depois de separado a espera é do cliente (não conta). */
const atrasoExp = x => !x.despachado && x.atrasado && !(x.loja && x.e.separado_em);
const horasParado = x => x.e.separado_em ? (Date.now() - new Date(x.e.separado_em)) / 3600e3 : 0;

function abaPedidos2(todos, modo) {
  if (FILA_DE_ANTIGO[UI.expFiltro]) { if (UI.expFiltro === 'atrasados') UI.expSo = 'atrasados'; if (UI.expFiltro === 'faturamento') UI.expSo = 'faturamento'; UI.expFila = FILA_DE_ANTIGO[UI.expFiltro]; UI.expFiltro = null; }
  UI.expFila = FILAS_EXP[UI.expFila] ? UI.expFila : 'separar';
  const so = { atrasados: ['⏰ Só atrasados', atrasoExp], faturamento: ['🧾 Só faturamento', x => x.faturamento], parados: [`⏳ Parados há +${HORAS_PARADO}h`, x => !x.despachado && horasParado(x) > HORAS_PARADO] };
  if (UI.expSo && !so[UI.expSo]) UI.expSo = null;
  const termos = semAcento(UI.expBusca || '').toLowerCase().split(/\s+/).filter(Boolean);
  const texto = x => semAcento([x.p.numero, x.p.numero_ecommerce, x.p.cliente_nome, x.p.vendedor_nome, x.p.envio_forma, x.p.envio_servico,
    ...(EXP.itens[x.p.id] || []).flatMap(i => [i.codigo, i.descricao])].filter(Boolean).join(' ')).toLowerCase();
  const daFila = f => todos.filter(FILAS_EXP[f][2]).filter(x => f !== 'concluidos' || UI.expConclTodos || (x.despachoEm && dataSP(x.despachoEm) === hojeSP()));
  let lista = termos.length ? todos.filter(x => { const t = texto(x); return termos.every(w => t.includes(w)); }) : daFila(UI.expFila);
  if (UI.expSo && !termos.length) lista = lista.filter(so[UI.expSo][1]);
  lista.sort(UI.expFila === 'concluidos' && !termos.length ? (a, b) => String(b.despachoEm || '').localeCompare(String(a.despachoEm || '')) : (a, b) => (b.loja - a.loja) || ((a.prazo || 9e15) - (b.prazo || 9e15)));
  const etiquetasLote = lista.filter(x => x.ml && !x.despachado && x.ml.envio_status === 'ready_to_ship' && x.ml.envio_substatus === 'ready_to_print').map(x => x.ml.envio_id);
  return `<div class="exp-filas">${Object.entries(FILAS_EXP).map(([k, [n, sub]]) => { const c = daFila(k).length, on = UI.expFila === k && !termos.length;
      return `<button class="exp-fila ${on ? 'on' : ''} ${k === 'separar' && c ? 'quente' : ''}" data-a="expFila" data-v="${k}"><span>${n}</span><b>${c}</b><small>${k === 'concluidos' && UI.expConclTodos ? 'todos os dias' : sub}</small></button>`; }).join('')}</div>
    <div class="filtros mt"><input type="search" class="busca-exp" placeholder="🔎 Buscar pedido, cliente, SKU ou produto…" value="${esc(UI.expBusca || '')}" data-c="ui" data-k="expBusca" data-fid="expBusca">
      ${termos.length ? `<small class="mut">${lista.length} encontrado(s) em todas as filas · <a href="#" data-a="expBuscaLimpar">limpar</a></small>` : ''}</div>
    <div class="filtros"><div class="chips">${Object.entries(so).map(([k, [n, f]]) => `<button class="chip peq ${UI.expSo === k ? 'on' : ''}" data-a="expSo" data-v="${k}">${n}<span class="n">${todos.filter(f).length}</span></button>`).join('')}
      ${UI.expFila === 'concluidos' ? `<button class="chip peq ${UI.expConclTodos ? 'on' : ''}" data-a="expConclTodos">📅 Ver dias anteriores</button>` : ''}</div>
      ${etiquetasLote.length > 1 ? `<button class="btn pri peq" data-a="imprimirEtiquetas" data-envios="${etiquetasLote.join(',')}">🖨 Imprimir as etiquetas do ML (${etiquetasLote.length})</button>` : ''}</div>
    ${lista.length ? lista.slice(0, 80).map(cardExp2).join('') : `<div class="card vazio">${UI.expFila === 'separar' ? 'Nada para separar agora. 👏' : 'Nada por aqui.'}</div>`}`;
}

/** Card do pedido: cabeçalho, trilhas Material e Pagamento, itens, avisos e "mais ações". */
function cardExp2(x) {
  const { p, e, ml, prazo } = x, its = EXP.itens[p.id] || [], [freteCls, freteNome] = tipoTV(x);
  const ocs = EXP.ocs.filter(o => o.pedido_id === p.id && !o.resolvido), brindes = brindesDoPedido(p.numero);
  const etiqueta = ml && ['ready_to_print', 'printed'].includes(ml.envio_substatus) && ml.envio_status === 'ready_to_ship';
  const parado = !x.despachado && horasParado(x) > HORAS_PARADO;
  // trilha do material
  const passos = x.loja ? [['Separado', e.separado_em], ['Entregue ao cliente', x.despachoEm]] : [['Separado', e.separado_em], ['Conferido e embalado', e.conferido_em], [ml ? 'Postado' : 'Despachado', x.despachoEm]];
  let botaoMat = '';
  if (!x.despachado && !x.pagPendente && x.etapa !== 'aguardando') {
    if (!e.separado_em) botaoMat = `<button class="btn pri" data-a="expEtapa" data-id="${p.id}" data-k="separado">✓ Separado</button>`;
    else if (!x.loja && !e.conferido_em) botaoMat = `<button class="btn pri" data-a="expEtapa" data-id="${p.id}" data-k="conferido">✓ Conferido e embalado</button>`;
    else if (!pagoOk(x)) botaoMat = '<small class="mut">Para entregar, primeiro receba o pagamento ↓</small>';
    else if (x.faturamento && !x.nfOk) botaoMat = '<small class="c-ruim">Só sai com a nota fiscal ↓</small>';
    else botaoMat = `<button class="btn pri" data-a="expEtapa" data-id="${p.id}" data-k="despachado">${x.loja ? '📦 Entregue ao cliente' : '🚚 Despachado'}</button>`;
  }
  // trilha do pagamento
  const [pagCls, pagTxt] = pagDe(x);
  let botaoPag = '';
  if (!x.despachado && x.pagPendente) botaoPag = podeAprovarPag() ? `<button class="btn pri peq" data-a="expAprovarPag" data-id="${p.id}">${ehBoleto(p) ? '✅ Faturamento aprovado' : '💳 Aprovar pagamento'}</button>` : '<small class="mut">Vinícius, Marcos, Fefão ou Felipe Menezes liberam.</small>';
  else if (!x.despachado && x.loja && !x.pago) botaoPag = `<button class="btn ${e.separado_em ? 'pri' : ''} peq" data-a="expPago" data-id="${p.id}" data-v="retirada">💰 Recebi no balcão</button><button class="btn peq" data-a="expPago" data-id="${p.id}" data-v="antes">✅ Já estava pago (link)</button>`;
  const etq = [atrasoExp(x) ? '<span class="tag ruim">⏰ atrasado</span>' : '', parado ? `<span class="tag med">⏳ parado há ${Math.floor(horasParado(x) / 24) ? Math.floor(horasParado(x) / 24) + ' dia(s)' : Math.floor(horasParado(x)) + 'h'}</span>` : '',
    x.faturamento ? `<span class="tag ${x.nfOk ? 'ok' : 'ruim'}">🧾 ${x.nfOk ? 'NF ok' : 'NF obrigatória'}</span>` : '', ocs.length ? `<span class="tag ruim">⚠ ${ocs.length} ocorrência(s)</span>` : '', brindes.length ? '<span class="tag ok">🎁 brinde</span>' : ''].filter(Boolean).join(' ');
  return `<div class="expc ${freteCls} ${atrasoExp(x) ? 'atrasado' : ''}">
    <div class="expc-topo"><div><b class="expc-num">${esc(p.numero || '')}</b> <span class="expc-frete">${esc(freteNome)}</span> ${esc(p.cliente_nome || '')} ${x.loja ? seloCredito(p.cliente_chave) : ''}
        <br><small class="mut">${esc(nomeCanal(x.canal))}${p.vendedor_nome ? ' · vendedor ' + esc(p.vendedor_nome) : ''}${p.situacao ? ' · Tiny: ' + esc(p.situacao) : ''}${ml?.envio_substatus ? ' · ML: ' + esc(SUBSTATUS_NOME[ml.envio_substatus] || ml.envio_substatus) : ''}</small></div>
      <div class="expc-prazo"><small class="${atrasoExp(x) ? 'c-ruim' : 'mut'}">${x.despachado ? (x.loja ? 'Entregue ' : 'Saiu ') + (x.despachoEm ? dataHora(x.despachoEm) : '') : prazo ? (x.loja ? 'entregar até ' : 'despachar até ') + dataHora(prazo) : 'sem prazo'}</small>${etq ? `<div class="expc-tags">${etq}</div>` : ''}</div></div>
    ${p.obs_interna ? `<div class="expc-obs">📝 ${esc(p.obs_interna)}</div>` : ''}
    <div class="expc-trilha"><span class="rot">📦 Material</span><div class="expc-passos">${passos.map(([n, quando]) => `<span class="${quando ? 'ok' : ''}" title="${quando ? dataHora(quando) : ''}">${quando ? '✓ ' : ''}${n}</span>`).join('<i>›</i>')}</div><div class="expc-acao">${botaoMat}</div></div>
    <div class="expc-trilha"><span class="rot">💰 Pagamento</span><div class="expc-pag ${pagCls}">${pagTxt}</div><div class="expc-acao">${botaoPag}</div></div>
    ${!x.despachado && e.separado_em && x.etapa !== 'aguardando' ? `<div class="expc-falta">${faltaDe(x)}</div>` : x.etapa === 'aguardando' && !x.pagPendente ? '<div class="expc-falta">⏳ Ainda em aberto no Tiny (pagamento ou conferência do pedido)</div>' : ''}
    <table class="tabela expc-itens"><tbody>${its.map(i => { const pr = EXP.prod[String(i.produto_id)];
      return `<tr><td class="num"><b>${N(i.quantidade)}×</b></td><td><b>${esc(i.codigo || '')}</b> ${esc(i.descricao || '')}</td><td><small>${pr ? '📍 ' + esc(pr.localizacao || pr.unidade || '—') : ''}</small></td><td class="dir"><small>${pr?.saldo != null ? 'estoque ' + N(pr.saldo) : ''}</small></td></tr>`; }).join('') || '<tr><td class="mut">Itens ainda não carregados do Tiny.</td></tr>'}</tbody></table>
    ${brindes.map(b => `<div class="alerta ok expc-av"><span class="ic">🎁</span><span><b>Brinde: ${b.qtd}× ${esc(CRE.brindes?.find(y => y.id === b.brinde_id)?.nome || 'brinde')}</b> · separar junto</span><button class="btn peq" data-a="briAprovar" data-id="${b.id}" data-v="entregue">Entregue</button></div>`).join('')}
    ${ocs.map(o => `<div class="alerta med expc-av"><span class="ic">${TIPOS_OC[o.tipo][0]}</span><span style="flex:1">${TIPOS_OC[o.tipo][1]}${o.produto ? ': ' + esc(o.produto) : ''}${o.descricao ? ' · ' + esc(o.descricao) : ''}</span>${podeExcluirOc(o) ? `<button class="icone-btn" data-a="expOcExcluir" data-id="${o.id}" title="Excluir esta ocorrência">🗑</button>` : ''}</div>`).join('')}
    ${x.faturamento && !x.despachado ? `<div class="alerta ${x.nfOk ? 'ok' : 'ruim'} expc-av"><span class="ic">🧾</span><span style="flex:1"><b>Faturamento (${esc(p.pag_forma || p.forma_pagamento || '')}): NF obrigatória.</b>
        ${e.nf_dispensa ? ` Liberado sem NF por ${esc(nomeP(e.nf_dispensa_por))}: ${esc(e.nf_dispensa)}` : e.nf_numero ? ` NF ${esc(e.nf_numero)} · ${esc(e.nf_situacao || '')}` : ` ${e.nf_situacao ? 'Sem nota no Tiny' : 'Nota ainda não conferida'}.`}</span>
        ${x.nfOk ? '' : `<button class="btn peq" data-a="expNF" data-id="${p.id}">🔄 Conferir NF</button>${podeAprovarPag() ? `<button class="btn peq" data-a="expNFDispensa" data-id="${p.id}">Liberar sem NF</button>` : ''}`}</div>`
      : alertaDeposito(p) && !x.despachado ? '<div class="alerta med expc-av"><span class="ic">🧾</span><span>Depósito: se for faturamento, a nota fiscal é obrigatória antes de sair.</span></div>' : ''}
    ${ml && ml.envio_substatus === 'invoice_pending' ? '<div class="alerta med expc-av"><span class="ic">🧾</span><span>Aguardando a nota fiscal: a etiqueta do ML só libera depois da NF.</span></div>' : ''}
    ${e.tiny_erro ? `<div class="alerta ruim expc-av"><span class="ic">⚠</span><span>O Tiny não atualizou: ${esc(e.tiny_erro)}</span></div>` : ''}
    <div class="expc-pe">${etiqueta ? `<button class="btn peq" data-a="imprimirEtiquetas" data-envios="${esc(String(ml.envio_id))}">🖨 Etiqueta</button>` : ''}
      <details class="expc-mais"><summary>⋯ Mais ações</summary><div class="acoes">
        <button class="btn peq" data-a="expOcorrencia" data-id="${p.id}">⚠ Registrar ocorrência</button>
        ${e.separado_em || e.pago_em ? `<button class="btn peq" data-a="expDesfazer" data-id="${p.id}">↺ Desfazer a última etapa</button>` : ''}
        ${!p.numero_ecommerce && !x.despachado ? `<button class="btn peq" data-a="expFrete" data-id="${p.id}">🚚 Trocar frete</button>` : ''}
        ${!p.numero_ecommerce && !x.despachado && podeAprovarPag() ? `<button class="btn peq perigo" data-a="expCancelar" data-id="${p.id}">✖ Cancelar venda</button>` : ''}</div></details></div>
  </div>`;
}

/** Pagamento do balcão: "Recebi no balcão" ou "Já estava pago (link)". */
async function expPago(id, como) {
  const p = EXP.ecom.find(x => x.id === id); if (!p) return;
  const msg = como === 'antes' ? `O pedido ${p.numero} (${R(p.valor)} · ${p.pag_forma || p.forma_pagamento || ''}) JÁ ESTAVA PAGO antes (link de pagamento)?\n\nConfira o comprovante antes de confirmar.`
    : `Você RECEBEU o pagamento do pedido ${p.numero} no balcão?\n\n${R(p.valor)} · ${p.pag_forma || p.forma_pagamento || ''}`;
  if (!confirm(msg)) return;
  try {
    const r = await chamarFuncao('expedicao', { acao: 'etapa', pedido_id: id, etapa: 'pago' });
    EXP.exp[id] = r.expedicao;
    const { error } = await sb.rpc('exp_pago_como', { p_pedido: id, p_como: como });
    if (!error) EXP.exp[id].pago_como = como;
    if (r.aviso) alert(r.aviso);
    render();
  } catch (e) { alert('Não gravou: ' + e.message); }
}
