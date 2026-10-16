'use strict';
/* Intranet Protemaxxi — Entrada de NF de compra (aba da Expedição).
   Fluxo: no Tiny (Suprimentos → Notas de Entrada → Buscador de Notas) a nota é importada SEM lançar estoque →
   ela aparece aqui → o Fefão bipa a chave do DANFE, liga cada item ao produto do Tiny (a Intranet aprende o de-para do fornecedor),
   confere as quantidades → "Lançar estoque no Tiny" dá entrada produto a produto, com o custo da nota. */

const ENT = { notas: null, itens: {}, carregando: false };
const ST_ENT = { a_receber: ['A receber', 'med'], conferindo: ['Conferindo', 'azul'], divergente: ['Divergente', 'ruim'], lancada: ['Estoque lançado', 'ok'], ignorada: ['Ignorada', ''] };

async function carregarEntradas(forcar) {
  if (ENT.notas && !forcar) return;
  ENT.carregando = true;
  try {
    ENT.notas = await ok(sb.from('nf_entradas').select('*').order('criado_em', { ascending: false }).limit(150));
    const ids = ENT.notas.map(n => n.id_tiny);
    const itens = [];
    for (const lote of pedaco(ids, 100)) itens.push(...await ok(sb.from('nf_entrada_itens').select('*').in('id_nota', lote).order('seq')));
    ENT.itens = itens.reduce((m, i) => ((m[i.id_nota] ||= []).push(i), m), {});
    const prods = [...new Set(itens.map(i => i.produto_id).filter(Boolean))].filter(id => !EXP?.prod?.[id]);
    for (const lote of pedaco(prods, 150)) for (const p of await ok(sb.from('produtos').select('*').in('id', lote))) EXP.prod[String(p.id)] = p;
  } finally { ENT.carregando = false; }
}

function abaEntradaNF() {
  if (!ENT.notas) { if (!ENT.carregando) carregarEntradas().then(render).catch(e => avisar(e.message)); return '<div class="card vazio">Carregando as notas de entrada…</div>'; }
  UI.entFiltro ||= 'abertas';
  const filtros = { abertas: ['A receber / conferindo', n => ['a_receber', 'conferindo', 'divergente'].includes(n.status)], lancada: ['Estoque lançado', n => n.status === 'lancada'], ignorada: ['Ignoradas', n => n.status === 'ignorada'] };
  const lista = ENT.notas.filter(filtros[UI.entFiltro][1]);
  const sel = ENT.notas.find(n => n.id_tiny === UI.entNota);
  return `<div class="card"><div class="secao-titulo"><h2>📥 Entrada de NF de compra</h2><button class="btn peq" data-a="entSync">↻ Buscar notas novas no Tiny</button></div>
      <p class="explica" style="margin-top:0">1) No Tiny, em <b>Suprimentos → Notas de Entrada → Buscador de Notas</b>, importe a nota <b>sem lançar estoque</b>. 2) Ela aparece aqui em até 10 minutos. 3) Quando a mercadoria chegar, <b>bipe o código de barras do DANFE</b> abaixo, ligue cada item ao produto e confira as quantidades. 4) Clique em <b>Lançar estoque no Tiny</b>. <b>Não lance o estoque pelo Tiny</b>, senão entra em dobro.</p>
      <input type="search" id="entBusca" placeholder="📷 Bipe o DANFE (chave de 44 números) ou digite o nº da nota e aperte Enter" style="width:100%;font-size:18px;padding:12px" autocomplete="off"></div>
    ${sel ? detalheEntrada(sel) : ''}
    <div class="filtros mt"><div class="chips">${Object.entries(filtros).map(([k, [n, f]]) => `<button class="chip ${UI.entFiltro === k ? 'on' : ''}" data-a="entFiltro" data-v="${k}">${n}<span class="n">${ENT.notas.filter(f).length}</span></button>`).join('')}</div></div>
    <div class="card rolagem"><table class="tabela"><thead><tr><th>Nota</th><th>Fornecedor</th><th>Emissão</th><th class="dir">Valor</th><th>Itens</th><th>Situação</th></tr></thead><tbody>
      ${lista.map(n => { const its = ENT.itens[n.id_tiny] || [], lig = its.filter(i => i.produto_id).length, conf = its.filter(i => i.qtd_conferida !== null).length;
        return `<tr class="clic ${UI.entNota === n.id_tiny ? 'sel' : ''}" data-a="entAbrir" data-id="${esc(n.id_tiny)}"><td><b>${esc(n.numero || '')}</b></td><td>${esc(n.fornecedor || '')}</td><td><small>${n.emissao ? fmtCurta(n.emissao) : ''}</small></td>
          <td class="dir">${R(n.valor)}</td><td><small>${its.length} itens · ${lig} ligados · ${conf} conferidos</small></td><td><span class="tag ${ST_ENT[n.status][1]}">${ST_ENT[n.status][0]}</span></td></tr>`; }).join('') || '<tr><td colspan="6" class="vazio">Nenhuma nota aqui.</td></tr>'}
    </tbody></table></div>`;
}

function detalheEntrada(n) {
  const its = ENT.itens[n.id_tiny] || [], fechada = ['lancada', 'ignorada'].includes(n.status);
  const pronto = its.length && its.every(i => i.produto_id && i.qtd_conferida !== null);
  return `<div class="card mt" style="border:2px solid var(--borda-forte)"><div class="secao-titulo"><div><h2 style="margin:0">NF ${esc(n.numero || '')} · ${esc(n.fornecedor || '')}</h2>
      <small class="mut">Emissão ${n.emissao ? fmtCurta(n.emissao) : '—'} · ${R(n.valor)} · chave ${esc(n.chave || '—')}${n.recebido_por ? ` · recebida por ${esc(nomeP(n.recebido_por))}` : ''}${n.lancado_por ? ` · lançada por ${esc(nomeP(n.lancado_por))} em ${dataHora(n.lancado_em)}` : ''}</small></div>
      <div class="acoes"><span class="tag ${ST_ENT[n.status][1]}">${ST_ENT[n.status][0]}</span><button class="btn peq" data-a="entFechar">✕</button></div></div>
    ${n.obs ? `<div class="alerta med"><span class="ic">ℹ</span><span>${esc(n.obs)}</span></div>` : ''}
    <div class="rolagem"><table class="tabela"><thead><tr><th>#</th><th>Item na nota</th><th class="dir">Qtd NF</th><th class="dir">Custo un.</th><th>Produto no Tiny</th><th class="dir">Conferido</th></tr></thead><tbody>
    ${its.map(i => { const p = i.produto_id ? EXP.prod[String(i.produto_id)] : null, dif = i.qtd_conferida !== null && Number(i.qtd_conferida) !== Number(i.quantidade);
      return `<tr><td>${i.seq}</td><td><b>${esc(i.descricao || '')}</b><br><small class="mut">${esc(i.unidade || '')} · NCM ${esc(i.ncm || '—')}${i.codigo_forn ? ' · cód. ' + esc(i.codigo_forn) : ''}</small></td>
        <td class="dir num">${N(i.quantidade)}</td><td class="dir">${R(i.valor_unit)}</td>
        <td>${i.produto_id ? `<b>${esc(p?.codigo || i.produto_id)}</b> <small>${esc(p?.nome || '')}</small>${Number(i.fator) > 1 ? ` <span class="tag azul">×${N(i.fator)} un. por item</span>` : ''}${p ? `<br><small class="mut">📍 ${esc(p.localizacao || p.unidade || '—')} · estoque ${N(p.saldo)}</small>` : ''}` : '<span class="tag ruim">sem produto</span>'}
          ${fechada ? '' : `<br><button class="btn peq" data-a="entVincular" data-nota="${esc(n.id_tiny)}" data-item="${esc(i.id_item)}">${i.produto_id ? 'Trocar' : '🔗 Ligar produto'}</button>${i.produto_id ? '' : ` <button class="btn peq" data-a="entCadastro" data-nota="${esc(n.id_tiny)}" data-item="${esc(i.id_item)}">🏷 Pedir cadastro</button>`}`}
          ${i.lancado ? `<br><small class="c-ok">✓ ${N(i.lancado_qtd)} lançado(s) no estoque</small>` : i.erro ? `<br><small class="c-ruim">⚠ ${esc(i.erro)}</small>` : ''}</td>
        <td class="dir">${fechada ? N(i.qtd_conferida) : `<input type="number" min="0" step="1" value="${i.qtd_conferida ?? ''}" placeholder="${N(i.quantidade)}" data-c="entQtd" data-nota="${esc(n.id_tiny)}" data-item="${esc(i.id_item)}" style="width:80px;${dif ? 'border-color:var(--ruim)' : ''}">`}${dif ? '<br><small class="c-ruim">diferente da NF</small>' : ''}</td></tr>`; }).join('')}
    </tbody></table></div>
    ${fechada ? (n.status === 'ignorada' ? `<div class="acoes mt"><button class="btn peq" data-a="entReabrir" data-id="${esc(n.id_tiny)}">Reabrir</button></div>` : '') : `<div class="acoes mt">
      <button class="btn" data-a="entConferirTudo" data-id="${esc(n.id_tiny)}">✓ Chegou tudo igual à nota</button>
      <button class="btn pri" data-a="entLancar" data-id="${esc(n.id_tiny)}" ${pronto ? '' : 'disabled title="Ligue todos os itens e confira as quantidades"'}>📦 Lançar estoque no Tiny</button>
      <button class="btn peq" data-a="entIgnorar" data-id="${esc(n.id_tiny)}">Ignorar nota (uso e consumo, serviço…)</button>
      <button class="btn peq" data-a="expOcorrencia">⚠ Registrar avaria/falta</button></div>`}
  </div>`;
}

// ─── ações ───
async function entSync() { try { const r = await chamarFuncao('entrada-nf', { acao: 'sincronizar' }); await carregarEntradas(true); avisar(r.novas ? `${r.novas} nota(s) nova(s) ✓` : 'Nenhuma nota nova no Tiny.'); render(); } catch (e) { alert(e.message); } }
function entAbrirPor(txt) {
  const t = String(txt || '').replace(/\s/g, ''); if (!t) return;
  const dig = t.replace(/\D/g, '');
  const n = ENT.notas.find(x => (dig.length === 44 && x.chave === dig) || x.numero === t || Number(x.numero) === Number(dig));
  if (!n) return avisar(dig.length === 44 ? 'Essa chave ainda não está aqui: importe a nota no Buscador do Tiny e clique em "Buscar notas novas".' : 'Nota não encontrada.');
  UI.entNota = n.id_tiny; render();
}
async function entAcao(corpo, msg) {
  try { await chamarFuncao('entrada-nf', corpo); await carregarEntradas(true); if (msg) avisar(msg); render(); return true; }
  catch (e) { alert('Não gravou: ' + e.message); return false; }
}
async function entLancar(id) {
  const n = ENT.notas.find(x => x.id_tiny === id), its = ENT.itens[id] || [];
  const linhas = its.map(i => { const p = EXP.prod[String(i.produto_id)]; return `• ${N(Number(i.qtd_conferida) * (Number(i.fator) || 1))} × ${p?.codigo || i.produto_id} ${(p?.nome || '').slice(0, 40)}`; }).join('\n');
  if (!confirm(`Lançar no estoque do Tiny a NF ${n.numero} (${n.fornecedor})?\n\n${linhas}\n\nIsso dá ENTRADA no estoque com o custo da nota. Não dá para desfazer pela Intranet.`)) return;
  try {
    let r = await chamarFuncao('entrada-nf', { acao: 'lancar', id_nota: id }).catch(async e => {
      if (e.message !== 'divergencia') throw e;
      if (!confirm('Há itens com quantidade conferida DIFERENTE da nota.\n\nLançar mesmo assim (entra no estoque o que foi CONFERIDO)? Registre a falta/sobra como ocorrência.')) return null;
      return chamarFuncao('entrada-nf', { acao: 'lancar', id_nota: id, aceitar_divergencia: true });
    });
    if (r) { const falhas = (r.resultado || []).filter(x => !x.ok); if (falhas.length) alert('Alguns itens não entraram:\n' + falhas.map(f => `• ${f.item}: ${f.erro}`).join('\n')); else avisar('Estoque lançado no Tiny ✓'); }
  } catch (e) { alert('Não lançou: ' + e.message); }
  await carregarEntradas(true); render();
}

// ─── ligar item → produto (sugestões só quando o MODELO bate: E ≠ EG, B ≠ D, kit ≠ unidade) ───
/** Modelos do texto: palavras com número (sem medidas como 12V, 2MP) + a letra/sigla curta que vem logo depois
    ("AMT 2018 E" → 2018E; "AMT 2018 EG" → 2018EG; "VIP 1220 D" → 1220D), para não confundir variações do mesmo modelo. */
function modelosDe(s) {
  const PARE = new Set(['DE', 'DO', 'DA', 'COM', 'PARA', 'KIT', 'LED', 'USB', 'POE', 'HD', 'FULL', 'TIPO', 'CABO', 'CM', 'MM', 'COR', 'EM', 'SEM', 'UP']);
  const t = String(s || '').toUpperCase().normalize('NFD').replace(/\p{M}/gu, '').split(/[^A-Z0-9-]+/).filter(Boolean);
  const out = new Set();
  t.forEach((w, i) => {
    if (!/\d/.test(w) || w.length < 3 || /^\d+(V|W|MM|M|MP|GB|VA|DB|DBI|K|P|ML|A|MAH|AH)$/.test(w)) return;
    const ant = t[i - 1], prox = t[i + 1];
    const linha = ant && /^[A-Z]{2,5}$/.test(ant) && !PARE.has(ant) && ant !== 'E' ? ant : '';          // VIP, VHD, AMT, XB, MHDX…
    const sufixo = prox && /^[A-Z]{1,3}$/.test(prox) && !PARE.has(prox) ? prox : '';   // E, EG, D, B, SD… (depois de um modelo, "E" é sufixo)
    out.add(linha + w + (sufixo || ''));
  });
  return out;
}

async function entVincular(idNota, idItem) {
  const it = (ENT.itens[idNota] || []).find(i => i.id_item === idItem); if (!it) return;
  const ms = [...modelosDe(it.descricao)];
  let sugestoes = [];
  // busca pelo miolo numérico do modelo ("AMT2018E" → "2018") e só sugere quando linha + número + sufixo batem
  for (const m of ms.slice(0, 4)) {
    const nucleo = ((m.match(/[0-9][0-9A-Z-]*/) || [m])[0]).replace(/[A-Z]{1,3}$/, '').replace(/[%_]/g, '');
    if (nucleo.length >= 3) sugestoes.push(...await ok(sb.from('produtos').select('*').eq('situacao', 'A').ilike('nome', `%${nucleo}%`).limit(15)));
  }
  sugestoes = [...new Map(sugestoes.map(p => [p.id, p])).values()].filter(p => [...modelosDe(p.nome)].some(x => ms.includes(x))).slice(0, 8);
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>🔗 Ligar item ao produto do Tiny</h2>
    <p><b>Na nota:</b> ${esc(it.descricao)}<br><small class="mut">${N(it.quantidade)} ${esc(it.unidade || '')} · custo ${R(it.valor_unit)}</small></p>
    <p class="explica">Confira o <b>modelo completo</b> (ex.: AMT 2018 <b>E</b> ≠ AMT 2018 <b>EG</b>; VIP ≠ VHD; kit ≠ unidade). Se o produto não existe no Tiny, feche e use "Pedir cadastro".</p>
    <div style="display:flex;gap:8px"><input type="search" id="entProdBusca" placeholder="Código ou nome do produto" style="flex:1"><button class="btn" data-a="entProdBuscar">Buscar</button></div>
    <div id="entProdRes" class="mt">${sugestoes.length ? '<small class="mut">Sugestões com o mesmo modelo:</small>' + listaProdutosEnt(sugestoes) : '<small class="mut">Nenhum produto com o mesmo modelo; busque pelo código ou nome.</small>'}</div>
    <div class="form-grid mt"><label class="campo">Cada item da nota vira quantas unidades no estoque?<input type="number" id="entFator" min="1" step="1" value="${N(it.fator || 1)}"></label>
      <label class="campo" style="align-self:end"><span><input type="checkbox" id="entLembrar" checked> Lembrar para as próximas notas deste fornecedor</span></label></div>
    <input type="hidden" id="entCtx" value="${esc(idNota)}|${esc(idItem)}">`, true);
}
const listaProdutosEnt = ps => `<table class="tabela">${ps.map(p => `<tr><td><b>${esc(p.codigo || '')}</b> ${esc(p.nome || '')}<br><small class="mut">📍 ${esc(p.localizacao || p.unidade || '—')} · estoque ${N(p.saldo)} · ${p.gtin ? 'GTIN ' + esc(p.gtin) : 'sem GTIN'}${p.tipo === 'K' ? ' · KIT' : ''}</small></td>
  <td class="dir"><button class="btn pri peq" data-a="entEscolher" data-p="${esc(p.id)}" ${p.tipo === 'K' ? 'disabled title="Kit não recebe estoque"' : ''}>Usar este</button></td></tr>`).join('')}</table>`;
async function entProdBuscar() {
  const q = ($('#entProdBusca')?.value || '').trim().replace(/[%,()]/g, ' ');
  if (q.length < 2) return avisar('Digite pelo menos 2 letras.');
  const r = await ok(sb.from('produtos').select('*').eq('situacao', 'A').or(`codigo.ilike.%${q}%,nome.ilike.%${q}%`).order('codigo').limit(15));
  $('#entProdRes').innerHTML = r.length ? listaProdutosEnt(r) : '<div class="vazio">Nada encontrado.</div>';
}
async function entEscolher(prodId) {
  const [idNota, idItem] = ($('#entCtx')?.value || '').split('|');
  const fator = Number($('#entFator')?.value) || 1, lembrar = !!$('#entLembrar')?.checked;
  const { data: p } = await sb.from('produtos').select('*').eq('id', prodId).maybeSingle(); if (p) EXP.prod[String(p.id)] = p;
  fecharModal();
  await entAcao({ acao: 'vincular', id_nota: idNota, id_item: idItem, produto_id: prodId, fator, lembrar }, 'Item ligado ✓');
}
async function entPedirCadastro(idNota, idItem) {
  const n = ENT.notas.find(x => x.id_tiny === idNota), it = (ENT.itens[idNota] || []).find(i => i.id_item === idItem); if (!it) return;
  await formSolicitacao('cadastro_produto');
  const set = (k, v) => { const el = $('#' + k); if (el) el.value = v; };
  set('sf_titulo', `Cadastrar: ${it.descricao}`.slice(0, 120)); set('sf_nome_produto', it.descricao || ''); set('sf_fornecedor', n?.fornecedor || '');
  set('sf_custo', it.valor_unit ?? ''); set('sf_ncm', it.ncm || ''); set('sf_codigo_fabricante', it.codigo_forn || '');
  set('sf_descricao', `Chegou na NF ${n?.numero} de ${n?.fornecedor} (${N(it.quantidade)} ${it.unidade || ''} a ${R(it.valor_unit)}). Depois do cadastro, ligar o item na Entrada de NF e lançar o estoque.`);
}
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target?.id === 'entBusca') { e.preventDefault(); entAbrirPor(e.target.value); e.target.value = ''; } if (e.key === 'Enter' && e.target?.id === 'entProdBusca') { e.preventDefault(); entProdBuscar(); } });
