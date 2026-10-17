'use strict';
/* Intranet Protemaxxi — Créditos do cliente (vales-troca e créditos da loja) e Brindes.
   Créditos: extrato com entradas (vale-troca, crédito, ajuste) e usos (pedido do Tiny pago com "vale" abate sozinho).
   Entrada lançada por quem não é o dono fica pendente até o Vinícius aprovar. Brinde: pedido → aprovação do Vinícius → sai junto com o pedido. */

const CRE = { saldos: null, pend: null, brindes: null, bped: null, carregando: false, em: 0 };
const TIPOS_CRE = { vale_troca: '🎟 Vale-troca', credito: '💳 Crédito', uso: '🛒 Uso', ajuste: '✏️ Ajuste' };
const ST_BRINDE = { pendente: ['⏳ Aguardando aprovação', 'med'], aprovado: ['✅ Aprovado: separar', 'ok'], recusado: ['🚫 Recusado', 'ruim'], entregue: ['🎁 Entregue', ''] };

async function carregarCreditos(forcar) {
  if (CRE.carregando || (!forcar && CRE.saldos && Date.now() - CRE.em < 60e3)) return;
  CRE.carregando = true;
  try {
    const [saldos, pend, brindes, bped] = await Promise.all([
      todas(() => sb.from('v_creditos_saldo').select('*')),
      ok(sb.from('creditos').select('*').eq('status', 'pendente').order('criado_em')),
      ok(sb.from('brindes').select('*').order('nome')),
      todas(() => sb.from('brinde_pedidos').select('*').gte('criado_em', new Date(Date.now() - 120 * 864e5).toISOString()).order('criado_em', { ascending: false })),
    ]);
    CRE.saldos = Object.fromEntries(saldos.map(s => [s.cliente_chave, s])); CRE.pend = pend; CRE.brindes = brindes; CRE.bped = bped; CRE.em = Date.now();
  } finally { CRE.carregando = false; }
}
const saldoCli = chave => +(CRE.saldos?.[chave]?.saldo || 0);
const pendenciasDono = () => ehDono() && CRE.pend ? CRE.pend.length + (CRE.bped || []).filter(b => b.status === 'pendente').length : 0;
/** Selo de crédito para fichas, listas e expedição. */
const seloCredito = chave => { const s = saldoCli(chave); return s > 0.009 ? `<span class="tag ok" title="Crédito disponível na loja">💳 Crédito ${R(s)}</span>` : s < -0.009 ? `<span class="tag ruim" title="Usou mais crédito do que tinha">💳 Saldo negativo ${R(s)}</span>` : ''; };

// ─── tela de Créditos ───
function vCreditos() {
  if (!CRE.saldos) { if (!CRE.carregando) carregarCreditos().then(render).catch(e => avisar(e.message)); return topo('Créditos e vales-troca', '') + '<div class="card vazio">Carregando os créditos…</div>'; }
  const lista = Object.values(CRE.saldos).filter(s => Math.abs(+s.saldo || 0) > 0.009 || +s.pendente).sort((a, b) => (+b.saldo || 0) - (+a.saldo || 0));
  const positivos = lista.filter(s => +s.saldo > 0), negativos = lista.filter(s => +s.saldo < 0);
  const pend = CRE.pend || [];
  return topo('Créditos e vales-troca', 'Saldo de crédito de cada cliente na loja: vales-troca de devolução, créditos gerados após venda e usos. Pedido pago com "vale" no Tiny abate sozinho.',
      `<button class="btn" data-a="creAtualizar">↻ Atualizar</button><button class="btn pri" data-a="creNovo">+ Registrar vale ou crédito</button>`)
    + `<div class="grid g4">
      <div class="card kpi-card destaque"><div class="rot">Crédito em aberto</div><div class="val verde">${R0(soma(positivos.map(s => +s.saldo)))}</div><div class="sub">${positivos.length} cliente(s) com crédito</div></div>
      <div class="card kpi-card"><div class="rot">Aguardando aprovação</div><div class="val ${pend.length ? 'c-med' : ''}">${pend.length}</div><div class="sub">${R0(soma(pend.map(p => +p.valor)))} em lançamentos</div></div>
      <div class="card kpi-card"><div class="rot">Saldo negativo</div><div class="val ${negativos.length ? 'c-ruim' : 'c-ok'}">${negativos.length}</div><div class="sub">usaram vale sem crédito registrado</div></div>
      <div class="card kpi-card"><div class="rot">Como funciona</div><div class="sub" style="margin-top:6px">Vendedor registra → ${ehDono() ? 'você aprova' : 'o Vinícius aprova'} → o saldo aparece na ficha do cliente, na prospecção e na Expedição.</div></div></div>
    ${pend.length ? `<div class="card mt"><div class="secao-titulo"><h2>⏳ Aguardando aprovação</h2><small>${ehDono() ? 'Só você aprova' : 'O Vinícius aprova'}</small></div>
      <div class="rolagem"><table class="tabela"><thead><tr><th>Cliente</th><th>Tipo</th><th class="dir">Valor</th><th>Nº vale / NF</th><th>Motivo</th><th>Quem pediu</th><th></th></tr></thead><tbody>
      ${pend.map(p => `<tr><td><b>${esc(p.cliente_nome || '')}</b></td><td>${TIPOS_CRE[p.tipo]}</td><td class="dir"><b>${R(p.valor)}</b></td><td><small>${esc([p.numero_vale, p.nf_devolucao && 'NF ' + p.nf_devolucao, p.pedido_numero && 'pedido ' + p.pedido_numero].filter(Boolean).join(' · '))}</small></td>
        <td><small>${esc(p.motivo || '')}</small></td><td><small>${esc(nomeP(p.criado_por))} · ${new Date(p.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></td>
        <td class="dir">${ehDono() ? `<button class="btn pri peq" data-a="creAprovar" data-id="${p.id}" data-v="aprovado">✓ Aprovar</button> <button class="btn peq" data-a="creAprovar" data-id="${p.id}" data-v="recusado">Recusar</button>` : '<small class="mut">aguardando</small>'}</td></tr>`).join('')}
      </tbody></table></div></div>` : ''}
    <div class="card mt"><div class="secao-titulo"><h2>Clientes com crédito</h2><small>clique para ver o extrato</small></div>
      ${lista.length ? listaCurta('creLista', `<table class="tabela"><thead><tr><th>Cliente</th><th class="dir">Saldo</th><th class="dir">Pendente</th><th>Último lançamento</th></tr></thead><tbody>
        ${lista.map(s => `<tr class="clic" data-a="creExtrato" data-chave="${esc(s.cliente_chave)}"><td><b>${esc(s.cliente_nome || s.cliente_chave)}</b></td><td class="dir ${+s.saldo < 0 ? 'c-ruim' : 'c-ok'}"><b>${R(s.saldo || 0)}</b></td><td class="dir">${+s.pendente ? R(s.pendente) : '—'}</td><td><small>${new Date(s.ultimo).toLocaleDateString('pt-BR')}</small></td></tr>`).join('')}
      </tbody></table>`, 'Buscar cliente…') : '<div class="vazio">Nenhum cliente com crédito ainda. Registre os vales-troca em aberto pelo botão "+ Registrar vale ou crédito".</div>'}</div>
    <p class="explica mt">ℹ️ A API do Tiny não dá acesso à tela de Devoluções nem ao número dos vales. Por isso o vale é registrado aqui (com o número do vale e a NF de devolução) e a Intranet passa a controlar o saldo. O uso é automático: pedido do Tiny com forma de pagamento "vale" abate do saldo do cliente.</p>`;
}

function formCredito(chave, nome) {
  if (!D.clientes) carregarClientes().catch(() => {});
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Registrar vale-troca ou crédito</h2>
    <p class="mut">${ehDono() ? 'Lançado por você: entra aprovado.' : 'Fica pendente até o Vinícius aprovar.'}</p>
    <div class="form-grid">
      <label class="campo inteiro">Cliente *<input type="text" id="crCli" list="crListaCli" value="${esc(nome || '')}" ${chave ? `data-chave="${esc(chave)}"` : ''} placeholder="Comece a digitar o nome"></label>
      <label class="campo">Tipo<select id="crTipo"><option value="vale_troca">🎟 Vale-troca (devolução)</option><option value="credito">💳 Crédito da loja (troco, cortesia, acerto)</option>${ehDono() ? '<option value="ajuste">✏️ Ajuste (pode ser negativo)</option>' : ''}</select></label>
      <label class="campo">Valor (R$) *<input type="number" step="0.01" id="crValor"></label>
      <label class="campo">Nº do vale-troca<input type="text" id="crVale" placeholder="como está no Tiny"></label>
      <label class="campo">NF de devolução / nº do pedido<input type="text" id="crNF"></label>
      <label class="campo inteiro">Motivo *<textarea id="crMotivo" rows="2" placeholder="Ex.: devolução de 2 câmeras com defeito; troco de R$ 30 em crédito"></textarea></label>
    </div>
    <datalist id="crListaCli">${(D.clientes || []).slice(0, 4000).map(c => `<option value="${esc(c.nome)}">`).join('')}</datalist>
    <div class="mt"><button class="btn pri" data-a="creSalvar">Registrar</button></div>`);
}
async function creSalvar() {
  const el = $('#crCli'), nome = el.value.trim(), tipo = $('#crTipo').value, valor = Number($('#crValor').value), vale = $('#crVale').value.trim(), nf = $('#crNF').value.trim(), motivo = $('#crMotivo').value.trim();
  const c = (D.clientes || []).find(x => x.nome === nome);
  const chave = el.dataset.chave || c?.chave;
  if (!chave) return avisar('Escolha o cliente da lista (comece a digitar o nome).');
  if (!valor || (tipo !== 'ajuste' && valor <= 0)) return avisar('Informe um valor válido.');
  if (tipo === 'vale_troca' && !vale) return avisar('Informe o número do vale-troca.');
  if (!motivo) return avisar('Escreva o motivo.');
  await ok(sb.from('creditos').insert({ cliente_chave: chave, cliente_nome: nome, tipo, valor, numero_vale: vale || null, nf_devolucao: nf || null, motivo, criado_por: EU.id }));
  fecharModal(); avisar(ehDono() ? 'Lançamento registrado e aprovado.' : 'Registrado. Aguardando a aprovação do Vinícius.');
  await carregarCreditos(true); render();
}
async function creAprovar(id, status) {
  const obs = status === 'recusado' ? prompt('Motivo da recusa (opcional):') : null;
  if (status === 'recusado' && obs === null) return;
  await ok(sb.from('creditos').update({ status, aprovado_por: EU.id, aprovado_em: new Date().toISOString(), obs_aprovacao: obs || null }).eq('id', id));
  avisar(status === 'aprovado' ? 'Aprovado: o saldo do cliente já foi atualizado.' : 'Recusado.');
  await carregarCreditos(true); render();
}
async function creExtrato(chave) {
  const lanc = await ok(sb.from('creditos').select('*').eq('cliente_chave', chave).order('criado_em'));
  const s = CRE.saldos?.[chave];
  let acc = 0;
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Extrato de crédito</h2><p class="mut">${esc(s?.cliente_nome || lanc[0]?.cliente_nome || '')}</p>
    <div class="grid g3" style="gap:10px"><div class="card kpi-card"><div class="rot">Saldo</div><div class="val ${+(s?.saldo || 0) < 0 ? 'c-ruim' : 'c-ok'}">${R(s?.saldo || 0)}</div></div>
      <div class="card kpi-card"><div class="rot">Pendente</div><div class="val">${R(s?.pendente || 0)}</div></div><div class="card kpi-card"><div class="rot">Lançamentos</div><div class="val">${lanc.length}</div></div></div>
    <table class="tabela mt"><thead><tr><th>Data</th><th>Tipo</th><th>Detalhe</th><th class="dir">Valor</th><th class="dir">Saldo</th></tr></thead><tbody>
    ${lanc.map(l => { if (l.status === 'aprovado') acc += +l.valor; return `<tr${l.status !== 'aprovado' ? ' class="mut"' : ''}><td><small>${new Date(l.criado_em).toLocaleDateString('pt-BR')}</small></td><td>${TIPOS_CRE[l.tipo]}${l.status !== 'aprovado' ? `<br><small>${l.status}</small>` : ''}</td>
      <td><small>${esc([l.numero_vale && 'vale ' + l.numero_vale, l.nf_devolucao && 'NF ' + l.nf_devolucao, l.pedido_numero && 'pedido ' + l.pedido_numero, l.motivo].filter(Boolean).join(' · '))}${l.criado_por ? ' · ' + esc(nomeP(l.criado_por)) : ''}</small></td>
      <td class="dir ${+l.valor < 0 ? 'c-ruim' : 'c-ok'}">${R(l.valor)}</td><td class="dir">${l.status === 'aprovado' ? R(acc) : ''}</td></tr>`; }).join('') || '<tr><td colspan="5" class="mut">Sem lançamentos.</td></tr>'}
    </tbody></table>
    <div class="acoes mt"><button class="btn pri" data-a="creNovo" data-chave="${esc(chave)}" data-nome="${esc(s?.cliente_nome || lanc[0]?.cliente_nome || '')}">+ Novo lançamento</button></div>`, true);
}
/** Bloco para a ficha do cliente. */
function blocoCreditoFicha(chave, nome) {
  if (!CRE.saldos) { carregarCreditos().catch(() => {}); return ''; }
  const s = CRE.saldos[chave];
  return `<div class="ficha-credito ${+(s?.saldo || 0) > 0 ? 'tem' : ''}"><span>💳 Crédito na loja: <b>${R(s?.saldo || 0)}</b>${+(s?.pendente || 0) ? ` · ${R(s.pendente)} aguardando aprovação` : ''}</span>
    <span>${s ? `<button class="btn peq" data-a="creExtrato" data-chave="${esc(chave)}">Ver extrato</button>` : ''} <button class="btn peq" data-a="creNovo" data-chave="${esc(chave)}" data-nome="${esc(nome)}">+ Vale / crédito</button></span></div>`;
}

// ─── Brindes ───
function vBrindes() {
  if (!CRE.brindes) { if (!CRE.carregando) carregarCreditos().then(render).catch(e => avisar(e.message)); return topo('Brindes', '') + '<div class="card vazio">Carregando os brindes…</div>'; }
  const ped = CRE.bped || [], m = mesDe(hoje());
  const doMes = ped.filter(p => ['aprovado', 'entregue'].includes(p.status) && (p.aprovado_em || '').startsWith(m));
  const porVend = Object.values(doMes.reduce((a, p) => { (a[p.solicitante] ||= { id: p.solicitante, n: 0, custo: 0 }); a[p.solicitante].n += p.qtd; a[p.solicitante].custo += +p.custo_total || 0; return a; }, {})).sort((a, b) => b.custo - a.custo);
  const pend = ped.filter(p => p.status === 'pendente');
  const nomeB = id => CRE.brindes.find(b => b.id === id)?.nome || 'Brinde';
  const linhaPed = p => `<tr><td><b>${p.qtd}× ${esc(nomeB(p.brinde_id))}</b><br><small>${esc(p.cliente_nome || '')}${p.pedido_numero ? ' · pedido ' + esc(p.pedido_numero) : ''}</small></td>
    <td><small>${esc(p.justificativa)}</small></td><td><small>${esc(nomeP(p.solicitante))}<br>${new Date(p.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></td>
    <td><span class="tag ${ST_BRINDE[p.status][1]}">${ST_BRINDE[p.status][0]}</span>${p.obs_aprovacao ? `<br><small>${esc(p.obs_aprovacao)}</small>` : ''}</td>
    <td class="dir">${p.status === 'pendente' && ehDono() ? `<button class="btn pri peq" data-a="briAprovar" data-id="${p.id}" data-v="aprovado">✓ Aprovar</button> <button class="btn peq" data-a="briAprovar" data-id="${p.id}" data-v="recusado">Recusar</button>`
      : p.status === 'aprovado' && (ehDono() || veExp()) ? `<button class="btn peq" data-a="briAprovar" data-id="${p.id}" data-v="entregue">🎁 Entregue</button>` : ''}</td></tr>`;
  return topo('Brindes', 'Brindes da loja para clientes: o vendedor pede, o Vinícius aprova e o brinde sai junto com o pedido (aparece na Expedição e na TV).',
      `<button class="btn" data-a="creAtualizar">↻ Atualizar</button>${ehDono() ? '<button class="btn" data-a="briNovo">+ Cadastrar brinde</button>' : ''}`)
    + `${pend.length ? `<div class="card"><div class="secao-titulo"><h2>⏳ Aguardando aprovação</h2><small>${pend.length} pedido(s)</small></div><div class="rolagem"><table class="tabela"><tbody>${pend.map(linhaPed).join('')}</tbody></table></div></div>` : ''}
    <div class="brindes-grid mt">${CRE.brindes.filter(b => b.ativo || ehDono()).map(b => `<div class="brinde ${b.ativo ? '' : 'inativo'}">
      <div class="brinde-foto" data-foto="${esc(b.foto || '')}">${b.foto ? '' : '🎁'}</div>
      <div class="brinde-info"><b>${esc(b.nome)}</b>${b.descricao ? `<small>${esc(b.descricao)}</small>` : ''}
        <div class="brinde-num"><span>${b.estoque} em estoque</span>${ehDono() ? `<span>custo ${R(b.custo)}</span>` : ''}</div></div>
      <div class="acoes">${b.ativo && b.estoque > 0 ? `<button class="btn pri peq" data-a="briPedir" data-id="${b.id}">Pedir para um cliente</button>` : '<small class="mut">sem estoque</small>'}${ehDono() ? `<button class="btn peq" data-a="briEditar" data-id="${b.id}">Editar</button>` : ''}</div></div>`).join('')
      || `<div class="card vazio">Nenhum brinde cadastrado ainda.${ehDono() ? ' Clique em "+ Cadastrar brinde".' : ''}</div>`}</div>
    <div class="mt"><div class="card"><div class="secao-titulo"><h2>Pedidos de brinde</h2><small>últimos 120 dias</small></div>
        ${ped.length ? listaCurta('briLista', `<table class="tabela"><tbody>${ped.map(linhaPed).join('')}</tbody></table>`, 'Buscar cliente, brinde, vendedor…') : '<div class="vazio">Nenhum pedido ainda.</div>'}</div>
      <div class="card mt"><div class="secao-titulo"><h2>Custo dos brindes no mês</h2><small>${R(soma(doMes.map(p => +p.custo_total || 0)))}</small></div>
        <table class="tabela"><tbody>${porVend.map(v => `<tr><td>${esc(nomeP(v.id))}</td><td class="dir">${v.n} brinde(s)</td><td class="dir"><b>${R(v.custo)}</b></td></tr>`).join('') || '<tr><td class="mut">Nenhum brinde aprovado no mês.</td></tr>'}</tbody></table></div></div>`;
}
/** Fotos dos brindes vêm do armazenamento privado: busca links temporários depois de desenhar a tela. */
async function fotosBrindes() {
  const els = [...document.querySelectorAll('.brinde-foto[data-foto]')].filter(e => e.dataset.foto && !e.dataset.ok);
  if (!els.length) return;
  const { data } = await sb.storage.from('anexos').createSignedUrls(els.map(e => e.dataset.foto), 3600);
  els.forEach((e, i) => { const u = data?.[i]?.signedUrl; if (u) { e.style.backgroundImage = `url("${u}")`; e.dataset.ok = '1'; } });
}
function formBrinde(id) {
  const b = id ? CRE.brindes.find(x => String(x.id) === String(id)) : {};
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>${id ? 'Editar brinde' : 'Cadastrar brinde'}</h2>
    <div class="form-grid"><label class="campo inteiro">Nome *<input type="text" id="brNome" value="${esc(b.nome || '')}" placeholder="Ex.: Boné Protemaxxi"></label>
      <label class="campo inteiro">Descrição<input type="text" id="brDesc" value="${esc(b.descricao || '')}"></label>
      <label class="campo">Custo unitário (R$)<input type="number" step="0.01" id="brCusto" value="${b.custo ?? ''}"></label>
      <label class="campo">Estoque<input type="number" id="brEst" value="${b.estoque ?? 0}"></label>
      <label class="campo inteiro">📷 Foto<input type="file" id="brFoto" accept="image/*"></label>
      ${id ? `<label class="campo"><span><input type="checkbox" id="brAtivo" ${b.ativo ? 'checked' : ''}> Ativo</span></label>` : ''}</div>
    <div class="mt"><button class="btn pri" data-a="briSalvar" data-id="${id || ''}">Salvar</button></div>`);
}
async function briSalvar(id) {
  const nome = $('#brNome').value.trim(); if (!nome) return avisar('Dê um nome ao brinde.');
  const dados = { nome, descricao: $('#brDesc').value.trim() || null, custo: Number($('#brCusto').value) || 0, estoque: Math.max(0, parseInt($('#brEst').value) || 0), ...(id ? { ativo: $('#brAtivo').checked } : {}) };
  const salvo = id ? await ok(sb.from('brindes').update(dados).eq('id', id).select().single()) : await ok(sb.from('brindes').insert(dados).select().single());
  const arq = $('#brFoto').files[0];
  if (arq) {
    const blob = await reduzirFoto(arq), caminho = `brindes/${salvo.id}-${Date.now()}.jpg`;
    const { error } = await sb.storage.from('anexos').upload(caminho, blob, { contentType: 'image/jpeg' });
    if (error) avisar('Brinde salvo, mas a foto falhou: ' + error.message); else await ok(sb.from('brindes').update({ foto: caminho }).eq('id', salvo.id));
  }
  fecharModal(); avisar('Brinde salvo.'); await carregarCreditos(true); render();
}
function formPedirBrinde(id, chave, nome) {
  const b = CRE.brindes.find(x => String(x.id) === String(id));
  if (!D.clientes) carregarClientes().catch(() => {});
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>🎁 Pedir brinde: ${esc(b?.nome || '')}</h2><p class="mut">O Vinícius aprova pelo celular. Aprovado, o brinde aparece no pedido para o Fefão separar.</p>
    <div class="form-grid"><label class="campo">Quantidade<input type="number" id="bpQtd" value="1" min="1" max="${b?.estoque || 1}"></label>
      <label class="campo">Nº do pedido no Tiny<input type="text" id="bpPed" placeholder="Ex.: 77912"></label>
      <label class="campo inteiro">Cliente *<input type="text" id="bpCli" list="bpListaCli" value="${esc(nome || '')}" ${chave ? `data-chave="${esc(chave)}"` : ''}></label>
      <label class="campo inteiro">Por que este cliente merece? *<textarea id="bpJust" rows="2" placeholder="Ex.: cliente campeão, compra de R$ 5 mil hoje"></textarea></label></div>
    <datalist id="bpListaCli">${(D.clientes || []).slice(0, 4000).map(c => `<option value="${esc(c.nome)}">`).join('')}</datalist>
    <div class="mt"><button class="btn pri" data-a="briPedirSalvar" data-id="${id}">Enviar para aprovação</button></div>`);
}
async function briPedirSalvar(id) {
  const el = $('#bpCli'), nome = el.value.trim(), just = $('#bpJust').value.trim(), qtd = parseInt($('#bpQtd').value) || 1;
  if (!nome || !just) return avisar('Preencha o cliente e o motivo.');
  const c = (D.clientes || []).find(x => x.nome === nome);
  await ok(sb.from('brinde_pedidos').insert({ brinde_id: +id, qtd, cliente_chave: el.dataset.chave || c?.chave || null, cliente_nome: nome, pedido_numero: $('#bpPed').value.trim() || null, justificativa: just, solicitante: EU.id }));
  fecharModal(); avisar('Pedido de brinde enviado para aprovação.'); await carregarCreditos(true); render();
}
async function briAprovar(id, status) {
  const obs = status === 'recusado' ? prompt('Motivo da recusa (opcional):') : null;
  if (status === 'recusado' && obs === null) return;
  await ok(sb.from('brinde_pedidos').update({ status, ...(obs ? { obs_aprovacao: obs } : {}) }).eq('id', id));
  avisar({ aprovado: 'Brinde aprovado: já aparece no pedido para a Expedição.', recusado: 'Recusado.', entregue: 'Brinde marcado como entregue.' }[status]);
  await carregarCreditos(true); if (UI.view === 'expedicao' && typeof carregarExp === 'function') await carregarExp(true, true).catch(() => {}); render();
}
/** Brindes aprovados de um pedido do Tiny (pelo número), para a Expedição e a TV. */
const brindesDoPedido = numero => (CRE.bped || []).filter(b => b.status === 'aprovado' && numero && String(b.pedido_numero || '').trim() === String(numero));
