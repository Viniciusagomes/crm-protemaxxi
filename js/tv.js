'use strict';
/* Intranet Protemaxxi — TV do estoque: tela cheia para a segunda tela/TV do Fefão, no estilo de painel de cozinha (KDS), com as cores da Intranet.
   Comandas lado a lado (a mais antiga primeiro, balcão na frente), itens no padrão do Tiny (SKU | Produto | Qtd),
   painel "em andamento" e "aguardando aprovação" (com o botão + para ver o pedido). Toca um sino a cada pedido novo. */

const TV = { som: false, vistos: null, ultimoSino: {}, timer: null, wake: null, carregando: false, erro: '', detalhe: null };
const TV_REPETIR_MIN = 10;   // pedido parado sem ninguém pegar: o sino toca de novo a cada 10 min
const TV_MAX_ITENS = 7;      // itens por comanda na fila (a do "AGORA" mostra todos)

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

const minEspera = d => Math.max(0, Math.round((Date.now() - new Date(d)) / 60000));
const tempoEspera = d => { const m = minEspera(d); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };

/** Cor do relógio da comanda: verde no começo, amarelo esquentando, vermelho atrasado. */
function corTempo(x) {
  if (x.atrasado) return 'r';
  if (x.loja) { const m = minEspera(x.base || x.p.data); return m >= 10 ? 'r' : m >= 5 ? 'a' : 'v'; }
  if (x.prazo) return (x.prazo - Date.now()) / 3600e3 < 2 ? 'a' : 'v';
  return 'v';
}
const tipoTV = x => x.loja ? ['b', 'Balcão'] : x.envioLoja ? ['e', 'Envio' + (x.p.envio_forma ? ' · ' + x.p.envio_forma : '')] : ['m', nomeCanal(x.canal)];

/** Tabela de itens no padrão do Tiny: SKU | Produto | Qtd, com linhas e colunas bem marcadas. */
function tabelaItensTV(its, max, comValor) {
  const linhas = its.slice(0, max).map(i => { const pr = EXP.prod[String(i.produto_id)];
    return `<tr><td class="sku">${esc(i.codigo || '—')}</td><td class="nome">${esc(i.descricao || '')}${pr?.localizacao ? `<div class="loc">📍 ${esc(pr.localizacao)}</div>` : ''}</td>
      <td class="qtd">${N(i.quantidade)}</td>${comValor ? `<td class="val">${R(i.valor_unitario)}</td>` : ''}</tr>`; }).join('');
  return `<table class="tvtab"><thead><tr><th class="sku">SKU</th><th>Produto</th><th class="qtd">Qtd</th>${comValor ? '<th class="val">Unit.</th>' : ''}</tr></thead>
    <tbody>${linhas || `<tr><td colspan="${comValor ? 4 : 3}" class="nome">Carregando itens do Tiny…</td></tr>`}</tbody></table>
    ${its.length > max ? `<div class="tvmais">+ ${its.length - max} item(ns): veja no celular</div>` : ''}`;
}

function comandaTV(x, agora) {
  const { p } = x, its = EXP.itens[p.id] || [], [cls, nome] = tipoTV(x);
  const hora = d => new Date(d).toLocaleString('pt-BR', dataSP(d) === hojeSP() ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const tempo = x.loja ? tempoEspera(x.base || p.data) : x.prazo ? (x.atrasado ? 'ATRASADO' : 'até ' + hora(x.prazo)) : '';
  const pecas = soma(its.map(i => +i.quantidade || 0));
  return `<div class="tvcmd ${cls} ${agora ? 'agora' : ''}">
    ${agora ? '<div class="tvagora">▶ SEPARAR AGORA</div>' : ''}
    <div class="tvcmdtopo"><span class="tvnum">${esc(p.numero || '')}</span><span class="tvtipo">${esc(nome)}</span>${tempo ? `<span class="tvrel ${corTempo(x)}">⏱ ${esc(tempo)}</span>` : ''}</div>
    <div class="tvcli">${esc(p.cliente_nome || '')}${p.vendedor_nome ? ` <small>· ${esc(p.vendedor_nome)}</small>` : ''}</div>
    ${tabelaItensTV(its, agora ? 40 : TV_MAX_ITENS)}
    <div class="tvcmdpe"><span>${its.length} produto(s) · ${N(pecas)} peça(s)</span>${x.loja ? `<span>Cobrar <b>${R(p.valor)}</b> ${esc(p.pag_forma || p.forma_pagamento || '')}</span>` : ''}</div>
  </div>`;
}

/** Janela do botão "+": tudo sobre o pedido que espera a aprovação do pagamento. */
function detalheTV(x) {
  const { p } = x, its = EXP.itens[p.id] || [];
  const campo = (r, v) => v ? `<div><span>${r}</span><b>${esc(v)}</b></div>` : '';
  return `<div class="tvfundo" data-a="tvFechar"><div class="tvjanela" data-a="tvNada">
    <div class="tvjtopo"><span class="tvnum">Pedido ${esc(p.numero || '')}</span><button class="tvx" data-a="tvFechar">✕ Fechar</button></div>
    <div class="tvjcampos">${campo('Cliente', p.cliente_nome)}${campo('Vendedor', p.vendedor_nome)}${campo('Pagamento', [p.pag_forma || p.forma_pagamento, p.pag_meio].filter(Boolean).join(' · '))}
      ${campo('Valor total', R(p.valor))}${campo('Entrega', p.envio_forma || (x.loja ? 'Retirar na loja' : ''))}${campo('Data do pedido', p.data ? new Date(p.data + 'T12:00').toLocaleDateString('pt-BR') : '')}</div>
    ${tabelaItensTV(its, 60, true)}
    <div class="tvjaviso">⏳ Aguardando a aprovação do pagamento por Vinícius, Marcos, Fefão ou Felipe Menezes (tela Expedição → 💳 Aguardando aprovação).</div>
  </div></div>`;
}

function vTVEstoque() {
  if (!EXP) { atualizarTV(true); return '<div class="tvvazio">Carregando a separação…</div>'; }
  if (!TV.timer) { TV.timer = setInterval(() => { if (UI.view === 'tvestoque' && !document.hidden) atualizarTV(); }, 20000); atualizarTV(true); }
  const { separar, andamento, pagamento } = filaTV();
  const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const pisca = TV.pisca && Date.now() - TV.pisca < 8000;
  const mostrar = separar.slice(0, 7), sobra = separar.length - mostrar.length;
  const aberto = TV.detalhe && pagamento.find(x => x.p.id === TV.detalhe);
  if (TV.detalhe && !aberto) TV.detalhe = null;   // já foi aprovado: a janela fecha sozinha
  return `<div class="tv ${pisca ? 'pisca' : ''}">
    <div class="tvtopo"><div class="tvtit">📦 SEPARAÇÃO</div>
      <div class="tvcont"><div><b>${separar.length}</b>a separar</div><div><b>${separar.filter(x => x.loja).length}</b>no balcão</div>
        <div><b>${andamento.length}</b>em andamento</div><div><b>${pagamento.length}</b>aguardando pagto.</div></div>
      <div class="tvhora">${agora}</div></div>
    ${TV.som ? '' : '<button class="btn pri tvativar" data-a="tvAtivar">🔔 Clique aqui para ativar o som e a tela cheia</button>'}
    ${TV.erro ? `<div class="alerta ruim">Sem conexão: ${esc(TV.erro)} · tentando de novo…</div>` : ''}
    <div class="tvcorpo">
      <div class="tvkds">${mostrar.length ? mostrar.map((x, i) => comandaTV(x, i === 0)).join('') + (sobra > 0 ? `<div class="tvsobra">+ ${sobra}<small>pedido(s) na fila</small></div>` : '')
        : '<div class="tvvazio">✅ Nenhum pedido para separar agora.</div>'}</div>
      <div class="tvlado">
        <div class="tvpainel and"><div class="tvptit">🔄 EM ANDAMENTO</div>
          <div class="tvsenhas">${andamento.map(x => `<div class="tvsenha"><b>${esc(x.p.numero)}</b><small>${x.etapa === 'conferido' ? '✔ conferido' : 'separado'}</small></div>`).join('') || '<div class="tvnada">Nenhum</div>'}</div></div>
        <div class="tvpainel pag"><div class="tvptit">💳 AGUARDANDO APROVAÇÃO</div>
          <div class="tvplista">${pagamento.map(x => `<div class="tvpitem"><div class="tvpinfo"><b>${esc(x.p.numero)}</b><span>${esc((x.p.cliente_nome || '').split(' ').slice(0, 2).join(' '))}</span><small>${esc(x.p.pag_forma || '')} · ${R(x.p.valor)}</small></div>
            <button class="tvmaisbtn" data-a="tvDetalhe" data-id="${esc(x.p.id)}" title="Ver o pedido">+</button></div>`).join('') || '<div class="tvnada">Nenhum</div>'}</div></div>
      </div>
    </div>
    <div class="tvrodape"><span class="v">● até 5 min</span><span class="a">● 5 a 10 min</span><span class="r">● mais de 10 min / atrasado</span> · atualiza sozinha a cada 20 s · marque "Separado" e "Cobrado e entregue" no celular, na tela Expedição</div>
    ${aberto ? detalheTV(aberto) : ''}
  </div>`;
}
