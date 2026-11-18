'use strict';
/* Intranet Protemaxxi — painéis do Início e do Meu dia: números do mês com comparação, gráfico de ritmo,
 * "Precisa da sua atenção" e "A fazer hoje". Só leitura: junta dados que o resto da Intranet já carrega. */

// ─── números ───
/** Resumo de vendas no mês para um filtro de pedidos (loja inteira ou um vendedor). Exportada para o teste. */
function painResumo(filtro, h = hoje()) {
  const m = mesDe(h), ma = addMes(m, -1), hojeD = pd(h).getDate(), nD = ultimoDia(m), nA = ultimoDia(ma), comp = Math.min(hojeD, nA);
  const diario = Array(nD).fill(0), diarioAnt = Array(nA).fill(0), ult30 = Array(30).fill(0), ini30 = addDias(h, -29);
  let pedidos = 0, pedHoje = 0;
  for (const p of D.pedidos || []) {
    if (!valido(p) || !filtro(p)) continue;
    const d = p.data;
    if (d.startsWith(m)) { diario[pd(d).getDate() - 1] += p.valor || 0; pedidos++; if (d === h) pedHoje++; }
    else if (d.startsWith(ma)) diarioAnt[pd(d).getDate() - 1] += p.valor || 0;
    if (d >= ini30 && d <= h) { const i = Math.round((pd(d) - pd(ini30)) / 864e5); if (i >= 0 && i < 30) ult30[i] += p.valor || 0; }
  }
  const acum = a => { let s = 0; return a.map(v => (s += v)); };
  const mes = soma(diario.slice(0, hojeD)), antMesmo = soma(diarioAnt.slice(0, comp)), ant = soma(diarioAnt);
  const du = diasUteisEntre(`${m}-01`, h), duT = diasUteisEntre(`${m}-01`, `${m}-${pad(nD)}`);
  return { m, hojeD, nD, mes, antMesmo, ant, pedidos, pedHoje, ticket: pedidos ? mes / pedidos : 0,
    hoje: diario[hojeD - 1] || 0, ontem: hojeD > 1 ? diario[hojeD - 2] : diarioAnt[nA - 1] || 0,
    proj: du ? mes / du * duT : 0, du, duT, acum: acum(diario).slice(0, hojeD), acumAnt: acum(diarioAnt), ult30 };
}
/** Variação em % com seta (verde sobe, vermelho desce). Exportada para o teste. */
function painDelta(atual, antes, rotulo = 'vs. mês passado') {
  if (!antes) return `<span class="pain-delta neutro">${atual ? 'sem base no mês passado' : '—'}</span>`;
  const v = (atual - antes) / antes, cls = Math.abs(v) < 0.005 ? 'neutro' : v > 0 ? 'sobe' : 'desce';
  return `<span class="pain-delta ${cls}" title="${R0(antes)} no mesmo período do mês passado">${cls === 'sobe' ? '▲' : cls === 'desce' ? '▼' : '■'} ${Math.abs(Math.round(v * 100))}% <small>${rotulo}</small></span>`;
}

// ─── gráficos (SVG simples, sem biblioteca) ───
/** Linha pequena dos últimos dias, sem eixo. */
function painSpark(arr, w = 120, h = 32) {
  const max = Math.max(1, ...arr), n = Math.max(arr.length - 1, 1);
  const pts = arr.map((v, i) => `${(i / n * w).toFixed(1)},${(h - 3 - v / max * (h - 6)).toFixed(1)}`);
  return `<svg class="pain-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="M0,${h} L${pts.join(' L')} L${w},${h}Z" class="area"/><polyline points="${pts.join(' ')}" class="linha"/></svg>`;
}
/** Anel de progresso (0 a 1) com o texto no meio. */
function painAnel(frac, tam = 92, meio = '', baixo = '') {
  const r = tam / 2 - 7, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac || 0));
  return `<div class="pain-anel" style="width:${tam}px;height:${tam}px"><svg viewBox="0 0 ${tam} ${tam}" aria-hidden="true"><circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" class="fundo"/>
    <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" class="${f >= 1 ? 'cheio' : 'frente'}" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${tam / 2} ${tam / 2})"/></svg>
    <div class="pain-anel-txt"><b>${meio}</b>${baixo ? `<small>${baixo}</small>` : ''}</div></div>`;
}
/** Ritmo do mês: acumulado deste mês (linha cheia), mês passado (tracejado) e o caminho até a meta (pontilhado). */
function painRitmo(r, meta) {
  const W = 760, H = 230, e = 52, b = 24, t = 12, d = 14, nD = r.nD;
  const max = Math.max(1, ...r.acum, ...r.acumAnt, meta || 0, r.proj * 0.6);
  const x = i => e + i / (Math.max(nD, 28) - 1) * (W - e - d), y = v => t + (1 - v / max) * (H - t - b);
  const caminho = arr => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const fim = r.acum.length - 1, ult = r.acum[fim] || 0;
  const grade = [0, .5, 1].map(f => `<line class="grade" x1="${e}" x2="${W - d}" y1="${y(max * f)}" y2="${y(max * f)}"/><text x="${e - 8}" y="${y(max * f) + 4}" text-anchor="end">${painK(max * f)}</text>`).join('');
  const dias = [1, 8, 15, 22, nD].map(n => `<text x="${x(n - 1)}" y="${H - 6}" text-anchor="middle">${n}</text>`).join('');
  const area = r.acum.length ? `<path class="area" d="${caminho(r.acum)} L${x(fim)},${y(0)} L${x(0)},${y(0)}Z"/>` : '';
  const metaL = meta ? `<line class="meta" x1="${x(0)}" y1="${y(0)}" x2="${x(nD - 1)}" y2="${y(meta)}"/><text class="meta-t" x="${x(nD - 1) - 4}" y="${y(meta) - 6}" text-anchor="end">meta ${painK(meta)}</text>` : '';
  return `<div class="pain-graf"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Venda acumulada do mês comparada ao mês passado">${grade}${dias}${metaL}
    <path class="ant" d="${caminho(r.acumAnt)}"/>${area}<path class="atual" d="${caminho(r.acum)}"/>
    ${r.acum.length ? `<circle class="ponto" cx="${x(fim)}" cy="${y(ult)}" r="5"/><text class="ponto-t" x="${x(fim) + (fim > nD * 0.75 ? -10 : 10)}" y="${y(ult) - 10}" text-anchor="${fim > nD * 0.75 ? 'end' : 'start'}">${R0(ult)}</text>` : ''}</svg>
    <div class="pain-leg"><span><i class="atual"></i>Este mês</span><span><i class="ant"></i>Mês passado</span>${meta ? '<span><i class="meta"></i>Caminho da meta</span>' : ''}</div></div>`;
}
/** Valor curto para eixo: 12 mil, 1,2 mi. */
const painK = v => v >= 1e6 ? `${(v / 1e6).toFixed(1).replace('.', ',')} mi` : v >= 1e3 ? `${Math.round(v / 1e3)} mil` : String(Math.round(v));
/** Barras horizontais da equipe: realizado, projeção (clara) e marca da meta. */
function painEquipe(linhas) {
  const max = Math.max(1, ...linhas.flatMap(l => [l.proj, l.meta || 0]));
  // dois com o mesmo primeiro nome (Felipe e Felipe): mostra o nome completo
  const rep = n => linhas.filter(x => primeiroNome(x.p) === n).length > 1;
  return `<div class="pain-eq">${linhas.map(l => {
    const a = l.meta ? l.proj / l.meta : null;
    return `<div class="pain-eq-l"><span class="pain-eq-n">${av(l.p)}<b title="${esc(l.p.nome)}">${esc(rep(primeiroNome(l.p)) ? l.p.nome.split(' ').slice(0, 2).join(' ') : primeiroNome(l.p))}</b></span>
      <div class="pain-eq-b"><i class="proj" style="width:${l.proj / max * 100}%"></i><i class="real" style="width:${l.mes / max * 100}%"></i>${l.meta ? `<em style="left:${l.meta / max * 100}%" title="Meta ${R0(l.meta)}"></em>` : ''}</div>
      <span class="pain-eq-v"><b>${R0(l.mes)}</b><small>${a == null ? 'sem meta' : `projeção ${P(a)} da meta`}</small></span></div>`; }).join('')}
    <div class="pain-leg"><span><i class="atual"></i>Vendido</span><span><i class="claro"></i>Projeção do mês</span><span><i class="meta"></i>Meta</span></div></div>`;
}
/** Atividades concluídas por dia nos últimos 7 dias (barras pequenas). */
function painSemana(feitasPorDia) {
  const max = Math.max(1, ...feitasPorDia.map(x => x.n));
  return `<div class="pain-semana">${feitasPorDia.map(x => `<div class="${x.hoje ? 'hoje' : ''}" title="${x.n} concluída(s)"><i style="height:${Math.max(4, x.n / max * 100)}%"></i><small>${x.rot}</small></div>`).join('')}</div>`;
}

// ─── "Precisa da sua atenção" e "A fazer hoje" ───
/** Itens que pedem ação, do mais grave para o menos. Cada item: {n (3 grave, 2 atenção, 1 info), ic, txt, a (atributos do clique)}. Exportada para o teste. */
function painAtencao(h = hoje()) {
  const l = [];
  const sol = minhasPendentes(), solAtr = sol.filter(s => s.prazo && s.prazo < h);
  for (const s of solAtr.slice(0, 3)) l.push({ n: 3, ic: 'solicitacoes', txt: `Solicitação atrasada: <b>${esc(s.titulo)}</b> <small>prazo ${fmtCurta(s.prazo)}</small>`, a: `data-a="verSolicitacao" data-id="${s.id}"` });
  if (solAtr.length > 3) l.push({ n: 3, ic: 'solicitacoes', txt: `Mais ${solAtr.length - 3} solicitação(ões) atrasada(s)`, a: 'data-a="nav" data-v="solicitacoes"' });
  if (typeof CRM !== 'undefined' && CRM.atv) {
    const atr = CRM.atv.filter(a => a.pessoa_id === EU.id && atvPendente(a) && a.quando < h);
    if (atr.length) l.push({ n: 3, ic: 'relogio', txt: `<b>${atr.length}</b> atividade(s) atrasada(s) na fila`, a: 'data-a="nav" data-v="fila"' });
  }
  const fup = followupsHoje(ehDono() ? null : EU.id).filter(i => i.proximo_contato < h);
  if (fup.length) l.push({ n: 2, ic: 'repetir', txt: `<b>${fup.length}</b> retorno(s) de cliente vencido(s)`, a: 'data-a="nav" data-v="fila"' });
  const solNovas = sol.filter(s => !(s.prazo && s.prazo < h));
  if (solNovas.length) l.push({ n: 1, ic: 'solicitacoes', txt: `<b>${solNovas.length}</b> solicitação(ões) esperando você`, a: 'data-a="nav" data-v="solicitacoes"' });
  if (ehDono()) for (const x of alertas().slice(0, 4)) l.push({ n: x.n >= 3 ? 3 : x.n >= 2 ? 2 : 1, ic: x.n >= 3 ? 'alerta' : 'clientes', txt: x.t, a: x.p ? `data-a="abrirPessoa" data-p="${x.p.id}" data-d="${x.d || ''}"` : x.view ? `data-a="nav" data-v="${x.view}"` : '' });
  return l.sort((a, b) => b.n - a.n);
}
function painAtencaoHtml(l) {
  if (!l.length) return `<div class="pain-ok">${icone('check', 22)}<div><b>Nada pedindo atenção agora</b><small>Sem atraso, sem pendência vencida.</small></div></div>`;
  return `<div class="pain-lista">${l.slice(0, 7).map(x => `<button class="pain-item n${x.n}" ${x.a}><span class="pain-ic">${icone(x.ic, 17)}</span><span class="pain-txt">${x.txt}</span><span class="pain-seta">${icone('seta', 14)}</span></button>`).join('')}</div>`;
}
/** Linhas de "A fazer hoje": feito/total e para onde ir. */
function painAFazer(h = hoje()) {
  const l = [];
  if (tarefas(EU, 'D').length && podeAba('checklist')) { const pc = pctDia(EU, h); l.push({ ic: 'checklist', nome: 'Checklist do dia', frac: pc, txt: pc == null ? 'folga hoje' : `${P(pc)} feito`, v: 'checklist' }); }
  if (typeof CRM !== 'undefined' && CRM.atv) {
    const deHoje = CRM.atv.filter(a => a.pessoa_id === EU.id && !a.arquivada_em && (a.quando === h || (a.feito && (a.feito_em || '').slice(0, 10) === h)));
    const feitas = deHoje.filter(a => a.feito).length;
    if (deHoje.length) l.push({ ic: 'meudia', nome: 'Atividades de hoje', frac: feitas / deHoje.length, txt: `${feitas} de ${deHoje.length}`, v: 'fila' });
  }
  const fus = followupsHoje(ehDono() ? null : EU.id).filter(i => i.proximo_contato === h);
  if (fus.length) l.push({ ic: 'repetir', nome: 'Retornos de clientes', frac: null, txt: `${fus.length} para hoje`, v: 'fila' });
  if (EU.tiny && typeof PRO !== 'undefined' && PRO.resumoDia === h && !PRO.resumoErro) { const pr = resumoPro(PRO.resumo.filter(x => x.pessoa_id === EU.id)); if (pr?.total) l.push({ ic: 'telefone', nome: 'Prospecção', frac: pr.contatos / pr.total, txt: `${pr.contatos} de ${pr.total} contatos`, v: 'fila' }); }
  const sol = minhasPendentes().length; if (sol) l.push({ ic: 'solicitacoes', nome: 'Solicitações para você', frac: null, txt: `${sol} em aberto`, v: 'solicitacoes' });
  return l;
}
function painAFazerHtml(l) {
  if (!l.length) return '<div class="vazio">Nada marcado para hoje.</div>';
  return `<div class="pain-fazer">${l.map(x => `<button class="pain-fz" data-a="nav" data-v="${x.v}"><span class="pain-ic">${icone(x.ic, 17)}</span><span class="pain-fz-c"><b>${x.nome}</b>${x.frac == null ? '' : `<span class="pain-fz-b"><i class="${classe(x.frac)}" style="width:${Math.min(1, x.frac) * 100}%"></i></span>`}</span><span class="pain-fz-v">${x.txt}</span></button>`).join('')}</div>`;
}

// ─── Início ───
function painKpi(rot, val, sub, extra = '', cls = '') {
  return `<div class="pain-kpi ${cls}"><div class="pain-kpi-r">${rot}</div><div class="pain-kpi-v">${val}</div><div class="pain-kpi-s">${sub}</div>${extra}</div>`;
}
function vInicio() {
  const h = hoje(), hora = new Date().getHours(), saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  // o Meu dia (atividades) e a prospecção alimentam "A fazer hoje"; carrega em segundo plano, sem travar a tela
  if (typeof CRM !== 'undefined' && !CRM.neg && !CRM.carregando && podeAba('meudia') && (EU.tiny || ehDono())) carregarCRM().then(render).catch(() => {});
  if (EU.tiny && typeof campanhaHoje === 'function') campanhaHoje(EU.id);
  const loja = veTudoVendas(), r = loja ? painResumo(() => true, h) : EU.tiny ? painResumo(p => p.vendedor_id === EU.tiny, h) : null;
  const vends = vendedoresPainel(), kFat = kpiDe(EU, 'fat');
  const metaLoja = soma(vends.map(p => kpiDe(p, 'fat')?.meta || 0)), meta = loja ? metaLoja : kFat?.meta || 0;
  let topoNums = '', grafico = '', equipe = '';
  if (r) {
    const deveria = meta ? meta * (r.du / Math.max(r.duT, 1)) : 0, ritmo = meta ? r.proj / meta : null;
    topoNums = `<div class="pain-kpis">
      ${painKpi(loja ? 'Vendas da loja no mês' : 'Minhas vendas no mês', R0(r.mes), painDelta(r.mes, r.antMesmo), painSpark(r.ult30), 'destaque')}
      ${painKpi('Projeção do mês', R0(r.proj), meta ? `${P(ritmo)} da meta de ${R0(meta)}` : `mês passado fechou em ${R0(r.ant)}`,
        meta ? `<div class="pain-meta" title="A marca mostra onde deveria estar hoje (${R0(deveria)})"><i class="${classe(ritmo)}" style="width:${Math.min(1, r.mes / meta) * 100}%"></i><em style="left:${Math.min(1, deveria / meta) * 100}%"></em></div>` : '')}
      ${painKpi('Pedidos no mês', String(r.pedidos), `ticket médio ${R0(r.ticket)}`)}
      ${painKpi('Hoje', R0(r.hoje), `${r.pedHoje} pedido(s) · ontem ${R0(r.ontem)}`)}</div>`;
    grafico = `<div class="card pain-card"><div class="secao-titulo"><h2>Ritmo do mês</h2><a href="#/vendas">painel de vendas</a></div>
      <p class="pain-frase">${painFrase(r, meta)}</p>${painRitmo(r, meta)}</div>`;
    if (loja && vends.length > 1) {
      const linhas = vends.map(p => { const x = resumoVendedor(p.tiny, h); return { p, mes: x.mes, proj: x.proj, meta: kpiDe(p, 'fat')?.meta || 0 }; }).sort((a, b) => b.mes - a.mes);
      equipe = `<div class="card pain-card"><div class="secao-titulo"><h2>Equipe no mês</h2><a href="#/supervisao">supervisão</a></div>${painEquipe(linhas)}</div>`;
    }
  }
  const at = painAtencao(h), fz = painAFazer(h);
  const rem = EU.regras.length ? calcRem(EU, mesDe(h), 'projecao') : null;
  const extra = [];
  if (rem) extra.push(painKpi(ehDono() ? 'Meu ganho previsto' : 'Quanto vou ganhar', R0(rem.total), `variável ${R0(rem.variavel + rem.equipe)}`, '', 'clic" data-a="nav" data-v="remuneracao'));
  if (ehDono()) { const rs = D.pessoas.filter(p => p.ativo && p.regras.length).map(p => calcRem(p, mesDe(h), 'projecao')); extra.push(painKpi('Folha prevista', R0(soma(rs.map(x => x.total))), `com encargos ${R0(soma(rs.map(x => x.custo)))}`, '', 'clic" data-a="nav" data-v="remuneracao')); }
  return topo(`${saud}, ${esc(primeiroNome(EU))}`, `${fmtData(h)} · ${infoSync()}`, '<button class="btn pri" data-a="novaSolicitacao">+ Nova solicitação</button>')
    + `<div class="pain-avisos">${avisoBoletos()}${avisoAssistencia()}</div>` + topoNums
    + `<div class="pain-grade ${grafico ? '' : 'so'}">${grafico ? `<div class="pain-col">${grafico}${equipe}</div>` : ''}
      <div class="pain-col">
        <div class="card pain-card"><div class="secao-titulo"><h2>Precisa da sua atenção</h2>${at.length ? `<span class="pain-n">${at.length}</span>` : ''}</div>${painAtencaoHtml(at)}</div>
        <div class="card pain-card"><div class="secao-titulo"><h2>A fazer hoje</h2><a href="#/fila">abrir a fila</a></div>${painAFazerHtml(fz)}</div>
        ${extra.length ? `<div class="pain-mini">${extra.join('')}</div>` : ''}
      </div></div>`;
}
/** Uma frase que resume o mês, sem jargão. Exportada para o teste. */
function painFrase(r, meta) {
  const comp = r.antMesmo ? (r.mes >= r.antMesmo ? `<b class="c-ok">${P((r.mes - r.antMesmo) / r.antMesmo)} acima</b>` : `<b class="c-ruim">${P((r.antMesmo - r.mes) / r.antMesmo)} abaixo</b>`) + ' do mesmo ponto do mês passado' : 'Sem venda no mesmo período do mês passado para comparar';
  if (!meta) return `${comp}. No ritmo atual, o mês fecha em <b>${R0(r.proj)}</b>.`;
  const falta = Math.max(0, meta - r.mes), dRest = Math.max(0, r.duT - r.du);
  return `${comp}. No ritmo atual, o mês fecha em <b>${R0(r.proj)}</b> (${P(r.proj / meta)} da meta).`
    + (falta > 0 && dRest ? ` Para bater a meta, faltam <b>${R0(falta)}</b>: <b>${R0(falta / dRest)}</b> por dia útil.` : falta <= 0 ? ' <b class="c-ok">Meta batida.</b>' : '');
}

// ─── Meu dia: resumo no topo ───
/** Bloco do topo do Meu dia: anel do dia, números e a semana. */
function painDiaResumo(quem, x) {
  const h = hoje(), total = x.feitasHoje + x.deHoje + x.fups + x.atrasadas;
  const dias = Array.from({ length: 7 }, (_, i) => { const d = addDias(h, i - 6); return { rot: DIAS_LONGO[pd(d).getDay()].slice(0, 3), hoje: d === h,
    n: (CRM.atv || []).filter(a => a.pessoa_id === quem && a.feito && (a.feito_em || '').slice(0, 10) === d).length }; });
  const st = (rot, v, sub, cls = '', a = '') => `<div class="pain-st ${cls}" ${a}><span>${rot}</span><b>${v}</b><small>${sub}</small></div>`;
  return `<div class="card pain-dia">
    ${painAnel(total ? x.feitasHoje / total : 0, 104, total ? `${x.feitasHoje}/${total}` : '—', 'feitas hoje')}
    <div class="pain-sts">
      ${st('Atrasadas', x.atrasadas, x.atrasadas ? 'resolva primeiro' : 'nada vencido', x.atrasadas ? 'ruim' : 'ok')}
      ${st('Para hoje', x.deHoje + x.fups, `${x.deHoje} atividade(s) · ${x.fups} retorno(s)`)}
      ${st('Prospecção', x.pro ? `${x.pro.contatos}/${x.pro.total}` : '…', x.pro ? `${x.pro.pendentes} pendente(s)` : 'carregando', '', `data-a="irProspeccao" data-pessoa="${quem}" style="cursor:pointer"`)}
      ${st('Negócios parados', x.semAtv, x.semAtv ? 'sem próximo passo' : 'todos com próximo passo', x.semAtv ? 'med' : '')}
    </div>
    <div class="pain-sem"><span>Concluídas na semana</span>${painSemana(dias)}</div></div>`;
}
