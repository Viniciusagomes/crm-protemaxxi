'use strict';
/* Calendário de marketing: itens por dia (post, reels, anúncio, campanha, arte…) de quem tem a permissão "calendario".
   A pessoa vê o dia dela no Meu dia e no Checklist; o supervisor e o dono acompanham e incluem itens na aba 📅 Calendário.
   Item passado pelo supervisor: a pessoa só muda o andamento e a observação (o banco confere a mesma regra). */

const CAL = { itens: null, atrasados: [], mes: '', de: '', ate: '', dia: '', carregando: false, erro: '', gravando: new Set() };
const CAL_CANAIS = {
  instagram: ['📸', 'Instagram', '#C13584'], facebook: ['📘', 'Facebook', '#1877F2'], google: ['🔎', 'Google Ads', '#34A853'],
  site: ['🌐', 'Site', '#6B5BD2'], ml: ['🛍', 'Mercado Livre', '#D9A400'], whatsapp: ['💬', 'WhatsApp', '#25A366'],
  email: ['✉', 'E-mail', '#D9822B'], loja: ['🏪', 'Loja física', '#8A6D3B'], design: ['🎨', 'Arte / design', '#D6457A'], outro: ['📌', 'Outro', '#8AA0B4'],
};
const CAL_STATUS = { a_fazer: ['A fazer', ''], fazendo: ['Em produção', 'azul'], revisar: ['Para revisar', 'med'], feito: ['Feito', 'ok'] };
const CAL_REPETIR = [['0', 'Não repetir'], ['u5', 'Todo dia útil, por 1 semana'], ['s4', 'Toda semana, por 4 semanas'], ['s8', 'Toda semana, por 8 semanas'], ['m3', 'Todo mês, por 3 meses']];

/** Quem tem calendário e eu enxergo (eu mesmo, minha equipe; o dono vê todos). */
const calPessoas = () => (D?.pessoas || []).filter(p => p.ativo && p.permissoes?.calendario && pessoasQueVejo().includes(p.id));
function calQuem() {
  const ps = calPessoas();
  if (!ps.some(p => p.id === UI.calPessoa)) UI.calPessoa = (ps.find(p => p.id === EU.id) || ps[0])?.id || '';
  return UI.calPessoa;
}
const calLink = u => /^https?:\/\/\S+$/i.test(String(u || '').trim()) ? String(u).trim() : '';
const calItem = id => [...(CAL.itens || []), ...CAL.atrasados].find(i => String(i.id) === String(id));
/** Item passado por outra pessoa: quem recebeu só muda andamento e observação. */
const calPodeEditar = i => ehDono() || i.pessoa_id !== EU.id || i.criado_por === EU.id;
const calDoDia = (pid, d) => (CAL.itens || []).filter(i => i.pessoa_id === pid && i.data === d).sort((a, b) => a.ordem - b.ordem || a.id - b.id);
/** Carregado hoje e cobrindo o dia: na virada do dia recarrega (o que era de hoje passa a ser atrasado). */
const calCarregado = d => !!CAL.itens && CAL.dia === hoje() && d >= CAL.de && d <= CAL.ate;

async function carregarCal(mes) {
  const ids = calPessoas().map(p => p.id), h = hoje();
  // o mês com uma semana de folga dos dois lados (a grade mostra dias do mês vizinho) e sempre o dia de hoje
  let de = addDias(mes + '-01', -7), ate = addDias(`${mes}-${pad(ultimoDia(mes))}`, 7);
  if (h < de) de = h; if (h > ate) ate = h;
  if (!ids.length) { Object.assign(CAL, { itens: [], atrasados: [], mes, de, ate, dia: h, erro: '' }); return; }
  CAL.carregando = true;
  try {
    const [itens, atrasados] = await Promise.all([
      ok(sb.from('calendario').select('*').in('pessoa_id', ids).gte('data', de).lte('data', ate).order('data').order('ordem').order('id')),
      ok(sb.from('calendario').select('*').in('pessoa_id', ids).lt('data', h).neq('status', 'feito').order('data').limit(200)),
    ]);
    Object.assign(CAL, { itens, atrasados, mes, de, ate, dia: h, erro: '' });
  } catch (e) { CAL.erro = e.message; throw e; }
  finally { CAL.carregando = false; }
}
/** Carrega uma vez; se der erro, só tenta de novo quando a pessoa pedir (evita repetir sem parar a cada tela). */
function calGarantir(mes) {
  if (CAL.carregando || CAL.erro) return;
  carregarCal(mes).catch(() => {}).finally(render);
}
/** Troca o item nas duas listas depois de gravar; o atrasado sai da lista quando termina ou muda para hoje em diante. */
function calTrocar(novo) {
  const t = l => l.map(i => i.id === novo.id ? novo : i);
  if (CAL.itens) CAL.itens = calCarregado(novo.data) ? (CAL.itens.some(i => i.id === novo.id) ? t(CAL.itens) : [...CAL.itens, novo]) : CAL.itens.filter(i => i.id !== novo.id);
  CAL.atrasados = t(CAL.atrasados).filter(i => i.status !== 'feito' && i.data < hoje());
  if (novo.status !== 'feito' && novo.data < hoje() && !CAL.atrasados.some(i => i.id === novo.id)) CAL.atrasados.push(novo);
}

// ─── pedaços da tela ───
function calChip(i) {
  const [ic, , cor] = CAL_CANAIS[i.canal] || CAL_CANAIS.outro;
  return `<div class="cal-item st-${i.status}" ${calPodeEditar(i) ? 'draggable="true"' : ''} data-cal="${i.id}" data-a="calAbrir" data-id="${i.id}" style="border-left-color:${cor}" title="${esc(i.titulo)} · ${CAL_STATUS[i.status]?.[0] || ''}">${ic} ${esc(i.titulo)}</div>`;
}
function linhaCal(i) {
  const h = hoje(), [ic, canal] = CAL_CANAIS[i.canal] || CAL_CANAIS.outro, feito = i.status === 'feito', lk = calLink(i.link);
  return `<div class="tarefa ${feito ? 'feita' : ''}"><input type="checkbox" ${feito ? 'checked' : ''} data-c="calFeito" data-id="${i.id}" title="Marcar como feito">
    <div><div class="tt">${ic} ${esc(i.titulo)}</div><small class="mut">${canal}${!feito && i.data < h ? ` · <span class="c-ruim">atrasado desde ${fmtCurta(i.data)}</span>` : ''}${i.criado_por && i.criado_por !== i.pessoa_id ? ` · passado por ${esc(nomeP(i.criado_por))}` : ''}${lk ? ` · <a href="${esc(lk)}" target="_blank" rel="noopener">abrir link</a>` : ''}</small>${i.obs ? `<br><small>💬 ${esc(i.obs)}</small>` : ''}</div>
    <div class="cal-acoes"><select data-c="calStatus" data-id="${i.id}" title="Andamento">${Object.entries(CAL_STATUS).map(([k, [n]]) => `<option value="${k}" ${k === i.status ? 'selected' : ''}>${n}</option>`).join('')}</select><button class="btn peq" data-a="calAbrir" data-id="${i.id}">Abrir</button></div></div>`;
}
/** Card do dia (Meu dia e Checklist): o que está marcado para o dia e, hoje, o que ficou atrasado. */
function cardCalendario(p, d = hoje()) {
  if (!p?.permissoes?.calendario || !pessoasQueVejo().includes(p.id)) return '';
  const tit = `<div class="secao-titulo"><h2>📅 Calendário de marketing</h2>`;
  if (CAL.erro) return `<div class="card mt">${tit}</div><p class="mut">Não consegui abrir o calendário: ${esc(CAL.erro)} <a href="#" data-a="calRecarregar">tentar de novo</a></p></div>`;
  if (!calCarregado(d)) { calGarantir(mesDe(d)); return `<div class="card mt">${tit}</div><div class="vazio">Carregando…</div></div>`; }
  const its = calDoDia(p.id, d), atr = d === hoje() ? CAL.atrasados.filter(i => i.pessoa_id === p.id) : [], feitos = its.filter(i => i.status === 'feito').length;
  return `<div class="card mt">${tit}<small>${feitos}/${its.length} feito(s) ${d === hoje() ? 'hoje' : 'em ' + fmtCurta(d)} · <a href="#" data-a="calIr" data-p="${p.id}" data-d="${d}">abrir o calendário</a></small></div>
    ${atr.length ? `<p style="margin:6px 0 0"><span class="tag ruim">${atr.length} atrasado(s)</span></p>${atr.map(linhaCal).join('')}` : ''}
    ${its.map(linhaCal).join('') || '<div class="vazio" style="padding:12px">Nada no calendário para este dia.</div>'}
    <div class="mt"><button class="btn peq" data-a="calNovo" data-d="${d}" data-p="${p.id}">+ Incluir neste dia</button></div></div>`;
}
function gradeCal(pid, mes) {
  const h = hoje(), ini = addDias(mes + '-01', -dow(mes + '-01')), fim = `${mes}-${pad(ultimoDia(mes))}`, ult = addDias(fim, 6 - dow(fim)), dias = [];
  for (let d = ini; d <= ult; d = addDias(d, 1)) dias.push(d);
  return `<div class="cal-grade">${DIAS.map(n => `<div class="cal-cab">${n}</div>`).join('')}${dias.map(d => {
    const its = calDoDia(pid, d), atrasado = d < h && its.some(i => i.status !== 'feito');
    return `<div class="cal-dia ${mesDe(d) !== mes ? 'fora' : ''} ${d === h ? 'hoje' : ''} ${atrasado ? 'atrasado' : ''}" data-cal-dia="${d}">
      <div class="cal-num"><a href="#" data-a="calDia" data-d="${d}" title="Ver o dia">${pd(d).getDate()}</a><button class="cal-mais" data-a="calNovo" data-d="${d}" data-p="${pid}" title="Incluir neste dia">+</button></div>
      ${its.map(calChip).join('')}</div>`; }).join('')}</div>`;
}
function listaCal(pid, mes) {
  const h = hoje(), atr = mes === mesDe(h) ? CAL.atrasados.filter(i => i.pessoa_id === pid && mesDe(i.data) !== mes) : [];
  const dias = diasDoMes(mes).filter(d => calDoDia(pid, d).length);
  return `<div class="card">${atr.length ? `<h3 class="c-ruim" style="margin-top:0">Atrasados de meses anteriores</h3>${atr.map(linhaCal).join('')}` : ''}
    ${dias.map(d => `<h3 class="${d === h ? 'c-ok' : ''}" style="margin:14px 0 2px">${d === h ? 'Hoje · ' : ''}${fmtData(d)} <button class="btn peq" data-a="calNovo" data-d="${d}" data-p="${pid}" title="Incluir neste dia">+</button></h3>${calDoDia(pid, d).map(linhaCal).join('')}`).join('')
      || `<div class="vazio">Nada no calendário em ${fmtMes(mes)}.</div>`}</div>`;
}

function vCalendario() {
  const ps = calPessoas();
  if (!ps.length) return topo('Calendário de marketing', '') + `<div class="card vazio">Ninguém da sua equipe tem calendário.${ehDono() ? ' Ligue "Calendário de marketing" na pessoa em Configurações › Acessos.' : ''}</div>`;
  const pid = calQuem(), p = pessoa(pid), mes = UI.calMes || mesDe(hoje()), h = hoje();
  const vista = UI.calVista || (window.innerWidth < 700 ? 'lista' : 'mes');
  const acoes = `<div class="seg"><button class="${vista === 'mes' ? 'on' : ''}" data-a="calVista" data-v="mes">Mês</button><button class="${vista === 'lista' ? 'on' : ''}" data-a="calVista" data-v="lista">Lista</button></div><button class="btn pri" data-a="calNovo" data-d="${mes === mesDe(h) ? h : mes + '-01'}" data-p="${pid}">+ Novo item</button>`;
  const cab = topo('📅 Calendário de marketing', `O que ${esc(p.nome.split(' ')[0])} tem para fazer a cada dia. Clique no dia para incluir; arraste o item para mudar a data.`, acoes)
    + (ps.length > 1 ? `<div class="chips" style="margin-bottom:12px">${ps.map(x => `<button class="chip ${x.id === pid ? 'on' : ''}" data-a="calPessoa" data-v="${x.id}">${esc(x.nome)}</button>`).join('')}</div>` : '')
    + `<div class="navdia" style="margin-bottom:12px"><button class="btn peq" data-a="calMes" data-v="-1">◀</button><span class="data">${fmtMes(mes)}</span><button class="btn peq" data-a="calMes" data-v="1">▶</button>${mes !== mesDe(h) ? '<button class="btn peq" data-a="calMes" data-v="0">Mês atual</button>' : ''}</div>`;
  if (CAL.erro) return cab + `<div class="card vazio">Não consegui abrir o calendário: ${esc(CAL.erro)}<br><button class="btn mt" data-a="calRecarregar">Tentar de novo</button></div>`;
  if (CAL.mes !== mes || !calCarregado(mes + '-01')) { calGarantir(mes); return cab + '<div class="card vazio">Carregando…</div>'; }
  const doMes = CAL.itens.filter(i => i.pessoa_id === pid && mesDe(i.data) === mes);
  const kpi = (rot, val, cor) => `<div class="card kpi-card"><div class="rot">${rot}</div><div class="val ${cor || ''}">${val}</div></div>`;
  const atr = CAL.atrasados.filter(i => i.pessoa_id === pid).length;
  return cab + `<div class="grid g4" style="margin-bottom:12px">${kpi('Itens no mês', doMes.length)}${kpi('Feitos', doMes.filter(i => i.status === 'feito').length, 'c-ok')}
      ${kpi('Para revisar', doMes.filter(i => i.status === 'revisar').length, 'c-med')}${kpi('Atrasados', atr, atr ? 'c-ruim' : 'c-ok')}</div>
    ${vista === 'mes' ? `<div class="card cal-card">${gradeCal(pid, mes)}</div><div class="legenda mt">${Object.values(CAL_CANAIS).map(([ic, n, c]) => `<span><i style="background:${c}"></i>${ic} ${n}</span>`).join('')}</div>` : listaCal(pid, mes)}`;
}

// ─── formulário ───
function calForm(i, d, pid) {
  const novo = !i, pode = novo || calPodeEditar(i), dis = pode ? '' : 'disabled', quem = pessoa(novo ? pid : i.pessoa_id);
  const opt = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${Array.isArray(v) && v.length > 2 ? v[0] + ' ' + v[1] : v[0]}</option>`).join('');
  modal(`<h2 style="margin-top:0">${novo ? 'Incluir no calendário' : 'Item do calendário'} <small class="mut">· ${esc(quem?.nome || '')}</small></h2>
    ${novo ? `<label class="campo">O que fazer <small class="mut">uma linha por item: várias linhas criam vários itens no mesmo dia</small><textarea id="calTitulo" rows="3" placeholder="Ex.: Reels do kit 4 câmeras&#10;Story da promoção da semana"></textarea></label>`
      : `<label class="campo">O que fazer<input id="calTitulo" value="${esc(i.titulo)}" maxlength="300" ${dis}></label>`}
    <div class="form-grid mt">
      <label class="campo">Dia<input type="date" id="calData" value="${novo ? d : i.data}" ${dis}></label>
      <label class="campo">Canal<select id="calCanal" ${dis}>${opt(CAL_CANAIS, novo ? 'instagram' : i.canal)}</select></label>
      <label class="campo">Andamento<select id="calStatusF">${opt(CAL_STATUS, novo ? 'a_fazer' : i.status)}</select></label>
      ${novo ? `<label class="campo">Repetir<select id="calRepetir">${CAL_REPETIR.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>` : ''}
    </div>
    <label class="campo mt">Briefing / detalhes<textarea id="calDescricao" rows="4" maxlength="4000" placeholder="Objetivo, texto, referência, produto…" ${dis}>${esc(i?.descricao || '')}</textarea></label>
    <label class="campo mt">Link (arte, post, pasta do Drive)<input id="calLink" value="${esc(i?.link || '')}" placeholder="https://" maxlength="1000" ${dis}></label>
    ${novo ? '' : `<label class="campo mt">Observação de ${esc(quem?.nome?.split(' ')[0] || '')} <small class="mut">andamento, dúvida, onde parou</small><textarea id="calObs" rows="2" maxlength="2000">${esc(i.obs || '')}</textarea></label>`}
    ${pode ? '' : '<p class="mut">Este item foi passado pelo seu supervisor: você muda o andamento e a observação.</p>'}
    ${novo ? '' : `<p><small class="mut">Incluído por ${esc(nomeP(i.criado_por))} em ${new Date(i.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${i.feito_em ? ` · feito por ${esc(nomeP(i.feito_por))} em ${new Date(i.feito_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</small></p>`}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">${!novo && pode ? `<button class="btn" data-a="calExcluir" data-id="${i.id}" style="margin-right:auto">🗑 Excluir</button>` : ''}
      <button class="btn" data-a="fecharModal">Cancelar</button><button class="btn pri" data-a="calSalvar" data-id="${novo ? '' : i.id}" data-p="${novo ? pid : i.pessoa_id}">Salvar</button></div>`);
  if (novo) setTimeout(() => $('#calTitulo')?.focus(), 0);
}
function calDiaModal(d, pid) {
  const its = calDoDia(pid, d);
  modal(`<h2 style="margin-top:0">${fmtData(d)} <small class="mut">· ${esc(nomeP(pid))}</small></h2>${its.map(linhaCal).join('') || '<div class="vazio">Nada neste dia.</div>'}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" data-a="fecharModal">Fechar</button><button class="btn pri" data-a="calNovo" data-d="${d}" data-p="${pid}">+ Incluir neste dia</button></div>`);
}
/** Datas do "Repetir": dia útil = segunda a sexta; mês curto cai no último dia. */
function calDatasRepetir(d, rep) {
  if (rep === 's4' || rep === 's8') return Array.from({ length: +rep.slice(1) }, (_, k) => addDias(d, 7 * k));
  if (rep === 'u5') { const out = []; for (let x = d; out.length < 5; x = addDias(x, 1)) if (dow(x) % 6) out.push(x); return out; }
  if (rep === 'm3') return [0, 1, 2].map(k => { const m = addMes(mesDe(d), k); return `${m}-${pad(Math.min(+d.slice(8), ultimoDia(m)))}`; });
  return [d];
}
/** Linhas do campo "O que fazer": tira marcador de lista (-, •, 1.) sem comer número que faz parte do texto. */
const calTitulos = txt => String(txt || '').split('\n').map(s => s.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, '').trim()).filter(Boolean).map(s => s.slice(0, 300));

async function calSalvar(el) {
  if (CAL.gravando.has('form')) return;
  const id = el.dataset.id, pid = el.dataset.p, v = s => ($(s)?.value ?? '').trim(), data = v('#calData');
  const base = { canal: v('#calCanal') || 'outro', status: v('#calStatusF') || 'a_fazer', descricao: v('#calDescricao') || null, link: v('#calLink') || null };
  if (base.link && !calLink(base.link)) return avisar('O link precisa começar com http:// ou https://');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return avisar('Escolha o dia.');
  CAL.gravando.add('form');
  try {
    if (id) {
      const i = calItem(id); if (!i) return;
      const mud = calPodeEditar(i) ? { ...base, titulo: v('#calTitulo'), data } : { status: base.status };
      if ('titulo' in mud && !mud.titulo) return avisar('Escreva o que fazer.');
      mud.obs = v('#calObs') || null;
      calTrocar(await ok(sb.from('calendario').update(mud).eq('id', i.id).select().single()));
    } else {
      const titulos = calTitulos($('#calTitulo')?.value), datas = calDatasRepetir(data, $('#calRepetir')?.value || '0');
      if (!titulos.length) return avisar('Escreva o que fazer.');
      if (titulos.length * datas.length > 60) return avisar(`Isso daria ${titulos.length * datas.length} itens. O máximo de uma vez é 60.`);
      const linhas = datas.flatMap(d => { const ja = calDoDia(pid, d).length; return titulos.map((titulo, k) => ({ pessoa_id: pid, data: d, titulo, ordem: ja + k, ...base })); });
      for (const n of await ok(sb.from('calendario').insert(linhas).select())) calTrocar(n);
    }
    fecharModal(); render(); avisar('Calendário atualizado.');
  } catch (e) { avisar(e.message); }
  finally { CAL.gravando.delete('form'); }
}
async function calMudar(id, mud) {
  const i = calItem(id); if (!i || CAL.gravando.has(i.id)) return;
  CAL.gravando.add(i.id);
  try { calTrocar(await ok(sb.from('calendario').update(mud).eq('id', i.id).select().single())); }
  catch (e) { avisar(e.message); }
  finally { CAL.gravando.delete(i.id); render(); }
}
async function calExcluir(id) {
  const i = calItem(id); if (!i || !confirm(`Excluir "${i.titulo}" do calendário?`)) return;
  try {
    if (!await ok(sb.from('calendario').delete().eq('id', i.id).select('id').maybeSingle())) return avisar('Você não pode excluir este item.');
    CAL.itens = (CAL.itens || []).filter(x => x.id !== i.id); CAL.atrasados = CAL.atrasados.filter(x => x.id !== i.id);
    fecharModal(); render(); avisar('Item excluído.');
  } catch (e) { avisar(e.message); }
}
function calMover(id, d) {
  const i = calItem(id); if (!i || i.data === d) return;
  if (!calPodeEditar(i)) return avisar('Este item foi passado pelo seu supervisor: peça a ele para mudar a data.');
  calMudar(id, { data: d });
}

// arrastar o item para outro dia (só na grade do mês)
document.addEventListener('dragstart', e => { const c = e.target.closest?.('[data-cal]'); if (c) { e.dataTransfer.setData('text/cal', c.dataset.cal); c.classList.add('arrastando'); } });
document.addEventListener('dragend', e => { e.target.closest?.('[data-cal]')?.classList.remove('arrastando'); document.querySelectorAll('.cal-dia.sobre').forEach(x => x.classList.remove('sobre')); });
document.addEventListener('dragover', e => { const dia = e.target.closest?.('[data-cal-dia]'); if (dia && e.dataTransfer.types.includes('text/cal')) { e.preventDefault(); document.querySelectorAll('.cal-dia.sobre').forEach(x => x !== dia && x.classList.remove('sobre')); dia.classList.add('sobre'); } });
document.addEventListener('drop', e => { const dia = e.target.closest?.('[data-cal-dia]'); const id = e.dataTransfer.getData('text/cal'); if (!dia || !id) return; e.preventDefault(); dia.classList.remove('sobre'); calMover(id, dia.dataset.calDia); });
