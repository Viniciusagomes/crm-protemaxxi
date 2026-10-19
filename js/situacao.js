'use strict';
/* Situação dos pedidos (vendedor): acompanha cada pedido da loja na expedição, ou seja, pagamento, separação, conferência,
   saída e problemas (item faltante, envio…). Só leitura; vem da RPC situacao_meus_pedidos (os meus; o supervisor vê a equipe). */

const SIT = { lista: null, carregando: false, em: 0 };

async function carregarSituacao(forcar) {
  if (SIT.carregando || (!forcar && SIT.lista && Date.now() - SIT.em < 60e3)) return;
  SIT.carregando = true;
  try { const { data, error } = await sb.rpc('situacao_meus_pedidos', { p_desde: null }); if (error) throw error; SIT.lista = data || []; SIT.em = Date.now(); }
  finally { SIT.carregando = false; }
}

/** Passos do pedido e em qual ele está. */
function passosPedido(p) {
  const e = p.exp || {}, ret = ehRetirada(p), cancel = /cancel/i.test(p.situacao || '');
  const saiu = !!e.despachado_em || SIT_DESPACHADA.includes(p.situacao);
  const passos = [['Pedido feito', true, p.data ? fmtCurta(p.data) : '']];
  if (precisaAprovar(p)) passos.push(['Pagamento aprovado', !!e.pagamento_aprovado_em || saiu, e.pagamento_aprovado_em ? dataHora(e.pagamento_aprovado_em) : '']);
  passos.push(['Separado', !!e.separado_em || saiu, e.separado_em ? dataHora(e.separado_em) : '']);
  if (!ret) passos.push(['Conferido e embalado', !!e.conferido_em || saiu, e.conferido_em ? dataHora(e.conferido_em) : '']);
  passos.push([ret ? 'Entregue ao cliente' : 'Enviado', saiu, e.despachado_em ? dataHora(e.despachado_em) : '']);
  const problemas = [
    ...(p.ocorrencias || []).filter(o => !o.resolvido).map(o => `${(TIPOS_OC[o.tipo] || TIPOS_OC.outro)[0]} ${(TIPOS_OC[o.tipo] || TIPOS_OC.outro)[1]}${o.produto ? ': ' + o.produto : ''}${o.quantidade ? ` (${N(o.quantidade)})` : ''}${o.descricao ? ' · ' + o.descricao : ''}`),
    ...(e.tiny_erro ? ['⚠ O Tiny não aceitou a última mudança de situação'] : []),
  ];
  const resolvidos = (p.ocorrencias || []).filter(o => o.resolvido);
  const ESPERA = { 'Pagamento aprovado': 'Aguardando aprovação do pagamento', 'Separado': 'Na fila para separar', 'Conferido e embalado': 'Separado · falta conferir e embalar',
    'Enviado': 'Embalado · aguardando envio', 'Entregue ao cliente': 'Separado · aguardando o cliente' };
  const atual = cancel ? 'Cancelado' : saiu ? (ret ? 'Entregue' : 'Enviado') : ESPERA[(passos.find(x => !x[1]) || [''])[0]] || 'Em andamento';
  const estado = cancel ? 'cancelado' : problemas.length ? 'problema' : saiu ? 'concluido' : 'andamento';
  return { passos, problemas, resolvidos, atual, estado, ret };
}

function vSituacao() {
  if (!SIT.lista) { if (!SIT.carregando) carregarSituacao().then(render).catch(e => { SIT.lista = []; avisar(e.message); }); return topo('Situação dos pedidos', '') + '<div class="card vazio">Carregando seus pedidos…</div>'; }
  if (Date.now() - SIT.em > 60e3 && !SIT.carregando) carregarSituacao(true).then(render).catch(() => {});
  const todos = SIT.lista.map(p => ({ p, s: passosPedido(p) }));
  const filtros = { andamento: ['Em andamento', x => x.s.estado === 'andamento'], problema: ['Com problema', x => x.s.estado === 'problema'], concluido: ['Concluídos', x => x.s.estado === 'concluido'], todos: ['Todos', () => true] };
  UI.sitFiltro = filtros[UI.sitFiltro] ? UI.sitFiltro : (todos.some(filtros.problema[1]) ? 'problema' : 'andamento');
  const lista = todos.filter(filtros[UI.sitFiltro][1]);
  const equipe = new Set(SIT.lista.map(p => p.vendedor_nome)).size > 1;
  const COR = { andamento: 'med', problema: 'ruim', concluido: 'ok', cancelado: '' };
  const card = ({ p, s }) => `<div class="card sit-card item-lista ${s.estado}">
    <div class="secao-titulo" style="margin:0;align-items:flex-start"><div><b>Pedido ${esc(p.numero || '')}</b> · ${esc(p.cliente_nome || '')}
      <br><small class="mut">${fmtCurta(p.data)} · ${R(p.valor)} · ${esc(p.pag_forma || '')}${p.pag_meio ? ' · ' + esc(p.pag_meio) : ''} · ${s.ret ? 'Retirada na loja' : '🚚 ' + esc([p.envio_forma, p.envio_servico].filter(Boolean).join(' · '))}${equipe ? ' · ' + esc(p.vendedor_nome || '') : ''}</small></div>
      <span class="tag ${COR[s.estado]}">${esc(s.atual)}</span></div>
    ${s.estado === 'cancelado' ? '' : `<ol class="sit-passos">${s.passos.map(([n, ok, q]) => `<li class="${ok ? 'ok' : ''}"><b>${n}</b>${q ? `<small>${q}</small>` : ''}</li>`).join('')}</ol>`}
    ${s.problemas.map(t => `<div class="alerta ruim" style="margin-top:6px"><span class="ic">!</span><span>${esc(t)}</span></div>`).join('')}
    ${s.resolvidos.map(o => `<div class="alerta ok" style="margin-top:6px"><span class="ic">✓</span><span>Resolvido: ${esc((TIPOS_OC[o.tipo] || TIPOS_OC.outro)[1])}${o.produto ? ' · ' + esc(o.produto) : ''}${o.solucao ? ' → ' + esc(o.solucao) : ''}</span></div>`).join('')}
    <details class="mt"><summary class="mut">${(p.itens || []).length} item(ns)</summary><table class="tabela"><tbody>${(p.itens || []).map(i => `<tr><td class="num" style="width:50px"><b>${N(i.quantidade)}×</b></td><td><b>${esc(i.codigo || '')}</b> ${esc(i.descricao || '')}</td></tr>`).join('')}</tbody></table></details></div>`;
  return topo('Situação dos pedidos', `Acompanhe seus pedidos da loja na expedição: separação, conferência, saída e problemas · últimos 30 dias`, `<button class="btn" data-a="sitAtualizar">↻ Atualizar</button>`)
    + `<div class="filtros"><div class="chips">${Object.entries(filtros).map(([k, [n, f]]) => `<button class="chip ${UI.sitFiltro === k ? 'on' : ''}" data-a="sitFiltro" data-v="${k}">${n}<span class="n">${todos.filter(f).length}</span></button>`).join('')}</div>
      <input type="search" class="busca-lista" data-filtro="sitLista" placeholder="Buscar pedido ou cliente…" autocomplete="off"></div>
    <div id="sitLista">${lista.length ? lista.map(card).join('') : '<div class="card vazio">Nenhum pedido aqui. 👏</div>'}</div>`;
}
