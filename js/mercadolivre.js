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
/** Perguntas que aparecem para responder: só de anúncios ativos e da segunda-feira da semana passada para cá. */
function inicioSemanaPassada() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); return d; }
const perguntaPendente = q => q.status === 'UNANSWERED' && q.item_status === 'active' && new Date(q.data) >= inicioSemanaPassada();
const tempoDesde = d => { const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} dia(s)`; };

async function carregarML(forcar) {
  if (D.ml && !forcar) return D.ml;
  const desde = new Date(Date.now() - 60 * 864e5).toISOString();
  const [pedidos, perguntas, reclamacoes, est, conferencias, emissoes] = await Promise.all([
    todas(() => sb.from('ml_pedidos').select('*').gte('data', desde).order('data', { ascending: false })),
    todas(() => sb.from('ml_perguntas').select('*').order('data', { ascending: false }).limit(400)),
    ok(sb.from('ml_reclamacoes').select('*').order('data', { ascending: false }).limit(200)),
    ok(sb.from('sync_estado').select('*').in('chave', ['ml', 'ml_varredura', 'ml_backfill'])),
    ok(sb.from('nf_conferencias').select('*').order('conferido_em', { ascending: false })),
    ok(sb.from('nf_emissoes').select('*').order('quando', { ascending: false }).limit(30)),
  ]);
  for (const e of est) D.sync[e.chave] = { ...e.valor, em_db: e.atualizado_em };
  D.ml = { pedidos, perguntas, reclamacoes, conferencias, emissoes };
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
  const semResp = D.ml.perguntas.filter(perguntaPendente).sort((a, b) => new Date(a.data) - new Date(b.data));
  const ocultas = D.ml.perguntas.filter(q => q.status === 'UNANSWERED' && !perguntaPendente(q)).length;
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

    <div class="card mt"><div class="secao-titulo"><h2>Perguntas sem resposta</h2><small>Anúncios ativos, desde ${inicioSemanaPassada().toLocaleDateString('pt-BR')} · responda em até 1 hora${ocultas ? ` · ${ocultas} antiga(s) ou de anúncio pausado ocultada(s)` : ''}</small></div>
      ${semResp.length ? semResp.map(q => `<div class="coment"><div class="meta">${q.item_link ? `<a href="${esc(q.item_link)}" target="_blank" rel="noopener">${esc(q.item_titulo || q.item_id)}</a>` : esc(q.item_titulo || q.item_id)} · há <b class="${(agora - new Date(q.data)) > 3600e3 ? 'c-ruim' : ''}">${tempoDesde(q.data)}</b></div>
        <p style="font-size:15px">❓ ${esc(q.texto)}</p>
        <textarea id="resp_${q.id}" rows="2" maxlength="2000" placeholder="Escreva a resposta… (o cliente vê exatamente este texto)"></textarea>
        <div class="acoes" style="margin-top:6px"><button class="btn pri peq" data-a="responderML" data-id="${q.id}">Responder no Mercado Livre</button></div></div>`).join('') : '<div class="vazio">Nenhuma pergunta esperando. 👏</div>'}</div>

    <div class="grid g2 mt">
      <div class="card"><h2>⚠ Despacho atrasado ou vencendo</h2>${tabelaPed([...atrasados, ...vencendo], 'Nenhum envio atrasado.')}</div>
      <div class="card"><h2>🧾 Aguardando nota fiscal</h2>${tabelaPed(semNF, 'Nenhum pedido esperando NF.')}</div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><h2>🏷 Etiquetas para imprimir</h2>${tabelaPed(imprimir, 'Nenhuma etiqueta pendente.')}</div>
      <div class="card"><h2>Reclamações abertas</h2>${recl.length ? `<table class="tabela"><tbody>${recl.map(c => `<tr><td>Pedido ${esc(String(c.pedido_id || ''))}<br><small>${esc(c.motivo || '')} · ${esc(c.etapa || '')}</small></td><td><small>há ${tempoDesde(c.data)}</small></td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhuma reclamação aberta. 👏</div>'}</div>
    </div>
    ${blocoFaturamento(semNF)}
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

// ─── Faturamento: conferência fiscal + emissão da NF pelo Tiny ───
const COR_CONF = { ok: 'ok', aviso: 'med', erro: 'ruim', ja_tem_nf: 'azul', nf_pendente: 'med' };
const NOME_CONF = { ok: 'Pronto para emitir', aviso: 'Emitir com atenção', erro: 'Bloqueado', ja_tem_nf: 'Já tem NF', nf_pendente: 'NF gerada, falta transmitir' };
function blocoFaturamento(semNF) {
  const pend = new Set(semNF.map(p => String(p.id)));
  const confs = (D.ml.conferencias || []).filter(c => pend.has(String(c.ml_pedido_id)) || (c.status === 'ja_tem_nf' && new Date(c.conferido_em) > Date.now() - 864e5));
  const prontos = confs.filter(c => ['ok', 'aviso', 'nf_pendente'].includes(c.status));
  const semConf = semNF.filter(p => !confs.some(c => String(c.ml_pedido_id) === String(p.id)));
  const borda = { ok: 'var(--ok)', aviso: 'var(--med)', erro: 'var(--ruim)', ja_tem_nf: 'var(--borda-forte)', nf_pendente: 'var(--med)' };
  return `<div class="card mt"><div class="secao-titulo"><h2>🧾 Faturamento (NF pelo Tiny)</h2>
      <div class="acoes"><button class="btn" data-a="conferirNF">🔍 Conferir pedidos</button>${prontos.length > 1 ? `<button class="btn pri" data-a="emitirTodasNF">Emitir todas as liberadas (${prontos.length})</button>` : ''}</div></div>
    <p class="explica" style="margin-top:0">O CRM confere cada pedido (produto, NCM, GTIN, origem, CFOP, endereço, CPF/CNPJ, unidade, peso e valor). Se estiver tudo certo, <b>Emitir NF</b> gera a nota no Tiny, confere o CFOP da nota e transmite à SEFAZ. Autorizada, o próprio Tiny envia a nota ao Mercado Livre: depois é só imprimir a etiqueta.</p>
    ${semConf.length ? `<div class="alerta med"><span class="ic">⚠</span><span>${semConf.length} pedido(s) aguardando NF ainda não conferido(s). Clique em "Conferir pedidos".</span></div>` : ''}
    ${confs.length ? confs.map(c => `<div class="coment" style="border-left-color:${borda[c.status] || 'var(--borda-forte)'}">
        <div class="secao-titulo" style="margin:0"><div><b>Pedido ${esc(c.pedido_numero || '')}</b> · ${esc(c.cliente || '')} · ${esc(c.uf || '')} · CFOP ${esc(c.cfop_previsto || '—')} · ${R(c.total)}</div>
        <div class="acoes"><span class="tag ${COR_CONF[c.status] || ''}">${NOME_CONF[c.status] || esc(c.status)}</span>${['ok', 'aviso', 'nf_pendente'].includes(c.status) ? `<button class="btn pri peq" data-a="emitirNF" data-id="${esc(c.tiny_pedido_id)}" data-num="${esc(c.pedido_numero || '')}" data-st="${c.status}">${c.status === 'nf_pendente' ? 'Transmitir NF' : 'Emitir NF'}</button>` : ''}</div></div>
        <ul class="pend" style="margin-top:6px">${(c.checagens || []).filter(x => x.nivel !== 'ok' || c.status === 'ok' || c.status === 'ja_tem_nf').map(x => `<li class="c-${x.nivel === 'erro' ? 'ruim' : x.nivel === 'aviso' ? 'med' : 'ok'}">${x.nivel === 'erro' ? '✖' : x.nivel === 'aviso' ? '⚠' : '✓'} ${esc(x.texto)}</li>`).join('')}</ul>
        <small class="mut">Conferido ${new Date(c.conferido_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${c.conferido_por ? ' por ' + esc(nomeP(c.conferido_por)) : ''}</small></div>`).join('') : '<div class="vazio">Nada conferido ainda.</div>'}
    ${(D.ml.emissoes || []).length ? `<h3 class="mt">Últimas emissões pelo CRM</h3><table class="tabela"><tbody>${D.ml.emissoes.slice(0, 10).map(e => `<tr><td><small>${new Date(e.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></td><td>${e.numero ? 'NF ' + esc(e.numero) : '—'}<br><small>${esc(nomeP(e.pessoa_id))}</small></td><td>${e.erro ? `<span class="c-ruim">${esc(e.erro)}</span>` : `<span class="tag ok">${esc(e.situacao || 'emitida')}</span>`}</td></tr>`).join('')}</tbody></table>` : ''}
  </div>`;
}
async function conferirNF() {
  avisar('Conferindo os pedidos no Tiny… leva alguns segundos por pedido.');
  try { await chamarFuncao('tiny-nf', { acao: 'conferir' }); await carregarML(true); render(); avisar('Conferência concluída.'); }
  catch (e) { avisar(e.message); }
}
async function emitirNF(id, numero, status, semPerguntar) {
  if (!semPerguntar && !confirm(`Emitir a nota fiscal do pedido ${numero}?${status === 'aviso' ? '\n\nHá avisos na conferência (ex.: peso ou GTIN). A nota pode sair mesmo assim.' : ''}\n\nA nota será transmitida à SEFAZ e enviada ao Mercado Livre. Não dá para desfazer (só cancelar a nota no Tiny).`)) return false;
  try {
    const r = await chamarFuncao('tiny-nf', { acao: 'emitir', tiny_pedido_id: id });
    avisar(`NF ${r.numero} ${r.situacao || 'emitida'} ✓`);
    return true;
  } catch (e) { alert('Não emitida: ' + e.message); return false; }
  finally { await carregarML(true).catch(() => {}); render(); }
}
async function emitirTodasNF() {
  const pend = new Set(D.ml.pedidos.filter(p => p.envio_substatus === 'invoice_pending').map(p => String(p.id)));
  const lista = (D.ml.conferencias || []).filter(c => pend.has(String(c.ml_pedido_id)) && ['ok', 'aviso', 'nf_pendente'].includes(c.status));
  if (!lista.length) return;
  if (!confirm(`Emitir ${lista.length} nota(s) fiscal(is)?\n\n${lista.map(c => `• Pedido ${c.pedido_numero} · ${c.cliente} · ${R(c.total)}${c.status === 'aviso' ? ' (com avisos)' : ''}`).join('\n')}\n\nAs notas serão transmitidas à SEFAZ e enviadas ao Mercado Livre.`)) return;
  let ok = 0;
  for (const c of lista) if (await emitirNF(c.tiny_pedido_id, c.pedido_numero, c.status, true)) ok++;
  avisar(`${ok} de ${lista.length} nota(s) emitida(s).`);
}
