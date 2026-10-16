'use strict';
/* Intranet Protemaxxi — TV do estoque: tela cheia para a segunda tela/TV do Fefão.
   Mostra o pedido da vez (balcão primeiro), a fila e os que esperam aprovação de pagamento; toca um sino a cada pedido novo. */

const TV = { som: false, vistos: null, ultimoSino: {}, timer: null, wake: null, carregando: false, erro: '' };
const TV_REPETIR_MIN = 10;   // pedido parado sem ninguém pegar: o sino toca de novo a cada 10 min

/** Sino de duas notas gerado no navegador (não precisa de arquivo de som). */
function tocarSino() {
  if (!TV.som) return;
  try {
    const ctx = TV.audio ||= new (window.AudioContext || window.webkitAudioContext)();
    [[0, 1318.5], [0.28, 987.8], [0.9, 1318.5], [1.18, 987.8]].forEach(([t, f]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const ini = ctx.currentTime + t;
      g.gain.setValueAtTime(0.0001, ini); g.gain.exponentialRampToValueAtTime(0.6, ini + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ini + 0.9);
      o.start(ini); o.stop(ini + 0.95);
    });
  } catch { /* sem áudio */ }
}

/** Fila da TV: o que falta separar (balcão primeiro, por ordem de chegada; depois envios/marketplace pelo prazo). */
function filaTV() {
  const todos = EXP.ecom.map(infoPedido).filter(x => !x.despachado);
  const separar = todos.filter(x => x.etapa === 'a_separar').sort((a, b) => (b.loja - a.loja) || ((a.loja ? new Date(a.base || 0) - new Date(b.base || 0) : (a.prazo || 9e15) - (b.prazo || 9e15))));
  const andamento = todos.filter(x => ['separado', 'conferido'].includes(x.etapa));
  const pagamento = todos.filter(x => x.pagPendente);
  return { separar, andamento, pagamento };
}

async function atualizarTV(primeira) {
  if (TV.carregando) return;
  TV.carregando = true;
  try {
    await carregarExp(true, true);
    TV.erro = '';
    const { separar } = filaTV();
    const ids = new Set(separar.map(x => x.p.id));
    if (TV.vistos && [...ids].some(id => !TV.vistos.has(id))) { tocarSino(); TV.pisca = Date.now(); }
    // lembrete: o pedido da vez parado há mais de 10 min sem ninguém pegar
    const vez = separar[0];
    if (vez && !primeira) {
      const esperando = (Date.now() - new Date(vez.base || Date.now())) / 60000, ult = TV.ultimoSino[vez.p.id] || 0;
      if (esperando > TV_REPETIR_MIN && Date.now() - ult > TV_REPETIR_MIN * 60000) { if (ult) tocarSino(); TV.ultimoSino[vez.p.id] = Date.now(); }
    }
    TV.vistos = ids;
  } catch (e) { TV.erro = e.message; }
  finally { TV.carregando = false; if (UI.view === 'tvestoque') render(); }
}

async function ativarTV() {
  TV.som = true;
  try { TV.audio ||= new (window.AudioContext || window.webkitAudioContext)(); await TV.audio.resume(); } catch { /* ok */ }
  tocarSino();
  try { TV.wake = await navigator.wakeLock?.request('screen'); } catch { /* sem wake lock */ }
  document.documentElement.requestFullscreen?.().catch(() => {});
  render();
}
document.addEventListener('visibilitychange', async () => { if (TV.som && document.visibilityState === 'visible') { try { TV.wake = await navigator.wakeLock?.request('screen'); } catch { /* ok */ } } });

const tempoEspera = d => { const m = Math.max(0, Math.round((Date.now() - new Date(d)) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
function cartaoTV(x, grande) {
  const { p } = x, its = EXP.itens[p.id] || [];
  const tag = x.loja ? '<span class="tvtag balcao">BALCÃO</span>' : x.envioLoja ? `<span class="tvtag envio">ENVIO · ${esc(p.envio_forma || '')}</span>` : `<span class="tvtag mkt">${esc(nomeCanal(x.canal))}</span>`;
  return `<div class="tvcard ${grande ? 'grande' : ''} ${x.loja ? 'b' : ''} ${x.atrasado ? 'atr' : ''}">
    <div class="tvcab"><div><span class="tvnum">#${esc(p.numero || '')}</span> ${tag}</div>
      <div class="tvtempo">${x.loja ? '⏱ esperando ' + tempoEspera(x.base || p.data) : x.prazo ? (x.atrasado ? '⚠ ATRASADO · ' : 'despachar até ') + dataHora(x.prazo) : ''}</div></div>
    <div class="tvcli">${esc(p.cliente_nome || '')}${p.vendedor_nome ? ` <small>· vendedor ${esc(p.vendedor_nome)}</small>` : ''}</div>
    <table class="tvitens">${its.map(i => { const pr = EXP.prod[String(i.produto_id)];
      return `<tr><td class="q">${N(i.quantidade)}×</td><td><b>${esc(i.codigo || '')}</b> ${esc(i.descricao || '')}</td><td class="loc">${pr ? '📍 ' + esc(pr.localizacao || pr.unidade || '—') : ''}</td></tr>`; }).slice(0, grande ? 30 : 4).join('') || '<tr><td>Carregando itens do Tiny…</td></tr>'}
      ${!grande && its.length > 4 ? `<tr><td></td><td class="mais">+ ${its.length - 4} item(ns)</td><td></td></tr>` : ''}</table>
    ${x.loja && grande ? `<div class="tvcobrar">A cobrar: <b>${R(p.valor)}</b> · ${esc(p.pag_forma || p.forma_pagamento || '')}${x.e.pagamento_aprovado_em ? ' · ✓ pagamento aprovado' : ''}</div>` : ''}
  </div>`;
}

function vTVEstoque() {
  if (!EXP) { atualizarTV(true); return '<div class="tvvazio">Carregando a separação…</div>'; }
  if (!TV.timer) { TV.timer = setInterval(() => { if (UI.view === 'tvestoque' && !document.hidden) atualizarTV(); }, 20000); atualizarTV(true); }
  const { separar, andamento, pagamento } = filaTV();
  const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const pisca = TV.pisca && Date.now() - TV.pisca < 8000;
  return `<div class="tv ${pisca ? 'pisca' : ''}">
    <div class="tvtopo"><div class="tvtit">📦 Separação · Protemaxxi</div>
      <div class="tvcont"><span><b>${separar.length}</b> a separar</span><span><b>${separar.filter(x => x.loja).length}</b> no balcão</span><span><b>${andamento.length}</b> em andamento</span><span><b>${pagamento.length}</b> aguardando pagamento</span></div>
      <div class="tvhora">${agora}</div></div>
    ${TV.som ? '' : '<button class="btn pri tvativar" data-a="tvAtivar">🔔 Clique aqui para ativar o som e a tela cheia</button>'}
    ${TV.erro ? `<div class="alerta ruim">Sem conexão: ${esc(TV.erro)} · tentando de novo…</div>` : ''}
    ${separar.length ? `<div class="tvvez"><div class="tvrot">AGORA</div>${cartaoTV(separar[0], true)}</div>
      ${separar.length > 1 ? `<div class="tvrot">PRÓXIMOS</div><div class="tvfila">${separar.slice(1, 9).map(x => cartaoTV(x)).join('')}</div>` : ''}`
      : '<div class="tvvazio">✅ Nenhum pedido para separar agora.</div>'}
    ${andamento.length ? `<div class="tvrot">EM ANDAMENTO</div><div class="tvchips">${andamento.map(x => `<span>#${esc(x.p.numero)} · ${ETAPA_EXP[x.etapa][0]}</span>`).join('')}</div>` : ''}
    ${pagamento.length ? `<div class="tvrot">AGUARDANDO APROVAÇÃO DO PAGAMENTO</div><div class="tvchips">${pagamento.map(x => `<span>#${esc(x.p.numero)} · ${esc(x.p.pag_forma || '')} · ${R(x.p.valor)}</span>`).join('')}</div>` : ''}
    <div class="tvrodape">Atualiza sozinha a cada 20 s · marque "Separado" e "Cobrado e entregue" no celular, na tela Expedição</div>
  </div>`;
}
