'use strict';
/* CRM Protemaxxi — Intranet: solicitações (informação, compra, cotação, cadastro de produto, RMA) e Suporte. */

const ETAPAS_RMA = ['Recebido do cliente', 'Análise', 'Envio assistência', 'Aguardando peça', 'Retorno técnica', 'Aguardando cliente', 'Trocado / devolvido ao cliente', 'Negado'];
const etapaRMA = etapa => ({ 'Em análise': 'Análise', 'Enviado ao fabricante': 'Envio assistência', 'Retornou do fabricante': 'Retorno técnica' }[etapa] || etapa || ETAPAS_RMA[0]);
const TIPOS_SOL = {
  informacao: { nome: 'Pedido de informação', ic: '❓', desc: 'Pergunte algo a um colega: situação de um cliente, de um pedido, de uma negociação.', campos: [['cliente', 'Cliente (se for sobre um cliente)', 'cliente']] },
  compra: { nome: 'Solicitação de compra', ic: '🛒', desc: 'Pedir para comprar um produto: para um cliente que está esperando ou para repor o estoque.',
    campos: [['produto', 'Produto', 'text', 1], ['codigo', 'Código / SKU', 'text'], ['quantidade', 'Quantidade', 'number', 1], ['fornecedor', 'Fornecedor sugerido', 'text'], ['motivo', 'Motivo', ['Cliente aguardando', 'Reposição de estoque', 'Produto novo', 'Outro']], ['valor_estimado', 'Valor estimado (R$)', 'number'], ['cliente', 'Cliente (se for para um cliente)', 'cliente']] },
  cotacao: { nome: 'Cotação', ic: '💲', desc: 'Pedir preço de produtos que não temos ou para uma quantidade grande.',
    campos: [['itens', 'Itens e quantidades', 'textarea', 1], ['cliente', 'Cliente', 'cliente'], ['prazo_cliente', 'O cliente precisa da resposta até', 'date']] },
  cadastro_produto: { nome: 'Cadastro de produto', ic: '🏷', desc: 'Pedir o cadastro de um produto novo no Tiny e nos marketplaces.',
    campos: [['nome_produto', 'Nome do produto', 'text', 1], ['marca', 'Marca', 'text'], ['codigo_fabricante', 'Código do fabricante', 'text'], ['fornecedor', 'Fornecedor', 'text'], ['custo', 'Custo (R$)', 'number'], ['preco', 'Preço de venda sugerido (R$)', 'number'], ['ncm', 'NCM', 'text'], ['link', 'Link / ficha técnica', 'text'], ['canais', 'Anunciar em', ['Só no Tiny', 'Tiny + Mercado Livre', 'Tiny + todos os canais']]] },
  rma: { nome: 'RMA / Garantia', ic: '🔧', desc: 'Produto com defeito: registra a troca/garantia e acompanha até resolver.',
    campos: [['cliente', 'Cliente', 'cliente', 1], ['pedido', 'Nº do pedido ou NF', 'text'], ['produto', 'Produto', 'text', 1], ['serie', 'Nº de série', 'text'], ['defeito', 'Defeito relatado', 'textarea', 1], ['data_compra', 'Data da compra', 'date'], ['etapa', 'Etapa do RMA', ETAPAS_RMA]] },
  outro: { nome: 'Outro assunto', ic: '📌', desc: 'Qualquer outro pedido para um colega.', campos: [] },
};
const STATUS_SOL = { aberta: 'Aberta', em_andamento: 'Em andamento', aguardando: 'Aguardando', concluida: 'Concluída', cancelada: 'Cancelada' };
const PRIORIDADES = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
const ABERTAS = ['aberta', 'em_andamento', 'aguardando'];
const nomeP = id => pessoa(id)?.nome || '—';
const respDe = s => s.responsaveis?.length ? s.responsaveis : [s.responsavel_id].filter(Boolean);
const souResp = s => respDe(s).includes(EU?.id);
const nomesResp = s => respDe(s).map(nomeP).join(', ');
const minhasPendentes = () => D.solicitacoes.filter(s => souResp(s) && ABERTAS.includes(s.status));

function caixaSol(s) {
  if (UI.solCaixa === 'para_mim') return souResp(s);
  if (UI.solCaixa === 'pedi') return s.solicitante_id === EU.id;
  if (UI.solCaixa === 'equipe') return !souResp(s) && s.solicitante_id !== EU.id;
  return true;
}
function vSolicitacoes(soTipo) {
  const base = D.solicitacoes.filter(s => !soTipo || s.tipo === soTipo);
  const caixas = [['para_mim', 'Para mim'], ['pedi', 'Que eu pedi'], ...(temEquipe() ? [['equipe', 'Da minha equipe']] : []), ['todas', 'Todas que vejo']];
  const n = k => base.filter(s => { const o = UI.solCaixa; UI.solCaixa = k; const r = caixaSol(s) && ABERTAS.includes(s.status); UI.solCaixa = o; return r; }).length;
  let lista = base.filter(caixaSol);
  if (UI.solStatus === 'abertas') lista = lista.filter(s => ABERTAS.includes(s.status));
  if (UI.solStatus === 'fechadas') lista = lista.filter(s => !ABERTAS.includes(s.status));
  const h = hoje();
  return `<div class="filtros"><div class="chips">${caixas.map(([k, nm]) => `<button class="chip ${UI.solCaixa === k ? 'on' : ''}" data-a="solCaixa" data-v="${k}">${nm}<span class="n">${n(k)}</span></button>`).join('')}</div>
      <select data-c="ui" data-k="solStatus">${[['abertas', 'Em aberto'], ['fechadas', 'Concluídas/canceladas'], ['todas', 'Todas']].map(([v, nm]) => `<option value="${v}" ${UI.solStatus === v ? 'selected' : ''}>${nm}</option>`).join('')}</select></div>
    <div class="card rolagem"><table class="tabela"><thead><tr><th>#</th><th>Assunto</th><th>De → Para</th><th>Prioridade</th><th>Prazo</th><th>Situação</th><th>Atualizada</th></tr></thead><tbody>
      ${lista.map(s => { const t = TIPOS_SOL[s.tipo] || TIPOS_SOL.outro; const atrasada = s.prazo && s.prazo < h && ABERTAS.includes(s.status);
        return `<tr class="clic" data-a="verSolicitacao" data-id="${s.id}"><td><small>#${s.id}</small></td><td><b>${t.ic} ${esc(s.titulo)}</b><br><small>${t.nome}${s.dados?.cliente_nome ? ' · ' + esc(s.dados.cliente_nome) : ''}${s.tipo === 'rma' && s.dados?.etapa ? ' · ' + esc(etapaRMA(s.dados.etapa)) : ''}</small></td>
          <td>${esc(nomeP(s.solicitante_id))} → <b>${esc(nomesResp(s))}</b>${respDe(s).length > 1 ? `<br><small>cuidando: ${esc(nomeP(s.responsavel_id))}</small>` : ''}${(s.anexos || []).length ? ` <small title="fotos">📷${s.anexos.length}</small>` : ''}</td><td class="pri-${s.prioridade}">${PRIORIDADES[s.prioridade]}</td>
          <td>${s.prazo ? `<span class="${atrasada ? 'c-ruim' : ''}">${fmtCurta(s.prazo)}${atrasada ? ' · atrasada' : ''}</span>` : '—'}</td><td><span class="st st-${s.status}">${STATUS_SOL[s.status]}</span></td>
          <td><small>${new Date(s.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></td></tr>`; }).join('') || '<tr><td colspan="7" class="vazio">Nada por aqui.</td></tr>'}
    </tbody></table></div>`;
}
function vIntranet() {
  return topo('Solicitações', 'Peça informações, compras, cotações, cadastros e RMA para a pessoa certa, e acompanhe até resolver.', '<button class="btn pri" data-a="novaSolicitacao">+ Nova solicitação</button>') + vSolicitacoes();
}
function vSuporte() {
  const rmas = D.solicitacoes.filter(s => s.tipo === 'rma');
  const abertos = rmas.filter(s => ABERTAS.includes(s.status));
  return topo('Suporte e RMA', 'Garantias e trocas: do recebimento do cliente até a solução.', '<button class="btn pri" data-a="novaSolicitacao" data-tipo="rma">+ Novo RMA</button>')
    + `<div class="grid g4"><div class="card kpi-card"><div class="rot">RMAs em aberto</div><div class="val">${abertos.length}</div></div>
      <div class="card kpi-card"><div class="rot">No fabricante</div><div class="val">${abertos.filter(s => etapaRMA(s.dados?.etapa) === 'Envio assistência').length}</div></div>
      <div class="card kpi-card"><div class="rot">Resolvidos no mês</div><div class="val c-ok">${rmas.filter(s => s.status === 'concluida' && (s.concluido_em || '').startsWith(mesDe(hoje()))).length}</div></div>
      <div class="card kpi-card"><div class="rot">Tempo médio aberto</div><div class="val">${abertos.length ? Math.round(soma(abertos.map(s => (Date.now() - new Date(s.criado_em)) / 864e5)) / abertos.length) + ' dias' : '—'}</div></div></div>
    <div class="card mt"><h2>Quadro de RMA</h2><div class="kanban" style="grid-template-columns:repeat(${ETAPAS_RMA.length}, minmax(190px,1fr))">${ETAPAS_RMA.map(et => `<div class="col"><h4>${et}</h4>${abertos.filter(s => etapaRMA(s.dados?.etapa) === et).map(s => `<div class="item" data-a="verSolicitacao" data-id="${s.id}"><b>#${s.id} ${esc(s.dados?.produto || s.titulo)}</b><br><small>${esc(s.dados?.cliente_nome || '')}</small><br><small class="mut">há ${Math.round((Date.now() - new Date(s.criado_em)) / 864e5)} dia(s) · ${esc(nomesResp(s))}</small></div>`).join('')}</div>`).join('')}</div></div>
    <div class="card mt em-breve"><h2>Em breve: atendimento integrado</h2><p class="explica">Este módulo vai receber o <b>RMA Control</b> e o atendimento por <b>WhatsApp e redes sociais</b> direto na Intranet. As conversas vão virar chamados ligados ao cliente do Tiny, com histórico, responsável e prazo. Por enquanto, registre os RMAs aqui pelo botão "Novo RMA".</p></div>
    ${blocoOS()}
    <h2 class="mt2">Todos os RMAs</h2>${vSolicitacoes('rma')}`;
}

// ─── formulário ───
function campoHtml([k, rot, tipo, obrig], val = '') {
  const id = 'sf_' + k, req = obrig ? ' *' : '';
  if (Array.isArray(tipo)) return `<label class="campo">${rot}${req}<select id="${id}">${tipo.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  if (tipo === 'textarea') return `<label class="campo inteiro">${rot}${req}<textarea id="${id}" rows="3">${esc(val)}</textarea></label>`;
  if (tipo === 'cliente') return `<label class="campo">${rot}${req}<input type="text" id="${id}" list="listaClientes" value="${esc(val)}" placeholder="Comece a digitar o nome"></label>`;
  return `<label class="campo">${rot}${req}<input type="${tipo === 'number' ? 'number' : tipo}" step="any" id="${id}" value="${esc(val)}"></label>`;
}
async function formSolicitacao(tipo, cliente) {
  if (!tipo) {
    modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Nova solicitação</h2><p class="mut">O que você precisa?</p>
      <div class="grid g2">${Object.entries(TIPOS_SOL).filter(([k]) => k !== 'rma').map(([k, t]) => `<div class="card clic" style="cursor:pointer" data-a="novaSolicitacao" data-tipo="${k}" ${cliente ? `data-chave="${esc(cliente.chave)}" data-nome="${esc(cliente.nome)}"` : ''}><h3>${t.ic} ${t.nome}</h3><small>${t.desc}</small></div>`).join('')}
        <div class="card ${veAssist() ? 'clic' : ''}" ${veAssist() ? 'style="cursor:pointer" data-a="nav" data-v="suporte" data-fecha="1"' : ''}><h3>🔧 RMA / Garantia</h3><small>Produto com defeito agora vira uma OS na <b>Assistência</b> (assistência, fábrica e RMA em um lugar só)${veAssist() ? '.' : ': leve o produto ao suporte.'}</small></div></div>`);
    return;
  }
  if (!D.clientes) carregarClientes().catch(() => {});
  const t = TIPOS_SOL[tipo], cfgP = D.config.solicitacoes?.[tipo], padrao = (Array.isArray(cfgP) ? cfgP : [cfgP]).filter(x => x && x !== EU.id);
  const pessoasAtivas = D.pessoas.filter(p => p.ativo && p.id !== EU.id);
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>${t.ic} ${t.nome}</h2><p class="mut">${t.desc}</p>
    <div class="form-grid">
      <label class="campo inteiro">Assunto *<input type="text" id="sf_titulo" placeholder="Resumo em uma linha"></label>
      ${t.campos.map(c => campoHtml(c, c[2] === 'cliente' ? (cliente?.nome || '') : '')).join('')}
      <label class="campo inteiro">Detalhes${tipo === 'informacao' || tipo === 'outro' ? ' *' : ''}<textarea id="sf_descricao" rows="4"></textarea></label>
      <div class="campo inteiro">Para quem * <small class="mut">(marque uma ou mais pessoas: qualquer uma pode resolver)</small><div class="pessoas-multi" id="sf_resp">${pessoasAtivas.map(p => `<label><input type="checkbox" value="${p.id}" ${padrao.includes(p.id) ? 'checked' : ''}>${esc(p.nome)}</label>`).join('')}</div></div>
      <label class="campo">Prioridade<select id="sf_pri">${Object.entries(PRIORIDADES).map(([k, v]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="campo">Prazo<input type="date" id="sf_prazo" min="${hoje()}"></label>
      <label class="campo inteiro">📷 Fotos ${['cotacao', 'compra', 'rma', 'cadastro_produto'].includes(tipo) ? '(do produto, da etiqueta, do defeito…)' : '(opcional)'}<input type="file" id="sf_fotos" accept="image/*" multiple></label>
    </div>
    <datalist id="listaClientes">${(D.clientes || []).slice(0, 3000).map(c => `<option value="${esc(c.nome)}">`).join('')}</datalist>
    <div class="mt"><button class="btn pri" data-a="salvarSolicitacao" data-tipo="${tipo}" ${cliente ? `data-chave="${esc(cliente.chave)}"` : ''}>Enviar solicitação</button></div>`);
}
async function salvarSolicitacao(tipo, chaveFixa) {
  const t = TIPOS_SOL[tipo], v = id => ($('#' + id)?.value || '').trim();
  const titulo = v('sf_titulo'), resps = [...document.querySelectorAll('#sf_resp input:checked')].map(x => x.value), resp = resps[0], descricao = v('sf_descricao');
  if (!titulo) return avisar('Escreva o assunto.');
  if (!resp) return avisar('Marque para quem é a solicitação (uma ou mais pessoas).');
  if ((tipo === 'informacao' || tipo === 'outro') && !descricao) return avisar('Escreva os detalhes.');
  const dados = {};
  for (const [k, rot, tp, obrig] of t.campos) {
    const val = v('sf_' + k);
    if (obrig && !val) return avisar(`Preencha: ${rot}.`);
    if (!val) continue;
    if (tp === 'cliente') { dados.cliente_nome = val; const c = (D.clientes || []).find(x => x.nome === val); dados.cliente_chave = chaveFixa && val ? chaveFixa : c?.chave || null; }
    else dados[k] = tp === 'number' ? Number(val) : val;
  }
  if (tipo === 'rma' && !dados.etapa) dados.etapa = ETAPAS_RMA[0];
  const fotos = [...($('#sf_fotos')?.files || [])];
  const nova = await ok(sb.from('solicitacoes').insert({ tipo, titulo, descricao, dados, solicitante_id: EU.id, responsavel_id: resp, responsaveis: resps, prioridade: v('sf_pri') || 'normal', prazo: v('sf_prazo') || null }).select().single());
  D.solicitacoes.unshift(nova); fecharModal();
  if (fotos.length) { avisar(`Enviando ${fotos.length} foto(s)…`); await anexarFotos(nova, fotos).catch(e => avisar('A solicitação foi criada, mas as fotos falharam: ' + e.message)); }
  avisar(`Solicitação #${nova.id} enviada para ${resps.map(nomeP).join(', ')}.`); render();
}

// ─── detalhe ───
const ROTULOS_DADOS = Object.fromEntries(Object.values(TIPOS_SOL).flatMap(t => t.campos.map(([k, r]) => [k, r])));
async function abrirSolicitacao(id) {
  const s = D.solicitacoes.find(x => String(x.id) === String(id)); if (!s) return;
  const coms = await ok(sb.from('solicitacao_comentarios').select('*').eq('solicitacao_id', s.id).order('criado_em'));
  const t = TIPOS_SOL[s.tipo] || TIPOS_SOL.outro;
  const pode = ehDono() || s.solicitante_id === EU.id || souResp(s) || D.pessoas.some(p => respDe(s).includes(p.id) && p.supervisor === EU.id);
  const urls = await urlsAnexos(s);
  const dados = Object.entries(s.dados || {}).filter(([k]) => !['cliente_chave', 'cliente_nome', 'etapa'].includes(k));
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button>
    <small class="mut">#${s.id} · ${t.ic} ${t.nome} · aberta por ${esc(nomeP(s.solicitante_id))} em ${new Date(s.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small>
    <h2 style="margin-top:4px">${esc(s.titulo)}</h2>
    <div class="grid g4" style="gap:10px">
      <label class="campo">Situação<select data-c="solCampo" data-id="${s.id}" data-k="status" ${pode ? '' : 'disabled'}>${Object.entries(STATUS_SOL).map(([k, v]) => `<option value="${k}" ${s.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="campo">Quem está cuidando<select data-c="solCampo" data-id="${s.id}" data-k="responsavel_id" ${pode ? '' : 'disabled'}>${optPessoas(s.responsavel_id, D.pessoas.filter(p => p.ativo && respDe(s).includes(p.id)))}</select></label>
      <label class="campo">Prioridade<select data-c="solCampo" data-id="${s.id}" data-k="prioridade" ${pode ? '' : 'disabled'}>${Object.entries(PRIORIDADES).map(([k, v]) => `<option value="${k}" ${s.prioridade === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="campo">Prazo<input type="date" value="${s.prazo || ''}" data-c="solCampo" data-id="${s.id}" data-k="prazo" ${pode ? '' : 'disabled'}></label>
    </div>
    <div class="campo mt">Responsáveis <small class="mut">(qualquer um pode resolver)</small><div class="pessoas-multi">${D.pessoas.filter(p => p.ativo).map(p => `<label><input type="checkbox" data-c="solResp" data-id="${s.id}" value="${p.id}" ${respDe(s).includes(p.id) ? 'checked' : ''} ${pode ? '' : 'disabled'}>${esc(p.nome)}</label>`).join('')}</div>
      ${souResp(s) && s.responsavel_id !== EU.id && ABERTAS.includes(s.status) ? `<div><button class="btn peq pri" data-a="solPegar" data-id="${s.id}">🙋 Eu pego essa</button></div>` : ''}</div>
    ${s.tipo === 'rma' ? `<label class="campo mt">Etapa do RMA<select data-c="solEtapa" data-id="${s.id}" ${pode ? '' : 'disabled'}>${ETAPAS_RMA.map(e => `<option ${etapaRMA(s.dados?.etapa) === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>` : ''}
    ${s.dados?.cliente_nome ? `<p class="mt"><b>Cliente:</b> ${s.dados.cliente_chave ? `<a href="#" data-a="verCliente" data-chave="${esc(s.dados.cliente_chave)}">${esc(s.dados.cliente_nome)}</a>` : esc(s.dados.cliente_nome)}</p>` : ''}
    ${dados.length ? `<table class="tabela mt"><tbody>${dados.map(([k, v]) => `<tr><td class="mut" style="width:38%">${esc(ROTULOS_DADOS[k] || k)}</td><td><b>${esc(typeof v === 'number' && /valor|custo|preco/.test(k) ? R(v) : v)}</b></td></tr>`).join('')}</tbody></table>` : ''}
    ${s.descricao ? `<p style="white-space:pre-wrap" class="mt">${esc(s.descricao)}</p>` : ''}
    <h3 class="mt2">📷 Fotos</h3>
    <div class="anexos">${urls.map(u => `<a href="${esc(u.url)}" target="_blank" rel="noopener" title="${esc(u.nome || '')} · ${esc(nomeP(u.por))}"><img src="${esc(u.url)}" alt="foto" loading="lazy"></a>`).join('')}
      <label class="novo">＋ Adicionar foto<input type="file" accept="image/*" multiple hidden data-c="solFotos" data-id="${s.id}"></label></div>
    <h3 class="mt2">Conversa</h3>
    ${coms.map(c => c.sistema ? `<div class="coment sis">• ${esc(c.texto)} · ${new Date(c.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>` : `<div class="coment"><div class="meta"><b>${esc(nomeP(c.autor_id))}</b> · ${new Date(c.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div><p>${esc(c.texto)}</p></div>`).join('') || '<p class="mut">Sem mensagens ainda.</p>'}
    <textarea id="solComent" rows="3" placeholder="Escreva uma resposta ou atualização…"></textarea>
    <div class="acoes mt"><button class="btn pri" data-a="comentarSolicitacao" data-id="${s.id}">Enviar</button>${['cotacao', 'compra'].includes(s.tipo) && veCompras() ? `<button class="btn" data-a="compDeSol" data-id="${s.id}" title="Publica os itens no portal do fornecedor para receber propostas">🌐 Pedir propostas no portal</button>` : ''}${pode && ABERTAS.includes(s.status) ? `<button class="btn" data-a="concluirSolicitacao" data-id="${s.id}">✓ Marcar como concluída</button>` : ''}</div>`, true);
}
async function registrarSistema(id, texto) { await ok(sb.from('solicitacao_comentarios').insert({ solicitacao_id: id, autor_id: EU.id, texto, sistema: true })); }
async function mudarSolicitacao(id, campo, valor) {
  const s = D.solicitacoes.find(x => String(x.id) === String(id));
  const novo = await ok(sb.from('solicitacoes').update({ [campo]: valor || null }).eq('id', s.id).select().single());
  Object.assign(s, novo);
  const desc = { status: `mudou a situação para "${STATUS_SOL[valor]}"`, responsavel_id: `${nomeP(valor)} está cuidando`, prioridade: `mudou a prioridade para ${PRIORIDADES[valor]}`, prazo: valor ? `definiu o prazo para ${fmtCurta(valor)}` : 'tirou o prazo' }[campo];
  await registrarSistema(s.id, `${EU.nome} ${desc}`);
  abrirSolicitacao(s.id); render();
}
async function mudarEtapa(id, etapa) {
  const s = D.solicitacoes.find(x => String(x.id) === String(id));
  const novo = await ok(sb.from('solicitacoes').update({ dados: { ...s.dados, etapa }, status: etapa.startsWith('Trocado') || etapa === 'Negado' ? 'concluida' : s.status === 'aberta' ? 'em_andamento' : s.status }).eq('id', s.id).select().single());
  Object.assign(s, novo); await registrarSistema(s.id, `${EU.nome} moveu o RMA para "${etapa}"`);
  abrirSolicitacao(s.id); render();
}
async function comentarSolicitacao(id) {
  const texto = $('#solComent').value.trim(); if (!texto) return;
  await ok(sb.from('solicitacao_comentarios').insert({ solicitacao_id: +id, autor_id: EU.id, texto }));
  const s = D.solicitacoes.find(x => String(x.id) === String(id));
  if (s.status === 'aberta' && souResp(s)) { const n = await ok(sb.from('solicitacoes').update({ status: 'em_andamento' }).eq('id', s.id).select().single()); Object.assign(s, n); }
  else { const n = await ok(sb.from('solicitacoes').update({ atualizado_em: new Date().toISOString() }).eq('id', s.id).select().single()); Object.assign(s, n); }
  abrirSolicitacao(id); render();
}

// ─── vários responsáveis ───
async function solResp(id, pessoaId, marcado) {
  const s = D.solicitacoes.find(x => String(x.id) === String(id));
  let lista = respDe(s).filter(x => x !== pessoaId); if (marcado) lista.push(pessoaId);
  if (!lista.length) { avisar('A solicitação precisa de pelo menos um responsável.'); return abrirSolicitacao(s.id); }
  const principal = lista.includes(s.responsavel_id) ? s.responsavel_id : lista[0];
  Object.assign(s, await ok(sb.from('solicitacoes').update({ responsaveis: lista, responsavel_id: principal }).eq('id', s.id).select().single()));
  await registrarSistema(s.id, `${EU.nome} ${marcado ? 'incluiu' : 'tirou'} ${nomeP(pessoaId)} ${marcado ? 'nos' : 'dos'} responsáveis`);
  abrirSolicitacao(s.id); render();
}
async function solPegar(id) {
  const s = D.solicitacoes.find(x => String(x.id) === String(id));
  Object.assign(s, await ok(sb.from('solicitacoes').update({ responsavel_id: EU.id, status: s.status === 'aberta' ? 'em_andamento' : s.status }).eq('id', s.id).select().single()));
  await registrarSistema(s.id, `${EU.nome} pegou a solicitação`);
  abrirSolicitacao(s.id); render();
}

// ─── fotos (bucket privado "anexos", caminho sol/<id>/...) ───
/** Reduz a foto (lado maior 1600 px, JPEG 80%) antes de subir: fica leve no celular e no armazenamento. */
async function reduzirFoto(arq) {
  const img = await createImageBitmap(arq).catch(() => null);
  if (!img) return arq;
  const esc2 = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * esc2); c.height = Math.round(img.height * esc2);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return await new Promise(ok2 => c.toBlob(b => ok2(b || arq), 'image/jpeg', 0.8));
}
async function anexarFotos(s, arquivos) {
  const novos = [];
  for (const a of arquivos) {
    if (!/^image\//.test(a.type)) continue;
    const blob = await reduzirFoto(a);
    const caminho = `sol/${s.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await sb.storage.from('anexos').upload(caminho, blob, { contentType: 'image/jpeg' });
    if (error) throw new Error(error.message);
    novos.push({ path: caminho, nome: a.name, por: EU.id, em: new Date().toISOString() });
  }
  if (!novos.length) return;
  const atual = D.solicitacoes.find(x => x.id === s.id) || s;
  Object.assign(atual, await ok(sb.from('solicitacoes').update({ anexos: [...(atual.anexos || []), ...novos] }).eq('id', s.id).select().single()));
  await registrarSistema(s.id, `${EU.nome} anexou ${novos.length} foto(s)`);
}
async function urlsAnexos(s) {
  const lista = s.anexos || [];
  if (!lista.length) return [];
  const { data } = await sb.storage.from('anexos').createSignedUrls(lista.map(a => a.path), 3600);
  return lista.map((a, i) => ({ ...a, url: data?.[i]?.signedUrl })).filter(a => a.url);
}
async function solFotos(id, arquivos) {
  const s = D.solicitacoes.find(x => String(x.id) === String(id));
  avisar(`Enviando ${arquivos.length} foto(s)…`);
  await anexarFotos(s, arquivos);
  avisar('Foto(s) anexada(s).'); abrirSolicitacao(s.id); render();
}
