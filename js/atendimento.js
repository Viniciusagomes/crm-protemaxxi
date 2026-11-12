'use strict';
/* Intranet Protemaxxi — Atendimento WhatsApp (fase 1).
   Caixa de entrada em tempo real (Supabase Realtime) com a API oficial da Meta: o cliente escreve → função whatsapp-webhook grava →
   a conversa aparece aqui; a resposta sai pela função whatsapp-enviar. Ações (assumir, transferir, encerrar, nota) pelas funções wa_*.
   Quem vê: o dono e quem tem a permissão "Atendimento WhatsApp" (conversas sem dono, as suas e as da sua equipe).
   Os botões desta tela usam data-wa (ouvinte próprio no fim do arquivo), para não depender da ordem dos scripts. */

const WA = { conv: null, msgs: {}, resp: [], aberta: null, aba: 'minhas', busca: '', carregando: false, canal: null, ficha: {}, urls: {}, cfg: null, info: null, equipe: null, hor: [] };
const veAtendimento = () => ehDono() || !!EU?.permissoes?.atendimento;
const waNaoLidas = () => (WA.conv || []).filter(c => c.status === 'aberta' && (c.responsavel === EU.id || !c.responsavel)).reduce((s, c) => s + (c.nao_lidas || 0), 0);
const waFone = t => { const d = String(t || '').replace(/\D/g, '').replace(/^55/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : t || ''; };
const waHora = s => { if (!s) return ''; const d = new Date(s), h = new Date(); return d.toDateString() === h.toDateString() ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const waNome = c => c.nome_perfil || waFone(c.telefone || c.wa_id);
const waJanela = c => !!c.ultima_entrada_em && Date.now() - new Date(c.ultima_entrada_em) < 24 * 3600e3;
const WA_STATUS = { enviando: '🕓', enviada: '✓', entregue: '✓✓', lida: '<span style="color:#34B7F1">✓✓</span>', falhou: '⚠️' };
// Fase 2 — expediente: mesmas regras de seg.wa_disponivel (trabalhando + sinal da tela do WhatsApp nos últimos 3 min + sem bloqueio).
const WA_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const waEu = () => WA.equipe?.find(a => a.pessoa === EU?.id);
const waBloq = a => !!a?.bloqueado_ate && new Date(a.bloqueado_ate) > Date.now();
const waDisp = (pid, agora = Date.now()) => {
  const a = WA.equipe?.find(x => x.pessoa === pid), lim = agora - 3 * 60e3;
  return !!a && a.estado === 'trabalhando' && new Date(a.visto_em || 0) > lim && new Date(a.tela_em || 0) > lim && !(a.bloqueado_ate && new Date(a.bloqueado_ate) > agora);
};
/** Perfil de atendimento (mesma regra da função whatsapp-enviar): o cadastrado, ou "Nome - Setor". */
const waAssinatura = pid => {
  const a = WA.equipe?.find(x => x.pessoa === pid);
  return (a?.assinatura || '').trim() || `${nomeP(pid)} - ${(a?.setores || [])[0] === 'suporte' ? 'Suporte Técnico' : 'Vendas'}`;
};
const waDataHora = s => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function carregarWA(forcar) {
  if (WA.carregando || (!forcar && WA.conv)) return;
  WA.carregando = true;
  try {
    const [conv, resp, cfg, equipe, hor] = await Promise.all([
      ok(sb.from('wa_conversas').select('*').order('ultima_msg_em', { ascending: false, nullsFirst: false }).limit(500)),
      ok(sb.from('wa_respostas').select('*').order('atalho')),
      ok(sb.from('config').select('valor').eq('chave', 'whatsapp').maybeSingle()),
      ok(sb.from('wa_atendentes').select('*')),
      ok(sb.from('wa_horarios').select('*').order('dia').order('inicio')),
    ]);
    Object.assign(WA, { conv, resp, cfg: cfg?.valor || {}, equipe, hor });
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_atendentes' }, ev => { if (ev.new?.pessoa) waEquipeSet(ev.new); })
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
  const exp = $('#waExp'); if (exp) exp.innerHTML = waExpHtml();
}

// ─── expediente: botões, sinal de presença (30 s) e avisos ───
function waEquipeSet(a) {
  if (!a?.pessoa) return;
  WA.equipe ||= [];
  const i = WA.equipe.findIndex(x => x.pessoa === a.pessoa); if (i >= 0) WA.equipe[i] = a; else WA.equipe.push(a);
  if (a.pessoa === EU?.id) waMostrarAviso(a);
  waAtualizar();
}
function waExpHtml() {
  const a = waEu() || { estado: 'fora' }, desde = a.desde ? ` desde ${waHora(a.desde)}` : '';
  const st = a.estado === 'trabalhando' ? `<span class="tag ok">🟢 Em expediente${desde}</span>` : a.estado === 'almoco' ? `<span class="tag med">🍽 Em almoço${desde}</span>` : '<span class="tag">⚪ Fora do expediente</span>';
  const bts = a.estado === 'fora' ? '<button class="btn pri" data-wa="exp" data-v="inicio">▶ Iniciar expediente</button>'
    : a.estado === 'trabalhando' ? '<button class="btn" data-wa="exp" data-v="almoco">🍽 Almoço</button><button class="btn" data-wa="exp" data-v="fim">⏹ Finalizar expediente</button>'
    : '<button class="btn pri" data-wa="exp" data-v="retorno">↩ Retornar do almoço</button><button class="btn" data-wa="exp" data-v="fim">⏹ Finalizar expediente</button>';
  const bloq = waBloq(a) ? `<div class="c-ruim mt">⛔ Bloqueado para conversas novas até <b>${waDataHora(a.bloqueado_ate)}</b>.</div>` : '';
  const faltas = a.faltas ? ` <small class="mut">· avisos: ${a.faltas}/2</small>` : '';
  const dica = a.estado === 'trabalhando' && !waBloq(a) ? '<small class="mut">Você recebe conversas novas enquanto esta tela estiver aberta.</small>' : a.estado === 'fora' ? '<small class="mut">Inicie o expediente para receber conversas novas.</small>' : '';
  return `<div class="acoes" style="margin:0;align-items:center">${st}${faltas} ${bts} ${dica}</div>${bloq}
    <small class="mut">Suas mensagens saem com <b>${esc(waAssinatura(EU?.id))}</b> em cima.</small>`;
}
async function waExpAcao(acao) {
  if (acao === 'fim' && !confirm('Finalizar o expediente? Você para de receber conversas novas.')) return;
  try { waEquipeSet(await ok(sb.rpc('wa_expediente', { p_acao: acao, p_tela: UI.view === 'atendimento' }))); } catch (e) { avisar(e.message); }
}
/** Sinal de presença: só para quem está em expediente. Sem ele por 5 min estando "trabalhando" conta como saída sem botão. */
async function waPing() {
  if (typeof EU === 'undefined' || !EU || !veAtendimento()) return;
  try {
    if (!WA.equipe) WA.equipe = await ok(sb.from('wa_atendentes').select('*'));
    const a = waEu();
    if (a?.aviso) waMostrarAviso(a);
    if (!a || a.estado === 'fora') return;
    waEquipeSet(await ok(sb.rpc('wa_expediente', { p_acao: 'ping', p_tela: UI.view === 'atendimento' && !document.hidden })));
  } catch { /* sem rede: tenta no próximo */ }
}
function waMostrarAviso(a) {
  if (!a?.aviso || WA.avisoVisto === a.aviso_em) return;
  WA.avisoVisto = a.aviso_em;
  modal(`<h2>⚠ Expediente do WhatsApp</h2><p>${esc(a.aviso)}</p><div class="acoes mt"><button class="btn pri" data-wa="avisoOk">Entendi</button></div>`);
}

// ─── dono: equipe (setores, avisos, bloqueio) e horários de atendimento ───
async function waEquipe() {
  let log = [];
  try {
    [WA.equipe, WA.hor, log] = await Promise.all([ok(sb.from('wa_atendentes').select('*')), ok(sb.from('wa_horarios').select('*').order('dia').order('inicio')),
      ok(sb.from('wa_expediente_log').select('*').order('em', { ascending: false }).limit(30))]);
  } catch (e) { return avisar(e.message); }
  const quem = D.pessoas.filter(p => p.ativo && (p.permissoes?.atendimento || WA.equipe.some(a => a.pessoa === p.id)));
  const linha = p => {
    const a = WA.equipe.find(x => x.pessoa === p.id) || { estado: 'fora', setores: [], faltas: 0 };
    const sit = waBloq(a) ? `<span class="tag ruim">⛔ bloqueado até ${waDataHora(a.bloqueado_ate)}</span>` : waDisp(p.id) ? '<span class="tag ok">🟢 disponível</span>'
      : a.estado === 'almoco' ? '<span class="tag med">🍽 almoço</span>' : a.estado === 'trabalhando' ? '<span class="tag med">em expediente, fora da tela</span>' : '<span class="tag">⚪ fora</span>';
    const hs = WA.hor.filter(h => h.pessoa === p.id).map(h => `<span class="chip">${WA_DIAS[h.dia]} ${h.inicio.slice(0, 5)}–${h.fim.slice(0, 5)} <a href="#" data-wa="horApagar" data-id="${h.id}" title="Remover">✕</a></span>`).join(' ');
    return `<tr><td><b>${esc(p.nome)}</b>${p.permissoes?.atendimento || p.papel === 'dono' ? '' : '<br><small class="c-ruim">sem permissão Atendimento WhatsApp</small>'}
        <br><input data-wa-assin="${p.id}" maxlength="60" value="${esc(a.assinatura || '')}" placeholder="${esc(waAssinatura(p.id))}" title="Perfil: nome que aparece em cima das mensagens" style="width:190px;margin-top:4px"></td><td>${sit}</td>
      <td>${['vendas', 'suporte'].map(s => `<label style="white-space:nowrap"><input type="checkbox" data-wa-setor="${p.id}" value="${s}" ${(a.setores || []).includes(s) ? 'checked' : ''}> ${s === 'vendas' ? 'Vendas' : 'Suporte'}</label>`).join('<br>')}</td>
      <td>${a.faltas || 0}/2${waBloq(a) || a.faltas ? ` <button class="btn peq" data-wa="desbloquear" data-p="${p.id}">Zerar${waBloq(a) ? ' e desbloquear' : ''}</button>` : ''}</td><td>${hs || '<small class="mut">—</small>'}</td></tr>`;
  };
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>👥 Equipe do WhatsApp</h2>
    <p class="explica">Recebe conversa nova quem está <b>em expediente com a tela do WhatsApp aberta</b>, no setor marcado e sem bloqueio. Cliente que já comprou vai primeiro para o vendedor dele no Tiny.
      Sair sem apertar <b>Almoço</b> ou <b>Finalizar</b>: 1º aviso, 2º aviso final, 3º bloqueio de 3 dias.</p>
    <p class="explica">Embaixo do nome fica o <b>perfil de atendimento</b>: o que aparece em negrito em cima de cada mensagem (vazio = "Nome - Setor").</p>
    <table class="tabela"><thead><tr><th>Pessoa / perfil</th><th>Agora</th><th>Setores</th><th>Avisos</th><th>Horário de atendimento</th></tr></thead><tbody>${quem.map(linha).join('') || '<tr><td colspan="5" class="mut">Ninguém com a permissão Atendimento WhatsApp (Configurações › colaborador).</td></tr>'}</tbody></table>
    <h3 class="mt2">Adicionar horário</h3>
    <div class="acoes"><select id="waHPes">${quem.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select>
      <select id="waHDia">${WA_DIAS.map((d, i) => `<option value="${i}" ${i === 1 ? 'selected' : ''}>${d}</option>`).join('')}</select>
      <input type="time" id="waHIni" value="08:00"> até <input type="time" id="waHFim" value="18:00">
      <label><input type="checkbox" id="waHSemana"> Seg a Sex</label>
      <button class="btn pri" data-wa="horAdd">Adicionar</button></div>
    <p class="explica">O horário é informativo: o bot vai mostrá-lo ao cliente (fase 3). Quem decide a distribuição é o expediente.</p>
    <h3 class="mt2">Últimos registros</h3>
    <table class="tabela"><tbody>${log.map(l => `<tr><td><small>${waDataHora(l.em)}</small></td><td>${esc(nomeP(l.pessoa))}</td><td>${esc({ inicio: 'iniciou o expediente', almoco: 'saiu para almoço', retorno: 'voltou do almoço', fim: 'finalizou o expediente', falha: '⚠ saída sem botão', bloqueio: '⛔ bloqueado', desbloqueio: 'desbloqueado' }[l.evento] || l.evento)}${l.detalhe ? ` <small class="mut">${esc(l.detalhe)}</small>` : ''}</td></tr>`).join('') || '<tr><td class="mut">Nada ainda.</td></tr>'}</tbody></table>`, true);
}
async function waHorAdd() {
  const pessoa = $('#waHPes')?.value, ini = $('#waHIni').value, fim = $('#waHFim').value;
  if (!pessoa || !ini || !fim || fim <= ini) return avisar('Confira a pessoa e o horário (o fim precisa ser depois do início).');
  const dias = $('#waHSemana').checked ? [1, 2, 3, 4, 5] : [+$('#waHDia').value];
  try { await ok(sb.from('wa_horarios').insert(dias.map(dia => ({ pessoa, dia, inicio: ini, fim })))); waEquipe(); } catch (e) { avisar(e.message); }
}

// ─── tela ───
function vAtendimento() {
  if (!WA.conv) { if (!WA.carregando) carregarWA().then(render).catch(e => avisar(e.message)); return topo('Atendimento WhatsApp', '') + '<div class="card vazio">Carregando…</div>'; }
  const semConfig = !WA.cfg?.phone_number_id;
  const acoes = `<button class="btn" data-wa="respostas">⚡ Respostas prontas</button>${typeof Notification !== 'undefined' && Notification.permission === 'default' ? '<button class="btn" data-wa="notif">🔔 Ativar avisos</button>' : ''}${ehDono() ? '<button class="btn" data-wa="equipe">👥 Equipe</button><button class="btn" data-wa="config">⚙ Configurar</button>' : ''}`;
  setTimeout(() => { if (WA.aberta) waAbrir(WA.aberta, true); if (waEu()?.estado && waEu().estado !== 'fora') waPing(); }, 0);
  return topo('Atendimento WhatsApp', 'Mensagens do WhatsApp da loja em tempo real', acoes)
    + (semConfig ? `<div class="card aviso med">⚙ O WhatsApp ainda não está ligado à Meta. ${ehDono() ? 'Siga o passo a passo e preencha em <b>Configurar</b>.' : 'O administrador está configurando.'}</div>` : '')
    + `<div class="card" id="waExp">${waExpHtml()}</div>`
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
  const meu = c.responsavel === EU.id, vc = c.vendedor_carteira && c.vendedor_carteira !== c.responsavel ? c.vendedor_carteira : null;
  const carteira = vc ? (waDisp(vc) && (meu || ehDono())
      ? `<button class="btn peq pri" data-wa="enviarVendedor" data-id="${c.id}" title="${esc(nomeP(vc))} voltou e está disponível">📤 Enviar para o vendedor: ${esc(nomeP(vc).split(' ')[0])}</button>`
      : `<small class="mut" title="Quando ele estiver disponível aparece o botão para enviar a conversa">Vendedor da carteira: ${esc(nomeP(vc))} (indisponível)</small>`) : '';
  return `<div><b>${esc(waNome(c))}</b> <small class="mut">${esc(waFone(c.telefone || c.wa_id))}</small><br>
      <small>${c.responsavel ? 'Com ' + esc(nomeP(c.responsavel)) : '<span class="tag med">sem dono</span>'}${c.status === 'encerrada' ? ' · <span class="tag">encerrada</span>' : ''}${waJanela(c) ? '' : ' · <span class="tag ruim" title="Mais de 24 h sem mensagem do cliente">fora da janela de 24 h</span>'}</small></div>
    <div class="acoes" style="margin:0">${carteira}${!meu ? `<button class="btn peq pri" data-wa="assumir" data-id="${c.id}">🙋 Assumir</button>` : ''}
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
    <p class="explica">Se o cliente escrever de novo, a conversa reabre e passa pela distribuição (vendedor da carteira primeiro).</p>
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
  exp: el => waExpAcao(el.dataset.v),
  avisoOk: async () => { fecharModal(); try { waEquipeSet(await ok(sb.rpc('wa_expediente', { p_acao: 'aviso_ok', p_tela: UI.view === 'atendimento' }))); } catch (e) { avisar(e.message); } },
  enviarVendedor: el => waAcao('wa_enviar_vendedor', { p_id: +el.dataset.id }, 'Conversa enviada para o vendedor.'),
  equipe: () => waEquipe(),
  desbloquear: async el => { await waAcao('wa_desbloquear', { p_pessoa: el.dataset.p }, 'Avisos zerados.'); waEquipe(); },
  horAdd: () => waHorAdd(),
  horApagar: async el => { try { await ok(sb.from('wa_horarios').delete().eq('id', +el.dataset.id)); waEquipe(); } catch (e) { avisar(e.message); } },
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
  if (e.target.dataset.waAssin) {
    const p = e.target.dataset.waAssin, v = e.target.value.trim();
    waAcao('wa_atendente_assinatura', { p_pessoa: p, p_texto: v }, 'Perfil salvo.').then(() => { const a = WA.equipe?.find(x => x.pessoa === p); if (a) a.assinatura = v || null; else (WA.equipe ||= []).push({ pessoa: p, assinatura: v || null, setores: ['vendas'], estado: 'fora' }); });
  }
  if (e.target.dataset.waSetor) {
    const p = e.target.dataset.waSetor, setores = [...document.querySelectorAll(`[data-wa-setor="${p}"]:checked`)].map(x => x.value);
    waAcao('wa_atendente_cfg', { p_pessoa: p, p_setores: setores }, 'Setores salvos.');
  }
});
if (typeof setInterval === 'function') { setInterval(waPing, 30e3); setTimeout(waPing, 5e3); }   // sinal de presença do expediente
document.addEventListener('keydown', e => { if (e.target.id === 'waTexto' && e.key === 'Enter' && !e.shiftKey && WA.aberta) { e.preventDefault(); const c = WA.conv.find(x => x.id === WA.aberta); if (c && waJanela(c)) waEnviar(WA.aberta); } });
