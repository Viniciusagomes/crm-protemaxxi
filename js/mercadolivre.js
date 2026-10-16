'use strict';
/* CRM Protemaxxi — Mercado Livre: pedidos, envios (NF e etiqueta), perguntas, reclamações e reputação. */

const veML = () => ehDono() || !!EU?.permissoes?.ecommerce;
const ENVIO_NOME = {
  pending: 'Pendente', handling: 'Preparando', ready_to_ship: 'Pronto para enviar', shipped: 'A caminho', delivered: 'Entregue',
  not_delivered: 'Não entregue', cancelled: 'Cancelado',
};
const SUBSTATUS_NOME = {
  invoice_pending: 'Aguardando NF', ready_to_print: 'Etiqueta para imprimir', printed: 'Etiqueta impressa', in_packing_list: 'Na lista de coleta',
  in_hub: 'No centro de distribuição', picked_up: 'Coletado', waiting_for_withdrawal: 'Aguardando retirada', delayed: 'Atrasado',
};
const NIVEL_REP = { '5_green': '🟢 Verde', '4_light_green': '🟢 Verde-claro', '3_yellow': '🟡 Amarelo', '2_orange': '🟠 Laranja', '1_red': '🔴 Vermelho' };
const tempoDesde = d => { const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} dia(s)`; };

async function carregarML(forcar) {
  if (D.ml && !forcar) return D.ml;
  const desde = new Date(Date.now() - 60 * 864e5).toISOString();
  const [pedidos, perguntas, reclamacoes, est] = await Promise.all([
    todas(() => sb.from('ml_pedidos').select('*').gte('data', desde).order('data', { ascending: false })),
    todas(() => sb.from('ml_perguntas').select('*').order('data', { ascending: false }).limit(400)),
    ok(sb.from('ml_reclamacoes').select('*').order('data', { ascending: false }).limit(200)),
    ok(sb.from('sync_estado').select('*').in('chave', ['ml', 'ml_varredura', 'ml_backfill'])),
  ]);
  for (const e of est) D.sync[e.chave] = { ...e.valor, em_db: e.atualizado_em };
  D.ml = { pedidos, perguntas, reclamacoes };
  return D.ml;
}

function vML() {
  const st = D.sync.ml || {};
  if (!st.conectado) {
    return topo('Mercado Livre', '') + `<div class="card em-breve"><h2>Mercado Livre não conectado</h2>
      <p class="explica">${st.erro ? `⚠ ${esc(st.erro)}<br><br>` : ''}Conectando, o CRM passa a acompanhar os pedidos, as etiquetas e notas fiscais, as perguntas (com resposta direto daqui), as reclamações, as mensagens e a reputação da conta.</p>
      ${ehDono() ? '<button class="btn pri" data-a="conectarML">🔗 Conectar ao Mercado Livre</button>' : '<p class="mut">Peça ao administrador para conectar.</p>'}</div>`;
  }
  if (!D.ml) { carregarML().then(render).catch(e => avisar(e.message)); return topo('Mercado Livre', '') + '<div class="card vazio">Carregando o Mercado Livre…</div>'; }
  const agora = Date.now(), ped = D.ml.pedidos;
  const semNF = ped.filter(p => p.envio_substatus === 'invoice_pending');
  const imprimir = ped.filter(p => p.envio_status === 'ready_to_ship' && p.envio_substatus === 'ready_to_print');
  const atrasados = ped.filter(p => ['handling', 'ready_to_ship'].includes(p.envio_status) && p.prazo_despacho && new Date(p.prazo_despacho) < agora);
  const vencendo = ped.filter(p => ['handling', 'ready_to_ship'].includes(p.envio_status) && p.prazo_despacho && new Date(p.prazo_despacho) >= agora && new Date(p.prazo_despacho) - agora < 24 * 3600e3);
  const semResp = D.ml.perguntas.filter(q => q.status === 'UNANSWERED').sort((a, b) => new Date(a.data) - new Date(b.data));
  const recl = D.ml.reclamacoes.filter(c => c.status === 'opened');
  const rep = st.reputacao || {};
  const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
  const vendHoje = ped.filter(p => p.status !== 'cancelled' && new Date(p.data) >= hoje0);
  const respHoje = D.ml.perguntas.filter(q => q.resposta_data && new Date(q.resposta_data) >= hoje0);
  const tempoMed = respHoje.length ? Math.round(soma(respHoje.map(q => (new Date(q.resposta_data) - new Date(q.data)) / 60000)) / respHoje.length) : null;
  const linhaPed = p => `<tr><td><b>${esc(p.comprador || '')}</b><br><small>${(p.itens || []).map(i => `${esc(String(i.qtd))}× ${esc(i.titulo || '')}`).join(' · ')}</small></td>
    <td><small>${new Date(p.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></td>
    <td><span class="tag">${esc(ENVIO_NOME[p.envio_status] || p.envio_status || '—')}</span>${p.envio_substatus ? `<br><small>${esc(SUBSTATUS_NOME[p.envio_substatus] || p.envio_substatus)}</small>` : ''}</td>
    <td>${p.prazo_despacho ? `<span class="${new Date(p.prazo_despacho) < agora && ['handling', 'ready_to_ship'].includes(p.envio_status) ? 'c-ruim' : ''}">${new Date(p.prazo_despacho).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>` : '—'}</td>
    <td class="dir">${R0(p.total)}</td></tr>`;
  const tabelaPed = (lista, vazio) => lista.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Comprador / itens</th><th>Data</th><th>Envio</th><th>Despachar até</th><th class="dir">Total</th></tr></thead><tbody>${lista.slice(0, 50).map(linhaPed).join('')}</tbody></table></div>` : `<div class="vazio">${vazio}</div>`;
  return topo('Mercado Livre', `Conta <b>${esc(st.apelido || '')}</b> · ${D.sync.ml_varredura?.em ? 'atualizado há ' + tempoDesde(D.sync.ml_varredura.em) : 'sincronizando…'}`,
    `<button class="btn" data-a="recarregarML">↻ Recarregar</button>${ehDono() ? '<button class="btn" data-a="sincronizarML">Buscar no ML agora</button>' : ''}`)
    + `<div class="grid g4">
      <div class="card kpi-card"><div class="rot">Perguntas sem resposta</div><div class="val ${semResp.length ? 'c-ruim' : 'c-ok'}">${semResp.length}</div><div class="sub">${semResp[0] ? 'mais antiga há ' + tempoDesde(semResp[0].data) : 'tudo respondido'}${tempoMed != null ? ` · resposta média hoje ${tempoMed} min` : ''}</div></div>
      <div class="card kpi-card"><div class="rot">Envios atrasados</div><div class="val ${atrasados.length ? 'c-ruim' : 'c-ok'}">${atrasados.length}</div><div class="sub">${vencendo.length} vencem nas próximas 24 h</div></div>
      <div class="card kpi-card"><div class="rot">Aguardando NF · Etiquetas</div><div class="val ${semNF.length ? 'c-med' : ''}">${semNF.length} · ${imprimir.length}</div><div class="sub">sem nota · para imprimir</div></div>
      <div class="card kpi-card"><div class="rot">Reputação</div><div class="val" style="font-size:20px">${NIVEL_REP[rep.nivel] || esc(rep.nivel || '—')}</div><div class="sub">${rep.medalha ? 'MercadoLíder ' + esc(rep.medalha) + ' · ' : ''}reclamações ${P(rep.reclamacoes)} · atrasos ${P(rep.atrasos)} · cancel. ${P(rep.cancelamentos)}</div></div>
    </div>
    <div class="grid g4 mt"><div class="card kpi-card"><div class="rot">Vendas hoje</div><div class="val">${R0(soma(vendHoje.map(p => +p.total || 0)))}</div><div class="sub">${vendHoje.length} pedido(s)</div></div>
      <div class="card kpi-card"><div class="rot">Reclamações abertas</div><div class="val ${recl.length ? 'c-ruim' : 'c-ok'}">${recl.length}</div></div>
      <div class="card kpi-card"><div class="rot">Mensagens não lidas</div><div class="val ${st.mensagens_nao_lidas ? 'c-med' : ''}">${st.mensagens_nao_lidas ?? '—'}</div><div class="sub">pós-venda (responder no ML)</div></div>
      <div class="card kpi-card"><div class="rot">Pedidos (60 dias)</div><div class="val">${ped.length}</div><div class="sub">${R0(soma(ped.filter(p => p.status !== 'cancelled').map(p => +p.total || 0)))}</div></div></div>

    <div class="card mt"><div class="secao-titulo"><h2>Perguntas sem resposta</h2><small>Responda em até 1 hora: a velocidade conta para a venda</small></div>
      ${semResp.length ? semResp.map(q => `<div class="coment"><div class="meta">${q.item_link ? `<a href="${esc(q.item_link)}" target="_blank" rel="noopener">${esc(q.item_titulo || q.item_id)}</a>` : esc(q.item_titulo || q.item_id)} · há <b class="${(agora - new Date(q.data)) > 3600e3 ? 'c-ruim' : ''}">${tempoDesde(q.data)}</b></div>
        <p style="font-size:15px">❓ ${esc(q.texto)}</p>
        <textarea id="resp_${q.id}" rows="2" maxlength="2000" placeholder="Escreva a resposta… (o cliente vê exatamente este texto)"></textarea>
        <div class="acoes" style="margin-top:6px"><button class="btn pri peq" data-a="responderML" data-id="${q.id}">Responder no Mercado Livre</button></div></div>`).join('') : '<div class="vazio">Nenhuma pergunta esperando. 👏</div>'}</div>

    <div class="grid g2 mt">
      <div class="card"><h2>⚠ Despacho atrasado ou vencendo</h2>${tabelaPed([...atrasados, ...vencendo], 'Nenhum envio atrasado.')}</div>
      <div class="card"><h2>🧾 Aguardando nota fiscal</h2><p class="mut" style="margin-top:-6px;font-size:13px">A NF sai pelo Tiny. Se ficar aqui muito tempo, confira o pedido no Tiny.</p>${tabelaPed(semNF, 'Nenhum pedido esperando NF.')}</div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><h2>🏷 Etiquetas para imprimir</h2>${tabelaPed(imprimir, 'Nenhuma etiqueta pendente.')}</div>
      <div class="card"><h2>Reclamações abertas</h2>${recl.length ? `<table class="tabela"><tbody>${recl.map(c => `<tr><td>Pedido ${esc(String(c.pedido_id || ''))}<br><small>${esc(c.motivo || '')} · ${esc(c.etapa || '')}</small></td><td><small>há ${tempoDesde(c.data)}</small></td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhuma reclamação aberta. 👏</div>'}</div>
    </div>
    <div class="card mt"><div class="secao-titulo"><h2>Últimos pedidos</h2></div>${tabelaPed(ped, 'Os pedidos aparecem aqui depois da primeira sincronização.')}</div>
    <div class="card mt"><div class="secao-titulo"><h2>Perguntas respondidas recentemente</h2></div>
      ${D.ml.perguntas.filter(q => q.resposta).slice(0, 15).map(q => `<div class="coment"><div class="meta">${esc(q.item_titulo || '')} · ${new Date(q.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${q.respondido_por ? ` · respondida por ${esc(nomeP(q.respondido_por))}` : ''}</div><p>❓ ${esc(q.texto)}</p><p class="mut">↳ ${esc(q.resposta)}</p></div>`).join('') || '<div class="vazio">—</div>'}</div>
    ${ehDono() ? `<div class="mt"><button class="btn perigo peq" data-a="desconectarML">Desconectar o Mercado Livre</button></div>` : ''}`;
}

async function responderML(id) {
  const txt = ($('#resp_' + id)?.value || '').trim();
  if (!txt) return avisar('Escreva a resposta.');
  if (!confirm('Enviar esta resposta? Ela fica pública no anúncio do Mercado Livre.')) return;
  try {
    await chamarFuncao('ml-sync', { acao: 'responder', pergunta_id: id, texto: txt });
    const q = D.ml.perguntas.find(x => String(x.id) === String(id));
    if (q) { q.status = 'ANSWERED'; q.resposta = txt; q.resposta_data = new Date().toISOString(); q.respondido_por = EU.id; }
    avisar('Resposta publicada no Mercado Livre.'); render();
  } catch (e) { avisar(e.message); }
}
