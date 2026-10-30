'use strict';
/* Intranet Protemaxxi — CRM: funil de negócios (estilo Pipedrive), atividades e "Meu dia" do vendedor.
   Orçamentos do Tiny entram sozinhos como negócios (função orcamentos-sync) e acompanham a situação do Tiny. */

const ETAPAS_CRM = [['novo', 'Novo contato', 10], ['qualificado', 'Qualificado', 25], ['orcamento', 'Orçamento enviado', 50], ['negociacao', 'Negociação', 75], ['ganho', 'Ganho', 100], ['perdido', 'Perdido', 0]];
const PROB = Object.fromEntries(ETAPAS_CRM.map(([k, , p]) => [k, p / 100]));
const NOME_ETAPA = Object.fromEntries(ETAPAS_CRM.map(([k, n]) => [k, n]));
const ORIGENS = { balcao: '🏪 Balcão', whatsapp: '💬 WhatsApp', instagram: '📸 Instagram', site: '🌐 Site', indicacao: '🤝 Indicação', tecnico: '🛠 Técnico parceiro', ml: '🛍 Mercado Livre', prospeccao: '📞 Prospecção', trafego: '📣 Tráfego pago', outro: '• Outro' };
const TIPOS_ATV = { ligar: '📞 Ligar', whatsapp: '💬 WhatsApp', visita: '🤝 Visita', orcamento: '📝 Orçamento', followup: '🔁 Follow-up', posvenda: '📦 Pós-venda', tarefa: '☑ Tarefa' };
const MOTIVOS_PERDA = ['Preço', 'Prazo de entrega', 'Sem estoque', 'Comprou no concorrente', 'Desistiu / adiou', 'Sem retorno do cliente', 'Orçamento cancelado no Tiny', 'Outro'];
const CRM = { neg: null, atv: null, revisoes: [], vinc: [], mesmo: [], carregando: false, em: 0, gravando: new Set() };

async function carregarCRM(forcar) {
  if (CRM.carregando || (!forcar && CRM.neg && Date.now() - CRM.em < 60e3)) return;
  CRM.carregando = true;
  try {
    const desde = new Date(Date.now() - 120 * 864e5).toISOString();
    const [neg, atv, revisoes, vinc, mesmo] = await Promise.all([
      todas(() => sb.from('negocios').select('*').or(`etapa.not.in.(ganho,perdido),fechado_em.gte.${desde}`).order('atualizado_em', { ascending: false }).order('id')),
      todas(() => sb.from('atividades').select('*').or(`feito.eq.false,feito_em.gte.${desde}`).order('quando').order('id')),
      todas(() => sb.from('v_crm_revisoes').select('*').order('negocio_id')),
      // pedidos ligados aos negócios (só os vínculos ativos; o histórico de desfeitos fica no banco)
      todas(() => sb.from('negocio_pedidos').select('id,negocio_id,pedido_id,vinculado_por,vinculado_em,pedidos(numero,data,valor,situacao)').is('desfeito_em', null).order('id')),
      todas(() => sb.from('cliente_pares').select('a,b').eq('status', 'mesmo').order('a').order('b')).catch(() => []),
    ]);
    CRM.vinc = vinc; CRM.mesmo = mesmo;
    // Atividades pendentes podem pertencer a negócios encerrados há mais de 120 dias.
    const conhecidos = new Set(neg.map(n => n.id));
    const faltam = [...new Set(atv.filter(a => !a.feito && a.negocio_id && !conhecidos.has(a.negocio_id)).map(a => a.negocio_id))];
    for (let i = 0; i < faltam.length; i += 100) neg.push(...await todas(() => sb.from('negocios').select('*').in('id', faltam.slice(i,i+100)).order('id')));
    // negócio da prospecção já juntado a um orçamento do Tiny: fica só como histórico, fora do funil e das perdas
    CRM.neg = neg.filter(n => !n.juntado_a); CRM.atv = atv; CRM.revisoes = revisoes; CRM.em = Date.now();
  } finally { CRM.carregando = false; }
}
/** Telefone do negócio: o da ficha do cliente ou o que veio escrito no nome do contato do Tiny ("19 98166-4877 ~Fernanda"). */
/** Botão + das tarefas: contato do cliente (celular, telefone, e-mail) com atalhos para WhatsApp, ligar e e-mail. */
async function atvContato(id) {
  const a = (CRM.atv || []).find(x => String(x.id) === String(id));
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>${esc(a?.cliente_nome || 'Contato do cliente')}</h2><p class="mut">Carregando o contato…</p>`);
  const { data: c, error } = await sb.rpc('contato_atividade', { p_atividade: Number(id) });
  if (error || !c) return modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Contato do cliente</h2><div class="alerta med"><span class="ic">!</span><span>${esc(error?.message || 'Não encontrei o contato desta tarefa.')}</span></div>`);
  // contato escrito no próprio nome (ex.: "19 99547-8814 ~Valdecir"): usa como celular, se não foi marcado como errado
  const achado = ((c.nome || '').match(/(\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/) || [''])[0];
  const doNome = achado && !(c.errados || []).includes(foneNorm(achado)) ? achado : '';
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
  if (!m) return '';
  // número tirado do nome também respeita a marca de errado (sem a lista carregada, não arrisca)
  if (!TELF.lista) { if (!TELF.carregando) carregarTelErrados().then(render).catch(() => {}); return ''; }
  const f = foneNorm(m[0]);
  return TELF.lista.some(t => t.cliente_chave === n.cliente_chave && t.telefone === f) ? '' : m[0].replace(/\D/g, '');
}
/** Orçamento do Tiny e negócio da campanha do mesmo cliente (30 dias, ainda separados): sugere juntar; quem decide é o vendedor. */
function paraJuntar(n) {
  if (['ganho', 'perdido'].includes(n.etapa) || !n.cliente_chave) return [];
  const desde = new Date(Date.now() - 30 * 864e5).toISOString();
  const abertos = (CRM.neg || []).filter(m => m.id !== n.id && m.cliente_chave === n.cliente_chave && !['ganho', 'perdido'].includes(m.etapa));
  if (n.orcamento_id && !n.prospeccao_id) return abertos.filter(m => m.prospeccao_id && !m.orcamento_id && (m.criado_em || '') >= desde).map(m => ({ tiny: n, pro: m }));
  if (n.prospeccao_id && !n.orcamento_id && (n.criado_em || '') >= desde) return abertos.filter(m => m.orcamento_id && !m.prospeccao_id).map(m => ({ tiny: m, pro: n }));
  return [];
}
async function crmJuntar(tinyId, proId) {
  const t = CRM.neg.find(x => String(x.id) === String(tinyId)), p = CRM.neg.find(x => String(x.id) === String(proId));
  if (!t || !p) return;
  if (!confirm(`Juntar "${p.titulo}" (campanha) ao orçamento ${t.orcamento_numero || ''} do Tiny?\n\nAs atividades e o vínculo com a campanha passam para o negócio do orçamento. O da campanha fica guardado como "juntado".`)) return;
  const r = await ok(sb.rpc('negocio_juntar', { p_tiny: Number(tinyId), p_prospeccao_negocio: Number(proId) }));
  Object.assign(t, r.negocio);
  CRM.neg = CRM.neg.filter(x => x.id !== p.id);
  for (const a of CRM.atv) if (a.negocio_id === p.id) a.negocio_id = t.id;
  for (const v of CRM.vinc || []) if (v.negocio_id === p.id) v.negocio_id = t.id;
  avisar('Negócios juntados.'); crmAbrir(t.id); render();
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
  // pedido ligado cancelado também aparece em negócio já ganho: a venda pode ter caído
  if (['ganho','perdido'].includes(n.etapa)) return vendaNegocio(n).cancelados ? '<span class="tag ruim">Pedido ligado cancelado</span>' : '';
  const vd = vendaNegocio(n);
  return `${vd.cancelados ? '<span class="tag ruim">Pedido ligado cancelado</span>' : ''}${vd.vendido > 0 && vd.saldo > 0 ? '<span class="tag azul">Venda parcial</span>' : ''}${paraJuntar(n).length ? '<span class="tag azul">Juntar com a campanha?</span>' : ''}${r.inativo ? '<span class="tag med">⚠ Retomar negociação</span>' : ''}${r.pedidos_conferir ? '<span class="tag azul">Conferir compra</span>' : ''}${r.proposta_semelhante ? '<span class="tag med">Revisar propostas</span>' : ''}`;
}
const vendCRM = () => D.pessoas.filter(p => p.ativo && p.tiny && pessoasQueVejo().includes(p.id));
/** Primeiro dia útil a partir da data (segunda a sábado, sem os feriados da configuração da Equipe). Mesma regra do banco (dia_util). */
function diaUtil(d) {
  const fer = D.config?.feriados || [];
  for (let i = 0; i < 30 && (dow(d) === 0 || fer.includes(d)); i++) d = addDias(d, 1);
  return d;
}
const ehDiaUtil = d => diaUtil(d) === d;
/** Tentativas de contato já feitas no negócio (ligação, WhatsApp, visita, follow-up) e a última anotação de resultado.
 *  Tarefas internas (montar orçamento, tarefa geral, pós-venda) não contam. */
const TIPOS_CONTATO_CRM = ['ligar', 'whatsapp', 'visita', 'followup'];
function tentativasNegocio(n) {
  const feitas = (CRM.atv || []).filter(a => a.negocio_id === n.id && a.feito && TIPOS_CONTATO_CRM.includes(a.tipo)).sort((a, b) => (b.feito_em || '').localeCompare(a.feito_em || ''));
  return { n: feitas.length, ultima: feitas[0] };
}
/** O que falta para o negócio estar bem preenchido na etapa (só mostra; não bloqueia o avanço). */
function faltaNegocio(n) {
  if (['ganho', 'perdido'].includes(n.etapa)) return [];
  const f = [];
  if (!atvAbertas(n).length) f.push('próximo passo');
  if (['orcamento', 'negociacao'].includes(n.etapa) && !n.orcamento_numero) f.push('orçamento no Tiny');
  if (!n.previsao) f.push('previsão de fechamento');
  if (!(+n.valor > 0)) f.push('valor');
  return f;
}
function blocoAvancar(n) {
  const falta = faltaNegocio(n);
  if (['ganho', 'perdido'].includes(n.etapa)) return '';
  const itens = [['próximo passo', 'Próximo passo agendado'], ['orçamento no Tiny', 'Orçamento ligado (Tiny)'], ['previsão de fechamento', 'Previsão de fechamento'], ['valor', 'Valor estimado']]
    .filter(([k]) => k !== 'orçamento no Tiny' || ['orcamento', 'negociacao'].includes(n.etapa));
  return `<div class="card mt" style="padding:10px 14px"><b>Para avançar com segurança</b> <small class="mut">${falta.length ? `faltam ${falta.length}` : 'tudo preenchido 👏'}</small>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px">${itens.map(([k, rot]) => `<small class="${falta.includes(k) ? 'c-med' : 'c-ok'}">${falta.includes(k) ? '○' : '✓'} ${rot}</small>`).join('')}</div>
    ${falta.includes('previsão de fechamento') ? `<div class="nova-atv" style="margin-top:8px"><input type="date" id="ngPrevRapida" min="${hoje()}" value="${diaUtil(addDias(hoje(), 15))}"><button class="btn peq" data-a="crmPrevisao" data-id="${n.id}">Salvar previsão</button></div>` : ''}</div>`;
}
async function crmPrevisao(id) {
  const v = $('#ngPrevRapida')?.value; if (!v) return avisar('Escolha a data prevista.');
  const n = CRM.neg.find(x => String(x.id) === String(id)); if (!n) return;
  Object.assign(n, await ok(sb.from('negocios').update({ previsao: v }).eq('id', n.id).select().single()));
  avisar('Previsão salva.'); crmAbrir(n.id); render();
}
function atvReagendar(id) {
  const a = (CRM.atv || []).find(x => String(x.id) === String(id)); if (!a) return;
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Reagendar</h2><p>${esc(a.titulo)}<br><small class="mut">${esc(a.cliente_nome || '')} · combinado para ${fmtCurta(a.quando_original || a.quando)}${(a.reagendamentos || []).length ? ` · já reagendada ${a.reagendamentos.length}×` : ''}</small></p>
    <div class="form-grid"><label class="campo">Nova data<input type="date" id="rgData" min="${hoje()}" value="${diaUtil(addDias(hoje(), 1))}"></label>
      <label class="campo inteiro">Motivo *<input type="text" id="rgMotivo" maxlength="300" placeholder="Ex.: cliente pediu para falar na semana que vem"></label></div>
    <p class="explica">A data combinada antes fica guardada no histórico da atividade.</p>
    <div class="acoes mt"><button class="btn pri" data-a="atvReagendarSalvar" data-id="${a.id}">Reagendar</button></div>`);
}
async function atvReagendarSalvar(id) {
  if (CRM.gravando.has('rg' + id)) return;
  const data = $('#rgData').value, motivo = $('#rgMotivo').value.trim();
  if (!data || data < hoje()) return avisar('Escolha hoje ou uma data futura.');
  if (!motivo) return avisar('Diga o motivo do reagendamento.');
  if (!ehDiaUtil(data) && !confirm(`${fmtCurta(data)} é domingo ou feriado. Reagendar mesmo assim?`)) return;
  CRM.gravando.add('rg' + id);
  try {
    const r = await ok(sb.rpc('atividade_reagendar', { p_id: Number(id), p_data: data, p_motivo: motivo }));
    Object.assign(CRM.atv.find(a => String(a.id) === String(id)), r);
    if (r.negocio_id) movimentoCRM(r.negocio_id);
    fecharModal(); avisar(`Reagendada para ${fmtCurta(data)}.`); render();
  } finally { CRM.gravando.delete('rg' + id); }
}
const seloReagendada = a => (a.reagendamentos || []).length ? ` · <span title="${esc(a.reagendamentos.map(r => `${fmtCurta(r.de)} → ${fmtCurta(r.para)}: ${r.motivo}`).join('\n'))}">reagendada ${a.reagendamentos.length}× (combinado ${fmtCurta(a.quando_original)})</span>` : '';

/** Por que o orçamento está parado: cada motivo pede uma ação diferente, em vez de cobrar todo mundo igual. */
const TRAVAS = {
  resposta: ['Sem resposta', 'Confirme se o cliente viu o orçamento.', 'Passando para saber se você conseguiu ver o orçamento. Ficou alguma dúvida?'],
  preco: ['Preço', 'Revise os itens e veja alternativas antes de falar em desconto.', 'Posso rever os itens com você e ver alternativas que caibam melhor no seu orçamento. Quer que eu faça isso?'],
  estoque: ['Estoque', 'Confira a disponibilidade ou ofereça um similar.', 'Estou conferindo a disponibilidade dos itens do seu orçamento. Se preferir, posso te passar uma alternativa. Pode ser?'],
  prazo: ['Prazo', 'Confira a data de que o cliente precisa e o prazo real.', 'Para qual data você precisa do material? Assim confiro o prazo certo para o seu orçamento.'],
  decisao: ['Decisão do cliente', 'Combine uma data para retomar em vez de cobrar agora.', 'Alguma novidade sobre a decisão do orçamento? Se preferir, me diga uma data boa para retomarmos.'],
};
function mensagemTrava(n, vendedor) {
  return `${saudacao(n.cliente_nome)} Aqui é ${vendedor ? vendedor + ', ' : ''}da Protemaxxi. ${TRAVAS[n.travado_motivo || 'resposta'][2]}`;
}
async function crmTrava(id, motivo) {
  const n = CRM.neg.find(x => String(x.id) === String(id)); if (!n) return;
  const novo = n.travado_motivo === motivo ? null : motivo;
  Object.assign(n, await ok(sb.from('negocios').update({ travado_motivo: novo }).eq('id', n.id).select().single()));
  render();
}
/** Orçamentos parados: o que está há mais tempo sem fechar, com as tentativas já feitas, para retomar ou decidir. */
function abaRecuperarCRM(neg) {
  const h = hoje();
  const l = neg.filter(n => ['orcamento', 'negociacao'].includes(n.etapa))
    .map(n => { const ini = (n.orcamento_data || n.criado_em || h).slice(0, 10), t = tentativasNegocio(n);
      return { n, dias: Math.round((pd(h) - pd(ini)) / 864e5), t, prox: atvAbertas(n)[0] }; })
    .filter(x => x.dias >= 7).sort((a, b) => (b.t.n >= 3) - (a.t.n >= 3) || b.n.valor - a.n.valor);
  const decidir = l.filter(x => x.t.n >= 3);
  const acaoTrava = n => { const fone = foneNegocio(n), c = (D.clientes || []).find(x => x.chave === n.cliente_chave), v = pessoa(n.pessoa_id)?.nome?.split(' ')[0] || '';
    return `<div class="chips" style="margin-top:6px">${Object.entries(TRAVAS).map(([k, t]) => `<button class="chip ${n.travado_motivo === k ? 'on' : ''}" data-a="crmTrava" data-id="${n.id}" data-v="${k}">${t[0]}</button>`).join('')}</div>
      ${n.travado_motivo ? `<small class="mut">${TRAVAS[n.travado_motivo][1]}</small> ` : ''}${linkWa(fone) && !c?.nao_contatar && !contatoPausado(c) ? `<a class="btn peq" href="${linkWa(fone)}?text=${encodeURIComponent(mensagemTrava(n, v))}" target="_blank" rel="noopener" title="Abre o WhatsApp com a mensagem para revisar antes de enviar">💬 Mensagem</a>` : ''}`; };
  return `<p class="explica">Orçamentos com 7 dias ou mais sem fechar, do maior valor para o menor. Com 3 tentativas ou mais, vale decidir com o cliente: ajustar a proposta, marcar uma data ou encerrar como perdido.</p>
    <div class="grid g3"><div class="card kpi-card"><div class="rot">Para recuperar</div><div class="val">${l.length}</div><div class="sub">${R0(soma(l.map(x => +x.n.valor)))}</div></div>
      <div class="card kpi-card"><div class="rot">Decidir (3+ tentativas)</div><div class="val ${decidir.length ? 'c-med' : 'c-ok'}">${decidir.length}</div><div class="sub">${R0(soma(decidir.map(x => +x.n.valor)))}</div></div>
      <div class="card kpi-card"><div class="rot">Sem próximo passo</div><div class="val ${l.some(x => !x.prox) ? 'c-ruim' : 'c-ok'}">${l.filter(x => !x.prox).length}</div><div class="sub">entre os parados</div></div></div>
    <div class="card mt">${l.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Cliente</th><th class="dir">Valor</th><th class="dir">Dias</th><th class="dir">Tentativas</th><th>Última anotação</th><th>Próximo passo</th><th></th></tr></thead><tbody>
      ${l.map(x => `<tr><td><b>${esc(x.n.cliente_nome || '')}</b><br><small>${esc(x.n.titulo)} · ${esc(nomeP(x.n.pessoa_id))}</small>${x.t.n >= 3 ? '<br><span class="tag med">Decidir</span>' : ''}${acaoTrava(x.n)}</td>
        <td class="dir num">${R0(x.n.valor)}</td><td class="dir">${x.dias}</td><td class="dir">${x.t.n}</td>
        <td><small>${x.t.ultima ? `${fmtCurta(x.t.ultima.feito_em.slice(0, 10))} · ${esc((x.t.ultima.resultado || x.t.ultima.titulo || '').slice(0, 80))}` : '<span class="mut">nenhuma</span>'}</small></td>
        <td><small class="${!x.prox ? 'c-ruim' : x.prox.quando < h ? 'c-ruim' : ''}">${x.prox ? `${fmtCurta(x.prox.quando)} · ${esc(x.prox.titulo.slice(0, 50))}` : '⚠ nenhum'}</small></td>
        <td class="dir"><button class="btn peq pri" data-a="crmAbrir" data-id="${x.n.id}">Abrir</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nenhum orçamento parado há 7 dias ou mais. 👏</div>'}</div>`;
}

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
    + `<div class="filtros"><div class="chips">${[['funil', '🎯 Funil'], ['lista', '📋 Lista'], ['recuperar', '🔁 Recuperar orçamentos'], ['ligar', '🧾 Pedidos para ligar'], ['indicadores', '📊 Indicadores']].map(([k, n]) => `<button class="chip ${UI.crmAba === k ? 'on' : ''}" data-a="crmAba" data-v="${k}">${n}</button>`).join('')}</div>
      ${vends.length > 1 ? `<select data-c="ui" data-k="crmVend"><option value="">Todos os vendedores</option>${vends.map(v => `<option value="${v.id}" ${fV === v.id ? 'selected' : ''}>${esc(v.nome)}</option>`).join('')}</select>` : ''}</div>
    <div class="grid g4">
      <div class="card kpi-card destaque"><div class="rot">No funil</div><div class="val verde">${R0(soma(abertos.map(n => +n.valor)))}</div><div class="sub">${abertos.length} negócio(s) aberto(s)</div></div>
      <div class="card kpi-card"><div class="rot">Previsão ponderada</div><div class="val">${R0(soma(abertos.map(n => +n.valor * PROB[n.etapa])))}</div><div class="sub">valor × chance de cada etapa</div></div>
      <div class="card kpi-card"><div class="rot">Conversão (90 dias)</div><div class="val">${ganhos.length + perdidos.length ? P(ganhos.length / (ganhos.length + perdidos.length)) : '—'}</div><div class="sub">${ganhos.length} ganho(s) · ${perdidos.length} perdido(s)${ciclo != null ? ` · ciclo ${Math.round(ciclo)} dia(s)` : ''}</div></div>
      <div class="card kpi-card"><div class="rot">Sem próxima atividade</div><div class="val ${semAtv.length ? 'c-ruim' : 'c-ok'}">${semAtv.length}</div><div class="sub">negócio parado é negócio perdido</div></div></div>`;
  if (UI.crmAba === 'indicadores') return cab + abaIndicadoresCRM(neg, fech);
  if (UI.crmAba === 'recuperar') return cab + abaRecuperarCRM(neg);
  if (UI.crmAba === 'ligar') return cab + abaPedidosLigar(neg);
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
    ${fechado ? '' : `<div class="kcard-atv">${a ?`${TIPOS_ATV[a.tipo]?.split(' ')[0] || '•'} ${fmtCurta(a.quando)} · ${esc(a.titulo.slice(0, 40))}` : '⚠ sem próxima atividade'}</div>`}</div>`;
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
      ${id ? '' : `<label class="campo inteiro">Próxima atividade *<span style="display:flex;gap:6px;flex-wrap:wrap"><select id="ngAtvTipo">${Object.entries(TIPOS_ATV).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><input type="date" id="ngAtvData" value="${diaUtil(addDias(hoje(), 1))}"><input type="text" id="ngAtvTit" placeholder="Ex.: ligar para apresentar a proposta" style="flex:1;min-width:180px"></span></label>`}
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
    <small class="mut">${ORIGENS[n.origem] || ''}${n.prospeccao_id ? ' (veio da campanha diária)' : ''}${n.orcamento_numero ? ` · orçamento ${esc(n.orcamento_numero)} no Tiny (${esc(n.orcamento_situacao || '')})` : ''} · criado ${new Date(n.criado_em).toLocaleDateString('pt-BR')}</small>
    <h2 style="margin:4px 0">${esc(n.cliente_nome || '')}</h2><p style="margin:0 0 10px">${esc(n.titulo)}</p>
    <div class="grid g3" style="gap:10px"><div class="card kpi-card"><div class="rot">Valor</div><div class="val" style="font-size:22px">${R(n.valor)}</div></div>
      <div class="card kpi-card"><div class="rot">Vendedor</div><div class="val" style="font-size:18px">${esc(nomeP(n.pessoa_id))}</div></div>
      <div class="card kpi-card"><div class="rot">Etapa</div><select data-c="crmEtapa" data-id="${n.id}" style="margin-top:6px;width:100%">${ETAPAS_CRM.map(([k, nm]) => `<option value="${k}" ${n.etapa === k ? 'selected' : ''}>${nm}</option>`).join('')}</select></div></div>
    ${n.etapa === 'perdido' && n.motivo_perda ? `<div class="alerta ruim mt"><span class="ic">✕</span><span>Perdido: ${esc(n.motivo_perda)}</span></div>` : ''}
    ${alertasNegocio(n)}${revisaoCRM(n).inativo ? '<p class="explica">Negociação sem movimento há mais de 15 dias. Registre uma tentativa de recuperação e agende o retorno. A inatividade não encerra o negócio.</p>' : ''}
    ${revisaoCRM(n).pedidos_conferir ? `<p class="explica">Pedido(s) posterior(es): ${esc(revisaoCRM(n).pedidos_conferir)}. Confira itens, quantidades e vínculo com esta negociação antes de marcar como ganho. Uma compra do mesmo cliente não confirma o fechamento.</p>` : ''}
    ${revisaoCRM(n).proposta_semelhante ? '<p class="explica">Há outra proposta com produtos em comum. Confira se é revisão, complemento ou outro projeto antes de encerrar alguma delas.</p>' : ''}
    ${paraJuntar(n).map(j => `<div class="alerta mt"><span class="ic">🔗</span><span>${n.id === j.tiny.id ? `Este cliente tem um negócio da campanha sem orçamento: <b>${esc(j.pro.titulo)}</b> (${fmtCurta(j.pro.criado_em.slice(0, 10))}).` : `Este cliente tem o orçamento <b>${esc(j.tiny.orcamento_numero || '')}</b> no Tiny (${R0(j.tiny.valor)}): <b>${esc(j.tiny.titulo)}</b>.`} Se for o mesmo pedido, junte para não acompanhar duas vezes.
      <button class="btn peq pri" data-a="crmJuntar" data-tiny="${j.tiny.id}" data-pro="${j.pro.id}">É o mesmo: juntar</button></span></div>`).join('')}
    ${blocoVendasNegocio(n)}
    ${blocoAvancar(n)}
    ${n.obs ? `<p class="mt" style="white-space:pre-wrap;font-size:13.5px">${esc(n.obs)}</p>` : ''}
    <h3 class="mt2">Atividades</h3>
    ${atvs.map(a => `<div class="atv ${a.feito || a.arquivada_em ? 'feita' : a.quando < hoje() ? 'atrasada' : ''}">${a.arquivada_em ? '<span title="Arquivada">↷</span>' : `<button class="atv-check" data-a="atvFeita" data-id="${a.id}" title="${a.feito ? 'Reabrir' : 'Marcar como feita'}">${a.feito ? '✓' : ''}</button>`}
      <div style="flex:1"><b>${TIPOS_ATV[a.tipo] || a.tipo}</b> · ${esc(a.titulo)}<br><small>${fmtCurta(a.quando)}${a.arquivada_em ? ' · arquivada: ' + esc(a.arquivada_motivo) : a.feito ? ` · feita ${new Date(a.feito_em).toLocaleDateString('pt-BR')}` : a.quando < hoje() ? ' · atrasada' : ''}${seloReagendada(a)}${a.resultado ? ' · ' + esc(a.resultado) : ''}</small></div>
      ${!a.feito && !a.arquivada_em ? `<button class="btn peq" data-a="atvReagendar" data-id="${a.id}" title="Mudar a data, com motivo">⇢</button>` : ''}</div>`).join('') || '<p class="mut">Nenhuma atividade.</p>'}
    <div class="nova-atv"><select id="atvTipo">${Object.entries(TIPOS_ATV).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><input type="date" id="atvData" value="${diaUtil(addDias(hoje(), 1))}"><input type="text" id="atvTit" placeholder="Próxima atividade…"><button class="btn pri peq" data-a="atvNova" data-negocio="${n.id}">+ Agendar</button></div>
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
      <div class="form-grid"><label class="campo">Data<input type="date" id="acData" min="${hoje()}" value="${diaUtil(addDias(hoje(), 1))}"></label>
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
  const cartao = (chave, nome) => { if (!cartoes.has(chave)) cartoes.set(chave, { chave, nome, prio: 9, grupo: 2, desde: h, valor: 0, motivos: [], linhas: [] }); return cartoes.get(chave); };
  const juntar = (k, prio, desde, motivo, linha, valor) => {
    k.prio = Math.min(k.prio, prio); if (desde < k.desde) k.desde = desde; k.valor = Math.max(k.valor, +valor || 0);
    if (!k.motivos.includes(motivo)) k.motivos.push(motivo); k.linhas.push(linha);
  };
  for (const a of (CRM.atv || []).filter(a => a.pessoa_id === quem && atvPendente(a) && a.quando <= h)) {
    const n = a.negocio_id ? negDe(a.negocio_id) : null;
    const k = cartao(a.cliente_chave || n?.cliente_chave || (a.negocio_id ? 'n' + a.negocio_id : 'a' + a.id), a.cliente_nome || n?.cliente_nome || a.titulo);
    juntar(k, a.quando < h ? 1 : 2, a.quando, a.quando < h ? `Atrasada há ${dias(a.quando)} dia(s)` : 'Agendada para hoje', { tipo: 'atv', a, n }, n?.valor);
    // compromisso marcado (com hora ou data acertada com o cliente) vem antes; depois, quem pediu contato pelo anúncio
    if (a.hora || (a.reagendamentos || []).length) { k.grupo = 0; juntar(k, k.prio, k.desde, a.hora ? `Compromisso às ${a.hora.slice(0, 5)}` : 'Data combinada', { tipo: 'nada' }); }
    else if (ehLead(a)) { k.grupo = Math.min(k.grupo, 1); juntar(k, k.prio, k.desde, 'Pediu contato pelo anúncio', { tipo: 'nada' }); }
  }
  for (const i of followupsHoje(quem)) {
    const k = cartao(i.cliente_chave || 'i' + i.id, i.cliente_nome || '');
    k.grupo = 0;
    juntar(k, i.proximo_contato < h ? 1 : 2, i.proximo_contato, i.proximo_contato < h ? `Retorno combinado vencido há ${dias(i.proximo_contato)} dia(s)` : 'Retorno combinado para hoje', { tipo: 'fup', i });
  }
  for (const n of (CRM.neg || []).filter(n => n.pessoa_id === quem && !['ganho', 'perdido'].includes(n.etapa))) {
    const r = revisaoCRM(n), sem = !atvAbertas(n).length;
    if (!sem && !r.inativo && !r.pedidos_conferir && !r.proposta_semelhante) continue;
    const k = cartao(n.cliente_chave || 'n' + n.id, n.cliente_nome || n.titulo);
    const motivo = sem ? `Negócio de ${R0(n.valor)} sem próximo passo` : r.inativo ? 'Negociação parada há mais de 15 dias' : r.pedidos_conferir ? 'Compra posterior para conferir' : 'Proposta parecida para revisar';
    juntar(k, 3, (n.mov_em || n.atualizado_em || h).slice(0, 10), motivo, { tipo: 'neg', n }, n.valor);
  }
  return [...cartoes.values()].sort((a, b) => a.grupo - b.grupo || a.prio - b.prio || a.desde.localeCompare(b.desde) || b.valor - a.valor);
}
const ehLead = a => /^lead_ads:/.test(a.automatica || '');
const foneLead = a => ehLead(a) ? a.automatica.slice(9) : '';
/** Saudação pelo nome; nome de lead vem depois do "~" e telefone nunca vira nome. */
function saudacao(nome) {
  const s = String(nome || '').split('~').pop().trim(), n = /^\W*\d/.test(s) || /sem nome/i.test(s) ? '' : nomeCurtoCli(s);
  return n ? `Olá, ${n}!` : 'Olá, tudo bem?';
}
/** O WhatsApp do lead respeita número marcado como errado, "não contatar" e pausa, de qualquer cadastro com o mesmo número. */
function leadPodeChamar(a) {
  if (!TELF.lista) { if (!TELF.carregando) carregarTelErrados().then(render).catch(() => {}); return false; }
  const f = foneNorm(foneLead(a));
  if (TELF.lista.some(t => t.telefone === f)) return false;
  return !(D.clientes || []).some(c => (c.chave === a.cliente_chave || (c.fone && foneNorm(c.fone) === f)) && (c.nao_contatar || contatoPausado(c)));
}
/** Primeiro contato com quem veio do anúncio: nome e produto saem do que o lead informou. */
function mensagemLead(a, vendedor) {
  const prod = (a.titulo || '').match(/Kit completo|Câmeras CFTV|Cerca elétrica|Controle de acesso|Alarme de segurança/)?.[0];
  return `${saudacao(a.cliente_nome)} Aqui é ${vendedor ? vendedor + ', ' : ''}da Protemaxxi. Vi que você pediu informações${prod ? ' sobre ' + prod.toLowerCase() : ''} pelo nosso site. Como posso te ajudar?`;
}
/** Retorno combinado: lembra o combinado sem repetir oferta. */
function mensagemRetorno(i, vendedor) {
  const h = hoje();
  return `${saudacao(i.cliente_nome)} Aqui é ${vendedor ? vendedor + ', ' : ''}da Protemaxxi. Combinamos de nos falar ${i.proximo_contato >= h ? 'hoje' : 'nestes dias'}. Este é um bom momento?`;
}
function cartaoFila(k) {
  const h = hoje(), cor = k.prio === 1 ? 'ruim' : k.prio === 2 ? 'azul' : 'med';
  const eu1 = id => pessoa(id)?.nome?.split(' ')[0] || '', wa = (fone, msg) => linkWa(fone) ? `<a class="btn peq pri" href="${linkWa(fone)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener" title="Abre o WhatsApp com a mensagem para revisar antes de enviar">💬</a>` : '';
  const foneCli = chave => (D.clientes || []).find(c => c.chave === chave);
  const podeChamar = c => !c?.nao_contatar && !contatoPausado(c);
  const linha = l => l.tipo === 'nada' ? '' : l.tipo === 'atv' ? `<div class="atv ${l.a.quando < h ? 'atrasada' : ''}"><button class="atv-check" data-a="atvFeita" data-id="${l.a.id}" title="Concluir e registrar o resultado"></button>
      <div style="flex:1"><b>${TIPOS_ATV[l.a.tipo] || l.a.tipo}</b> · ${esc(l.a.titulo)}<br><small>${fmtCurta(l.a.quando)}${l.a.automatica ? ' · automática' : ''}${seloReagendada(l.a)}</small></div>
      ${foneLead(l.a) && leadPodeChamar(l.a) ? wa(foneLead(l.a), mensagemLead(l.a, eu1(l.a.pessoa_id))) : ''}<button class="btn peq" data-a="atvReagendar" data-id="${l.a.id}" title="Mudar a data, com motivo">⇢</button><button class="btn peq" data-a="atvContato" data-id="${l.a.id}" title="Contato do cliente: celular e e-mail">+</button>${l.a.negocio_id ? `<button class="btn peq" data-a="crmAbrir" data-id="${l.a.negocio_id}">Negócio</button>` : ''}</div>`
    : l.tipo === 'fup' ? `<div class="atv"><button class="atv-check" data-a="followupFeito" data-id="${l.i.id}" title="Retorno feito"></button><div style="flex:1"><small>${esc(l.i.texto.slice(0, 140))}</small></div>${podeChamar(foneCli(l.i.cliente_chave)) ? wa(foneCli(l.i.cliente_chave)?.fone, mensagemRetorno(l.i, eu1(l.i.autor_id))) : ''}</div>`
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

// ─── Linha do tempo do cliente (ficha) ───
/** Tudo o que aconteceu com o cliente, do mais recente para o mais antigo: compras, contatos, campanha, negócios,
 *  atividades e OS. Só leitura; junta o que já existe, sem fundir cadastros. */
async function linhaTempoCliente(chave) {
  const el = document.getElementById('cliLinha'); if (!el || el.dataset.chave !== chave) return;
  try {
    const [pro, negs, atvs, oss] = await Promise.all([
      ok(sb.from('prospeccao').select('id,data,lista,resultado,resultado_em,pessoa_id,motivo,interacao_id').eq('cliente_chave', chave).order('data', { ascending: false }).limit(200)),
      ok(sb.from('negocios').select('id,titulo,etapa,valor,criado_em,fechado_em,pessoa_id,orcamento_numero,motivo_perda,juntado_a').eq('cliente_chave', chave).limit(60)),
      ok(sb.from('atividades').select('id,tipo,titulo,quando,feito,feito_em,resultado,pessoa_id,negocio_id,arquivada_em').eq('cliente_chave', chave).order('quando', { ascending: false }).limit(100)),
      carregarOS().catch(() => []),
    ]);
    const ev = eventosCliente(chave, { pro, negs, atvs, oss: (oss || []).filter(o => o.cliente_chave === chave) });
    if (el.dataset.chave !== chave) return;
    el.innerHTML = blocoLinhaTempo(ev);
  } catch (e) { el.innerHTML = `<p class="mut">Não consegui montar a linha do tempo: ${esc(e.message)}</p>`; }
}
function eventosCliente(chave, x) {
  const ev = [], quem = id => (pessoa(id)?.nome || '').split(' ')[0];
  for (const p of (D.pedidos || []).filter(p => p.cliente_chave === chave))
    ev.push({ d: p.data, ic: '🛒', txt: `Compra nº ${p.numero} · ${R0(p.valor)}${p.situacao ? ' · ' + p.situacao : ''}`, quem: nomeVendedor(p.vendedor_id) });
  const ints = (D.interacoes || []).filter(i => i.cliente_chave === chave), idsInt = new Set(ints.map(i => i.id));
  for (const i of ints)
    ev.push({ d: i.criado_em, ic: (TIPOS_INT[i.tipo] || '•').split(' ')[0], txt: i.texto || '', quem: quem(i.autor_id) });
  // resultado da campanha que já virou contato registrado aparece uma vez só (pelo contato, com o texto completo)
  for (const p of (x.pro || []).filter(p => !(p.interacao_id && idsInt.has(p.interacao_id))))
    ev.push({ d: p.resultado_em || p.data, ic: '📞', txt: `Campanha ${(LISTAS_PRO[p.lista] || [p.lista])[0]}: ${p.resultado ? RES_PRO[p.resultado] || p.resultado : 'na lista, sem registro'}`, quem: quem(p.pessoa_id) });
  for (const n of x.negs || []) {
    ev.push({ d: n.criado_em, ic: '🎯', txt: `Negócio aberto: ${n.titulo}${n.orcamento_numero ? ' (orçamento ' + n.orcamento_numero + ')' : ''} · ${R0(n.valor)}`, quem: quem(n.pessoa_id) });
    if (n.fechado_em) ev.push({ d: n.fechado_em, ic: n.etapa === 'ganho' ? '🎉' : n.juntado_a ? '🔗' : '✕',
      txt: `${n.etapa === 'ganho' ? 'Negócio ganho' : n.juntado_a ? 'Negócio juntado ao orçamento' : 'Negócio perdido'}: ${n.titulo}${n.motivo_perda && !n.juntado_a ? ' · ' + n.motivo_perda : ''}`, quem: quem(n.pessoa_id) });
  }
  for (const a of (x.atvs || []).filter(a => a.feito && !a.arquivada_em))
    ev.push({ d: a.feito_em || a.quando, ic: '✓', txt: `${TIPOS_ATV[a.tipo] || a.tipo}: ${a.titulo}${a.resultado ? ' → ' + a.resultado : ''}`.slice(0, 180), quem: quem(a.pessoa_id) });
  for (const o of x.oss || [])
    ev.push({ d: o.data, ic: '🛠', txt: `OS ${o.numero || o.id}: ${o.equipamento || o.descricao_problema || ''} · ${o.situacao || ''}`.slice(0, 160), quem: '' });
  return ev.filter(e => e.d).sort((a, b) => String(b.d).localeCompare(String(a.d)));
}
function blocoLinhaTempo(ev) {
  if (!ev.length) return '<p class="mut">Nada registrado ainda.</p>';
  const linha = e => `<div class="atv"><small class="mut" style="min-width:64px">${fmtCurta(String(e.d).slice(0, 10))}/${String(e.d).slice(2, 4)}</small><span>${e.ic}</span><div style="flex:1"><small>${esc(e.txt)}</small></div>${e.quem ? `<small class="mut">${esc(e.quem)}</small>` : ''}</div>`;
  return ev.slice(0, 25).map(linha).join('') + (ev.length > 25 ? `<details><summary class="mut">ver mais ${ev.length - 25}</summary>${ev.slice(25).map(linha).join('')}</details>` : '');
}

// ─── Supervisão: central de pendências comerciais ───
/** O que está travado na equipe (e por quê), com atalho para resolver ou passar para outra pessoa. */
function pendenciasComerciais(pessoas) {
  const h = hoje(), itens = [];
  for (const p of pessoas) {
    for (const a of (CRM.atv || []).filter(a => a.pessoa_id === p.id && atvPendente(a) && a.quando < h)) {
      // atividade de negócio passa com o negócio inteiro; de negócio encerrado (pós-venda) não dá para passar
      const n = a.negocio_id ? (CRM.neg || []).find(x => x.id === a.negocio_id) : null, aberto = n && !['ganho', 'perdido'].includes(n.etapa);
      itens.push({ k: 'atrasado', p, prazo: a.quando, txt: `${a.cliente_nome || ''} · ${a.titulo}`, abrir: a.negocio_id ? ['crmAbrir', a.negocio_id] : null,
        passar: !a.negocio_id ? ['atividade', a.id] : aberto ? ['negocio', a.negocio_id] : null });
    }
    // retornos combinados (contatos com próximo contato vencido), como no Meu dia
    for (const i of followupsHoje(p.id).filter(i => i.proximo_contato < h))
      itens.push({ k: 'atrasado', p, prazo: i.proximo_contato, txt: `${i.cliente_nome || ''} · retorno combinado: ${(i.texto || '').slice(0, 80)}`, abrir: i.cliente_chave ? ['verCliente', i.cliente_chave] : null });
    for (const n of (CRM.neg || []).filter(n => n.pessoa_id === p.id && !['ganho', 'perdido'].includes(n.etapa))) {
      if (!atvAbertas(n).length) itens.push({ k: 'semPasso', p, prazo: (n.mov_em || n.atualizado_em || '').slice(0, 10), txt: `${n.cliente_nome || ''} · ${n.titulo} · ${R0(n.valor)}`, abrir: ['crmAbrir', n.id], passar: ['negocio', n.id], valor: +n.valor });
      if (revisaoCRM(n).pedidos_conferir) itens.push({ k: 'conferir', p, prazo: '', txt: `${n.cliente_nome || ''} · pedido(s) ${revisaoCRM(n).pedidos_conferir}`, abrir: ['crmAbrir', n.id] });

      if (n.orcamento_id && paraJuntar(n).length) itens.push({ k: 'juntar', p, prazo: '', txt: `${n.cliente_nome || ''} · orçamento ${n.orcamento_numero || ''} e negócio da campanha`, abrir: ['crmAbrir', n.id] });
    }
    // pedido ligado cancelado no Tiny, inclusive em negócio já ganho
    for (const n of (CRM.neg || []).filter(n => n.pessoa_id === p.id && n.etapa !== 'perdido' && vendaNegocio(n).cancelados))
      itens.push({ k: 'conferir', p, prazo: '', txt: `${n.cliente_nome || ''} · pedido ligado foi cancelado no Tiny${n.etapa === 'ganho' ? ' (negócio ganho)' : ''}`, abrir: ['crmAbrir', n.id] });
    const tel = filaTelefones(p.id);
    if (tel?.length) itens.push({ k: 'telefone', p, prazo: '', txt: `${tel.length} cliente(s) fora da campanha por número errado`, abrir: ['irProspeccao', p.id] });
    const pro = campanhaHoje(p.id);
    if (pro && pro.total && pro.pendentes) itens.push({ k: 'adesao', p, prazo: h, txt: `Prospecção de hoje: ${pro.contatos} de ${pro.total} registrados · ${pro.pendentes} sem registro`, abrir: ['irProspeccao', p.id] });
  }
  return itens;
}
const TIPOS_PEND = { atrasado: '⏰ Retornos vencidos', semPasso: '⚠️ Negócios sem próximo passo', conferir: '🧾 Vendas para conferir', juntar: '🔗 Orçamento × campanha', telefone: '📵 Telefones para corrigir', adesao: '📞 Prospecção sem registro' };
function blocoPendencias(sup, equipe) {
  const pessoas = [sup, ...equipe].filter((p, i, l) => p?.tiny && l.findIndex(x => x.id === p.id) === i);
  if (!pessoas.length) return '';
  if (!CRM.neg) { if (!CRM.carregando) carregarCRM().then(render).catch(e => avisar(e.message)); return '<div class="card mt2 vazio">Carregando as pendências comerciais…</div>'; }
  if (!D.clientes && !vMeuDia.carregandoCli) vMeuDia.carregandoCli = carregarClientes().then(render).catch(() => {}).finally(() => { vMeuDia.carregandoCli = null; });
  const itens = pendenciasComerciais(pessoas), cont = (p, k) => itens.filter(x => x.p.id === p.id && x.k === k).length;
  const acoes = x => `${x.abrir ? `<button class="btn peq" data-a="${x.abrir[0]}" ${x.abrir[0] === 'irProspeccao' ? `data-pessoa="${x.abrir[1]}"` : x.abrir[0] === 'verCliente' ? `data-chave="${esc(x.abrir[1])}"` : `data-id="${x.abrir[1]}"`}>Abrir</button>` : ''}${x.passar ? `<button class="btn peq" data-a="crmPassar" data-tipo="${x.passar[0]}" data-id="${x.passar[1]}" data-de="${x.p.id}">Passar</button>` : ''}`;
  const grupo = k => { const l = itens.filter(x => x.k === k).sort((a, b) => (a.prazo || '9').localeCompare(b.prazo || '9') || (b.valor || 0) - (a.valor || 0));
    return l.length ? `<details class="mt" ${['atrasado', 'adesao'].includes(k) ? 'open' : ''}><summary><b>${TIPOS_PEND[k]}</b> <small class="mut">${l.length}</small></summary>
      ${l.slice(0, 20).map(x => `<div class="atv"><div style="flex:1"><small><b>${esc(x.p.nome.split(' ')[0])}</b>${x.prazo ? ` · ${k === 'semPasso' ? 'parado desde' : 'prazo'} ${fmtCurta(x.prazo)}` : ''}</small><br>${esc(x.txt)}</div>${acoes(x)}</div>`).join('')}
      ${l.length > 20 ? `<p class="mut">Mostrando 20 de ${l.length}.</p>` : ''}</details>` : ''; };
  return `<div class="card mt2"><div class="secao-titulo"><h2>Central de pendências comerciais</h2><small>${itens.length} pendência(s) na equipe</small></div>
    <p class="explica" style="margin-top:0">O que está travado e por quê. "Abrir" leva para resolver; "Passar" entrega para outra pessoa da equipe, com motivo.</p>
    <div class="rolagem"><table class="tabela"><thead><tr><th>Vendedor</th>${Object.entries(TIPOS_PEND).map(([k, n]) => `<th class="dir" title="${n}">${n.split(' ')[0]}</th>`).join('')}</tr></thead><tbody>
      ${pessoas.map(p => `<tr><td><b>${esc(p.nome)}</b></td>${Object.keys(TIPOS_PEND).map(k => `<td class="dir ${cont(p, k) ? (k === 'atrasado' || k === 'adesao' ? 'c-ruim' : 'c-med') : 'mut'}">${cont(p, k) || '—'}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <small class="mut">${Object.values(TIPOS_PEND).join(' · ')}</small>
    ${Object.keys(TIPOS_PEND).map(grupo).join('')}</div>`;
}
function crmPassar(tipo, id, de) {
  const opcoes = vendCRM().filter(v => v.id !== de);
  if (!opcoes.length) return avisar('Não há outra pessoa da equipe para receber.');
  const n = tipo === 'negocio' ? (CRM.neg || []).find(x => String(x.id) === String(id)) : null, a = tipo === 'atividade' ? (CRM.atv || []).find(x => String(x.id) === String(id)) : null;
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Passar para outra pessoa</h2>
    <p>${esc(n ? `${n.cliente_nome || ''} · ${n.titulo}` : `${a?.cliente_nome || ''} · ${a?.titulo || ''}`)}<br><small class="mut">hoje com ${esc(nomeP(de))}${n ? ' · as atividades abertas do negócio vão junto' : ''}</small></p>
    <div class="form-grid"><label class="campo">Para<select id="psPara">${opcoes.map(v => `<option value="${v.id}">${esc(v.nome)}</option>`).join('')}</select></label>
      <label class="campo inteiro">Motivo *<input type="text" id="psMotivo" maxlength="300" placeholder="Ex.: vendedor de férias; cliente pediu outro atendente"></label></div>
    <div class="acoes mt"><button class="btn pri" data-a="crmPassarSalvar" data-tipo="${tipo}" data-id="${id}">Passar</button></div>`);
}
async function crmPassarSalvar(tipo, id) {
  if (CRM.gravando.has('ps' + id)) return;
  const para = $('#psPara').value, motivo = $('#psMotivo').value.trim();
  if (!motivo) return avisar('Diga o motivo.');
  CRM.gravando.add('ps' + id);
  try {
    const r = await ok(sb.rpc('crm_redistribuir', { p_tipo: tipo, p_id: Number(id), p_para: para, p_motivo: motivo }));
    if (r.negocio) { const n = CRM.neg.find(x => x.id === r.negocio.id); if (n) Object.assign(n, r.negocio); for (const a of CRM.atv) if (a.negocio_id === r.negocio.id && !a.feito && !a.arquivada_em) a.pessoa_id = para; }
    if (r.atividade) { const a = CRM.atv.find(x => x.id === r.atividade.id); if (a) Object.assign(a, r.atividade); }
    fecharModal(); avisar(`Passado para ${nomeP(para)}.`); render();
  } finally { CRM.gravando.delete('ps' + id); }
}

// ─── Venda ligada ao negócio (lote 3B): pedidos confirmados pelo vendedor, saldo e divergências ───
const cancelado = sit => /cancel/i.test(sit || '');
/** Venda do negócio pelos pedidos ligados: vendido (sem os cancelados), cancelados ligados e saldo a converter. */
function vendaNegocio(n) {
  const links = (CRM.vinc || []).filter(v => v.negocio_id === n.id);
  const validos = links.filter(v => !cancelado(v.pedidos?.situacao)), cancel = links.filter(v => cancelado(v.pedidos?.situacao));
  const vendido = soma(validos.map(v => +(v.pedidos?.valor || 0)));
  return { links, vendido, pedidos: validos.length, cancelados: cancel.length, saldo: Math.max(0, (+n.valor || 0) - vendido) };
}
/** Pedidos do cliente que podem ser deste negócio: mesmo cliente, da loja, não cancelados, ainda sem negócio,
 *  a partir de 7 dias antes do orçamento/abertura. Quem confirma é o vendedor. */
/** O cliente e os cadastros conferidos como "mesmo cliente" (Cadastros parecidos). */
function chavesDoCliente(chave) {
  const s = new Set([chave]);
  for (const p of CRM.mesmo || []) { if (p.a === chave) s.add(p.b); if (p.b === chave) s.add(p.a); }
  return s;
}
function pedidosCandidatos(n) {
  const ligados = new Set((CRM.vinc || []).map(v => v.pedido_id)), ini = addDias((n.orcamento_data || n.criado_em || hoje()).slice(0, 10), -7), chaves = chavesDoCliente(n.cliente_chave);
  return (D.pedidos || []).filter(p => chaves.has(p.cliente_chave) && !p.numero_ecommerce && !cancelado(p.situacao) && !ligados.has(p.id) && p.data >= ini)
    .sort((a, b) => b.data.localeCompare(a.data));
}
function blocoVendasNegocio(n) {
  const vd = vendaNegocio(n), cand = n.etapa === 'perdido' ? [] : pedidosCandidatos(n);
  if (!vd.links.length && !cand.length) return '';
  const linha = v => `<div class="atv"><div style="flex:1"><b>Pedido ${esc(v.pedidos?.numero || v.pedido_id)}</b> · ${v.pedidos?.data ? fmtCurta(v.pedidos.data) : ''} · ${R0(v.pedidos?.valor || 0)}
      ${cancelado(v.pedidos?.situacao) ? '<span class="tag ruim">cancelado: não conta</span>' : `<span class="tag">${esc(v.pedidos?.situacao || '')}</span>`}<br><small class="mut">ligado por ${esc(nomeP(v.vinculado_por))} em ${fmtCurta(v.vinculado_em.slice(0, 10))}</small></div>
      <button class="btn peq" data-a="crmDesfazerPedido" data-id="${v.id}" data-negocio="${n.id}" title="Tirar este pedido do negócio (com motivo)">Desfazer</button></div>`;
  return `<div class="card mt" style="padding:10px 14px"><b>🧾 Venda deste negócio</b>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin:6px 0"><small>Negociado <b>${R0(n.valor)}</b></small><small>Vendido <b class="c-ok">${R0(vd.vendido)}</b>${vd.pedidos ? ` em ${vd.pedidos} pedido(s)` : ''}</small><small>Saldo <b>${R0(vd.saldo)}</b></small></div>
    ${vd.cancelados ? '<p class="explica" style="margin:0 0 6px">Um pedido ligado foi cancelado no Tiny e saiu do vendido. Confira se o cliente refez a compra ou se a venda caiu.</p>' : ''}
    ${vd.links.map(linha).join('')}
    ${vd.vendido > 0 && vd.saldo > 0 && !['ganho', 'perdido'].includes(n.etapa) ? `<p class="explica" style="margin:6px 0 0">Venda parcial: ainda há ${R0(vd.saldo)} para converter neste negócio.</p>` : ''}
    ${vd.vendido > 0 && !['ganho', 'perdido'].includes(n.etapa) ? `<div class="acoes mt"><button class="btn peq pri" data-a="crmMover" data-id="${n.id}" data-v="ganho">🎉 Marcar como ganho</button></div>` : ''}
    ${cand.length ? `<h4 style="margin:10px 0 4px">Pedidos do cliente que podem ser deste negócio</h4>${cand.slice(0, 8).map(p => `<div class="atv"><div style="flex:1">Pedido <b>${esc(p.numero)}</b> · ${fmtCurta(p.data)} · ${R0(p.valor)} <small class="mut">${esc(p.situacao || '')} · ${esc(nomeVendedor(p.vendedor_id))}</small></div>
      <button class="btn peq" data-a="verPedido" data-id="${p.id}">Ver itens</button><button class="btn peq pri" data-a="crmLigarPedido" data-negocio="${n.id}" data-pedido="${p.id}">Ligar</button></div>`).join('')}
      <small class="mut">Uma compra do mesmo cliente não confirma o negócio: ligue só o que for desta negociação.</small>` : ''}</div>`;
}
async function crmLigarPedido(negocioId, pedidoId) {
  const n = CRM.neg.find(x => String(x.id) === String(negocioId)), p = (D.pedidos || []).find(x => String(x.id) === String(pedidoId));
  if (!n || !p) return;
  if (!confirm(`Ligar o pedido ${p.numero} (${R0(p.valor)}, ${fmtCurta(p.data)}) ao negócio "${n.titulo}" (${R0(n.valor)})?\n\nO pedido passa a contar como venda deste negócio. A etapa não muda sozinha.`)) return;
  if (CRM.gravando.has('lg' + pedidoId)) return;
  CRM.gravando.add('lg' + pedidoId);
  try {
    const r = await ok(sb.rpc('negocio_pedido_ligar', { p_negocio: Number(negocioId), p_pedido: String(pedidoId) }));
    if (!CRM.vinc.some(v => v.id === r.vinculo.id)) CRM.vinc.push({ ...r.vinculo, pedidos: { numero: p.numero, data: p.data, valor: p.valor, situacao: p.situacao } });
    movimentoCRM(n.id); if (!n.pedido_numero) n.pedido_numero = p.numero;
    const r2 = CRM.revisoes.find(x => x.negocio_id === n.id);
    if (r2?.pedidos_conferir) r2.pedidos_conferir = r2.pedidos_conferir.split(', ').filter(x => x !== p.numero).join(', ');
    avisar(r.repetido ? 'Este pedido já estava ligado.' : `Pedido ${p.numero} ligado.`); crmAbrir(n.id); render();
  } finally { CRM.gravando.delete('lg' + pedidoId); }
}
async function crmDesfazerPedido(vinculoId, negocioId) {
  const v = CRM.vinc.find(x => String(x.id) === String(vinculoId)); if (!v) return;
  const motivo = prompt(`Por que tirar o pedido ${v.pedidos?.numero || ''} deste negócio?`); if (motivo === null) return;
  if (!motivo.trim()) return avisar('Diga o motivo.');
  await ok(sb.rpc('negocio_pedido_desfazer', { p_vinculo: Number(vinculoId), p_motivo: motivo.trim() }));
  CRM.vinc = CRM.vinc.filter(x => x.id !== v.id);
  movimentoCRM(Number(negocioId)); avisar('Pedido tirado do negócio. O registro fica no histórico.'); crmAbrir(negocioId); render();
}
/** Pedidos recentes da loja sem negócio, de clientes que têm negócio aberto: para o vendedor conferir e ligar. */
function abaPedidosLigar(neg) {
  const abertos = neg.filter(n => n.etapa !== 'perdido' && n.etapa !== 'ganho'), ligados = new Set((CRM.vinc || []).map(v => v.pedido_id)), desde = addDias(hoje(), -60);
  const porCli = abertos.reduce((a, n) => { for (const k of chavesDoCliente(n.cliente_chave)) (a[k] ||= []).push(n); return a; }, {});
  const l = (D.pedidos || []).filter(p => p.data >= desde && !p.numero_ecommerce && !cancelado(p.situacao) && !ligados.has(p.id) && porCli[p.cliente_chave])
    .map(p => ({ p, negs: porCli[p.cliente_chave].filter(n => p.data >= addDias((n.orcamento_data || n.criado_em || hoje()).slice(0, 10), -7)) }))
    .filter(x => x.negs.length).sort((a, b) => b.p.data.localeCompare(a.p.data));
  return `<p class="explica">Pedidos da loja dos últimos 60 dias, ainda sem negócio, de clientes com negociação aberta. Confira os itens e ligue só o que for da negociação: compra de outra necessidade fica fora.</p>
    <div class="card mt">${l.length ? l.slice(0, 100).map(x => `<div class="atv" style="flex-wrap:wrap"><div style="flex:1;min-width:220px"><b>${esc(x.p.cliente_nome || '')}</b> · pedido <b>${esc(x.p.numero)}</b> · ${fmtCurta(x.p.data)} · ${R0(x.p.valor)}<br><small class="mut">${esc(x.p.situacao || '')} · ${esc(nomeVendedor(x.p.vendedor_id))}</small></div>
      <button class="btn peq" data-a="verPedido" data-id="${x.p.id}">Ver itens</button>
      ${x.negs.map(n => `<button class="btn peq pri" data-a="crmLigarPedido" data-negocio="${n.id}" data-pedido="${x.p.id}" title="${esc(n.titulo)}">Ligar a: ${esc(n.titulo.slice(0, 40))} (${R0(n.valor)})</button>`).join('')}</div>`).join('')
      : '<div class="vazio">Nenhum pedido aguardando vínculo. 👏</div>'}</div>`;
}
