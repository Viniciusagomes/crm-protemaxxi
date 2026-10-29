'use strict';
/* Intranet Protemaxxi — CRM: funil de negócios (estilo Pipedrive), atividades e "Meu dia" do vendedor.
   Orçamentos do Tiny entram sozinhos como negócios (função orcamentos-sync) e acompanham a situação do Tiny. */

const ETAPAS_CRM = [['novo', 'Novo contato', 10], ['qualificado', 'Qualificado', 25], ['orcamento', 'Orçamento enviado', 50], ['negociacao', 'Negociação', 75], ['ganho', 'Ganho', 100], ['perdido', 'Perdido', 0]];
const PROB = Object.fromEntries(ETAPAS_CRM.map(([k, , p]) => [k, p / 100]));
const NOME_ETAPA = Object.fromEntries(ETAPAS_CRM.map(([k, n]) => [k, n]));
const ORIGENS = { balcao: '🏪 Balcão', whatsapp: '💬 WhatsApp', instagram: '📸 Instagram', site: '🌐 Site', indicacao: '🤝 Indicação', tecnico: '🛠 Técnico parceiro', ml: '🛍 Mercado Livre', prospeccao: '📞 Prospecção', trafego: '📣 Tráfego pago', outro: '• Outro' };
const TIPOS_ATV = { ligar: '📞 Ligar', whatsapp: '💬 WhatsApp', visita: '🤝 Visita', orcamento: '📝 Orçamento', followup: '🔁 Follow-up', posvenda: '📦 Pós-venda', tarefa: '☑ Tarefa' };
const MOTIVOS_PERDA = ['Preço', 'Prazo de entrega', 'Sem estoque', 'Comprou no concorrente', 'Desistiu / adiou', 'Sem retorno do cliente', 'Orçamento cancelado no Tiny', 'Outro'];
const CRM = { neg: null, atv: null, revisoes: [], carregando: false, em: 0, gravando: new Set() };

async function carregarCRM(forcar) {
  if (CRM.carregando || (!forcar && CRM.neg && Date.now() - CRM.em < 60e3)) return;
  CRM.carregando = true;
  try {
    const desde = new Date(Date.now() - 120 * 864e5).toISOString();
    const [neg, atv, revisoes] = await Promise.all([
      todas(() => sb.from('negocios').select('*').or(`etapa.not.in.(ganho,perdido),fechado_em.gte.${desde}`).order('atualizado_em', { ascending: false }).order('id')),
      todas(() => sb.from('atividades').select('*').or(`feito.eq.false,feito_em.gte.${desde}`).order('quando').order('id')),
      todas(() => sb.from('v_crm_revisoes').select('*').order('negocio_id')),
    ]);
    // Atividades pendentes podem pertencer a negócios encerrados há mais de 120 dias.
    const conhecidos = new Set(neg.map(n => n.id));
    const faltam = [...new Set(atv.filter(a => !a.feito && a.negocio_id && !conhecidos.has(a.negocio_id)).map(a => a.negocio_id))];
    for (let i = 0; i < faltam.length; i += 100) neg.push(...await todas(() => sb.from('negocios').select('*').in('id', faltam.slice(i,i+100)).order('id')));
    CRM.neg = neg; CRM.atv = atv; CRM.revisoes = revisoes; CRM.em = Date.now();
  } finally { CRM.carregando = false; }
}
/** Telefone do negócio: o da ficha do cliente ou o que veio escrito no nome do contato do Tiny ("19 98166-4877 ~Fernanda"). */
/** Botão + das tarefas: contato do cliente (celular, telefone, e-mail) com atalhos para WhatsApp, ligar e e-mail. */
async function atvContato(id) {
  const a = (CRM.atv || []).find(x => String(x.id) === String(id));
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>${esc(a?.cliente_nome || 'Contato do cliente')}</h2><p class="mut">Carregando o contato…</p>`);
  const { data: c, error } = await sb.rpc('contato_atividade', { p_atividade: Number(id) });
  if (error || !c) return modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Contato do cliente</h2><div class="alerta med"><span class="ic">!</span><span>${esc(error?.message || 'Não encontrei o contato desta tarefa.')}</span></div>`);
  // contato escrito no próprio nome (ex.: "19 99547-8814 ~Valdecir"): usa como celular
  const doNome = ((c.nome || '').match(/(\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/) || [''])[0];
  const cel = c.celular || doNome, dig = s => String(s || '').replace(/\D/g, '');
  const wa = n => { const d = dig(n); return d.length >= 10 ? 'https://wa.me/' + (d.startsWith('55') && d.length > 11 ? d : '55' + d) : ''; };
  const linha = (ic, rot, v, extra) => `<div class="cont-linha"><span class="ic">${ic}</span><div><small class="mut">${rot}</small><br><b>${v ? esc(v) : '<span class="mut">não cadastrado</span>'}</b></div>${v ? extra : ''}</div>`;
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>${esc(c.nome || a?.cliente_nome || 'Cliente')}</h2>
    <p class="mut">${[c.cidade, c.uf].filter(Boolean).map(esc).join(' / ')}${c.doc ? ` · ${c.doc.length === 14 ? 'CNPJ' : 'CPF'} ${esc(c.doc)}` : ''}</p>
    ${linha('📱', 'Celular / WhatsApp', cel, `${wa(cel) ? `<a class="btn pri peq" href="${wa(cel)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}<a class="btn peq" href="tel:${dig(cel)}">📞 Ligar</a>`)}
    ${c.fone && dig(c.fone) !== dig(cel) ? linha('☎', 'Telefone', c.fone, `<a class="btn peq" href="tel:${dig(c.fone)}">📞 Ligar</a>`) : ''}
    ${linha('✉', 'E-mail', (c.email || '').trim(), `<a class="btn peq" href="mailto:${esc((c.email || '').trim())}">✉ Enviar e-mail</a>`)}
    ${!cel && !c.email ? '<div class="alerta med mt"><span class="ic">!</span><span>Sem celular e sem e-mail no cadastro. Ao falar com o cliente, peça e atualize no Tiny.</span></div>' : ''}
    ${c.chave ? `<div class="acoes mt"><button class="btn peq" data-a="verCliente" data-chave="${esc(c.chave)}">Ficha do cliente</button></div>` : ''}`);
}

function foneNegocio(n) {
  const c = (D.clientes || []).find(x => x.chave === n.cliente_chave);
  if (c?.fone) return c.fone;
  const m = (n.cliente_nome || '').match(/(\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/);
  return m ? m[0].replace(/\D/g, '') : '';
}
const atvRevisar = a => !a.feito && !a.arquivada_em && !a.revisada_em && a.tipo === 'followup' && (CRM.neg || []).some(n => n.id === a.negocio_id && ['ganho', 'perdido'].includes(n.etapa));
const atvPendente = a => !a.feito && !a.arquivada_em && !atvRevisar(a);
const atvAbertas = n => (CRM.atv || []).filter(a => a.negocio_id === n.id && atvPendente(a)).sort((a, b) => a.quando.localeCompare(b.quando));
const revisaoCRM = n => CRM.revisoes.find(x => x.negocio_id === n.id) || {};
function movimentoCRM(id) {
  const n = (CRM.neg || []).find(n => n.id === id); if (!n) return;
  n.mov_em = new Date().toISOString();
  const r = CRM.revisoes.find(r => r.negocio_id === id); if (r) r.inativo = false;
}
function alertasNegocio(n) {
  const r = revisaoCRM(n);
  if (['ganho','perdido'].includes(n.etapa)) return '';
  return `${r.inativo ? '<span class="tag med">⚠ Retomar negociação</span>' : ''}${r.pedidos_conferir ? '<span class="tag azul">Conferir compra</span>' : ''}${r.proposta_semelhante ? '<span class="tag med">Revisar propostas</span>' : ''}`;
}
const vendCRM = () => D.pessoas.filter(p => p.ativo && p.tiny && pessoasQueVejo().includes(p.id));

// ─── Funil ───
function vCRM() {
  if (!CRM.neg) { if (!CRM.carregando) carregarCRM().then(render).catch(e => avisar(e.message)); return topo('Funil de vendas', '') + '<div class="card vazio">Carregando o funil…</div>'; }
  UI.crmAba ||= 'funil';
  const vends = vendCRM(), fV = UI.crmVend || '';
  const neg = CRM.neg.filter(n => !fV || n.pessoa_id === fV);
  const abertos = neg.filter(n => !['ganho', 'perdido'].includes(n.etapa));
  const semAtv = abertos.filter(n => !atvAbertas(n).length);
  const d90 = addDias(hoje(), -90), fech = neg.filter(n => n.fechado_em && n.fechado_em.slice(0, 10) >= d90);
  const ganhos = fech.filter(n => n.etapa === 'ganho'), perdidos = fech.filter(n => n.etapa === 'perdido');
  const ciclo = ganhos.length ? soma(ganhos.map(n => (new Date(n.fechado_em) - new Date(n.criado_em)) / 864e5)) / ganhos.length : null;
  const cab = topo('Funil de vendas', 'Negócios do orçamento ao fechamento. Os orçamentos do Tiny entram sozinhos; todo negócio aberto precisa de uma próxima atividade.',
      `<button class="btn" data-a="crmAtualizar">↻ Atualizar</button><button class="btn pri" data-a="crmNovo">+ Novo negócio</button>`)
    + `<div class="filtros"><div class="chips">${[['funil', '🎯 Funil'], ['lista', '📋 Lista'], ['indicadores', '📊 Indicadores']].map(([k, n]) => `<button class="chip ${UI.crmAba === k ? 'on' : ''}" data-a="crmAba" data-v="${k}">${n}</button>`).join('')}</div>
      ${vends.length > 1 ? `<select data-c="ui" data-k="crmVend"><option value="">Todos os vendedores</option>${vends.map(v => `<option value="${v.id}" ${fV === v.id ? 'selected' : ''}>${esc(v.nome)}</option>`).join('')}</select>` : ''}</div>
    <div class="grid g4">
      <div class="card kpi-card destaque"><div class="rot">No funil</div><div class="val verde">${R0(soma(abertos.map(n => +n.valor)))}</div><div class="sub">${abertos.length} negócio(s) aberto(s)</div></div>
      <div class="card kpi-card"><div class="rot">Previsão ponderada</div><div class="val">${R0(soma(abertos.map(n => +n.valor * PROB[n.etapa])))}</div><div class="sub">valor × chance de cada etapa</div></div>
      <div class="card kpi-card"><div class="rot">Conversão (90 dias)</div><div class="val">${ganhos.length + perdidos.length ? P(ganhos.length / (ganhos.length + perdidos.length)) : '—'}</div><div class="sub">${ganhos.length} ganho(s) · ${perdidos.length} perdido(s)${ciclo != null ? ` · ciclo ${Math.round(ciclo)} dia(s)` : ''}</div></div>
      <div class="card kpi-card"><div class="rot">Sem próxima atividade</div><div class="val ${semAtv.length ? 'c-ruim' : 'c-ok'}">${semAtv.length}</div><div class="sub">negócio parado é negócio perdido</div></div></div>`;
  if (UI.crmAba === 'indicadores') return cab + abaIndicadoresCRM(neg, fech);
  if (UI.crmAba === 'lista') return cab + `<div class="card mt">${listaCurta('crmLista', `<table class="tabela"><thead><tr><th>Negócio</th><th>Etapa</th><th>Vendedor</th><th>Próxima atividade</th><th class="dir">Valor</th></tr></thead><tbody>
      ${neg.map(n => { const a = atvAbertas(n)[0]; return `<tr class="clic" data-a="crmAbrir" data-id="${n.id}"><td><b>${esc(n.cliente_nome || '')}</b><br><small>${esc(n.titulo)}</small></td><td><span class="tag etp-${n.etapa}">${NOME_ETAPA[n.etapa]}</span></td>
        <td><small>${esc(nomeP(n.pessoa_id))}</small></td><td>${a ? `<small class="${a.quando < hoje() ? 'c-ruim' : ''}">${fmtCurta(a.quando)} · ${esc(a.titulo)}</small>` : ['ganho', 'perdido'].includes(n.etapa) ? '' : '<small class="c-ruim">⚠ nenhuma</small>'}</td><td class="dir num">${R0(n.valor)}</td></tr>`; }).join('')}
    </tbody></table>`, 'Buscar cliente, orçamento, produto…', true)}</div>`;
  // kanban: arraste o card para mudar de etapa (no celular, use o seletor dentro do negócio)
  const col = ([k, nome]) => { const l = neg.filter(n => n.etapa === k).sort((a, b) => b.valor - a.valor);
    const mostrar = ['ganho', 'perdido'].includes(k) ? l.filter(n => n.fechado_em && n.fechado_em.slice(0, 10) >= addDias(hoje(), -30)) : l;
    return `<div class="kcol etp-${k}" data-etapa="${k}"><div class="kcol-cab"><b>${nome}</b><span>${mostrar.length} · ${R0(soma(mostrar.map(n => +n.valor)))}</span></div>
      <div class="kcol-lista">${mostrar.slice(0, 80).map(cardNegocio).join('') || '<div class="kvazio">—</div>'}</div></div>`; };
  return cab + `<div class="kanban-crm mt">${ETAPAS_CRM.map(col).join('')}</div><p class="mut" style="font-size:12.5px">Arraste os cards entre as colunas. Ganho e Perdido mostram os últimos 30 dias.</p>`;
}
function cardNegocio(n) {
  const a = atvAbertas(n)[0], fechado = ['ganho', 'perdido'].includes(n.etapa);
  const alerta = !fechado && (!a ? 'sem' : a.quando < hoje() ? 'atrasada' : '');
  return `<div class="kcard ${alerta}" draggable="true" data-negocio="${n.id}" data-a="crmAbrir" data-id="${n.id}">
    <div class="kcard-nome">${esc(n.cliente_nome || '')}</div><div class="kcard-tit">${esc(n.titulo)}</div>${alertasNegocio(n)}
    <div class="kcard-pe"><b>${R0(n.valor)}</b><span>${esc((nomeP(n.pessoa_id) || '').split(' ')[0])}</span></div>
    ${fechado ? '' : `<div class="kcard-atv">${a ? `${TIPOS_ATV[a.tipo]?.split(' ')[0] || '•'} ${fmtCurta(a.quando)} · ${esc(a.titulo.slice(0, 40))}` : '⚠ sem próxima atividade'}</div>`}</div>`;
}
function abaIndicadoresCRM(neg, fech) {
  const vends = vendCRM();
  const linhaV = v => { const f = fech.filter(n => n.pessoa_id === v.id), g = f.filter(n => n.etapa === 'ganho'), ab = neg.filter(n => n.pessoa_id === v.id && !['ganho', 'perdido'].includes(n.etapa));
    const atv = (CRM.atv || []).filter(a => a.pessoa_id === v.id), feitas = atv.filter(a => a.feito && a.feito_em?.slice(0, 10) >= addDias(hoje(), -30)), atras = atv.filter(a => atvPendente(a) && a.quando < hoje());
    return `<tr><td><b>${esc(v.nome)}</b></td><td class="dir">${ab.length} · ${R0(soma(ab.map(n => +n.valor)))}</td><td class="dir">${g.length} · ${R0(soma(g.map(n => +n.valor)))}</td><td class="dir">${f.length ? P(g.length / f.length) : '—'}</td><td class="dir">${feitas.length}</td><td class="dir ${atras.length ? 'c-ruim' : ''}">${atras.length}</td></tr>`; };
  const motivos = Object.entries(fech.filter(n => n.etapa === 'perdido').reduce((a, n) => { const m = n.motivo_perda || 'Sem motivo'; a[m] = (a[m] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const origens = Object.entries(neg.reduce((a, n) => { (a[n.origem] ||= { n: 0, g: 0, v: 0 }); a[n.origem].n++; if (n.etapa === 'ganho') { a[n.origem].g++; a[n.origem].v += +n.valor; } return a; }, {})).sort((a, b) => b[1].v - a[1].v);
  const maxM = Math.max(1, ...motivos.map(m => m[1]));
  return `<div class="card mt"><div class="secao-titulo"><h2>Por vendedor</h2><small>fechados nos últimos 90 dias · atividades dos últimos 30</small></div><div class="rolagem"><table class="tabela"><thead><tr><th>Vendedor</th><th class="dir">Em aberto</th><th class="dir">Ganhos</th><th class="dir">Conversão</th><th class="dir">Atividades feitas</th><th class="dir">Atrasadas</th></tr></thead><tbody>${vends.map(linhaV).join('')}</tbody></table></div></div>
    <div class="grid g2 mt"><div class="card"><h2>Motivos de perda</h2>${motivos.map(([m, q]) => `<div class="barra-rot"><span>${esc(m)}</span><b>${q}</b></div>${barra(q / maxM, 'ruim')}`).join('') || '<div class="vazio">Nenhum negócio perdido no período.</div>'}</div>
      <div class="card"><h2>Origem dos negócios</h2><table class="tabela"><tbody>${origens.map(([o, x]) => `<tr><td>${ORIGENS[o] || o}</td><td class="dir">${x.n} negócio(s)</td><td class="dir">${x.g} ganho(s)</td><td class="dir num">${R0(x.v)}</td></tr>`).join('') || '<tr><td class="mut">—</td></tr>'}</tbody></table></div></div>`;
}

// arrastar e soltar entre colunas
document.addEventListener('dragstart', e => { const c = e.target.closest?.('[data-negocio]'); if (c) { e.dataTransfer.setData('text/plain', c.dataset.negocio); c.classList.add('arrastando'); } });
document.addEventListener('dragend', e => e.target.closest?.('[data-negocio]')?.classList.remove('arrastando'));
document.addEventListener('dragover', e => { const col = e.target.closest?.('.kcol'); if (col) { e.preventDefault(); document.querySelectorAll('.kcol.sobre').forEach(x => x !== col && x.classList.remove('sobre')); col.classList.add('sobre'); } });
document.addEventListener('drop', e => { const col = e.target.closest?.('.kcol'); if (!col) return; e.preventDefault(); col.classList.remove('sobre');
  const id = e.dataTransfer.getData('text/plain'); if (id) crmMover(id, col.dataset.etapa).catch(err => avisar(err.message)); });

async function crmMover(id, etapa) {
  const n = CRM.neg.find(x => String(x.id) === String(id)); if (!n || n.etapa === etapa) return;
  let motivo = null;
  if (etapa === 'perdido') { motivo = prompt(`Por que perdeu?\n${MOTIVOS_PERDA.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\nDigite o número ou escreva o motivo:`); if (motivo === null) return; motivo = MOTIVOS_PERDA[+motivo - 1] || motivo || 'Outro'; }
  Object.assign(n, await ok(sb.from('negocios').update({ etapa, ...(motivo ? { motivo_perda: motivo } : {}) }).eq('id', n.id).select().single()));
  await carregarCRM(true);
  if (etapa === 'ganho') avisar('🎉 Negócio ganho!');
  if (!['ganho', 'perdido'].includes(etapa) && !atvAbertas(n).length) avisar('Defina a próxima atividade deste negócio.');
  render();
}

// ─── formulários ───
function formNegocio(id, chave, nome) {
  const n = id ? CRM.neg.find(x => String(x.id) === String(id)) : {};
  if (!D.clientes) carregarClientes().catch(() => {});
  const vends = vendCRM();
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>${id ? 'Editar negócio' : 'Novo negócio'}</h2>
    <div class="form-grid">
      <label class="campo inteiro">Cliente *<input type="text" id="ngCli" list="ngListaCli" value="${esc(n.cliente_nome || nome || '')}" ${n.cliente_chave || chave ? `data-chave="${esc(n.cliente_chave || chave)}"` : ''} placeholder="Nome do cliente (novo ou da carteira)"></label>
      <label class="campo inteiro">O que é o negócio *<input type="text" id="ngTit" value="${esc(n.titulo || '')}" placeholder="Ex.: CFTV 8 câmeras para o galpão"></label>
      <label class="campo">Valor estimado (R$)<input type="number" step="0.01" id="ngValor" value="${n.valor ?? ''}"></label>
      <label class="campo">Etapa<select id="ngEtapa">${ETAPAS_CRM.map(([k, nm]) => `<option value="${k}" ${(n.etapa || 'novo') === k ? 'selected' : ''}>${nm}</option>`).join('')}</select></label>
      <label class="campo">Origem<select id="ngOrigem">${Object.entries(ORIGENS).map(([k, nm]) => `<option value="${k}" ${(n.origem || 'balcao') === k ? 'selected' : ''}>${nm}</option>`).join('')}</select></label>
      <label class="campo">Vendedor<select id="ngVend">${vends.map(v => `<option value="${v.id}" ${(n.pessoa_id || (vends.some(x => x.id === EU.id) ? EU.id : '')) === v.id ? 'selected' : ''}>${esc(v.nome)}</option>`).join('')}</select></label>
      <label class="campo">Previsão de fechamento<input type="date" id="ngPrev" value="${n.previsao || ''}"></label>
      <label class="campo inteiro">Observações<textarea id="ngObs" rows="2">${esc(n.obs || '')}</textarea></label>
      ${id ? '' : `<label class="campo inteiro">Próxima atividade *<span style="display:flex;gap:6px;flex-wrap:wrap"><select id="ngAtvTipo">${Object.entries(TIPOS_ATV).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><input type="date" id="ngAtvData" value="${addDias(hoje(), 1)}"><input type="text" id="ngAtvTit" placeholder="Ex.: ligar para apresentar a proposta" style="flex:1;min-width:180px"></span></label>`}
    </div>
    <datalist id="ngListaCli">${(D.clientes || []).slice(0, 4000).map(c => `<option value="${esc(c.nome)}">`).join('')}</datalist>
    <div class="mt"><button class="btn pri" data-a="crmSalvar" data-id="${id || ''}">Salvar</button></div>`);
}
async function crmSalvar(id) {
  const el = $('#ngCli'), nome = el.value.trim(), titulo = $('#ngTit').value.trim();
  if (!nome || !titulo) return avisar('Preencha o cliente e o que é o negócio.');
  const c = (D.clientes || []).find(x => x.nome === nome);
  const dados = { cliente_nome: nome, cliente_chave: el.dataset.chave || c?.chave || 'n:' + semAcento(nome).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), titulo,
    valor: Number($('#ngValor').value) || 0, etapa: $('#ngEtapa').value, origem: $('#ngOrigem').value, pessoa_id: $('#ngVend').value || EU.id, previsao: $('#ngPrev').value || null, obs: $('#ngObs').value.trim() || null };
  if (id) { const n = CRM.neg.find(x => String(x.id) === String(id)); Object.assign(n, await ok(sb.from('negocios').update(dados).eq('id', id).select().single())); fecharModal(); return crmAbrir(id); }
  const atvTit = $('#ngAtvTit').value.trim();
  if (!atvTit && !['ganho', 'perdido'].includes(dados.etapa)) return avisar('Defina a próxima atividade (todo negócio aberto precisa de uma).');
  const novo = await ok(sb.from('negocios').insert({ ...dados, criado_por: EU.id }).select().single());
  CRM.neg.unshift(novo);
  if (atvTit) CRM.atv.push(await ok(sb.from('atividades').insert({ negocio_id: novo.id, cliente_chave: novo.cliente_chave, cliente_nome: nome, pessoa_id: novo.pessoa_id, tipo: $('#ngAtvTipo').value, titulo: atvTit, quando: $('#ngAtvData').value || hoje(), criado_por: EU.id }).select().single()));
  fecharModal(); avisar('Negócio criado.'); render();
}
function crmAbrir(id) {
  const n = CRM.neg.find(x => String(x.id) === String(id)); if (!n) return;
  const atvs = (CRM.atv || []).filter(a => a.negocio_id === n.id).sort((a, b) => (a.feito - b.feito) || a.quando.localeCompare(b.quando));
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button>
    <small class="mut">${ORIGENS[n.origem] || ''}${n.orcamento_numero ? ` · orçamento ${esc(n.orcamento_numero)} no Tiny (${esc(n.orcamento_situacao || '')})` : ''} · criado ${new Date(n.criado_em).toLocaleDateString('pt-BR')}</small>
    <h2 style="margin:4px 0">${esc(n.cliente_nome || '')}</h2><p style="margin:0 0 10px">${esc(n.titulo)}</p>
    <div class="grid g3" style="gap:10px"><div class="card kpi-card"><div class="rot">Valor</div><div class="val" style="font-size:22px">${R(n.valor)}</div></div>
      <div class="card kpi-card"><div class="rot">Vendedor</div><div class="val" style="font-size:18px">${esc(nomeP(n.pessoa_id))}</div></div>
      <div class="card kpi-card"><div class="rot">Etapa</div><select data-c="crmEtapa" data-id="${n.id}" style="margin-top:6px;width:100%">${ETAPAS_CRM.map(([k, nm]) => `<option value="${k}" ${n.etapa === k ? 'selected' : ''}>${nm}</option>`).join('')}</select></div></div>
    ${n.etapa === 'perdido' && n.motivo_perda ? `<div class="alerta ruim mt"><span class="ic">✕</span><span>Perdido: ${esc(n.motivo_perda)}</span></div>` : ''}
    ${alertasNegocio(n)}${revisaoCRM(n).inativo ? '<p class="explica">Negociação sem movimento há mais de 15 dias. Registre uma tentativa de recuperação e agende o retorno. A inatividade não encerra o negócio.</p>' : ''}
    ${revisaoCRM(n).pedidos_conferir ? `<p class="explica">Pedido(s) posterior(es): ${esc(revisaoCRM(n).pedidos_conferir)}. Confira itens, quantidades e vínculo com esta negociação antes de marcar como ganho. Uma compra do mesmo cliente não confirma o fechamento.</p>` : ''}
    ${revisaoCRM(n).proposta_semelhante ? '<p class="explica">Há outra proposta com produtos em comum. Confira se é revisão, complemento ou outro projeto antes de encerrar alguma delas.</p>' : ''}
    ${n.obs ? `<p class="mt" style="white-space:pre-wrap;font-size:13.5px">${esc(n.obs)}</p>` : ''}
    <h3 class="mt2">Atividades</h3>
    ${atvs.map(a => `<div class="atv ${a.feito || a.arquivada_em ? 'feita' : a.quando < hoje() ? 'atrasada' : ''}">${a.arquivada_em ? '<span title="Arquivada">↷</span>' : `<button class="atv-check" data-a="atvFeita" data-id="${a.id}" title="${a.feito ? 'Reabrir' : 'Marcar como feita'}">${a.feito ? '✓' : ''}</button>`}
      <div><b>${TIPOS_ATV[a.tipo] || a.tipo}</b> · ${esc(a.titulo)}<br><small>${fmtCurta(a.quando)}${a.arquivada_em ? ' · arquivada: ' + esc(a.arquivada_motivo) : a.feito ? ` · feita ${new Date(a.feito_em).toLocaleDateString('pt-BR')}` : a.quando < hoje() ? ' · atrasada' : ''}${a.resultado ? ' · ' + esc(a.resultado) : ''}</small></div></div>`).join('') || '<p class="mut">Nenhuma atividade.</p>'}
    <div class="nova-atv"><select id="atvTipo">${Object.entries(TIPOS_ATV).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><input type="date" id="atvData" value="${addDias(hoje(), 1)}"><input type="text" id="atvTit" placeholder="Próxima atividade…"><button class="btn pri peq" data-a="atvNova" data-negocio="${n.id}">+ Agendar</button></div>
    <div class="acoes mt">${foneNegocio(n) ? `<a class="btn peq pri" href="${linkWa(foneNegocio(n))}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}${n.cliente_chave ? `<button class="btn peq" data-a="verCliente" data-chave="${esc(n.cliente_chave)}">👤 Ficha do cliente</button>` : ''}<button class="btn peq" data-a="crmEditar" data-id="${n.id}">✎ Editar</button>
      ${!['ganho', 'perdido'].includes(n.etapa) ? `<button class="btn peq pri" data-a="crmMover" data-id="${n.id}" data-v="ganho">🎉 Ganho</button><button class="btn peq perigo" data-a="crmMover" data-id="${n.id}" data-v="perdido">✕ Perdido</button>` : ''}</div>`, true);
}
async function atvNova(negocioId, extra = {}) {
  const tit = $('#atvTit')?.value.trim(); if (!tit) return avisar('Escreva a atividade.');
  const n = negocioId ? CRM.neg.find(x => String(x.id) === String(negocioId)) : null;
  CRM.atv.push(await ok(sb.from('atividades').insert({ negocio_id: n?.id || null, cliente_chave: n?.cliente_chave || extra.chave || null, cliente_nome: n?.cliente_nome || extra.nome || null,
    pessoa_id: n?.pessoa_id || EU.id, tipo: $('#atvTipo').value, titulo: tit, quando: $('#atvData').value || hoje(), criado_por: EU.id }).select().single()));
  avisar('Atividade agendada.');
  if (n) { movimentoCRM(n.id); crmAbrir(n.id); } else fecharModal();
  render();
}
async function atvFeita(id) {
  const a = CRM.atv.find(x => String(x.id) === String(id)); if (!a) return;
  if (a.arquivada_em) return;
  if (a.feito) {
    Object.assign(a, await ok(sb.from('atividades').update({ feito: false, feito_em: null }).eq('id', a.id).select().single()));
    if (a.negocio_id) crmAbrir(a.negocio_id); render(); return;
  }
  const n = CRM.neg.find(n => n.id === a.negocio_id), aberto = n && !['ganho','perdido'].includes(n.etapa);
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Concluir atividade</h2><p>${esc(a.titulo)}</p>
    <label class="campo">Resultado / observação<textarea id="acResultado" rows="3" placeholder="O que aconteceu no contato?"></textarea></label>
    ${aberto ? `<h3>Próximo passo</h3><p class="mut">Agende o retorno aqui ou marque para revisar depois. Abrir uma conversa não confirma envio.</p>
      <div class="form-grid"><label class="campo">Data<input type="date" id="acData" min="${hoje()}" value="${addDias(hoje(),1)}"></label>
      <label class="campo">Tipo<select id="acTipo">${Object.entries(TIPOS_ATV).map(([k,v]) => `<option value="${k}" ${k==='followup'?'selected':''}>${v}</option>`).join('')}</select></label>
      <label class="campo inteiro">O que fazer<input id="acTitulo" placeholder="Ex.: conferir orçamento com o cliente"></label></div>` : ''}
    <div class="acoes mt">${aberto ? `<button class="btn pri" data-a="atvConcluir" data-id="${a.id}" data-proxima="sim">Concluir e agendar retorno</button>` : ''}
    <button class="btn ${aberto ? '' : 'pri'}" data-a="atvConcluir" data-id="${a.id}">${aberto ? 'Concluir sem novo retorno · revisar' : 'Concluir atividade'}</button></div>`);
}
async function atvConcluir(id, agendar) {
  if (CRM.gravando.has(id)) return;
  const data = agendar ? $('#acData').value : null, titulo = agendar ? $('#acTitulo').value.trim() : null;
  if (agendar && (!data || data < hoje() || !titulo)) return avisar('Preencha a data e o próximo passo.');
  CRM.gravando.add(id);
  try {
    const r = await ok(sb.rpc('atividade_concluir', { p_id: Number(id), p_resultado: $('#acResultado').value.trim(), p_proxima_data: data, p_proxima_tipo: agendar ? $('#acTipo').value : 'followup', p_proxima_titulo: titulo }));
    Object.assign(CRM.atv.find(a => String(a.id) === String(id)), r.atividade);
    if (r.proxima && !CRM.atv.some(a => a.id === r.proxima.id)) CRM.atv.push(r.proxima);
    if (r.interacao && !D.interacoes.some(i => i.id === r.interacao.id)) D.interacoes.unshift(r.interacao);
    movimentoCRM(r.atividade.negocio_id);
    fecharModal(); render(); avisar(r.proxima ? 'Atividade, histórico e próximo retorno salvos.' : 'Atividade concluída. Confira os negócios sem próximo passo.');
  } finally { CRM.gravando.delete(id); }
}
async function atvRevisada(id, manter) {
  const a = CRM.atv.find(x => String(x.id) === String(id)); if (!a) return;
  Object.assign(a, await ok(sb.from('atividades').update(manter ? { revisada_em: new Date().toISOString() } : { arquivada_em: new Date().toISOString(), arquivada_motivo: 'Revisada: sem finalidade após encerramento' }).eq('id', a.id).select().single()));
  render();
}

// ─── Meu dia ───
/** Meu dia de quem não é do comercial (estoque, suporte…): solicitações, expedição e ocorrências do dia. */
function vMeuDiaOp() {
  const h = hoje(), paraMim = minhasPendentes(), pedi = D.solicitacoes.filter(s => s.solicitante_id === EU.id && ABERTAS.includes(s.status));
  if (veExp() && !EXP && !EXP_ATUALIZANDO.v) { EXP_ATUALIZANDO.v = true; carregarExp(true).catch(() => {}).finally(() => { EXP_ATUALIZANDO.v = false; render(); }); }
  const xs = EXP ? EXP.ecom.map(infoPedido).filter(x => !x.despachado) : [];
  const separar = xs.filter(x => x.etapa === 'a_separar'), atrasados = xs.filter(x => x.atrasado), aguard = xs.filter(x => x.pagPendente);
  const ocs = EXP ? EXP.ocs.filter(o => !o.resolvido) : [];
  const kpi = (rot, val, sub, cor, v) => `<div class="card kpi-card ${v ? 'clic' : ''}" ${v ? `style="cursor:pointer" data-a="nav" data-v="${v}"` : ''}><div class="rot">${rot}</div><div class="val ${cor || ''}">${val}</div><div class="sub">${sub}</div></div>`;
  const linhaSol = s => `<tr class="clic" data-a="verSolicitacao" data-id="${s.id}"><td>${(TIPOS_SOL[s.tipo] || TIPOS_SOL.outro).ic} <b>${esc(s.titulo)}</b><br><small>de ${esc(nomeP(s.solicitante_id))}${s.prazo ? ` · prazo ${fmtCurta(s.prazo)}` : ''}</small></td><td><span class="st st-${s.status}">${STATUS_SOL[s.status]}</span></td></tr>`;
  return topo('Meu dia', `${fmtData(h)} · o que precisa ser feito hoje`, '<button class="btn pri" data-a="novaSolicitacao">+ Nova solicitação</button>')
    + avisoAssistencia() + `<div class="grid g4">${veExp() ? kpi('A separar', EXP ? separar.length : '…', `${separar.filter(x => x.loja).length} no balcão`, separar.length ? 'c-med' : '', 'expedicao')
      + kpi('Atrasados', EXP ? atrasados.length : '…', 'pedidos fora do prazo', atrasados.length ? 'c-ruim' : 'c-ok', 'expedicao')
      + kpi('Ocorrências abertas', EXP ? ocs.length : '…', `${aguard.length} aguardando pagamento`, ocs.length ? 'c-ruim' : '', 'expedicao') : ''}
      ${kpi('Solicitações para mim', paraMim.length, `${pedi.length} que eu pedi em aberto`, paraMim.length ? 'c-med' : '', 'solicitacoes')}</div>
    <div class="grid g2 mt"><div class="card"><div class="secao-titulo"><h2>Para mim resolver</h2><a href="#/solicitacoes">ver todas</a></div>${paraMim.length ? `<table class="tabela"><tbody>${paraMim.slice(0, 10).map(linhaSol).join('')}</tbody></table>` : '<div class="vazio">Nada pendente para você. 🎉</div>'}</div>
      ${veExp() ? `<div class="card"><div class="secao-titulo"><h2>Próximos a separar</h2><a href="#/expedicao">expedição</a></div>${separar.length ? `<table class="tabela"><tbody>${separar.slice(0, 10).map(x => `<tr><td><b>${esc(x.p.numero || '')}</b> · ${esc(x.p.cliente_nome || '')}<br><small>${esc(nomeCanal(x.canal))}${x.prazo ? ' · até ' + dataHora(x.prazo) : ''}</small></td><td>${x.atrasado ? '<span class="tag ruim">atrasado</span>' : ''}</td></tr>`).join('')}</tbody></table>` : `<div class="vazio">${EXP ? 'Nada para separar agora. 👏' : 'Carregando…'}</div>`}</div>` : ''}</div>`;
}

/** Fila única do dia: atividades, retornos combinados e negócios parados, um cartão por cliente, em ordem de prioridade.
 *  Prioridade: 1 atrasado (o cliente já esperou) · 2 combinado para hoje · 3 negócio sem próximo passo ou parado. */
function filaDoDia(quem) {
  const h = hoje(), cartoes = new Map(), dias = d => Math.max(0, Math.round((pd(h) - pd(d)) / 864e5));
  const negDe = id => (CRM.neg || []).find(n => n.id === id);
  const cartao = (chave, nome) => { if (!cartoes.has(chave)) cartoes.set(chave, { chave, nome, prio: 9, desde: h, valor: 0, motivos: [], linhas: [] }); return cartoes.get(chave); };
  const juntar = (k, prio, desde, motivo, linha, valor) => {
    k.prio = Math.min(k.prio, prio); if (desde < k.desde) k.desde = desde; k.valor = Math.max(k.valor, +valor || 0);
    if (!k.motivos.includes(motivo)) k.motivos.push(motivo); k.linhas.push(linha);
  };
  for (const a of (CRM.atv || []).filter(a => a.pessoa_id === quem && atvPendente(a) && a.quando <= h)) {
    const n = a.negocio_id ? negDe(a.negocio_id) : null;
    const k = cartao(a.cliente_chave || n?.cliente_chave || (a.negocio_id ? 'n' + a.negocio_id : 'a' + a.id), a.cliente_nome || n?.cliente_nome || a.titulo);
    juntar(k, a.quando < h ? 1 : 2, a.quando, a.quando < h ? `Atrasada há ${dias(a.quando)} dia(s)` : 'Agendada para hoje', { tipo: 'atv', a, n }, n?.valor);
  }
  for (const i of followupsHoje(quem)) {
    const k = cartao(i.cliente_chave || 'i' + i.id, i.cliente_nome || '');
    juntar(k, i.proximo_contato < h ? 1 : 2, i.proximo_contato, i.proximo_contato < h ? `Retorno combinado vencido há ${dias(i.proximo_contato)} dia(s)` : 'Retorno combinado para hoje', { tipo: 'fup', i });
  }
  for (const n of (CRM.neg || []).filter(n => n.pessoa_id === quem && !['ganho', 'perdido'].includes(n.etapa))) {
    const r = revisaoCRM(n), sem = !atvAbertas(n).length;
    if (!sem && !r.inativo && !r.pedidos_conferir && !r.proposta_semelhante) continue;
    const k = cartao(n.cliente_chave || 'n' + n.id, n.cliente_nome || n.titulo);
    const motivo = sem ? `Negócio de ${R0(n.valor)} sem próximo passo` : r.inativo ? 'Negociação parada há mais de 15 dias' : r.pedidos_conferir ? 'Compra posterior para conferir' : 'Proposta parecida para revisar';
    juntar(k, 3, (n.mov_em || n.atualizado_em || h).slice(0, 10), motivo, { tipo: 'neg', n }, n.valor);
  }
  return [...cartoes.values()].sort((a, b) => a.prio - b.prio || a.desde.localeCompare(b.desde) || b.valor - a.valor);
}
function cartaoFila(k) {
  const h = hoje(), cor = k.prio === 1 ? 'ruim' : k.prio === 2 ? 'azul' : 'med';
  const linha = l => l.tipo === 'atv' ? `<div class="atv ${l.a.quando < h ? 'atrasada' : ''}"><button class="atv-check" data-a="atvFeita" data-id="${l.a.id}" title="Concluir e registrar o resultado"></button>
      <div style="flex:1"><b>${TIPOS_ATV[l.a.tipo] || l.a.tipo}</b> · ${esc(l.a.titulo)}<br><small>${fmtCurta(l.a.quando)}${l.a.automatica ? ' · automática' : ''}</small></div>
      <button class="btn peq" data-a="atvContato" data-id="${l.a.id}" title="Contato do cliente: celular e e-mail">+</button>${l.a.negocio_id ? `<button class="btn peq" data-a="crmAbrir" data-id="${l.a.negocio_id}">Negócio</button>` : ''}</div>`
    : l.tipo === 'fup' ? `<div class="atv"><button class="atv-check" data-a="followupFeito" data-id="${l.i.id}" title="Retorno feito"></button><div style="flex:1"><small>${esc(l.i.texto.slice(0, 140))}</small></div></div>`
    : `<div class="atv"><div style="flex:1"><b>🎯 ${esc(l.n.titulo)}</b><br><small>${NOME_ETAPA[l.n.etapa]} · ${R0(l.n.valor)}</small>${alertasNegocio(l.n)}</div><button class="btn peq pri" data-a="crmAbrir" data-id="${l.n.id}">${atvAbertas(l.n).length ? 'Revisar' : 'Agendar'}</button></div>`;
  const cli = k.chave && !/^[nai]\d+$/.test(k.chave) ? k.chave : '';
  return `<div class="card fila-item" style="margin-top:10px;padding:12px 14px">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="flex:1">${cli ? `<a href="#" data-a="verCliente" data-chave="${esc(cli)}">${esc(k.nome || 'Cliente')}</a>` : esc(k.nome || 'Sem cliente')}</b>${k.valor ? `<small class="mut">${R0(k.valor)}</small>` : ''}</div>
    <div>${k.motivos.map(m => `<span class="tag ${cor}">${esc(m)}</span>`).join(' ')}</div>${k.linhas.map(linha).join('')}</div>`;
}
/** Próximos contatos da campanha direto no Meu dia: mensagem, WhatsApp e resultado num clique. */
function blocoProspeccaoDia(quem) {
  if (!pessoa(quem)?.tiny) return '';
  if (!PRO.dados || PRO.chave !== hoje() + quem) {
    if (!PRO.carregando) { UI.proPessoa = quem; carregarProspeccao().then(render).catch(() => {}); }
    return '';
  }
  const cli = Object.fromEntries((D.clientes || []).map(c => [c.chave, c])), vend = pessoa(quem)?.nome?.split(' ')[0] || '';
  // pausado ou "não contatar" fica só na campanha completa (para registrar "Pular")
  const pend = PRO.dados.filter(x => !x.resultado && !cli[x.cliente_chave]?.nao_contatar && !contatoPausado(cli[x.cliente_chave]));
  if (!pend.length) return '';
  const rapidos = ['respondeu', 'orcamento', 'sem_resposta', 'sem_interesse', 'numero_errado', 'pular'];
  return `<div class="card mt"><div class="secao-titulo"><h2>📞 Prospecção: próximos contatos</h2><small>${pend.length} pendente(s) · <a href="#" data-a="irProspeccao" data-pessoa="${quem}">abrir a campanha</a></small></div>
    ${pend.slice(0, 5).map(x => { const c = cli[x.cliente_chave] || {}, fone = c.fone || '';
      return `<div class="atv" style="flex-wrap:wrap"><div style="flex:1;min-width:200px"><b>${esc(x.cliente_nome || c.nome || '')}</b> <span class="tag">${(LISTAS_PRO[x.lista] || [x.lista])[0]}</span>${seloContato(c)}<br><small>${esc(x.motivo || '')}</small></div>
        <textarea class="pro-msg" id="proMsg_${x.id}" data-fid="proMsg_${x.id}" data-pro-rascunho="${x.id}" rows="3" style="width:100%">${esc(PRO.rascunhos[x.id] ?? mensagemPro(x, vend))}</textarea>
        ${linkWa(fone) ? `<a class="btn pri peq" href="#" data-a="proWa" data-id="${x.id}" data-fone="${esc(fone)}">💬 WhatsApp</a>` : '<small class="c-med">sem telefone</small>'}
        <div class="pro-res" style="width:100%">${rapidos.map(k => `<button class="chip" data-a="proRes" data-id="${x.id}" data-v="${k}">${RES_PRO[k]}</button>`).join('')}</div></div>`; }).join('')}</div>`;
}

function vMeuDia() {
  if (!EU.tiny && !ehDono() && !EU.permissoes?.vendas_todas) return vMeuDiaOp();
  if (!CRM.neg) { if (!CRM.carregando) carregarCRM().then(render).catch(e => avisar(e.message)); return topo('Meu dia', '') + '<div class="card vazio">Carregando…</div>'; }
  const vends = vendCRM();
  if (!UI.diaPessoa || !(vends.some(v => v.id === UI.diaPessoa) || UI.diaPessoa === EU.id)) UI.diaPessoa = EU.id;
  const quem = UI.diaPessoa, h = hoje();
  const atvs = (CRM.atv || []).filter(a => a.pessoa_id === quem && atvPendente(a));
  const revisar = (CRM.atv || []).filter(a => a.pessoa_id === quem && atvRevisar(a));
  const arquivadas = (CRM.atv || []).filter(a => a.pessoa_id === quem && a.arquivada_em);
  const fila = filaDoDia(quem);
  // telefones e regras de contato vêm da carteira; carrega uma vez só
  if (!D.clientes && !vMeuDia.carregandoCli) vMeuDia.carregandoCli = carregarClientes().then(render).catch(() => {}).finally(() => { vMeuDia.carregandoCli = null; });
  const atrasadas = atvs.filter(a => a.quando < h), deHoje = atvs.filter(a => a.quando === h), proximas = atvs.filter(a => a.quando > h && a.quando <= addDias(h, 7));
  const fups = followupsHoje(quem);
  const semAtv = CRM.neg.filter(n => n.pessoa_id === quem && !['ganho', 'perdido'].includes(n.etapa) && !atvAbertas(n).length);
  const feitasHoje = (CRM.atv || []).filter(a => a.pessoa_id === quem && a.feito && (a.feito_em || '').slice(0, 10) === h).length;
  const pro = campanhaHoje(quem);
  const linhaA = a => `<div class="atv ${a.quando < h ? 'atrasada' : ''}"><button class="atv-check" data-a="atvFeita" data-id="${a.id}" title="Marcar como feita"></button>
    <div style="flex:1"><b>${TIPOS_ATV[a.tipo] || a.tipo}</b> · ${esc(a.titulo)}<br><small>${a.cliente_nome ? esc(a.cliente_nome) + ' · ' : ''}${fmtCurta(a.quando)}${a.quando < h ? ' · atrasada' : ''}${a.automatica ? ' · automática' : ''}</small></div>
    ${a.negocio_id || a.cliente_chave || a.cliente_nome ? `<button class="btn peq" data-a="atvContato" data-id="${a.id}" title="Contato do cliente: celular e e-mail">+</button>` : ''}
    ${a.negocio_id ? `<button class="btn peq" data-a="crmAbrir" data-id="${a.negocio_id}">Negócio</button>` : a.cliente_chave ? `<button class="btn peq" data-a="verCliente" data-chave="${esc(a.cliente_chave)}">Cliente</button>` : ''}</div>`;
  return topo('Meu dia', `${fmtData(h)} · tudo o que precisa ser feito hoje, num lugar só`, `<button class="btn" data-a="crmAtualizar">↻ Atualizar</button><button class="btn pri" data-a="crmNovo">+ Novo negócio</button>`)
    + avisoBoletos() + avisoAssistencia() + `${vends.length > 1 || ehDono() ? `<div class="chips" style="margin-bottom:12px">${[...new Map([[EU.id, EU], ...vends.map(v => [v.id, v])]).values()].map(v => `<button class="chip ${quem === v.id ? 'on' : ''}" data-a="diaPessoa" data-v="${v.id}">${esc(v.nome)}</button>`).join('')}</div>` : ''}
    <div class="grid g4">
      <div class="card kpi-card ${atrasadas.length ? '' : 'destaque'}"><div class="rot">Atrasadas</div><div class="val ${atrasadas.length ? 'c-ruim' : 'verde'}">${atrasadas.length}</div><div class="sub">atividades vencidas</div></div>
      <div class="card kpi-card"><div class="rot">Para hoje</div><div class="val">${deHoje.length + fups.length}</div><div class="sub">${feitasHoje} feita(s) hoje</div></div>
      <div class="card kpi-card clic" data-a="irProspeccao" data-pessoa="${quem}"><div class="rot">Prospecção de hoje</div><div class="val">${pro ? `${pro.contatos}/${pro.total}` : PRO.resumoErro ? 'Indisponível' : '…'}</div><div class="sub">contatos da campanha${pro ? ` · ${pro.pulados} pulado(s) · ${pro.pendentes} pendente(s)` : ''}</div></div>
      <div class="card kpi-card"><div class="rot">Negócios sem atividade</div><div class="val ${semAtv.length ? 'c-med' : 'c-ok'}">${semAtv.length}</div><div class="sub">defina o próximo passo</div></div></div>
    <div class="card mt"><div class="secao-titulo"><h2>✅ Fila de hoje</h2><small>${fila.length} cliente(s) · um cartão por cliente, do mais urgente para o menos</small></div>
      <p class="explica" style="margin:0">Primeiro o que está atrasado, depois o combinado para hoje e, por último, negócios sem próximo passo ou parados.</p>
      ${fila.map(cartaoFila).join('') || '<div class="vazio">Nada pendente para hoje. 👏</div>'}</div>
    ${blocoProspeccaoDia(quem)}${blocoTelefones(quem, 5)}
    <div class="card mt"><h3 style="margin-top:0">📅 Próximos 7 dias</h3>${proximas.map(linhaA).join('') || '<p class="mut">Nada agendado.</p>'}</div>
    ${revisar.length ? `<div class="card mt"><h2>Follow-ups de negócios encerrados: revisar</h2><p class="mut">Confirme se ainda há uma ação válida. Pós-vendas continuam na rotina.</p>${revisar.map(a => `<div class="atv"><div style="flex:1"><b>${esc(a.cliente_nome || '')}</b><br>${esc(a.titulo)}</div><button class="btn peq" data-a="atvRevisada" data-id="${a.id}" data-manter="sim">Manter atividade</button><button class="btn peq" data-a="atvRevisada" data-id="${a.id}">Arquivar</button></div>`).join('')}</div>` : ''}
    ${arquivadas.length ? `<details class="card mt"><summary>Atividades arquivadas (${arquivadas.length})</summary>${arquivadas.map(a => `<div class="atv"><div><b>${esc(a.cliente_nome || '')}</b> · ${esc(a.titulo)}<br><small>${esc(a.arquivada_motivo || '')} · ${fmtCurta(a.arquivada_em.slice(0,10))}</small></div>${a.negocio_id ? `<button class="btn peq" data-a="crmAbrir" data-id="${a.negocio_id}">Histórico</button>` : ''}</div>`).join('')}</details>` : ''}`;
}
