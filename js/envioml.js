'use strict';
/* Intranet Protemaxxi — Horário de envio do Mercado Livre: faixa com contagem regressiva (Expedição, tela do ML e TV)
   e alarmes de 1 h, 30 min e 15 min antes da postagem, só quando ainda há pedido do ML para despachar.
   Agenda (corte e horário de postagem de cada dia) e prazo de cada envio vêm do ML pela função ml-sync. */

const ENVML = { agenda: null, pedidos: [], em: 0, carregando: false, audio: null };
const ALARMES_ML = [60, 30, 15];
const DIAS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DIAS_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const veEnvioML = () => !!EU && (veML() || veExp());
// já postado na agência/coletado (o ML ainda mostra ready_to_ship até sair do centro de distribuição)
const SUB_POSTADO = ['dropped_off', 'in_hub', 'picked_up', 'in_packing_list', 'in_warehouse', 'authorized_by_carrier', 'in_transit'];
const PENDENTE_ML = p => ['handling', 'ready_to_ship'].includes(p.envio_status) && !SUB_POSTADO.includes(p.envio_substatus) && p.status !== 'cancelled';

async function carregarEnvioML(forcar) {
  if (ENVML.carregando || (!forcar && Date.now() - ENVML.em < 110e3)) return;
  ENVML.carregando = true;
  try {
    const desde = new Date(Date.now() - 20 * 864e5).toISOString();
    const [ag, peds] = await Promise.all([
      sb.from('sync_estado').select('valor').eq('chave', 'ml_agenda').maybeSingle().then(r => r.data?.valor || null),
      todas(() => sb.from('ml_pedidos').select('id,pack_id,envio_id,status,envio_status,envio_substatus,envio_modo,prazo_despacho,comprador,itens,total,data').gte('data', desde).in('envio_status', ['handling', 'ready_to_ship'])),
    ]);
    ENVML.agenda = ag; ENVML.pedidos = peds.filter(PENDENTE_ML); ENVML.em = Date.now();
  } finally { ENVML.carregando = false; }
}

/** Horário de postagem de um dia (pela agenda do ML) como Date, ou null se não há envio nesse dia. */
function horarioDoDia(dataStr) {
  const tipos = Object.values(ENVML.agenda?.agendas || {});
  const dia = DIAS_EN[pd(dataStr).getDay()];
  const d = tipos.map(t => t[dia]).find(x => x?.trabalha && x.envio);
  if (!d) return null;
  return { hora: new Date(`${dataStr}T${d.envio}:00-03:00`), corte: d.corte, envio: d.envio };
}
/** Situação do envio de hoje: horário, pendentes (com prazo até hoje), atrasados e o próximo dia de postagem. */
function situacaoEnvioML() {
  const h = hojeSP(), agora = Date.now();
  const fimHoje = new Date(`${h}T23:59:59-03:00`).getTime();
  const pend = ENVML.pedidos.filter(p => !p.prazo_despacho || new Date(p.prazo_despacho).getTime() <= fimHoje);
  const atrasados = ENVML.pedidos.filter(p => p.prazo_despacho && new Date(p.prazo_despacho).getTime() < agora);
  // o prazo de cada envio (SLA do ML) manda; a agenda da conta só completa quando não há prazo
  const prazoDia = d => { const t = Math.min(...ENVML.pedidos.filter(p => p.prazo_despacho && dataSP(p.prazo_despacho) === d).map(p => new Date(p.prazo_despacho).getTime())); return isFinite(t) ? new Date(t) : null; };
  const doDia = d => { const ag = horarioDoDia(d), pz = prazoDia(d); return pz ? { ...(ag || {}), hora: pz, envio: hm(pz) } : ag; };
  const hj = doDia(h);
  let prox = null;
  for (let i = 1; i <= 7 && !prox; i++) { const d = addDias(h, i); const x = doDia(d); if (x) prox = { ...x, dia: DIAS_PT[pd(d).getDay()] }; }
  const falta = hj ? Math.round((hj.hora - agora) / 60000) : null;
  const porSub = k => pend.filter(p => p.envio_substatus === k).length;
  return { hj, prox, pend, atrasados, falta, semNF: porSub('invoice_pending'), imprimir: porSub('ready_to_print'), impressas: porSub('printed'), outros: pend.filter(p => !['invoice_pending', 'ready_to_print', 'printed'].includes(p.envio_substatus)).length };
}
const fmtFalta = m => m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
const hm = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Faixa com a contagem regressiva (id fixo: o relógio atualiza só ela, sem redesenhar a tela). */
function faixaEnvioML(grande) {
  if (!veEnvioML()) return '';
  if (!ENVML.em) { carregarEnvioML().then(atualizarFaixaML).catch(() => {}); return `<div id="faixaEnvioML" class="faixa-ml"></div>`; }
  return `<div id="faixaEnvioML" class="faixa-ml ${grande ? 'grande' : ''}">${conteudoFaixaML()}</div>`;
}
function conteudoFaixaML() {
  const s = situacaoEnvioML();
  const partes = [s.semNF && `🧾 ${s.semNF} sem NF`, s.imprimir && `🏷 ${s.imprimir} etiqueta(s) para imprimir`, s.impressas && `📦 ${s.impressas} para postar`, s.outros && `⏳ ${s.outros} em preparação`].filter(Boolean).join(' · ');
  const ativar = typeof Notification !== 'undefined' && Notification.permission === 'default' ? '<button class="btn peq" data-a="alarmeMLAtivar">🔔 Ativar alarmes</button>' : '';
  const prox = s.prox ? `Próxima postagem: ${s.prox.dia} às ${s.prox.envio}` : '';
  if (!s.hj) return `<div class="faixa-ml-in neutro"><span class="ic">🚚</span><div><b>Hoje não tem postagem do Mercado Livre.</b><br><small>${prox}${s.pend.length ? ` · ${s.pend.length} pedido(s) já podem ser preparados` : ''}</small></div>${ativar}</div>`;
  if (!s.pend.length) return `<div class="faixa-ml-in ok"><span class="ic">✅</span><div><b>Postagem ML de hoje às ${hm(s.hj.hora)}: tudo pronto.</b><br><small>Nenhum pedido do ML pendente para hoje.${s.hj.corte ? ` Vendas até ${s.hj.corte} entram na postagem de hoje.` : ''}</small></div>${ativar}</div>`;
  const f = s.falta, cls = f < 0 ? 'atrasado' : f <= 15 ? 'r' : f <= 30 ? 'l' : f <= 60 ? 'a' : 'neutro';
  return `<div class="faixa-ml-in ${cls}"><span class="ic">🚚</span><div><b>${f < 0 ? `POSTAGEM ML ATRASADA desde ${hm(s.hj.hora)}` : `Postagem ML hoje às ${hm(s.hj.hora)}`}</b>
      <br><small>${s.pend.length} pedido(s) para hoje${partes ? ': ' + partes : ''}${s.hj.corte ? ` · vendas até ${s.hj.corte} entram hoje` : ''}</small></div>
    <div class="faixa-ml-tempo">${f < 0 ? '⚠' : fmtFalta(f)}<small>${f < 0 ? 'atrasado' : 'faltam'}</small></div>${ativar}</div>`;
}
function atualizarFaixaML() { const el = document.getElementById('faixaEnvioML'); if (el) el.innerHTML = conteudoFaixaML(); }

/** Som do alarme: três bipes fortes (WebAudio, sem arquivo). Precisa de um clique na página antes (regra do navegador). */
function somAlarmeML() {
  try {
    const ctx = ENVML.audio ||= new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume?.();
    [0, 0.35, 0.7, 1.3, 1.65, 2.0].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      const i = ctx.currentTime + t; g.gain.setValueAtTime(0.0001, i); g.gain.exponentialRampToValueAtTime(0.25, i + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, i + 0.25);
      o.start(i); o.stop(i + 0.3);
    });
  } catch { /* sem áudio */ }
}
document.addEventListener('click', () => { try { ENVML.audio ||= new (window.AudioContext || window.webkitAudioContext)(); ENVML.audio.resume?.(); } catch { /* ok */ } }, { once: true });

function checarAlarmesML() {
  if (!veEnvioML() || !ENVML.em) return;
  const s = situacaoEnvioML();
  atualizarFaixaML();
  if (!s.hj || !s.pend.length || s.falta == null) return;
  if (s.falta < -5) return;
  // a faixa atual é o menor limite já alcançado (15, 30 ou 60 min); os limites maiores contam como já avisados
  const t = [...ALARMES_ML].sort((a, b) => a - b).find(x => s.falta <= x);
  if (t == null) return;
  const chave = `alarmeML:${hojeSP()}:${t}`;
  let ja = false;
  try { ja = !!localStorage.getItem(chave); for (const x of ALARMES_ML) if (x >= t) localStorage.setItem(`alarmeML:${hojeSP()}:${x}`, '1'); } catch { /* sem armazenamento */ }
  if (ja) return;
  const msg = `${t === 15 ? '🚨' : '⏰'} Postagem do Mercado Livre ${s.falta > 0 ? `em ${fmtFalta(s.falta)}` : 'agora'} (${hm(s.hj.hora)}): ${s.pend.length} pedido(s) ainda pendente(s).`;
  somAlarmeML(); avisar(msg);
  try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('Mercado Livre: horário de envio', { body: msg, tag: chave, requireInteraction: t === 15 }); } catch { /* ok */ }
}
async function alarmeMLAtivar() {
  try { const r = await Notification.requestPermission(); avisar(r === 'granted' ? '🔔 Alarmes ativados: você recebe aviso 1 h, 30 min e 15 min antes da postagem do ML.' : 'Notificações bloqueadas no navegador. O alarme toca só com a Intranet aberta.'); } catch { /* ok */ }
  somAlarmeML(); atualizarFaixaML();
}
// relógio: atualiza a faixa a cada 30 s e os dados a cada ~2 min (só para quem vê ML ou Expedição)
setInterval(() => {
  if (!veEnvioML()) return;
  carregarEnvioML().then(checarAlarmesML).catch(() => {});
  checarAlarmesML();
}, 30e3);

// ─── aba "Mercado Livre" da Expedição: tudo do ML numa tela só para o Fefão ───
function abaMLExp(todos) {
  if (!ENVML.em) carregarEnvioML().then(render).catch(() => {});
  const doML = todos.filter(x => x.ml);
  const ligados = new Set(doML.map(x => String(x.ml.id)));
  const foraTiny = ENVML.pedidos.filter(p => !ligados.has(String(p.id)));
  const lote = doML.filter(x => !x.despachado && x.ml.envio_status === 'ready_to_ship' && x.ml.envio_substatus === 'ready_to_print').map(x => x.ml.envio_id);
  const reimp = doML.filter(x => !x.despachado && x.ml.envio_substatus === 'printed').map(x => x.ml.envio_id);
  return `${faixaEnvioML(true)}
    <div class="passos-ml">
      <div><b>1</b> O pedido cai no ML e chega ao Tiny</div><div><b>2</b> A Intranet emite a NF sozinha</div>
      <div><b>3</b> Etiqueta liberada: <b>imprima aqui</b></div><div><b>4</b> Separar, conferir, embalar e <b>postar</b></div></div>
    <div class="acoes" style="margin:10px 0">
      ${lote.length ? `<button class="btn pri" data-a="imprimirEtiquetas" data-envios="${lote.join(',')}">🖨 Imprimir ${lote.length} etiqueta(s) nova(s)</button>` : '<span class="mut">Nenhuma etiqueta nova para imprimir.</span>'}
      ${reimp.length ? `<button class="btn" data-a="imprimirEtiquetas" data-envios="${reimp.join(',')}">↺ Reimprimir as já impressas (${reimp.length})</button>` : ''}
      <small class="mut">Etiqueta em PDF: imprime em qualquer impressora (na térmica, use o tamanho 10×15).</small></div>
    ${foraTiny.length ? `<div class="alerta med"><span class="ic">⏳</span><span><b>${foraTiny.length} pedido(s) do ML ainda não chegaram ao Tiny:</b> ${foraTiny.map(p => `${esc(p.comprador || '')} (${(p.itens || []).map(i => `${i.qtd}× ${esc((i.titulo || '').slice(0, 40))}`).join(', ')})`).join(' · ')}. Eles aparecem aqui assim que o Tiny importar.</span></div>` : ''}
    ${abaPedidos(doML, 'ml')}`;
}
