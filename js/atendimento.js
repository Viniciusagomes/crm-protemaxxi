'use strict';
/* Intranet Protemaxxi — Atendimento WhatsApp (fase 1).
   Caixa de entrada em tempo real (Supabase Realtime) com a API oficial da Meta: o cliente escreve → função whatsapp-webhook grava →
   a conversa aparece aqui; a resposta sai pela função whatsapp-enviar. Ações (assumir, transferir, encerrar, nota) pelas funções wa_*.
   Quem vê: o dono e quem tem a permissão "Atendimento WhatsApp" (conversas sem dono, as suas e as da sua equipe).
   Os botões desta tela usam data-wa (ouvinte próprio no fim do arquivo), para não depender da ordem dos scripts. */

const WA = { conv: null, msgs: {}, resp: [], aberta: null, aba: 'minhas', busca: '', carregando: false, canal: null, ficha: {}, urls: {}, cfg: null, info: null };
const veAtendimento = () => ehDono() || !!EU?.permissoes?.atendimento;
const waNaoLidas = () => (WA.conv || []).filter(c => c.status === 'aberta' && (c.responsavel === EU.id || !c.responsavel)).reduce((s, c) => s + (c.nao_lidas || 0), 0);
const waFone = t => { const d = String(t || '').replace(/\D/g, '').replace(/^55/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : t || ''; };
const waHora = s => { if (!s) return ''; const d = new Date(s), h = new Date(); return d.toDateString() === h.toDateString() ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const waNome = c => c.nome_perfil || waFone(c.telefone || c.wa_id);
const waJanela = c => !!c.ultima_entrada_em && Date.now() - new Date(c.ultima_entrada_em) < 24 * 3600e3;
const WA_STATUS = { enviando: '🕓', enviada: '✓', entregue: '✓✓', lida: '<span style="color:#34B7F1">✓✓</span>', falhou: '⚠️' };

async function carregarWA(forcar) {
  if (WA.carregando || (!forcar && WA.conv)) return;
  WA.carregando = true;
  try {
    const [conv, resp, cfg] = await Promise.all([
      ok(sb.from('wa_conversas').select('*').order('ultima_msg_em', { ascending: false, nullsFirst: false }).limit(500)),
      ok(sb.from('wa_respostas').select('*').order('atalho')),
      ok(sb.from('config').select('valor').eq('chave', 'whatsapp').maybeSingle()),
    ]);
    Object.assign(WA, { conv, resp, cfg: cfg?.valor || {} });
    waTempoReal();
  } finally { WA.carregando = false; }
}
async function waMensagens(id, forcar) {
  if (WA.msgs[id] && !forcar) return WA.msgs[id];
  WA.msgs[id] = await ok(sb.from('wa_mensagens').select('*').eq('conversa_id', id).order('em').order('id').limit(1000));
  return WA.msgs[id];
}

// ─── tempo real: conversas e mensagens novas chegam sem recarregar ───
function waTempoReal() {
  if (WA.canal) return;
  WA.canal = sb.channel('whatsapp')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversas' }, ev => {
      const c = ev.new, i = WA.conv.findIndex(x => x.id === (c?.id ?? ev.old?.id));
      if (ev.eventType === 'DELETE') { if (i >= 0) WA.conv.splice(i, 1); }
      else if (i >= 0) WA.conv[i] = c; else WA.conv.unshift(c);
      WA.conv.sort((a, b) => new Date(b.ultima_msg_em || 0) - new Date(a.ultima_msg_em || 0));
      waAtualizar();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_mensagens' }, ev => {
      const m = ev.new; if (!m?.conversa_id) return;
      const lista = WA.msgs[m.conversa_id];
      if (lista) { const i = lista.findIndex(x => x.id === m.id); if (i >= 0) lista[i] = m; else lista.push(m); }
      if (ev.eventType === 'INSERT' && m.direcao === 'entrada') waAvisar(m);
      if (WA.aberta === m.conversa_id && UI.view === 'atendimento') { waDesenharMsgs(); if (m.direcao === 'entrada' && document.hasFocus()) sb.rpc('wa_lida', { p_id: m.conversa_id }); }
    })
    .subscribe();
}
function waAvisar(m) {
  const c = WA.conv?.find(x => x.id === m.conversa_id);
  if (!c || (c.responsavel && c.responsavel !== EU.id)) return;                  // só o que é meu ou está sem dono
  if (WA.aberta === m.conversa_id && UI.view === 'atendimento' && document.hasFocus()) return;
  try {
    const ctx = WA.audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.15);
  } catch { /* sem som */ }
  try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(`WhatsApp — ${waNome(c)}`, { body: (m.texto || `[${m.tipo}]`).slice(0, 120), tag: 'wa' + c.id }); } catch { /* ok */ }
}
/** Redesenha só as partes da tela (não perde o texto que a pessoa está digitando). */
function waAtualizar() {
  const nav = $('#nav'); if (nav && typeof menu === 'function') nav.innerHTML = menu();
  if (UI.view !== 'atendimento') return;
  const l = $('#waLista'); if (l) l.innerHTML = waListaHtml();
  const cab = $('#waCab'); if (cab && WA.aberta) cab.innerHTML = waCabHtml(WA.conv.find(c => c.id === WA.aberta));
}

// ─── tela ───
function vAtendimento() {
  if (!WA.conv) { if (!WA.carregando) carregarWA().then(render).catch(e => avisar(e.message)); return topo('Atendimento WhatsApp', '') + '<div class="card vazio">Carregando…</div>'; }
  const semConfig = !WA.cfg?.phone_number_id;
  const acoes = `<button class="btn" data-wa="respostas">⚡ Respostas prontas</button>${typeof Notification !== 'undefined' && Notification.permission === 'default' ? '<button class="btn" data-wa="notif">🔔 Ativar avisos</button>' : ''}${ehDono() ? '<button class="btn" data-wa="config">⚙ Configurar</button>' : ''}`;
  setTimeout(() => { if (WA.aberta) waAbrir(WA.aberta, true); }, 0);
  return topo('Atendimento WhatsApp', 'Mensagens do WhatsApp da loja em tempo real', acoes)
    + (semConfig ? `<div class="card aviso med">⚙ O WhatsApp ainda não está ligado à Meta. ${ehDono() ? 'Siga o passo a passo e preencha em <b>Configurar</b>.' : 'O administrador está configurando.'}</div>` : '')
    + `<div class="wa-caixa"><div class="wa-lado"><input type="search" id="waBusca" placeholder="Buscar nome ou número" value="${esc(WA.busca)}">
        <div class="chips">${[['minhas', 'Minhas'], ['fila', 'Sem dono'], ['equipe', 'Todas abertas'], ['encerradas', 'Encerradas']].map(([k, n]) => `<button class="chip ${WA.aba === k ? 'on' : ''}" data-wa="aba" data-v="${k}">${n}<span class="n">${waFiltro(k).length}</span></button>`).join('')}</div>
        <div id="waLista">${waListaHtml()}</div></div>
      <div class="wa-chat">${WA.aberta ? waChatHtml() : '<div class="vazio" style="margin:auto">Escolha uma conversa.</div>'}</div></div>`;
}
function waFiltro(aba) {
  const q = WA.busca.trim().toLowerCase(), d = q.replace(/\D/g, '');
  return WA.conv.filter(c => (aba === 'minhas' ? c.status === 'aberta' && c.responsavel === EU.id : aba === 'fila' ? c.status === 'aberta' && !c.responsavel : aba === 'equipe' ? c.status === 'aberta' : c.status === 'encerrada')
    && (!q || (c.nome_perfil || '').toLowerCase().includes(q) || (d.length >= 3 && String(c.wa_id).includes(d))));
}
function waListaHtml() {
  const l = waFiltro(WA.aba);
  return l.length ? l.slice(0, 200).map(c => `<div class="wa-item ${WA.aberta === c.id ? 'on' : ''}" data-wa="abrir" data-id="${c.id}">
      <div><b>${esc(waNome(c))}</b>${c.nao_lidas ? `<span class="badge">${c.nao_lidas}</span>` : ''}<br><small class="mut">${esc((c.ultima_msg_texto || '').slice(0, 60))}</small></div>
      <div class="dir"><small class="mut">${waHora(c.ultima_msg_em)}</small><br><small>${c.responsavel ? esc(nomeP(c.responsavel).split(' ')[0]) : '<span class="tag med">sem dono</span>'}</small></div></div>`).join('')
    : '<p class="mut" style="padding:12px">Nenhuma conversa aqui.</p>';
}
function waCabHtml(c) {
  if (!c) return '';
  const meu = c.responsavel === EU.id;
  return `<div><b>${esc(waNome(c))}</b> <small class="mut">${esc(waFone(c.telefone || c.wa_id))}</small><br>
      <small>${c.responsavel ? 'Com ' + esc(nomeP(c.responsavel)) : '<span class="tag med">sem dono</span>'}${c.status === 'encerrada' ? ' · <span class="tag">encerrada</span>' : ''}${waJanela(c) ? '' : ' · <span class="tag ruim" title="Mais de 24 h sem mensagem do cliente">fora da janela de 24 h</span>'}</small></div>
    <div class="acoes" style="margin:0">${!meu ? `<button class="btn peq pri" data-wa="assumir" data-id="${c.id}">🙋 Assumir</button>` : ''}
      <button class="btn peq" data-wa="transferir" data-id="${c.id}">↪ Transferir</button>
      ${c.status === 'aberta' ? `<button class="btn peq" data-wa="encerrar" data-id="${c.id}">✔ Encerrar</button>` : ''}</div>`;
}
function waChatHtml() {
  const c = WA.conv.find(x => x.id === WA.aberta); if (!c) return '';
  return `<div class="wa-cab" id="waCab">${waCabHtml(c)}</div>
    <div class="wa-corpo"><div class="wa-msgs" id="waMsgs"><p class="mut">Carregando…</p></div><div class="wa-ficha" id="waFicha"></div></div>
    <div class="wa-escrever">
      <select id="waRespSel" title="Respostas prontas"><option value="">⚡</option>${WA.resp.map(r => `<option value="${r.id}">${esc(r.atalho)}</option>`).join('')}</select>
      <textarea id="waTexto" rows="2" placeholder="${waJanela(c) ? 'Escreva a mensagem (Enter envia, Shift+Enter quebra linha)' : 'Fora da janela de 24 h: só nota interna'}">${esc(WA.rasc?.[c.id] || '')}</textarea>
      <label class="btn peq" title="Enviar foto ou arquivo">📎<input type="file" id="waArq" hidden></label>
      <button class="btn peq" data-wa="nota" data-id="${c.id}" title="Só a equipe vê">📝 Nota</button>
      <button class="btn pri" data-wa="enviar" data-id="${c.id}" ${waJanela(c) ? '' : 'disabled'}>Enviar</button></div>`;
}
async function waAbrir(id, redesenho) {
  id = +id; WA.aberta = id;
  if (!redesenho) { document.querySelectorAll('.wa-item').forEach(e => e.classList.toggle('on', +e.dataset.id === id)); const ch = $('.wa-chat'); if (ch) ch.innerHTML = waChatHtml(); }
  try { await waMensagens(id, true); } catch (e) { return avisar(e.message); }
  if (WA.aberta !== id) return;
  waDesenharMsgs(); waFicha(id);
  const c = WA.conv.find(x => x.id === id);
  if (c?.nao_lidas) sb.rpc('wa_lida', { p_id: id }).then(() => { c.nao_lidas = 0; waAtualizar(); });
}
function waDesenharMsgs() {
  const el = $('#waMsgs'), lista = WA.msgs[WA.aberta]; if (!el || !lista) return;
  const embaixo = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  el.innerHTML = lista.map(m => {
    if (m.direcao === 'nota') return `<div class="wa-nota ${m.tipo === 'evento' ? 'evento' : ''}">${m.tipo === 'evento' ? `${esc(nomeP(m.por))} ${esc(m.texto)}` : `📝 <b>${esc(nomeP(m.por))}</b>: ${esc(m.texto)}`} <small>${waHora(m.em)}</small></div>`;
    const midia = m.midia_path ? waMidiaHtml(m) : m.midia_id ? '<small class="mut">[mídia — baixando…]</small>' : '';
    return `<div class="wa-msg ${m.direcao}"><div class="bolha">${midia}${m.texto ? `<div class="txt">${waTexto(m.texto)}</div>` : ''}
      <small class="mut">${m.direcao === 'saida' ? esc(nomeP(m.por).split(' ')[0]) + ' · ' : ''}${waHora(m.em)} ${m.direcao === 'saida' ? WA_STATUS[m.status] || '' : ''}</small>
      ${m.status === 'falhou' ? `<div class="c-ruim" style="font-size:12px">Não entregue: ${esc(m.erro || '')}</div>` : ''}</div></div>`;
  }).join('') || '<p class="mut">Sem mensagens.</p>';
  if (embaixo || !el.dataset.rolou) { el.scrollTop = el.scrollHeight; el.dataset.rolou = '1'; }
  waCarregarMidias();
}
const waTexto = t => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
function waMidiaHtml(m) {
  const t = (m.midia_mime || '').split('/')[0];
  return `<div class="wa-midia" data-path="${esc(m.midia_path)}" data-tipo="${t}" data-nome="${esc(m.midia_nome || 'arquivo')}">📎 ${esc(m.midia_nome || m.tipo)}</div>`;
}
/** Mídias ficam em bucket privado: gera link assinado (1 h) e guarda na memória. */
async function waCarregarMidias() {
  for (const el of document.querySelectorAll('.wa-midia[data-path]:not([data-ok])')) {
    el.dataset.ok = '1';
    const p = el.dataset.path;
    if (!WA.urls[p]) { const { data } = await sb.storage.from('whatsapp').createSignedUrl(p, 3600); WA.urls[p] = data?.signedUrl; }
    const u = WA.urls[p]; if (!u) continue;
    const t = el.dataset.tipo;
    el.innerHTML = t === 'image' ? `<a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="foto" style="max-width:260px;max-height:260px;border-radius:8px"></a>`
      : t === 'audio' ? `<audio controls src="${u}" style="max-width:260px"></audio>`
      : t === 'video' ? `<video controls src="${u}" style="max-width:260px;border-radius:8px"></video>`
      : `<a href="${u}" target="_blank" rel="noopener">📄 ${esc(el.dataset.nome)}</a>`;
  }
}
async function waFicha(id) {
  const el = $('#waFicha'); if (!el) return;
  const c = WA.conv.find(x => x.id === id);
  let f = null; try { f = await ok(sb.rpc('wa_ficha', { p_id: id })); } catch { /* sem ficha */ }
  if (WA.aberta !== id) return;
  el.innerHTML = f ? `<h3>👤 ${esc(f.nome)}</h3><small class="mut">${esc([f.doc, [f.cidade, f.uf].filter(Boolean).join('/')].filter(Boolean).join(' · '))}</small>
      ${f.nao_contatar ? '<p class="c-ruim">⚠ Pediu para não ser contatado.</p>' : ''}
      <p>Vendedor: <b>${esc(f.vendedor || '—')}</b><br>Comprou em 12 meses: <b>${R(f.total_12m)}</b></p>
      <h4>Últimos pedidos</h4>${f.pedidos.length ? f.pedidos.map(p => `<div><small><b>${esc(p.numero)}</b> · ${fmtCurta(p.data)} · ${R(p.valor)}<br><span class="mut">${esc(p.situacao || '')}${p.canal ? ' · ' + esc(p.canal) : ''}</span></small></div>`).join('') : '<p class="mut">Nenhum.</p>'}
      <div class="acoes"><button class="btn peq" data-wa="fichaCompleta" data-chave="${esc(f.chave)}">Abrir ficha</button><button class="btn peq" data-wa="ligarCliente" data-id="${id}">Trocar</button></div>`
    : `<h3>Cliente não identificado</h3><p class="mut">${esc(waFone(c?.telefone || c?.wa_id))} não está em nenhum cliente do Tiny.</p><button class="btn peq" data-wa="ligarCliente" data-id="${id}">🔗 Ligar a um cliente</button>`;
}

// ─── ações ───
async function waEnviar(id) {
  const ta = $('#waTexto'), texto = ta.value.trim(), arq = $('#waArq')?.files?.[0];
  if (!texto && !arq) return;
  const b = document.querySelector('[data-wa="enviar"]'); if (b) b.disabled = true;
  try {
    let midia = {};
    if (arq) {
      if (arq.size > 16 * 1024 * 1024) throw new Error('Arquivo maior que 16 MB.');
      const caminho = `saida/${EU.id}/${Date.now()}-${arq.name.replace(/[^\w.\-]+/g, '_').slice(-80)}`;
      const { error } = await sb.storage.from('whatsapp').upload(caminho, arq, { contentType: arq.type || 'application/octet-stream' });
      if (error) throw new Error(error.message);
      midia = { midia_path: caminho, midia_nome: arq.name, midia_mime: arq.type };
    }
    const { data, error } = await sb.functions.invoke('whatsapp-enviar', { body: { conversa: id, texto, ...midia } });
    let m = data?.erro; if (error && !m) { try { m = (await error.context?.json())?.erro; } catch { /* sem detalhe */ } }
    if (error || !data?.ok) throw new Error(m || error?.message || 'Não foi possível enviar.');
    ta.value = ''; if (WA.rasc) delete WA.rasc[id]; if ($('#waArq')) $('#waArq').value = ''; waArqRotulo();
  } catch (e) { avisar(e.message); }
  if (b) b.disabled = false; ta.focus();
}
async function waNota(id) {
  const ta = $('#waTexto'), t = ta.value.trim(); if (!t) return avisar('Escreva a nota no campo de mensagem.');
  try { await ok(sb.rpc('wa_nota', { p_id: id, p_texto: t })); ta.value = ''; if (WA.rasc) delete WA.rasc[id]; } catch (e) { avisar(e.message); }
}
async function waAcao(fn, args, msg) {
  try { await ok(sb.rpc(fn, args)); if (msg) avisar(msg); } catch (e) { avisar(e.message); }
}
function waTransferir(id) {
  const quem = D.pessoas.filter(p => p.ativo && (p.papel === 'dono' || p.permissoes?.atendimento));
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Transferir conversa</h2>
    <label class="campo">Para<select id="waPara"><option value="">↩ Devolver para a fila (sem dono)</option>${quem.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>
    <div class="acoes mt"><button class="btn pri" data-wa="transferirOk" data-id="${id}">Transferir</button></div>
    ${quem.length < 2 ? '<p class="explica mt">Para aparecer aqui, a pessoa precisa da permissão <b>Atendimento WhatsApp</b> (Configurações › colaborador).</p>' : ''}`);
}
function waEncerrar(id) {
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Encerrar conversa</h2>
    <label class="campo">Motivo<select id="waMotivo">${['Venda feita', 'Orçamento enviado', 'Dúvida respondida', 'Suporte / garantia', 'Sem resposta do cliente', 'Não é cliente / engano', 'Outro'].map(m => `<option>${m}</option>`).join('')}</select></label>
    <p class="explica">Se o cliente escrever de novo, a conversa reabre sozinha com o mesmo responsável.</p>
    <div class="acoes mt"><button class="btn pri" data-wa="encerrarOk" data-id="${id}">Encerrar</button></div>`);
}
function waLigarCliente(id) {
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Ligar a um cliente do Tiny</h2>
    <input type="search" id="waCliQ" placeholder="Nome, CPF/CNPJ ou telefone" style="width:100%"><div id="waCliRes" class="mt"></div>
    <div class="acoes mt"><button class="btn" data-wa="ligarOk" data-id="${id}" data-chave="">Desligar cliente</button></div>`);
  const inp = $('#waCliQ'); inp.focus();
  inp.oninput = () => { clearTimeout(waLigarCliente.t); waLigarCliente.t = setTimeout(async () => {
    let r = []; try { r = await ok(sb.rpc('wa_buscar_cliente', { p_q: inp.value })); } catch (e) { return avisar(e.message); }
    $('#waCliRes').innerHTML = r.length ? r.map(c => `<div class="wa-item" data-wa="ligarOk" data-id="${id}" data-chave="${esc(c.chave)}"><b>${esc(c.nome)}</b> <small class="mut">${esc([c.cidade, c.uf].filter(Boolean).join('/'))}</small></div>`).join('') : '<p class="mut">Nada encontrado.</p>';
  }, 300); };
}
function waRespostas() {
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>⚡ Respostas prontas</h2>
    <table class="tabela"><tbody>${WA.resp.map(r => `<tr><td><b>${esc(r.atalho)}</b><br><small style="white-space:pre-wrap">${esc(r.texto)}</small></td><td class="dir"><button class="btn peq perigo" data-wa="respApagar" data-id="${r.id}">🗑</button></td></tr>`).join('') || '<tr><td class="mut">Nenhuma ainda.</td></tr>'}</tbody></table>
    <h3 class="mt2">Nova</h3><label class="campo">Nome curto<input id="waRAtalho" maxlength="40" placeholder="ex.: endereço da loja"></label>
    <label class="campo">Texto<textarea id="waRTexto" rows="4" maxlength="2000"></textarea></label>
    <div class="acoes"><button class="btn pri" data-wa="respSalvar">Salvar</button></div>`, true);
}
async function waConfig() {
  let info = null; try { info = await ok(sb.rpc('wa_webhook_info')); } catch (e) { avisar(e.message); }
  const c = WA.cfg || {}, url = `${window.CRM_CONFIG.url}/functions/v1/whatsapp-webhook`;
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>⚙ Ligar o WhatsApp à Meta</h2>
    <p class="explica">Passo a passo completo: <b>projetos/WHATSAPP-META-PASSO-A-PASSO.md</b>. O token e a chave secreta do app vão nas <b>secrets do Supabase</b> (META_WA_TOKEN e META_APP_SECRET), nunca aqui.</p>
    <div class="grade"><label class="campo">ID do número de telefone<input id="waCfgPhone" value="${esc(c.phone_number_id || '')}" inputmode="numeric"></label>
      <label class="campo">ID da conta do WhatsApp Business<input id="waCfgWaba" value="${esc(c.waba_id || '')}" inputmode="numeric"></label>
      <label class="campo">Versão da API<input id="waCfgVer" value="${esc(c.graph_version || 'v23.0')}"></label></div>
    <div class="acoes"><button class="btn pri" data-wa="configSalvar">Salvar</button></div>
    <h3 class="mt2">Webhook (cole no painel da Meta › WhatsApp › Configuração)</h3>
    <label class="campo">URL de retorno<input readonly value="${esc(url)}"></label>
    <label class="campo">Token de verificação<input readonly value="${esc(info?.verify_token || '')}"></label>
    <p class="explica">Depois de verificar, assine o campo <b>messages</b>.</p>`, true);
}
function waArqRotulo() { const f = $('#waArq')?.files?.[0], l = $('#waArq')?.parentElement; if (l) l.firstChild.textContent = f ? `📎 ${f.name.slice(0, 18)}` : '📎'; }

const WA_ACOES = {
  aba: el => { WA.aba = el.dataset.v; render(); },
  abrir: el => waAbrir(el.dataset.id),
  enviar: el => waEnviar(+el.dataset.id),
  nota: el => waNota(+el.dataset.id),
  assumir: el => waAcao('wa_assumir', { p_id: +el.dataset.id }, 'A conversa agora é sua.'),
  transferir: el => waTransferir(+el.dataset.id),
  transferirOk: el => { waAcao('wa_transferir', { p_id: +el.dataset.id, p_pessoa: $('#waPara').value || null }, 'Transferida.'); fecharModal(); },
  encerrar: el => waEncerrar(+el.dataset.id),
  encerrarOk: el => { waAcao('wa_encerrar', { p_id: +el.dataset.id, p_motivo: $('#waMotivo').value }, 'Conversa encerrada.'); fecharModal(); },
  ligarCliente: el => waLigarCliente(+el.dataset.id),
  ligarOk: async el => { await waAcao('wa_ligar_cliente', { p_id: +el.dataset.id, p_chave: el.dataset.chave || null }, 'Cliente atualizado.'); fecharModal(); const c = WA.conv.find(x => x.id === +el.dataset.id); if (c) c.cliente_chave = el.dataset.chave || null; waFicha(+el.dataset.id); },
  fichaCompleta: el => abrirCliente(el.dataset.chave),
  respostas: () => waRespostas(),
  respSalvar: async () => {
    const a = $('#waRAtalho').value.trim(), t = $('#waRTexto').value.trim(); if (!a || !t) return avisar('Preencha o nome e o texto.');
    try { WA.resp.push(await ok(sb.from('wa_respostas').insert({ atalho: a, texto: t, criado_por: EU.id }).select().single())); WA.resp.sort((x, y) => x.atalho.localeCompare(y.atalho)); waRespostas(); } catch (e) { avisar(e.message); }
  },
  respApagar: async el => { if (!confirm('Apagar esta resposta pronta?')) return; try { await ok(sb.from('wa_respostas').delete().eq('id', +el.dataset.id)); WA.resp = WA.resp.filter(r => r.id !== +el.dataset.id); waRespostas(); } catch (e) { avisar(e.message); } },
  notif: async () => { try { await Notification.requestPermission(); } catch { /* ok */ } render(); },
  config: () => waConfig(),
  configSalvar: async () => {
    const v = { ...(WA.cfg || {}), phone_number_id: $('#waCfgPhone').value.replace(/\D/g, '') || null, waba_id: $('#waCfgWaba').value.replace(/\D/g, '') || null, graph_version: $('#waCfgVer').value.trim() || 'v23.0' };
    try { await ok(sb.from('config').upsert({ chave: 'whatsapp', valor: v })); WA.cfg = v; avisar('Salvo.'); fecharModal(); render(); } catch (e) { avisar(e.message); }
  },
};
document.addEventListener('click', e => { const el = e.target.closest('[data-wa]'); if (el && WA_ACOES[el.dataset.wa]) { e.preventDefault(); WA_ACOES[el.dataset.wa](el, e); } });
document.addEventListener('input', e => {
  if (e.target.id === 'waBusca') { WA.busca = e.target.value; const l = $('#waLista'); if (l) l.innerHTML = waListaHtml(); }
  if (e.target.id === 'waTexto' && WA.aberta) (WA.rasc ||= {})[WA.aberta] = e.target.value;
});
document.addEventListener('change', e => {
  if (e.target.id === 'waRespSel' && e.target.value) { const r = WA.resp.find(x => x.id === +e.target.value), ta = $('#waTexto'); if (r && ta) { ta.value = (ta.value ? ta.value + '\n' : '') + r.texto; (WA.rasc ||= {})[WA.aberta] = ta.value; ta.focus(); } e.target.value = ''; }
  if (e.target.id === 'waArq') waArqRotulo();
});
document.addEventListener('keydown', e => { if (e.target.id === 'waTexto' && e.key === 'Enter' && !e.shiftKey && WA.aberta) { e.preventDefault(); const c = WA.conv.find(x => x.id === WA.aberta); if (c && waJanela(c)) waEnviar(WA.aberta); } });
