'use strict';
/* Assistência: orçamento de manutenção e etapas dentro da assistência técnica (complementa assistencia.js).
 * Orçamento: cada linha tem o CUSTO que a assistência cobra; o cliente vê custo × margem (config 'assistencia'.margem_orcamento, 1,6),
 * arredondado (orcamento_arredondar: 'inteiro' sobe para o real seguinte; 'centavos' não arredonda), + frete. Validade e taxa de recusa
 * opcionais. O cliente aprova (nome + CPF/CNPJ) ou recusa (motivo) pelo link; a loja também registra resposta por telefone/balcão.
 * Na assistência (OS em "na_assistencia"): enviado → recebido → em análise → orçamento → aprovado | recusado → manutenção finalizada
 * → (a loja busca) "Disponível para retirada". Cada etapa vira andamento público e aviso ao cliente. */

const ETAPAS_ASSIST = {
  enviado: ['📦 Enviado à assistência', ''], recebido: ['📥 Recebido pela assistência', 'azul'], em_analise: ['🔬 Em análise pela assistência', 'azul'],
  orcamento: ['💬 Orçamento com o cliente', 'med'], aprovado: ['🛠 Aprovado: em manutenção', 'azul'], recusado: ['↩ Recusado: devolvendo sem reparo', 'med'],
  finalizado: ['✅ Manutenção finalizada: buscar', 'ok'],
};
const ETAPA_TEXTO = { recebido: 'assist_recebido', em_analise: 'assist_analise', finalizado: 'assist_finalizado' };
const ORC_ST = { rascunho: ['Rascunho', ''], enviado: ['Aguardando o cliente', 'med'], aprovado: ['Aprovado', 'ok'], recusado: ['Recusado', 'ruim'], expirado: ['Venceu', 'ruim'], cancelado: ['Substituído', ''] };
const orcArred = v => (AT.cfg?.orcamento_arredondar || 'inteiro') === 'inteiro' ? Math.ceil(v - 1e-9) : Math.round(v * 100) / 100;
const rmaAberto = o => (AT.rma || []).find(r => r.os_id === o.id && !r.retornou_em);

/** Na ficha: onde o equipamento está dentro da assistência e o próximo passo. */
function blocoAssistencia(o) {
  const r = rmaAberto(o); if (o.status !== 'na_assistencia' || !r) return '';
  const et = r.etapa || 'enviado', ordem = ['enviado', 'recebido', 'em_analise', 'orcamento', et === 'recusado' ? 'recusado' : 'aprovado', 'finalizado'];
  const prox = {
    enviado: [['recebido', '📥 Assistência recebeu o equipamento', 'pri']], recebido: [['em_analise', '🔬 Assistência está analisando', 'pri']],
    em_analise: [['_orc', '💬 Lançar orçamento da assistência', 'pri'], ['finalizado', '✅ Finalizado sem custo (garantia)', '']],
    orcamento: [], aprovado: [['finalizado', '✅ Manutenção finalizada', 'pri']], recusado: [['finalizado', '✅ Assistência liberou para buscar', 'pri']],
    finalizado: [['_pronto', '🚚 Buscamos: disponível para retirada', 'pri']],
  }[et] || [];
  const contato = AT.cfg?.contatos_assistencias?.[r.assistencia];
  return `<div class="card mt" style="background:var(--azul-claro, #EEF4FB)"><div class="secao-titulo" style="margin:0"><h3 style="margin:0">🏭 Na assistência: ${esc(r.assistencia)}</h3>
      <small>${r.protocolo ? 'protocolo ' + esc(r.protocolo) + ' · ' : ''}enviado ${fmtCurta(r.enviado_em)}${r.previsao_retorno ? ' · previsão ' + fmtCurta(r.previsao_retorno) : ''}</small></div>
    <div class="chips" style="margin:8px 0">${ordem.map(k => `<span class="chip ${k === et ? 'on' : ''}" style="cursor:default">${ETAPAS_ASSIST[k][0]}</span>`).join('')}</div>
    ${prox.length ? `<div class="acoes">${prox.map(([k, n, c]) => `<button class="btn ${c}" data-a="atEtapa" data-id="${o.id}" data-v="${k}">${n}</button>`).join('')}</div>` : ''}
    ${!contato?.email ? `<p class="mut" style="margin:8px 0 0"><small>⚠ Sem e-mail da ${esc(r.assistencia)} para o aviso automático de aprovado/recusado.
      ${ehDono() ? `<input type="email" id="assEmail" placeholder="e-mail da assistência" style="max-width:240px"> <button class="btn peq" data-a="atAssEmail" data-v="${esc(r.assistencia)}" data-id="${o.id}">Salvar</button>` : 'Peça ao administrador para cadastrar.'}</small></p>`
      : `<p class="mut" style="margin:8px 0 0"><small>Aviso automático de aprovado/recusado para <b>${esc(contato.email)}</b>${contato.responder_para ? ` (respostas chegam em ${esc(contato.responder_para)})` : ''}.</small></p>`}</div>`;
}

/** Na ficha: orçamentos da OS (custo × margem), com resposta pela loja. */
function blocoOrcamento(o, orcs) {
  const atual = orcs[0], aberta = !['entregue', 'cancelado'].includes(o.status), r = rmaAberto(o);
  const podeLancar = aberta && (o.status === 'em_analise' || (o.status === 'na_assistencia' && r && ['recebido', 'em_analise', 'orcamento'].includes(r.etapa || 'enviado')));
  const aguardando = o.orcamento_status === 'aguardando' && ['aguardando_cliente', 'na_assistencia'].includes(o.status);
  if (!atual && !podeLancar && !aguardando) return '';
  const linha = q => { const [n, c] = ORC_ST[q.status] || [q.status, ''], lucro = q.valor_cliente - q.custo_total - q.frete;
    return `<div class="atv"><div style="flex:1"><b>${R(q.valor_cliente)}</b> ao cliente <span class="tag ${c}">${n}</span>${q.validade && q.status === 'enviado' ? ` <small class="mut">válido até ${fmtCurta(q.validade)}</small>` : ''}
      <br><small class="mut">custo da assistência ${R(q.custo_total)} × ${String(q.margem).replace('.', ',')}${q.frete ? ' + frete ' + R(q.frete) : ''} · margem ${R(lucro)}${q.taxa_recusa ? ' · taxa se recusar ' + R(q.taxa_recusa) : ''}</small>
      <br><small>${(q.itens || []).map(i => `${esc(i.descricao)}: ${R(i.custo)} → <b>${R(i.valor)}</b>`).join(' · ')}</small>
      ${q.motivo_recusa ? `<br><small class="c-ruim">Motivo da recusa: ${esc(q.motivo_recusa)}</small>` : ''}${q.resposta?.nome ? `<br><small class="mut">Respondido por ${esc(q.resposta.nome)}${q.resposta.canal && q.resposta.canal !== 'link' ? ' (' + esc(q.resposta.canal) + ')' : ''} em ${dataHora(q.respondido_em)}</small>` : ''}</div>
      ${q.status === 'rascunho' && aberta ? `<button class="btn peq" data-a="atOrc" data-id="${o.id}" data-q="${q.id}">✎ Editar e enviar</button>` : ''}</div>`; };
  return `<div class="card mt"><div class="secao-titulo" style="margin:0"><h3 style="margin:0">🧾 Orçamento de manutenção</h3>
      ${podeLancar && !aguardando ? `<button class="btn peq pri" data-a="atOrc" data-id="${o.id}">+ ${atual ? 'Novo orçamento' : 'Gerar orçamento'}</button>` : ''}</div>
    ${orcs.map(linha).join('') || '<p class="mut">Nenhum orçamento ainda. Lance o valor que a assistência cobrou: a Intranet aplica a margem.</p>'}
    ${aguardando ? `<div class="acoes mt"><span class="mut">O cliente respondeu por telefone ou na loja?</span><button class="btn peq pri" data-a="atOrcResp" data-id="${o.id}" data-v="1">👍 Aprovou</button><button class="btn peq" data-a="atOrcResp" data-id="${o.id}" data-v="0">👎 Recusou</button>
      <button class="btn peq" data-a="atCopiarLink" data-id="${o.id}">🔗 Link para o cliente responder</button></div>` : ''}</div>`;
}

// ─── formulário do orçamento ───
function orcLinhaForm(i = {}) {
  return `<div class="orc-linha" style="display:grid;grid-template-columns:minmax(0,3fr) minmax(0,1fr) minmax(0,1fr) auto;gap:6px;align-items:end;margin-bottom:6px">
    <label class="campo" style="margin:0">Serviço / peça<input type="text" class="orcDesc" value="${esc(i.descricao || '')}" placeholder="Ex.: troca da placa de vídeo"></label>
    <label class="campo" style="margin:0">Custo da assistência (R$)<input type="number" step="0.01" min="0" class="orcCusto" value="${i.custo ?? ''}"></label>
    <label class="campo" style="margin:0">Ao cliente<input type="text" class="orcValor" disabled></label>
    <button type="button" class="btn peq" data-a="atOrcRem" title="Tirar linha">✕</button></div>`;
}
async function atOrcForm(id, qid) {
  const o = AT.os.find(x => String(x.id) === String(id)); if (!o) return;
  const q = qid ? (await ok(sb.from('at_orcamentos').select('*').eq('id', qid).single())) : null;
  const cfg = AT.cfg || {}, margem = q?.margem ?? +(cfg.margem_orcamento || 1.6), validade = q?.validade || addDias(hoje(), +(cfg.orcamento_validade_dias || 7));
  const r = rmaAberto(o), custoRMA = r?.custo;
  modal(`<button class="btn peq fechar" data-a="atAbrirVolta" data-id="${o.id}">✕</button><h2>OS ${esc(o.numero)} · orçamento de manutenção</h2>
    <p class="explica">Lance o que ${r ? `a <b>${esc(r.assistencia)}</b>` : 'a assistência / o técnico'} cobra de nós. O cliente vê só o valor com a margem.</p>
    <div id="orcForm"><div id="orcLinhas">${(q?.itens?.length ? q.itens : [{ descricao: '', custo: custoRMA ?? '' }]).map(orcLinhaForm).join('')}</div>
      <button type="button" class="btn peq" data-a="atOrcAdd">+ Linha</button>
      <div class="form-grid mt"><label class="campo">Margem (×)<input type="number" step="0.01" min="1" id="orcMargem" value="${margem}" ${ehDono() ? '' : 'disabled'}></label>
        <label class="campo">Frete ao cliente (R$, sem margem)<input type="number" step="0.01" min="0" id="orcFrete" value="${q?.frete ?? 0}"></label>
        <label class="campo">Válido até<input type="date" id="orcValidade" value="${validade}"></label>
        <label class="campo">Taxa se o cliente recusar (R$)<input type="number" step="0.01" min="0" id="orcTaxa" value="${q?.taxa_recusa ?? +(cfg.taxa_recusa || 0)}"></label>
        <label class="campo inteiro">Diagnóstico (o cliente vê)<textarea id="orcDiag" rows="2">${esc(o.diagnostico || '')}</textarea></label>
        <label class="campo inteiro">Observação ao cliente <small class="mut">(prazo, garantia do serviço…)</small><textarea id="orcObs" rows="2">${esc(q?.obs_cliente || '')}</textarea></label>
        <label class="campo">CPF / CNPJ do cliente${o.cliente_doc ? '' : ' <small class="c-med">(sem ele o cliente não aprova pelo link)</small>'}<input type="text" id="orcDoc" inputmode="numeric" value="${esc(o.cliente_doc || '')}"></label></div>
      <div class="card mt" style="background:var(--verde-claro)"><div class="grid g3"><div><small class="mut">Custo (assistência)</small><div id="orcCustoT" style="font-size:20px;font-weight:700">—</div></div>
        <div><small class="mut">Total ao cliente</small><div id="orcTotal" style="font-size:24px;font-weight:800">—</div></div><div><small class="mut">Nossa margem</small><div id="orcLucro" style="font-size:20px;font-weight:700">—</div></div></div></div>
      <label class="campo inteiro mt">Mensagem ao cliente<textarea id="orcMsg" rows="3"></textarea></label>
      <label class="campo"><span><input type="checkbox" id="orcAvisar" ${o.cliente_fone || o.cliente_email ? 'checked' : ''}> Avisar o cliente (WhatsApp / e-mail)</span></label></div>
    <div class="acoes mt"><button class="btn pri" data-a="atOrcSalvar" data-id="${o.id}" data-q="${q?.id || ''}" data-v="1">Enviar ao cliente</button><button class="btn" data-a="atOrcSalvar" data-id="${o.id}" data-q="${q?.id || ''}" data-v="0">Salvar rascunho</button></div>`, true);
  const f = $('#orcForm'); f.addEventListener('input', () => atOrcCalc(o)); atOrcCalc(o, true);
}
function orcDoForm() {
  const margem = Math.max(1, Number($('#orcMargem').value) || 1), frete = Math.max(0, Number($('#orcFrete').value) || 0);
  const itens = [...document.querySelectorAll('#orcLinhas .orc-linha')].map(l => ({ descricao: l.querySelector('.orcDesc').value.trim(), custo: Math.max(0, Number(l.querySelector('.orcCusto').value) || 0) }))
    .filter(i => i.descricao || i.custo).map(i => ({ ...i, valor: orcArred(i.custo * margem) }));
  const custo = soma(itens.map(i => i.custo)), total = soma(itens.map(i => i.valor)) + frete;
  return { margem, frete, itens, custo, total };
}
function atOrcCalc(o, primeira) {
  const f = orcDoForm();
  document.querySelectorAll('#orcLinhas .orc-linha').forEach(l => { const c = Math.max(0, Number(l.querySelector('.orcCusto').value) || 0); l.querySelector('.orcValor').value = c ? R(orcArred(c * f.margem)) : ''; });
  $('#orcCustoT').textContent = R(f.custo); $('#orcTotal').textContent = R(f.total); $('#orcLucro').textContent = R(f.total - f.custo - f.frete);
  const msg = $('#orcMsg'), auto = textoAviso(o, 'orcamento', R(f.total));
  if (primeira || msg.dataset.auto === msg.value) { msg.value = auto; msg.dataset.auto = auto; }
}
async function atOrcSalvar(id, qid, enviar) {
  const o = AT.os.find(x => String(x.id) === String(id)), f = orcDoForm(), v = k => ($('#' + k)?.value || '').trim();
  if (!f.itens.length || !f.total) return avisar('Lance pelo menos uma linha com o custo da assistência.');
  if (f.itens.some(i => !i.descricao)) return avisar('Descreva o serviço / peça de cada linha.');
  const doc = v('orcDoc').replace(/\D/g, '');
  if (enviar && doc && doc.length !== 11 && doc.length !== 14) return avisar('CPF (11) ou CNPJ (14 números).');
  const r = rmaAberto(o), agora = new Date().toISOString();
  const dados = { os_id: o.id, rma_id: o.status === 'na_assistencia' ? r?.id ?? null : null, itens: f.itens, custo_total: f.custo, margem: f.margem, frete: f.frete, valor_cliente: f.total,
    taxa_recusa: Math.max(0, Number(v('orcTaxa')) || 0), validade: v('orcValidade') || null, obs_cliente: v('orcObs') || null, status: enviar ? 'enviado' : 'rascunho', ...(enviar ? { enviado_em: agora, enviado_por: EU.id } : {}) };
  if (enviar) await ok(sb.from('at_orcamentos').update({ status: 'cancelado' }).eq('os_id', o.id).eq('status', 'enviado').select('id'));
  const q = qid ? await ok(sb.from('at_orcamentos').update(dados).eq('id', qid).select().single()) : await ok(sb.from('at_orcamentos').insert({ ...dados, criado_por: EU.id }).select().single());
  const upd = { diagnostico: v('orcDiag') || o.diagnostico, ...(doc ? { cliente_doc: doc } : {}) };
  if (enviar) Object.assign(upd, { orcamento_valor: f.total, orcamento_status: 'aguardando', orcamento_resposta: null, ...(o.status === 'em_analise' ? { status: 'aguardando_cliente' } : {}) });
  Object.assign(o, await ok(sb.from('at_os').update(upd).eq('id', o.id).select().single()));
  if (enviar && o.status === 'na_assistencia' && r) Object.assign(r, await ok(sb.from('at_rma').update({ etapa: 'orcamento', custo: f.custo }).eq('id', r.id).select().single()));
  if (enviar && $('#orcAvisar')?.checked && v('orcMsg')) await gerarAvisos(o, 'aguardando_cliente', '', v('orcMsg'), `${AT.cfg?.empresa || ''} · OS ${o.numero}: orçamento para aprovação`);
  avisar(enviar ? `Orçamento de ${R(f.total)} enviado ao cliente.` : 'Rascunho salvo.'); render(); atAbrir(o.id);
  if (enviar) atSincTiny(o);
}
async function atOrcResp(id, aprova) {
  const o = AT.os.find(x => String(x.id) === String(id));
  const canal = prompt(`O cliente ${aprova ? 'APROVOU' : 'RECUSOU'} como? (telefone, WhatsApp, na loja…)`, 'telefone'); if (canal == null) return;
  const motivo = aprova ? null : prompt('Motivo da recusa (obrigatório):'); if (!aprova && !motivo?.trim()) return avisar('Informe o motivo da recusa.');
  const { data, error } = await sb.rpc('at_orcamento_responder_loja', { p_os: o.id, p_aprova: !!aprova, p_canal: canal, p_motivo: motivo });
  if (error || !data?.ok) return avisar(data?.erro || error?.message || 'Não deu certo.');
  await carregarAT(true); avisar(`Orçamento ${aprova ? 'aprovado' : 'recusado'}: cliente${o.status === 'na_assistencia' ? ' e assistência' : ''} avisados.`); render(); atAbrir(o.id);
}

// ─── etapas na assistência ───
function atEtapaForm(id, etapa) {
  if (etapa === '_orc') return atOrcForm(id);
  if (etapa === '_pronto') return atMudarForm(id, 'pronto');
  const o = AT.os.find(x => String(x.id) === String(id)), chave = ETAPA_TEXTO[etapa];
  modal(`<button class="btn peq fechar" data-a="atAbrirVolta" data-id="${o.id}">✕</button><h2>OS ${esc(o.numero)} → ${ETAPAS_ASSIST[etapa][0]}</h2>
    <div class="form-grid"><label class="campo inteiro">Mensagem ao cliente <small class="mut">(vai pelo WhatsApp/e-mail e aparece no "Acompanhe sua OS")</small><textarea id="etMsg" rows="3">${esc(chave ? textoAviso(o, chave, '') : '')}</textarea></label>
      <label class="campo"><span><input type="checkbox" id="etAvisar" ${(o.cliente_fone || o.cliente_email) && chave ? 'checked' : ''}> Avisar o cliente</span></label></div>
    <div class="mt"><button class="btn pri" data-a="atEtapaOk" data-id="${o.id}" data-v="${etapa}">Confirmar</button></div>`, true);
}
async function atEtapaSalvar(id, etapa) {
  const o = AT.os.find(x => String(x.id) === String(id)), r = rmaAberto(o); if (!r) return avisar('Não achei o envio à assistência desta OS.');
  Object.assign(r, await ok(sb.from('at_rma').update({ etapa }).eq('id', r.id).select().single()));
  const msg = ($('#etMsg')?.value || '').trim();
  if ($('#etAvisar')?.checked && msg) await gerarAvisos(o, 'na_assistencia', '', msg, `${AT.cfg?.empresa || ''} · OS ${o.numero}: ${ETAPAS_ASSIST[etapa][0].replace(/^\S+\s/, '')}`);
  avisar(`OS ${o.numero}: ${ETAPAS_ASSIST[etapa][0].replace(/^\S+\s/, '')}.`); render(); atAbrir(o.id);
}
async function atAssEmail(nome, osId) {
  const email = ($('#assEmail')?.value || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return avisar('E-mail inválido.');
  const { data } = await sb.from('config').select('valor').eq('chave', 'assistencia').single();
  const valor = { ...data.valor, contatos_assistencias: { ...(data.valor.contatos_assistencias || {}), [nome]: { ...(data.valor.contatos_assistencias?.[nome] || {}), email } } };
  await ok(sb.from('config').update({ valor }).eq('chave', 'assistencia').select('chave'));
  AT.cfg = valor; avisar(`E-mail da ${nome} salvo: aprovado/recusado vai automático.`); atAbrir(osId);
}
