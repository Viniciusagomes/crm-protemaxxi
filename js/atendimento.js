'use strict';
/* Intranet Protemaxxi — Atendimento WhatsApp (visual parecido com o app; aba "Esperando", respostas com "/").
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
const WA_PAGINA = 50;
/** Mensagens da conversa: só as 50 últimas; as anteriores vêm com "Carregar anteriores" (waMaisAntigas). */
async function waMensagens(id, forcar) {
  if (WA.msgs[id] && !forcar) return WA.msgs[id];
  const l = await ok(sb.from('wa_mensagens').select('*').eq('conversa_id', id).order('em', { ascending: false }).order('id', { ascending: false }).limit(WA_PAGINA));
  WA.msgs[id] = l.reverse(); (WA.temMais ||= {})[id] = l.length === WA_PAGINA;
  return WA.msgs[id];
}
async function waMaisAntigas(id) {
  const lista = WA.msgs[id]; if (!lista?.length || WA.buscandoAntigas) return;
  WA.buscandoAntigas = true;
  try {
    const l = await ok(sb.from('wa_mensagens').select('*').eq('conversa_id', id).lt('em', lista[0].em).order('em', { ascending: false }).order('id', { ascending: false }).limit(WA_PAGINA));
    WA.temMais[id] = l.length === WA_PAGINA;
    const ids = new Set(lista.map(m => m.id));
    WA.msgs[id] = [...l.reverse().filter(m => !ids.has(m.id)), ...lista];
    if (WA.aberta === id) { const el = $('#waMsgs'), antes = el ? el.scrollHeight - el.scrollTop : 0; waDesenharMsgs(); if (el) el.scrollTop = el.scrollHeight - antes; }
  } catch (e) { avisar(e.message); } finally { WA.buscandoAntigas = false; }
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
  const nav = $('#nav'); if (nav && typeof menu === 'function') { const h = menu(); if (h !== WA.menuHtml || !nav.innerHTML) { nav.innerHTML = h; WA.menuHtml = h; } }   // menu só quando muda
  if (UI.view !== 'atendimento') return;
  const l = $('#waLista'); if (l) l.innerHTML = waListaHtml();
  const ab = $('#waAbas'); if (ab) ab.innerHTML = waAbasHtml();
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
  const fixo = WA.cfg?.responsavel_fixo;
  if (fixo) return `<div class="acoes" style="margin:0;align-items:center"><span class="tag">⏸ Expediente desligado</span>
    <small class="mut">Por enquanto, toda conversa nova vai direto para <b>${esc(nomeP(fixo))}</b>.</small></div>
    <small class="mut">Suas mensagens saem com <b>${esc(waAssinatura(EU?.id))}</b> em cima.</small>`;
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

// ─── tela (visual parecido com o WhatsApp) ───
const WA_IC = {
  enviar: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg>',
  clipe: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M20 11.5 12.2 19.3a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/></svg>',
  nota: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h5"/></svg>',
  raio: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
  info: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="currentColor" d="M11 10h2v7h-2zM11 7h2v2h-2z"/></svg>',
  voltar: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M15 5 8 12l7 7"/></svg>',
  lupa: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="m16 16 4 4"/></svg>',
  check: '<svg viewBox="0 0 16 11" width="16" height="11" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M1 6l3.5 3.5L11 2"/></svg>',
  check2: '<svg viewBox="0 0 18 11" width="18" height="11" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M1 6l3.5 3.5L11 2M7.5 9.5 15 2"/></svg>',
  relogio: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.5"/><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M8 4.5V8l2.3 1.5"/></svg>',
};
const waTick = s => s === 'lida' ? `<span class="wa-tk lida" title="Lida">${WA_IC.check2}</span>` : s === 'entregue' ? `<span class="wa-tk" title="Entregue">${WA_IC.check2}</span>`
  : s === 'enviada' ? `<span class="wa-tk" title="Enviada">${WA_IC.check}</span>` : s === 'enviando' ? `<span class="wa-tk" title="Enviando">${WA_IC.relogio}</span>` : s === 'falhou' ? '<span class="wa-tk falhou" title="Não entregue">!</span>' : '';
/** Iniciais e cor fixa por conversa (avatar sem foto). */
const waIniciais = n => { const p = String(n || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean); return p.length ? (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() : '#'; };
const waAvatar = (c, cls = '') => { const n = c.nome_perfil || ''; const h = [...String(c.wa_id || c.id)].reduce((s, x) => (s * 31 + x.charCodeAt(0)) % 360, 7);
  return `<span class="wa-av ${cls}" style="--h:${h}">${/\p{L}/u.test(n) ? esc(waIniciais(n)) : '<svg viewBox="0 0 24 24" width="60%" height="60%" aria-hidden="true"><path fill="currentColor" d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z"/></svg>'}</span>`; };
/** Cliente esperando resposta: a última mensagem da conversa é dele. Devolve os minutos de espera (ou null). */
const waEsperaMin = (c, agora = Date.now()) => {
  if (c.status !== 'aberta' || !c.ultima_entrada_em) return null;
  const e = new Date(c.ultima_entrada_em).getTime(); if (new Date(c.ultima_msg_em || 0).getTime() > e + 1000) return null;
  return Math.max(0, Math.floor((agora - e) / 60e3));
};
const waEsperaTxt = m => m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`;
const waEsperaCls = m => m >= 15 ? 'ruim' : m >= 5 ? 'med' : 'ok';
const WA_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const waDiaRot = (s, agora = new Date()) => { const d = new Date(s), h = new Date(agora); h.setHours(0, 0, 0, 0); const x = new Date(d); x.setHours(0, 0, 0, 0);
  const dif = Math.round((h - x) / 864e5); return dif === 0 ? 'Hoje' : dif === 1 ? 'Ontem' : dif < 7 ? d.toLocaleDateString('pt-BR', { weekday: 'long' }) : `${d.getDate()} de ${WA_MESES[d.getMonth()]}${d.getFullYear() !== h.getFullYear() ? ' de ' + d.getFullYear() : ''}`; };
const waSoHora = s => new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
/** Respostas prontas: troca {nome}, {vendedor} e {saudacao}. */
const waSaudacao = (h = new Date().getHours()) => h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
const waVariaveis = (t, c) => String(t || '').replace(/\{nome\}/gi, ((c?.nome_perfil || '').trim().split(/\s+/)[0] || '').replace(/^\w/, x => x.toUpperCase()))
  .replace(/\{vendedor\}/gi, typeof EU !== 'undefined' && EU ? nomeP(EU.id).split(' ')[0] : '').replace(/\{saudacao\}/gi, waSaudacao()).replace(/ +([,!.?])/g, '$1');
const WA_PACOTE = [
  ['saudação', '{saudacao}, {nome}! Aqui é o {vendedor}, da Protemaxxi. Como posso te ajudar?'],
  ['um momento', 'Só um momento, {nome}, já vou verificar para você.'],
  ['orçamento — dados', 'Para montar seu orçamento, me conta: é para casa ou empresa? Quantos ambientes/câmeras você imagina? Precisa de instalação?'],
  ['orçamento enviado', '{nome}, te enviei o orçamento acima. Qualquer dúvida é só me chamar por aqui!'],
  ['instalação', 'Fazemos a instalação sim! Me passa o bairro/cidade e o melhor dia para agendarmos a visita técnica.'],
  ['retomar contato', '{saudacao}, {nome}! Passando para saber se ficou alguma dúvida sobre o que conversamos.'],
  ['agradecimento', 'Obrigado pela preferência, {nome}! Qualquer coisa, estamos à disposição.'],
];

function vAtendimento() {
  if (!WA.conv) { if (!WA.carregando) carregarWA().then(render).catch(e => avisar(e.message)); return topo('WhatsApp', '') + '<div class="card vazio">Carregando…</div>'; }
  const semConfig = !WA.cfg?.phone_number_id;
  const acoes = `<button class="btn" data-wa="respostas">${WA_IC.raio} Respostas prontas</button>${typeof Notification !== 'undefined' && Notification.permission === 'default' ? '<button class="btn" data-wa="notif">Ativar avisos</button>' : ''}${ehDono() ? '<button class="btn" data-wa="saude">Saúde</button><button class="btn" data-wa="equipe">Equipe</button><button class="btn" data-wa="config">Configurar</button>' : ''}`;
  setTimeout(() => { if (WA.aberta) waAbrir(WA.aberta, true); if (waEu()?.estado && waEu().estado !== 'fora') waPing(); }, 0);
  return topo('WhatsApp', '', acoes)
    + (semConfig ? `<div class="card aviso med">O WhatsApp ainda não está ligado à Meta. ${ehDono() ? 'Siga o passo a passo e preencha em <b>Configurar</b>.' : 'O administrador está configurando.'}</div>` : '')
    + `<div class="wa-app ${WA.aberta ? 'com-chat' : ''} ${WA.fichaAberta ? 'com-ficha' : ''}">
      <section class="wa-lado">
        <div class="wa-exp" id="waExp">${waExpHtml()}</div>
        <label class="wa-busca">${WA_IC.lupa}<input type="search" id="waBusca" placeholder="Pesquisar nome ou número" value="${esc(WA.busca)}"></label>
        <div class="wa-abas" id="waAbas">${waAbasHtml()}</div>
        <div class="wa-lista" id="waLista">${waListaHtml()}</div>
      </section>
      <section class="wa-chat">${WA.aberta ? waChatHtml() : waVazioHtml()}</section></div>`;
}
const waVazioHtml = () => `<div class="wa-vazio"><div class="wa-vazio-ic">${WA_IC.enviar}</div><h3>WhatsApp da loja</h3><p>Escolha uma conversa à esquerda.<br>As mensagens chegam aqui em tempo real.</p></div>`;
const WA_ABAS = [['minhas', 'Minhas'], ['esperando', 'Esperando'], ['fila', 'Sem dono'], ['equipe', 'Todas'], ['encerradas', 'Encerradas']];
function waAbasHtml() {
  return WA_ABAS.map(([k, n]) => { const q = waFiltro(k).length; return `<button class="wa-aba ${WA.aba === k ? 'on' : ''} ${k === 'esperando' && q ? 'alerta' : ''}" data-wa="aba" data-v="${k}">${n}${q ? `<span>${q}</span>` : ''}</button>`; }).join('');
}
function waFiltro(aba) {
  const q = WA.busca.trim().toLowerCase(), d = q.replace(/\D/g, '');
  const meuOuLivre = c => !c.responsavel || c.responsavel === EU.id || ehDono();
  const l = WA.conv.filter(c => (aba === 'minhas' ? c.status === 'aberta' && c.responsavel === EU.id : aba === 'fila' ? c.status === 'aberta' && !c.responsavel
      : aba === 'esperando' ? waEsperaMin(c) != null && meuOuLivre(c) : aba === 'equipe' ? c.status === 'aberta' : c.status === 'encerrada')
    && (!q || (c.nome_perfil || '').toLowerCase().includes(q) || (d.length >= 3 && String(c.wa_id).includes(d))));
  return l.sort((a, b) => new Date(b.ultima_msg_em || 0) - new Date(a.ultima_msg_em || 0));   // mais recente primeiro em todas as abas
}
function waListaHtml() {
  const l = waFiltro(WA.aba);
  return l.length ? l.slice(0, 200).map(c => {
    const esp = waEsperaMin(c), fora = c.status === 'aberta' && !waJanela(c);
    return `<div class="wa-item ${WA.aberta === c.id ? 'on' : ''}" data-wa="abrir" data-id="${c.id}">${waAvatar(c)}
      <div class="wa-item-c"><div class="l1"><b>${esc(waNome(c))}</b><time class="${c.nao_lidas ? 'nova' : ''}">${waHora(c.ultima_msg_em)}</time></div>
        <div class="l2"><span class="prev">${esc((c.ultima_msg_texto || '').slice(0, 80))}</span>${c.nao_lidas ? `<span class="wa-bolinha">${c.nao_lidas}</span>` : ''}</div>
        <div class="l3">${c.responsavel ? `<span class="wa-dono">${esc(nomeP(c.responsavel).split(' ')[0])}</span>` : '<span class="wa-tag med">sem dono</span>'}${esp != null ? `<span class="wa-tag ${waEsperaCls(esp)}" title="Cliente esperando resposta">${WA_IC.relogio} ${waEsperaTxt(esp)}</span>` : ''}${fora ? '<span class="wa-tag" title="Mais de 24 h sem mensagem do cliente: só modelo aprovado">fora das 24 h</span>' : ''}</div></div></div>`;
  }).join('') : `<p class="wa-nada">${WA.aba === 'esperando' ? 'Ninguém esperando resposta. 👏' : 'Nenhuma conversa aqui.'}</p>`;
}
function waCabHtml(c) {
  if (!c) return '';
  const meu = c.responsavel === EU.id, vc = c.vendedor_carteira && c.vendedor_carteira !== c.responsavel ? c.vendedor_carteira : null;
  const carteira = vc ? (waDisp(vc) && (meu || ehDono())
      ? `<button class="btn peq pri" data-wa="enviarVendedor" data-id="${c.id}" title="${esc(nomeP(vc))} voltou e está disponível">Enviar para o vendedor: ${esc(nomeP(vc).split(' ')[0])}</button>`
      : `<small class="mut" title="Quando ele estiver disponível aparece o botão para enviar a conversa">Vendedor da carteira: ${esc(nomeP(vc))} (indisponível)</small>`) : '';
  const esp = waEsperaMin(c);
  return `<button class="wa-ic so-cel" data-wa="voltar" title="Voltar">${WA_IC.voltar}</button>${waAvatar(c, 'peq')}
    <div class="wa-cab-c" data-wa="ficha" title="Dados do cliente"><b>${esc(waNome(c))}</b>
      <small>${esc(waFone(c.telefone || c.wa_id))} · ${c.responsavel ? 'com ' + esc(nomeP(c.responsavel)) : '<span class="wa-tag med">sem dono</span>'}${c.status === 'encerrada' ? ' · encerrada' : ''}${esp != null ? ` · <span class="c-${waEsperaCls(esp)}">esperando há ${waEsperaTxt(esp)}</span>` : ''}</small></div>
    <div class="wa-cab-a">${carteira}${!meu ? `<button class="btn peq pri" data-wa="assumir" data-id="${c.id}">Assumir</button>` : ''}
      <button class="btn peq" data-wa="transferir" data-id="${c.id}">Transferir</button>
      ${c.status === 'aberta' ? `<button class="btn peq" data-wa="encerrar" data-id="${c.id}">Encerrar</button>` : ''}
      <button class="wa-ic" data-wa="ficha" title="Dados do cliente">${WA_IC.info}</button></div>`;
}
function waChatHtml() {
  const c = WA.conv.find(x => x.id === WA.aberta); if (!c) return waVazioHtml();
  const jan = waJanela(c);
  return `<header class="wa-cab" id="waCab">${waCabHtml(c)}</header>
    <div class="wa-corpo"><div class="wa-msgs" id="waMsgs"><p class="wa-nada">Carregando…</p></div><aside class="wa-ficha" id="waFicha"></aside></div>
    ${jan ? '' : '<div class="wa-janela">Mais de 24 h sem mensagem do cliente: a Meta só deixa mandar <b>modelo aprovado</b>. Por aqui, só nota interna até ele escrever de novo.</div>'}
    <footer class="wa-escrever ${WA.modoNota ? 'nota' : ''}" id="waEscrever">
      <div class="wa-sug" id="waSug" hidden></div>
      <button class="wa-ic" data-wa="respLista" title="Respostas prontas (ou digite /)">${WA_IC.raio}</button>
      <label class="wa-ic" title="Enviar foto ou arquivo">${WA_IC.clipe}<input type="file" id="waArq" hidden></label>
      <div class="wa-campo"><span class="wa-arq" id="waArqNome" hidden></span>
        <textarea id="waTexto" rows="1" placeholder="${WA.modoNota || !jan ? 'Nota interna (só a equipe vê)' : 'Mensagem  ·  digite / para respostas prontas'}">${esc(WA.rasc?.[c.id] || '')}</textarea></div>
      <button class="wa-ic ${WA.modoNota ? 'on' : ''}" data-wa="modoNota" title="Alternar mensagem / nota interna">${WA_IC.nota}</button>
      <button class="wa-mandar" data-wa="${WA.modoNota || !jan ? 'nota' : 'enviar'}" data-id="${c.id}" title="${WA.modoNota || !jan ? 'Salvar nota' : 'Enviar (Enter)'}">${WA.modoNota || !jan ? WA_IC.nota : WA_IC.enviar}</button>
    </footer>`;
}
async function waAbrir(id, redesenho) {
  id = +id; WA.aberta = id;
  if (!redesenho) {
    document.querySelectorAll('.wa-item').forEach(e => e.classList.toggle('on', +e.dataset.id === id));
    $('.wa-app')?.classList.add('com-chat');
    const ch = $('.wa-chat'); if (ch) ch.innerHTML = waChatHtml();
  }
  try { await waMensagens(id, true); } catch (e) { return avisar(e.message); }
  if (WA.aberta !== id) return;
  waDesenharMsgs(); waFicha(id); waAutoAltura();
  const c = WA.conv.find(x => x.id === id);
  if (c?.nao_lidas) sb.rpc('wa_lida', { p_id: id }).then(() => { c.nao_lidas = 0; waAtualizar(); });
}
/** Motivo da falha em português (códigos mais comuns da Meta); o texto original fica no title. */
function waErroPt(erro) {
  const e = String(erro || ''), cod = (e.match(/\b(\d{3,6})\b/) || [])[1];
  const M = { 131047: 'passaram mais de 24 h desde a última mensagem do cliente — só modelo aprovado', 131026: 'este número não tem WhatsApp ou não pode receber', 131051: 'tipo de mensagem não aceito', 131053: 'a Meta não aceitou o arquivo',
    190: 'o token da Meta expirou ou é inválido — avise o administrador', 131056: 'muitas mensagens seguidas para este número — espere um pouco', 131048: 'limite de envio atingido (qualidade do número) — espere', 131000: 'erro na Meta — tente de novo' };
  return M[cod] || e || 'motivo não informado';
}
/** Reenvia uma mensagem que falhou (só quando a pessoa clica). A original continua marcada como não entregue. */
async function waReenviar(msgId) {
  const id = WA.aberta, m = (WA.msgs[id] || []).find(x => x.id === +msgId); if (!m) return;
  const c = WA.conv.find(x => x.id === id); if (!c || !waJanela(c)) return avisar('Fora da janela de 24 h: só modelo aprovado. Espere o cliente escrever.');
  const corpo = { conversa: id, texto: m.texto || '' };
  if (m.midia_path && String(m.midia_path).startsWith(`saida/${EU.id}/`)) Object.assign(corpo, { midia_path: m.midia_path, midia_nome: m.midia_nome, midia_mime: m.midia_mime });
  if (!corpo.texto && !corpo.midia_path) return avisar('Não dá para reenviar este arquivo daqui: envie de novo pelo clipe.');
  try {
    const { data, error } = await sb.functions.invoke('whatsapp-enviar', { body: corpo });
    let e = data?.erro; if (error && !e) { try { e = (await error.context?.json())?.erro; } catch { /* sem detalhe */ } }
    if (error || !data?.ok) throw new Error(e || error?.message || 'Não foi possível enviar.');
    avisar('Reenviada.');
  } catch (e) { avisar(e.message); }
}
/** Uma mensagem no estilo WhatsApp (exportada para o teste). */
function waMsgHtml(m, lista) {
  if (m.direcao === 'nota') return m.tipo === 'evento' ? `<div class="wa-evento">${esc(nomeP(m.por))} ${esc(m.texto)} · ${waSoHora(m.em)}</div>`
    : `<div class="wa-nota"><b>Nota de ${esc(nomeP(m.por).split(' ')[0])}</b> ${esc(m.texto)} <time>${waSoHora(m.em)}</time></div>`;
  const cit = m.resposta_a ? (lista || []).find(x => x.wa_msg_id === m.resposta_a) : null;
  const citHtml = cit ? `<div class="wa-cit ${cit.direcao}"><b>${cit.direcao === 'saida' ? 'Você' : 'Cliente'}</b><span>${esc((cit.texto || `[${cit.tipo}]`).slice(0, 140))}</span></div>` : '';
  const midia = m.midia_path ? waMidiaHtml(m) : m.midia_id ? '<div class="wa-midia-esp">mídia sendo baixada…</div>' : '';
  const quem = m.direcao === 'saida' && m.por ? `<div class="wa-quem">${esc(waAssinatura(m.por))}</div>` : '';
  return `<div class="wa-msg ${m.direcao}"><div class="bolha ${m.midia_path && !m.texto && /^image|^video/.test(m.midia_mime || '') ? 'so-midia' : ''}">${quem}${citHtml}${midia}${m.texto ? `<span class="txt">${waTexto(m.texto)}</span>` : ''}
    <span class="wa-meta"><time>${waSoHora(m.em)}</time>${m.direcao === 'saida' ? waTick(m.status) : ''}</span>
    ${m.status === 'falhou' ? `<div class="wa-erro" title="${esc(m.erro || '')}">Não entregue: ${esc(waErroPt(m.erro))}${m.direcao === 'saida' && (m.texto || m.midia_path) ? ` <button class="wa-retry" data-wa="reenviar" data-id="${m.id}">Tentar de novo</button>` : ''}</div>` : ''}</div></div>`;
}
function waDesenharMsgs() {
  const el = $('#waMsgs'), lista = WA.msgs[WA.aberta]; if (!el || !lista) return;
  const embaixo = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  let dia = '';
  const mais = WA.temMais?.[WA.aberta] ? '<div class="wa-dia"><button class="wa-mais" data-wa="antigas">Carregar mensagens anteriores</button></div>' : '';
  el.innerHTML = mais + lista.map(m => { const d = new Date(m.em).toDateString(), sep = d !== dia ? `<div class="wa-dia"><span>${waDiaRot(m.em)}</span></div>` : ''; dia = d; return sep + waMsgHtml(m, lista); }).join('')
    || '<p class="wa-nada">Sem mensagens.</p>';
  if (!el.dataset.rolagem) { el.dataset.rolagem = '1'; el.addEventListener('scroll', () => { if (el.scrollTop < 40 && WA.temMais?.[WA.aberta]) waMaisAntigas(WA.aberta); }, { passive: true }); }
  if (embaixo || !el.dataset.rolou) { el.scrollTop = el.scrollHeight; el.dataset.rolou = '1'; }
  waCarregarMidias();
}
const waTexto = t => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1<i>$2</i>').replace(/~([^~\n]+)~/g, '<s>$1</s>').replace(/\n/g, '<br>');
function waMidiaHtml(m) {
  const t = (m.midia_mime || '').split('/')[0];
  return `<div class="wa-midia" data-path="${esc(m.midia_path)}" data-tipo="${t}" data-nome="${esc(m.midia_nome || 'arquivo')}"><div class="wa-midia-esp">carregando ${t === 'image' ? 'foto' : t === 'audio' ? 'áudio' : t === 'video' ? 'vídeo' : 'arquivo'}…</div></div>`;
}
/** Mídias ficam em bucket privado: gera link assinado (1 h) e guarda na memória. */
async function waCarregarMidias() {
  for (const el of document.querySelectorAll('.wa-midia[data-path]:not([data-ok])')) {
    el.dataset.ok = '1';
    const p = el.dataset.path;
    if (!WA.urls[p]) { const { data } = await sb.storage.from('whatsapp').createSignedUrl(p, 3600); WA.urls[p] = data?.signedUrl; }
    const u = WA.urls[p]; if (!u) { el.innerHTML = '<div class="wa-midia-esp">arquivo indisponível</div>'; continue; }
    const t = el.dataset.tipo, nome = el.dataset.nome, ext = (nome.split('.').pop() || '').slice(0, 4).toUpperCase();
    el.innerHTML = t === 'image' ? `<img src="${u}" alt="foto" loading="lazy" data-wa="foto" data-u="${esc(u)}">`
      : t === 'audio' ? `<audio controls preload="metadata" src="${u}"></audio><div class="wa-vel">${[1, 1.5, 2].map(v => `<button data-wa="vel" data-v="${v}" class="${v === 1 ? 'on' : ''}">${v}×</button>`).join('')}</div>`
      : t === 'video' ? `<video controls preload="metadata" src="${u}"></video>`
      : `<a class="wa-doc" href="${u}" target="_blank" rel="noopener"><span class="wa-doc-ic">${esc(ext || 'DOC')}</span><span>${esc(nome)}</span></a>`;
  }
}
async function waFicha(id) {
  const el = $('#waFicha'); if (!el) return;
  const c = WA.conv.find(x => x.id === id);
  let f = null; try { f = await ok(sb.rpc('wa_ficha', { p_id: id })); } catch { /* sem ficha */ }
  if (WA.aberta !== id) return;
  const topoF = `<div class="wa-ficha-topo">${waAvatar(c || {}, 'grande')}<h3>${esc(f?.nome || waNome(c || {}))}</h3><small>${esc(waFone(c?.telefone || c?.wa_id))}</small></div>`;
  el.innerHTML = topoF + (f ? `<small class="mut">${esc([f.doc, [f.cidade, f.uf].filter(Boolean).join('/')].filter(Boolean).join(' · '))}</small>
      ${f.nao_contatar ? '<p class="c-ruim">Pediu para não ser contatado.</p>' : ''}
      <dl class="wa-dl"><dt>Vendedor</dt><dd>${esc(f.vendedor || '—')}</dd><dt>Comprou em 12 meses</dt><dd>${R(f.total_12m)}</dd></dl>
      <h4>Últimos pedidos</h4>${f.pedidos.length ? f.pedidos.map(p => `<div class="wa-ped"><b>${esc(p.numero)}</b> <span>${fmtCurta(p.data)}</span> <span class="v">${R(p.valor)}</span><small>${esc(p.situacao || '')}${p.canal ? ' · ' + esc(p.canal) : ''}</small></div>`).join('') : '<p class="mut">Nenhum.</p>'}
      <div class="acoes"><button class="btn peq" data-wa="fichaCompleta" data-chave="${esc(f.chave)}">Abrir ficha</button><button class="btn peq" data-wa="ligarCliente" data-id="${id}">Trocar</button></div>`
    : `<p class="mut">Este número não está em nenhum cliente do Tiny.</p><button class="btn peq" data-wa="ligarCliente" data-id="${id}">Ligar a um cliente</button>`);
}

// ─── respostas prontas com "/" ───
function waSugestoes(q) {
  q = String(q || '').toLowerCase().trim();
  const sem = x => x.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  q = sem(q);
  const porNome = WA.resp.filter(r => !q || sem(r.atalho).includes(q));   // primeiro pelo nome; se nada, procura no texto
  return (porNome.length || q.length < 3 ? porNome : WA.resp.filter(r => sem(r.texto).includes(q))).slice(0, 8);
}
function waMostrarSug() {
  const ta = $('#waTexto'), box = $('#waSug'); if (!ta || !box) return;
  const m = ta.value.match(/^\/(.*)$/s);
  if (!m && !WA.sugForcada) { box.hidden = true; return; }
  const l = waSugestoes(m ? m[1] : ''); WA.sugIdx = Math.min(WA.sugIdx || 0, Math.max(0, l.length - 1));
  const c = WA.conv.find(x => x.id === WA.aberta);
  box.innerHTML = (l.length ? l.map((r, i) => `<button class="${i === WA.sugIdx ? 'on' : ''}" data-wa="respUsar" data-id="${r.id}"><b>/${esc(r.atalho)}</b><span>${esc(waVariaveis(r.texto, c).slice(0, 110))}</span></button>`).join('')
    : `<p>${WA.resp.length ? 'Nenhuma resposta com esse nome.' : 'Nenhuma resposta pronta ainda.'} <a href="#" data-wa="respostas">Cadastrar</a></p>`);
  box.hidden = false;
}
function waUsarResposta(id) {
  const r = WA.resp.find(x => x.id === +id), ta = $('#waTexto'); if (!r || !ta) return;
  const c = WA.conv.find(x => x.id === WA.aberta), txt = waVariaveis(r.texto, c);
  ta.value = /^\//.test(ta.value) || !ta.value.trim() ? txt : ta.value + '\n' + txt;
  (WA.rasc ||= {})[WA.aberta] = ta.value; WA.sugForcada = false; $('#waSug').hidden = true; waAutoAltura(); ta.focus();
}
function waAutoAltura() { const ta = $('#waTexto'); if (!ta) return; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; }

// ─── ações ───
async function waEnviar(id) {
  const ta = $('#waTexto'), texto = ta.value.trim(), arq = $('#waArq')?.files?.[0];
  if (!texto && !arq) return;
  const b = document.querySelector('.wa-mandar'); if (b) b.disabled = true;
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
    ta.value = ''; if (WA.rasc) delete WA.rasc[id]; if ($('#waArq')) $('#waArq').value = ''; waArqRotulo(); waAutoAltura();
  } catch (e) { avisar(e.message); }
  if (b) b.disabled = false; ta.focus();
}
async function waNota(id) {
  const ta = $('#waTexto'), t = ta.value.trim(); if (!t) return avisar('Escreva a nota no campo de mensagem.');
  try { await ok(sb.rpc('wa_nota', { p_id: id, p_texto: t })); ta.value = ''; if (WA.rasc) delete WA.rasc[id]; waAutoAltura(); } catch (e) { avisar(e.message); }
}
async function waAcao(fn, args, msg) {
  try { await ok(sb.rpc(fn, args)); if (msg) avisar(msg); } catch (e) { avisar(e.message); }
}
function waTransferir(id) {
  const quem = D.pessoas.filter(p => p.ativo && (p.papel === 'dono' || p.permissoes?.atendimento));
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Transferir conversa</h2>
    <label class="campo">Para<select id="waPara"><option value="">Devolver para a fila (sem dono)</option>${quem.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>
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
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Respostas prontas</h2>
    <p class="explica">Na conversa, digite <b>/</b> e o nome para inserir. Use <b>{nome}</b> (primeiro nome do cliente), <b>{vendedor}</b> (seu nome) e <b>{saudacao}</b> (bom dia / boa tarde / boa noite).</p>
    ${WA.resp.length ? '' : '<div class="acoes"><button class="btn pri" data-wa="respPacote">Criar pacote inicial (7 respostas)</button></div>'}
    <table class="tabela"><tbody>${WA.resp.map(r => `<tr><td><b>/${esc(r.atalho)}</b><br><small style="white-space:pre-wrap">${esc(r.texto)}</small></td><td class="dir"><button class="btn peq perigo" data-wa="respApagar" data-id="${r.id}">Apagar</button></td></tr>`).join('') || '<tr><td class="mut">Nenhuma ainda.</td></tr>'}</tbody></table>
    <h3 class="mt2">Nova</h3><label class="campo">Nome curto<input id="waRAtalho" maxlength="40" placeholder="ex.: endereço da loja"></label>
    <label class="campo">Texto<textarea id="waRTexto" rows="4" maxlength="2000" placeholder="{saudacao}, {nome}! …"></textarea></label>
    <div class="acoes"><button class="btn pri" data-wa="respSalvar">Salvar</button></div>`, true);
}
/** Texto do painel de saúde (exportado para o teste). */
function waSaudeLinhas(ultEntrada, ultEnvio, nFalhas, nMidias, agora = Date.now()) {
  const horas = ultEntrada ? (agora - new Date(ultEntrada)) / 36e5 : null;
  return [
    { ok: horas != null && horas < 12, tit: 'Recebimento', txt: ultEntrada ? `Última mensagem recebida ${waHora(ultEntrada)}${horas >= 12 ? ' — mais de 12 h sem nada: confira o webhook' : ''}` : 'Nenhuma mensagem recebida ainda' },
    { ok: !!ultEnvio, tit: 'Envio', txt: ultEnvio ? `Último envio com sucesso ${waHora(ultEnvio)}` : 'Nenhum envio com sucesso ainda' },
    { ok: !nFalhas, tit: 'Falhas de envio (24 h)', txt: nFalhas ? `${nFalhas} mensagem(ns) não entregue(s)` : 'Nenhuma' },
    { ok: !nMidias, tit: 'Mídias sem arquivo (24 h)', txt: nMidias ? `${nMidias} foto/áudio/arquivo não baixado(s) — se continuar, o token pode ter vencido` : 'Todas baixadas' },
  ];
}
/** Dono: saúde do WhatsApp nas últimas 24 h (recebimento, falhas de envio, mídias sem arquivo). */
async function waSaude() {
  const desde = new Date(Date.now() - 864e5).toISOString(), q = () => sb.from('wa_mensagens');
  let r;
  try {
    r = await Promise.all([
      ok(q().select('em').eq('direcao', 'entrada').order('em', { ascending: false }).limit(1)),
      ok(q().select('em').eq('direcao', 'saida').neq('status', 'falhou').order('em', { ascending: false }).limit(1)),
      ok(q().select('id,conversa_id,erro,em').eq('status', 'falhou').gte('em', desde).order('em', { ascending: false }).limit(20)),
      ok(q().select('id,conversa_id,tipo,em').not('midia_id', 'is', null).is('midia_path', null).gte('em', desde).limit(20)),
    ]);
  } catch (e) { return avisar(e.message); }
  const [ent, sai, falhas, midias] = r;
  const nomeC = id => esc(waNome(WA.conv?.find(c => c.id === id) || { wa_id: '#' + id }));
  const tab = (l, col) => `<table class="tabela"><tbody>${l.map(f => `<tr class="clic" data-wa="abrirDaSaude" data-id="${f.conversa_id}"><td>${nomeC(f.conversa_id)}</td><td><small>${esc(col(f))}</small></td><td class="dir"><small>${waHora(f.em)}</small></td></tr>`).join('')}</tbody></table>`;
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Saúde do WhatsApp</h2>
    <div class="wa-saude">${waSaudeLinhas(ent[0]?.em, sai[0]?.em, falhas.length, midias.length).map(x => `<div class="wa-saude-l"><span class="wa-saude-p ${x.ok ? 'ok' : 'ruim'}"></span><div><b>${x.tit}</b><small>${x.txt}</small></div></div>`).join('')}</div>
    ${falhas.length ? `<h3 class="mt2">Falhas recentes</h3>${tab(falhas, f => waErroPt(f.erro))}` : ''}
    ${midias.length ? `<h3 class="mt2">Mídias pendentes</h3>${tab(midias, f => f.tipo)}` : ''}`, true);
}
async function waConfig() {
  let info = null; try { info = await ok(sb.rpc('wa_webhook_info')); } catch (e) { avisar(e.message); }
  const c = WA.cfg || {}, url = `${window.CRM_CONFIG.url}/functions/v1/whatsapp-webhook`;
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Ligar o WhatsApp à Meta</h2>
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
function waArqRotulo() { const f = $('#waArq')?.files?.[0], l = $('#waArqNome'); if (l) { l.hidden = !f; l.innerHTML = f ? `${esc(f.name.slice(0, 40))} <a href="#" data-wa="arqTirar" title="Tirar">✕</a>` : ''; } }

const WA_ACOES = {
  aba: el => { WA.aba = el.dataset.v; const a = $('#waAbas'), l = $('#waLista'); if (a && l) { a.innerHTML = waAbasHtml(); l.innerHTML = waListaHtml(); } else render(); },
  abrir: el => waAbrir(el.dataset.id),
  voltar: () => { WA.aberta = null; $('.wa-app')?.classList.remove('com-chat'); const ch = $('.wa-chat'); if (ch) ch.innerHTML = waVazioHtml(); document.querySelectorAll('.wa-item.on').forEach(e => e.classList.remove('on')); },
  ficha: () => { WA.fichaAberta = !WA.fichaAberta; $('.wa-app')?.classList.toggle('com-ficha', WA.fichaAberta); },
  enviar: el => waEnviar(+el.dataset.id),
  nota: el => waNota(+el.dataset.id),
  modoNota: () => { WA.modoNota = !WA.modoNota; const ch = $('.wa-chat'), ta = $('#waTexto'), v = ta?.value; if (ch) { ch.innerHTML = waChatHtml(); waDesenharMsgs(); waFicha(WA.aberta); const t = $('#waTexto'); if (t) { t.value = v || ''; t.focus(); waAutoAltura(); } } },
  respLista: () => { WA.sugForcada = !WA.sugForcada; WA.sugIdx = 0; waMostrarSug(); },
  respUsar: el => waUsarResposta(el.dataset.id),
  foto: el => modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><img class="wa-foto-grande" src="${esc(el.dataset.u)}" alt="foto"><div class="acoes mt"><a class="btn" href="${esc(el.dataset.u)}" target="_blank" rel="noopener">Abrir em nova aba</a></div>`, true),
  vel: el => { const a = el.closest('.wa-midia')?.querySelector('audio'); if (a) a.playbackRate = +el.dataset.v; el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); },
  arqTirar: () => { if ($('#waArq')) $('#waArq').value = ''; waArqRotulo(); },
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
    const a = $('#waRAtalho').value.trim().replace(/^\//, ''), t = $('#waRTexto').value.trim(); if (!a || !t) return avisar('Preencha o nome e o texto.');
    try { WA.resp.push(await ok(sb.from('wa_respostas').insert({ atalho: a, texto: t, criado_por: EU.id }).select().single())); WA.resp.sort((x, y) => x.atalho.localeCompare(y.atalho)); waRespostas(); } catch (e) { avisar(e.message); }
  },
  respPacote: async () => {
    try { WA.resp = await ok(sb.from('wa_respostas').insert(WA_PACOTE.map(([atalho, texto]) => ({ atalho, texto, criado_por: EU.id }))).select()); WA.resp.sort((x, y) => x.atalho.localeCompare(y.atalho)); waRespostas(); avisar('Pacote criado. Edite à vontade.'); } catch (e) { avisar(e.message); }
  },
  respApagar: async el => { if (!confirm('Apagar esta resposta pronta?')) return; try { await ok(sb.from('wa_respostas').delete().eq('id', +el.dataset.id)); WA.resp = WA.resp.filter(r => r.id !== +el.dataset.id); waRespostas(); } catch (e) { avisar(e.message); } },
  notif: async () => { try { await Notification.requestPermission(); } catch { /* ok */ } render(); },
  config: () => waConfig(),
  saude: () => waSaude(),
  abrirDaSaude: el => { fecharModal(); const c = WA.conv.find(x => x.id === +el.dataset.id); WA.aba = c?.status === 'encerrada' ? 'encerradas' : 'equipe'; WA.aberta = +el.dataset.id; render(); },
  antigas: () => waMaisAntigas(WA.aberta),
  reenviar: el => { el.disabled = true; waReenviar(el.dataset.id).finally(() => { el.disabled = false; }); },
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
document.addEventListener('click', e => { const el = e.target.closest?.('[data-wa]'); if (el && WA_ACOES[el.dataset.wa]) { e.preventDefault(); WA_ACOES[el.dataset.wa](el, e); } });
document.addEventListener('input', e => {
  if (e.target.id === 'waBusca') { WA.busca = e.target.value; const l = $('#waLista'), a = $('#waAbas'); if (l) l.innerHTML = waListaHtml(); if (a) a.innerHTML = waAbasHtml(); }
  if (e.target.id === 'waTexto' && WA.aberta) { (WA.rasc ||= {})[WA.aberta] = e.target.value; WA.sugIdx = 0; waMostrarSug(); waAutoAltura(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'waArq') waArqRotulo();
  if (e.target.dataset?.waAssin) {
    const p = e.target.dataset.waAssin, v = e.target.value.trim();
    waAcao('wa_atendente_assinatura', { p_pessoa: p, p_texto: v }, 'Perfil salvo.').then(() => { const a = WA.equipe?.find(x => x.pessoa === p); if (a) a.assinatura = v || null; else (WA.equipe ||= []).push({ pessoa: p, assinatura: v || null, setores: ['vendas'], estado: 'fora' }); });
  }
  if (e.target.dataset?.waSetor) {
    const p = e.target.dataset.waSetor, setores = [...document.querySelectorAll(`[data-wa-setor="${p}"]:checked`)].map(x => x.value);
    waAcao('wa_atendente_cfg', { p_pessoa: p, p_setores: setores }, 'Setores salvos.');
  }
});
if (typeof setInterval === 'function') {
  setInterval(waPing, 30e3); setTimeout(waPing, 5e3);   // sinal de presença do expediente
  setInterval(() => { if (typeof UI !== 'undefined' && UI.view === 'atendimento' && WA.conv) waAtualizar(); }, 60e3);   // tempo de espera anda sozinho
}
document.addEventListener('keydown', e => {
  if (e.target.id !== 'waTexto' || !WA.aberta) return;
  const box = $('#waSug'), abertas = box && !box.hidden ? [...box.querySelectorAll('[data-wa="respUsar"]')] : [];
  if (abertas.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); WA.sugIdx = (WA.sugIdx + (e.key === 'ArrowDown' ? 1 : abertas.length - 1)) % abertas.length; waMostrarSug(); return; }
  if (abertas.length && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); waUsarResposta(abertas[WA.sugIdx || 0].dataset.id); return; }
  if (e.key === 'Escape' && box && !box.hidden) { WA.sugForcada = false; box.hidden = true; return; }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const c = WA.conv.find(x => x.id === WA.aberta); if (WA.modoNota || !(c && waJanela(c))) waNota(WA.aberta); else waEnviar(WA.aberta); }
});
