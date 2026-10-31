'use strict';
/* Intranet Protemaxxi — Compras e Portal do fornecedor (Fase 8).
   A equipe de compras publica uma oportunidade (itens vindos da cotação), convida fornecedores pelo link do portal
   (fornecedor.html) e compara as propostas lado a lado. Cada fornecedor só vê a própria proposta (regras no banco: forn_*).
   A ordem de compra no Tiny fica só preparada: o botão fica desligado até o Vinícius aprovar a integração. */

const COMP = { ops: null, itens: [], conv: [], props: [], pitens: [], forn: [], convites: [], carregando: false, em: 0 };
const ST_OP = { rascunho: ['📝 Rascunho', ''], aberta: ['🟢 Recebendo propostas', 'ok'], encerrada: ['⏹ Prazo encerrado', 'med'], concluida: ['🏆 Vencedor escolhido', 'azul'], cancelada: ['🚫 Cancelada', 'ruim'] };
const veCompras = () => ehDono() || !!EU?.permissoes?.compras || ['compra', 'cotacao'].some(k => Array.isArray(D?.config?.solicitacoes?.[k]) && D.config.solicitacoes[k].includes(EU?.id));
const situacaoOp = o => o.status === 'aberta' && o.prazo_resposta && new Date(o.prazo_resposta) <= new Date() ? 'encerrada' : o.status;
const linkPortal = q => new URL('fornecedor.html?' + q, location.href).href;
const fornDe = id => COMP.forn.find(f => f.id === id);
const dtHoraOp = s => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const tokenNovo = () => [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');

async function carregarCompras(forcar) {
  if (COMP.carregando || (!forcar && COMP.ops && Date.now() - COMP.em < 60e3)) return;
  COMP.carregando = true;
  try {
    const [ops, itens, conv, props, pitens, forn, convites] = await Promise.all([
      ok(sb.from('oportunidades').select('*').order('criado_em', { ascending: false }).limit(300)),
      todas(() => sb.from('op_itens').select('*').order('ordem')),
      todas(() => sb.from('op_fornecedores').select('*')),
      todas(() => sb.from('propostas').select('*')),
      todas(() => sb.from('proposta_itens').select('*')),
      ok(sb.from('fornecedores').select('*').order('nome')),
      ok(sb.from('forn_convites').select('*').order('criado_em', { ascending: false }).limit(200)),
    ]);
    Object.assign(COMP, { ops, itens, conv, props, pitens, forn, convites, em: Date.now() });
  } finally { COMP.carregando = false; }
}
const propostasNovas = () => COMP.ops ? COMP.props.filter(p => p.status === 'enviada' && ['aberta', 'encerrada'].includes(situacaoOp(COMP.ops.find(o => o.id === p.oportunidade_id) || {}))).length : 0;

// ─── tela ───
function vCompras() {
  if (!COMP.ops) { if (!COMP.carregando) carregarCompras().then(render).catch(e => avisar(e.message)); return topo('Compras e fornecedores', '') + '<div class="card vazio">Carregando…</div>'; }
  const aba = UI.compAba || 'ops';
  const abertas = COMP.ops.filter(o => situacaoOp(o) === 'aberta'), decidir = COMP.ops.filter(o => situacaoOp(o) === 'encerrada');
  const ativos = COMP.forn.filter(f => f.status === 'ativo'), pendConv = COMP.convites.filter(c => !c.usado_em && new Date(c.expira_em) > new Date());
  const chips = [['ops', 'Oportunidades', abertas.length + decidir.length], ['forn', 'Fornecedores', ativos.length], ['conv', 'Convites', pendConv.length]];
  return topo('Compras e fornecedores', 'Peça preços a vários fornecedores pelo portal, compare lado a lado e escolha o vencedor. Cada fornecedor vê só a própria proposta.',
      `<button class="btn" data-a="compAtualizar">↻ Atualizar</button><button class="btn" data-a="compConvite">+ Convidar fornecedor</button><button class="btn pri" data-a="compNovaOp">+ Nova oportunidade</button>`)
    + `<div class="grid g4">
      <div class="card kpi-card destaque"><div class="rot">Recebendo propostas</div><div class="val verde">${abertas.length}</div><div class="sub">oportunidade(s) no portal</div></div>
      <div class="card kpi-card"><div class="rot">Para decidir</div><div class="val ${decidir.length ? 'c-med' : ''}">${decidir.length}</div><div class="sub">prazo encerrado, falta escolher</div></div>
      <div class="card kpi-card"><div class="rot">Propostas recebidas</div><div class="val">${propostasNovas()}</div><div class="sub">em oportunidades ainda sem vencedor</div></div>
      <div class="card kpi-card"><div class="rot">Fornecedores ativos</div><div class="val">${ativos.length}</div><div class="sub">${pendConv.length} convite(s) aguardando cadastro</div></div></div>
    <div class="filtros mt"><div class="chips">${chips.map(([k, n, q]) => `<button class="chip ${aba === k ? 'on' : ''}" data-a="compAba" data-v="${k}">${n}<span class="n">${q}</span></button>`).join('')}</div></div>
    ${aba === 'forn' ? abaFornecedores() : aba === 'conv' ? abaConvites() : abaOportunidades()}`;
}

function totaisProposta(p) {
  const its = COMP.itens.filter(i => i.oportunidade_id === p.oportunidade_id), pis = COMP.pitens.filter(x => x.proposta_id === p.id);
  let produtos = 0, cotados = 0;
  for (const i of its) { const x = pis.find(y => y.item_id === i.id); if (x?.disponivel && +x.preco_unit > 0) { produtos += +x.preco_unit * +i.quantidade; cotados++; } }
  return { produtos, frete: +p.frete || 0, total: produtos + (+p.frete || 0), cotados, itens: its.length };
}
function abaOportunidades() {
  const linha = o => {
    const st = situacaoOp(o), conv = COMP.conv.filter(c => c.oportunidade_id === o.id), env = COMP.props.filter(p => p.oportunidade_id === o.id && p.status === 'enviada');
    const comp = env.map(totaisProposta).filter(t => t.cotados === t.itens), melhor = comp.length ? Math.min(...comp.map(t => t.total)) : null;
    return `<tr class="clic" data-a="compVerOp" data-id="${o.id}"><td><small>#${o.id}</small></td><td><b>${esc(o.titulo)}</b>${o.solicitacao_id ? `<br><small class="mut">da solicitação #${o.solicitacao_id}</small>` : ''}</td>
      <td><span class="tag ${ST_OP[st][1]}">${ST_OP[st][0]}</span></td><td class="cen">${COMP.itens.filter(i => i.oportunidade_id === o.id).length}</td>
      <td class="cen">${env.length} / ${conv.length}</td><td><small>${o.prazo_resposta ? dtHoraOp(o.prazo_resposta) : '—'}</small></td><td class="dir">${melhor != null ? R(melhor) : '—'}</td></tr>`;
  };
  return `<div class="card mt">${COMP.ops.length ? listaCurta('compOps', `<table class="tabela"><thead><tr><th>#</th><th>Oportunidade</th><th>Situação</th><th class="cen">Itens</th><th class="cen" title="propostas enviadas / fornecedores convidados">Propostas</th><th>Prazo p/ responder</th><th class="dir">Melhor total</th></tr></thead><tbody>${COMP.ops.map(linha).join('')}</tbody></table>`, 'Buscar oportunidade…')
    : '<div class="vazio">Nenhuma oportunidade ainda. Crie pelo botão "+ Nova oportunidade" ou, numa solicitação de cotação, clique em "🌐 Pedir propostas no portal".</div>'}</div>`;
}
function abaFornecedores() {
  const linha = f => {
    const conv = COMP.conv.filter(c => c.fornecedor_id === f.id).length, env = COMP.props.filter(p => p.fornecedor_id === f.id && p.status === 'enviada'), venc = env.filter(p => p.vencedora).length;
    return `<tr class="clic" data-a="compVerForn" data-id="${f.id}"><td><b>${esc(f.nome)}</b><br><small class="mut">${esc(fmtDoc(f.cnpj))}</small></td><td><small>${esc([f.contato, f.whatsapp, f.email].filter(Boolean).join(' · '))}</small></td>
      <td><small>${esc((f.marcas || []).join(', '))}</small></td><td class="cen">${conv}</td><td class="cen">${env.length}${conv ? ` <small class="mut">(${P(env.length / conv)})</small>` : ''}</td><td class="cen">${venc}</td>
      <td><small>${f.ultimo_acesso ? dtHoraOp(f.ultimo_acesso) : 'nunca'}</small></td><td>${f.status === 'ativo' ? '<span class="tag ok">Ativo</span>' : '<span class="tag ruim">Bloqueado</span>'}</td></tr>`;
  };
  return `<div class="card mt"><div class="secao-titulo"><h2>Fornecedores</h2><button class="btn peq" data-a="compFornNovo">+ Cadastrar direto</button></div>
    ${COMP.forn.length ? listaCurta('compForn', `<table class="tabela"><thead><tr><th>Fornecedor</th><th>Contato</th><th>Marcas</th><th class="cen">Convites</th><th class="cen">Respondeu</th><th class="cen">Venceu</th><th>Último acesso</th><th></th></tr></thead><tbody>${COMP.forn.map(linha).join('')}</tbody></table>`, 'Buscar nome, CNPJ, marca…')
      : '<div class="vazio">Nenhum fornecedor ainda. Mande um convite (o fornecedor preenche o próprio cadastro) ou cadastre direto.</div>'}</div>`;
}
const fmtDoc = d => { const x = String(d || '').replace(/\D/g, ''); return x.length === 14 ? x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : x; };
function abaConvites() {
  const agora = new Date();
  const linha = c => { const st = c.usado_em ? `<span class="tag ok">Cadastrado</span> <small>${esc(fornDe(c.fornecedor_id)?.nome || '')}</small>` : new Date(c.expira_em) < agora ? '<span class="tag ruim">Vencido</span>' : `<span class="tag med">Aguardando</span> <small class="mut">vence ${dtHoraOp(c.expira_em)}</small>`;
    return `<tr><td><b>${esc(c.nome || '—')}</b><br><small class="mut">${esc([fmtDoc(c.cnpj), c.whatsapp, c.email].filter(Boolean).join(' · '))}</small></td><td><small>${esc((c.marcas || []).join(', '))}</small></td><td><small>${esc(nomeP(c.criado_por))} · ${dtHoraOp(c.criado_em)}</small></td><td>${st}</td>
      <td class="dir">${!c.usado_em && new Date(c.expira_em) > agora ? `<button class="btn peq" data-a="compConviteLink" data-id="${c.id}">🔗 Link</button> ` : ''}${!c.usado_em ? `<button class="btn peq" data-a="compConviteApagar" data-id="${c.id}">Apagar</button>` : ''}</td></tr>`; };
  return `<div class="card mt"><div class="secao-titulo"><h2>Convites de cadastro</h2><small>o link vale 14 dias e só pode ser usado uma vez</small></div>
    ${COMP.convites.length ? listaCurta('compConv', `<table class="tabela"><thead><tr><th>Para</th><th>Marcas</th><th>Criado por</th><th>Situação</th><th></th></tr></thead><tbody>${COMP.convites.map(linha).join('')}</tbody></table>`, 'Buscar…') : '<div class="vazio">Nenhum convite ainda.</div>'}</div>`;
}

// ─── oportunidade: criar / editar ───
/** "10 x Câmera VHD 1220 B" → { quantidade: 10, descricao: 'Câmera VHD 1220 B' }; linha sem número = 1 unidade. */
function lerItensTexto(txt) {
  return String(txt || '').split(/\n/).map(l => l.replace(/^[\s\-•*]+/, '').trim()).filter(Boolean).map(l => {
    const m = l.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|un\.?|unid\.?|pç|pc|cx)?\s+(.+)$/i) || l.match(/^(.+?)\s*[-–:;]\s*(\d+(?:[.,]\d+)?)\s*(?:un\.?|unid\.?|pç|pc|cx)?$/i);
    if (!m) return { quantidade: 1, descricao: l.slice(0, 300) };
    const [q, d] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    return { quantidade: Number(q.replace(',', '.')) || 1, descricao: d.trim().slice(0, 300) };
  });
}
const itensParaTexto = its => its.map(i => `${N(+i.quantidade)} x ${i.descricao}${i.produto_codigo ? ` [${i.produto_codigo}]` : ''}`).join('\n');
/** Sugere fornecedores pelas marcas citadas nos itens. */
function fornSugeridos(texto) {
  const t = semAcento(texto).toLowerCase();
  return COMP.forn.filter(f => f.status === 'ativo' && (f.marcas || []).some(m => m && t.includes(semAcento(m).toLowerCase()))).map(f => f.id);
}
async function formOportunidade(opId, solId) {
  await carregarCompras();
  const o = opId ? COMP.ops.find(x => x.id === +opId) : null, s = solId ? D.solicitacoes.find(x => x.id === +solId) : null;
  let titulo = o?.titulo || '', descricao = o?.descricao || '', itensTxt = o ? itensParaTexto(COMP.itens.filter(i => i.oportunidade_id === o.id)) : '';
  if (s) {
    titulo = s.titulo; descricao = s.descricao || '';
    itensTxt = s.tipo === 'compra' ? `${s.dados?.quantidade || 1} x ${s.dados?.produto || s.titulo}${s.dados?.codigo ? ` [${s.dados.codigo}]` : ''}` : s.dados?.itens || '';
  }
  const prazoPadrao = (() => { const d = new Date(Date.now() + 2 * 864e5); d.setHours(17, 0, 0, 0); return d; })();
  const prazo = o?.prazo_resposta ? new Date(o.prazo_resposta) : prazoPadrao;
  const local = d => `${ds(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sel = new Set(o ? COMP.conv.filter(c => c.oportunidade_id === o.id).map(c => c.fornecedor_id) : fornSugeridos(itensTxt + ' ' + titulo));
  const ativos = COMP.forn.filter(f => f.status === 'ativo');
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>${o ? 'Editar oportunidade' : '🌐 Nova oportunidade de compra'}</h2>
    <p class="mut">Os fornecedores convidados veem o título, os itens e as condições. <b>Não coloque</b> nome de cliente, preço de venda nem nada interno.</p>
    <div class="form-grid">
      <label class="campo inteiro">Título *<input type="text" id="opTitulo" maxlength="200" value="${esc(titulo)}" placeholder="Ex.: Câmeras Intelbras para reposição"></label>
      <label class="campo inteiro">Itens * <small class="mut">(um por linha: <b>quantidade x descrição</b>; código entre colchetes, opcional)</small><textarea id="opItens" rows="6" placeholder="10 x Câmera Intelbras VHD 1220 B G7 [4565301]&#10;2 x DVR MHDX 1208">${esc(itensTxt)}</textarea></label>
      <label class="campo inteiro">Especificações / observações para o fornecedor<textarea id="opDesc" rows="2">${esc(descricao)}</textarea></label>
      <label class="campo">Condição de pagamento<input type="text" id="opPag" value="${esc(o?.pagamento || '')}" placeholder="Ex.: boleto 28 dias"></label>
      <label class="campo">Entrega<input type="text" id="opEnt" value="${esc(o?.entrega || '')}" placeholder="Ex.: CIF Campinas-SP"></label>
      <label class="campo">Responder até *<input type="datetime-local" id="opPrazo" value="${local(prazo)}"></label>
      <div class="campo inteiro">Convidar <small class="mut">(já marcados os que atendem as marcas citadas)</small>
        ${ativos.length ? `<div class="pessoas-multi" id="opForn">${ativos.map(f => `<label title="${esc((f.marcas || []).join(', '))}"><input type="checkbox" value="${f.id}" ${sel.has(f.id) ? 'checked' : ''}>${esc(f.nome)}</label>`).join('')}</div>` : '<p class="mut">Nenhum fornecedor cadastrado ainda: depois de salvar, use "+ Convidar fornecedor".</p>'}</div>
    </div>
    <div class="acoes mt"><button class="btn" data-a="compSalvarOp" data-id="${o?.id || ''}" data-sol="${s?.id || o?.solicitacao_id || ''}">Salvar rascunho</button><button class="btn pri" data-a="compSalvarOp" data-pub="1" data-id="${o?.id || ''}" data-sol="${s?.id || o?.solicitacao_id || ''}">Salvar e publicar</button></div>`, true);
}
async function salvarOportunidade(el) {
  const v = id => ($('#' + id)?.value || '').trim(), publicar = !!el.dataset.pub, id = +el.dataset.id || null;
  const titulo = v('opTitulo'), itens = lerItensTexto(v('opItens')).map((i, n) => { const c = i.descricao.match(/\[([^\]]+)\]\s*$/); return { ...i, ordem: n + 1, descricao: c ? i.descricao.replace(/\s*\[[^\]]+\]\s*$/, '') : i.descricao, produto_codigo: c ? c[1].trim() : null }; });
  const prazo = v('opPrazo') ? new Date(v('opPrazo')) : null;
  if (titulo.length < 3) return avisar('Escreva o título.');
  if (!itens.length) return avisar('Coloque pelo menos um item.');
  if (!prazo || prazo <= new Date()) return avisar('O prazo para responder precisa ser no futuro.');
  const forn = [...document.querySelectorAll('#opForn input:checked')].map(x => +x.value);
  if (publicar && !forn.length) return avisar('Marque pelo menos um fornecedor para publicar.');
  if (id && COMP.props.some(p => p.oportunidade_id === id)) return avisar('Já há propostas: os itens não podem mais mudar. Crie outra oportunidade.');
  const dados = { titulo, descricao: v('opDesc') || null, pagamento: v('opPag') || null, entrega: v('opEnt') || null, prazo_resposta: prazo.toISOString(), solicitacao_id: +el.dataset.sol || null, ...(publicar ? { status: 'aberta' } : {}) };
  el.disabled = true;
  try {
    const o = id ? await ok(sb.from('oportunidades').update(dados).eq('id', id).select().single()) : await ok(sb.from('oportunidades').insert({ ...dados, criado_por: EU.id }).select().single());
    if (id) await ok(sb.from('op_itens').delete().eq('oportunidade_id', id));
    await ok(sb.from('op_itens').insert(itens.map(i => ({ ...i, oportunidade_id: o.id }))));
    const ja = COMP.conv.filter(c => c.oportunidade_id === o.id).map(c => c.fornecedor_id);
    const novos = forn.filter(f => !ja.includes(f)), tirar = ja.filter(f => !forn.includes(f));
    if (novos.length) await ok(sb.from('op_fornecedores').insert(novos.map(f => ({ oportunidade_id: o.id, fornecedor_id: f, convidado_por: EU.id }))));
    if (tirar.length) await ok(sb.from('op_fornecedores').delete().eq('oportunidade_id', o.id).in('fornecedor_id', tirar));
    if (o.solicitacao_id && !id && typeof registrarSistema === 'function') await registrarSistema(o.solicitacao_id, `${EU.nome} pediu propostas no portal do fornecedor (oportunidade #${o.id})`).catch(() => {});
    await carregarCompras(true); UI.view = 'compras'; UI.compAba = 'ops';
    avisar(publicar ? 'Publicada: agora mande o link para cada fornecedor.' : 'Rascunho salvo.'); render(); verOportunidade(o.id);
  } catch (e) { el.disabled = false; avisar(e.message); }
}

// ─── oportunidade: detalhe, convites e comparativo ───
function verOportunidade(id) {
  const o = COMP.ops.find(x => x.id === +id); if (!o) return;
  const st = situacaoOp(o), its = COMP.itens.filter(i => i.oportunidade_id === o.id), conv = COMP.conv.filter(c => c.oportunidade_id === o.id);
  const props = COMP.props.filter(p => p.oportunidade_id === o.id), env = props.filter(p => p.status === 'enviada');
  const podeMexer = ['rascunho', 'aberta', 'encerrada'].includes(st);
  const linhaConv = c => { const f = fornDe(c.fornecedor_id) || {}, p = props.find(x => x.fornecedor_id === c.fornecedor_id);
    const sit = p?.status === 'enviada' ? `<span class="tag ok">✓ Enviou ${dtHoraOp(p.enviada_em)}</span>` : p ? '<span class="tag med">Rascunho</span>' : c.visto_em ? `<span class="tag azul">Viu ${dtHoraOp(c.visto_em)}</span>` : '<span class="tag">Não abriu</span>';
    return `<tr><td><b>${esc(f.nome || '?')}</b><br><small class="mut">${esc((f.marcas || []).join(', '))}</small></td><td>${sit}</td><td class="dir">${st !== 'rascunho' && f.token ? botoesLinkForn(f, o) : ''}${st === 'rascunho' || (!p && podeMexer) ? ` <button class="btn peq" data-a="compTirarConv" data-op="${o.id}" data-f="${f.id}">Tirar</button>` : ''}</td></tr>`; };
  const fora = COMP.forn.filter(f => f.status === 'ativo' && !conv.some(c => c.fornecedor_id === f.id));
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button>
    <small class="mut">#${o.id} · criada por ${esc(nomeP(o.criado_por))} em ${dtHoraOp(o.criado_em)}${o.solicitacao_id ? ` · da <a href="#" data-a="verSolicitacao" data-id="${o.solicitacao_id}">solicitação #${o.solicitacao_id}</a>` : ''}</small>
    <h2 style="margin-top:4px">${esc(o.titulo)} <span class="tag ${ST_OP[st][1]}">${ST_OP[st][0]}</span></h2>
    <p class="mut">Responder até <b>${dtHoraOp(o.prazo_resposta)}</b>${o.pagamento ? ` · Pagamento: ${esc(o.pagamento)}` : ''}${o.entrega ? ` · Entrega: ${esc(o.entrega)}` : ''}</p>
    ${o.descricao ? `<p style="white-space:pre-wrap">${esc(o.descricao)}</p>` : ''}
    <div class="acoes">${st === 'rascunho' ? `<button class="btn" data-a="compEditarOp" data-id="${o.id}">✏️ Editar</button><button class="btn pri" data-a="compStatusOp" data-id="${o.id}" data-v="aberta">🌐 Publicar</button>` : ''}
      ${st === 'aberta' ? `<button class="btn" data-a="compStatusOp" data-id="${o.id}" data-v="encerrar">⏹ Encerrar agora</button>` : ''}
      ${['aberta', 'encerrada'].includes(st) ? `<label class="campo" style="display:inline-flex;gap:6px;align-items:center;margin:0">Novo prazo <input type="datetime-local" id="opNovoPrazo"></label><button class="btn" data-a="compPrazoOp" data-id="${o.id}">Prorrogar</button>` : ''}
      ${podeMexer ? `<button class="btn" data-a="compStatusOp" data-id="${o.id}" data-v="cancelada">Cancelar oportunidade</button>` : ''}</div>
    <h3 class="mt2">Itens (${its.length})</h3>
    <table class="tabela"><thead><tr><th>#</th><th>Descrição</th><th>Código</th><th class="dir">Qtd</th></tr></thead><tbody>${its.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.descricao)}${i.especificacao ? `<br><small class="mut">${esc(i.especificacao)}</small>` : ''}</td><td><small>${esc(i.produto_codigo || '')}</small></td><td class="dir">${N(+i.quantidade)} ${esc(i.unidade)}</td></tr>`).join('')}</tbody></table>
    <h3 class="mt2">Fornecedores convidados (${conv.length})</h3>
    ${conv.length ? `<table class="tabela"><tbody>${conv.map(linhaConv).join('')}</tbody></table>` : '<p class="mut">Ninguém convidado ainda.</p>'}
    ${podeMexer && fora.length ? `<div class="acoes mt"><select id="opAddForn"><option value="">+ Convidar mais um fornecedor…</option>${fora.map(f => `<option value="${f.id}">${esc(f.nome)}${f.marcas?.length ? ' — ' + esc(f.marcas.join(', ')) : ''}</option>`).join('')}</select><button class="btn" data-a="compAddConv" data-op="${o.id}">Convidar</button></div>` : ''}
    ${st === 'rascunho' ? '<p class="explica mt">ℹ️ Os links para os fornecedores aparecem depois de publicar.</p>' : ''}
    <h3 class="mt2">Comparativo ${env.length ? `(${env.length} proposta${env.length > 1 ? 's' : ''})` : ''}</h3>
    ${comparativo(o, its, env, st)}
    ${st === 'concluida' ? blocoOrdemCompra(o, its, env.find(p => p.vencedora)) : ''}`, true);
}
function botoesLinkForn(f, o) {
  const link = linkPortal(f.user_id ? `o=${o.id}` : `t=${f.token}&o=${o.id}`), zap = String(f.whatsapp || '').replace(/\D/g, '');
  const texto = `Olá${f.contato ? ', ' + f.contato.split(' ')[0] : ''}! A Protemaxxi está pedindo preço de ${o.titulo}. Mande sua proposta até ${dtHoraOp(o.prazo_resposta)} por este link${f.user_id ? ' (entre com seu e-mail e senha)' : ' (é só seu, não compartilhe)'}: ${link}`;
  return `<button class="btn peq" data-a="compCopiar" data-v="${esc(link)}" title="Copiar o link exclusivo deste fornecedor">📋 Link</button>
    <a class="btn peq" href="https://wa.me/${zap ? (zap.length > 11 ? zap : '55' + zap) : ''}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">💬 WhatsApp</a>
    ${f.email ? `<a class="btn peq" href="mailto:${esc(f.email)}?subject=${encodeURIComponent('Pedido de cotação — ' + o.titulo)}&body=${encodeURIComponent(texto)}">✉ E-mail</a>` : ''}`;
}
function comparativo(o, its, env, st) {
  if (!env.length) return `<p class="mut">${st === 'rascunho' ? 'Publique e mande os links para começar a receber propostas.' : 'Nenhuma proposta enviada ainda. Os fornecedores podem salvar rascunho; aqui só aparecem as enviadas.'}</p>`;
  const cols = env.map(p => ({ p, f: fornDe(p.fornecedor_id) || {}, t: totaisProposta(p), pis: COMP.pitens.filter(x => x.proposta_id === p.id) }));
  const preco = (c, i) => { const x = c.pis.find(y => y.item_id === i.id); return x?.disponivel && +x.preco_unit > 0 ? +x.preco_unit : null; };
  const completos = cols.filter(c => c.t.cotados === c.t.itens);
  const melhorTotal = completos.length ? Math.min(...completos.map(c => c.t.total)) : null;
  const prazos = cols.map(c => c.p.prazo_entrega_dias).filter(x => x != null), melhorPrazo = prazos.length ? Math.min(...prazos) : null;
  const decidir = ['aberta', 'encerrada'].includes(st);
  return `<div class="rolagem"><table class="tabela comparativo"><thead><tr><th>Item</th>${cols.map(c => `<th class="dir ${c.p.vencedora ? 'vencedor' : ''}">${c.p.vencedora ? '🏆 ' : ''}${esc(c.f.nome || '?')}<br><small class="mut">enviada ${dtHoraOp(c.p.enviada_em)}</small></th>`).join('')}</tr></thead><tbody>
    ${its.map(i => { const ps = cols.map(c => preco(c, i)), min = ps.some(x => x != null) ? Math.min(...ps.filter(x => x != null)) : null;
      return `<tr><td>${esc(i.descricao)}<br><small class="mut">${N(+i.quantidade)} ${esc(i.unidade)}</small></td>${cols.map((c, k) => { const x = c.pis.find(y => y.item_id === i.id);
        return `<td class="dir ${ps[k] != null && ps[k] === min && cols.length > 1 ? 'melhor' : ''} ${c.p.vencedora ? 'vencedor' : ''}">${ps[k] != null ? `<b>${R(ps[k])}</b><br><small>${R(ps[k] * +i.quantidade)}</small>` : '<small class="c-ruim">não cotou</small>'}${x?.marca_modelo ? `<br><small class="mut">${esc(x.marca_modelo)}</small>` : ''}${x?.obs ? `<br><small class="mut">${esc(x.obs)}</small>` : ''}</td>`; }).join('')}</tr>`; }).join('')}
    <tr><td class="mut">Produtos</td>${cols.map(c => `<td class="dir ${c.p.vencedora ? 'vencedor' : ''}">${R(c.t.produtos)}${c.t.cotados < c.t.itens ? `<br><small class="c-med">cotou ${c.t.cotados} de ${c.t.itens}</small>` : ''}</td>`).join('')}</tr>
    <tr><td class="mut">Frete</td>${cols.map(c => `<td class="dir ${c.p.vencedora ? 'vencedor' : ''}">${c.t.frete ? R(c.t.frete) : 'grátis'}</td>`).join('')}</tr>
    <tr class="total"><td><b>Total</b></td>${cols.map(c => `<td class="dir ${c.t.cotados === c.t.itens && c.t.total === melhorTotal && cols.length > 1 ? 'melhor' : ''} ${c.p.vencedora ? 'vencedor' : ''}"><b>${R(c.t.total)}</b></td>`).join('')}</tr>
    <tr><td class="mut">Prazo de entrega</td>${cols.map(c => `<td class="dir ${c.p.prazo_entrega_dias === melhorPrazo && cols.length > 1 ? 'melhor' : ''} ${c.p.vencedora ? 'vencedor' : ''}">${c.p.prazo_entrega_dias != null ? c.p.prazo_entrega_dias + ' dia(s)' : '—'}</td>`).join('')}</tr>
    <tr><td class="mut">Pagamento</td>${cols.map(c => `<td class="dir"><small>${esc(c.p.pagamento || '—')}</small></td>`).join('')}</tr>
    <tr><td class="mut">Validade</td>${cols.map(c => `<td class="dir"><small>${c.p.validade ? fmtCurta(c.p.validade) : '—'}</small></td>`).join('')}</tr>
    ${cols.some(c => c.p.obs) ? `<tr><td class="mut">Observações</td>${cols.map(c => `<td class="dir"><small>${esc(c.p.obs || '')}</small></td>`).join('')}</tr>` : ''}
    <tr><td></td>${cols.map(c => `<td class="dir">${decidir ? `<button class="btn peq pri" data-a="compVencedor" data-op="${o.id}" data-p="${c.p.id}">🏆 Escolher</button>` : c.p.vencedora && st === 'concluida' ? `<button class="btn peq" data-a="compVencedor" data-op="${o.id}" data-p="">Desfazer escolha</button>` : ''}</td>`).join('')}</tr>
    </tbody></table></div><p class="mut" style="font-size:12.5px">Verde = melhor preço do item, menor total (só entre quem cotou todos os itens) e menor prazo.</p>`;
}
/** Prévia da ordem de compra no Tiny: só preparada, o envio depende da aprovação do Vinícius. */
function blocoOrdemCompra(o, its, p) {
  if (!p) return '';
  const f = fornDe(p.fornecedor_id) || {}, pis = COMP.pitens.filter(x => x.proposta_id === p.id), t = totaisProposta(p);
  const linhas = its.map(i => ({ i, x: pis.find(y => y.item_id === i.id) })).filter(({ x }) => x?.disponivel && +x.preco_unit > 0);
  return `<div class="card mt"><div class="secao-titulo"><h2>📄 Ordem de compra (prévia)</h2><small>vencedor: <b>${esc(f.nome || '')}</b> · ${fmtDoc(f.cnpj)}</small></div>
    <table class="tabela"><thead><tr><th>Item</th><th>Código</th><th class="dir">Qtd</th><th class="dir">Preço un.</th><th class="dir">Subtotal</th></tr></thead><tbody>
      ${linhas.map(({ i, x }) => `<tr><td>${esc(i.descricao)}</td><td><small>${esc(i.produto_codigo || '—')}</small></td><td class="dir">${N(+i.quantidade)}</td><td class="dir">${R(x.preco_unit)}</td><td class="dir">${R(x.preco_unit * i.quantidade)}</td></tr>`).join('')}
      <tr><td colspan="4" class="dir mut">Frete</td><td class="dir">${R(t.frete)}</td></tr><tr class="total"><td colspan="4" class="dir"><b>Total</b></td><td class="dir"><b>${R(t.total)}</b></td></tr></tbody></table>
    <p class="mut">Entrega em ${p.prazo_entrega_dias ?? '—'} dia(s) · Pagamento: ${esc(p.pagamento || o.pagamento || '—')}${t.cotados < t.itens ? ` · <span class="c-med">${t.itens - t.cotados} item(ns) sem cotação deste fornecedor</span>` : ''}</p>
    <div class="acoes"><button class="btn pri" disabled title="A integração com o Tiny está pronta para ser ligada depois da aprovação do Vinícius">📤 Gerar ordem de compra no Tiny</button><small class="mut">⏳ aguardando aprovação do Vinícius</small></div>
    <p class="explica mt">Quando ligado, este botão cria a ordem de compra no Tiny (API v3) com o fornecedor, os itens e o frete acima. Quando a NF chegar, a <b>Entrada de NF</b> confere e lança o estoque.</p></div>`;
}

// ─── fornecedores e convites ───
const enderecoForn = f => !f?.logradouro ? '' : `${f.logradouro}, ${f.numero || 's/n'}${f.complemento ? ' - ' + f.complemento : ''} · ${f.bairro || ''} · ${f.cidade || ''}/${f.uf || ''} · CEP ${f.cep || ''}`;
function formFornecedor(id) {
  const f = id ? fornDe(+id) : null;
  const props = f ? COMP.props.filter(p => p.fornecedor_id === f.id && p.status === 'enviada') : [];
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>${f ? esc(f.nome) : 'Cadastrar fornecedor'}</h2>
    <div class="form-grid">
      <label class="campo inteiro">Razão social / nome *<input type="text" id="fnNome" maxlength="160" value="${esc(f?.nome || '')}"></label>
      <label class="campo">CNPJ<input type="text" id="fnCnpj" value="${esc(fmtDoc(f?.cnpj))}"></label>
      <label class="campo">Contato (vendedor)<input type="text" id="fnContato" value="${esc(f?.contato || '')}"></label>
      <label class="campo">Telefone<input type="tel" id="fnTelefone" value="${esc(f?.telefone || '')}"></label>
      <label class="campo">WhatsApp<input type="tel" id="fnZap" value="${esc(f?.whatsapp || '')}"></label>
      <label class="campo">E-mail${f?.user_id ? ' <small class="mut">(login do portal)</small>' : ''}<input type="email" id="fnEmail" value="${esc(f?.email || '')}" ${f?.user_id ? 'disabled' : ''}></label>
      ${enderecoForn(f) ? `<div class="campo inteiro"><small class="mut">Endereço</small><br>${esc(enderecoForn(f))}</div>` : ''}
      <label class="campo inteiro">Marcas que atende <small class="mut">(separadas por vírgula; usadas para sugerir convites)</small><input type="text" id="fnMarcas" value="${esc((f?.marcas || []).join(', '))}" placeholder="Intelbras, Hikvision, Giga"></label>
      <label class="campo inteiro">Observações internas <small class="mut">(o fornecedor não vê)</small><textarea id="fnObs" rows="2">${esc(f?.obs || '')}</textarea></label>
      ${f ? `<label class="campo">Situação<select id="fnStatus"><option value="ativo" ${f.status === 'ativo' ? 'selected' : ''}>Ativo</option><option value="bloqueado" ${f.status === 'bloqueado' ? 'selected' : ''}>Bloqueado (o link para de funcionar)</option></select></label>` : ''}
    </div>
    <div class="acoes mt"><button class="btn pri" data-a="compSalvarForn" data-id="${f?.id || ''}">Salvar</button>
      ${f && !f.user_id ? `<button class="btn" data-a="compCopiar" data-v="${esc(linkPortal('t=' + f.token))}">📋 Copiar link do portal</button><button class="btn" data-a="compNovoToken" data-id="${f.id}" title="O link antigo deixa de funcionar">🔄 Trocar link</button>` : ''}</div>
    ${f ? `<h3 class="mt2">Histórico</h3><p class="mut">${COMP.conv.filter(c => c.fornecedor_id === f.id).length} convite(s) · ${props.length} proposta(s) enviada(s) · ${props.filter(p => p.vencedora).length} vitória(s) · último acesso ${f.ultimo_acesso ? dtHoraOp(f.ultimo_acesso) : 'nunca'}</p>
      ${props.length ? `<table class="tabela"><tbody>${props.map(p => { const o = COMP.ops.find(x => x.id === p.oportunidade_id) || {}, t = totaisProposta(p); return `<tr class="clic" data-a="compVerOp" data-id="${o.id}"><td>${esc(o.titulo || '')}</td><td><small>${dtHoraOp(p.enviada_em)}</small></td><td class="dir">${R(t.total)}</td><td>${p.vencedora ? '🏆' : ''}</td></tr>`; }).join('')}</tbody></table>` : ''}` : ''}`, true);
}
async function salvarFornecedor(id) {
  const v = k => ($('#' + k)?.value || '').trim(), nome = v('fnNome'), cnpj = v('fnCnpj').replace(/\D/g, '');
  if (nome.length < 2) return avisar('Escreva o nome do fornecedor.');
  if (cnpj && ![11, 14].includes(cnpj.length)) return avisar('CNPJ inválido.');
  const dados = { nome, cnpj: cnpj || null, contato: v('fnContato') || null, telefone: v('fnTelefone').replace(/\D/g, '') || null, whatsapp: v('fnZap').replace(/\D/g, '') || null, ...($('#fnEmail')?.disabled ? {} : { email: v('fnEmail').toLowerCase() || null }),
    marcas: v('fnMarcas').split(',').map(x => x.trim()).filter(Boolean), obs: v('fnObs') || null, ...($('#fnStatus') ? { status: v('fnStatus') } : {}) };
  try {
    if (id) await ok(sb.from('fornecedores').update(dados).eq('id', +id)); else await ok(sb.from('fornecedores').insert({ ...dados, criado_por: EU.id }));
    await carregarCompras(true); fecharModal(); avisar('Fornecedor salvo.'); render();
  } catch (e) { avisar(e.message); }
}
/** Confere os dígitos verificadores (a mesma regra do banco). */
function cnpjValido(c) {
  if (!/^\d{14}$/.test(c || '') || /^(\d)\1{13}$/.test(c)) return false;
  const dv = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +c[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === +c[12] && dv(13) === +c[13];
}
function formConvite() {
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Convidar fornecedor</h2>
    <p class="mut">Gera um link de cadastro para este CNPJ (vale 14 dias, uso único). O fornecedor cria o login e preenche os contatos e o endereço.</p>
    <div class="form-grid">
      <label class="campo">CNPJ *<input type="text" id="cvCnpj" inputmode="numeric" placeholder="00.000.000/0000-00"></label>
      <label class="campo">Nome da empresa (para você reconhecer)<input type="text" id="cvNome"></label>
      <label class="campo">WhatsApp<input type="tel" id="cvZap"></label><label class="campo">E-mail<input type="email" id="cvEmail"></label>
      <label class="campo inteiro">Marcas<input type="text" id="cvMarcas" placeholder="Intelbras, Hikvision"></label></div>
    <div class="mt"><button class="btn pri" data-a="compSalvarConvite">Gerar link</button></div>`);
}
async function salvarConvite() {
  const v = k => ($('#' + k)?.value || '').trim(), cnpj = v('cvCnpj').replace(/\D/g, '');
  if (!cnpjValido(cnpj)) return avisar('CNPJ inválido: confira os números.');
  if (COMP.forn.some(f => f.cnpj === cnpj)) return avisar('Este CNPJ já é fornecedor cadastrado.');
  try {
    const c = await ok(sb.from('forn_convites').insert({ cnpj, nome: v('cvNome') || null, whatsapp: v('cvZap').replace(/\D/g, '') || null, email: v('cvEmail').toLowerCase() || null, marcas: v('cvMarcas').split(',').map(x => x.trim()).filter(Boolean), criado_por: EU.id }).select().single());
    await carregarCompras(true); UI.compAba = 'conv'; render(); linkConvite(c.id);   // recarrega: o convite anterior deste CNPJ deixa de valer
  } catch (e) { avisar(e.message); }
}
function linkConvite(id) {
  const c = COMP.convites.find(x => x.id === +id); if (!c) return;
  const link = linkPortal('c=' + c.token), zap = String(c.whatsapp || '').replace(/\D/g, '');
  const texto = `Olá! A Protemaxxi quer receber suas cotações pelo nosso portal de fornecedores. Faça o cadastro do CNPJ ${fmtDoc(c.cnpj)} por este link, que só pode ser usado uma vez e vale até ${dtHoraOp(c.expira_em)}: ${link}`;
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Link de cadastro${c.nome ? ' — ' + esc(c.nome) : ''}</h2>
    <input type="text" readonly value="${esc(link)}" style="width:100%">
    <div class="acoes mt"><button class="btn pri" data-a="compCopiar" data-v="${esc(link)}">📋 Copiar</button>
      <a class="btn" href="https://wa.me/${zap ? (zap.length > 11 ? zap : '55' + zap) : ''}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">💬 Mandar no WhatsApp</a>
      ${c.email ? `<a class="btn" href="mailto:${esc(c.email)}?subject=${encodeURIComponent('Cadastro no portal de fornecedores da Protemaxxi')}&body=${encodeURIComponent(texto)}">✉ E-mail</a>` : ''}</div>`);
}

// ─── ações rápidas ───
async function mudarStatusOp(id, v) {
  const o = COMP.ops.find(x => x.id === +id); if (!o) return;
  if (v === 'aberta' && !COMP.conv.some(c => c.oportunidade_id === o.id)) return avisar('Convide pelo menos um fornecedor antes de publicar.');
  if (v === 'aberta' && (!o.prazo_resposta || new Date(o.prazo_resposta) <= new Date())) return avisar('O prazo para responder já passou: edite antes de publicar.');
  if (v === 'cancelada' && !confirm('Cancelar esta oportunidade? Os fornecedores verão que foi cancelada.')) return;
  const dados = v === 'encerrar' ? { prazo_resposta: new Date().toISOString() } : { status: v };
  try { Object.assign(o, await ok(sb.from('oportunidades').update(dados).eq('id', o.id).select().single())); render(); verOportunidade(o.id); avisar('Feito.'); } catch (e) { avisar(e.message); }
}
async function prorrogarOp(id) {
  const o = COMP.ops.find(x => x.id === +id), val = $('#opNovoPrazo')?.value; if (!o) return;
  if (!val || new Date(val) <= new Date()) return avisar('Escolha um novo prazo no futuro.');
  try { Object.assign(o, await ok(sb.from('oportunidades').update({ prazo_resposta: new Date(val).toISOString(), status: 'aberta' }).eq('id', o.id).select().single())); render(); verOportunidade(o.id); avisar('Prazo prorrogado.'); } catch (e) { avisar(e.message); }
}
async function escolherVencedor(op, prop) {
  const p = prop ? COMP.props.find(x => x.id === +prop) : null;
  if (p && !confirm(`Escolher ${fornDe(p.fornecedor_id)?.nome || 'este fornecedor'} como vencedor? A oportunidade será encerrada.`)) return;
  try { await ok(sb.rpc('op_vencedor', { p_op: +op, p_proposta: p ? p.id : null })); await carregarCompras(true); render(); verOportunidade(op); avisar(p ? 'Vencedor escolhido.' : 'Escolha desfeita.'); } catch (e) { avisar(e.message); }
}
async function copiarTexto(t) { try { await navigator.clipboard.writeText(t); avisar('Link copiado.'); } catch { prompt('Copie o link:', t); } }
