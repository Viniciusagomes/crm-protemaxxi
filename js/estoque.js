'use strict';
/* Estoque (página própria): entrada de NF, contagem do dia, estoque baixo e indicadores.
   Visão geral do estoque (overview do Fefão): tudo o que pede atenção hoje, com atalhos para cada página. */

function vEstoque() {
  if (!EXP) { carregarExp().then(render).catch(e => avisar(e.message)); return topo('Estoque', '') + '<div class="card vazio">Carregando o estoque…</div>'; }
  const contHoje = EXP.cont.filter(c => c.data === hojeSP() && c.status !== 'recusado');
  const entAbertas = ENT.notas ? ENT.notas.filter(n => ['a_receber', 'conferindo', 'divergente'].includes(n.status)).length : '';
  const abas = [['entrada', '📥 Entrada de NF', entAbertas], ['contagem', '🔢 Contagem do dia', `${contHoje.length}/${EXP.cfg.meta_contagem}`], ['estoque', '📉 Estoque baixo', EXP.alertas.length], ['indicadores', '📊 Indicadores', '']];
  UI.estAba = abas.some(a => a[0] === UI.estAba) ? UI.estAba : 'entrada';
  return topo('Estoque', 'Entrada de notas, contagem do dia, estoque baixo e indicadores da expedição',
    `<button class="btn" data-a="expAtualizar" ${EXP_ATUALIZANDO.v ? 'disabled' : ''}>${EXP_ATUALIZANDO.v ? '⏳ Atualizando…' : '↻ Atualizar'}</button>`)
    + `<div class="chips">${abas.map(([k, n, b]) => `<button class="chip ${UI.estAba === k ? 'on' : ''}" data-a="estAba" data-v="${k}">${n}${b !== '' ? `<span class="n">${b}</span>` : ''}</button>`).join('')}</div>
    <div class="mt">${{ entrada: abaEntradaNF, contagem: abaContagem, estoque: abaEstoque, indicadores: abaIndicadores }[UI.estAba]()}</div>`;
}

function vVisaoEstoque() {
  if (!EXP) { carregarExp().then(render).catch(e => avisar(e.message)); return topo('Visão geral do estoque', '') + '<div class="card vazio">Carregando…</div>'; }
  if (!ENT.notas && !ENT.carregando) carregarEntradas().then(render).catch(() => {});
  const h = hojeSP(), todos = EXP.ecom.map(infoPedido), ativos = todos.filter(x => !x.despachado);
  const n = f => ativos.filter(f).length;
  const recebidos = n(x => x.etapa === 'aguardando'), separar = ativos.filter(x => x.etapa === 'a_separar'), atrasados = n(x => x.atrasado);
  const separados = n(x => ['separado', 'conferido'].includes(x.etapa) && !(x.balcao && x.pago)), pagos = n(x => x.balcao && x.pago && x.etapa !== 'aguardando');
  const fatSemNF = n(x => x.faturamento && !x.nfOk), concluidos = todos.filter(x => x.despachoEm && dataSP(x.despachoEm) === h).length;
  const ocs = EXP.ocs.filter(o => !o.resolvido), cont = EXP.cont.filter(c => c.data === h && c.status !== 'recusado').length, meta = EXP.cfg.meta_contagem;
  const ent = ENT.notas ? ENT.notas.filter(x => ['a_receber', 'conferindo', 'divergente'].includes(x.status)).length : '…';
  const ir = (v, extra = '') => `data-a="estIr" data-v="${v}" ${extra}`;
  const kpi = (rot, val, sub, cor, alvo) => `<div class="card kpi-card clic" style="cursor:pointer" ${alvo}><div class="rot">${rot}</div><div class="val ${cor || ''}">${val}</div><div class="sub">${sub}</div></div>`;
  const porFrete = FRETES_EXP.filter(f => f[0] !== 'todos').map(([k, nome, ic]) => [k, nome, ic, ativos.filter(x => freteDe(x) === k).length]).filter(f => f[3]);
  return topo('Visão geral do estoque', `${fmtData(hoje())} · o que pede atenção hoje na expedição e no estoque`,
    `<button class="btn" data-a="expAtualizar" ${EXP_ATUALIZANDO.v ? 'disabled' : ''}>${EXP_ATUALIZANDO.v ? '⏳ Atualizando…' : '↻ Atualizar'}</button><button class="btn" data-a="abrirTV">📺 TV do estoque</button>`)
    + `<h3 class="mt">📦 Pedidos</h3><div class="grid g4">
      ${kpi('A separar', separar.length, `${separar.filter(x => x.loja).length} no balcão · ${separar.filter(x => !x.loja).length} envios`, separar.length ? 'c-med' : 'c-ok', ir('expedicao', 'data-f="a_separar"'))}
      ${kpi('Atrasados', atrasados, 'passaram do prazo', atrasados ? 'c-ruim' : 'c-ok', ir('expedicao', 'data-f="atrasados"'))}
      ${kpi('Recebidos', recebidos, 'aguardando aprovação ou pagamento', '', ir('expedicao', 'data-f="recebido"'))}
      ${kpi('Concluídos hoje', concluidos, 'entregues ou despachados', 'c-ok', ir('expedicao', 'data-f="hoje"'))}
      ${kpi('Separados', separados, 'esperando conferir, pagar ou sair', '', ir('expedicao', 'data-f="separado"'))}
      ${kpi('Pagos no balcão', pagos, 'esperando o cliente retirar', '', ir('expedicao', 'data-f="pago"'))}
      ${kpi('🧾 Faturamento sem NF', fatSemNF, 'boleto/múltiplas: só saem com nota', fatSemNF ? 'c-ruim' : 'c-ok', ir('expedicao', 'data-f="faturamento"'))}
      ${kpi('⚠ Ocorrências abertas', ocs.length, 'item faltante, avaria, etiqueta…', ocs.length ? 'c-ruim' : 'c-ok', ir('expedicao', 'data-f="a_separar"'))}</div>
    <h3 class="mt">🏷 Estoque</h3><div class="grid g4">
      ${kpi('🔢 Contagem do dia', `${cont} de ${meta}`, 'itens conferidos hoje', cont >= meta ? 'c-ok' : 'c-med', ir('estoque', 'data-e="contagem"'))}
      ${kpi('📥 Entrada de NF', ent, 'notas a receber ou conferir', ent ? 'c-med' : 'c-ok', ir('estoque', 'data-e="entrada"'))}
      ${kpi('📉 Estoque baixo', EXP.alertas.length, 'produtos para pedir compra', EXP.alertas.length ? 'c-med' : '', ir('estoque', 'data-e="estoque"'))}
      ${kpi('📊 Indicadores', '→', 'tempo de separação, erros, contagens', '', ir('estoque', 'data-e="indicadores"'))}</div>
    <div class="grid g2 mt">
      <div class="card"><div class="secao-titulo"><h2>Por forma de frete</h2><small>pedidos em aberto</small></div>
        ${porFrete.length ? `<table class="tabela"><tbody>${porFrete.map(([k, nome, ic, c]) => `<tr class="clic" ${ir('expedicao', `data-fr="${k}"`)} style="cursor:pointer"><td>${ic} ${nome}</td><td class="dir"><b>${c}</b></td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhum pedido em aberto. 👏</div>'}</div>
      <div class="card"><div class="secao-titulo"><h2>Próximos a separar</h2><a href="#/expedicao">expedição</a></div>
        ${separar.length ? `<table class="tabela"><tbody>${separar.sort((a, b) => (b.loja - a.loja) || ((a.prazo || 9e15) - (b.prazo || 9e15))).slice(0, 8).map(x => `<tr><td><b>${esc(x.p.numero || '')}</b> · ${esc(x.p.cliente_nome || '')}<br><small>${esc(tipoTV(x)[1])}${x.prazo ? ' · até ' + dataHora(x.prazo) : ''}</small></td><td class="dir">${x.atrasado ? '<span class="tag ruim">atrasado</span>' : ''}${x.faturamento ? ' <span class="tag ruim">🧾 NF</span>' : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nada para separar agora. 👏</div>'}</div></div>
    ${ocs.length ? `<div class="card mt"><div class="secao-titulo"><h2>⚠ Ocorrências abertas</h2></div>${ocs.slice(0, 8).map(o => `<div class="alerta med" style="margin-top:6px"><span class="ic">${(TIPOS_OC[o.tipo] || TIPOS_OC.outro)[0]}</span><span>${(TIPOS_OC[o.tipo] || TIPOS_OC.outro)[1]}${o.pedido_numero ? ' · pedido ' + esc(o.pedido_numero) : ''}${o.produto ? ': ' + esc(o.produto) : ''}${o.descricao ? ' — ' + esc(o.descricao) : ''}</span></div>`).join('')}</div>` : ''}`;
}
