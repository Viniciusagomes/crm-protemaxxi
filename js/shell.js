'use strict';
/* Intranet Protemaxxi — "casca" do app: busca global (Ctrl+K), central de notificações (sino), barra inferior no celular,
   letra grande e app instalável (PWA). */

// ─── letra grande (por usuário, neste aparelho) ───
const letraGrande = () => { try { return localStorage.getItem('crm-letra') === 'g'; } catch { return false; } };
document.documentElement.classList.toggle('letra-grande', letraGrande());
function alternarLetra() {
  const g = !letraGrande(); try { localStorage.setItem('crm-letra', g ? 'g' : ''); } catch { /* ok */ }
  document.documentElement.classList.toggle('letra-grande', g); avisar(g ? 'Letra grande ligada neste aparelho.' : 'Letra normal.');
}

// ─── busca global ───
const BUSCA = { sel: 0, itens: [], timer: null, seq: 0 };
function abrirBusca() {
  if (!D || !EU) return;
  if (!D.clientes) carregarClientes().catch(() => {});
  fecharBusca();
  document.body.insertAdjacentHTML('beforeend', `<div class="busca-fundo" id="busca" data-a="fecharBusca"><div class="busca-caixa" data-a="nadaBusca">
    <input type="search" id="buscaIn" placeholder="Buscar cliente, pedido, produto, negócio, solicitação ou tela…" autocomplete="off">
    <div class="busca-res" id="buscaRes"><div class="busca-dica">Digite pelo menos 2 letras. <kbd>↑</kbd><kbd>↓</kbd> para escolher, <kbd>Enter</kbd> para abrir, <kbd>Esc</kbd> para fechar.</div></div></div></div>`);
  const inp = $('#buscaIn'); inp.focus();
  inp.addEventListener('input', () => { clearTimeout(BUSCA.timer); BUSCA.timer = setTimeout(() => buscarGlobal(inp.value), 140); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); BUSCA.sel = Math.max(0, Math.min(BUSCA.itens.length - 1, BUSCA.sel + (e.key === 'ArrowDown' ? 1 : -1))); marcarSelBusca(); }
    if (e.key === 'Enter') { e.preventDefault(); document.querySelectorAll('#buscaRes .busca-item')[BUSCA.sel]?.click(); }
  });
}
function fecharBusca() { $('#busca')?.remove(); }
function marcarSelBusca() { document.querySelectorAll('#buscaRes .busca-item').forEach((el, i) => { el.classList.toggle('sel', i === BUSCA.sel); if (i === BUSCA.sel) el.scrollIntoView({ block: 'nearest' }); }); }
async function buscarGlobal(txt) {
  const q = semAcento(txt).toLowerCase().trim(), seq = ++BUSCA.seq, dig = q.replace(/\D/g, '');
  const res = $('#buscaRes'); if (!res) return;
  if (q.length < 2) { res.innerHTML = '<div class="busca-dica">Digite pelo menos 2 letras.</div>'; BUSCA.itens = []; return; }
  const tem = s => semAcento(s || '').toLowerCase().includes(q);
  const grupos = [];
  const telas = [...document.querySelectorAll('#nav button[data-v]')].filter(b => tem(b.textContent)).slice(0, 4)
    .map(b => ({ ic: b.querySelector('.ic')?.textContent || '•', t: b.textContent.replace(/\d+$/, '').trim(), s: 'Tela', a: 'nav', d: { v: b.dataset.v } }));
  if (telas.length) grupos.push(['Telas', telas]);
  const clis = (D.clientes || []).filter(c => tem(c.nome) || (dig.length >= 4 && ((c.doc || '').includes(dig) || (c.fone || '').includes(dig)))).sort((a, b) => b.total - a.total).slice(0, 6)
    .map(c => ({ ic: '👤', t: c.nome, s: `${c.cidade || ''} · ${R0(c.total)} em 12 meses · ${c.pedidos} pedido(s)`, a: 'verCliente', d: { chave: c.chave } }));
  if (clis.length) grupos.push(['Clientes', clis]);
  const peds = D.pedidos.filter(p => (dig.length >= 3 && String(p.numero || '').startsWith(dig)) || tem(p.cliente_nome)).slice(0, 6)
    .map(p => ({ ic: '🧾', t: `Pedido ${p.numero} · ${p.cliente_nome}`, s: `${fmtCurta(p.data)}/${p.data.slice(2, 4)} · ${R(p.valor)} · ${p.situacao || ''}`, a: 'verPedido', d: { id: p.id } }));
  if (peds.length) grupos.push(['Pedidos', peds]);
  const negs = (CRM.neg || []).filter(n => tem(n.cliente_nome) || tem(n.titulo) || (dig && String(n.orcamento_numero || '').startsWith(dig))).slice(0, 5)
    .map(n => ({ ic: '🎯', t: `${n.cliente_nome}`, s: `${n.titulo} · ${NOME_ETAPA[n.etapa]} · ${R0(n.valor)}`, a: 'crmAbrir', d: { id: n.id } }));
  if (negs.length) grupos.push(['Negócios', negs]);
  const sols = D.solicitacoes.filter(s => tem(s.titulo) || (dig && String(s.id) === dig)).slice(0, 5)
    .map(s => ({ ic: TIPOS_SOL[s.tipo]?.ic || '📨', t: `#${s.id} ${s.titulo}`, s: `${TIPOS_SOL[s.tipo]?.nome || ''} · ${STATUS_SOL[s.status]}`, a: 'verSolicitacao', d: { id: s.id } }));
  if (sols.length) grupos.push(['Solicitações', sols]);
  desenharBusca(grupos);
  // produtos: busca no banco (código, nome ou código de barras)
  const termo = txt.trim().replace(/[%_,()]/g, ' ');
  const { data: prods } = await sb.from('produtos').select('id,codigo,nome,saldo,preco,localizacao,gtin').eq('situacao', 'A')
    .or(`nome.ilike.%${termo}%,codigo.ilike.${termo}%,gtin.eq.${termo.replace(/\D/g, '') || '0'}`).limit(6);
  if (seq !== BUSCA.seq || !prods?.length) return;
  grupos.push(['Produtos', prods.map(p => ({ ic: '📦', t: `${p.codigo || ''} · ${p.nome}`, s: `estoque ${p.saldo ?? '—'}${p.preco ? ' · ' + R(p.preco) : ''}${p.localizacao ? ' · 📍 ' + p.localizacao : ''}`, a: 'buscaProduto', d: { id: p.id } }))]);
  desenharBusca(grupos);
}
function desenharBusca(grupos) {
  const res = $('#buscaRes'); if (!res) return;
  BUSCA.itens = grupos.flatMap(g => g[1]); BUSCA.sel = Math.min(BUSCA.sel, Math.max(0, BUSCA.itens.length - 1));
  res.innerHTML = grupos.length ? grupos.map(([g, l]) => `<div class="busca-grupo">${g}</div>${l.map(x => `<button class="busca-item" data-a="${x.a}" ${Object.entries(x.d).map(([k, v]) => `data-${k}="${esc(String(v))}"`).join(' ')} data-fecha-busca="1">
      <span class="ic">${x.ic}</span><span><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span></button>`).join('')}`).join('') : '<div class="busca-dica">Nada encontrado.</div>';
  marcarSelBusca();
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrirBusca(); }
  else if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '') && D && EU) { e.preventDefault(); abrirBusca(); }
  else if (e.key === 'Escape') fecharBusca();
});
// qualquer resultado clicado fecha a busca (depois que a ação roda)
document.addEventListener('click', e => { if (e.target.closest?.('[data-fecha-busca]')) setTimeout(fecharBusca, 0); });

// ─── central de notificações ───
const SINO = { aberto: false, vistos: new Set(), primeira: true };
/** Tudo o que pede atenção agora, para quem está logado. */
function notificacoes() {
  const l = [], h = hoje();
  const add = (chave, ic, txt, a, d = {}, nivel = '') => l.push({ chave, ic, txt, a, d, nivel });
  if (ehDono() && CRE.pend?.length) add('cre:' + CRE.pend.length, '💳', `${CRE.pend.length} vale(s)/crédito(s) aguardando sua aprovação`, 'nav', { v: 'creditos' }, 'med');
  const bp = (CRE.bped || []).filter(b => b.status === 'pendente');
  if (ehDono() && bp.length) add('bri:' + bp.length, '🎁', `${bp.length} pedido(s) de brinde aguardando sua aprovação`, 'nav', { v: 'brindes' }, 'med');
  const bAprov = (CRE.bped || []).filter(b => b.status === 'aprovado');
  if (veExp() && bAprov.length) add('brie:' + bAprov.length, '🎁', `${bAprov.length} brinde(s) aprovado(s) para separar`, 'nav', { v: 'brindes' });
  const ruins = (AVA.lista || []).filter(a => a.nota && a.nota <= 3 && !a.tratado);
  if (ehDono() && ruins.length) add('ava:' + ruins.length, '⭐', `${ruins.length} cliente(s) insatisfeito(s) na avaliação`, 'nav', { v: 'avaliacoes' }, 'ruim');
  const sols = minhasPendentes();
  if (sols.length) add('sol:' + sols.map(s => s.id).join(','), '📨', `${sols.length} solicitação(ões) para você`, 'nav', { v: 'solicitacoes' });
  const atv = (CRM.atv || []).filter(a => a.pessoa_id === EU.id && !a.feito);
  const atras = atv.filter(a => a.quando < h), hojeA = atv.filter(a => a.quando === h);
  if (atras.length) add('atv-a:' + atras.length, '⏰', `${atras.length} atividade(s) atrasada(s)`, 'nav', { v: 'meudia' }, 'ruim');
  if (hojeA.length) add('atv-h:' + hojeA.length, '📅', `${hojeA.length} atividade(s) para hoje`, 'nav', { v: 'meudia' });
  if (EXP && podeAprovarPag()) { const n = EXP.ecom.map(infoPedido).filter(x => x.pagPendente).length; if (n) add('pag:' + n, '💰', `${n} pedido(s) aguardando aprovação de pagamento`, 'nav', { v: 'expedicao' }, 'med'); }
  if (veML() && D.ml) { const n = D.ml.perguntas.filter(perguntaPendente).length; if (n) add('mlp:' + n, '❓', `${n} pergunta(s) sem resposta no Mercado Livre`, 'nav', { v: 'ml' }, 'med'); }
  if (typeof veEnvioML === 'function' && veEnvioML() && ENVML.em) { const s = situacaoEnvioML(); if (s.hj && s.pend.length && s.falta != null && s.falta <= 60) add('envml:' + h, '🚚', `Postagem ML ${s.falta < 0 ? 'ATRASADA' : 'em ' + fmtFalta(s.falta)}: ${s.pend.length} pedido(s)`, 'nav', { v: veExp() ? 'expedicao' : 'ml' }, 'ruim'); }
  if (EU.tiny && PRO.dados && PRO.chave === h + EU.id) { const n = PRO.dados.filter(x => !x.resultado).length; if (n) add('pro:' + h, '📞', `${n} contato(s) da prospecção de hoje`, 'irProspeccao'); }
  return l;
}
function botaoSino() {
  const n = notificacoes().length;
  return `<button class="sino ${n ? 'tem' : ''}" data-a="sinoAbrir" title="Notificações">🔔${n ? `<span class="badge">${n}</span>` : ''}</button>`;
}
function painelSino() {
  const l = notificacoes();
  return `<div class="sino-fundo" data-a="sinoFechar"><div class="sino-painel" data-a="nadaBusca"><div class="sino-cab"><b>Notificações</b>
    ${typeof Notification !== 'undefined' && Notification.permission === 'default' ? '<button class="btn peq" data-a="sinoPermitir">Avisar no celular/PC</button>' : ''}</div>
    ${l.map(x => `<button class="sino-item ${x.nivel}" data-a="${x.a}" ${Object.entries(x.d).map(([k, v]) => `data-${k}="${esc(String(v))}"`).join(' ')} data-fecha-sino="1"><span class="ic">${x.ic}</span><span>${esc(x.txt)}</span></button>`).join('')
      || '<div class="busca-dica">Tudo em dia. 👏</div>'}</div></div>`;
}
document.addEventListener('click', e => { if (e.target.closest?.('[data-fecha-sino]')) setTimeout(() => { SINO.aberto = false; $('.sino-fundo')?.remove(); }, 0); });
/** Notificação do sistema para item novo, quando a Intranet está aberta em segundo plano. */
function checarSino() {
  if (!D || !EU) return;
  const l = notificacoes(), novos = l.filter(x => !SINO.vistos.has(x.chave));
  l.forEach(x => SINO.vistos.add(x.chave));
  if (!SINO.primeira && novos.length && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification('Intranet Protemaxxi', { body: novos.map(x => x.txt).join('\n'), icon: 'img/icone-192.png', tag: 'intranet-' + novos[0].chave }); } catch { /* ok */ }
  }
  SINO.primeira = false;
  const s = document.getElementById('sinoLugar'); if (s) s.innerHTML = botaoSino();
  const b = document.getElementById('barraInf'); if (b) b.innerHTML = conteudoBarraInf();
}
setInterval(() => { if (D && EU) { carregarCreditos().catch(() => {}); if (ehDono()) carregarAva().catch(() => {}); if (EU.tiny || ehDono()) carregarCRM().catch(() => {}); checarSino(); } }, 60e3);

// ─── barra inferior (celular) ───
function atalhosBarra() {
  if (ehDono()) return [['inicio', '⌂', 'Início'], ['crm', '🎯', 'Funil'], ['vendas', '📈', 'Vendas']];
  if (EU.tiny) return [['meudia', '☀', 'Meu dia'], ['crm', '🎯', 'Funil'], ['clientes', '👤', 'Clientes']];
  if (veExp()) return [['expedicao', '📦', 'Expedição'], ['solicitacoes', '📨', 'Solicit.'], ['checklist', '☑', 'Checklist']];
  return [['inicio', '⌂', 'Início'], ['solicitacoes', '📨', 'Solicit.'], ['checklist', '☑', 'Checklist']];
}
function conteudoBarraInf() {
  const n = notificacoes().length;
  return atalhosBarra().map(([v, ic, nome]) => `<button class="${UI.view === v ? 'on' : ''}" data-a="nav" data-v="${v}"><span>${ic}</span>${nome}</button>`).join('')
    + `<button data-a="abrirBusca"><span>🔎</span>Buscar</button><button data-a="sinoAbrir" class="${n ? 'tem' : ''}"><span>🔔${n ? `<i>${n}</i>` : ''}</span>Avisos</button><button data-a="menuCel"><span>☰</span>Menu</button>`;
}
/** Chamado no fim de cada render: sino, barra inferior e botão de instalar. */
function atualizarShell() {
  const marca = document.querySelector('.side .marca');
  if (marca && !document.getElementById('sinoLugar')) marca.insertAdjacentHTML('beforeend', '<span id="sinoLugar" class="sino-lugar"></span><button class="busca-btn" data-a="abrirBusca" title="Buscar (Ctrl+K)">🔎</button>');
  const s = document.getElementById('sinoLugar'); if (s) s.innerHTML = botaoSino();
  if (!document.getElementById('barraInf')) document.body.insertAdjacentHTML('beforeend', '<nav class="barra-inf" id="barraInf"></nav>');
  $('#barraInf').innerHTML = conteudoBarraInf();
  const rod = document.querySelector('.side-rodape .linha-botoes');
  if (rod && !document.getElementById('btnLetra')) rod.insertAdjacentHTML('beforeend', `<button class="tema" id="btnLetra" data-a="alternarLetra" title="Letra maior">A+</button>${INSTALAR.evento ? '<button class="tema" data-a="instalarApp" title="Instalar no celular/PC">📲 App</button>' : ''}`);
  document.body.classList.remove('menu-aberto');
  if (SINO.primeira) checarSino();
}

// ─── app instalável (PWA) ───
const INSTALAR = { evento: null };
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); INSTALAR.evento = e; document.getElementById('btnLetra')?.insertAdjacentHTML('afterend', '<button class="tema" data-a="instalarApp" title="Instalar no celular/PC">📲 App</button>'); });
async function instalarApp() {
  if (INSTALAR.evento) { INSTALAR.evento.prompt(); await INSTALAR.evento.userChoice.catch(() => {}); INSTALAR.evento = null; return; }
  avisar('No iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início". No Android: menu ⋮ → "Instalar app".');
}
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

/** Ficha rápida do produto (vinda da busca): estoque, preço, local e código de barras. */
async function abrirProduto(id) {
  const { data: p } = await sb.from('produtos').select('*').eq('id', id).maybeSingle();
  if (!p) return avisar('Produto não encontrado.');
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><small class="mut">Produto do Tiny</small><h2 style="margin-top:4px">${esc(p.nome)}</h2>
    <div class="grid g4" style="gap:10px"><div class="card kpi-card"><div class="rot">Código</div><div class="val" style="font-size:18px">${esc(p.codigo || '—')}</div></div>
      <div class="card kpi-card"><div class="rot">Estoque</div><div class="val ${+p.saldo <= 0 ? 'c-ruim' : ''}">${N(p.saldo)}</div><div class="sub">${p.reservado ? N(p.reservado) + ' reservado(s)' : ''}</div></div>
      <div class="card kpi-card"><div class="rot">Preço</div><div class="val" style="font-size:20px">${p.preco ? R(p.preco) : '—'}</div><div class="sub">${+p.preco_promocional ? 'promo ' + R(p.preco_promocional) : ''}</div></div>
      <div class="card kpi-card"><div class="rot">Local</div><div class="val" style="font-size:18px">${esc(p.localizacao || '—')}</div></div></div>
    <p class="mut mt">${p.gtin ? 'Código de barras ' + esc(p.gtin) + ' · ' : ''}estoque atualizado ${p.saldo_em ? new Date(p.saldo_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}${ehDono() && p.preco_custo ? ' · custo ' + R(p.preco_custo) : ''}</p>`);
}
