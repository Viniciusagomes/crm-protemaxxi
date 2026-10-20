'use strict';
/* Boletos em atraso: o dono cadastra o boleto vencido (pedido, NF, vencimento, valor); o vendedor do pedido recebe o aviso
   (sino, Início e Meu dia) até o dono marcar como pago. O vendedor abre o pedido e baixa a nota fiscal (DANFE) direto daqui. */

const BOL = { lista: null, carregando: false, em: 0 };
const ST_BOL = { aberto: ['⏳ Em atraso', 'ruim'], renegociado: ['🔄 Renegociado', 'med'], pago: ['✅ Pago', 'ok'], cancelado: ['✕ Cancelado', ''] };
const bolAbertos = () => (BOL.lista || []).filter(b => ['aberto', 'renegociado'].includes(b.status));
const meusBoletos = () => bolAbertos().filter(b => b.pessoa_id === EU.id || (EU.tiny && b.vendedor_tiny_id === EU.tiny));
const diasAtraso = b => Math.max(0, Math.floor((new Date(hoje() + 'T12:00') - new Date((b.status === 'renegociado' && b.novo_vencimento ? b.novo_vencimento : b.vencimento) + 'T12:00')) / 864e5));
const veBoletos = () => ehDono() || !!EU.tiny || !!EU?.permissoes?.vendas_todas;

async function carregarBoletos(forcar) {
  if (BOL.carregando || (!forcar && BOL.lista && Date.now() - BOL.em < 60e3)) return;
  BOL.carregando = true;
  try { BOL.lista = await ok(sb.from('boletos_atraso').select('*, comprovantes:boletos_comprovantes(id,caminho,nome_arquivo,tipo,por,em)').order('vencimento')); BOL.em = Date.now(); }
  finally { BOL.carregando = false; }
}

/** Faixa de aviso (Início e Meu dia) para o vendedor com boleto de cliente em atraso. */
function avisoBoletos() {
  const m = ehDono() ? bolAbertos() : meusBoletos();
  if (!m.length) return '';
  const total = soma(m.map(b => +b.valor));
  return `<div class="alerta ruim" style="margin-bottom:14px;cursor:pointer" data-a="nav" data-v="boletos"><span class="ic">🧾</span><span><b>${m.length} boleto(s) em atraso${ehDono() ? '' : ' de clientes seus'}: ${R(total)}.</b>
    ${ehDono() ? 'Acompanhe a cobrança dos vendedores.' : 'Entre em contato com o cliente para regularizar. O aviso some quando o pagamento for confirmado.'} <u>Ver boletos</u></span></div>`;
}

function vBoletos() {
  if (!BOL.lista) { if (!BOL.carregando) carregarBoletos().then(render).catch(e => avisar(e.message)); return topo('Boletos em atraso', '') + '<div class="card vazio">Carregando…</div>'; }
  const filtros = { abertos: ['⏳ Em aberto', b => ['aberto', 'renegociado'].includes(b.status)], pagos: ['✅ Pagos', b => b.status === 'pago'], todos: ['Todos', () => true] };
  UI.bolFiltro = filtros[UI.bolFiltro] ? UI.bolFiltro : 'abertos';
  const vends = [...new Set((BOL.lista || []).map(b => b.pessoa_id).filter(Boolean))];
  if (UI.bolVend && !vends.includes(UI.bolVend)) UI.bolVend = '';
  const lista = BOL.lista.filter(filtros[UI.bolFiltro][1]).filter(b => !UI.bolVend || b.pessoa_id === UI.bolVend)
    .sort((a, b) => UI.bolFiltro === 'abertos' ? diasAtraso(b) - diasAtraso(a) : String(b.vencimento).localeCompare(String(a.vencimento)));
  const ab = bolAbertos(), total = soma(ab.map(b => +b.valor)), maior = ab.reduce((m, b) => Math.max(m, diasAtraso(b)), 0);
  const card = b => {
    const d = diasAtraso(b), venc = b.status === 'renegociado' && b.novo_vencimento ? b.novo_vencimento : b.vencimento;
    return `<div class="card bol-card ${b.status}">
      <div class="secao-titulo" style="margin:0;align-items:flex-start"><div><b>${esc(b.cliente_nome)}</b>${b.parcela ? ` <small class="mut">· parcela ${esc(b.parcela)}</small>` : ''}
        <br><small class="mut">${b.pessoa_id ? 'vendedor ' + esc(nomeP(b.pessoa_id)) : 'sem vendedor'}${b.criado_em ? ' · cadastrado ' + fmtCurta(b.criado_em.slice(0, 10)) : ''}</small></div>
        <div style="text-align:right"><div class="bol-valor">${R(b.valor)}</div><span class="tag ${ST_BOL[b.status][1]}">${ST_BOL[b.status][0]}</span></div></div>
      <div class="bol-info">
        <div><small class="mut">Vencimento</small><b>${fmtCurta(b.vencimento)}/${b.vencimento.slice(0, 4)}</b>${b.status === 'renegociado' && b.novo_vencimento ? `<small>novo: <b>${fmtCurta(b.novo_vencimento)}/${b.novo_vencimento.slice(0, 4)}</b></small>` : ''}</div>
        <div><small class="mut">Atraso</small><b class="${['aberto', 'renegociado'].includes(b.status) && d ? 'c-ruim' : ''}">${['aberto', 'renegociado'].includes(b.status) ? (d ? d + ' dia(s)' : 'a vencer') : '—'}</b></div>
        <div><small class="mut">Pedido</small><b>${esc(b.pedido_numero || '—')}</b></div>
        <div><small class="mut">Nota fiscal</small><b>${esc(b.nf_numero || '—')}</b>${b.nf_situacao ? `<small>${esc(b.nf_situacao)}</small>` : ''}</div></div>
      ${b.obs ? `<p class="mut" style="margin:8px 0 0">📝 ${esc(b.obs)}</p>` : ''}
      ${(b.comprovantes || []).length ? `<div class="bol-comp">${b.comprovantes.map(c => `<span><a href="#" data-a="bolCompVer" data-id="${c.id}">📎 ${esc(c.nome_arquivo || 'comprovante')}</a> <small class="mut">${esc(nomeP(c.por))} · ${dataHora(c.em)}</small>${ehDono() || c.por === EU.id ? ` <button class="icone-btn" data-a="bolCompExcluir" data-id="${c.id}" title="Remover comprovante">✕</button>` : ''}</span>`).join('')}
        ${ehDono() && ['aberto', 'renegociado'].includes(b.status) ? '<small class="c-med"><b>Comprovante enviado: confira e marque como pago.</b></small>' : ''}</div>` : ''}
      ${b.status === 'pago' ? `<p class="c-ok" style="margin:8px 0 0"><small>Pago · baixa por ${esc(nomeP(b.baixado_por))} em ${b.baixado_em ? dataHora(b.baixado_em) : ''}</small></p>` : ''}
      <div class="acoes" style="margin-top:10px">
        ${b.pedido_id ? `<button class="btn peq" data-a="bolPedido" data-id="${b.id}">🧾 Ver pedido</button>` : ''}
        ${b.nf_id || b.pedido_id ? `<button class="btn peq" data-a="bolNF" data-id="${b.id}">📄 Baixar nota fiscal</button>` : ''}
        ${b.status !== 'cancelado' ? `<label class="btn peq">📎 Anexar comprovante<input type="file" accept="image/*,application/pdf" hidden data-c="bolComp" data-id="${b.id}"></label>` : ''}
        ${ehDono() && ['aberto', 'renegociado'].includes(b.status) ? `<button class="btn pri peq" data-a="bolStatus" data-id="${b.id}" data-v="pago">✅ Marcar como pago</button><button class="btn peq" data-a="bolRenegociar" data-id="${b.id}">🔄 Renegociar</button><button class="btn peq" data-a="bolStatus" data-id="${b.id}" data-v="cancelado">✕ Cancelar</button>` : ''}
        ${ehDono() && ['pago', 'cancelado'].includes(b.status) ? `<button class="btn peq" data-a="bolStatus" data-id="${b.id}" data-v="aberto">↺ Reabrir</button>` : ''}
        ${ehDono() ? `<button class="icone-btn" data-a="bolExcluir" data-id="${b.id}" title="Excluir">🗑</button>` : ''}</div></div>`;
  };
  return topo('Boletos em atraso', ehDono() ? 'Cadastre o boleto vencido; o vendedor do pedido recebe o aviso até você marcar como pago.' : 'Boletos vencidos de clientes seus: cobre o cliente, veja o pedido e baixe a nota fiscal aqui.',
    `<button class="btn" data-a="bolAtualizar">↻ Atualizar</button>${ehDono() ? '<button class="btn pri" data-a="bolNovo">+ Cadastrar boleto</button>' : ''}`)
    + `<div class="grid g4"><div class="card kpi-card"><div class="rot">Em atraso</div><div class="val ${ab.length ? 'c-ruim' : 'c-ok'}">${R(total)}</div><div class="sub">${ab.length} boleto(s)</div></div>
      <div class="card kpi-card"><div class="rot">Maior atraso</div><div class="val">${maior} dia(s)</div><div class="sub">entre os em aberto</div></div>
      <div class="card kpi-card"><div class="rot">Renegociados</div><div class="val">${ab.filter(b => b.status === 'renegociado').length}</div><div class="sub">com nova data</div></div>
      <div class="card kpi-card"><div class="rot">Pagos (30 dias)</div><div class="val c-ok">${BOL.lista.filter(b => b.status === 'pago' && b.baixado_em > new Date(Date.now() - 30 * 864e5).toISOString()).length}</div><div class="sub">baixados</div></div></div>
    <div class="filtros mt"><div class="chips">${Object.entries(filtros).map(([k, [n, f]]) => `<button class="chip ${UI.bolFiltro === k ? 'on' : ''}" data-a="bolFiltro" data-v="${k}">${n}<span class="n">${BOL.lista.filter(f).length}</span></button>`).join('')}</div>
      ${vends.length > 1 ? `<select data-c="ui" data-k="bolVend"><option value="">Todos os vendedores</option>${vends.map(v => `<option value="${v}" ${UI.bolVend === v ? 'selected' : ''}>${esc(nomeP(v))}</option>`).join('')}</select>` : ''}</div>
    ${lista.length ? lista.map(card).join('') : `<div class="card vazio">${UI.bolFiltro === 'abertos' ? 'Nenhum boleto em atraso. 👏' : 'Nada por aqui.'}</div>`}`;
}

// ─── cadastro (dono) ───
let BOL_FORM = null;
function bolNovo() {
  BOL_FORM = null;
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>🧾 Cadastrar boleto em atraso</h2>
    <div class="form-grid"><label class="campo">Número do pedido<input id="bolPed" inputmode="numeric" placeholder="ex.: 77383"></label>
    <div class="campo" style="justify-content:flex-end"><button class="btn" data-a="bolBuscar">🔎 Buscar pedido e nota</button></div></div>
    <div id="bolDados"><p class="mut">Digite o número do pedido e clique em buscar: a Intranet traz o cliente, o vendedor e a nota fiscal do Tiny.</p></div>`);
  setTimeout(() => $('#bolPed')?.focus(), 50);
}
async function bolBuscar() {
  const numero = ($('#bolPed')?.value || '').trim();
  if (!numero) return alert('Digite o número do pedido.');
  $('#bolDados').innerHTML = '<p class="mut">Buscando no Tiny…</p>';
  let r;
  try { r = await chamarFuncao('boletos', { acao: 'buscar_pedido', numero }); }
  catch (e) { $('#bolDados').innerHTML = `<div class="alerta ruim"><span class="ic">!</span><span>${esc(e.message)}</span></div>`; return; }
  BOL_FORM = r;
  const p = r.pedido, nf = r.nf, br = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
  const parc = (r.parcelas || []).filter(x => x.vencimento);
  $('#bolDados').innerHTML = `<div class="alerta ${nf && /autoriz|emitida/i.test(nf.situacao || '') ? 'ok' : 'med'}"><span class="ic">🧾</span><span>
      <b>Pedido ${esc(p.numero)}</b> · ${esc(p.cliente_nome)} · ${R(p.valor)} · ${fmtCurta(p.data)}/${p.data.slice(0, 4)}<br>
      Vendedor: <b>${esc(p.pessoa_nome || p.vendedor_nome || 'não encontrado')}</b>${p.pessoa_id ? '' : ' (sem login na Intranet: o aviso não chega a ninguém)'}<br>
      Nota fiscal: <b>${nf ? esc(nf.numero) + ' · ' + esc(nf.situacao || '') : 'sem nota no Tiny'}</b></span></div>
    ${parc.length ? `<label class="campo mt">Parcela vencida<select id="bolParc">${parc.map((x, i) => `<option value="${i}">${i + 1}/${parc.length} · vence ${esc(x.vencimento)} · ${R(+x.valor)}${x.forma ? ' · ' + esc(x.forma) : ''}</option>`).join('')}<option value="">Outro valor / data</option></select></label>` : ''}
    <div class="form-grid mt"><label class="campo">Vencimento<input type="date" id="bolVenc" value="${parc.length ? br(parc[0].vencimento) : ''}"></label>
      <label class="campo">Valor<input type="number" step="0.01" min="0.01" id="bolValor" value="${parc.length ? (+parc[0].valor).toFixed(2) : ''}"></label></div>
    <label class="campo mt">Observação (opcional)<input id="bolObs" placeholder="ex.: cliente pediu para pagar dia 30"></label>
    <div class="acoes mt"><button class="btn" data-a="fecharModal">Voltar</button><button class="btn pri" data-a="bolSalvar">Cadastrar e avisar o vendedor</button></div>`;
  $('#bolParc')?.addEventListener('change', e => { const x = parc[e.target.value]; if (x) { $('#bolVenc').value = br(x.vencimento); $('#bolValor').value = (+x.valor).toFixed(2); } });
}
async function bolSalvar() {
  if (!BOL_FORM) return;
  const p = BOL_FORM.pedido, nf = BOL_FORM.nf, parc = (BOL_FORM.parcelas || []).filter(x => x.vencimento);
  const venc = $('#bolVenc').value, valor = +$('#bolValor').value, i = $('#bolParc')?.value;
  if (!venc || !(valor > 0)) return alert('Preencha o vencimento e o valor.');
  const linha = { pedido_id: p.id, pedido_numero: p.numero, cliente_nome: p.cliente_nome, cliente_chave: p.cliente_chave, pessoa_id: p.pessoa_id, vendedor_tiny_id: p.vendedor_id,
    nf_id: nf?.id || null, nf_numero: nf?.numero || null, nf_situacao: nf?.situacao || null, nf_chave: nf?.chave || null,
    vencimento: venc, valor, parcela: i !== '' && i != null && parc[i] ? `${+i + 1}/${parc.length}` : null, obs: $('#bolObs').value.trim() || null };
  const novo = await ok(sb.from('boletos_atraso').insert(linha).select().single());
  BOL.lista = [...(BOL.lista || []), novo];
  fecharModal(); avisar(`Boleto de ${p.cliente_nome} cadastrado ✓ ${p.pessoa_id ? nomeP(p.pessoa_id) + ' já vê o aviso.' : ''}`); render();
}
async function bolStatus(id, status) {
  const b = BOL.lista.find(x => String(x.id) === String(id)); if (!b) return;
  const msg = { pago: `Confirmar que o boleto de ${b.cliente_nome} (${R(b.valor)}) foi PAGO?\n\nO aviso do vendedor some.`, cancelado: `Cancelar este boleto de ${b.cliente_nome}? (ex.: lançado errado, negociado de outra forma)`, aberto: 'Reabrir este boleto como em atraso?' }[status];
  if (!confirm(msg)) return;
  Object.assign(b, await ok(sb.from('boletos_atraso').update({ status }).eq('id', id).select().single()));
  render();
}
async function bolRenegociar(id) {
  const b = BOL.lista.find(x => String(x.id) === String(id)); if (!b) return;
  const d = prompt(`Nova data de pagamento combinada com ${b.cliente_nome} (dd/mm/aaaa):`);
  if (!d) return;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d.trim()); if (!m) return alert('Use o formato dd/mm/aaaa.');
  const obs = prompt('Observação (opcional):', b.obs || '');
  Object.assign(b, await ok(sb.from('boletos_atraso').update({ status: 'renegociado', novo_vencimento: `${m[3]}-${m[2]}-${m[1]}`, obs: obs ?? b.obs }).eq('id', id).select().single()));
  render();
}
async function bolExcluir(id) {
  const b = BOL.lista.find(x => String(x.id) === String(id)); if (!b) return;
  if (!confirm(`Excluir o boleto de ${b.cliente_nome} (${R(b.valor)})? Use só se foi cadastrado por engano.`)) return;
  await ok(sb.from('boletos_atraso').delete().eq('id', id));
  BOL.lista = BOL.lista.filter(x => String(x.id) !== String(id)); render();
}

// ─── pedido e nota para o vendedor ───
async function bolNF(id) {
  const w = window.open('', '_blank');   // abre já no clique (o navegador bloqueia janela aberta depois de esperar)
  try { const r = await chamarFuncao('boletos', { acao: 'link_nf', boleto_id: Number(id) }); if (w) w.location = r.link; else location.href = r.link; }
  catch (e) { if (w) w.close(); alert('Não consegui abrir a nota: ' + e.message); }
}
async function bolPedido(id) {
  const b = BOL.lista.find(x => String(x.id) === String(id)); if (!b?.pedido_id) return;
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Pedido ${esc(b.pedido_numero || '')}</h2><p class="mut">Carregando…</p>`);
  const [p, itens] = await Promise.all([
    ok(sb.from('pedidos').select('numero,data,cliente_nome,valor,total_produtos,desconto,frete,forma_pagamento,pag_forma,vendedor_nome,situacao,envio_forma').eq('id', b.pedido_id).maybeSingle()),
    ok(sb.from('pedido_itens').select('codigo,descricao,quantidade,valor_unitario').eq('pedido_id', b.pedido_id).order('seq'))]);
  if (!p) return modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Pedido ${esc(b.pedido_numero || '')}</h2><div class="alerta med"><span class="ic">!</span><span>Você não tem acesso a este pedido.</span></div>`);
  BOL.pedidoAberto = { p, itens, b };
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Pedido de venda ${esc(p.numero)}</h2>
    <p>${esc(p.cliente_nome)} · ${fmtCurta(p.data)}/${p.data.slice(0, 4)} · vendedor ${esc(p.vendedor_nome || '')} · ${esc(p.pag_forma || p.forma_pagamento || '')} · Tiny: ${esc(p.situacao || '')}</p>
    <table class="tabela"><thead><tr><th>SKU</th><th>Produto</th><th class="dir">Qtd</th><th class="dir">Unit.</th><th class="dir">Total</th></tr></thead><tbody>
    ${itens.map(i => `<tr><td>${esc(i.codigo || '')}</td><td>${esc(i.descricao || '')}</td><td class="dir">${N(i.quantidade)}</td><td class="dir">${R(i.valor_unitario)}</td><td class="dir">${R((+i.quantidade || 0) * (+i.valor_unitario || 0))}</td></tr>`).join('')}</tbody></table>
    <p class="dir mt">${+p.desconto ? `Desconto ${R(p.desconto)} · ` : ''}${+p.frete ? `Frete ${R(p.frete)} · ` : ''}<b>Total ${R(p.valor)}</b></p>
    <div class="acoes mt"><button class="btn" data-a="bolImprimirPedido">🖨 Imprimir / salvar PDF</button>${b.nf_id || b.pedido_id ? `<button class="btn pri" data-a="bolNF" data-id="${b.id}">📄 Baixar nota fiscal</button>` : ''}</div>`, true);
}
function bolImprimirPedido() {
  const x = BOL.pedidoAberto; if (!x) return;
  const { p, itens } = x;
  const w = window.open('', '_blank'); if (!w) return alert('Libere as janelas (pop-up) para imprimir.');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pedido ${esc(p.numero)}</title><style>body{font:14px Arial,sans-serif;color:#111;margin:28px}h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border-bottom:1px solid #ccc;padding:6px;text-align:left}.d{text-align:right}</style></head><body>
    <h1>Protemaxxi · Pedido de venda nº ${esc(p.numero)}</h1><div>${esc(p.cliente_nome)} · ${fmtCurta(p.data)}/${p.data.slice(0, 4)} · vendedor ${esc(p.vendedor_nome || '')} · ${esc(p.pag_forma || p.forma_pagamento || '')}</div>
    <table><thead><tr><th>SKU</th><th>Produto</th><th class="d">Qtd</th><th class="d">Unit.</th><th class="d">Total</th></tr></thead><tbody>
    ${itens.map(i => `<tr><td>${esc(i.codigo || '')}</td><td>${esc(i.descricao || '')}</td><td class="d">${N(i.quantidade)}</td><td class="d">${R(i.valor_unitario)}</td><td class="d">${R((+i.quantidade || 0) * (+i.valor_unitario || 0))}</td></tr>`).join('')}</tbody></table>
    <p class="d">${+p.desconto ? `Desconto ${R(p.desconto)} · ` : ''}${+p.frete ? `Frete ${R(p.frete)} · ` : ''}<b>Total ${R(p.valor)}</b></p></body></html>`);
  w.document.close(); w.focus(); w.print();
}

// ─── comprovante de pagamento (foto ou PDF) ───
async function bolCompEnviar(id, arq) {
  const b = BOL.lista.find(x => String(x.id) === String(id)); if (!b || !arq) return;
  const pdf = arq.type === 'application/pdf';
  if (!pdf && !/^image\//.test(arq.type)) return alert('Envie uma foto ou um PDF do comprovante.');
  if (pdf && arq.size > 5 * 1024 * 1024) return alert('O PDF passa de 5 MB. Envie uma foto ou um PDF menor.');
  avisar('Enviando comprovante…');
  const corpo = pdf ? arq : await reduzirFoto(arq), ext = pdf ? 'pdf' : 'jpg';
  const caminho = `bol/${b.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await sb.storage.from('anexos').upload(caminho, corpo, { contentType: pdf ? 'application/pdf' : 'image/jpeg' });
  if (error) throw new Error('Não enviou: ' + error.message);
  const c = await ok(sb.from('boletos_comprovantes').insert({ boleto_id: b.id, caminho, nome_arquivo: arq.name.slice(0, 80), tipo: ext }).select().single());
  b.comprovantes = [...(b.comprovantes || []), c];
  avisar(`Comprovante anexado ✓ ${ehDono() ? '' : 'O financeiro vai conferir e dar baixa.'}`); render();
}
async function bolCompVer(id) {
  const c = BOL.lista.flatMap(b => b.comprovantes || []).find(x => String(x.id) === String(id)); if (!c) return;
  const w = window.open('', '_blank');
  const { data, error } = await sb.storage.from('anexos').createSignedUrl(c.caminho, 600);
  if (error || !data?.signedUrl) { if (w) w.close(); return alert('Não consegui abrir o comprovante.'); }
  if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
}
async function bolCompExcluir(id) {
  const b = BOL.lista.find(x => (x.comprovantes || []).some(c => String(c.id) === String(id))); if (!b) return;
  if (!confirm('Remover este comprovante?')) return;
  await ok(sb.from('boletos_comprovantes').delete().eq('id', id));
  b.comprovantes = b.comprovantes.filter(c => String(c.id) !== String(id)); render();
}
/** Boletos em aberto com comprovante enviado (para o dono conferir). */
const bolComComprovante = () => (BOL.lista || []).filter(b => ['aberto', 'renegociado'].includes(b.status) && (b.comprovantes || []).length);
