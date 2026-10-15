'use strict';
/* CRM Protemaxxi — Vendas (Tiny): painel de vendedores, Modo TV e lista de pedidos. */

const valido = p => p.situacao !== 'Cancelado';
const vendedoresPainel = () => D.pessoas.filter(p => p.ativo && p.tiny);
const nomeVendedor = vid => D.pessoas.find(p => p.tiny === vid)?.nome || D.vendedoresTiny.find(v => v.id === vid)?.nome || (vid ? 'Vendedor ' + vid : 'Sem vendedor');
const corVendedor = vid => D.pessoas.find(p => p.tiny === vid)?.cor || '#8AA0B4';
function diasUteisEntre(ini, fim) { let n = 0; for (let d = ini; d <= fim; d = addDias(d, 1)) if (dow(d) !== 0 && !D.config.feriados.includes(d)) n++; return n; }
const somaV = ps => soma(ps.map(p => p.valor));
const chaveCli = p => p.cliente_chave || 'n:' + (p.cliente_nome || '').toLowerCase().trim();

function resumoVendedor(vid, h = hoje()) {
  const m = mesDe(h), ma = addMes(m, -1), diaComp = Math.min(pd(h).getDate(), ultimoDia(ma));
  const todos = D.pedidos.filter(p => p.vendedor_id === vid), val = todos.filter(valido);
  const doMes = val.filter(p => p.data.startsWith(m));
  const antMesmo = val.filter(p => p.data.startsWith(ma) && pd(p.data).getDate() <= diaComp);
  const primeira = {}; for (const p of val) { const c = chaveCli(p); if (!primeira[c] || p.data < primeira[c]) primeira[c] = p.data; }
  const clientes = new Set(doMes.map(chaveCli));
  const du = diasUteisEntre(`${m}-01`, h), duT = diasUteisEntre(`${m}-01`, `${m}-${pad(ultimoDia(m))}`);
  const v = somaV(doMes), lojaMes = somaV(D.pedidos.filter(p => valido(p) && p.data.startsWith(m)));
  return {
    vid, mes: v, pedidos: doMes.length, ticket: doMes.length ? v / doMes.length : 0, clientes: clientes.size,
    novos: [...clientes].filter(c => primeira[c] >= `${m}-01`).length,
    antMesmo: somaV(antMesmo), ant: somaV(val.filter(p => p.data.startsWith(ma))),
    hoje: somaV(doMes.filter(p => p.data === h)), pedHoje: doMes.filter(p => p.data === h).length,
    ontem: somaV(val.filter(p => p.data === addDias(h, -1))),
    proj: du ? v / du * duT : 0, part: lojaMes ? v / lojaMes : 0,
    aberto: doMes.length ? doMes.filter(p => p.situacao === 'Em aberto').length / doMes.length : 0,
  };
}
function serieAcumulada(vid, m, ate) {
  const diario = {}; for (const p of D.pedidos) if (valido(p) && (vid === '*' || p.vendedor_id === vid) && p.data.startsWith(m)) diario[pd(p.data).getDate()] = (diario[pd(p.data).getDate()] || 0) + p.valor;
  const out = []; let acc = 0; for (let d = 1; d <= ate; d++) { acc += diario[d] || 0; out.push(acc); } return out;
}

// ─── gráficos (SVG simples, sem biblioteca) ───
function graficoCorrida(vids, h) {
  const m = mesDe(h), ma = addMes(m, -1), nD = ultimoDia(m), hojeD = pd(h).getDate();
  const series = vids.map(vid => ({ vid, cor: corVendedor(vid), atual: serieAcumulada(vid, m, hojeD), ant: serieAcumulada(vid, ma, ultimoDia(ma)) }));
  const max = Math.max(1, ...series.flatMap(s => [...s.atual, ...s.ant]));
  const W = 900, H = 280, e = 56, b = 26, t = 10, r = 12;
  const x = d => e + (d - 1) / (Math.max(nD, 28) - 1) * (W - e - r), y = v => t + (1 - v / max) * (H - t - b);
  const linha = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const grades = [0, .25, .5, .75, 1].map(f => `<line class="grade" x1="${e}" x2="${W - r}" y1="${y(max * f)}" y2="${y(max * f)}"/><text x="${e - 6}" y="${y(max * f) + 4}" text-anchor="end">${R0(max * f).replace('R$', '').trim()}</text>`).join('');
  const dias = [1, 5, 10, 15, 20, 25, nD].map(d => `<text x="${x(d)}" y="${H - 6}" text-anchor="middle">${d}</text>`).join('');
  return `<div class="grafico"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Venda acumulada no mês">${grades}${dias}
    ${series.map(s => `<path d="${linha(s.ant)}" fill="none" stroke="${s.cor}" stroke-width="1.6" stroke-dasharray="4 4" opacity=".55"/>`).join('')}
    ${series.map(s => `<path d="${linha(s.atual)}" fill="none" stroke="${s.cor}" stroke-width="3" stroke-linejoin="round"/><circle cx="${x(hojeD)}" cy="${y(s.atual[hojeD - 1] || 0)}" r="4.5" fill="${s.cor}"/>`).join('')}
  </svg><div class="leg">${series.map(s => `<span><i style="background:${s.cor}"></i>${esc(nomeVendedor(s.vid))}</span>`).join('')}<span><i style="background:var(--txt3);height:2px"></i>tracejado = mês anterior</span></div></div>`;
}
function grafico12Meses(vids, verLoja) {
  const mh = mesDe(hoje()), meses = Array.from({ length: 13 }, (_, i) => addMes(mh, i - 12));
  const dados = meses.map(m => { const doMes = D.pedidos.filter(p => valido(p) && p.data.startsWith(m)); const por = vids.map(v => somaV(doMes.filter(p => p.vendedor_id === v))); return { m, por, outros: verLoja ? somaV(doMes) - soma(por) : 0 }; });
  const max = Math.max(1, ...dados.map(d => soma(d.por) + d.outros));
  const W = 900, H = 260, e = 56, b = 26, t = 10, r = 8, bw = (W - e - r) / meses.length;
  const y = v => (H - t - b) * v / max;
  const barras = dados.map((d, i) => { let base = H - b; const partes = [...d.por.map((v, j) => [v, corVendedor(vids[j])]), [d.outros, '#B8C2CC']];
    return partes.map(([v, cor]) => { const hh = y(v); base -= hh; return v > 0 ? `<rect x="${e + i * bw + 4}" y="${base}" width="${bw - 8}" height="${hh}" fill="${cor}" rx="2"><title>${MESES[pd(d.m + '-01').getMonth()]}: ${R0(v)}</title></rect>` : ''; }).join('')
      + `<text x="${e + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${MESES[pd(d.m + '-01').getMonth()].slice(0, 3)}</text>`; }).join('');
  const grades = [0, .5, 1].map(f => `<line class="grade" x1="${e}" x2="${W - r}" y1="${H - b - y(max * f)}" y2="${H - b - y(max * f)}"/><text x="${e - 6}" y="${H - b - y(max * f) + 4}" text-anchor="end">${R0(max * f).replace('R$', '').trim()}</text>`).join('');
  return `<div class="grafico"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Vendas dos últimos 12 meses">${grades}${barras}</svg>
    <div class="leg">${vids.map(v => `<span><i style="background:${corVendedor(v)}"></i>${esc(nomeVendedor(v))}</span>`).join('')}${verLoja ? '<span><i style="background:#B8C2CC"></i>Outros (loja)</span>' : ''}</div></div>`;
}

function infoSync() {
  const u = D.sync.ultimo_incremental?.em, bf = D.sync.backfill, fila = D.sync.fila_detalhe?.pendentes;
  if (!bf?.concluido) return `<span class="sync">⏳ Carregando o histórico do Tiny (${bf?.pendentes?.length ?? 13} meses pendentes)…</span>`;
  const min = u ? Math.round((Date.now() - new Date(u)) / 60000) : null;
  return `<span class="sync">Tiny: ${min == null ? '—' : min < 2 ? 'atualizado agora' : `atualizado há ${min < 60 ? min + ' min' : Math.round(min / 60) + ' h'}`}${fila ? ` · ${fila} pedido(s) aguardando detalhe` : ''}</span>`;
}

function vVendas() {
  const h = hoje(), m = mesDe(h), vids = vendedoresPainel().map(p => p.tiny).filter(v => D.pedidos.some(p => p.vendedor_id === v) || veTudoVendas() || v === EU?.tiny);
  const verLoja = veTudoVendas();
  const lojaVal = D.pedidos.filter(p => valido(p) && p.data.startsWith(m));
  const ma = addMes(m, -1), diaComp = Math.min(pd(h).getDate(), ultimoDia(ma));
  const lojaAnt = somaV(D.pedidos.filter(p => valido(p) && p.data.startsWith(ma) && pd(p.data).getDate() <= diaComp));
  const du = diasUteisEntre(`${m}-01`, h), duT = diasUteisEntre(`${m}-01`, `${m}-${pad(ultimoDia(m))}`);
  const ecomMes = lojaVal.filter(p => p.numero_ecommerce);
  const res = vids.map(v => resumoVendedor(v, h));
  if (!vids.includes(UI.vendSel)) UI.vendSel = vids[0] || '';
  const comp = (a, b) => b ? `<span class="comp ${a >= b ? 'sobe' : 'desce'}">${a >= b ? '▲' : '▼'} ${P(Math.abs(a / b - 1))} vs. mesmo período de ${MESES[pd(ma + '-01').getMonth()]}</span>` : '<span class="comp">—</span>';
  const cards = res.map(r => { const p = D.pessoas.find(x => x.tiny === r.vid); const k = p && kpiDe(p, 'fat');
    return `<div class="card vcard" style="--cor:${corVendedor(r.vid)}"><div class="nome">${p ? av(p) : ''}<div><b>${esc(nomeVendedor(r.vid))}</b><br><small>${p ? esc(p.cargo) : ''}</small></div></div>
      <div class="grande">${R0(r.mes)}</div>${comp(r.mes, r.antMesmo)}
      ${k ? `<div class="mt" style="margin-top:10px">${barra(r.proj / (k.meta || 1))}<small>Projeção <b>${R0(r.proj)}</b> · meta ${R0(k.meta)} (${P(r.proj / (k.meta || 1))})</small></div>` : `<div class="mt" style="margin-top:10px"><small>Projeção do mês: <b>${R0(r.proj)}</b></small></div>`}
      <div class="mini-grid"><div><small>Hoje</small><b>${R0(r.hoje)}</b></div><div><small>Ontem</small><b>${R0(r.ontem)}</b></div><div><small>Pedidos</small><b>${r.pedidos}</b></div>
      <div><small>Ticket médio</small><b>${R0(r.ticket)}</b></div><div><small>Clientes (novos)</small><b>${r.clientes} (${r.novos})</b></div><div><small>${verLoja ? 'Da loja' : 'Mês anterior'}</small><b>${verLoja ? P(r.part) : R0(r.ant)}</b></div></div>
      ${r.aberto > 0.3 ? `<div class="alerta med mt" style="padding:6px 10px"><span class="ic">⚠</span><span>${P(r.aberto)} dos pedidos do mês estão "Em aberto" no Tiny</span></div>` : ''}</div>`; }).join('');
  const feed = D.pedidos.filter(p => vids.includes(p.vendedor_id) || verLoja).slice(0, 25);
  const sel = UI.vendSel, selRes = res.find(r => r.vid === sel);
  const doSel = D.pedidos.filter(p => p.vendedor_id === sel && valido(p));
  const top = Object.values(doSel.filter(p => p.data.startsWith(m)).reduce((a, p) => { const c = chaveCli(p); (a[c] ||= { chave: c, nome: p.cliente_nome, v: 0, n: 0 }); a[c].v += p.valor; a[c].n++; return a; }, {})).sort((a, b) => b.v - a.v).slice(0, 8);
  const porCli = doSel.reduce((a, p) => { const c = chaveCli(p); const x = (a[c] ||= { chave: c, nome: p.cliente_nome, v: 0, n: 0, ult: '', meses: new Set() }); x.v += p.valor; x.n++; x.meses.add(p.data.slice(0, 7)); if (p.data > x.ult) x.ult = p.data; return a; }, {});
  const parados = Object.values(porCli).filter(c => c.meses.size >= 2 && (pd(h) - pd(c.ult)) / 864e5 > 90).sort((a, b) => b.v - a.v).slice(0, 10);
  const sits = Object.entries(D.pedidos.filter(p => p.vendedor_id === sel && p.data.startsWith(m)).reduce((a, p) => { a[p.situacao] = (a[p.situacao] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  return topo('Vendas', `${fmtData(h)} · ${infoSync()}`, `<button class="btn so-normal" data-a="tv">📺 Modo TV</button>${ehDono() ? '<button class="btn so-normal" data-a="syncAgora">↻ Atualizar do Tiny</button>' : ''}<button class="btn so-tv" data-a="tv">Sair do Modo TV</button>`)
    + (verLoja ? `<div class="grid g4"><div class="card kpi-card"><div class="rot">Loja no mês</div><div class="val">${R0(somaV(lojaVal))}</div><div class="sub">${lojaAnt ? `${somaV(lojaVal) >= lojaAnt ? '▲' : '▼'} ${P(Math.abs(somaV(lojaVal) / lojaAnt - 1))} vs. mesmo período` : ''}</div></div>
      <div class="card kpi-card"><div class="rot">Projeção da loja</div><div class="val">${R0(du ? somaV(lojaVal) / du * duT : 0)}</div><div class="sub">${du} de ${duT} dias úteis</div></div>
      <div class="card kpi-card"><div class="rot">Hoje</div><div class="val">${R0(somaV(lojaVal.filter(p => p.data === h)))}</div><div class="sub">${lojaVal.filter(p => p.data === h).length} pedido(s)</div></div>
      <div class="card kpi-card"><div class="rot">E-commerce no mês</div><div class="val">${R0(somaV(ecomMes))}</div><div class="sub">${ecomMes.length} pedido(s) · ${Object.entries(ecomMes.reduce((a, p) => { a[p.canal || 'Canal ?'] = (a[p.canal || 'Canal ?'] || 0) + p.valor; return a; }, {})).map(([c, v]) => `${esc(c)} ${R0(v)}`).join(' · ') || '—'}</div></div></div>` : '')
    + `<div class="vcards mt">${cards || '<div class="card vazio">Nenhum vendedor ligado ao Tiny. Configure em Configurações › Logins e acessos.</div>'}</div>
    ${vids.length ? `<div class="card mt"><div class="secao-titulo"><h2>Corrida do mês</h2><small>Venda acumulada dia a dia</small></div>${graficoCorrida(vids, h)}</div>` : ''}
    <div class="grid g2 mt">
      <div class="card"><div class="secao-titulo"><h2>Últimos pedidos</h2><a href="#/pedidos" class="so-normal">ver todos</a></div><div class="rolagem"><table class="tabela"><tbody>
        ${feed.map(p => `<tr class="clic" data-a="verPedido" data-id="${p.id}"><td><small>${fmtCurta(p.data)}</small></td><td><b>${esc(p.cliente_nome)}</b><br><small style="color:${corVendedor(p.vendedor_id)}">● ${esc(nomeVendedor(p.vendedor_id))}</small></td><td><span class="tag">${esc(p.situacao)}</span></td><td class="dir num">${R0(p.valor)}</td></tr>`).join('') || '<tr><td class="vazio">Sem pedidos ainda.</td></tr>'}
      </tbody></table></div></div>
      <div class="card"><div class="secao-titulo"><h2>Últimos 12 meses</h2></div>${grafico12Meses(vids, verLoja)}</div>
    </div>
    ${selRes ? `<div class="card mt"><div class="secao-titulo"><h2>Detalhe: ${esc(nomeVendedor(sel))}</h2><div class="chips so-normal">${vids.map(v => `<button class="chip ${v === sel ? 'on' : ''}" data-a="vendSel" data-v="${v}">${esc(nomeVendedor(v))}</button>`).join('')}</div></div>
      <div class="grid g3"><div><h3>Maiores clientes do mês</h3><table class="tabela"><tbody>${top.map(c => `<tr class="clic" data-a="verCliente" data-chave="${esc(c.chave)}"><td>${esc(c.nome)}<br><small>${c.n} pedido(s)</small></td><td class="dir">${R0(c.v)}</td></tr>`).join('') || '<tr><td class="mut">—</td></tr>'}</tbody></table></div>
      <div><h3>Clientes para ligar</h3><p class="mut" style="margin:-4px 0 6px;font-size:13px">Compravam e sumiram há mais de 90 dias</p><table class="tabela"><tbody>${parados.map(c => `<tr class="clic" data-a="verCliente" data-chave="${esc(c.chave)}"><td>${esc(c.nome)}<br><small>última compra ${fmtCurta(c.ult)}/${c.ult.slice(2, 4)}</small></td><td class="dir">${R0(c.v)}</td></tr>`).join('') || '<tr><td class="mut">Ninguém parado. 👏</td></tr>'}</tbody></table></div>
      <div><h3>Pedidos do mês por situação</h3><table class="tabela"><tbody>${sits.map(([s, n]) => `<tr><td>${esc(s)}</td><td class="dir"><b>${n}</b></td></tr>`).join('') || '<tr><td class="mut">—</td></tr>'}</tbody></table></div></div></div>` : ''}`;
}

// ─── pedidos ───
function vPedidos() {
  const h = hoje(), dias = +UI.pedPeriodo || 30, desde = addDias(h, -dias + 1);
  const busca = (UI.pedBusca || '').toLowerCase().trim();
  let lista = D.pedidos.filter(p => p.data >= desde);
  if (UI.pedVend) lista = lista.filter(p => p.vendedor_id === UI.pedVend);
  if (UI.pedSit) lista = lista.filter(p => p.situacao === UI.pedSit);
  if (busca) lista = lista.filter(p => (p.cliente_nome || '').toLowerCase().includes(busca) || String(p.numero).includes(busca) || String(p.numero_ecommerce || '').includes(busca));
  const sits = [...new Set(D.pedidos.map(p => p.situacao))].sort();
  const vendIds = [...new Set(D.pedidos.map(p => p.vendedor_id).filter(Boolean))];
  const tot = somaV(lista.filter(valido));
  return topo('Pedidos', `${lista.length} pedido(s) · ${R0(tot)} (sem cancelados) · ${infoSync()}`)
    + `<div class="filtros"><input type="search" placeholder="Buscar cliente, nº do pedido ou nº do e-commerce" value="${esc(UI.pedBusca)}" data-c="ui" data-k="pedBusca" data-fid="pedBusca">
      <select data-c="ui" data-k="pedPeriodo">${[['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['365', 'Últimos 12 meses'], ['400', 'Tudo carregado']].map(([v, n]) => `<option value="${v}" ${UI.pedPeriodo === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <select data-c="ui" data-k="pedVend"><option value="">Todos os vendedores</option>${vendIds.map(v => `<option value="${v}" ${UI.pedVend === v ? 'selected' : ''}>${esc(nomeVendedor(v))}</option>`).join('')}</select>
      <select data-c="ui" data-k="pedSit"><option value="">Todas as situações</option>${sits.map(s => `<option ${UI.pedSit === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
    <div class="card rolagem"><table class="tabela"><thead><tr><th>Data</th><th>Nº</th><th>Cliente</th><th>Vendedor</th><th>Canal</th><th>Situação</th><th class="dir">Valor</th></tr></thead><tbody>
      ${lista.slice(0, 400).map(p => `<tr class="clic" data-a="verPedido" data-id="${p.id}"><td>${fmtCurta(p.data)}/${p.data.slice(2, 4)}</td><td>${esc(p.numero)}</td><td><b>${esc(p.cliente_nome)}</b></td><td><span style="color:${corVendedor(p.vendedor_id)}">●</span> ${esc(nomeVendedor(p.vendedor_id))}</td><td>${p.numero_ecommerce ? `<span class="tag azul">${esc(p.canal || 'e-commerce')}</span>` : '<small class="mut">loja</small>'}</td><td><span class="tag">${esc(p.situacao)}</span></td><td class="dir num">${R(p.valor)}</td></tr>`).join('') || '<tr><td colspan="7" class="vazio">Nenhum pedido com esses filtros.</td></tr>'}
    </tbody></table>${lista.length > 400 ? `<p class="mut">Mostrando 400 de ${lista.length}. Use os filtros para refinar.</p>` : ''}</div>`;
}
async function abrirPedido(id) {
  const p = D.pedidos.find(x => x.id === id); if (!p) return;
  modal(`<div class="vazio">Carregando pedido ${esc(p.numero)}…</div>`);
  const [itens, [det]] = await Promise.all([ok(sb.from('pedido_itens').select('*').eq('pedido_id', id).order('seq')), ok(sb.from('pedidos').select('*').eq('id', id))]);
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Pedido ${esc(p.numero)} <span class="tag">${esc(p.situacao)}</span></h2>
    <p class="mut">${fmtData(p.data)} · ${esc(nomeVendedor(p.vendedor_id))}${p.numero_ecommerce ? ` · ${esc(p.canal || 'e-commerce')} nº ${esc(p.numero_ecommerce)}` : ''}${det?.forma_pagamento ? ` · ${esc(det.forma_pagamento)}` : ''}</p>
    <p><b>Cliente:</b> <a href="#" data-a="verCliente" data-chave="${esc(p.cliente_chave || '')}">${esc(p.cliente_nome)}</a></p>
    ${itens.length ? `<table class="tabela"><thead><tr><th>Código</th><th>Produto</th><th class="dir">Qtd</th><th class="dir">Unitário</th><th class="dir">Total</th></tr></thead><tbody>${itens.map(i => `<tr><td><small>${esc(i.codigo)}</small></td><td>${esc(i.descricao)}</td><td class="dir">${N(+i.quantidade)}</td><td class="dir">${R(+i.valor_unitario)}</td><td class="dir">${R(i.quantidade * i.valor_unitario)}</td></tr>`).join('')}</tbody></table>` : `<p class="mut">${det?.detalhado ? 'Pedido sem itens.' : 'Os itens deste pedido ainda estão sendo baixados do Tiny.'}</p>`}
    <div class="mt" style="text-align:right">${det?.desconto ? `Desconto ${R(+det.desconto)} · ` : ''}${det?.frete ? `Frete ${R(+det.frete)} · ` : ''}<b style="font-size:18px">Total ${R(p.valor)}</b></div>`, true);
}
