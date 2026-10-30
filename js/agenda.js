'use strict';
/* Agenda de telefones (WhatsApp · Fase 1): números padronizados (55 + DDD + número) ligados ao cliente, vindos do Tiny, dos pedidos,
   da ficha (manual) e, depois, do próprio WhatsApp (cliente confirma o CPF/CNPJ). Aba "📱 Agenda WhatsApp" em Clientes mostra a
   cobertura por vendedor e quem está sem celular; na ficha do cliente dá para ver, abrir no WhatsApp e incluir números. */

const AGD = { cob: null, carregando: false, em: 0, tels: {} };
const ORIGEM_TEL = { tiny_celular: 'Tiny (celular)', tiny_fone: 'Tiny (fone)', tiny_adicional: 'Tiny (telefone adicional)', pedido: 'pedido', manual: 'incluído na Intranet', whatsapp_doc: 'confirmado no WhatsApp' };

/** Mesma regra do banco (seg.fone_norm): 55 + DDD + número; celular antigo ganha o 9. Inválido ou sem DDD → ''. */
function foneNorm(t) {
  let d = String(t || '').replace(/\D/g, '').replace(/^0+/, '');
  if ([12, 13].includes(d.length) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11 && d[0] === '0') d = d.slice(1);
  if (d.length === 10 && '6789'.includes(d[2])) d = d.slice(0, 2) + '9' + d.slice(2);
  if (![10, 11].includes(d.length) || d[0] === '0' || d[1] === '0') return '';
  if (d.length === 11 && d[2] !== '9') return '';
  if (d.length === 10 && !'2345'.includes(d[2])) return '';
  return '55' + d;
}
const foneFmt = f => { const d = String(f || '').replace(/^55/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : f; };

// ─── ficha do cliente ───
async function telsDoCliente(chave, forcar) {
  if (!forcar && AGD.tels[chave]) return AGD.tels[chave];
  return (AGD.tels[chave] = await ok(sb.from('cliente_telefones').select('*').eq('cliente_chave', chave).order('celular', { ascending: false })));
}
function blocoTelsFicha(chave) {
  const l = AGD.tels[chave];
  if (!l) return '<span class="mut">📱 carregando telefones…</span>';
  return `${l.map(t => t.errado_em ? `<span class="tel-chip" title="Marcado como errado em ${fmtCurta(t.errado_em.slice(0, 10))}: não é usado para contato">📵 <s>${esc(foneFmt(t.telefone))}</s> errado
      <button class="icone-btn" data-a="telCerto" data-chave="${esc(chave)}" data-v="${t.telefone}" title="O número estava certo">↺</button></span>`
    : `<span class="tel-chip ${t.celular ? 'cel' : ''}" title="${esc(ORIGEM_TEL[t.origem] || t.origem)}${t.validado_em ? ' · confirmado' : ''}">${t.celular ? '📱' : '☎'} ${esc(foneFmt(t.telefone))}${t.validado_em ? ' ✓' : ''}
      ${t.celular ? `<a class="wa" href="https://wa.me/${t.telefone}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${ehDono() || (t.origem === 'manual' && t.por === EU.id) ? `<button class="icone-btn" data-a="telExcluir" data-chave="${esc(chave)}" data-v="${t.telefone}" title="Remover este número">✕</button>` : ''}</span>`).join('')}
    ${l.some(t => t.celular && !t.errado_em) ? '' : '<span class="tag med">sem celular</span>'}<button class="btn peq" data-a="telNovo" data-chave="${esc(chave)}">＋ telefone</button>`;
}
/** Chamado depois de abrir a ficha: carrega e mostra os telefones. */
function carregarTelsFicha(chave) {
  telsDoCliente(chave, true).then(() => { const el = document.getElementById('cliTels'); if (el && el.dataset.chave === chave) el.innerHTML = blocoTelsFicha(chave); }).catch(() => {});
}
async function telNovo(chave) {
  const t = prompt('Telefone do cliente com DDD (ex.: 19 99999-9999):'); if (t == null) return;
  const f = foneNorm(t);
  if (!f) return alert('Número inválido. Use DDD + número (celular com 9 dígitos).');
  const { error } = await sb.from('cliente_telefones').insert({ telefone: f, cliente_chave: chave, celular: f.length === 13, origem: 'manual', por: EU.id });
  if (error && !/duplicate|unique/i.test(error.message)) return alert('Não salvou: ' + error.message);
  await telsDoCliente(chave, true); avisar(`${foneFmt(f)} incluído ✓`);
  const el = document.getElementById('cliTels'); if (el) el.innerHTML = blocoTelsFicha(chave);
  if (AGD.cob) { AGD.cob.sem_celular = AGD.cob.sem_celular.filter(x => !(x.chave === chave && f.length === 13)); }
  if (UI.view === 'clientes' && UI.cliAba === 'agenda') render();
}
async function telExcluir(chave, fone) {
  if (!confirm(`Remover o número ${foneFmt(fone)} deste cliente?`)) return;
  await ok(sb.from('cliente_telefones').delete().eq('cliente_chave', chave).eq('telefone', fone));
  await telsDoCliente(chave, true);
  const el = document.getElementById('cliTels'); if (el) el.innerHTML = blocoTelsFicha(chave);
}

// ─── aba Agenda WhatsApp (Clientes) ───
async function carregarAgenda(forcar) {
  if (AGD.carregando || (!forcar && AGD.cob && Date.now() - AGD.em < 5 * 60e3)) return;
  AGD.carregando = true;
  try { const { data, error } = await sb.rpc('agenda_cobertura'); if (error) throw error; AGD.cob = data; AGD.em = Date.now(); }
  finally { AGD.carregando = false; }
}
function abaAgenda() {
  if (!AGD.cob) { if (!AGD.carregando) carregarAgenda().then(render).catch(e => avisar(e.message)); return '<div class="card vazio">Carregando a agenda…</div>'; }
  const c = AGD.cob, pct = n => c.total ? Math.round(n / c.total * 100) + '%' : '—', sem = c.total - c.com_celular - c.so_fixo;
  const b = semAcento(UI.agdBusca || '').toLowerCase();
  const lista = (c.sem_celular || []).filter(x => !b || semAcento(`${x.nome} ${x.vendedor}`).toLowerCase().includes(b));
  return `<p class="explica">Para o atendimento automático no WhatsApp reconhecer o cliente, o número dele precisa estar aqui. Os números vêm do Tiny (atualizados toda semana), dos pedidos e do que vocês incluírem na ficha. Clientes da loja com compra nos últimos 12 meses.</p>
    <div class="grid g4"><div class="card kpi-card"><div class="rot">Clientes ativos</div><div class="val">${N(c.total)}</div><div class="sub">loja · últimos 12 meses</div></div>
      <div class="card kpi-card"><div class="rot">Com celular</div><div class="val c-ok">${N(c.com_celular)}</div><div class="sub">${pct(c.com_celular)} · o bot reconhece</div></div>
      <div class="card kpi-card"><div class="rot">Só telefone fixo</div><div class="val c-med">${N(c.so_fixo)}</div><div class="sub">${pct(c.so_fixo)}</div></div>
      <div class="card kpi-card"><div class="rot">Sem telefone</div><div class="val c-ruim">${N(sem)}</div><div class="sub">${pct(sem)}</div></div></div>
    <div class="card mt"><h2>Por vendedor</h2><table class="tabela"><thead><tr><th>Vendedor</th><th class="dir">Clientes</th><th class="dir">Com celular</th><th class="dir">Só fixo</th><th class="dir">Sem telefone</th></tr></thead><tbody>
      ${(c.por_vendedor || []).map(v => `<tr><td><b>${esc(v.vendedor)}</b></td><td class="dir">${N(v.total)}</td><td class="dir c-ok">${N(v.com_celular)} <small>(${v.total ? Math.round(v.com_celular / v.total * 100) : 0}%)</small></td><td class="dir">${N(v.so_fixo)}</td><td class="dir ${v.sem ? 'c-ruim' : ''}">${N(v.sem)}</td></tr>`).join('')}</tbody></table></div>
    <div class="card mt"><div class="secao-titulo"><h2>Sem celular: complete o cadastro</h2><small>${lista.length} cliente(s) · os mais recentes primeiro</small></div>
      <div class="filtros"><input type="search" placeholder="Buscar cliente ou vendedor…" value="${esc(UI.agdBusca || '')}" data-c="ui" data-k="agdBusca" data-fid="agdBusca"><button class="btn" data-a="agdAtualizar">↻ Atualizar</button></div>
      <table class="tabela"><thead><tr><th>Cliente</th><th>Vendedor</th><th>Última compra</th><th></th></tr></thead><tbody>
      ${lista.slice(0, 200).map(x => `<tr><td><a href="#" data-a="verCliente" data-chave="${esc(x.chave)}"><b>${esc(x.nome || x.chave)}</b></a>${x.fixo ? ' <small class="mut">☎ só fixo</small>' : ''}</td><td>${esc(x.vendedor || '')}</td><td>${x.ultima ? pd(x.ultima).toLocaleDateString('pt-BR') : ''}</td>
        <td class="dir"><button class="btn peq" data-a="telNovo" data-chave="${esc(x.chave)}">＋ celular</button></td></tr>`).join('') || '<tr><td colspan="4" class="vazio">Todos os clientes ativos têm celular. 👏</td></tr>'}
      </tbody></table>${lista.length > 200 ? `<p class="mut">Mostrando 200 de ${lista.length}. Use a busca.</p>` : ''}</div>`;
}

// ─── Cadastros parecidos (lote 3A): fila de possíveis duplicados e a conferência registrada ───
// Nada é fundido: a decisão fica guardada (quem, quando, observação) e os dois cadastros continuam como estão.
const PARES = { lista: null, status: '', carregando: false, gravando: new Set() };
const STATUS_PAR = { pendente: '⏳ Para conferir', conferir: '🔍 Precisa conferir', mesmo: '🟰 Mesmo cliente', diferentes: '↔ Clientes diferentes' };
async function carregarPares(status) {
  PARES.carregando = true;
  try { PARES.lista = await ok(sb.rpc('cliente_pares_lista', { p_status: status })); PARES.status = status; }
  finally { PARES.carregando = false; }
}
function abaPares() {
  const st = UI.parStatus || 'pendente';
  if (!PARES.lista || PARES.status !== st) { if (!PARES.carregando) carregarPares(st).then(render).catch(e => avisar(e.message)); return '<div class="card vazio">Carregando os cadastros parecidos…</div>'; }
  const lado = c => `<div style="flex:1;min-width:220px"><a href="#" data-a="verCliente" data-chave="${esc(c.chave)}"><b>${esc(c.nome || c.chave)}</b></a>
    <br><small>${c.doc ? docFmt(c.doc) : '<span class="c-med">sem CPF/CNPJ</span>'}${c.cidade ? ' · ' + esc(c.cidade) + (c.uf ? '/' + esc(c.uf) : '') : ''}</small>
    <br><small>${c.pedidos} pedido(s)${c.ultima ? ` · última ${fmtCurta(c.ultima)}/${String(c.ultima).slice(2, 4)}` : ''} · ${R0(c.total12m)} em 12 meses${c.vendedor ? ' · ' + esc(c.vendedor) : ''}${c.negocios ? ` · ${c.negocios} negócio(s)` : ''}</small>
    <br><small class="mut">${(c.telefones || []).map(foneFmt).join(' · ') || 'sem telefone'}</small></div>`;
  const id = p => `${p.a.chave}|${p.b.chave}`;
  const card = p => `<div class="card mt" style="padding:12px 14px">
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">${p.motivos.map(m => `<span class="tag ${/Tiny|telefone/.test(m) ? 'azul' : ''}">${esc(m.replace(/^telefone (\d+)/, (x, f) => 'telefone ' + foneFmt(f)))}</span>`).join('')}${p.ativos === 2 ? '<span class="tag med">os dois têm movimento</span>' : ''}</div>
    <div style="display:flex;gap:14px;flex-wrap:wrap">${lado(p.a)}<div class="mut" style="align-self:center">⇄</div>${lado(p.b)}</div>
    ${p.status !== 'pendente' ? `<p class="explica" style="margin:8px 0 0">${STATUS_PAR[p.status]}${p.decidido_por ? ` · ${esc(nomeP(p.decidido_por))}` : ''}${p.decidido_em ? ` em ${fmtCurta(p.decidido_em.slice(0, 10))}` : ''}${p.obs ? ': ' + esc(p.obs) : ''}</p>` : ''}
    ${p.pode_decidir ? `<div class="nova-atv" style="margin-top:8px"><input type="text" id="parObs_${esc(id(p))}" maxlength="500" placeholder="Observação (obrigatória para “precisa conferir”)" value="${esc(p.obs || '')}" style="flex:1;min-width:200px">
      ${['mesmo', 'diferentes', 'conferir'].filter(s => s !== p.status).map(s => `<button class="btn peq ${s === 'mesmo' ? 'pri' : ''}" data-a="parDecidir" data-a1="${esc(p.a.chave)}" data-b1="${esc(p.b.chave)}" data-v="${s}">${STATUS_PAR[s]}</button>`).join('')}
      ${p.status !== 'pendente' ? `<button class="btn peq" data-a="parDecidir" data-a1="${esc(p.a.chave)}" data-b1="${esc(p.b.chave)}" data-v="pendente">Desfazer</button>` : ''}</div>`
      : '<small class="mut">Para decidir, é preciso ter acesso aos dois cadastros (peça ao supervisor).</small>'}</div>`;
  return `<p class="explica">Cadastros que podem ser o mesmo cliente: mesmo contato no Tiny, telefone em comum (até 3 cadastros; mais que isso costuma ser instalador ou a loja) ou mesmo nome, quando um deles está sem CPF/CNPJ. Nada é juntado: a conferência fica registrada e os dois cadastros continuam como estão. Primeiro os pares em que os dois têm movimento.</p>
    <div class="chips">${Object.entries(STATUS_PAR).map(([k, n]) => `<button class="chip ${st === k ? 'on' : ''}" data-a="parStatus" data-v="${k}">${n}</button>`).join('')}${ehDono() ? '<button class="btn peq" data-a="parRecalcular">↻ Recalcular a fila</button>' : ''}</div>
    ${PARES.lista.length ? PARES.lista.map(card).join('') + (PARES.lista.length >= 300 ? '<p class="mut">Mostrando os 300 primeiros.</p>' : '') : '<div class="card vazio mt">Nada aqui. 👏</div>'}`;
}
async function parDecidir(a, b, status) {
  const k = a + '|' + b; if (PARES.gravando.has(k)) return;
  const obs = document.getElementById('parObs_' + k)?.value.trim() || '';
  if (status === 'conferir' && !obs) return avisar('Diga o que precisa ser conferido.');
  PARES.gravando.add(k);
  try {
    await ok(sb.rpc('cliente_par_decidir', { p_a: a, p_b: b, p_status: status, p_obs: obs }));
    PARES.lista = PARES.lista.filter(p => !(p.a.chave === a && p.b.chave === b));
    avisar(status === 'pendente' ? 'Voltou para a fila.' : `Registrado: ${STATUS_PAR[status]}.`); render();
  } finally { PARES.gravando.delete(k); }
}
async function parRecalcular() {
  const n = await ok(sb.rpc('cliente_pares_atualizar'));
  PARES.lista = null; avisar(`Fila recalculada: ${n} par(es) para conferir.`); render();
}
/** Na ficha: avisa que há outro cadastro parecido e mostra a decisão já tomada. */
async function carregarParesFicha(chave) {
  const el = document.getElementById('cliPares'); if (!el) return;
  const l = await ok(sb.from('cliente_pares').select('a,b,motivos,status,obs').or(`a.eq.${JSON.stringify(chave)},b.eq.${JSON.stringify(chave)}`)).catch(() => []);
  if (el.dataset.chave !== chave || !l.length) return;
  const nomeDe = k => (D.clientes || []).find(c => c.chave === k)?.nome || k.replace(/^n:/, '');
  el.innerHTML = `<div class="alerta mt"><span class="ic">🔎</span><span>${l.map(p => { const outro = p.a === chave ? p.b : p.a;
    return `${p.status === 'mesmo' ? 'Mesmo cliente que' : p.status === 'diferentes' ? 'Conferido como diferente de' : 'Pode ser o mesmo cliente que'} <a href="#" data-a="verCliente" data-chave="${esc(outro)}">${esc(nomeDe(outro))}</a> <small class="mut">(${esc(p.motivos.join(', ').replace(/telefone (\d+)/g, (x, f) => 'telefone ' + foneFmt(f)))}${p.obs ? ' · ' + esc(p.obs) : ''})</small>`; }).join('<br>')}
    ${l.some(p => ['pendente', 'conferir'].includes(p.status)) ? '<br><a href="#" data-a="irPares">Conferir na fila</a>' : ''}</span></div>`;
}
