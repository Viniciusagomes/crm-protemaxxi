// ─── Leads Campanhas: listas de campanhas de venda no Meu dia ───
const CAMP = { lista: null, contatos: [], restricoes: {}, carregando: null, gravando: new Set() };
async function carregarCampanhas(forcar) {
  if (CAMP.lista && !forcar) return;
  if (CAMP.carregando) return CAMP.carregando;
  CAMP.carregando = Promise.all([
    ok(sb.from('campanhas_venda').select('*').order('id')),
    todas(() => sb.from('campanha_contatos').select('*').order('id')),
    ok(sb.rpc('campanha_restricoes')),
  ]).then(([l, c, r]) => { CAMP.lista = l; CAMP.contatos = c; CAMP.restricoes = Object.fromEntries(r.map(x => [x.contato_id, x])); }).finally(() => { CAMP.carregando = null; });
  return CAMP.carregando;
}
const campanhaAtiva = c => CAMP.lista?.find(l => l.id === c.campanha_id)?.ativa;
/** Pendentes do vendedor, só de campanhas ativas. */
const campPendentes = quem => (CAMP.contatos || []).filter(c => c.pessoa_id === quem && !c.resultado && campanhaAtiva(c));
function mensagemCampanha(c, vendedor) {
  const k = CAMP.lista?.find(l => l.id === c.campanha_id); if (!k) return '';
  const t = (c.ja_comprou && k.mensagem_recompra) || k.mensagem, [a, m] = String(c.compra_data || '').split('-');
  return t.replace('{ola}', saudacao(c.cliente_nome)).replace('{vendedor}', vendedor ? `o ${vendedor}, da Protemaxxi` : 'da Protemaxxi')
    .replace('{produto}', c.produto || '').replace('{quando}', a && m ? ` em ${m}/${a}` : '');
}
/** WhatsApp só se o cliente pode ser contatado e o número não está marcado como errado. */
function campBloqueio(c) {
  const r = CAMP.restricoes[c.id], f = c.celular ? foneNorm(c.celular) : '';
  if (r?.nao_contatar) return '🚫 Cliente pediu para não ser contatado';
  if (r?.pausa_ate) return `⏸ Contato pausado até ${fmtCurta(r.pausa_ate)}`;
  // cadastro ligado ou qualquer cadastro com o mesmo número
  const ks = (D.clientes || []).filter(x => x.chave === c.cliente_chave || (f && [x.fone, x.celular, x.telefone].some(t => t && foneNorm(t) === f)));
  if (ks.some(k => k.nao_contatar)) return '🚫 Cliente pediu para não ser contatado';
  const pausa = ks.find(k => contatoPausado(k));
  if (pausa) return `⏸ Contato pausado até ${fmtCurta(pausa.contato_pausa_ate)}`;
  if (f && TELF.lista?.some(t => t.telefone === f)) return '📵 Número marcado como errado';
  return '';
}
function linhaCampanha(c, vendedor) {
  const bloq = campBloqueio(c), msg = mensagemCampanha(c, vendedor), carregado = D.clientes && TELF.lista;
  const contato = bloq ? `<small class="c-med">${bloq}. Use "Pular".</small>`
    : !carregado ? ''
    : c.celular ? `<a class="btn pri peq" href="${linkWa(c.celular)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener" title="Abre o WhatsApp com a mensagem para revisar antes de enviar">💬 WhatsApp</a>`
    : c.email && CAMP.restricoes[c.id]?.nao_email ? '<small class="c-med">Cliente não recebe e-mail</small>'
    : c.email ? `<a class="btn peq" href="mailto:${esc(c.email)}?subject=${encodeURIComponent('Protemaxxi')}&body=${encodeURIComponent(msg)}" title="Abre seu e-mail com a mensagem para revisar antes de enviar">✉ E-mail</a>` : '<small class="c-med">sem contato</small>';
  return `<div class="atv" style="flex-wrap:wrap"><div style="flex:1;min-width:220px"><b>${c.cliente_chave ? `<a href="#" data-a="verCliente" data-chave="${esc(c.cliente_chave)}">${esc(c.cliente_nome)}</a>` : esc(c.cliente_nome)}</b> <small class="mut">${esc(c.cidade || '')}</small>
      ${c.ja_comprou ? '<span class="tag ok">Já comprou</span>' : ''}<br><small>${esc(c.produto || '')}${c.compra_data ? ' · ' + fmtCurta(c.compra_data) : ''}${c.celular ? '' : c.email ? ' · ' + esc(c.email) : ''}</small></div>
    ${contato}<div class="pro-res" style="width:100%">${Object.entries(RES_PRO).map(([k, n]) => `<button class="chip ${c.resultado === k ? 'on' : ''}" data-a="campRes" data-id="${c.id}" data-v="${k}">${n}</button>`).join('')}</div></div>`;
}
function blocoCampanhasDia(quem) {
  if (!CAMP.lista) { carregarCampanhas().then(render).catch(e => avisar(e.message)); return '<div class="card vazio mt">Carregando as campanhas…</div>'; }
  if (!TELF.lista && !TELF.carregando) carregarTelErrados().then(render).catch(() => {});
  const vend = pessoa(quem)?.nome?.split(' ')[0] || '', ver = UI.campFiltro || 'pendentes';
  const cards = CAMP.lista.filter(k => k.ativa || ehDono()).map(k => {
    const todos = CAMP.contatos.filter(c => c.campanha_id === k.id && c.pessoa_id === quem), pend = todos.filter(c => !c.resultado);
    const l = ver === 'pendentes' ? pend : todos.filter(c => c.resultado);
    if (!todos.length && !ehDono()) return '';
    return `<div class="card mt"><div class="secao-titulo"><h2>📣 ${esc(k.nome)}${k.ativa ? '' : ' <span class="tag med">Pausada</span>'}</h2><small>${todos.length - pend.length} de ${todos.length} contatados${ehDono() ? ` · <a href="#" data-a="campPausar" data-id="${k.id}">${k.ativa ? 'pausar' : 'reativar'}</a>` : ''}</small></div>
      ${l.slice(0, 60).map(c => linhaCampanha(c, vend)).join('') || `<div class="vazio">${ver === 'pendentes' ? 'Nenhum contato pendente. 👏' : 'Nenhum contato registrado ainda.'}</div>`}${l.length > 60 ? `<small class="mut">Mostrando 60 de ${l.length}. Registre estes para ver os próximos.</small>` : ''}</div>`;
  }).join('');
  return `<div class="filtros mt"><div class="chips"><button class="chip ${ver === 'pendentes' ? 'on' : ''}" data-a="campFiltro" data-v="pendentes">Pendentes</button><button class="chip ${ver === 'feitos' ? 'on' : ''}" data-a="campFiltro" data-v="feitos">Registrados</button></div>
    ${ehDono() ? '<button class="btn peq pri" data-a="campNova">+ Nova campanha</button>' : ''}</div>
    <p class="explica">Listas das campanhas de venda. Confira a mensagem antes de enviar e registre o resultado de cada contato.</p>
    ${cards || '<div class="card vazio mt">Nenhuma campanha para este vendedor.</div>'}`;
}
async function campRes(id, res) {
  const c = CAMP.contatos.find(x => String(x.id) === String(id)); if (!c || CAMP.gravando.has(c.id)) return;
  const novo = c.resultado === res ? null : res, anterior = c.interacao_id;
  CAMP.gravando.add(c.id);
  try {
    const r = await ok(sb.rpc('campanha_registrar', { p_id: c.id, p_resultado: novo, p_esperado: c.resultado || null }));
    Object.assign(c, r.contato);
    const velha = D.interacoes.find(i => i.id === anterior); if (velha) velha.feito = true;
    if (r.interacao && !D.interacoes.some(i => i.id === r.interacao.id)) D.interacoes.unshift(r.interacao);
    if (novo === 'numero_errado' || res === 'numero_errado') await carregarTelErrados(true);
    avisar(r.interacao?.proximo_contato ? `Salvo. Retorno marcado para ${fmtCurta(r.interacao.proximo_contato)}.` : 'Resultado salvo.');
    render();
  } finally { CAMP.gravando.delete(c.id); }
}
async function campPausar(id) {
  const k = CAMP.lista.find(x => String(x.id) === String(id)); if (!k) return;
  Object.assign(k, await ok(sb.from('campanhas_venda').update({ ativa: !k.ativa }).eq('id', k.id).select().single()));
  render();
}
/** Linha colada: nome; celular; e-mail; produto. */
function lerContatosCampanha(texto) {
  return String(texto || '').split(/\r?\n/).map(l => l.split(/[;\t]/).map(x => x.trim())).filter(p => p[0])
    .map(([nome, cel, email, produto]) => ({ cliente_nome: nome, celular: (cel || '').replace(/\D/g, '') || null, email: email || null, produto: produto || null }));
}
function campNova() {
  const vends = D.pessoas.filter(p => p.ativo && p.tiny);
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>📣 Nova campanha</h2>
    <div class="form-grid"><label>Nome da campanha<input id="cnNome" placeholder="Ex.: Fonte 12V"></label>
      <label>Vendedor destes contatos<select id="cnVend">${vends.map(v => `<option value="${v.id}">${esc(v.nome)}</option>`).join('')}</select></label></div>
    <label>Mensagem (a pessoa revisa antes de enviar)<textarea id="cnMsg" rows="3">{ola} Aqui é {vendedor}. Você comprou {produto} com a gente{quando}. </textarea></label>
    <label>Contatos, um por linha: nome; celular; e-mail; produto<textarea id="cnLista" rows="6"></textarea></label>
    <div class="acoes mt"><button class="btn pri" data-a="campNovaSalvar">Criar campanha</button></div>`);
}
async function campNovaSalvar() {
  const nome = $('#cnNome').value.trim(), mensagem = $('#cnMsg').value.trim(), pessoa_id = $('#cnVend').value, lista = lerContatosCampanha($('#cnLista').value);
  if (!nome || !mensagem) return avisar('Preencha o nome e a mensagem.');
  if (!lista.length) return avisar('Cole ao menos um contato.');
  if (!D.clientes) await carregarClientes();
  // liga ao cadastro pelo número; sem cadastro, usa a chave por nome (a mesma do funil), para ter histórico e retorno
  const ligar = c => { const f = c.celular ? foneNorm(c.celular) : '', k = f && D.clientes.find(x => [x.fone, x.celular, x.telefone].some(t => t && foneNorm(t) === f));
    return { ...c, cliente_chave: k?.chave || 'n:' + semAcento(c.cliente_nome).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }; };
  const k = await ok(sb.from('campanhas_venda').insert({ nome, mensagem }).select().single());
  await ok(sb.from('campanha_contatos').insert(lista.map(c => ({ ...ligar(c), campanha_id: k.id, pessoa_id }))));
  fecharModal(); await carregarCampanhas(true); avisar('Campanha criada.'); render();
}
