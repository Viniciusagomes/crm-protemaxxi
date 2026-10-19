'use strict';
/* CRM Protemaxxi — módulo Equipe (checklist, supervisão, metas, remuneração, feedbacks, configurações).
   Portado do Painel da Equipe local. */
// ═══════════════════════════ consultas ═══════════════════════════
const pessoa = id => D.pessoas.find(p => p.id === id);
const ativos = () => D.pessoas.filter(p => p.ativo);
const subs = id => D.pessoas.filter(p => p.ativo && p.supervisor === id);
const supervisores = () => D.pessoas.filter(p => p.ativo && D.pessoas.some(s => s.supervisor === p.id));
const kpiDe = (p, id) => (p.kpis || []).find(k => k.id === id);
const tarefas = (p, f) => (p.tarefas || []).filter(t => t.freq === f);
const primeiroNome = p => p.nome.split(' ')[0];

function reg(pid, d, criar) {
  if (!D.reg[pid]) { if (!criar) return null; D.reg[pid] = {}; }
  let r = D.reg[pid][d];
  if (!r && criar) r = D.reg[pid][d] = { checks: {}, notas: {}, kpi: {} };
  if (r) { r.checks ||= {}; r.notas ||= {}; r.kpi ||= {}; }
  return r || null;
}
function semReg(pid, seg, criar) {
  if (!D.sem[pid]) { if (!criar) return null; D.sem[pid] = {}; }
  if (!D.sem[pid][seg] && criar) D.sem[pid][seg] = {};
  return D.sem[pid][seg] || null;
}
function mesReg(pid, m, criar) {
  if (!D.mes[pid]) { if (!criar) return null; D.mes[pid] = {}; }
  if (!D.mes[pid][m] && criar) D.mes[pid][m] = { checks: {}, kpi: {} };
  const r = D.mes[pid][m]; if (r) { r.checks ||= {}; r.kpi ||= {}; }
  return r || null;
}

// ─── escala e checklist ───
const STATUS = { normal: 'Dia normal', falta: 'Falta', folga: 'Folga', feriado: 'Feriado', ferias: 'Férias', atestado: 'Atestado', extra: 'Trabalhou fora da escala' };
const STATUS_OFF = ['folga', 'feriado', 'ferias', 'atestado'];
const statusDia = (p, d) => reg(p.id, d)?.status || 'normal';
const escalado = (p, d) => p.dias.includes(dow(d)) && !(p.inicio && d < p.inicio) && !D.config.feriados.includes(d);
/** Dia de trabalho para o checklist (só conta a partir do início de uso do sistema). */
function trabalha(p, d) {
  if (D.config.inicioUso && d < D.config.inicioUso) return false;
  return trabalhaCal(p, d);
}
/** Dia de trabalho no calendário (usado no ritmo de vendas/projeção). */
function trabalhaCal(p, d) {
  const st = statusDia(p, d);
  if (p.inicio && d < p.inicio) return false;
  if (st === 'extra') return true;
  return escalado(p, d) && !STATUS_OFF.includes(st);
}
const venceSemana = (t, seg) => addDias(seg, ((t.diaSemana || 5) + 6) % 7);
const venceMes = (t, m) => `${m}-${pad(Math.min(t.diaMes || 5, ultimoDia(m)))}`;
const feitaD = (p, d, t) => !!reg(p.id, d)?.checks[t.id];
const feitaS = (p, d, t) => !!D.sem[p.id]?.[segundaDa(d)]?.[t.id];
const feitaM = (p, m, t) => !!D.mes[p.id]?.[m]?.checks?.[t.id];

function pctDia(p, d) {
  if (!trabalha(p, d)) return null;
  const ts = tarefas(p, 'D'); if (!ts.length) return null;
  return ts.filter(t => feitaD(p, d, t)).length / ts.length;
}
/** % de tudo que era esperado no mês (diárias + semanais + mensais) até a data limite. */
function adesao(p, m, lim = hoje()) {
  const fim = `${m}-${pad(ultimoDia(m))}`;
  const l = lim < fim ? lim : fim;
  if (`${m}-01` > l) return null;
  let esp = 0, ok = 0;
  const td = tarefas(p, 'D');
  for (const d of diasDoMes(m)) {
    if (d > l) break;
    if (!trabalha(p, d)) continue;
    for (const t of td) { esp++; if (feitaD(p, d, t)) ok++; }
  }
  for (const t of tarefas(p, 'S')) {
    for (const d of diasDoMes(m)) {
      if (dow(d) !== (t.diaSemana || 5) % 7 || (p.inicio && d < p.inicio)) continue;
      const f = feitaS(p, d, t);
      if (d <= l || f) { esp++; if (f) ok++; }
    }
  }
  for (const t of tarefas(p, 'M')) {
    const v = venceMes(t, m); if (p.inicio && v < p.inicio) continue;
    const f = feitaM(p, m, t);
    if (v <= l || f) { esp++; if (f) ok++; }
  }
  return esp ? ok / esp : null;
}
const adesaoEquipe = (sid, m) => media(subs(sid).map(s => adesao(s, m)));
function diaAnteriorTrab(p, d) { let x = addDias(d, -1); for (let i = 0; i < 12; i++) { if (trabalha(p, x)) return x; x = addDias(x, -1); } return null; }
const criticasPendentes = (p, d) => tarefas(p, 'D').filter(t => t.critica && !feitaD(p, d, t));
function semanaisAtrasadas(p, d) { const seg = segundaDa(d); return tarefas(p, 'S').filter(t => venceSemana(t, seg) < d && !feitaS(p, d, t)); }
function mensaisAtrasadas(p, d) { const m = mesDe(d); return tarefas(p, 'M').filter(t => venceMes(t, m) < d && !feitaM(p, m, t) && !(p.inicio && venceMes(t, m) < p.inicio)); }

// ─── indicadores ───
const FONTES = { manual: 'Lançado à mão', tiny_vendas: 'Tiny: vendas do vendedor', tiny_ecommerce: 'Tiny: vendas do e-commerce (R$)', tiny_ecommerce_pedidos: 'Tiny: pedidos do e-commerce',
  exp_despachados: 'Expedição: pedidos despachados', exp_prazo_pct: 'Expedição: % no prazo', exp_erro_pct: 'Expedição: % de erro de separação', exp_faltantes: 'Expedição: pedidos com item faltante',
  exp_contagens: 'Estoque: itens contados', exp_acuracia_pct: 'Estoque: % de acurácia' };
const ehExp = k => String(k.fonte || '').startsWith('exp_');
const ehTiny = k => (k.fonte || 'manual') !== 'manual';
function serieTiny(p, k) {
  if (k.fonte === 'tiny_vendas') return p.tiny ? (D.vendas[p.tiny] || {}) : {};
  return D.ecom || {};
}
function kpiTinyDia(p, k, d) { if (ehExp(k)) return expKpiDia(k.fonte, d); const v = serieTiny(p, k)[d]; return v ? (k.fonte === 'tiny_ecommerce_pedidos' ? v.pedidos : v.valor) : 0; }
function kpiReal(p, k, m) {
  if (ehExp(k)) return expKpiMes(k.fonte, m);
  if (ehTiny(k)) { let s = 0; const serie = serieTiny(p, k); for (const d in serie) if (d.startsWith(m)) s += k.fonte === 'tiny_ecommerce_pedidos' ? serie[d].pedidos : serie[d].valor; return s; }
  if (k.entrada === 'M') { const v = D.mes[p.id]?.[m]?.kpi?.[k.id]; return v === undefined || v === '' || v === null ? null : Number(v); }
  let s = 0, n = 0; const regs = D.reg[p.id] || {};
  for (const d in regs) { if (!d.startsWith(m)) continue; const v = regs[d].kpi?.[k.id]; if (v !== undefined && v !== '' && v !== null) { s += Number(v); n++; } }
  if (k.agreg === 'media') return n ? s / n : null;
  return s;
}
function diasUteisMes(p, m) {
  let tot = 0, dec = 0; const h = hoje();
  for (const d of diasDoMes(m)) {
    if (d < h) { if (trabalhaCal(p, d)) { tot++; dec++; } }
    else if (d === h) { if (trabalhaCal(p, d)) { tot++; if (Object.keys(reg(p.id, d)?.kpi || {}).length || p.kpis.some(k => ehTiny(k) && kpiTinyDia(p, k, d) > 0)) dec++; } }
    else if (escalado(p, d)) tot++;
  }
  return { tot, dec };
}
function kpiProj(p, k, m) {
  const v = kpiReal(p, k, m); const mh = mesDe(hoje());
  if (m < mh || (k.entrada === 'M' && !ehTiny(k)) || k.agreg === 'media') return v;
  if (m > mh) return 0;
  const { tot, dec } = diasUteisMes(p, m);
  return dec ? v / dec * tot : v;
}
function kpiValor(p, k, m, modo) {
  if (modo === 'simulacao') { const s = UI.simMeta / 100; return k.dir === 'menor' ? (s > 0 ? k.meta / s : k.meta * 10) : k.meta * s; }
  return modo === 'projecao' ? kpiProj(p, k, m) : kpiReal(p, k, m);
}
function ating(k, v) {
  if (v == null) return null;
  if (!k.meta) return 0;
  if (k.dir === 'menor') return v <= 0 ? 1.5 : Math.min(k.meta / v, 2);
  return v / k.meta;
}

// ═══════════════════════════ remuneração ═══════════════════════════
const TIPOS_REGRA = {
  fixo: 'Valor fixo',
  comissao: 'Comissão sobre a própria produção',
  override: 'Comissão sobre a produção da equipe',
  premio_meta: 'Prêmio por atingir meta',
  premio_disciplina: 'Prêmio por cumprir o checklist',
  premio_por_subordinado: 'Prêmio por subordinado que bateu a meta',
  comissao_desconto: 'Comissão pelo desconto de cada pedido',
  bonus_meta: 'Bônus de % ao bater a meta',
  bonus_produtos: 'Bônus por produto vendido',
};
const ordFaixas = fs => [...(fs || [])].sort((a, b) => a.de - b.de);
function faixa(fs, a) { const o = ordFaixas(fs); let f = o[0] || { de: 0 }; for (const x of o) if ((a ?? 0) * 100 >= x.de - 1e-9) f = x; return f; }
const proxFaixa = (fs, a) => ordFaixas(fs).find(x => x.de > (a ?? 0) * 100 + 1e-9);
function subsComKpi(pid, kid) { return subs(pid).map(s => ({ s, k: kpiDe(s, kid) })).filter(x => x.k); }
function domUteis(m) { let dom = 0, uteis = 0; for (const d of diasDoMes(m)) { if (dow(d) === 0 || D.config.feriados.includes(d)) dom++; else uteis++; } return { dom, uteis }; }

// ─── comissão por desconto e produtos bonificados ───
function pedidosDoMes(p, m) { return p.tiny ? D.pedidos.filter(x => x.vendedor_id === p.tiny && x.situacao !== 'Cancelado' && x.data.startsWith(m)) : []; }
function taxaPorDesconto(fs, descPct, acima) { for (const f of [...(fs || [])].sort((a, b) => a.ate - b.ate)) if (descPct <= +f.ate + 1e-9) return +f.taxa; return +(acima ?? 0); }
/** Fator para levar o realizado ao fim do mês (projeção) ou à meta simulada. */
function fatorModo(p, m, modo, kid = 'fat') {
  if (modo === 'realizado') return 1;
  const k = kpiDe(p, kid); if (!k) return 1;
  const real = kpiReal(p, k, m) || 0, alvo = kpiValor(p, k, m, modo) || 0;
  return real > 0 ? alvo / real : 0;
}
function comissaoDesconto(p, m, modo, r) {
  let base = 0, valor = 0, n = 0, est = 0;
  for (const x of pedidosDoMes(p, m)) {
    const tp = +x.total_produtos || 0, dsc = +x.desconto || 0;
    let b, pct;
    if (x.detalhado && tp > 0) { b = tp - dsc; pct = dsc / tp * 100; } else { b = x.valor; pct = 0; est++; }
    base += b; valor += b * taxaPorDesconto(r.faixas, pct, r.acima) / 100; n++;
  }
  const taxaMedia = base ? valor / base * 100 : +(r.faixas?.[0]?.taxa || 0);
  if (modo === 'simulacao' && base === 0) { const k = kpiDe(p, r.kpi || 'fat'); base = k ? kpiValor(p, k, m, modo) : 0; valor = base * taxaMedia / 100; }
  else { const f = fatorModo(p, m, modo, r.kpi || 'fat'); base *= f; valor *= f; }
  return { base, valor, n, est, taxaMedia };
}
const parseCodigos = txt => String(txt || '').split(/[,;\s]+/).filter(Boolean).map(c => { const [codigo, mult] = c.split('*'); return { codigo: codigo.trim().toUpperCase(), mult: +mult || 1 }; });
const fmtCodigos = cs => (cs || []).map(c => c.mult > 1 ? `${c.codigo}*${c.mult}` : c.codigo).join(', ');
function qtdProduto(vids, m, codigos) {
  const rows = D.bonif?.[m] || [], set = new Set(vids);
  let q = 0; for (const c of codigos || []) for (const r of rows) if (r.codigo === c.codigo && set.has(r.vendedor_id)) q += (+r.qtd || 0) * (c.mult || 1);
  return q;
}
const vendedoresEquipe = () => D.pessoas.filter(x => x.ativo && x.papel === 'vendedor' && x.tiny).map(x => x.tiny);
function fatorCalendario(m, modo) {
  if (modo !== 'projecao' || m !== mesDe(hoje())) return 1;
  const h = hoje(), du = diasUteisEntre(`${m}-01`, h), duT = diasUteisEntre(`${m}-01`, `${m}-${pad(ultimoDia(m))}`);
  return du ? duT / du : 1;
}

function calcRem(p, m, modo = UI.remModo) {
  const itens = []; let fixo = 0, comP = 0, comE = 0;
  for (const r of p.regras || []) {
    const fs = r.faixas || [];
    if (r.tipo === 'fixo') {
      const v = +r.valor || 0; fixo += v;
      itens.push({ nome: r.nome, valor: v, grupo: 'fixo', det: 'Valor fixo mensal' });
    } else if (r.tipo === 'comissao') {
      const k = kpiDe(p, r.kpi); if (!k) { itens.push(semKpi(r)); continue; }
      const v = kpiValor(p, k, m, modo) || 0, a = ating(k, v), f = faixa(fs, a), val = v * (+f.taxa || 0) / 100; comP += val;
      const nx = proxFaixa(fs, a);
      itens.push({ nome: r.nome, valor: val, grupo: 'variavel', integra: true,
        det: `${fmtK(k, v)} × ${N(f.taxa)}% · ${P(a)} da meta de ${fmtK(k, k.meta)}`,
        dica: nx ? `Faltam ${fmtK(k, Math.max(0, k.meta * nx.de / 100 - v))} para ${nx.de}% da meta: a comissão sobe para ${N(nx.taxa)}% sobre tudo (total ≈ ${R0(k.meta * nx.de / 100 * nx.taxa / 100)}).` : '' });
    } else if (r.tipo === 'override') {
      const ss = subsComKpi(p.id, r.kpi);
      if (!ss.length) { itens.push({ nome: r.nome, valor: 0, grupo: 'equipe', det: 'Nenhum subordinado ativo com este indicador.' }); continue; }
      let base = 0, meta = 0; const partes = [];
      for (const { s, k } of ss) { const v = kpiValor(s, k, m, modo) || 0; base += v; meta += +k.meta || 0; partes.push(`${s.nome}: ${fmtK(k, v)}`); }
      const k0 = ss[0].k, a = meta ? base / meta : 0, f = faixa(fs, a), val = base * (+f.taxa || 0) / 100; comE += val;
      const nx = proxFaixa(fs, a);
      itens.push({ nome: r.nome, valor: val, grupo: 'equipe', integra: true,
        det: `Equipe: ${fmtK(k0, base)} × ${N(f.taxa)}% · ${P(a)} da meta da equipe (${fmtK(k0, meta)}) — ${partes.join(' · ')}`,
        dica: nx ? `Se a equipe chegar a ${nx.de}% da meta (${fmtK(k0, meta * nx.de / 100)}), este ganho passa para ${N(nx.taxa)}% (≈ ${R0(meta * nx.de / 100 * nx.taxa / 100)}).` : '' });
    } else if (r.tipo === 'premio_meta') {
      let a, det;
      if (r.escopo === 'equipe') {
        const ss = subsComKpi(p.id, r.kpi);
        if (!ss.length) { itens.push({ nome: r.nome, valor: 0, grupo: 'equipe', det: 'Nenhum subordinado ativo com este indicador.' }); continue; }
        const k0 = ss[0].k;
        if (k0.dir === 'menor' || k0.agreg === 'media') {
          a = media(ss.map(x => ating(x.k, kpiValor(x.s, x.k, m, modo)))); det = `Média da equipe: ${P(a)} da meta`;
        } else {
          let v = 0, mt = 0; for (const x of ss) { v += kpiValor(x.s, x.k, m, modo) || 0; mt += +x.k.meta || 0; }
          a = mt ? v / mt : 0; det = `${k0.nome} da equipe: ${fmtK(k0, v)} de ${fmtK(k0, mt)} (${P(a)})`;
        }
      } else {
        const k = kpiDe(p, r.kpi); if (!k) { itens.push(semKpi(r)); continue; }
        const v = kpiValor(p, k, m, modo); a = ating(k, v);
        det = `${k.nome}: ${fmtK(k, v)} · meta ${k.dir === 'menor' ? 'até' : ''} ${fmtK(k, k.meta)} (${P(a)})`;
      }
      const f = faixa(fs, a), nx = proxFaixa(fs, a);
      itens.push({ nome: r.nome, valor: +f.valor || 0, grupo: r.escopo === 'equipe' ? 'equipe' : 'variavel', det,
        dica: nx ? `Chegando a ${nx.de}% da meta, este prêmio vira ${R0(nx.valor)}.` : '' });
    } else if (r.tipo === 'premio_disciplina') {
      const a = modo === 'simulacao' ? UI.simCheck / 100 : (r.escopo === 'equipe' ? adesaoEquipe(p.id, m) : adesao(p, m));
      const f = faixa(fs, a), val = (+r.valor || 0) * (+f.mult || 0) / 100, nx = proxFaixa(fs, a);
      itens.push({ nome: r.nome, valor: val, grupo: r.escopo === 'equipe' ? 'equipe' : 'variavel',
        det: `${r.escopo === 'equipe' ? 'Checklist médio da equipe' : 'Checklist cumprido no mês'}: ${P(a)} → recebe ${N(f.mult)}% de ${R0(r.valor)}`,
        dica: nx ? `Com ${nx.de}% do checklist cumprido, recebe ${N(nx.mult)}% (${R0(r.valor * nx.mult / 100)}).` : '' });
    } else if (r.tipo === 'comissao_desconto') {
      const c = comissaoDesconto(p, m, modo, r); comP += c.valor;
      itens.push({ nome: r.nome, valor: c.valor, grupo: 'variavel', integra: true,
        det: `${c.n} pedido(s) · base ${R0(c.base)} (produtos − desconto, sem frete) · taxa média ${N(Math.round(c.taxaMedia * 100) / 100)}%${c.est ? ` · ${c.est} pedido(s) ainda sem detalhe do Tiny, calculados sem desconto` : ''}`,
        dica: `Pedido com desconto de até ${N(r.faixas?.[0]?.ate)}% paga ${N(r.faixas?.[0]?.taxa)}%. Cada faixa de desconto a mais reduz a comissão do pedido.` });
    } else if (r.tipo === 'bonus_meta') {
      const k = kpiDe(p, r.kpi || 'fat'); if (!k) { itens.push(semKpi(r)); continue; }
      const v = kpiValor(p, k, m, modo) || 0, a = ating(k, v), bateu = (a || 0) >= 1;
      const base = comissaoDesconto(p, m, modo, { faixas: [], acima: 0 }).base;
      const val = bateu ? base * (+r.taxa || 0) / 100 : 0; comP += val;
      itens.push({ nome: r.nome, valor: val, grupo: 'variavel', integra: true,
        det: bateu ? `Meta batida (${P(a)}): +${N(r.taxa)}% sobre ${R0(base)}` : `Só paga ao bater a meta de ${fmtK(k, k.meta)}. Agora: ${fmtK(k, v)} (${P(a)})`,
        dica: bateu ? '' : `Faltam ${fmtK(k, Math.max(0, k.meta - v))} para a meta: libera +${N(r.taxa)}% sobre toda a venda do mês (≈ ${R0(base / (v || 1) * k.meta * r.taxa / 100)}) e os produtos bonificados.` });
    } else if (r.tipo === 'bonus_produtos') {
      const k = kpiDe(p, r.kpi || 'fat'); const v = k ? kpiValor(p, k, m, modo) || 0 : 0; const a = k ? ating(k, v) : 1;
      const bateu = !r.exige_meta || (a || 0) >= 1, fc = fatorCalendario(m, modo);
      let tot = 0; const partes = [], dicas = [];
      for (const it of r.itens || []) {
        const q = Math.round(qtdProduto([p.tiny], m, it.codigos) * fc), qe = Math.round(qtdProduto(vendedoresEquipe(), m, it.codigos) * fc);
        const subiu = +it.equipe_qtd > 0 && qe >= +it.equipe_qtd, unit = subiu ? +it.equipe_valor : +it.valor;
        const val = bateu ? q * unit : 0; tot += val;
        partes.push(`${it.nome}: ${q} × ${R0(unit)}${subiu ? ' (meta da equipe batida)' : ''}`);
        if (+it.equipe_qtd > 0 && !subiu) dicas.push(`${it.nome}: a equipe vendeu ${qe} de ${it.equipe_qtd}. Com ${it.equipe_qtd}, cada um paga ${R0(it.equipe_valor)}.`);
      }
      comP += tot;
      itens.push({ nome: r.nome, valor: tot, grupo: 'variavel', integra: true,
        det: (bateu ? '' : `Só paga ao bater a meta (agora ${P(a)}). `) + (partes.join(' · ') || 'Nenhum produto configurado') + (D.bonif?.[m] ? '' : ' · carregando quantidades…'),
        dica: dicas.join(' ') });
    } else if (r.tipo === 'premio_por_subordinado') {
      const ss = subsComKpi(p.id, r.kpi);
      const bat = ss.filter(x => (ating(x.k, kpiValor(x.s, x.k, m, modo)) || 0) >= 1);
      itens.push({ nome: r.nome, valor: bat.length * (+r.valor || 0), grupo: 'equipe',
        det: `${bat.length} de ${ss.length} bateram a meta${bat.length ? ' (' + bat.map(x => x.s.nome).join(', ') + ')' : ''} × ${R0(r.valor)}`,
        dica: bat.length < ss.length ? `Cada pessoa a mais da equipe que bater a meta = +${R0(r.valor)}.` : '' });
    }
  }
  let dsr = 0;
  if (D.config.dsr && p.vinculo === 'clt' && comP + comE > 0) {
    const { dom, uteis } = domUteis(m);
    const det = `Lei 605/49: comissões ÷ ${uteis} dias úteis × ${dom} domingos e feriados`;
    if (comP > 0) { const v = comP * dom / uteis; dsr += v; itens.push({ nome: 'DSR sobre comissões próprias', valor: v, grupo: 'variavel', det }); }
    if (comE > 0) { const v = comE * dom / uteis; dsr += v; itens.push({ nome: 'DSR sobre comissões da equipe', valor: v, grupo: 'equipe', det }); }
  }
  const tot = g => soma(itens.filter(i => i.grupo === g).map(i => i.valor));
  const variavel = tot('variavel'), equipe = tot('equipe');
  const encargos = p.vinculo === 'clt' ? (fixo + comP + comE + dsr) * (+D.config.encargos || 0) / 100 : 0;
  const total = fixo + variavel + equipe;
  return { itens, fixo, variavel, equipe, total, encargos, custo: total + encargos };
}
const semKpi = r => ({ nome: r.nome, valor: 0, grupo: 'variavel', det: `⚠ Indicador "${r.kpi}" não existe para esta pessoa. Ajuste em Configurações › Remuneração.` });

function explicaRegra(p, r) {
  const fx = (fs, fn, ref = 'da meta') => { const o = ordFaixas(fs); return o.map((f, i) => `${f.de === 0 && o[i + 1] ? `abaixo de ${o[i + 1].de}%` : `a partir de ${f.de}% ${ref}`}: <b>${fn(f)}</b>`).join(' · '); };
  const nomeKpi = (id, eq) => { const k = eq ? subsComKpi(p.id, id)[0]?.k : kpiDe(p, id); return k ? k.nome.toLowerCase() : id; };
  switch (r.tipo) {
    case 'fixo': return `<b>${esc(r.nome)}</b>: ${R0(r.valor)} todo mês, garantido.`;
    case 'comissao': return `<b>${esc(r.nome)}</b>: um percentual sobre ${esc(nomeKpi(r.kpi))}. O percentual vale para o mês inteiro e sobe conforme a meta é atingida: ${fx(r.faixas, f => N(f.taxa) + '%')}.`;
    case 'override': return `<b>${esc(r.nome)}</b>: um percentual sobre o total de ${esc(nomeKpi(r.kpi, true))} da equipe (${subsComKpi(p.id, r.kpi).map(x => esc(x.s.nome)).join(', ') || 'ninguém ativo'}). Quanto mais a equipe vende, mais o supervisor ganha: ${fx(r.faixas, f => N(f.taxa) + '%')}.`;
    case 'premio_meta': return `<b>${esc(r.nome)}</b>: prêmio pago quando ${r.escopo === 'equipe' ? 'a equipe atinge' : 'você atinge'} a meta de ${esc(nomeKpi(r.kpi, r.escopo === 'equipe'))}: ${fx(r.faixas, f => R0(f.valor))}.`;
    case 'premio_disciplina': return `<b>${esc(r.nome)}</b>: até ${R0(r.valor)}, conforme o % do checklist ${r.escopo === 'equipe' ? 'da equipe' : ''} cumprido no mês: ${fx(r.faixas, f => N(f.mult) + '% do valor', 'do checklist')}.`;
    case 'comissao_desconto': return `<b>${esc(r.nome)}</b>: em cada pedido, a comissão depende do desconto dado. ${ordFaixas((r.faixas || []).map(f => ({ ...f, de: f.ate }))).map(f => `desconto até ${N(f.ate)}% → <b>${N(f.taxa)}%</b>`).join(' · ')} · acima disso → <b>${N(r.acima || 0)}%</b>. A base é o valor dos produtos menos o desconto (sem frete).`;
    case 'bonus_meta': return `<b>${esc(r.nome)}</b>: ao bater a meta de ${esc(nomeKpi(r.kpi || 'fat'))}, ganha mais <b>${N(r.taxa)}%</b> sobre toda a venda do mês.`;
    case 'bonus_produtos': return `<b>${esc(r.nome)}</b>: ${r.exige_meta ? 'ao bater a meta, ' : ''}ganha por unidade vendida: ${(r.itens || []).map(it => `${esc(it.nome)} <b>${R0(it.valor)}</b>${+it.equipe_qtd ? ` (vira <b>${R0(it.equipe_valor)}</b> se os vendedores juntos venderem ${it.equipe_qtd} no mês)` : ''}`).join(' · ')}.`;
    case 'premio_por_subordinado': return `<b>${esc(r.nome)}</b>: ${R0(r.valor)} para cada pessoa da equipe que bater a meta de ${esc(nomeKpi(r.kpi, true))}. Incentiva a desenvolver todo mundo, não só o melhor vendedor.`;
  }
  return '';
}

// ═══════════════════════════ VISÃO GERAL ═══════════════════════════
function somaKpi(id, m, modo) {
  let v = 0, meta = 0, achou = false;
  for (const p of ativos()) { const k = kpiDe(p, id); if (!k) continue; achou = true; v += kpiValor(p, k, m, modo) || 0; meta += +k.meta || 0; }
  return achou ? { v, meta } : null;
}
function alertas() {
  const h = hoje(), m = mesDe(h), lista = [];
  for (const p of ativos()) {
    const sup = p.supervisor && pessoa(p.supervisor);
    const ont = diaAnteriorTrab(p, h);
    if (ont && tarefas(p, 'D').length) {
      const pc = pctDia(p, ont), cr = criticasPendentes(p, ont);
      if (pc != null && pc < 0.7) lista.push({ n: 3, c: 'ruim', ic: '⛔', p, d: ont, t: `<b>${esc(p.nome)}</b> cumpriu só ${P(pc)} do checklist em ${fmtCurta(ont)}${cr.length ? ` — ${cr.length} tarefa(s) crítica(s) pendente(s)` : ''}.` });
      else if (cr.length) lista.push({ n: 2, c: 'med', ic: '⚠', p, d: ont, t: `<b>${esc(p.nome)}</b> deixou ${cr.length} tarefa(s) crítica(s) sem fazer em ${fmtCurta(ont)}: ${cr.map(t => esc(t.titulo)).slice(0, 2).join('; ')}${cr.length > 2 ? '…' : ''}` });
      if (sup && sup.ativo && !reg(p.id, ont)?.conferido) lista.push({ n: 1, c: '', ic: '🔍', p, d: ont, t: `<b>${esc(sup.nome)}</b> ainda não conferiu o checklist de ${fmtCurta(ont)} de <b>${esc(p.nome)}</b>.` });
    }
    const sa = semanaisAtrasadas(p, h); if (sa.length) lista.push({ n: 2, c: 'med', ic: '📅', p, d: h, t: `<b>${esc(p.nome)}</b> tem ${sa.length} tarefa(s) da semana atrasada(s): ${sa.map(t => esc(t.titulo)).slice(0, 2).join('; ')}` });
    const ma = mensaisAtrasadas(p, h); if (ma.length) lista.push({ n: 2, c: 'med', ic: '🗓', p, d: h, t: `<b>${esc(p.nome)}</b> tem ${ma.length} tarefa(s) do mês atrasada(s): ${ma.map(t => esc(t.titulo)).slice(0, 2).join('; ')}` });
    if (pd(h).getDate() >= 6) for (const k of p.kpis) {
      if (k.entrada !== 'D' || k.agreg === 'media' || !k.meta) continue;
      const a = ating(k, kpiProj(p, k, m));
      if (a != null && a < 0.7) lista.push({ n: 2, c: 'med', ic: '📉', p, d: h, view: 'metas', t: `<b>${esc(p.nome)}</b>: no ritmo atual, ${esc(k.nome.toLowerCase())} fecha o mês em ${P(a)} da meta (${fmtK(k, kpiProj(p, k, m))} de ${fmtK(k, k.meta)}).` });
    }
  }
  const vagas = D.pessoas.filter(p => !p.ativo).length;
  if (vagas) lista.push({ n: 0, c: '', ic: '👤', t: `${vagas} vaga(s) em aberto no organograma (${D.pessoas.filter(p => !p.ativo).map(p => esc(p.nome)).join(', ')}). Quando contratar, ative a pessoa em Configurações › Pessoas.`, view: 'config' });
  return lista.sort((a, b) => b.n - a.n);
}
function pcard(p) {
  const h = hoje(), m = mesDe(h);
  const k = p.kpis.find(x => x.entrada === 'D' && x.agreg !== 'media') || p.kpis[0];
  const ak = k ? ating(k, kpiProj(p, k, m)) : null;
  const pc = pctDia(p, h), ad = adesao(p, m);
  return `<div class="pcard ${p.ativo ? '' : 'inativo'}" data-a="abrirPessoa" data-p="${p.id}">
    <div class="top">${av(p)}<div><b>${esc(p.nome)}</b><small class="mut">${esc(p.cargo)}</small></div></div>
    ${p.ativo ? `<div class="linhas">
      <div class="linha"><span class="mut">Hoje</span><span class="c-${classe(pc)}"><b>${pc == null ? (trabalha(p, h) ? '—' : 'folga') : P(pc)}</b></span></div>
      <div class="linha"><span class="mut">Checklist mês</span><span class="c-${classe(ad)}"><b>${P(ad)}</b></span></div>
      ${k ? `<div class="linha"><span class="mut" title="${esc(k.nome)}">${esc(k.nome.length > 16 ? k.nome.slice(0, 15) + '…' : k.nome)}</span><span class="c-${classe(ak)}"><b>${P(ak)}</b></span></div>` : ''}
    </div>` : '<div class="linhas"><span class="tag">a contratar</span></div>'}
  </div>`;
}
function orgNo(p) {
  const fs = D.pessoas.filter(x => x.supervisor === p.id);
  return `<div class="org-ramo">${pcard(p)}${fs.length ? `<div class="org-filhos">${fs.map(orgNo).join('')}</div>` : ''}</div>`;
}
function vGeral() {
  const h = hoje(), m = mesDe(h);
  const fat = somaKpi('fat', m, 'projecao'), fatR = somaKpi('fat', m, 'realizado');
  const mkt = somaKpi('fat_mkt', m, 'projecao'), mktR = somaKpi('fat_mkt', m, 'realizado');
  const trabHoje = ativos().filter(p => tarefas(p, 'D').length && trabalha(p, h));
  const mediaHoje = media(trabHoje.map(p => pctDia(p, h)));
  const rems = ativos().filter(p => p.regras.length).map(p => calcRem(p, m, 'projecao'));
  const folha = soma(rems.map(r => r.total)), custo = soma(rems.map(r => r.custo)), varT = soma(rems.map(r => r.variavel + r.equipe));
  const fatTotal = (fat?.v || 0) + (mkt?.v || 0);
  const al = alertas();
  const raizes = D.pessoas.filter(p => !p.supervisor || !pessoa(p.supervisor));
  const vendedores = ativos().filter(p => kpiDe(p, 'fat'));
  const ranking = vendedores.map(p => { const k = kpiDe(p, 'fat'); return { p, k, v: kpiReal(p, k, m), pr: kpiProj(p, k, m) }; }).sort((a, b) => b.v - a.v);
  return topo('Visão da equipe', `${fmtData(h)} · ${fmtMes(m)}`) + `
  <div class="grid g4">
    ${fat ? `<div class="card kpi-card"><div class="rot">Vendas da equipe comercial</div><div class="val">${R0(fatR.v)}</div><div class="sub">Projeção ${R0(fat.v)} · meta ${R0(fat.meta)}</div><div class="mt">${barra(fat.meta ? fat.v / fat.meta : 0)}</div></div>` : ''}
    ${mkt ? `<div class="card kpi-card"><div class="rot">Vendas nos marketplaces</div><div class="val">${R0(mktR.v)}</div><div class="sub">Projeção ${R0(mkt.v)} · meta ${R0(mkt.meta)}</div><div class="mt">${barra(mkt.meta ? mkt.v / mkt.meta : 0)}</div></div>` : ''}
    <div class="card kpi-card"><div class="rot">Checklist de hoje (média da equipe)</div><div class="val c-${classe(mediaHoje)}">${P(mediaHoje)}</div><div class="sub">${trabHoje.length} pessoa(s) trabalhando hoje</div><div class="mt">${barra(mediaHoje)}</div></div>
    <div class="card kpi-card"><div class="rot">Folha prevista no mês</div><div class="val">${R0(folha)}</div><div class="sub">Variável ${R0(varT)} · custo c/ encargos ${R0(custo)}${fatTotal ? ` · ${P(custo / fatTotal)} das vendas` : ''}</div><div class="mt"><div class="pilha"><i style="width:${folha ? (folha - varT) / folha * 100 : 0}%;background:#8AA0B4"></i><i style="width:${folha ? varT / folha * 100 : 0}%;background:var(--verde)"></i></div></div></div>
  </div>
  <div class="card mt"><div class="secao-titulo"><h2>Organograma</h2><small>Clique numa pessoa para abrir o checklist dela. Percentuais do indicador = projeção do mês.</small></div><div class="org">${raizes.map(orgNo).join('')}</div></div>
  <div class="grid g2 mt">
    <div class="card"><div class="secao-titulo"><h2>O que precisa de atenção</h2><small>${al.length} aviso(s)</small></div>
      <div class="alertas">${al.length ? al.slice(0, 14).map(a => `<div class="alerta ${a.c}" ${a.p ? `data-a="abrirPessoa" data-p="${a.p.id}" data-d="${a.d || ''}"` : `data-a="nav" data-v="${a.view || 'geral'}"`} ${a.view && a.p ? `data-view="${a.view}"` : ''}><span class="ic">${a.ic}</span><span>${a.t}</span></div>`).join('') : '<div class="vazio">Tudo em dia. 🎉</div>'}
      ${al.length > 14 ? `<small>+ ${al.length - 14} outros avisos na aba Supervisão.</small>` : ''}</div></div>
    <div class="card"><div class="secao-titulo"><h2>Placar de vendas do mês</h2><small>Realizado · projeção</small></div>
      ${ranking.length ? `<table class="tabela"><tbody>${ranking.map((x, i) => { const a = ating(x.k, x.pr); return `<tr class="clic" data-a="abrirPessoa" data-p="${x.p.id}" data-view="metas"><td style="width:28px"><b>${i + 1}º</b></td><td><div style="display:flex;gap:8px;align-items:center">${av(x.p)}<div><b>${esc(x.p.nome)}</b><br><small>meta ${R0(x.k.meta)}</small></div></div></td><td style="width:34%">${barra(a)}<small>projeção ${R0(x.pr)} (${P(a)})</small></td><td class="dir num"><b>${R0(x.v)}</b></td></tr>`; }).join('')}</tbody></table>` : '<div class="vazio">Ninguém com indicador de faturamento.</div>'}
    </div>
  </div>`;
}

// ═══════════════════════════ CHECKLIST ═══════════════════════════
function gruposPessoas() {
  const raizes = D.pessoas.filter(p => !p.supervisor || !pessoa(p.supervisor));
  const grupos = [], usados = new Set();
  const r = raizes.filter(p => p.ativo); if (r.length) { grupos.push(['Diretoria', r]); r.forEach(p => usados.add(p.id)); }
  for (const raiz of raizes) for (const s of subs(raiz.id)) {
    const lista = [s, ...subs(s.id)]; lista.forEach(p => usados.add(p.id));
    grupos.push([`Equipe ${s.nome}`, lista]);
  }
  const resto = ativos().filter(p => !usados.has(p.id)); if (resto.length) grupos.push(['Outros', resto]);
  return grupos;
}
function linhaTarefa(p, t, ctx) {
  const futuro = ctx.d > hoje();
  let feito, attrs;
  if (t.freq === 'D') { feito = feitaD(p, ctx.d, t); attrs = `data-c="chk" data-p="${p.id}" data-d="${ctx.d}" data-t="${t.id}"`; }
  else if (t.freq === 'S') { feito = feitaS(p, ctx.d, t); attrs = `data-c="chkS" data-p="${p.id}" data-s="${segundaDa(ctx.d)}" data-t="${t.id}"`; }
  else { feito = feitaM(p, mesDe(ctx.d), t); attrs = `data-c="chkM" data-p="${p.id}" data-m="${mesDe(ctx.d)}" data-t="${t.id}"`; }
  const nota = t.freq === 'D' ? reg(p.id, ctx.d)?.notas?.[t.id] : null;
  let prazo = '';
  if (t.freq === 'S') { const v = venceSemana(t, segundaDa(ctx.d)); prazo = `<span class="tag ${!feito && v < hoje() ? 'ruim' : ''}">até ${DIAS[dow(v)]} ${fmtCurta(v)}${!feito && v < hoje() ? ' · atrasada' : ''}</span>`; }
  if (t.freq === 'M') { const v = venceMes(t, mesDe(ctx.d)); prazo = `<span class="tag ${!feito && v < hoje() ? 'ruim' : ''}">até dia ${pd(v).getDate()}${!feito && v < hoje() ? ' · atrasada' : ''}</span>`; }
  return `<div class="tarefa ${feito ? 'feita' : ''}">
    <input type="checkbox" ${feito ? 'checked' : ''} ${futuro && t.freq === 'D' ? 'disabled title="Dia futuro"' : ''} ${attrs} aria-label="${esc(t.titulo)}">
    <div><div class="tt">${esc(t.titulo)} ${t.critica ? '<span class="tag crit">crítica</span>' : ''}</div>
      ${t.conferir ? `<div class="conf"><b>Como conferir:</b> ${esc(t.conferir)}</div>` : ''}
      ${nota ? `<div class="nota">📝 ${esc(nota)}</div>` : ''}</div>
    <div class="lado">${prazo}${t.freq === 'D' ? `<button class="icone-btn" title="Anotar observação" data-a="nota" data-p="${p.id}" data-d="${ctx.d}" data-t="${t.id}">✎</button>` : ''}</div>
  </div>`;
}
function vChecklist() {
  const grupos = gruposPessoas();
  if (!pessoa(UI.pessoa) || !pessoa(UI.pessoa).ativo) UI.pessoa = (grupos[1]?.[1][0] || grupos[0]?.[1][0])?.id || D.pessoas[0].id;
  const p = pessoa(UI.pessoa), d = UI.data, m = mesDe(d), h = hoje();
  const lista = `<div class="card lista-pessoas">${grupos.map(([nome, ps]) => `<h4>${esc(nome)}</h4>${ps.map(x => { const pc = pctDia(x, d); return `<button class="lp ${x.id === p.id ? 'on' : ''}" data-a="selPessoa" data-p="${x.id}">${av(x)}<span>${esc(x.nome)}</span><em class="c-${classe(pc)}">${pc == null ? '·' : P(pc)}</em></button>`; }).join('')}`).join('')}</div>`;
  const sup = p.supervisor && pessoa(p.supervisor);
  const st = statusDia(p, d), trab = trabalha(p, d), pc = pctDia(p, d);
  const r = reg(p.id, d);
  const blocos = [['abertura', 'Abertura do dia'], ['dia', 'Durante o dia'], ['fechamento', 'Fechamento']];
  const td = tarefas(p, 'D');
  const kd = p.kpis.filter(k => k.entrada === 'D' && !ehTiny(k)), km = p.kpis.filter(k => k.entrada === 'M' && !ehTiny(k)), kt = p.kpis.filter(ehTiny);
  const seg = segundaDa(d);
  const sS = tarefas(p, 'S'), sM = tarefas(p, 'M');
  const feitosS = sS.filter(t => feitaS(p, d, t)).length, feitosM = sM.filter(t => feitaM(p, m, t)).length;
  const cab = `<div class="card"><div class="cab-pessoa">
      <div class="quem">${av(p, 'g')}<div><h2 style="margin:0">${esc(p.nome)}</h2><small>${esc(p.cargo)}${sup ? ` · supervisor: <b>${esc(sup.nome)}</b>` : ''}</small></div></div>
      <div class="navdia"><button class="btn peq" data-a="dia" data-v="-1" title="Dia anterior">◀</button><span class="data">${fmtData(d)}</span><button class="btn peq" data-a="dia" data-v="1" title="Próximo dia">▶</button>
        ${d !== h ? '<button class="btn peq" data-a="dia" data-v="0">Hoje</button>' : ''}<input type="date" value="${d}" data-c="irData" title="Escolher data"></div>
    </div>
    <div class="progresso-grande"><select data-c="status" data-p="${p.id}" data-d="${d}" title="Situação do dia">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === st ? 'selected' : ''}>${v}</option>`).join('')}</select>
      ${barra(pc)}<span class="num c-${classe(pc)}">${pc == null ? '—' : P(pc)}</span></div>
    <small>Checklist do mês até hoje: <b>${P(adesao(p, mesDe(d)))}</b> · ${td.filter(t => feitaD(p, d, t)).length} de ${td.length} tarefas diárias feitas</small>
  </div>`;
  let corpo;
  if (!trab) {
    corpo = `<div class="card dia-off">${p.dias.includes(dow(d)) ? `Dia marcado como <b>${STATUS[st].toLowerCase()}</b>: não conta no checklist.` : `<b>${esc(p.nome)}</b> não trabalha ${DIAS_LONGO[dow(d)]}. Este dia não conta no checklist.`}
      <div class="mt"><button class="btn" data-a="trabalhou" data-p="${p.id}" data-d="${d}">Trabalhou neste dia mesmo assim</button></div></div>`;
  } else {
    corpo = blocos.map(([b, nome]) => { const ts = td.filter(t => (t.bloco || 'dia') === b); if (!ts.length) return ''; const f = ts.filter(t => feitaD(p, d, t)).length;
      return `<div class="card"><div class="secao-titulo"><h3>${nome}</h3><span class="tag ${f === ts.length ? 'ok' : ''}">${f}/${ts.length}</span></div>${ts.map(t => linhaTarefa(p, t, { d })).join('')}</div>`; }).join('')
      + (d > h ? '<div class="card dia-off">Este dia ainda não chegou: dá para ver as tarefas, mas só dá para marcar a partir do dia.</div>' : '');
  }
  const auto = kt.length ? `<div class="card"><div class="secao-titulo"><h3>Números automáticos (Tiny)</h3><small>Atualizados de hora em hora. Não precisa lançar.</small></div>
    <div class="kpi-entrada">${kt.map(k => { const ac = kpiReal(p, k, m); return `<label>${esc(k.nome)}<b style="font-family:Archivo;font-size:20px;color:var(--txt)">${fmtK(k, kpiTinyDia(p, k, d))}</b><span class="acum">No mês: ${fmtK(k, ac)} de ${fmtK(k, k.meta)} (${P(ating(k, ac))})</span></label>`; }).join('')}</div></div>` : '';
  const numeros = kd.length && trab ? `<div class="card"><div class="secao-titulo"><h3>Números do dia</h3><small>Lance antes de ir embora. Somam automaticamente no mês.</small></div>
    <div class="kpi-entrada">${kd.map(k => { const v = r?.kpi?.[k.id]; const ac = kpiReal(p, k, m); return `<label>${esc(k.nome)} ${k.un !== 'un' ? `(${k.un})` : ''}<input type="number" step="any" min="0" value="${v ?? ''}" data-c="kpiD" data-p="${p.id}" data-d="${d}" data-k="${k.id}" data-fid="kd-${k.id}" ${d > h ? 'disabled' : ''}><span class="acum">No mês: ${fmtK(k, ac)} de ${fmtK(k, k.meta)} (${P(ating(k, ac))})</span></label>`; }).join('')}</div></div>` : '';
  const semana = sS.length ? `<div class="card"><div class="secao-titulo"><h3>Tarefas da semana</h3><span><small>${fmtCurta(seg)} a ${fmtCurta(addDias(seg, 6))}</small> <span class="tag ${feitosS === sS.length ? 'ok' : ''}">${feitosS}/${sS.length}</span></span></div>${sS.map(t => linhaTarefa(p, t, { d })).join('')}</div>` : '';
  const mes = sM.length || km.length ? `<div class="card"><div class="secao-titulo"><h3>Tarefas do mês</h3><span><small>${fmtMes(m)}</small> ${sM.length ? `<span class="tag ${feitosM === sM.length ? 'ok' : ''}">${feitosM}/${sM.length}</span>` : ''}</span></div>${sM.map(t => linhaTarefa(p, t, { d })).join('')}
    ${km.length ? `<div class="mt"><h3>Números do mês</h3><div class="kpi-entrada">${km.map(k => { const v = D.mes[p.id]?.[m]?.kpi?.[k.id]; return `<label>${esc(k.nome)} ${k.un !== 'un' ? `(${k.un})` : ''}<input type="number" step="any" min="0" value="${v ?? ''}" data-c="kpiM" data-p="${p.id}" data-m="${m}" data-k="${k.id}" data-fid="km-${k.id}"><span class="acum">Meta: ${k.dir === 'menor' ? 'no máximo ' : ''}${fmtK(k, k.meta)}</span></label>`; }).join('')}</div></div>` : ''}</div>` : '';
  const conf = sup && trab ? `<div class="card conferencia ${r?.conferido ? 'ok' : ''}"><div class="secao-titulo"><h3>Conferência do supervisor</h3>${r?.conferido ? `<span class="tag ok">conferido${r.conferidoEm ? ' em ' + esc(r.conferidoEm) : ''}</span>` : '<span class="tag">pendente</span>'}</div>
    <label style="display:flex;gap:8px;align-items:center;font-weight:600;margin:6px 0 10px"><input type="checkbox" ${r?.conferido ? 'checked' : ''} data-c="conferido" data-p="${p.id}" data-d="${d}" ${d > h ? 'disabled' : ''}> ${esc(sup.nome)} conferiu este dia (as tarefas marcadas foram mesmo feitas)</label>
    <textarea placeholder="Observação do supervisor sobre o dia (opcional)" data-c="obs" data-p="${p.id}" data-d="${d}" data-fid="obs">${esc(r?.obs || '')}</textarea></div>` : '';
  return topo('Checklist do dia', 'Marque cada atividade quando ela for feita. O supervisor confere e dá o "conferido".', `<button class="btn" data-a="print">🖨 Imprimir</button>`)
    + `<div class="check-layout">${lista}<div>${cab}<div class="bloco mt">${corpo}</div>${auto ? `<div class="mt">${auto}</div>` : ''}${numeros ? `<div class="mt">${numeros}</div>` : ''}${semana ? `<div class="mt">${semana}</div>` : ''}${mes ? `<div class="mt">${mes}</div>` : ''}${conf ? `<div class="mt">${conf}</div>` : ''}</div></div>`;
}

// ═══════════════════════════ SUPERVISÃO ═══════════════════════════
function heatmap(pessoas, m) {
  const dias = diasDoMes(m), h = hoje();
  return `<div class="rolagem"><table class="heat"><thead><tr><th></th>${dias.map(d => `<th title="${DIAS_LONGO[dow(d)]}">${pd(d).getDate()}<br>${DIAS[dow(d)][0].toUpperCase()}</th>`).join('')}<th>Mês</th></tr></thead><tbody>
  ${pessoas.map(p => `<tr><td class="nome">${esc(p.nome)}</td>${dias.map(d => {
    if (d > h) return `<td class="cel fut"></td>`;
    const pc = pctDia(p, d);
    if (pc == null) return `<td class="cel off" title="${fmtCurta(d)}: não trabalha / ${STATUS[statusDia(p, d)]}">·</td>`;
    const conf = reg(p.id, d)?.conferido;
    const c = pc === 0 ? 'zero' : classe(pc);
    return `<td class="cel ${c} ${d === h ? 'hoje' : ''}" data-a="abrirPessoa" data-p="${p.id}" data-d="${d}" title="${fmtCurta(d)}: ${P(pc)}${conf ? ' · conferido' : ' · não conferido'}"><span class="v">${Math.round(pc * 100)}${conf ? '✓' : ''}</span></td>`;
  }).join('')}<td><b class="c-${classe(adesao(p, m))}">${P(adesao(p, m))}</b></td></tr>`).join('')}
  </tbody></table></div>
  <div class="legenda"><span><i style="background:#7FD3A0"></i>90% ou mais</span><span><i style="background:#F2C76B"></i>70–89%</span><span><i style="background:#EE8F86"></i>abaixo de 70%</span><span><i style="background:#E35D52"></i>nada feito</span><span><i style="background:var(--nulo)"></i>folga/fora da escala</span><span>✓ = conferido pelo supervisor · % do mês inclui tarefas semanais e mensais</span></div>`;
}
function referenciaCobranca(p) {
  const g = [['abertura', 'Todo dia — abertura'], ['dia', 'Todo dia — durante o dia'], ['fechamento', 'Todo dia — fechamento']];
  const item = t => `<li>${esc(t.titulo)} ${t.critica ? '<span class="tag crit">crítica</span>' : ''}${t.freq === 'S' ? ` <span class="tag">${DIAS_LONGO[(t.diaSemana || 5) % 7]}</span>` : ''}${t.freq === 'M' ? ` <span class="tag">até dia ${t.diaMes}</span>` : ''}${t.conferir ? `<small>↳ ${esc(t.conferir)}</small>` : ''}</li>`;
  const blocos = g.map(([b, n]) => { const ts = tarefas(p, 'D').filter(t => (t.bloco || 'dia') === b); return ts.length ? `<div class="ref-grupo"><h4>${n}</h4><ul>${ts.map(item).join('')}</ul></div>` : ''; }).join('')
    + (tarefas(p, 'S').length ? `<div class="ref-grupo"><h4>Toda semana</h4><ul>${tarefas(p, 'S').map(item).join('')}</ul></div>` : '')
    + (tarefas(p, 'M').length ? `<div class="ref-grupo"><h4>Todo mês</h4><ul>${tarefas(p, 'M').map(item).join('')}</ul></div>` : '')
    + (p.kpis.length ? `<div class="ref-grupo"><h4>Metas do mês</h4><ul>${p.kpis.map(k => `<li>${esc(k.nome)}: <b>${k.dir === 'menor' ? 'no máximo ' : ''}${fmtK(k, k.meta)}</b> <small>${k.entrada === 'D' ? 'lançado todo dia' : 'lançado 1x no mês'}</small></li>`).join('')}</ul></div>` : '');
  return `<div class="card"><div class="secao-titulo"><div style="display:flex;gap:10px;align-items:center">${av(p)}<div><h3 style="margin:0">${esc(p.nome)}</h3><small>${esc(p.cargo)}</small></div></div></div><div class="ref-tarefas mt">${blocos}</div></div>`;
}
function vSupervisao() {
  const sups = supervisores();
  if (!sups.length) return topo('Supervisão', '') + '<div class="card vazio">Ninguém tem subordinados. Defina os supervisores em Configurações › Pessoas.</div>';
  if (!sups.find(s => s.id === UI.sup)) UI.sup = (sups.find(s => s.supervisor) || sups[0]).id;
  const s = pessoa(UI.sup), equipe = subs(s.id), m = UI.mes, h = hoje();
  const rem = s.regras.length ? calcRem(s, m, 'projecao') : null;
  const cards = equipe.map(p => {
    const ont = diaAnteriorTrab(p, h), pcO = ont ? pctDia(p, ont) : null, pcH = pctDia(p, h);
    const crH = trabalha(p, h) ? criticasPendentes(p, h) : [], crO = ont ? criticasPendentes(p, ont) : [];
    const sa = semanaisAtrasadas(p, h), ma = mensaisAtrasadas(p, h);
    const confO = ont && reg(p.id, ont)?.conferido;
    const kpis = p.kpis.map(k => { const pr = kpiProj(p, k, mesDe(h)); return `<div style="margin-top:6px"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${esc(k.nome)}</span><span>${fmtK(k, kpiReal(p, k, mesDe(h)))} <small>/ ${fmtK(k, k.meta)}</small></span></div>${barra(ating(k, pr))}</div>`; }).join('');
    return `<div class="card cobranca ${classe(pcO)}">
      <div class="secao-titulo"><div style="display:flex;gap:10px;align-items:center">${av(p)}<div><b>${esc(p.nome)}</b><br><small>${esc(p.cargo)}</small></div></div><button class="btn peq" data-a="abrirPessoa" data-p="${p.id}">Abrir checklist</button></div>
      <div class="grid g2 mt" style="gap:10px"><div><small>Hoje</small><div class="num" style="font-size:20px;font-weight:800">${pcH == null ? (trabalha(p, h) ? '—' : 'folga') : P(pcH)}</div></div>
      <div><small>${ont ? `Último dia (${fmtCurta(ont)})` : 'Último dia'}</small><div class="num" style="font-size:20px;font-weight:800" >${P(pcO)} ${ont ? (confO ? '<span class="tag ok">conferido</span>' : `<button class="btn peq" data-a="abrirPessoa" data-p="${p.id}" data-d="${ont}">conferir</button>`) : ''}</div></div></div>
      ${crH.length || crO.length || sa.length || ma.length ? `<div class="mt"><b style="font-size:13px">Cobrar agora:</b><ul class="pend">
        ${crO.map(t => `<li class="c-ruim">Não fez em ${fmtCurta(ont)}: ${esc(t.titulo)}</li>`).join('')}
        ${sa.map(t => `<li class="c-med">Semanal atrasada: ${esc(t.titulo)}</li>`).join('')}
        ${ma.map(t => `<li class="c-med">Mensal atrasada: ${esc(t.titulo)}</li>`).join('')}
        ${crH.length ? `<li class="mut" title="${esc(crH.map(t => t.titulo).join(' · '))}">Hoje: ${crH.length} tarefa(s) crítica(s) ainda em aberto</li>` : ''}
      </ul></div>` : '<div class="mt"><span class="tag ok">Nada pendente para cobrar</span></div>'}
      ${kpis ? `<div class="mt">${kpis}</div>` : ''}
    </div>`;
  }).join('');
  return topo('Supervisão', 'O que cada supervisor precisa cobrar da equipe, hoje e no mês.', `<div class="seg">${sups.map(x => `<button class="${x.id === s.id ? 'on' : ''}" data-a="sup" data-p="${x.id}">${esc(x.nome)}</button>`).join('')}</div><button class="btn" data-a="print">🖨 Imprimir</button>`)
    + `<div class="card"><div class="cab-pessoa"><div class="quem">${av(s, 'g')}<div><h2 style="margin:0">${esc(s.nome)}</h2><small>${esc(s.cargo)} · ${equipe.length} pessoa(s) na equipe · checklist médio da equipe no mês: <b>${P(adesaoEquipe(s.id, m))}</b></small></div></div>
      ${rem ? `<div style="text-align:right"><small>Ganho previsto vindo da equipe em ${MESES[pd(m + '-01').getMonth()]}</small><div class="num" style="font-size:24px;font-weight:800;color:var(--verde-esc)">${R0(rem.equipe)}</div><a href="#" data-a="verRem" data-p="${s.id}">ver detalhes</a></div>` : ''}</div></div>
    ${equipe.length ? `<h2 class="mt2">Cobrança de hoje</h2><div class="grid g2">${cards}</div>` : '<div class="card vazio mt">Nenhum subordinado ativo.</div>'}
    <div class="card mt2"><div class="secao-titulo"><h2>Checklist dia a dia</h2>${navMes()}</div>${heatmap([s, ...equipe], m)}</div>
    <h2 class="mt2">O que cobrar de cada um</h2><p class="mut" style="margin-top:-6px">Referência completa: o que cada pessoa tem que fazer e como o supervisor confere. Dá para imprimir e deixar na mesa.</p>
    ${equipe.map(referenciaCobranca).join('')}
    <h2 class="mt2">O que o próprio supervisor faz</h2>${referenciaCobranca(s)}`;
}

// ═══════════════════════════ METAS ═══════════════════════════
function vMetas() {
  const m = UI.mes, ps = ativos().filter(p => p.kpis.length);
  const cards = ps.map(p => {
    const linhas = p.kpis.map(k => {
      const v = kpiReal(p, k, m), pr = kpiProj(p, k, m), a = ating(k, v), ap = ating(k, pr);
      const real = ehTiny(k) ? `${fmtK(k, v)} <span class="tag azul">${ehExp(k) ? 'Expedição' : 'Tiny'}</span>` : k.entrada === 'M' ? `<input type="number" step="any" min="0" value="${D.mes[p.id]?.[m]?.kpi?.[k.id] ?? ''}" data-c="kpiM" data-p="${p.id}" data-m="${m}" data-k="${k.id}" data-fid="mk-${p.id}-${k.id}" style="width:100px">` : fmtK(k, v);
      return `<tr><td><b>${esc(k.nome)}</b><br><small>${ehTiny(k) ? (ehExp(k) ? 'automático da Expedição' : 'automático do Tiny') : k.entrada === 'D' ? 'lançado todo dia' : 'lançado 1x no mês'}${k.dir === 'menor' ? ' · menor é melhor' : ''}</small></td>
        <td class="dir"><input type="number" step="any" min="0" value="${k.meta}" data-c="meta" data-p="${p.id}" data-k="${k.id}" data-fid="mt-${p.id}-${k.id}" style="width:110px"></td>
        <td class="dir num">${real}</td><td class="cen">${tagPct(a)}</td>
        <td class="dir num">${(k.entrada === 'D' || ehTiny(k)) && k.agreg !== 'media' ? fmtK(k, pr) : '—'}</td><td style="width:22%">${barra(ap)}<small>${P(ap)} na projeção</small></td></tr>`;
    }).join('');
    const det = UI.metasDet === p.id ? detalheLancamentos(p, m) : '';
    return `<div class="card"><div class="secao-titulo"><div style="display:flex;gap:10px;align-items:center">${av(p)}<div><h3 style="margin:0">${esc(p.nome)}</h3><small>${esc(p.cargo)}</small></div></div>
      <button class="btn peq" data-a="metasDet" data-p="${p.id}">${UI.metasDet === p.id ? 'Fechar lançamentos' : 'Ver/corrigir lançamentos dia a dia'}</button></div>
      <div class="rolagem"><table class="tabela mt"><thead><tr><th>Indicador</th><th class="dir">Meta do mês</th><th class="dir">Realizado</th><th class="cen">%</th><th class="dir">Projeção</th><th>Ritmo</th></tr></thead><tbody>${linhas}</tbody></table></div>${det}</div>`;
  }).join('');
  return topo('Metas e números', 'Realizado até agora, projeção para o fim do mês no ritmo atual e metas (editáveis aqui mesmo).', navMes()) + cards
    + `<p class="mut mt"><small>A projeção divide o realizado pelos dias trabalhados até agora e multiplica pelos dias de trabalho do mês. As metas valem para todos os meses. Quando mudar a meta, mude no começo do mês.</small></p>`;
}
function detalheLancamentos(p, m) {
  const kd = p.kpis.filter(k => k.entrada === 'D' && !ehTiny(k)); if (!kd.length) return '<p class="mut mt">Os indicadores desta pessoa vêm do Tiny: não há lançamento manual.</p>';
  const dias = diasDoMes(m).filter(d => d <= hoje() && (trabalha(p, d) || Object.keys(reg(p.id, d)?.kpi || {}).length));
  return `<div class="rolagem mt"><table class="tabela"><thead><tr><th>Dia</th>${kd.map(k => `<th class="dir">${esc(k.nome)}</th>`).join('')}</tr></thead><tbody>
    ${dias.map(d => `<tr><td>${DIAS[dow(d)]} ${fmtCurta(d)}</td>${kd.map(k => `<td class="dir"><input type="number" step="any" min="0" value="${reg(p.id, d)?.kpi?.[k.id] ?? ''}" data-c="kpiD" data-p="${p.id}" data-d="${d}" data-k="${k.id}" data-fid="dl-${d}-${k.id}" style="width:105px"></td>`).join('')}</tr>`).join('')}
  </tbody><tfoot><tr><td>Total</td>${kd.map(k => `<td class="dir">${fmtK(k, kpiReal(p, k, m))}</td>`).join('')}</tr></tfoot></table></div>`;
}

// ═══════════════════════════ REMUNERAÇÃO ═══════════════════════════
function vRemuneracao() {
  const m = UI.mes, ps = D.pessoas.filter(p => p.ativo && p.regras.length);
  const linhas = ps.map(p => ({ p, r: calcRem(p, m) }));
  const T = k => soma(linhas.map(x => x.r[k]));
  const fatR = (somaKpi('fat', m, UI.remModo)?.v || 0) + (somaKpi('fat_mkt', m, UI.remModo)?.v || 0);
  if (!ps.find(p => p.id === UI.remPessoa)) UI.remPessoa = (ps.find(p => subs(p.id).length) || ps[0])?.id || '';
  const sel = pessoa(UI.remPessoa), rs = sel ? calcRem(sel, m) : null;
  const modos = [['realizado', 'Realizado até hoje'], ['projecao', 'Projeção do mês'], ['simulacao', 'Simulação']];
  const grupoH = (g, titulo) => { const its = rs.itens.filter(i => i.grupo === g); return its.length ? `<div class="grupo-h">${titulo}</div>${its.map(i => `<div class="linha-h"><span class="nm">${esc(i.nome)}</span><span class="vl">${R(i.valor)}</span><span class="dt">${esc(i.det)}</span>${i.dica ? `<span class="dica">↗ ${esc(i.dica)}</span>` : ''}</div>`).join('')}` : ''; };
  const detalhe = sel ? `<div class="grid g2 mt">
    <div class="card holerite"><div class="secao-titulo"><div style="display:flex;gap:10px;align-items:center">${av(sel, 'g')}<div><h2 style="margin:0">${esc(sel.nome)}</h2><small>${esc(sel.cargo)} · ${VINCULO[sel.vinculo] || ''}</small></div></div><select data-c="remPessoa">${optPessoas(sel.id, ps)}</select></div>
      ${grupoH('fixo', 'Fixo')}${grupoH('variavel', 'Variável pela própria produção')}${grupoH('equipe', 'Variável pela produção da equipe')}
      <div class="total"><span>Total ${UI.remModo === 'realizado' ? 'até hoje' : UI.remModo === 'projecao' ? 'previsto no mês' : 'simulado'}</span><span>${R(rs.total)}</span></div>
      <div class="mt"><div class="pilha"><i style="width:${rs.total ? rs.fixo / rs.total * 100 : 0}%;background:#8AA0B4"></i><i style="width:${rs.total ? rs.variavel / rs.total * 100 : 0}%;background:var(--verde)"></i><i style="width:${rs.total ? rs.equipe / rs.total * 100 : 0}%;background:#2B7BB9"></i></div>
      <div class="legenda"><span><i style="background:#8AA0B4"></i>Fixo ${P(rs.total ? rs.fixo / rs.total : 0)}</span><span><i style="background:var(--verde)"></i>Própria produção ${P(rs.total ? rs.variavel / rs.total : 0)}</span><span><i style="background:#2B7BB9"></i>Produção da equipe ${P(rs.total ? rs.equipe / rs.total : 0)}</span></div></div>
      ${rs.encargos ? `<p class="mut" style="font-size:13px">Custo para a empresa com encargos estimados (${N(D.config.encargos)}% sobre salário e comissões): <b>${R(rs.custo)}</b>. Prêmios não entram nos encargos.</p>` : ''}
    </div>
    <div class="card explica"><h2>Como ${esc(primeiroNome(sel))} ganha mais</h2><ul>${sel.regras.map(r => `<li>${explicaRegra(sel, r)}</li>`).join('')}</ul>
      ${subs(sel.id).length ? `<p>Os ganhos de equipe usam a produção de: <b>${subs(sel.id).map(x => esc(x.nome)).join(', ')}</b>. Se a equipe vai bem, o supervisor ganha junto. Se só uma pessoa vai bem, ele ganha menos do que se todos baterem a meta.</p>` : ''}
      <p class="mut"><small>Valores e percentuais são editáveis em Configurações › Remuneração.</small></p></div>
  </div>` : '';
  return topo('Remuneração por desempenho', `${fmtMes(m)} · fixo + variável pela própria produção + variável pela produção da equipe (supervisores).`, navMes())
    + `<div class="card"><div class="sliders"><div class="seg">${modos.map(([k, n]) => `<button class="${UI.remModo === k ? 'on' : ''}" data-a="remModo" data-v="${k}">${n}</button>`).join('')}</div>
      ${UI.remModo === 'simulacao' ? `<label>Todos atingem <input type="range" min="0" max="150" step="5" value="${UI.simMeta}" data-c="simMeta" data-live="lbMeta"><b id="lbMeta">${UI.simMeta}%</b> da meta</label><label>Checklist cumprido <input type="range" min="0" max="100" step="5" value="${UI.simCheck}" data-c="simCheck" data-live="lbCheck"><b id="lbCheck">${UI.simCheck}%</b></label>` : `<small class="mut">${UI.remModo === 'realizado' ? 'Com os números lançados até agora.' : 'Se o ritmo do mês continuar igual até o fim.'}</small>`}</div></div>
    <div class="grid g4 mt">
      <div class="card kpi-card"><div class="rot">Folha total</div><div class="val">${R0(T('total'))}</div><div class="sub">${ps.length} pessoa(s)</div></div>
      <div class="card kpi-card"><div class="rot">Parte fixa</div><div class="val">${R0(T('fixo'))}</div><div class="sub">${P(T('total') ? T('fixo') / T('total') : 0)} da folha</div></div>
      <div class="card kpi-card"><div class="rot">Parte variável</div><div class="val c-ok">${R0(T('variavel') + T('equipe'))}</div><div class="sub">${P(T('total') ? (T('variavel') + T('equipe')) / T('total') : 0)} da folha · só existe se houver resultado</div></div>
      <div class="card kpi-card"><div class="rot">Custo da empresa (c/ encargos)</div><div class="val">${R0(T('custo'))}</div><div class="sub">${fatR ? `${P(T('custo') / fatR)} das vendas (${R0(fatR)})` : 'sem vendas lançadas'}</div></div>
    </div>
    <div class="card mt rolagem"><table class="tabela"><thead><tr><th>Pessoa</th><th>Vínculo</th><th class="dir">Fixo</th><th class="dir">Variável próprio</th><th class="dir">Vindo da equipe</th><th class="dir">Total</th><th class="dir">Custo empresa</th></tr></thead><tbody>
      ${linhas.map(({ p, r }) => `<tr class="clic ${p.id === UI.remPessoa ? 'sel' : ''}" data-a="remSel" data-p="${p.id}"><td><div style="display:flex;gap:8px;align-items:center">${av(p)}<div><b>${esc(p.nome)}</b><br><small>${esc(p.cargo)}</small></div></div></td><td>${VINCULO[p.vinculo] || ''}</td><td class="dir">${R0(r.fixo)}</td><td class="dir">${R0(r.variavel)}</td><td class="dir">${r.equipe ? `<b style="color:#2B7BB9">${R0(r.equipe)}</b>` : '—'}</td><td class="dir num"><b>${R0(r.total)}</b></td><td class="dir">${R0(r.custo)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="2">Total</td><td class="dir">${R0(T('fixo'))}</td><td class="dir">${R0(T('variavel'))}</td><td class="dir">${R0(T('equipe'))}</td><td class="dir">${R0(T('total'))}</td><td class="dir">${R0(T('custo'))}</td></tr></tfoot></table></div>
    ${detalhe}
    <div class="nota-legal mt"><b>⚖ Antes de aplicar: o que a lei permite</b>
      <ul>
        <li><b>CLT não pode ser 100% variável.</b> O fixo tem que ser pelo menos o piso da categoria (convenção dos comerciários de Campinas). Quem ganha só comissão também tem direito a, no mínimo, o salário mínimo/piso todo mês (CLT art. 78; Lei 8.716/93).</li>
        <li><b>A comissão faz parte do salário</b>: entra em férias, 13º, FGTS e INSS e gera <b>DSR</b>, que o painel já calcula. Comissão que já foi paga não pode ser reduzida depois.</li>
        <li><b>Prêmios por desempenho</b> (checklist, meta) não fazem parte do salário nem pagam encargos se forem pagos por desempenho acima do esperado (CLT art. 457 §§2º e 4º). Por isso o checklist vira prêmio, e não desconto na comissão.</li>
        <li><b>Estagiário recebe bolsa fixa</b> (Lei 11.788/08), definida no termo de compromisso. O bônus é opcional e deve ser pequeno. Se for grande, ou ligado a vendas, o estágio pode ser considerado emprego disfarçado.</li>
        <li>A regra do variável deve estar <b>por escrito</b> e assinada (aditivo ao contrato ou política de remuneração). Se quiser usar <b>PLR</b> (sem encargos), precisa de acordo com o sindicato ou com uma comissão de empregados (Lei 10.101/00).</li>
        <li>Os valores de salário, metas e percentuais aqui são <b>exemplos</b>. Confirme o piso, os encargos e a redação com o seu contador antes de comunicar à equipe.</li>
      </ul></div>`;
}

// ═══════════════════════════ FEEDBACKS ═══════════════════════════
const TIPOS_FB = { elogio: '👏 Elogio', orientacao: '🧭 Orientação', ocorrencia: '⚠ Ocorrência', um_a_um: '🗣 1:1', avaliacao: '📋 Avaliação mensal' };
function vFeedbacks() {
  const lista = D.feedbacks.filter(f => !UI.fbPessoa || f.pessoa === UI.fbPessoa).sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id));
  const autores = D.pessoas.filter(p => p.ativo && (supervisores().includes(p) || !p.supervisor));
  // quem não tem equipe registra só elogios a colegas; vê só o que fez e o que recebeu (o banco já filtra)
  const lider = temEquipe(), tiposFb = lider ? TIPOS_FB : { elogio: TIPOS_FB.elogio };
  const alvos = lider ? ativos().filter(p => pessoasQueVejo().includes(p.id) && p.id !== EU.id) : ativos().filter(p => p.id !== EU.id);
  const envolvidos = lider ? D.pessoas : D.pessoas.filter(p => D.feedbacks.some(f => f.pessoa === p.id || f.autor === p.id));
  return topo('Feedbacks e ocorrências', lider ? 'Histórico de 1:1, elogios, orientações e ocorrências. Ajuda na avaliação mensal e protege a empresa.' : 'Os feedbacks que você recebeu e os elogios que você fez aos colegas.')
    + `<div class="grid g2"><div class="card"><h2>${lider ? 'Novo registro' : 'Elogiar um colega'}</h2>
      <div class="grid g2" style="gap:10px"><label class="campo">Sobre quem<select id="fbPessoa">${optPessoas(UI.fbPessoa, alvos)}</select></label>
      
      <label class="campo">Tipo<select id="fbTipo">${Object.entries(tiposFb).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="campo">Data<input type="date" id="fbData" value="${hoje()}"></label></div>
      <label class="campo mt">O que aconteceu / o que foi combinado<textarea id="fbTexto" rows="4" placeholder="Ex.: Combinamos que os orçamentos vão sair no mesmo dia. Próxima conversa em 7 dias."></textarea></label>
      <div class="mt"><button class="btn pri" data-a="fbAdd">Salvar registro</button></div></div>
    <div class="card"><div class="secao-titulo"><h2>Histórico</h2><select data-c="fbFiltro">${optPessoas(UI.fbPessoa, envolvidos, 'Todas as pessoas')}</select></div>
      ${lista.length ? lista.map(f => { const p = pessoa(f.pessoa), a = pessoa(f.autor); return `<div class="feedback"><div class="meta">${p ? av(p) : ''}<b style="color:var(--txt)">${esc(p?.nome || '?')}</b><span class="tag">${TIPOS_FB[f.tipo] || f.tipo}</span><span>${fmtCurta(f.data)}/${f.data.slice(0, 4)}</span>${a ? `<span>por ${esc(a.nome)}</span>` : ''}${f.autor === EU.id || ehDono() ? `<button class="icone-btn" style="margin-left:auto" title="Apagar" data-a="fbDel" data-id="${f.id}">🗑</button>` : ''}</div><p>${esc(f.texto)}</p></div>`; }).join('') : '<div class="vazio">Nenhum registro ainda.</div>'}
    </div></div>`;
}

// ═══════════════════════════ CONFIGURAÇÕES ═══════════════════════════
function vConfig() {
  const tabs = [['pessoas', 'Pessoas e organograma'], ['acessos', 'Logins e acessos'], ['tarefas', 'Tarefas'], ['kpis', 'Indicadores e metas'], ['regras', 'Regras de remuneração'], ['solicitacoes', 'Solicitações'], ['tiny', 'Integração Tiny'], ['auditoria', 'Auditoria'], ['geral', 'Geral e backup']];
  if (!pessoa(UI.cfgPessoa)) UI.cfgPessoa = D.pessoas[1]?.id || D.pessoas[0].id;
  const pi = D.pessoas.findIndex(p => p.id === UI.cfgPessoa), p = D.pessoas[pi];
  const selP = `<label class="campo" style="flex-direction:row;align-items:center;gap:8px">Pessoa: <select data-c="cfgPessoa">${optPessoas(p.id)}</select></label>`;
  let corpo = '';
  if (['acessos', 'solicitacoes', 'tiny', 'auditoria'].includes(UI.cfgTab)) corpo = vConfigExtra(UI.cfgTab);
  else if (UI.cfgTab === 'pessoas') {
    corpo = `<div class="card"><div class="cfg-linha cfg-pessoa cfg-cab"><span>Nome</span><span>Cargo</span><span>Supervisor</span><span>Vínculo</span><span>Dias de trabalho</span><span>Ativo</span><span>Início</span><span></span></div>
    ${D.pessoas.map((x, i) => `<div class="cfg-linha cfg-pessoa">
      <input type="text" value="${esc(x.nome)}" data-c="set" data-path="pessoas.${i}.nome" data-fid="pn${i}">
      <input type="text" value="${esc(x.cargo)}" data-c="set" data-path="pessoas.${i}.cargo" data-fid="pc${i}">
      <select data-c="setSup" data-i="${i}">${optPessoas(x.supervisor || '', D.pessoas.filter(o => o.id !== x.id), '— ninguém —')}</select>
      <select data-c="set" data-path="pessoas.${i}.vinculo">${Object.entries(VINCULO).map(([k, v]) => `<option value="${k}" ${x.vinculo === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div class="dias-sel">${[1, 2, 3, 4, 5, 6, 0].map(dd => `<label><input type="checkbox" ${x.dias.includes(dd) ? 'checked' : ''} data-c="dia" data-i="${i}" data-v="${dd}">${DIAS[dd]}</label>`).join('')}</div>
      <input type="checkbox" ${x.ativo ? 'checked' : ''} data-c="set" data-t="bool" data-path="pessoas.${i}.ativo" title="Ativo (desmarque para vaga em aberto ou desligado)">
      <input type="date" value="${x.inicio || ''}" data-c="set" data-path="pessoas.${i}.inicio" title="Data de início (dias antes não contam)">
      <button class="icone-btn" title="Remover pessoa" data-a="delPessoa" data-i="${i}">🗑</button></div>`).join('')}
    <div class="mt acoes"><span>Adicionar pessoa copiando tarefas, metas e regras de:</span><select id="novoModelo">${optPessoas('felipe_moreira')}</select><button class="btn pri" data-a="addPessoa">+ Adicionar</button></div>
    <p class="mut"><small>Desmarque "Ativo" para vagas em aberto ou pessoas desligadas: elas somem do checklist e da folha, mas o histórico fica guardado. A data de início faz os dias anteriores não contarem.</small></p></div>`;
  } else if (UI.cfgTab === 'tarefas') {
    const base = `pessoas.${pi}.tarefas`;
    corpo = `<div class="card"><div class="secao-titulo">${selP}<div class="acoes"><select id="copiarDe">${optPessoas('', D.pessoas.filter(o => o.id !== p.id && o.tarefas.length))}</select><button class="btn" data-a="copiarTarefas">Substituir pelas tarefas desta pessoa</button></div></div>
    <div class="cfg-linha cfg-tarefa cfg-cab"><span>Tarefa</span><span>Frequência</span><span>Quando</span><span>Como o supervisor confere</span><span>Crítica</span><span></span></div>
    ${p.tarefas.map((t, i) => `<div class="cfg-linha cfg-tarefa">
      <input type="text" value="${esc(t.titulo)}" data-c="set" data-path="${base}.${i}.titulo" data-fid="tt${i}">
      <select data-c="set" data-path="${base}.${i}.freq"><option value="D" ${t.freq === 'D' ? 'selected' : ''}>Diária</option><option value="S" ${t.freq === 'S' ? 'selected' : ''}>Semanal</option><option value="M" ${t.freq === 'M' ? 'selected' : ''}>Mensal</option></select>
      ${t.freq === 'D' ? `<select data-c="set" data-path="${base}.${i}.bloco">${[['abertura', 'Abertura'], ['dia', 'Durante o dia'], ['fechamento', 'Fechamento']].map(([k, v]) => `<option value="${k}" ${t.bloco === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`
        : t.freq === 'S' ? `<select data-c="set" data-t="num" data-path="${base}.${i}.diaSemana">${[1, 2, 3, 4, 5, 6].map(dd => `<option value="${dd}" ${t.diaSemana === dd ? 'selected' : ''}>até ${DIAS_LONGO[dd]}</option>`).join('')}</select>`
        : `<label style="display:flex;gap:4px;align-items:center;font-size:13px">até dia <input type="number" min="1" max="31" value="${t.diaMes}" data-c="set" data-t="num" data-path="${base}.${i}.diaMes" style="width:60px"></label>`}
      <input type="text" value="${esc(t.conferir)}" placeholder="Ex.: conferir no painel do ML" data-c="set" data-path="${base}.${i}.conferir" data-fid="tc${i}">
      <input type="checkbox" ${t.critica ? 'checked' : ''} data-c="set" data-t="bool" data-path="${base}.${i}.critica">
      <span><button class="icone-btn" data-a="mov" data-path="${base}" data-i="${i}" data-v="-1" title="Subir">↑</button><button class="icone-btn" data-a="mov" data-path="${base}" data-i="${i}" data-v="1" title="Descer">↓</button><button class="icone-btn" data-a="del" data-path="${base}" data-i="${i}" title="Apagar">🗑</button></span></div>`).join('')}
    <div class="mt"><button class="btn pri" data-a="addTarefa" data-path="${base}">+ Nova tarefa</button></div>
    <p class="mut"><small><b>Crítica</b> = se não for feita, aparece em vermelho para o supervisor cobrar. Tarefas semanais e mensais aparecem no checklist durante a semana/o mês inteiro, com o prazo.</small></p></div>`;
  } else if (UI.cfgTab === 'kpis') {
    const base = `pessoas.${pi}.kpis`;
    corpo = `<div class="card"><div class="secao-titulo">${selP}</div>
    <div class="cfg-linha cfg-kpi cfg-cab"><span>Indicador</span><span>Unidade</span><span>Meta do mês</span><span>Lançamento</span><span>No mês</span><span>Direção</span><span>Origem do número</span><span></span></div>
    ${p.kpis.map((k, i) => `<div class="cfg-linha cfg-kpi">
      <div><input type="text" value="${esc(k.nome)}" data-c="set" data-path="${base}.${i}.nome" data-fid="kn${i}"><small class="mut">código: ${esc(k.id)}</small></div>
      <select data-c="set" data-path="${base}.${i}.un">${['R$', 'un', '%', 'h'].map(u => `<option ${k.un === u ? 'selected' : ''}>${u}</option>`).join('')}</select>
      <input type="number" step="any" value="${k.meta}" data-c="set" data-t="num" data-path="${base}.${i}.meta">
      <select data-c="set" data-path="${base}.${i}.entrada"><option value="D" ${k.entrada === 'D' ? 'selected' : ''}>Todo dia</option><option value="M" ${k.entrada === 'M' ? 'selected' : ''}>1x no mês</option></select>
      <select data-c="set" data-path="${base}.${i}.agreg"><option value="soma" ${k.agreg !== 'media' ? 'selected' : ''}>Soma</option><option value="media" ${k.agreg === 'media' ? 'selected' : ''}>Média</option></select>
      <select data-c="set" data-path="${base}.${i}.dir"><option value="maior" ${k.dir !== 'menor' ? 'selected' : ''}>Mais é melhor</option><option value="menor" ${k.dir === 'menor' ? 'selected' : ''}>Menos é melhor</option></select>
      <select data-c="set" data-path="${base}.${i}.fonte">${Object.entries(FONTES).map(([f, n]) => `<option value="${f}" ${(k.fonte || 'manual') === f ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <button class="icone-btn" data-a="del" data-path="${base}" data-i="${i}" title="Apagar">🗑</button></div>`).join('')}
    <div class="mt"><button class="btn pri" data-a="addKpi" data-path="${base}">+ Novo indicador</button></div>
    <p class="mut"><small>O <b>código</b> liga o indicador às regras de remuneração. Os supervisores usam o mesmo código nos subordinados (ex.: "fat" em todos os vendedores) para somar a produção da equipe.</small></p></div>`;
  } else if (UI.cfgTab === 'regras') {
    const base = `pessoas.${pi}.regras`;
    const kpisProprios = p.kpis.map(k => [k.id, k.nome]);
    const kpisEquipe = [...new Map(D.pessoas.filter(x => x.supervisor === p.id).flatMap(x => x.kpis.map(k => [k.id, k.nome]))).entries()];
    const optK = (lista, sel) => lista.map(([id, nome]) => `<option value="${esc(id)}" ${id === sel ? 'selected' : ''}>${esc(nome)} (${esc(id)})</option>`).join('') || '<option value="">— sem indicadores —</option>';
    corpo = `<div class="card"><div class="secao-titulo">${selP}<small>Prévia do mês atual: <b>${R0(calcRem(p, mesDe(hoje()), 'projecao').total)}</b></small></div>
    ${p.regras.map((r, i) => {
      const pth = `${base}.${i}`;
      const eq = r.tipo === 'override' || r.tipo === 'premio_por_subordinado' || (r.tipo === 'premio_meta' && r.escopo === 'equipe');
      let campos = '';
      if (r.tipo === 'fixo') campos = `<label class="campo" style="flex-direction:row;align-items:center">R$ <input type="number" step="any" value="${r.valor}" data-c="set" data-t="num" data-path="${pth}.valor"></label>`;
      if (['comissao', 'override', 'premio_meta', 'premio_por_subordinado'].includes(r.tipo)) campos += `<label class="campo" style="flex-direction:row;align-items:center">Indicador <select data-c="set" data-path="${pth}.kpi">${optK(eq ? kpisEquipe : kpisProprios, r.kpi)}</select></label>`;
      if (r.tipo === 'premio_meta' || r.tipo === 'premio_disciplina') campos += `<select data-c="set" data-path="${pth}.escopo"><option value="proprio" ${r.escopo !== 'equipe' ? 'selected' : ''}>da própria pessoa</option><option value="equipe" ${r.escopo === 'equipe' ? 'selected' : ''}>da equipe dela</option></select>`;
      if (r.tipo === 'premio_disciplina' || r.tipo === 'premio_por_subordinado') campos += `<label class="campo" style="flex-direction:row;align-items:center">${r.tipo === 'premio_disciplina' ? 'Valor cheio' : 'Por pessoa'} R$ <input type="number" step="any" value="${r.valor}" data-c="set" data-t="num" data-path="${pth}.valor"></label>`;
      if (r.tipo === 'bonus_meta' || r.tipo === 'bonus_produtos') campos += `<label class="campo" style="flex-direction:row;align-items:center">Meta usada <select data-c="set" data-path="${pth}.kpi">${optK(kpisProprios, r.kpi || 'fat')}</select></label>`;
      if (r.tipo === 'bonus_meta') campos += `<label class="campo" style="flex-direction:row;align-items:center">+ <input type="number" step="any" value="${r.taxa}" data-c="set" data-t="num" data-path="${pth}.taxa" style="width:70px"> %</label>`;
      if (r.tipo === 'bonus_produtos') campos += `<label style="font-size:13px"><input type="checkbox" ${r.exige_meta ? 'checked' : ''} data-c="set" data-t="bool" data-path="${pth}.exige_meta"> só paga se bater a meta</label>`;
      let extra = '';
      if (r.tipo === 'comissao_desconto') extra = `<div class="faixas"><b>Faixas:</b>${(r.faixas || []).map((f, j) => `<span class="faixa">desconto até <input type="number" step="any" value="${f.ate}" data-c="set" data-t="num" data-path="${pth}.faixas.${j}.ate">% → <input type="number" step="any" value="${f.taxa}" data-c="set" data-t="num" data-path="${pth}.faixas.${j}.taxa">% <button class="icone-btn" data-a="del" data-path="${pth}.faixas" data-i="${j}" title="Remover faixa">×</button></span>`).join('')}
        <button class="btn peq" data-a="addFaixaDesc" data-path="${pth}.faixas">+ faixa</button><span class="faixa">acima da última (desconto autorizado na tabela ADM) → <input type="number" step="any" value="${r.acima ?? 0}" data-c="set" data-t="num" data-path="${pth}.acima">%</span></div>`;
      if (r.tipo === 'bonus_produtos') extra = `<div class="mt" style="font-size:13px"><div class="cfg-linha cfg-cab" style="grid-template-columns:1.3fr 1.3fr 100px 120px 120px 30px;display:grid"><span>Produto</span><span>Códigos no Tiny (caixa: CÓDIGO*25)</span><span>R$ por unidade</span><span>Meta da equipe (un)</span><span>R$ com a meta da equipe</span><span></span></div>
        ${(r.itens || []).map((it, j) => `<div class="cfg-linha" style="grid-template-columns:1.3fr 1.3fr 100px 120px 120px 30px;display:grid"><input type="text" value="${esc(it.nome)}" data-c="set" data-path="${pth}.itens.${j}.nome"><input type="text" value="${esc(fmtCodigos(it.codigos))}" data-c="codigos" data-path="${pth}.itens.${j}.codigos"><input type="number" step="any" value="${it.valor}" data-c="set" data-t="num" data-path="${pth}.itens.${j}.valor"><input type="number" step="any" value="${it.equipe_qtd || 0}" data-c="set" data-t="num" data-path="${pth}.itens.${j}.equipe_qtd"><input type="number" step="any" value="${it.equipe_valor || 0}" data-c="set" data-t="num" data-path="${pth}.itens.${j}.equipe_valor"><button class="icone-btn" data-a="del" data-path="${pth}.itens" data-i="${j}">🗑</button></div>`).join('')}
        <button class="btn peq mt" data-a="addItemBonus" data-path="${pth}.itens">+ produto</button></div>`;
      const campoF = { comissao: ['taxa', '% sobre o valor'], override: ['taxa', '% sobre a equipe'], premio_meta: ['valor', 'R$ de prêmio'], premio_disciplina: ['mult', '% do valor cheio'] }[r.tipo];
      const faixas = campoF ? `<div class="faixas"><b>Faixas:</b>${(r.faixas || []).map((f, j) => `<span class="faixa">a partir de <input type="number" step="any" value="${f.de}" data-c="set" data-t="num" data-path="${pth}.faixas.${j}.de">% ${r.tipo === 'premio_disciplina' ? 'do checklist' : 'da meta'} → <input type="number" step="any" value="${f[campoF[0]]}" data-c="set" data-t="num" data-path="${pth}.faixas.${j}.${campoF[0]}"> ${campoF[1]} <button class="icone-btn" data-a="del" data-path="${pth}.faixas" data-i="${j}" title="Remover faixa">×</button></span>`).join('')}<button class="btn peq" data-a="addFaixa" data-path="${pth}.faixas" data-campo="${campoF[0]}">+ faixa</button></div>` : '';
      return `<div class="regra"><div class="rcab"><span class="tag azul">${TIPOS_REGRA[r.tipo]}</span><input type="text" value="${esc(r.nome)}" data-c="set" data-path="${pth}.nome" data-fid="rn${i}">${campos}<button class="icone-btn" data-a="mov" data-path="${base}" data-i="${i}" data-v="-1">↑</button><button class="icone-btn" data-a="mov" data-path="${base}" data-i="${i}" data-v="1">↓</button><button class="icone-btn" data-a="del" data-path="${base}" data-i="${i}" title="Apagar regra">🗑</button></div>${faixas}${extra}</div>`;
    }).join('') || '<div class="vazio">Sem regras de remuneração (ex.: sócio).</div>'}
    <div class="mt acoes"><select id="novaRegra">${Object.entries(TIPOS_REGRA).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><button class="btn pri" data-a="addRegra" data-path="${base}">+ Adicionar regra</button></div>
    <div class="explica mt"><b>Como as faixas funcionam:</b> vale a maior faixa que a pessoa alcançou, e o percentual se aplica ao valor inteiro do mês. Ex.: faixas 0% → 0,5% · 70% → 1,5% · 100% → 2,5%. Quem vendeu 105% da meta recebe 2,5% sobre tudo. Isso cria um "degrau" forte para bater a meta.</div></div>`;
  } else {
    corpo = `<div class="grid g2"><div class="card"><h2>Geral</h2>
      <label class="campo">Nome da empresa<input type="text" value="${esc(D.empresa)}" data-c="set" data-path="empresa"></label>
      ${!D.config.dsr ? '<div class="nota-legal mt"><b>⚠ DSR desligado</b>Para CLT, o DSR sobre comissões é obrigatório (Lei 605/49). Desligue aqui só se a contabilidade já calcula o DSR na folha.</div>' : ''}
      <label class="campo mt">Encargos estimados sobre salário e comissões (CLT), em %<input type="number" step="any" value="${D.config.encargos}" data-c="set" data-t="num" data-path="config.encargos"><small class="mut">Simples Nacional (comércio): ~35–40% (FGTS, férias + 1/3, 13º e provisões). Confirme com o contador.</small></label>
      <label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" ${D.config.dsr ? 'checked' : ''} data-c="set" data-t="bool" data-path="config.dsr"> Calcular DSR sobre as comissões (obrigatório para CLT)</label>
      <label class="campo mt">Feriados (um por linha, AAAA-MM-DD): não contam no checklist e entram no DSR<textarea data-c="feriados" rows="5">${esc(D.config.feriados.join('\n'))}</textarea></label></div>
    <div class="card"><h2>Backup</h2><p class="explica">Os dados ficam no banco da Intranet (Supabase, em São Paulo). Dá para baixar uma cópia de tudo o que está carregado agora, em JSON.</p>
      <div class="acoes"><button class="btn" data-a="exportar">⬇ Baixar cópia</button></div></div></div>`;
  }
  return topo('Configurações', 'Pessoas, logins, tarefas, metas, regras de ganho, solicitações e integração com o Tiny.') + `<div class="cfg-tabs">${tabs.map(([k, n]) => `<button class="btn ${UI.cfgTab === k ? 'on' : ''}" data-a="cfgTab" data-v="${k}">${n}</button>`).join('')}</div>` + corpo;
}

// ═══════════════════════════ AJUDA ═══════════════════════════
function vAjuda() {
  return topo('Como usar o painel', 'A rotina de cada um, em poucos minutos por dia.') + `<div class="grid g2">
  <div class="card explica"><h2>Colaborador (estagiários e vendedores)</h2><ul>
    <li>Ao chegar: abrir <b>Checklist do dia</b>, escolher o próprio nome e fazer as tarefas de <b>Abertura</b>.</li>
    <li>Ao longo do dia: marcar cada tarefa <b>na hora em que fizer</b>. Use o ✎ para anotar por que algo não deu certo.</li>
    <li>Antes de sair: preencher os <b>Números do dia</b> (vendas, pedidos, peças…). É isso que calcula a comissão.</li>
    <li>Tarefas da semana e do mês aparecem embaixo, com o prazo. Ficam vermelhas quando atrasam.</li></ul></div>
  <div class="card explica"><h2>Supervisor (Marcos e Felipe Menezes)</h2><ul>
    <li>De manhã: abrir <b>Supervisão</b>. Os cartões mostram o que cobrar de cada pessoa: crítica não feita ontem, semanal ou mensal atrasada.</li>
    <li>Conferir o dia anterior de cada um e marcar <b>"Conferido"</b> no fim do checklist. Conferir é olhar a evidência (o "Como conferir" de cada tarefa), não só confiar no ✓.</li>
    <li>Registrar os 1:1, elogios e ocorrências em <b>Feedbacks</b>.</li>
    <li>Toda semana: ver o mapa de calor e a projeção das metas. Abaixo de 70% = conversa de plano de ação.</li></ul></div>
  <div class="card explica"><h2>Dono (Vinícius)</h2><ul>
    <li><b>Visão geral</b>: vendas x meta, checklist da equipe, folha prevista e avisos.</li>
    <li><b>Remuneração</b>: realizado até hoje, projeção ou simulação ("e se todos baterem 110%?"). Mostra quanto cada supervisor ganha com a equipe.</li>
    <li>No dia 1: ajustar as metas em <b>Metas e números</b>. No dia 3–4: fechar o mês anterior em Remuneração › Realizado e conferir com o Tiny.</li></ul></div>
  <div class="card explica"><h2>Lógica da remuneração</h2><ul>
    <li><b>Fixo</b> = piso garantido (CLT) ou bolsa (estágio).</li>
    <li><b>Comissão escalonada</b> = % sobre a própria venda, que sobe por degraus de meta.</li>
    <li><b>Ganho de equipe</b> (supervisor) = % sobre o total da equipe + prêmio por pessoa que bateu a meta + prêmio pelo checklist da equipe. O supervisor só ganha bem se a equipe toda for bem.</li>
    <li><b>Prêmio de disciplina</b> = pago pelo checklist cumprido no mês (≥90% recebe tudo, 80–89% recebe metade).</li></ul>
    <p>O guia completo está em <code>projeto-supervisao\\sistema-remuneracao.md</code>.</p></div>
  </div>`;
}

