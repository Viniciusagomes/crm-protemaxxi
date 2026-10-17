'use strict';
/* Intranet Protemaxxi — Monitoria de preços (tabela ADM): compara, item a item, o valor vendido com o preço de cadastro
   e o custo do produto no Tiny. Só pedidos da loja (marketplace fica fora). Vê: dono e quem tem a permissão monitoria_precos. */

const MON = { dados: null, chave: '', carregando: false };
const veMonitoria = () => ehDono() || !!EU?.permissoes?.monitoria_precos;
const LIMITE_DESC = 0.091;   // acima disso só com a tabela ADM e autorização (regra de comissão)
const SELOS = {
  zerado: ['🔴 Zerado', 'zerado', 'Valor zero ou quase: provável esquecimento na tabela ADM'],
  preju: ['🔴 Abaixo do custo', 'preju', 'Vendido abaixo do custo de cadastro'],
  fora: ['🟠 Fora da regra', 'fora', 'Desconto acima de 9,10% sobre o preço de cadastro'],
  desc: ['🟡 Desconto', 'desc', 'Desconto dentro da regra'],
  ok: ['✅ OK', 'ok', 'Igual ao cadastro ou à promoção'],
  acima: ['🔵 Acima do cadastro', 'acima', 'Vendido acima do preço de cadastro: o cadastro pode estar desatualizado'],
  sem: ['⚪ Sem preço', '', 'Produto sem preço de cadastro no Tiny'],
};
/** Classifica um item: compara com o preço de lista (e com a promoção, quando houver). */
function seloItem(i) {
  const v = +i.valor_unitario || 0, c = +i.preco_cadastro || 0, pm = +i.promo_cadastro || 0, cu = +i.custo_cadastro || 0;
  if (!c) return 'sem';
  if (v <= 0.01) return 'zerado';
  if (cu && v < cu * 0.999) return 'preju';
  const base = pm && pm < c ? pm : c;
  if (v > c * 1.01) return 'acima';
  if (v >= base * 0.99) return 'ok';
  return v < c * (1 - LIMITE_DESC) ? 'fora' : 'desc';
}

function periodoMon() {
  const h = hoje(), p = UI.monPer || '7';
  const ini = p === 'hoje' ? h : p === '7' ? addDias(h, -6) : p === '30' ? addDias(h, -29) : p === 'mes' ? `${mesDe(h)}-01` : (UI.monDe || addDias(h, -6));
  const fim = p === 'data' ? (UI.monAte || h) : h;
  return { ini, fim, chave: ini + fim };
}
async function carregarMonitoria(forcar) {
  const { ini, fim, chave } = periodoMon();
  if (MON.dados && MON.chave === chave && !forcar) return;
  MON.carregando = true;
  try {
    const linhas = await todas(() => sb.rpc('monitoria_precos', { p_desde: ini, p_ate: fim }));
    for (const l of linhas) l.selo = seloItem(l);
    MON.dados = linhas; MON.chave = chave;
  } finally { MON.carregando = false; }
}

function vMonitoria() {
  if (!veMonitoria()) return topo('Monitoria de preços', '') + '<div class="card vazio">Sem acesso.</div>';
  const { chave } = periodoMon();
  if (!MON.dados || MON.chave !== chave) {
    if (!MON.carregando) carregarMonitoria().then(render).catch(e => avisar(e.message));
    return topo('Monitoria de preços', '') + '<div class="card vazio">Comparando os preços…</div>';
  }
  const todosI = MON.dados, fSelo = UI.monSelo || 'problemas', fVend = UI.monVend || '';
  const problema = s => ['zerado', 'preju', 'fora'].includes(s);
  const lista = todosI.filter(i => (fSelo === 'todos' || (fSelo === 'problemas' ? problema(i.selo) || i.selo === 'acima' : i.selo === fSelo))
    && (!fVend || i.vendedor_id === fVend) && (UI.monRev === 'todos' || !i.rev_status || i.rev_status === 'corrigir'))
    .sort((a, b) => ['zerado', 'preju', 'fora', 'acima', 'desc', 'ok', 'sem'].indexOf(a.selo) - ['zerado', 'preju', 'fora', 'acima', 'desc', 'ok', 'sem'].indexOf(b.selo) || (b.data > a.data ? 1 : -1));
  const conta = k => todosI.filter(i => i.selo === k).length;
  const perda = i => Math.max(0, (+i.preco_cadastro - +i.valor_unitario) * (+i.quantidade || 0));
  const abaixo = todosI.filter(i => ['zerado', 'preju', 'fora', 'desc'].includes(i.selo));
  const porV = Object.values(todosI.reduce((a, i) => { const k = i.vendedor_id || '_'; const x = (a[k] ||= { vid: i.vendedor_id, n: 0, prob: 0, perda: 0, preju: 0 });
    x.n++; if (problema(i.selo)) x.prob++; if (i.selo === 'preju' || i.selo === 'zerado') x.preju++; if (['zerado', 'preju', 'fora', 'desc'].includes(i.selo)) x.perda += perda(i); return a; }, {})).sort((a, b) => b.perda - a.perda);
  const vends = [...new Set(todosI.map(i => i.vendedor_id).filter(Boolean))];
  const per = UI.monPer || '7', { ini, fim } = periodoMon();
  const chipsP = [['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['mes', 'Este mês'], ['data', 'Escolher datas']].map(([k, n]) => `<button class="chip ${per === k ? 'on' : ''}" data-a="monPer" data-v="${k}">${n}</button>`).join('');
  const chipsS = [['problemas', 'Precisam de atenção'], ['zerado', SELOS.zerado[0]], ['preju', SELOS.preju[0]], ['fora', SELOS.fora[0]], ['acima', SELOS.acima[0]], ['desc', SELOS.desc[0]], ['todos', 'Todos']]
    .map(([k, n]) => `<button class="chip ${fSelo === k ? 'on' : ''}" data-a="monSelo" data-v="${k}">${n}${k !== 'problemas' && k !== 'todos' ? ` <span class="n">${conta(k)}</span>` : ''}</button>`).join('');
  const linha = i => { const k = `${i.pedido_id}|${i.seq}`, s = SELOS[i.selo], dif = +i.preco_cadastro ? +i.valor_unitario / +i.preco_cadastro - 1 : null;
    const margem = +i.custo_cadastro && +i.valor_unitario ? (+i.valor_unitario - +i.custo_cadastro) / +i.valor_unitario : null;
    return `<tr><td><small>${fmtCurta(i.data)}</small><br><a href="#" data-a="verPedido" data-id="${esc(i.pedido_id)}">#${esc(i.numero)}</a></td>
      <td><b>${esc(i.codigo || '—')}</b> ${esc(i.descricao || '')}<br><small>${esc(i.cliente_nome || '')} · <span style="color:${corVendedor(i.vendedor_id)}">●</span> ${esc(nomeVendedor(i.vendedor_id))}</small></td>
      <td class="dir">${N(i.quantidade)}</td>
      <td class="dir">${i.preco_cadastro ? R(i.preco_cadastro) : '—'}${+i.promo_cadastro ? `<br><small>promo ${R(i.promo_cadastro)}</small>` : ''}${i.aproximado ? '<br><small class="mut" title="Preço de hoje: o item é anterior à monitoria">≈ atual</small>' : ''}</td>
      <td class="dir"><b>${R(i.valor_unitario)}</b><br><small class="${dif < -0.005 ? 'dif-neg' : dif > 0.01 ? 'dif-pos' : ''}">${dif == null ? '' : (dif > 0 ? '+' : '') + P1(dif)}</small></td>
      <td class="dir">${i.custo_cadastro ? R(i.custo_cadastro) : '—'}${margem != null ? `<br><small class="${margem < 0 ? 'dif-neg' : ''}">margem ${P1(margem)}</small>` : ''}</td>
      <td><span class="selo ${s[1]}" title="${esc(s[2])}">${s[0]}</span>
        ${i.rev_status ? `<br><small>${i.rev_status === 'ok' ? '✔ conferido' : '✎ corrigir'} por ${esc(nomeP(i.rev_por))}${i.rev_nota ? ': ' + esc(i.rev_nota) : ''}</small>` : ''}</td>
      <td class="dir" style="white-space:nowrap">${i.rev_status === 'ok' ? `<button class="btn peq" data-a="monRever" data-k="${esc(k)}" data-s="">↺</button>`
        : `<button class="btn peq" data-a="monRever" data-k="${esc(k)}" data-s="ok" title="O preço está certo">✔ Está certo</button> <button class="btn peq" data-a="monRever" data-k="${esc(k)}" data-s="corrigir" title="Avisar o vendedor para corrigir">✎ Corrigir</button>`}</td></tr>`; };

  return topo('Monitoria de preços', 'Valor vendido × preço de cadastro × custo, item por item, nos pedidos da loja. Pega o preço digitado à mão na tabela ADM.',
    `<button class="btn" data-a="monAtualizar">↻ Atualizar</button>`)
    + `<div class="periodo"><span class="rot">Período</span><div class="chips">${chipsP}</div>
        ${per === 'data' ? `<input type="date" value="${ini}" data-c="ui" data-k="monDe"> até <input type="date" value="${fim}" data-c="ui" data-k="monAte">` : ''}
        <span class="comp">${todosI.length} item(ns) vendidos</span></div>
    <div class="grid g4">
      <div class="card kpi-card destaque"><div class="rot">Vendido abaixo do cadastro</div><div class="val">${R0(soma(abaixo.map(perda)))}</div><div class="sub">${abaixo.length} item(ns) · diferença para o preço de cadastro</div></div>
      <div class="card kpi-card"><div class="rot">🔴 Abaixo do custo · zerados</div><div class="val ${conta('preju') + conta('zerado') ? 'c-ruim' : 'c-ok'}">${conta('preju')} · ${conta('zerado')}</div><div class="sub">prejuízo ou esquecimento</div></div>
      <div class="card kpi-card"><div class="rot">🟠 Fora da regra</div><div class="val ${conta('fora') ? 'c-med' : 'c-ok'}">${conta('fora')}</div><div class="sub">desconto acima de 9,10%</div></div>
      <div class="card kpi-card"><div class="rot">🔵 Acima do cadastro</div><div class="val">${conta('acima')}</div><div class="sub">o cadastro no Tiny pode estar desatualizado</div></div>
    </div>
    <div class="card mt"><div class="secao-titulo"><h2>Por vendedor</h2><small>no período</small></div><div class="rolagem"><table class="tabela"><thead><tr><th>Vendedor</th><th class="dir">Itens</th><th class="dir">Atenção</th><th class="dir">Abaixo do custo / zerados</th><th class="dir">Abaixo do cadastro (R$)</th></tr></thead><tbody>
      ${porV.map(x => `<tr class="clic" data-a="monVend" data-v="${esc(x.vid || '')}"><td><span style="color:${corVendedor(x.vid)}">●</span> <b>${esc(nomeVendedor(x.vid))}</b></td><td class="dir">${x.n}</td><td class="dir ${x.prob ? 'c-med' : ''}">${x.prob}</td><td class="dir ${x.preju ? 'c-ruim' : ''}">${x.preju}</td><td class="dir"><b>${R0(x.perda)}</b></td></tr>`).join('') || '<tr><td colspan="5" class="vazio">Sem vendas no período.</td></tr>'}
    </tbody></table></div></div>
    <div class="card mt"><div class="filtros" style="margin-bottom:8px"><div class="chips">${chipsS}</div>
      <select data-c="ui" data-k="monVend"><option value="">Todos os vendedores</option>${vends.map(v => `<option value="${esc(v)}" ${fVend === v ? 'selected' : ''}>${esc(nomeVendedor(v))}</option>`).join('')}</select>
      <label class="mut" style="font-size:13px"><input type="checkbox" data-c="monRevTodos" ${UI.monRev === 'todos' ? 'checked' : ''}> mostrar os já conferidos</label></div>
      ${lista.length ? listaCurta('monLista', `<table class="tabela"><thead><tr><th>Pedido</th><th>Item · cliente · vendedor</th><th class="dir">Qtd</th><th class="dir">Cadastro</th><th class="dir">Vendido</th><th class="dir">Custo</th><th>Selo</th><th></th></tr></thead><tbody>${lista.slice(0, 600).map(linha).join('')}</tbody></table>`, 'Buscar produto, cliente, pedido, vendedor…', true) : '<div class="vazio">Nada para mostrar com estes filtros. 👏</div>'}
      <p class="mut" style="font-size:12.5px;margin:8px 0 0">"≈ atual": item vendido antes da monitoria começar; a comparação usa o preço de hoje. Daqui para frente, a Intranet guarda o preço do dia da venda.</p></div>`;
}

async function monRever(k, status) {
  const [pedido_id, seq] = k.split('|');
  const nota = status ? (prompt(status === 'ok' ? 'Por que o preço está certo? (opcional; ex.: negociado por volume)' : 'O que o vendedor precisa corrigir?') ?? null) : null;
  if (status && nota === null) return;
  if (!status) await ok(sb.from('monitoria_revisoes').delete().eq('pedido_id', pedido_id).eq('seq', +seq));
  else await ok(sb.from('monitoria_revisoes').upsert({ pedido_id, seq: +seq, status, nota: nota || null, por: EU.id, em: new Date().toISOString() }));
  const i = MON.dados.find(x => x.pedido_id === pedido_id && x.seq === +seq);
  if (i) Object.assign(i, { rev_status: status || null, rev_nota: nota || null, rev_por: status ? EU.id : null });
  render();
}
