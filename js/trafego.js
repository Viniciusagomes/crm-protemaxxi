'use strict';
/* CRM Protemaxxi — Tráfego (Google Ads): painel, termos de pesquisa, palavras/negativas e fila de propostas.
 * Leitura vem das tabelas gads_* (sincronizadas pela função gads-sync). Mudanças na conta nunca saem daqui direto:
 * viram uma PROPOSTA (gads_acoes) que só o dono aprova; a função gads-aplicar executa e registra como desfazer. */

const TR = { d: null, per: 30, aba: 'visao', termoFiltro: 'todos', carregando: false, atualizando: false };
const veTrafego = () => ehDono() || !!EU?.permissoes?.trafego;
const TR_ACAO_ST = { proposta: ['azul', 'Aguardando aprovação'], aprovada: ['med', 'Aplicando…'], aplicada: ['ok', 'Aplicada'], recusada: ['', 'Recusada'], erro: ['ruim', 'Erro'], desfeita: ['', 'Desfeita'] };
const TR_CORRESP = { BROAD: 'ampla', PHRASE: 'frase', EXACT: 'exata' };
const TR_STATUS = { ENABLED: ['ok', 'Ativa'], PAUSED: ['med', 'Pausada'], REMOVED: ['', 'Removida'] };
const trPendentes = () => TR.d ? TR.d.acoes.filter(a => a.status === 'proposta').length : 0;

async function carregarTrafego(forcar) {
  if (TR.d && !forcar) return TR.d;
  if (TR.carregando) return TR.d;
  TR.carregando = true;
  try {
    const h = hoje(), d90 = addDias(h, -90), d60 = addDias(h, -60), d30 = addDias(h, -30);
    const [campanhas, dia, termos, palavras, negativas, conv, hora, acoes, est] = await Promise.all([
      ok(sb.from('gads_campanhas').select('*').order('nome')),
      todas(() => sb.from('gads_campanha_dia').select('*').gte('data', d90).order('data').order('campanha_id')),
      todas(() => sb.from('gads_termos').select('*').gte('data', d60).order('data').order('campanha_id').order('grupo_id').order('termo')),
      todas(() => sb.from('gads_palavras').select('*').order('custo_30d', { ascending: false }).order('grupo_id').order('criterio_id')),
      todas(() => sb.from('gads_negativas').select('*').order('recurso')),
      ok(sb.from('gads_conversao_acoes').select('*').order('id')),
      todas(() => sb.from('gads_hora').select('*').gte('data', d30).order('data').order('hora').order('aparelho')),
      ok(sb.from('gads_acoes').select('*').order('id', { ascending: false }).limit(200)),
      ok(sb.from('sync_estado').select('*').in('chave', ['gads', 'gads_varredura'])),
    ]);
    for (const e of est) D.sync[e.chave] = { ...e.valor, em_db: e.atualizado_em };
    TR.d = { campanhas, dia, termos, palavras, negativas, conv, hora, acoes, cn: Object.fromEntries(campanhas.map(c => [c.id, c.nome])) };
    return TR.d;
  } finally { TR.carregando = false; }
}

const trSoma = (rows, k) => soma(rows.map(r => +r[k] || 0));
const trDelta = (a, b, melhorSobe = true) => {
  if (!b) return '';
  const v = a / b - 1, cls = Math.abs(v) < 0.03 ? '' : (v > 0) === melhorSobe ? 'c-ok' : 'c-ruim';
  return `<span class="${cls}">${v >= 0 ? '▲' : '▼'} ${Math.round(Math.abs(v) * 100)}%</span> vs. período anterior`;
};
const trAba = (k, nome, badge) => `<button class="btn peq ${TR.aba === k ? 'pri' : ''}" data-a="trAba" data-v="${k}">${nome}${badge ? ` <b>${badge}</b>` : ''}</button>`;

function vTrafego() {
  const st = D.sync.gads || {};
  if (!st.conectado) {
    return topo('Tráfego — Google Ads', '') + `<div class="card em-breve"><h2>Google Ads não conectado</h2>
      <p class="explica">${st.erro ? `⚠ ${esc(st.erro)}<br><br>` : ''}Conectando, a Intranet passa a acompanhar gasto, cliques, conversões, termos de pesquisa e palavras-chave da conta, e o Brain consegue propor melhorias (negativas, pausas, orçamento) que você aprova aqui antes de qualquer mudança na conta.</p>
      ${ehDono() ? '<button class="btn pri" data-a="conectarGads">🔗 Conectar ao Google Ads</button>' : '<p class="mut">Peça ao administrador para conectar.</p>'}</div>`;
  }
  if (!TR.d) { carregarTrafego().then(render).catch(e => avisar(e.message)); return topo('Tráfego — Google Ads', '') + '<div class="card vazio">Carregando o Google Ads…</div>'; }
  const vs = D.sync.gads_varredura || {};
  const cab = topo('Tráfego — Google Ads', `Conta <b>${esc(st.conta || '')}</b>${st.email ? ` · acesso de ${esc(st.email)}` : ''} · ${st.ultima_sync ? 'atualizado há ' + tempoDesde(st.ultima_sync) : 'aguardando a primeira sincronização'}`,
    `<button class="btn" data-a="recarregarGads" ${TR.atualizando ? 'disabled' : ''}>${TR.atualizando ? '⏳ Atualizando…' : '↻ Sincronizar agora'}</button>`);
  const aviso = st.erro ? `<div class="card mt"><b class="c-ruim">⚠ O Google respondeu com erro:</b> ${esc(st.erro)}</div>` : '';
  const abas = `<div class="acoes mt">${trAba('visao', 'Visão geral')}${trAba('termos', 'Termos de pesquisa')}${trAba('palavras', 'Palavras e negativas')}${trAba('propostas', 'Propostas', trPendentes() || '')}${trAba('conv', 'Conversões e horários')}</div>`;
  const corpo = { visao: trVisao, termos: trTermos, palavras: trPalavras, propostas: trPropostas, conv: trConv }[TR.aba] || trVisao;
  return cab + aviso + abas + corpo(vs) + (ehDono() ? '<div class="mt"><button class="btn perigo peq" data-a="desconectarGads">Desconectar o Google Ads</button></div>' : '');
}

function trPeriodo() {
  const h = hoje(), ini = addDias(h, -(TR.per - 1)), iniAnt = addDias(h, -(2 * TR.per - 1)), fimAnt = addDias(h, -TR.per);
  return { h, ini, iniAnt, fimAnt };
}
const trSeletorPeriodo = () => `<div class="acoes">${[7, 14, 30, 60].map(n => `<button class="btn peq ${TR.per === n ? 'pri' : ''}" data-a="trPer" data-v="${n}">${n} dias</button>`).join('')}</div>`;

function trVisao() {
  const d = TR.d, { h, ini, iniAnt, fimAnt } = trPeriodo();
  const cur = d.dia.filter(r => r.data >= ini && r.data <= h), ant = d.dia.filter(r => r.data >= iniAnt && r.data <= fimAnt);
  const k = rows => { const c = trSoma(rows, 'custo'), cl = trSoma(rows, 'cliques'), im = trSoma(rows, 'impressoes'), cv = trSoma(rows, 'conversoes'); return { c, cl, im, cv, cpc: cl ? c / cl : 0, ctr: im ? cl / im : 0, cpa: cv ? c / cv : 0 }; };
  const a = k(cur), b = k(ant);
  if (!cur.length) return `<div class="card mt vazio">Ainda não há dados no período. Clique em “Sincronizar agora” (a primeira carga traz 90 dias).</div>`;

  // barras por dia
  const dias = Array.from({ length: TR.per }, (_, i) => addDias(h, -(TR.per - 1 - i)));
  const porDia = Object.fromEntries(dias.map(x => [x, cur.filter(r => r.data === x)]));
  const maxC = Math.max(1, ...dias.map(x => trSoma(porDia[x], 'custo')));
  const barras = `<div style="display:flex;align-items:flex-end;gap:2px;height:90px">${dias.map(x => { const c = trSoma(porDia[x], 'custo'), cv = trSoma(porDia[x], 'conversoes');
    return `<div title="${fmtCurta(x)}: ${R(c)} · ${N(cv)} conv." style="flex:1;height:${Math.max(2, c / maxC * 100)}%;background:${cv > 0 ? '#2e9e6b' : '#8aa0b4'};border-radius:2px 2px 0 0"></div>`; }).join('')}</div>
    <small class="mut">Cada barra é um dia (altura = gasto). Verde = teve conversão.</small>`;

  // campanhas
  const linhas = d.campanhas.map(c => {
    const r = cur.filter(x => x.campanha_id === c.id), kk = k(r), perd = media(r.map(x => x.impr_perdida_orc));
    const [cls, nome] = TR_STATUS[c.status] || ['', c.status];
    return { c, kk, perd, html: `<tr><td><b>${esc(c.nome)}</b><br><small><span class="tag ${cls}">${nome}</span> ${esc(c.estrategia_lance || '')}</small></td>
      <td class="dir">${R(c.orcamento_dia)}</td><td class="dir">${R(kk.c)}</td><td class="dir">${N(kk.cl)}</td><td class="dir">${kk.cl ? R(kk.cpc) : '—'}</td>
      <td class="dir">${N(kk.cv)}</td><td class="dir">${kk.cv ? R(kk.cpa) : '—'}</td>
      <td class="dir ${perd > 0.2 ? 'c-ruim' : ''}">${perd == null ? '—' : P(perd)}</td>
      <td class="dir">${c.status === 'ENABLED' ? `<button class="btn peq" data-a="trOrc" data-id="${c.id}">Propor orçamento</button>` : ''}</td></tr>` };
  }).sort((x, y) => y.kk.c - x.kk.c);

  return `<div class="topo mt" style="margin-bottom:0"><div></div>${trSeletorPeriodo()}</div>
    <div class="grid g4 mt">
      <div class="card kpi-card"><div class="rot">Gasto</div><div class="val">${R(a.c)}</div><div class="sub">${trDelta(a.c, b.c, false)}</div></div>
      <div class="card kpi-card"><div class="rot">Cliques · CTR</div><div class="val">${N(a.cl)}</div><div class="sub">CTR ${P(a.ctr)} · CPC médio ${a.cl ? R(a.cpc) : '—'}<br>${trDelta(a.cl, b.cl)}</div></div>
      <div class="card kpi-card"><div class="rot">Conversões</div><div class="val">${N(a.cv)}</div><div class="sub">${trDelta(a.cv, b.cv)}</div></div>
      <div class="card kpi-card"><div class="rot">Custo por conversão</div><div class="val">${a.cv ? R(a.cpa) : '—'}</div><div class="sub">${a.cv && b.cv ? trDelta(a.cpa, b.cpa, false) : 'conversão = clique no WhatsApp (intenção), não venda'}</div></div>
    </div>
    ${trAtencao(cur, linhas)}
    <div class="card mt"><h2>Gasto por dia</h2>${barras}</div>
    <div class="card mt"><div class="secao-titulo"><h2>Campanhas</h2><small>últimos ${TR.per} dias</small></div>
      <div class="rolagem"><table class="tabela"><thead><tr><th>Campanha</th><th class="dir">Orçamento/dia</th><th class="dir">Gasto</th><th class="dir">Cliques</th><th class="dir">CPC</th><th class="dir">Conv.</th><th class="dir">Custo/conv.</th><th class="dir" title="Parte das buscas em que o anúncio não apareceu por falta de orçamento">Perdeu por orçamento</th><th></th></tr></thead>
      <tbody>${linhas.map(l => l.html).join('')}</tbody></table></div></div>`;
}

/** Pontos de atenção calculados a partir dos dados (sem inventar nada). */
function trAtencao(cur, linhas) {
  const d = TR.d, itens = [];
  const { ini } = trPeriodo();
  const porTermo = trAgruparTermos(d.termos.filter(t => t.data >= ini));
  const semConv = porTermo.filter(t => t.conv === 0 && t.custo >= 10);
  if (semConv.length) itens.push(`<b>${semConv.length} termo(s)</b> gastaram ${R(soma(semConv.map(t => t.custo)))} (mínimo R$ 10 cada) sem nenhuma conversão. <a href="#/trafego" data-a="trAba" data-v="termos">Ver termos</a>`);
  const perdem = linhas.filter(l => l.c.status === 'ENABLED' && l.perd > 0.2);
  if (perdem.length) itens.push(`${perdem.map(l => '<b>' + esc(l.c.nome) + '</b>').join(', ')} perde(m) mais de 20% das buscas por falta de orçamento.`);
  const ult3 = cur.filter(r => r.data >= addDias(hoje(), -2));
  if (ult3.length && trSoma(ult3, 'custo') > 0 && trSoma(ult3, 'conversoes') === 0) itens.push(`Nos últimos 3 dias houve gasto de ${R(trSoma(ult3, 'custo'))} e nenhuma conversão (a conversão pode demorar até 72 h para aparecer).`);
  const muitas = d.conv.filter(c => c.principal && c.status === 'ENABLED' && c.contagem === 'MANY_PER_CLICK');
  if (muitas.length) itens.push(`A conversão principal <b>${esc(muitas.map(c => c.nome).join(', '))}</b> conta <b>todas</b> as ações por clique (um mesmo visitante pode contar várias vezes). Para lead, o normal é contar <b>uma</b>.`);
  if (!itens.length) return '';
  return `<div class="card mt"><h2>⚠ Pontos de atenção</h2><ul style="margin:6px 0 0 18px">${itens.map(i => `<li>${i}</li>`).join('')}</ul></div>`;
}

function trAgruparTermos(rows) {
  const m = new Map();
  for (const t of rows) {
    const k = t.termo; let o = m.get(k);
    if (!o) m.set(k, o = { termo: k, custo: 0, cliques: 0, impr: 0, conv: 0, camps: new Set() });
    o.custo += +t.custo; o.cliques += +t.cliques; o.impr += +t.impressoes; o.conv += +t.conversoes; o.camps.add(t.campanha_id);
  }
  return [...m.values()].sort((a, b) => b.custo - a.custo);
}

function trTermos() {
  const d = TR.d, { ini } = trPeriodo();
  let lista = trAgruparTermos(d.termos.filter(t => t.data >= ini));
  const negadas = new Set(d.negativas.map(n => String(n.texto).toLowerCase()));
  const total = soma(lista.map(t => t.custo)), semConv = soma(lista.filter(t => !t.conv).map(t => t.custo));
  if (TR.termoFiltro === 'sem') lista = lista.filter(t => !t.conv && t.custo > 0);
  if (TR.termoFiltro === 'com') lista = lista.filter(t => t.conv > 0);
  const filtro = (k, n) => `<button class="btn peq ${TR.termoFiltro === k ? 'pri' : ''}" data-a="trFiltro" data-v="${k}">${n}</button>`;
  return `<div class="topo mt" style="margin-bottom:0"><div></div>${trSeletorPeriodo()}</div>
    <div class="card mt"><div class="secao-titulo"><h2>Termos de pesquisa</h2><small>${trAgruparTermos(d.termos.filter(t => t.data >= ini)).length} termos · gasto ${R(total)} · <span class="c-ruim">${R(semConv)} sem conversão</span></small></div>
      <div class="acoes" style="margin:8px 0">${filtro('todos', 'Todos')}${filtro('sem', 'Gastaram sem converter')}${filtro('com', 'Converteram')}</div>
      ${lista.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Termo</th><th class="dir">Gasto</th><th class="dir">Cliques</th><th class="dir">Impr.</th><th class="dir">Conv.</th><th></th></tr></thead><tbody>
      ${lista.slice(0, 150).map(t => `<tr><td><b>${esc(t.termo)}</b>${negadas.has(t.termo.toLowerCase()) ? ' <span class="tag">já negativada</span>' : ''}<br><small>${[...t.camps].map(c => esc(d.cn[c] || c)).join(' · ')}</small></td>
        <td class="dir">${R(t.custo)}</td><td class="dir">${N(t.cliques)}</td><td class="dir">${N(t.impr)}</td><td class="dir ${t.conv ? 'c-ok' : ''}">${N(t.conv)}</td>
        <td class="dir"><button class="btn peq" data-a="trNeg" data-termo="${esc(t.termo)}" data-c="PHRASE" title="Propor negativar como frase">Negativar (frase)</button> <button class="btn peq" data-a="trNeg" data-termo="${esc(t.termo)}" data-c="EXACT" title="Propor negativar só esta busca exata">exata</button></td></tr>`).join('')}
      </tbody></table></div>${lista.length > 150 ? `<small class="mut">Mostrando 150 de ${lista.length}.</small>` : ''}` : '<div class="vazio">Nenhum termo neste filtro.</div>'}</div>`;
}

function trPalavras() {
  const d = TR.d;
  const ativas = d.palavras.filter(p => p.status !== 'REMOVED');
  return `<div class="card mt"><div class="secao-titulo"><h2>Palavras-chave</h2><small>${ativas.length} palavra(s) · dados dos últimos 30 dias</small></div>
    ${ativas.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Palavra</th><th>Campanha</th><th class="dir" title="Índice de qualidade de 1 a 10">IQ</th><th class="dir">Gasto</th><th class="dir">Cliques</th><th class="dir">Conv.</th><th></th></tr></thead><tbody>
    ${ativas.slice(0, 200).map(p => `<tr><td><b>${esc(p.texto)}</b><br><small>${TR_CORRESP[p.correspondencia] || esc(p.correspondencia || '')} · ${p.status === 'PAUSED' ? '<span class="c-med">pausada</span>' : 'ativa'}</small></td>
      <td><small>${esc(d.cn[p.campanha_id] || p.campanha_id)}</small></td><td class="dir ${p.indice_qualidade && p.indice_qualidade < 5 ? 'c-ruim' : ''}">${p.indice_qualidade ?? '—'}</td>
      <td class="dir">${R(p.custo_30d)}</td><td class="dir">${N(p.cliques_30d)}</td><td class="dir">${N(p.conversoes_30d)}</td>
      <td class="dir">${p.status === 'ENABLED' ? `<button class="btn peq" data-a="trPausar" data-g="${p.grupo_id}" data-k="${p.criterio_id}">Propor pausar</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="vazio">Sem palavras sincronizadas ainda.</div>'}</div>
    <div class="card mt"><div class="secao-titulo"><h2>Palavras negativas</h2><small>${d.negativas.length} em nível de campanha ou grupo</small></div>
    ${d.negativas.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Negativa</th><th>Onde</th><th></th></tr></thead><tbody>
    ${d.negativas.slice(0, 300).map(n => `<tr><td><b>${esc(n.texto)}</b> <small>${TR_CORRESP[n.correspondencia] || esc(n.correspondencia || '')}</small></td><td><small>${n.nivel === 'campanha' ? esc(d.cn[n.campanha_id] || n.campanha_id) : 'grupo · ' + esc(d.cn[n.campanha_id] || '')}</small></td>
      <td class="dir"><button class="btn peq" data-a="trRemNeg" data-r="${esc(n.recurso)}">Propor remover</button></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="vazio">Nenhuma negativa em campanha ou grupo. (Listas compartilhadas não aparecem aqui ainda.)</div>'}</div>`;
}

function trDescAcao(a) {
  const al = a.alvo || {}, camps = (al.campanha_ids || []).map(i => TR.d.cn[i] || i);
  if (a.tipo === 'negativa_campanha') return `Negativar <b>“${esc(al.texto)}”</b> (${TR_CORRESP[al.correspondencia] || esc(al.correspondencia)}) em ${camps.length} campanha(s): ${camps.map(esc).join(', ')}`;
  if (a.tipo === 'remover_negativa') return `Remover ${(al.recursos || []).length} negativa(s): ${esc((al.recursos || []).map(r => TR.d.negativas.find(n => n.recurso === r)?.texto || 'negativa').join(', '))}`;
  if (a.tipo === 'pausar_palavra') { const p = TR.d.palavras.find(x => x.grupo_id == al.grupo_id && x.criterio_id == al.criterio_id); return `${al.status === 'ENABLED' ? 'Reativar' : 'Pausar'} a palavra <b>${esc(p?.texto || al.criterio_id)}</b>`; }
  if (a.tipo === 'orcamento_dia') return `Orçamento diário de <b>${esc(TR.d.cn[al.campanha_id] || al.campanha_id)}</b> para <b>${R(al.novo_valor)}</b>`;
  return esc(a.tipo);
}

function trPropostas() {
  const d = TR.d, dono = ehDono();
  const bloco = a => {
    const [cls, nome] = TR_ACAO_ST[a.status] || ['', a.status], quem = a.proposto_por === 'brain' ? 'Brain' : nomeP(a.proposto_por);
    const botoes = dono && (a.status === 'proposta' || a.status === 'erro')
      ? `<button class="btn peq" data-a="trTestar" data-id="${a.id}" title="O Google confere a mudança sem aplicar">🔍 Testar no Google</button> <button class="btn pri peq" data-a="trAprovar" data-id="${a.id}">✓ Aprovar e aplicar</button> <button class="btn peq" data-a="trRecusar" data-id="${a.id}">Recusar</button>`
      : dono && a.status === 'aplicada' && a.desfazer ? `<button class="btn peq" data-a="trDesfazer" data-id="${a.id}">↩ Desfazer</button>` : '';
    return `<div class="coment"><div class="meta"><span class="tag ${cls}">${nome}</span> · proposta por ${esc(quem)} · ${new Date(a.criada_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>
      <p style="font-size:15px">${trDescAcao(a)}</p>${a.motivo ? `<p class="mut">Motivo: ${esc(a.motivo)}</p>` : ''}
      ${a.status === 'erro' && a.resultado?.erro ? `<p class="c-ruim">${esc(a.resultado.erro)}</p>` : ''}
      ${botoes ? `<div class="acoes" style="margin-top:6px">${botoes}</div>` : ''}</div>`;
  };
  const pend = d.acoes.filter(a => ['proposta', 'erro'].includes(a.status)), resto = d.acoes.filter(a => !['proposta', 'erro'].includes(a.status));
  return `<div class="card mt"><div class="secao-titulo"><h2>Aguardando decisão</h2><small>${dono ? 'Nada muda na conta até você aprovar.' : 'Só o administrador aprova.'}</small></div>
      ${pend.length ? pend.map(bloco).join('') : '<div class="vazio">Nenhuma proposta pendente.</div>'}</div>
    <div class="card mt"><h2>Histórico</h2>${resto.length ? resto.slice(0, 40).map(bloco).join('') : '<div class="vazio">Ainda não há histórico.</div>'}</div>`;
}

function trConv() {
  const d = TR.d;
  const porHora = Array.from({ length: 24 }, (_, h) => { const r = d.hora.filter(x => x.hora === h); return { h, c: trSoma(r, 'custo'), cl: trSoma(r, 'cliques'), cv: trSoma(r, 'conversoes') }; });
  const maxC = Math.max(1, ...porHora.map(x => x.c));
  const apar = {}; for (const x of d.hora) { const o = apar[x.aparelho] ||= { c: 0, cl: 0, cv: 0 }; o.c += +x.custo; o.cl += +x.cliques; o.cv += +x.conversoes; }
  const NOME_AP = { MOBILE: 'Celular', DESKTOP: 'Computador', TABLET: 'Tablet', CONNECTED_TV: 'TV', OTHER: 'Outros' };
  return `<div class="card mt"><div class="secao-titulo"><h2>Ações de conversão</h2><small>o que o Google conta como resultado</small></div>
    ${d.conv.length ? `<table class="tabela"><thead><tr><th>Nome</th><th>Situação</th><th>Principal?</th><th>Contagem</th><th class="dir">Janela</th></tr></thead><tbody>
    ${d.conv.map(c => `<tr><td><b>${esc(c.nome)}</b><br><small>${esc(c.categoria || '')}</small></td><td>${esc(c.status)}</td><td>${c.principal ? '<span class="tag ok">principal</span>' : '<span class="tag">secundária</span>'}</td>
      <td class="${c.contagem === 'MANY_PER_CLICK' ? 'c-med' : ''}">${c.contagem === 'ONE_PER_CLICK' ? 'Uma por clique' : c.contagem === 'MANY_PER_CLICK' ? 'Todas (várias por clique)' : esc(c.contagem || '')}</td><td class="dir">${c.janela_dias ?? '—'} dias</td></tr>`).join('')}
    </tbody></table>` : '<div class="vazio">Sem dados ainda.</div>'}</div>
    <div class="card mt"><div class="secao-titulo"><h2>Gasto por hora do dia</h2><small>últimos 30 dias (horário de Brasília)</small></div>
      <div style="display:flex;align-items:flex-end;gap:3px;height:110px">${porHora.map(x => `<div title="${x.h}h: ${R(x.c)} · ${N(x.cl)} cliques · ${N(x.cv)} conv." style="flex:1;height:${Math.max(2, x.c / maxC * 100)}%;background:${x.cv > 0 ? '#2e9e6b' : '#8aa0b4'};border-radius:2px 2px 0 0"></div>`).join('')}</div>
      <div style="display:flex;gap:3px;font-size:10px;color:#8aa0b4">${porHora.map(x => `<div style="flex:1;text-align:center">${x.h}</div>`).join('')}</div>
      <small class="mut">Verde = teve conversão naquela hora.</small></div>
    <div class="card mt"><h2>Por aparelho</h2>${Object.keys(apar).length ? `<table class="tabela"><thead><tr><th>Aparelho</th><th class="dir">Gasto</th><th class="dir">Cliques</th><th class="dir">Conv.</th><th class="dir">Custo/conv.</th></tr></thead><tbody>
    ${Object.entries(apar).map(([k, o]) => `<tr><td>${NOME_AP[k] || esc(k)}</td><td class="dir">${R(o.c)}</td><td class="dir">${N(o.cl)}</td><td class="dir">${N(o.cv)}</td><td class="dir">${o.cv ? R(o.c / o.cv) : '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Sem dados ainda.</div>'}</div>`;
}

// ─── ações ───
async function trProporAcao(tipo, alvo, motivo) {
  const { error } = await sb.from('gads_acoes').insert({ tipo, alvo, motivo: motivo || null, proposto_por: EU.id });
  if (error) throw new Error(error.message);
  TR.d.acoes = await ok(sb.from('gads_acoes').select('*').order('id', { ascending: false }).limit(200));
  avisar('Proposta registrada. Nada mudou na conta: o administrador aprova na aba Propostas.');
  render();
}
async function trNegativar(termo, corresp) {
  const camps = TR.d.campanhas.filter(c => c.status !== 'REMOVED').map(c => c.id);
  if (!confirm(`Propor negativar “${termo}” (${TR_CORRESP[corresp]}) em ${camps.length} campanha(s)?\n\nEla só é aplicada depois que o administrador aprovar.`)) return;
  await trProporAcao('negativa_campanha', { campanha_ids: camps, texto: termo, correspondencia: corresp }, 'Termo de pesquisa que gastou sem converter');
}
async function trPausar(grupo, crit) {
  const p = TR.d.palavras.find(x => x.grupo_id == grupo && x.criterio_id == crit);
  if (!confirm(`Propor pausar a palavra “${p?.texto || crit}”?`)) return;
  await trProporAcao('pausar_palavra', { grupo_id: +grupo, criterio_id: +crit, status: 'PAUSED' }, 'Pausar palavra');
}
async function trRemoverNeg(recurso) {
  const n = TR.d.negativas.find(x => x.recurso === recurso);
  if (!confirm(`Propor REMOVER a negativa “${n?.texto || ''}”?`)) return;
  await trProporAcao('remover_negativa', { recursos: [recurso] }, 'Remover negativa');
}
async function trOrcamento(id) {
  const c = TR.d.campanhas.find(x => x.id == id), v = prompt(`Novo orçamento diário de “${c.nome}” (hoje ${R(c.orcamento_dia)}).\nAlteração máxima de 50% por vez.`, String(c.orcamento_dia || ''));
  if (v == null) return;
  const n = parseFloat(String(v).replace(',', '.'));
  if (!(n > 0)) return avisar('Valor inválido.');
  await trProporAcao('orcamento_dia', { campanha_id: +id, novo_valor: n }, 'Ajuste de orçamento diário');
}
async function trDecidir(acao, id) {
  const a = TR.d.acoes.find(x => x.id == id);
  try {
    if (acao === 'aprovar' && !confirm(`Aplicar agora na conta do Google Ads?\n\n${trDescAcao(a).replace(/<[^>]+>/g, '')}`)) return;
    if (acao === 'desfazer' && !confirm('Desfazer esta mudança na conta do Google Ads?')) return;
    const motivo = acao === 'recusar' ? (prompt('Motivo da recusa (opcional):') ?? '') : undefined;
    const r = await chamarFuncao('gads-aplicar', { acao, id, motivo });
    avisar(acao === 'testar' ? (r.mensagem || 'O Google aceitou.') : acao === 'aprovar' ? 'Aplicado no Google Ads.' : acao === 'desfazer' ? 'Desfeito.' : 'Recusada.');
  } catch (e) { avisar(e.message); }
  await carregarTrafego(true).catch(() => {}); render();
}
async function trSincronizar() {
  TR.atualizando = true; render();
  try { const r = await chamarFuncao('gads-sync', { acao: 'sincronizar', completo: true }); avisar(r.erro ? r.erro : 'Google Ads atualizado.'); }
  catch (e) { avisar(e.message); }
  TR.atualizando = false;
  await carregarTrafego(true).catch(() => {}); render();
}
