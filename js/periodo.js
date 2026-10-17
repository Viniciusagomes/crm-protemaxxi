'use strict';
/* Intranet Protemaxxi — Vendas por período (de/até), comparação com o período anterior e painel de descontos. */

const PER_VENDAS = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7', '7 dias'], ['mes', 'Este mês'], ['mesant', 'Mês anterior'], ['30', '30 dias'], ['ano', 'Este ano'], ['data', 'Escolher datas']];
const P1 = v => v == null || !isFinite(v) ? '—' : `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const pctDesc = p => p.total_produtos ? p.desconto / p.total_produtos : 0;
const corDesc = pc => pc > 0.091 ? 'c-ruim' : pc > 0.05 ? 'c-med' : '';

/** Intervalo escolhido e o anterior de mesmo tamanho (para comparar). */
function periodoVendas() {
  const h = hoje(), p = UI.vPer || 'mes', m = mesDe(h);
  let ini = h, fim = h;
  if (p === 'ontem') ini = fim = addDias(h, -1);
  else if (p === '7') ini = addDias(h, -6);
  else if (p === '30') ini = addDias(h, -29);
  else if (p === 'mes') ini = `${m}-01`;
  else if (p === 'mesant') { const ma = addMes(m, -1); ini = `${ma}-01`; fim = `${ma}-${pad(ultimoDia(ma))}`; }
  else if (p === 'ano') ini = `${h.slice(0, 4)}-01-01`;
  else if (p === 'data') { ini = UI.vDe || `${m}-01`; fim = UI.vAte || h; if (fim < ini) [ini, fim] = [fim, ini]; }
  const dias = Math.round((pd(fim) - pd(ini)) / 864e5) + 1;
  // "este mês" compara com o mês anterior até o mesmo dia; os demais, com o mesmo número de dias logo antes
  let aIni = addDias(ini, -dias), aFim = addDias(ini, -1);
  if (p === 'mes') { const ma = addMes(m, -1); aIni = `${ma}-01`; aFim = `${ma}-${pad(Math.min(pd(h).getDate(), ultimoDia(ma)))}`; }
  if (p === 'mesant') { const mb = addMes(m, -2); aIni = `${mb}-01`; aFim = `${mb}-${pad(ultimoDia(mb))}`; }
  return { ini, fim, aIni, aFim, dias };
}
function resumoPeriodo(lista) {
  const fat = somaV(lista), bruto = soma(lista.map(p => p.total_produtos || 0)), desc = soma(lista.map(p => p.desconto || 0));
  return { fat, n: lista.length, ticket: lista.length ? fat / lista.length : 0, bruto, desc, pct: bruto ? desc / bruto : 0, comDesc: lista.filter(p => p.desconto > 0).length };
}

function blocoPeriodo(vids, verLoja) {
  const { ini, fim, aIni, aFim } = periodoVendas(), per = UI.vPer || 'mes';
  const meu = p => valido(p) && (verLoja || vids.includes(p.vendedor_id));
  const lista = D.pedidos.filter(p => meu(p) && p.data >= ini && p.data <= fim);
  const ant = D.pedidos.filter(p => meu(p) && p.data >= aIni && p.data <= aFim);
  const r = resumoPeriodo(lista), ra = resumoPeriodo(ant);
  const cmp = (a, b, menorMelhor) => b ? `<span class="${(a >= b) !== !!menorMelhor ? 'c-ok' : 'c-ruim'}">${a >= b ? '▲' : '▼'} ${P(Math.abs(a / b - 1))}</span> vs. ${fmtCurta(aIni)}–${fmtCurta(aFim)}` : '<span class="mut">sem base para comparar</span>';
  const porV = Object.values(lista.reduce((a, p) => { const k = p.vendedor_id || '_'; (a[k] ||= { vid: p.vendedor_id, ps: [] }).ps.push(p); return a; }, {}))
    .map(x => ({ ...x, ...resumoPeriodo(x.ps), maior: Math.max(0, ...x.ps.map(pctDesc)) })).sort((a, b) => b.fat - a.fat);
  const maiores = lista.filter(p => p.desconto > 0).sort((a, b) => b.desconto - a.desconto);
  const chips = PER_VENDAS.map(([k, n]) => `<button class="chip ${per === k ? 'on' : ''}" data-a="vPer" data-v="${k}">${n}</button>`).join('');

  return `<div class="periodo"><span class="rot">Período</span><div class="chips">${chips}</div>
      ${per === 'data' ? `<input type="date" value="${ini}" max="${hoje()}" data-c="ui" data-k="vDe"> até <input type="date" value="${fim}" max="${hoje()}" data-c="ui" data-k="vAte">` : ''}
      <span class="comp">${pd(ini).toLocaleDateString('pt-BR')}${ini !== fim ? ' a ' + pd(fim).toLocaleDateString('pt-BR') : ''}</span></div>
    <div class="grid g4">
      <div class="card kpi-card destaque"><div class="rot">Faturamento</div><div class="val verde">${R0(r.fat)}</div><div class="sub">${cmp(r.fat, ra.fat)}</div></div>
      <div class="card kpi-card"><div class="rot">Pedidos · ticket médio</div><div class="val">${r.n} · ${R0(r.ticket)}</div><div class="sub">${cmp(r.n, ra.n)}</div></div>
      <div class="card kpi-card"><div class="rot">Desconto concedido</div><div class="val ${corDesc(r.pct)}">${R0(r.desc)}</div><div class="sub">${P1(r.pct)} da venda bruta · ${cmp(r.desc, ra.desc, true)}</div></div>
      <div class="card kpi-card"><div class="rot">Venda bruta → líquida</div><div class="val">${R0(r.bruto - r.desc)}</div><div class="sub">bruta ${R0(r.bruto)} · ${r.comDesc} de ${r.n} pedido(s) com desconto</div></div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><div class="secao-titulo"><h2>Vendas e descontos por vendedor</h2><small>no período</small></div>
        <div class="rolagem"><table class="tabela"><thead><tr><th>Vendedor</th><th class="dir">Faturamento</th><th class="dir">Pedidos</th><th class="dir">Desconto</th><th class="dir">% desc.</th><th class="dir">Maior</th></tr></thead><tbody>
        ${porV.map(x => `<tr${x.vid ? ` class="clic" data-a="vendSel" data-v="${esc(x.vid)}"` : ''}><td><span style="color:${corVendedor(x.vid)}">●</span> <b>${esc(nomeVendedor(x.vid))}</b></td><td class="dir num">${R0(x.fat)}</td><td class="dir">${x.n}</td>
          <td class="dir">${R0(x.desc)}<br><small>${x.comDesc} pedido(s)</small></td><td class="dir ${corDesc(x.pct)}"><b>${P1(x.pct)}</b></td><td class="dir ${corDesc(x.maior)}">${P1(x.maior)}</td></tr>`).join('') || '<tr><td colspan="6" class="vazio">Sem pedidos no período.</td></tr>'}
        </tbody>${porV.length > 1 ? `<tfoot><tr><td>Total</td><td class="dir">${R0(r.fat)}</td><td class="dir">${r.n}</td><td class="dir">${R0(r.desc)}</td><td class="dir">${P1(r.pct)}</td><td></td></tr></tfoot>` : ''}</table></div>
        <p class="mut" style="font-size:12.5px;margin:8px 0 0">% sobre a venda bruta (produtos). Acima de 9,10% só com a tabela ADM e a sua autorização (regra de comissão).</p></div>
      <div class="card"><div class="secao-titulo"><h2>Maiores descontos</h2><small>${maiores.length} pedido(s)</small></div>
        ${maiores.length ? listaCurta('vendDescontos', `<table class="tabela"><thead><tr><th>Pedido</th><th>Vendedor</th><th class="dir">Desconto</th><th class="dir">%</th></tr></thead><tbody>${maiores.map(p => `<tr class="clic" data-a="verPedido" data-id="${p.id}"><td><b>${esc(p.cliente_nome)}</b><br><small>#${esc(p.numero || '')} · ${fmtCurta(p.data)} · ${R0(p.valor)}</small></td>
          <td><small>${esc(nomeVendedor(p.vendedor_id))}</small></td><td class="dir">${R(p.desconto)}</td><td class="dir ${corDesc(pctDesc(p))}"><b>${P1(pctDesc(p))}</b></td></tr>`).join('')}</tbody></table>`, 'Buscar cliente, pedido, vendedor…') : '<div class="vazio">Nenhum desconto no período. 👏</div>'}</div>
    </div>
    <div class="card mt"><div class="secao-titulo"><h2>Pedidos do período</h2><small>${lista.length} pedido(s) · busque por nº, cliente, data (dd/mm) ou valor</small></div>
      ${lista.length ? listaCurta('vendPeriodo', `<table class="tabela"><thead><tr><th>Data</th><th>Nº</th><th>Cliente</th><th>Vendedor</th><th>Situação</th><th class="dir">Desconto</th><th class="dir">Valor</th></tr></thead><tbody>${lista.map(p => `<tr class="clic" data-a="verPedido" data-id="${p.id}"><td>${fmtCurta(p.data)}/${p.data.slice(2, 4)}</td><td>${esc(p.numero || '')}</td><td><b>${esc(p.cliente_nome)}</b>${p.numero_ecommerce ? ` <span class="tag">${esc(p.canal || 'e-commerce')}</span>` : ''}</td>
        <td><small>${esc(nomeVendedor(p.vendedor_id))}</small></td><td><span class="tag">${esc(p.situacao || '')}</span></td><td class="dir">${p.desconto ? R(p.desconto) : '—'}</td><td class="dir num">${R(p.valor)}</td></tr>`).join('')}</tbody></table>`, 'Buscar nº, cliente, 15/10, valor…') : '<div class="vazio">Sem pedidos no período.</div>'}</div>`;
}
