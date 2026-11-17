'use strict';
/* CRM Protemaxxi — Clientes: carteira, reativação, ficha do cliente, contatos e follow-ups. */

const TIPOS_INT = { ligacao: '📞 Ligação', whatsapp: '💬 WhatsApp', visita: '🤝 Visita', email: '✉ E-mail', nota: '📝 Anotação' };
const linkWa = fone => { const d = (fone || '').replace(/\D/g, ''); if (d.length < 10) return ''; return `https://wa.me/${d.startsWith('55') ? d : '55' + d}`; };
const docFmt = d => !d ? '' : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d;
const FILTROS_CLI = [['todos', 'Todos'], ['ativos', 'Compraram nos últimos 90 dias'], ['reativar', 'Para reativar'], ['uma', 'Compraram 1 vez'], ['followup', 'Com follow-up marcado']];

function filtrarClientes() {
  let l = D.clientes || [];
  const b = (UI.cliBusca || '').toLowerCase().trim(), bd = b.replace(/\D/g, '');
  if (b) l = l.filter(c => (c.nome || '').toLowerCase().includes(b) || (bd.length >= 3 && (c.doc || '').includes(bd)) || (c.cidade || '').toLowerCase().includes(b));
  if (UI.cliVend) l = l.filter(c => c.vendedor_id === UI.cliVend);
  const fu = new Set(D.interacoes.filter(i => i.proximo_contato && !i.feito).map(i => i.cliente_chave));
  if (UI.cliFiltro === 'ativos') l = l.filter(c => c.dias_sem_comprar <= 90);
  if (UI.cliFiltro === 'reativar') l = l.filter(c => c.dias_sem_comprar > 90 && c.meses >= 2);
  if (UI.cliFiltro === 'uma') l = l.filter(c => c.pedidos === 1);
  if (UI.cliFiltro === 'followup') l = l.filter(c => fu.has(c.chave));
  const ord = { total: (a, b) => b.total - a.total, ultima: (a, b) => (b.ultima || '').localeCompare(a.ultima || ''), parado: (a, b) => b.dias_sem_comprar - a.dias_sem_comprar, nome: (a, b) => (a.nome || '').localeCompare(b.nome || '') }[UI.cliOrdem];
  return [...l].sort(ord);
}
/** Iniciais do cliente (cor fixa pelo nome; só visual). */
const cliAvatar = (nome, tam = '') => { const p = String(nome || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean); const h = [...String(nome || '')].reduce((a, x) => (a * 31 + x.charCodeAt(0)) % 360, 11);
  return `<span class="avatar cli-av ${tam}" style="--h:${h}">${esc(((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase())}</span>`; };
function vClientes() {
  if (!D.clientes) { carregarClientes().then(render).catch(e => avisar(e.message)); return topo('Clientes', '') + `<div class="card">${esqueleto(8, 4)}</div>`; }
  UI.cliAba ||= 'carteira';
  const abasCli = [['carteira', 'Carteira'], ['melhores', 'Melhores clientes'], ['prospeccao', 'Prospecção de hoje'], ['agenda', 'Agenda WhatsApp'], ['parecidos', 'Cadastros parecidos']];
  const cab = topo('Clientes', `${D.clientes.length} clientes com compra nos últimos 12 meses · ${infoSync()}`, '<button class="btn" data-a="recarregarClientes">↻ Recarregar</button>')
    + `<div class="chips" style="margin-bottom:14px">${abasCli.map(([k, n]) => `<button class="chip ${UI.cliAba === k ? 'on' : ''}" data-a="cliAba" data-v="${k}">${n}</button>`).join('')}</div>`;
  if (UI.cliAba === 'melhores') return cab + abaMelhores();
  if (UI.cliAba === 'prospeccao') return cab + abaProspeccao();
  if (UI.cliAba === 'agenda') return cab + abaAgenda();
  if (UI.cliAba === 'parecidos') return cab + abaPares();
  const lista = filtrarClientes();
  const vendIds = [...new Set(D.clientes.map(c => c.vendedor_id).filter(Boolean))];
  const reativar = D.clientes.filter(c => c.dias_sem_comprar > 90 && c.meses >= 2);
  return cab
    + `<div class="grid g4"><div class="card kpi-card"><div class="rot">Clientes ativos (90 dias)</div><div class="val">${D.clientes.filter(c => c.dias_sem_comprar <= 90).length}</div></div>
      <div class="card kpi-card"><div class="rot">Para reativar</div><div class="val c-med">${reativar.length}</div><div class="sub">${R0(soma(reativar.map(c => c.total)))} comprados nos 12 meses</div></div>
      <div class="card kpi-card"><div class="rot">Compraram 1 vez só</div><div class="val">${D.clientes.filter(c => c.pedidos === 1).length}</div></div>
      <div class="card kpi-card"><div class="rot">Follow-ups para hoje</div><div class="val">${D.interacoes.filter(i => i.proximo_contato && !i.feito && i.proximo_contato <= hoje()).length}</div></div></div>
    <div class="filtros mt"><input type="search" placeholder="Buscar por nome, CPF/CNPJ ou cidade" value="${esc(UI.cliBusca)}" data-c="ui" data-k="cliBusca" data-fid="cliBusca">
      <select data-c="ui" data-k="cliVend"><option value="">Todos os vendedores</option>${vendIds.map(v => `<option value="${v}" ${UI.cliVend === v ? 'selected' : ''}>${esc(nomeVendedor(v))}</option>`).join('')}</select>
      <select data-c="ui" data-k="cliOrdem">${[['total', 'Maior compra'], ['ultima', 'Compra mais recente'], ['parado', 'Mais tempo parado'], ['nome', 'Nome']].map(([v, n]) => `<option value="${v}" ${UI.cliOrdem === v ? 'selected' : ''}>Ordenar: ${n}</option>`).join('')}</select></div>
    <div class="chips" style="margin-bottom:12px">${FILTROS_CLI.map(([k, n]) => `<button class="chip ${UI.cliFiltro === k ? 'on' : ''}" data-a="cliFiltro" data-v="${k}">${n}</button>`).join('')}</div>
    ${UI.cliFiltro === 'reativar' ? '<p class="mut" style="margin-top:-4px">Clientes que compraram em pelo menos 2 meses diferentes e estão há mais de 90 dias sem comprar. Comece pelos maiores.</p>' : ''}
    <div class="card rolagem"><table class="tabela"><thead><tr><th>Cliente</th><th>Cidade</th><th>Vendedor</th><th class="dir">12 meses</th><th class="dir">Pedidos</th><th>Última compra</th><th>Telefone</th><th>Celular</th><th>E-mail</th></tr></thead><tbody>
      ${lista.slice(0, 300).map(c => `<tr class="clic" data-a="verCliente" data-chave="${esc(c.chave)}"><td><div class="cli-nome">${cliAvatar(c.nome)}<div><b>${esc(c.nome)}</b><small>${docFmt(c.doc) || (c.chave.startsWith('n:') ? 'sem CPF/CNPJ' : '')}</small></div></div></td><td>${esc(c.cidade || '')}${c.uf ? '/' + esc(c.uf) : ''}</td><td><span class="ped-vend">${pedAvatar(c.vendedor_id)}${esc(nomeVendedor(c.vendedor_id).split(' ')[0])}</span></td><td class="dir num">${R0(c.total)}</td><td class="dir num">${c.pedidos}</td><td class="nowrap">${fmtCurta(c.ultima)}/${c.ultima.slice(2, 4)} <span class="tag pilula ${c.dias_sem_comprar > 90 ? 'med' : 'ok'}">${c.dias_sem_comprar} d</span></td><td class="nowrap"><small>${c.telefone ? esc(foneFmt(c.telefone)) : '<span class="mut">—</span>'}</small></td>
        <td class="nowrap"><small>${c.celular ? `${esc(foneFmt(c.celular))} <a class="wa cli-wa" href="https://wa.me/${c.celular}" target="_blank" rel="noopener" title="Abrir WhatsApp" data-a="nadaBusca">${icone('atendimento', 14)}</a>` : '<span class="mut">—</span>'}</small></td>
        <td><small>${c.email ? `<a href="mailto:${esc(c.email)}" data-a="nadaBusca">${esc(c.email)}</a>` : '<span class="mut">—</span>'}</small></td></tr>`).join('') || '<tr><td colspan="9" class="vazio">Nenhum cliente com esses filtros.</td></tr>'}
    </tbody></table>${lista.length > 300 ? `<p class="mut">Mostrando 300 de ${lista.length}.</p>` : ''}</div>`;
}

async function abrirCliente(chave) {
  if (!chave) return;
  await carregarClientes();
  const c = D.clientes.find(x => x.chave === chave);
  const peds = D.pedidos.filter(p => p.cliente_chave === chave);
  const nome = c?.nome || peds[0]?.cliente_nome || 'Cliente';
  const ints = D.interacoes.filter(i => i.cliente_chave === chave);
  const sols = D.solicitacoes.filter(s => s.dados?.cliente_chave === chave);
  const ids = peds.map(p => p.id).slice(0, 60);
  const itens = ids.length ? await ok(sb.from('pedido_itens').select('pedido_id,codigo,descricao,quantidade,valor_unitario').in('pedido_id', ids)).catch(() => []) : [];
  const prod = Object.values(itens.reduce((a, i) => { const k = i.codigo || i.descricao; (a[k] ||= { cod: i.codigo, desc: i.descricao, q: 0, v: 0 }); a[k].q += +i.quantidade; a[k].v += i.quantidade * i.valor_unitario; return a; }, {})).sort((a, b) => b.v - a.v).slice(0, 12);
  const wa = linkWa(c?.fone);
  const oss = (await carregarOS().catch(() => [])).filter(o => o.cliente_chave === chave);
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button>
    <div class="cli-perfil">${cliAvatar(nome, 'g')}<div class="cli-perfil-c"><h2>${esc(nome)}</h2>
      <p class="mut">${[docFmt(c?.doc), c?.cidade && `${c.cidade}/${c.uf || ''}`].filter(Boolean).map(esc).join(' · ')}</p>
      <div class="cli-selos">${c ? `<span class="tag pilula ${c.dias_sem_comprar > 90 ? 'med' : 'ok'}">${c.dias_sem_comprar > 90 ? 'Para reativar' : 'Ativo'}</span>` : ''}${c?.vendedor_id ? `<span class="ped-vend">${pedAvatar(c.vendedor_id)}${esc(nomeVendedor(c.vendedor_id))}</span>` : ''}</div></div>
      ${c?.celular ? `<a class="btn pri cli-wa-btn" href="https://wa.me/${c.celular}" target="_blank" rel="noopener">${icone('atendimento', 16)} WhatsApp</a>` : ''}</div>
    <div class="cli-contato"><span>${icone('telefone', 15)}<b>Telefone</b> ${c?.telefone ? esc(foneFmt(c.telefone)) : '<span class="mut">—</span>'}</span>
      <span>${icone('atendimento', 15)}<b>Celular</b> ${c?.celular ? esc(foneFmt(c.celular)) : '<span class="mut">—</span>'}</span>
      <span>${icone('emails', 15)}<b>E-mail</b> ${c?.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '<span class="mut">—</span>'}</span></div>
    <div id="cliTels" class="cli-tels" data-chave="${esc(chave)}">${blocoTelsFicha(chave)}</div>
    <div id="cliPares" data-chave="${esc(chave)}"></div>
    ${c ? `<div class="grid g4" style="gap:10px"><div class="card kpi-card"><div class="rot">12 meses</div><div class="val" style="font-size:20px">${R0(c.total)}</div></div><div class="card kpi-card"><div class="rot">Pedidos</div><div class="val" style="font-size:20px">${c.pedidos}</div></div><div class="card kpi-card"><div class="rot">Ticket médio</div><div class="val" style="font-size:20px">${R0(c.total / c.pedidos)}</div></div><div class="card kpi-card"><div class="rot">Sem comprar</div><div class="val c-${c.dias_sem_comprar > 90 ? 'med' : 'ok'}" style="font-size:20px">${c.dias_sem_comprar} dias</div></div></div>` : ''}
    ${blocoCreditoFicha(chave, nome)}
    ${blocoFichaCRM(c)}
    <details class="card mt" open><summary><b>Linha do tempo</b> <small class="mut">compras, contatos, campanha, negócios e OS</small></summary><div id="cliLinha" data-chave="${esc(chave)}"><p class="mut">Montando…</p></div></details>
    <div class="acoes mt"><button class="btn pri" data-a="novaInteracao" data-chave="${esc(chave)}" data-nome="${esc(nome)}">+ Registrar contato</button><button class="btn" data-a="novaSolicitacao" data-chave="${esc(chave)}" data-nome="${esc(nome)}">+ Solicitação sobre este cliente</button></div>
    <div class="grid g2 mt"><div><h3>Histórico de contatos</h3>${ints.length ? ints.map(i => `<div class="coment"><div class="meta">${TIPOS_INT[i.tipo] || i.tipo} · ${esc(pessoa(i.autor_id)?.nome || '')} · ${new Date(i.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${i.proximo_contato ? ` · <b>próximo contato ${fmtCurta(i.proximo_contato)}</b>${i.feito ? ' ✓' : ''}` : ''}</div><p>${esc(i.texto)}</p></div>`).join('') : '<p class="mut">Nenhum contato registrado ainda.</p>'}
      ${oss.length ? `<h3 class="mt">Ordens de serviço</h3>${oss.slice(0, 10).map(o => `<div class="coment" data-a="verOS" data-id="${o.id}" style="cursor:pointer"><div class="meta">OS ${esc(o.numero || o.id)} · ${o.data ? fmtCurta(o.data) : ''} · <span class="st ${COR_OS[o.situacao] || ''}">${esc(o.situacao || '')}</span></div><p>${esc(o.equipamento || o.descricao_problema || '')}</p></div>`).join('')}` : ''}
      ${sols.length ? `<h3 class="mt">Solicitações</h3>${sols.map(s => `<div class="coment" data-a="verSolicitacao" data-id="${s.id}" style="cursor:pointer"><div class="meta">#${s.id} · ${TIPOS_SOL[s.tipo]?.nome || s.tipo} · <span class="st st-${s.status}">${STATUS_SOL[s.status]}</span></div><p>${esc(s.titulo)}</p></div>`).join('')}` : ''}</div>
    <div><h3>Produtos que mais compra</h3>${prod.length ? `<table class="tabela"><tbody>${prod.map(x => `<tr><td><small>${esc(x.cod || '')}</small> ${esc(x.desc)}</td><td class="dir">${N(x.q)}</td><td class="dir">${R0(x.v)}</td></tr>`).join('')}</tbody></table>` : '<p class="mut">Os itens dos pedidos ainda estão sendo baixados do Tiny.</p>'}
      <h3 class="mt">Pedidos</h3><table class="tabela"><tbody>${peds.slice(0, 30).map(p => `<tr class="clic" data-a="verPedido" data-id="${p.id}"><td>${fmtCurta(p.data)}/${p.data.slice(2, 4)}</td><td>nº ${esc(p.numero)}<br><small>${esc(nomeVendedor(p.vendedor_id))}</small></td><td><span class="tag pilula ${pedSitCls(p.situacao)}">${esc(p.situacao)}</span></td><td class="dir num">${R0(p.valor)}</td></tr>`).join('') || '<tr><td class="mut">—</td></tr>'}</tbody></table></div></div>`, true);
  carregarTelsFicha(chave);
  linhaTempoCliente(chave);
  carregarParesFicha(chave).catch(() => {});
}

function formInteracao(chave, nome) {
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Registrar contato</h2><p class="mut">${esc(nome)}</p>
    <div class="form-grid"><label class="campo">Tipo<select id="intTipo">${Object.entries(TIPOS_INT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    <label class="campo">Próximo contato (opcional)<input type="date" id="intProx" min="${hoje()}"></label>
    <label class="campo inteiro">O que foi conversado<textarea id="intTexto" rows="4" placeholder="Ex.: pediu orçamento de 8 câmeras para o galpão. Retornar na sexta com proposta."></textarea></label></div>
    <div class="mt"><button class="btn pri" data-a="salvarInteracao" data-chave="${esc(chave)}" data-nome="${esc(nome)}">Salvar</button></div>`);
}
async function salvarInteracao(chave, nome) {
  const texto = $('#intTexto').value.trim(); if (!texto) { avisar('Escreva o que foi conversado.'); return; }
  const novo = await ok(sb.from('interacoes').insert({ cliente_chave: chave, cliente_nome: nome, autor_id: EU.id, tipo: $('#intTipo').value, texto, proximo_contato: $('#intProx').value || null }).select().single());
  D.interacoes.unshift(novo); render(); avisar('Contato registrado.'); abrirCliente(chave);
}
function followupsHoje(pid) {
  return D.interacoes.filter(i => i.proximo_contato && !i.feito && i.proximo_contato <= hoje() && (!pid || i.autor_id === pid)).sort((a, b) => a.proximo_contato.localeCompare(b.proximo_contato));
}
async function concluirFollowup(id) {
  await ok(sb.from('interacoes').update({ feito: true }).eq('id', id));
  const i = D.interacoes.find(x => String(x.id) === String(id)); if (i) i.feito = true; render();
}
