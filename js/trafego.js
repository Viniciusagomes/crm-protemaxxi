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
    const [campanhas, dia, termos, palavras, negativas, conv, hora, acoes, est, leads, grupos, anuncios, recursos, locais, recom, mudancas] = await Promise.all([
      ok(sb.from('gads_campanhas').select('*').order('nome')),
      todas(() => sb.from('gads_campanha_dia').select('*').gte('data', d90).order('data').order('campanha_id')),
      todas(() => sb.from('gads_termos').select('*').gte('data', d60).order('data').order('campanha_id').order('grupo_id').order('termo')),
      todas(() => sb.from('gads_palavras').select('*').order('custo_30d', { ascending: false }).order('grupo_id').order('criterio_id')),
      todas(() => sb.from('gads_negativas').select('*').order('recurso')),
      ok(sb.from('gads_conversao_acoes').select('*').order('id')),
      todas(() => sb.from('gads_hora').select('*').gte('data', d30).order('data').order('hora').order('aparelho')),
      ok(sb.from('gads_acoes').select('*').order('id', { ascending: false }).limit(200)),
      ok(sb.from('sync_estado').select('*').in('chave', ['gads', 'gads_varredura'])),
      todas(() => sb.from('ads_leads').select('*').gte('criado_em', d90 + 'T00:00:00').order('criado_em', { ascending: false }).order('id', { ascending: false })),
      ok(sb.from('gads_grupos').select('*').order('id')),
      ok(sb.from('gads_anuncios').select('*').order('custo_30d', { ascending: false })),
      ok(sb.from('gads_recursos').select('*').order('recurso')),
      todas(() => sb.from('gads_locais').select('*').order('custo_30d', { ascending: false }).order('cidade_id')),
      ok(sb.from('gads_recomendacoes').select('*').order('tipo')),
      ok(sb.from('gads_mudancas').select('*').order('em', { ascending: false }).limit(300)),
    ]);
    for (const e of est) D.sync[e.chave] = { ...e.valor, em_db: e.atualizado_em };
    TR.d = { campanhas, dia, termos, palavras, negativas, conv, hora, acoes, leads, grupos, anuncios, recursos, locais, recom, mudancas, gn: Object.fromEntries(grupos.map(g => [g.id, g.nome])), cn: Object.fromEntries(campanhas.map(c => [c.id, c.nome])) };
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
  const abas = `<div class="acoes mt">${trAba('visao', 'Visão geral')}${trAba('termos', 'Termos de pesquisa')}${trAba('palavras', 'Palavras e negativas')}${trAba('anuncios', 'Anúncios e extensões')}${trAba('cidades', 'Cidades')}${trAba('leads', 'Leads (landing)')}${trAba('propostas', 'Propostas', trPendentes() || '')}${trAba('conv', 'Conversões e horários')}${trAba('google', 'Sugestões e mudanças')}</div>`;
  const corpo = { visao: trVisao, termos: trTermos, palavras: trPalavras, anuncios: trAnuncios, cidades: trCidades, google: trGoogle, leads: trLeads, propostas: trPropostas, conv: trConv }[TR.aba] || trVisao;
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
  itens.push(...trDiagnostico());
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
    ${ativas.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Palavra</th><th>Campanha</th><th class="dir" title="Índice de qualidade de 1 a 10">IQ</th><th title="Os 3 componentes do índice: CTR esperada · relevância do anúncio · experiência na página">Componentes</th><th class="dir">Gasto</th><th class="dir">Cliques</th><th class="dir">Conv.</th><th></th></tr></thead><tbody>
    ${ativas.slice(0, 200).map(p => `<tr><td><b>${esc(p.texto)}</b><br><small>${TR_CORRESP[p.correspondencia] || esc(p.correspondencia || '')} · ${p.status === 'PAUSED' ? '<span class="c-med">pausada</span>' : 'ativa'}</small></td>
      <td><small>${esc(d.cn[p.campanha_id] || p.campanha_id)}</small></td><td class="dir ${p.indice_qualidade && p.indice_qualidade < 5 ? 'c-ruim' : ''}">${p.indice_qualidade ?? '—'}</td><td><small>${trIQ(p)}</small></td>
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
  if (a.tipo === 'local_presenca') return `Segmentação de local <b>${al.valor === 'PRESENCE_OR_INTEREST' ? '“presença ou interesse”' : '“presença” (só quem está na região)'}</b> em ${camps.length} campanha(s): ${camps.map(esc).join(', ')}`;
  if (a.tipo === 'vincular_extensoes') {
    const nomes = (al.asset_ids || []).map(i => TR.d.recursos.find(r => r.asset_id == i)?.texto || i);
    return `Colocar ${nomes.length} ${esc((TR_CAMPO[al.campo] || al.campo).toLowerCase())} (${nomes.map(n => '“' + esc(n) + '”').join(', ')}) em ${camps.length} campanha(s): ${camps.map(esc).join(', ')}`;
  }
  if (a.tipo === 'telefone_chamada') {
    const f = String(al.telefone || '').replace(/\D/g, ''), fmt = f.length === 11 ? `(${f.slice(0, 2)}) ${f.slice(2, 7)}-${f.slice(7)}` : f ? `(${f.slice(0, 2)}) ${f.slice(2, 6)}-${f.slice(6)}` : '';
    return `${fmt ? `Trocar o telefone da extensão de chamada para <b>${fmt}</b>` : '<b>Tirar</b> a extensão de chamada'} em ${camps.length} campanha(s): ${camps.map(esc).join(', ')}`;
  }
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

// ─── Leads da landing (fase G2): cada clique no WhatsApp / formulário / chatbot com o código "(Ref XXXXX)" e a campanha de origem ───
const ADS_ETAPAS = [['clique', 'Clicou'], ['conversa', 'Conversou'], ['qualificado', 'Qualificado'], ['orcamento', 'Orçamento'], ['venda', 'Venda'], ['perdido', 'Perdido']];
const ADS_TIPO = { whatsapp: '💬 WhatsApp', formulario: '📝 Formulário', chatbot: '🤖 Chatbot' };
function trLeads() {
  const per = TR.per, desde = addDias(hoje(), -per), L = (TR.d.leads || []).filter(l => l.criado_em.slice(0, 10) >= desde);
  const deAnuncio = L.filter(l => l.gclid || l.gbraid || l.wbraid || l.campanha_id);
  const custo = id => trSoma(TR.d.dia.filter(d => d.campanha_id === id && d.data >= desde), 'custo');
  const porCamp = Object.values(L.reduce((a, l) => { const k = l.campanha_id || (l.gclid || l.gbraid || l.wbraid ? 'sem_id' : 'organico');
    (a[k] ||= { k, n: 0, qual: 0, venda: 0 }); a[k].n++; if (['qualificado', 'orcamento', 'venda'].includes(l.etapa)) a[k].qual++; if (l.etapa === 'venda') a[k].venda++; return a; }, {})).sort((a, b) => b.n - a.n);
  const nomeK = k => k === 'organico' ? 'Sem anúncio (orgânico / direto)' : k === 'sem_id' ? 'Anúncio (campanha sem ID no link)' : (TR.d.cn[k] || `Campanha ${k}`);
  const porVend = Object.entries(L.reduce((a, l) => { const k = l.vendedor_nome || '—'; a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const botoesPer = [7, 30, 90].map(n => `<button class="btn peq ${per === n ? 'pri' : ''}" data-a="trPer" data-v="${n}">${n} dias</button>`).join('');
  if (!(TR.d.leads || []).length) return `<div class="card mt"><h2>Leads da landing</h2><p class="explica">Ainda não chegou nenhum lead. Depois que a landing for publicada com o rastreio, cada clique em "Falar no WhatsApp", formulário ou chatbot aparece aqui com o código <b>(Ref XXXXX)</b> que vai no fim da mensagem, a campanha, a palavra-chave e o vendedor sorteado.
    <br><br><b>Falta 1 passo no Google Ads:</b> em Administrador → Configurações da conta → Rastreamento → <b>Sufixo do URL final</b>, colar:<br><code>utm_source=google&amp;utm_medium=cpc&amp;utm_campaign={campaignid}&amp;utm_content={adgroupid}&amp;utm_term={keyword}&amp;mt={matchtype}&amp;dev={device}</code></p></div>`;
  return `<div class="acoes mt">${botoesPer}</div>
    <div class="grid g4 mt"><div class="card kpi-card"><div class="rot">Leads da landing</div><div class="val">${L.length}</div><div class="sub">${Object.entries(ADS_TIPO).map(([k, n]) => `${n} ${L.filter(l => l.tipo === k).length}`).join(' · ')}</div></div>
      <div class="card kpi-card"><div class="rot">Vieram de anúncio</div><div class="val">${deAnuncio.length}</div><div class="sub">${L.length ? Math.round(deAnuncio.length / L.length * 100) : 0}% com clique do Google</div></div>
      <div class="card kpi-card"><div class="rot">Com telefone</div><div class="val">${L.filter(l => l.fone).length}</div><div class="sub">${L.filter(l => l.cliente_chave).length} já são clientes</div></div>
      <div class="card kpi-card"><div class="rot">Qualificados / vendas</div><div class="val">${L.filter(l => ['qualificado', 'orcamento', 'venda'].includes(l.etapa)).length} / ${L.filter(l => l.etapa === 'venda').length}</div><div class="sub">marcados pelos vendedores</div></div></div>
    <div class="grid g2 mt"><div class="card"><h2>Por campanha</h2><table class="tabela"><thead><tr><th>Campanha</th><th class="dir">Leads</th><th class="dir">Qualif.</th><th class="dir">Vendas</th><th class="dir">Custo/lead</th></tr></thead><tbody>
      ${porCamp.map(c => { const cu = typeof c.k === 'number' ? custo(c.k) : 0; return `<tr><td>${esc(nomeK(c.k))}</td><td class="dir"><b>${c.n}</b></td><td class="dir">${c.qual}</td><td class="dir">${c.venda}</td><td class="dir">${cu ? R(cu / c.n) : '—'}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="card"><h2>Por vendedor (roleta)</h2><table class="tabela"><tbody>${porVend.map(([v, n]) => `<tr><td>${esc(v)}</td><td class="dir"><b>${n}</b></td></tr>`).join('') || '<tr><td class="mut">—</td></tr>'}</tbody></table></div></div>
    <div class="card mt"><div class="secao-titulo"><h2>Últimos leads</h2><small>o código é o mesmo que chega no fim da mensagem do WhatsApp</small></div>
      ${listaCurta('adsLeads', `<table class="tabela"><thead><tr><th>Quando</th><th>Código</th><th>Origem</th><th>Campanha / palavra</th><th>Vendedor</th><th>Contato</th><th>Etapa</th></tr></thead><tbody>
      ${L.slice(0, 300).map(l => `<tr><td><small>${dataHora(l.criado_em)}</small></td><td><b>${esc(l.codigo)}</b></td><td><small>${ADS_TIPO[l.tipo] || esc(l.tipo)}${l.botao ? '<br>' + esc(l.botao) : ''}</small></td>
        <td><small>${l.campanha_id ? esc(TR.d.cn[l.campanha_id] || l.campanha_id) : l.gclid || l.gbraid || l.wbraid ? 'anúncio' : '<span class="mut">orgânico</span>'}${l.utm_term ? '<br>“' + esc(l.utm_term) + '”' : ''}${l.aparelho ? ' · ' + esc({ m: 'celular', c: 'computador', t: 'tablet' }[l.aparelho] || l.aparelho) : ''}</small></td>
        <td><small>${esc(l.vendedor_nome || '—')}</small></td>
        <td><small>${esc(l.nome || '')}${l.fone ? '<br>' + esc(foneFmt(l.fone)) : ''}${l.cliente_chave ? `<br><a href="#" data-a="verCliente" data-chave="${esc(l.cliente_chave)}">ver cliente</a>` : ''}${l.interesse || l.produto ? '<br>' + esc([l.interesse, l.produto].filter(Boolean).join(' · ')) : ''}</small></td>
        <td><select data-c="adsEtapa" data-id="${l.id}">${ADS_ETAPAS.map(([k, n]) => `<option value="${k}" ${l.etapa === k ? 'selected' : ''}>${n}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="7" class="vazio">Nenhum lead no período.</td></tr>'}
      </tbody></table>`, 'Buscar código, nome, telefone, palavra…')}</div>`;
}
async function adsEtapa(id, etapa) {
  const l = (TR.d?.leads || []).find(x => String(x.id) === String(id)); if (!l) return;
  let motivo = null;
  if (etapa === 'perdido') { motivo = prompt('Motivo da perda (vigilância, curioso, fora de área, preço, sem estoque…):'); if (motivo == null) return render(); }
  const r = await ok(sb.from('ads_leads').update({ etapa, motivo_perda: motivo, atualizado_em: new Date().toISOString() }).eq('id', id).select().single());
  Object.assign(l, r); avisar(`Lead ${l.codigo}: ${ADS_ETAPAS.find(e => e[0] === etapa)?.[1]}.`); render();
}

// ─── foto completa da conta: anúncios, extensões, cidades, sugestões do Google e histórico de mudanças ───
const TR_IQ = { ABOVE_AVERAGE: ['c-ok', 'acima'], AVERAGE: ['', 'na média'], BELOW_AVERAGE: ['c-ruim', 'abaixo'] };
const trIQ = p => [['iq_ctr', 'CTR'], ['iq_anuncio', 'anúncio'], ['iq_pagina', 'página']].map(([k, n]) => { const [cls, t] = TR_IQ[p[k]] || ['mut', '—']; return `${n} <span class="${cls}">${t}</span>`; }).join(' · ');
const TR_FORCA = { EXCELLENT: ['ok', 'Excelente'], GOOD: ['ok', 'Boa'], AVERAGE: ['med', 'Média'], POOR: ['ruim', 'Fraca'], PENDING: ['', 'Calculando'], NO_ADS: ['', 'Sem anúncio'] };
const TR_CAMPO = { SITELINK: 'Sitelinks', CALLOUT: 'Frases de destaque', CALL: 'Telefone', STRUCTURED_SNIPPET: 'Snippets estruturados', BUSINESS_NAME: 'Nome da empresa', BUSINESS_LOGO: 'Logo', AD_IMAGE: 'Imagens', MARKETING_IMAGE: 'Imagens', SQUARE_MARKETING_IMAGE: 'Imagens', LANDSCAPE_LOGO: 'Logo', LOGO: 'Logo', PRICE: 'Preços', PROMOTION: 'Promoção', LEAD_FORM: 'Formulário', MOBILE_APP: 'App', HEADLINE: 'Títulos', DESCRIPTION: 'Descrições', LONG_HEADLINE: 'Títulos longos', YOUTUBE_VIDEO: 'Vídeos', LOCATION: 'Local' };
const TR_RECOM = {
  KEYWORD: ['Adicionar palavras-chave', 'Avalie uma a uma: o Google sugere termos amplos que nem sempre são o seu cliente.'],
  USE_BROAD_MATCH_KEYWORD: ['Trocar para correspondência ampla', '⚠ Cuidado: com conversão = clique no WhatsApp, a ampla tende a trazer curioso. Só depois da fase G4 (conversão de venda).'],
  DISPLAY_EXPANSION_OPT_IN: ['Ligar a Rede de Display', '⚠ Não recomendado: mistura Display na campanha de Pesquisa e piora a qualidade dos leads.'],
  SEARCH_PARTNERS_OPT_IN: ['Ligar parceiros de pesquisa', '⚠ Não recomendado agora: tráfego de sites parceiros costuma converter pior.'],
  PERFORMANCE_MAX_OPT_IN: ['Criar Performance Max', 'Só faz sentido com conversão de venda (offline) — ver playbook.'],
  CAMPAIGN_BUDGET: ['Aumentar orçamento', 'A campanha está limitada pelo orçamento.'], MARGINAL_ROI_CAMPAIGN_BUDGET: ['Ajustar orçamento (retorno marginal)', 'O Google estima mais conversões com mais verba.'],
  SET_TARGET_CPA: ['Definir CPA desejado', 'Só quando a conversão principal medir venda/lead qualificado.'], MAXIMIZE_CONVERSIONS_OPT_IN: ['Maximizar conversões', ''],
  SITELINK_ASSET: ['Adicionar sitelinks', 'Vale a pena: mais área do anúncio e mais caminhos para o cliente.'], CALLOUT_ASSET: ['Adicionar frases de destaque', 'Vale a pena.'],
  CALL_ASSET: ['Adicionar telefone', 'Confira o número antes (a loja atende pelo WhatsApp).'], RESPONSIVE_SEARCH_AD_IMPROVE_AD_STRENGTH: ['Melhorar a força do anúncio', 'Mais títulos variados e com a palavra-chave.'],
  RESPONSIVE_SEARCH_AD_ASSET: ['Adicionar títulos/descrições', ''], RESPONSIVE_SEARCH_AD: ['Adicionar anúncio responsivo', ''], IMAGE_ASSET: ['Adicionar imagens', ''], LEAD_FORM_ASSET: ['Adicionar formulário de lead', ''],
};
const TR_OP = { CREATE: 'criou', UPDATE: 'alterou', REMOVE: 'removeu' };
const TR_REC_TIPO = { CAMPAIGN: 'campanha', CAMPAIGN_BUDGET: 'orçamento', AD_GROUP: 'grupo de anúncios', AD_GROUP_AD: 'anúncio', AD: 'anúncio', AD_GROUP_CRITERION: 'palavra-chave / segmentação do grupo', CAMPAIGN_CRITERION: 'segmentação / negativa da campanha', ASSET: 'recurso (extensão, imagem, texto)', CAMPAIGN_ASSET: 'extensão da campanha', CUSTOMER_ASSET: 'extensão da conta', AD_GROUP_ASSET: 'extensão do grupo', AD_GROUP_BID_MODIFIER: 'ajuste de lance', FEED: 'feed', FEED_ITEM: 'item de feed' };
const TR_ORIGEM = { GOOGLE_ADS_WEB_CLIENT: 'painel do Google Ads', GOOGLE_ADS_RECOMMENDATIONS: 'recomendação aplicada', GOOGLE_ADS_AUTOMATED_RULE: 'regra automática', GOOGLE_ADS_SCRIPTS: 'script', GOOGLE_ADS_BULK_UPLOAD: 'envio em massa', GOOGLE_ADS_API: 'API (Intranet)', GOOGLE_ADS_EDITOR: 'Google Ads Editor', GOOGLE_ADS_MOBILE_APP: 'app do celular', INTERNAL_TOOL: 'equipe do Google', OTHER: 'outro' };
/** Extensão que não combina com a loja (restos de outro negócio na mesma conta). */
const trExtSuspeita = r => /curso|hotmart|aula|treinamento|apostila|certificado|m[oó]dulo/i.test(`${r.texto || ''} ${r.detalhe || ''}`);
/** Cidades: o Google manda a mesma cidade com 2 IDs (cidade e município) — somo pelo nome. */
function trCidadesAgrupadas() {
  const m = new Map();
  for (const l of TR.d.locais) { const uf = l.uf && l.uf.length === 2 ? l.uf : 'SP?', k = `${l.cidade}|${uf}`; const o = m.get(k) || { cidade: l.cidade, uf, c: 0, cl: 0, im: 0, cv: 0 };
    o.c += +l.custo_30d; o.cl += +l.cliques_30d; o.im += +l.impressoes_30d; o.cv += +l.conversoes_30d; m.set(k, o); }
  return [...m.values()].sort((a, b) => b.c - a.c);
}

/** Diagnóstico automático com a foto completa (entra nos Pontos de atenção da Visão geral). */
function trDiagnostico() {
  const d = TR.d, it = [];
  const ativas = d.palavras.filter(p => p.status === 'ENABLED'), gasto = soma(ativas.map(p => +p.custo_30d));
  const pagRuim = ativas.filter(p => p.iq_pagina === 'BELOW_AVERAGE'), gPag = soma(pagRuim.map(p => +p.custo_30d));
  if (gasto && gPag / gasto > 0.3) it.push(`<b>${P(gPag / gasto)} do gasto das palavras</b> (${R(gPag)} em 30 dias) está com <b>experiência na página abaixo da média</b>. Todos os anúncios levam para a mesma página: uma página por assunto (portão, câmeras, alarme, monitoramento) com o mesmo texto da busca costuma baixar o CPC. <a href="#/trafego" data-a="trAba" data-v="palavras">Ver palavras</a>`);
  const ctrRuim = ativas.filter(p => p.iq_ctr === 'BELOW_AVERAGE'), gCtr = soma(ctrRuim.map(p => +p.custo_30d));
  if (gasto && gCtr / gasto > 0.3) it.push(`${P(gCtr / gasto)} do gasto está em palavras com <b>CTR esperada abaixo da média</b>: o título não está “respondendo” a busca. Colocar a palavra-chave no título 1 e usar mais sitelinks/frases ajuda.`);
  const fracos = d.anuncios.filter(a => a.status === 'ENABLED' && ['AVERAGE', 'POOR'].includes(a.forca));
  if (fracos.length) it.push(`<b>${fracos.length} anúncio(s)</b> com força <b>média ou fraca</b>, somando ${R(soma(fracos.map(a => +a.custo_30d)))} em 30 dias: ${fracos.map(a => esc(d.cn[a.campanha_id] || a.campanha_id) + ' › ' + esc(d.gn[a.grupo_id] || a.grupo_id)).join('; ')}. <a href="#/trafego" data-a="trAba" data-v="anuncios">Ver anúncios</a>`);
  const repr = d.anuncios.filter(a => a.status === 'ENABLED' && a.aprovacao && !['APPROVED', 'APPROVED_LIMITED'].includes(a.aprovacao));
  if (repr.length) it.push(`<b class="c-ruim">${repr.length} anúncio(s) não aprovados</b> pelo Google. <a href="#/trafego" data-a="trAba" data-v="anuncios">Ver</a>`);
  const cid = trCidadesAgrupadas(), totC = soma(cid.map(c => c.c)), fora = cid.filter(c => c.uf !== 'SP' && c.uf !== 'SP?'), gFora = soma(fora.map(c => c.c));
  const interesse = d.campanhas.filter(c => c.status === 'ENABLED' && c.local_tipo === 'PRESENCE_OR_INTEREST');
  if (gFora >= 50) it.push(`${R(gFora)} (${P(gFora / totC)}) foram gastos <b>fora de SP</b> (${fora.length} cidades, ex.: ${fora.slice(0, 3).map(c => esc(c.cidade)).join(', ')}). ${interesse.length ? `<b>${interesse.length} campanha(s)</b> estão em “presença <b>ou interesse</b>”` : 'Sinal de segmentação em “presença ou interesse”'}: trocar para “<b>presença</b>” (pessoas que estão na região). <a href="#/trafego" data-a="trAba" data-v="cidades">Ver cidades</a>`);
  const cidSem = cid.filter(c => c.cv === 0 && c.c >= 30);
  if (cidSem.length) it.push(`${cidSem.length} cidade(s) gastaram R$ 30 ou mais sem conversão: ${cidSem.slice(0, 5).map(c => `${esc(c.cidade)} (${R(c.c)})`).join(', ')}.`);
  const susp = d.recursos.filter(r => r.status === 'ENABLED' && trExtSuspeita(r));
  if (susp.length) it.push(`<b class="c-ruim">${susp.length} extensão(ões) parecem de outro negócio</b> (curso/aula): ${susp.slice(0, 3).map(r => '“' + esc(r.texto) + '”').join(', ')}. Elas aparecem nos anúncios da loja. <a href="#/trafego" data-a="trAba" data-v="anuncios">Ver extensões</a>`);
  const temSL = id => d.recursos.some(r => r.status === 'ENABLED' && r.campo === 'SITELINK' && (r.nivel === 'conta' || r.campanha_id === id));
  const semSL = d.campanhas.filter(c => c.status === 'ENABLED' && c.canal === 'SEARCH' && !temSL(c.id));
  if (semSL.length) it.push(`${semSL.map(c => '<b>' + esc(c.nome) + '</b>').join(', ')} não tem <b>sitelinks</b>: o anúncio fica menor que o da concorrência. Vale criar 4 sitelinks (ex.: Câmeras, Portão, Alarme, Fale no WhatsApp).`);
  const tels = [...new Set(d.recursos.filter(r => r.status === 'ENABLED' && r.campo === 'CALL').map(r => r.texto))];
  if (tels.length) it.push(`Telefone(s) nas extensões de chamada: <b>${tels.map(esc).join(', ')}</b>. Confira se é o número que atende hoje.`);
  const recentes = d.mudancas.filter(m => Date.now() - Date.parse(m.em) < 3 * 864e5 && ['CAMPAIGN', 'CAMPAIGN_BUDGET', 'AD_GROUP', 'AD_GROUP_AD'].includes(m.recurso_tipo));
  if (recentes.length) it.push(`Houve ${recentes.length} mudança(s) em campanha/orçamento/anúncio nos últimos 3 dias: espere ~7 dias antes de julgar o resultado (o Google reaprende). <a href="#/trafego" data-a="trAba" data-v="google">Ver histórico</a>`);
  const ruins = d.recom.filter(r => ['DISPLAY_EXPANSION_OPT_IN', 'SEARCH_PARTNERS_OPT_IN', 'USE_BROAD_MATCH_KEYWORD'].includes(r.tipo));
  if (ruins.length) it.push(`O Google está sugerindo ${ruins.length} mudança(s) que <b>não</b> convém aceitar agora (Display, parceiros, correspondência ampla). <a href="#/trafego" data-a="trAba" data-v="google">Ver sugestões</a>`);
  return it;
}

function trAnuncios() {
  const d = TR.d;
  const chips = (l, max) => (l || []).map(h => `<span class="tag" title="${h.fixo ? 'fixado em ' + esc(h.fixo) : ''}" style="margin:2px;display:inline-block;max-width:100%;white-space:normal;text-align:left">${esc(h.t)}${h.fixo ? ' 📌' : ''}</span>`).join('') + ((l || []).length < max ? ` <small class="c-med">(${(l || []).length} de ${max})</small>` : '');
  const ads = d.anuncios.map(a => {
    const [cls, f] = TR_FORCA[a.forca] || ['', a.forca || '—'];
    const repr = (a.reprovacoes || []).filter(r => r.topico);
    return `<div class="coment"><div class="meta"><b>${esc(d.cn[a.campanha_id] || a.campanha_id)}</b> › ${esc(d.gn[a.grupo_id] || a.grupo_id)} · <span class="tag ${cls}">força ${f}</span>
        ${a.aprovacao && a.aprovacao !== 'APPROVED' ? `<span class="tag ${a.aprovacao === 'APPROVED_LIMITED' ? 'med' : 'ruim'}">${esc(a.aprovacao === 'APPROVED_LIMITED' ? 'aprovado com limitação' : a.aprovacao)}</span>` : ''}
        ${a.status !== 'ENABLED' ? '<span class="tag">pausado</span>' : ''} · ${R(a.custo_30d)} · ${N(a.cliques_30d)} cliques · ${N(a.conversoes_30d)} conv.${a.conversoes_30d > 0 ? ' · ' + R(a.custo_30d / a.conversoes_30d) + '/conv.' : ''}</div>
      ${a.titulos ? `<div style="margin-top:4px"><small class="mut">Títulos</small><br>${chips(a.titulos, 15)}</div><div style="margin-top:4px"><small class="mut">Descrições</small><br>${chips(a.descricoes, 4)}</div>` : `<small class="mut">${esc((a.tipo || '').replace(/_/g, ' ').toLowerCase())} (imagens/vídeo: veja no Google Ads)</small>`}
      ${repr.length ? `<p class="c-ruim">Política: ${repr.map(r => esc(r.topico)).join(', ')}</p>` : ''}
      <small class="mut">${(a.urls || []).map(esc).join(' · ')}</small></div>`;
  }).join('');
  const porCampo = {};
  for (const r of d.recursos.filter(r => r.status !== 'REMOVED')) (porCampo[TR_CAMPO[r.campo] || r.campo] ||= []).push(r);
  const ext = Object.entries(porCampo).sort((a, b) => b[1].length - a[1].length).map(([campo, l]) => `<tr><td><b>${esc(campo)}</b><br><small class="mut">${l.length}</small></td><td>${l.map(r =>
    `<div style="margin:2px 0">${trExtSuspeita(r) ? '⚠ ' : ''}<span class="${trExtSuspeita(r) ? 'c-ruim' : ''}">${esc(r.texto || '—')}</span>${r.detalhe ? ` <small class="mut">${esc(r.detalhe)}</small>` : ''} <small class="tag">${r.nivel === 'conta' ? 'toda a conta' : esc(d.cn[r.campanha_id] || r.campanha_id)}</small>${r.status === 'PAUSED' ? ' <small class="tag med">pausada</small>' : ''}</div>`).join('')}</td></tr>`).join('');
  return `<div class="card mt"><div class="secao-titulo"><h2>Anúncios</h2><small>${d.anuncios.length} anúncio(s) · gasto dos últimos 30 dias · 📌 = título fixado</small></div>
      <p class="explica">A <b>força</b> é a nota do Google para a variedade de títulos (o ideal é 15 títulos diferentes, com a palavra-chave em alguns, e 4 descrições). Força “Média” ou “Fraca” aparece menos e paga mais caro.</p>
      ${ads || '<div class="vazio">Sem anúncios sincronizados ainda (clique em “Sincronizar agora”).</div>'}</div>
    <div class="card mt"><div class="secao-titulo"><h2>Extensões e recursos</h2><small>da conta (valem para todas as campanhas) e de cada campanha</small></div>
      ${ext ? `<div class="rolagem"><table class="tabela"><tbody>${ext}</tbody></table></div>` : '<div class="vazio">Sem extensões sincronizadas ainda.</div>'}</div>`;
}

function trCidades() {
  const cid = trCidadesAgrupadas(), tot = soma(cid.map(c => c.c)), totCv = soma(cid.map(c => c.cv));
  const porUF = {}; for (const c of cid) { const o = porUF[c.uf] ||= { c: 0, cv: 0, n: 0 }; o.c += c.c; o.cv += c.cv; o.n++; }
  const ufs = Object.entries(porUF).sort((a, b) => b[1].c - a[1].c);
  return `<div class="grid g2 mt"><div class="card"><h2>Por estado</h2><table class="tabela"><thead><tr><th>UF</th><th class="dir">Cidades</th><th class="dir">Gasto</th><th class="dir">%</th><th class="dir">Conv.</th></tr></thead><tbody>
      ${ufs.map(([uf, o]) => `<tr><td><b>${esc(uf)}</b></td><td class="dir">${o.n}</td><td class="dir">${R(o.c)}</td><td class="dir">${tot ? P(o.c / tot) : '—'}</td><td class="dir">${N(o.cv)}</td></tr>`).join('')}</tbody></table></div>
    <div class="card"><h2>Como ler</h2><p class="explica">É onde a pessoa estava (ou o lugar que pesquisou) quando clicou, nos últimos 30 dias. Total: ${R(tot)} e ${N(totCv)} conversões.
      Gasto fora da região de atendimento costuma vir da opção “presença <b>ou interesse</b>” na segmentação de local: a recomendação é “<b>presença</b>”.</p></div></div>
    <div class="card mt"><div class="secao-titulo"><h2>Cidades</h2><small>${cid.length} cidades · ordenado pelo gasto</small></div>
      <div class="rolagem"><table class="tabela"><thead><tr><th>Cidade</th><th>UF</th><th class="dir">Gasto</th><th class="dir">Cliques</th><th class="dir">Conv.</th><th class="dir">Custo/conv.</th></tr></thead><tbody>
      ${cid.slice(0, 150).map(c => `<tr class="${c.uf !== 'SP' && c.uf !== 'SP?' ? 'c-med' : ''}"><td><b>${esc(c.cidade)}</b></td><td>${esc(c.uf)}</td><td class="dir">${R(c.c)}</td><td class="dir">${N(c.cl)}</td>
        <td class="dir ${c.cv === 0 && c.c >= 30 ? 'c-ruim' : ''}">${N(c.cv)}</td><td class="dir">${c.cv ? R(c.c / c.cv) : '—'}</td></tr>`).join('')}
      </tbody></table></div>${cid.length > 150 ? `<small class="mut">Mostrando 150 de ${cid.length}.</small>` : ''}</div>`;
}

function trGoogle() {
  const d = TR.d;
  const imp = r => { const b = r.impacto?.baseMetrics || {}, p = r.impacto?.potentialMetrics || {}; const n0 = v => +v || 0, dc = n0(p.conversions) - n0(b.conversions), dk = (n0(p.costMicros) - n0(b.costMicros)) / 1e6;
    return dc || dk ? `${dc ? `${dc > 0 ? '+' : ''}${N(dc)} conv./semana` : ''}${dk ? ` · ${dk > 0 ? '+' : ''}${R(dk)}/semana` : ''}` : ''; };
  const grupos = Object.values(d.recom.reduce((a, r) => { const k = r.tipo + '|' + (r.campanha_id || ''); (a[k] ||= { ...r, n: 0 }).n++; return a; }, {}));
  const rec = grupos.sort((a, b) => b.n - a.n).map(r => { const [nome, nota] = TR_RECOM[r.tipo] || [r.tipo.replace(/_/g, ' ').toLowerCase(), ''];
    return `<tr><td><b>${esc(nome)}</b>${r.n > 1 ? ` <span class="tag">${r.n}</span>` : ''}<br><small class="${nota.startsWith('⚠') ? 'c-med' : 'mut'}">${esc(nota)}</small></td><td><small>${r.campanha_id ? esc(d.cn[r.campanha_id] || r.campanha_id) : 'conta'}</small></td><td class="dir"><small>${imp(r)}</small></td></tr>`; }).join('');
  const mud = d.mudancas.slice(0, 150).map(m => `<tr><td><small>${dataHora(m.em)}</small></td><td><small>${esc(m.usuario || '—')}<br><span class="mut">${esc(TR_ORIGEM[m.origem] || m.origem || '')}</span></small></td>
      <td><small>${esc(TR_OP[m.operacao] || m.operacao || '')} ${esc(TR_REC_TIPO[m.recurso_tipo] || (m.recurso_tipo || '').toLowerCase())}${m.campanha ? ' · <b>' + esc(m.campanha) + '</b>' : ''}</small></td>
      <td><small class="mut">${esc((m.campos || '').split(',').slice(0, 6).join(', '))}</small></td></tr>`).join('');
  return `<div class="card mt"><div class="secao-titulo"><h2>Sugestões do Google</h2><small>o que o Google recomenda hoje (nada é aplicado daqui)</small></div>
      <p class="explica">O Google ganha com mais gasto: parte das sugestões é boa (sitelinks, força do anúncio), parte só aumenta o alcance sem trazer cliente melhor. A nota em cada uma é a leitura do Brain.</p>
      ${rec ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Sugestão</th><th>Onde</th><th class="dir">O Google estima</th></tr></thead><tbody>${rec}</tbody></table></div>` : '<div class="vazio">Nenhuma sugestão no momento.</div>'}</div>
    <div class="card mt"><div class="secao-titulo"><h2>Histórico de mudanças na conta</h2><small>últimos 14 dias · quem mudou o quê</small></div>
      ${mud ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Campos</th></tr></thead><tbody>${mud}</tbody></table></div>` : '<div class="vazio">Sem mudanças registradas.</div>'}</div>`;
}
