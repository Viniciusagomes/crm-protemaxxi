'use strict';
/* Intranet Protemaxxi — Melhores clientes (RFM + curva ABC) e campanha diária de prospecção.
   RFM: Recência (dias sem comprar), Frequência (pedidos) e Valor (R$) nos últimos 12 meses, em notas de 1 a 5 (quintis). */

const SEGMENTOS = {
  campeoes: { n: '🏆 Campeões', d: 'Compram muito, sempre e recentemente', acao: 'Tratamento VIP, lançamento em primeira mão, pedir indicação' },
  fieis: { n: '💚 Fiéis', d: 'Compram com frequência', acao: 'Programa de indicação, condição para volume' },
  promissores: { n: '🌟 Promissores', d: 'Compraram recentemente, ainda pouco', acao: 'Mostrar o mix: câmeras, alarmes, acessórios' },
  novos: { n: '🌱 Novos', d: 'Primeira compra nos últimos 60 dias', acao: 'Pós-venda e segunda compra' },
  em_risco: { n: '⚠️ Em risco', d: 'Compravam bem e estão sumindo', acao: 'Ligar já: oferta personalizada' },
  atencao: { n: '👀 Precisam de atenção', d: 'No meio do caminho', acao: 'Ofertas da semana' },
  hibernando: { n: '💤 Hibernando', d: 'Pouco e há muito tempo', acao: 'Campanha de reativação' },
};
const TIPOS_CLI = { instalador: '🛠 Instalador', revenda: '🏪 Revenda', condominio: '🏢 Condomínio', empresa: '🏭 Empresa', orgao_publico: '🏛 Órgão público', consumidor: '🏠 Consumidor final' };
/** Tipo do cliente: o marcado na ficha, ou um palpite pelo nome e pelo jeito de comprar. */
function tipoCli(c) {
  if (c.tipo_cliente) return c.tipo_cliente;
  const n = semAcento(c.nome || '').toUpperCase();
  if (/CONDOMINIO|COND\.|EDIFICIO|RESIDENCIAL/.test(n)) return 'condominio';
  if (/PREFEITURA|CAMARA MUNICIPAL|SECRETARIA|MUNICIPIO|ESTADO DE|FUNDACAO|UNIVERSIDADE/.test(n)) return 'orgao_publico';
  if (c.pedidos >= 6) return 'instalador';
  return c.tipo_pessoa === 'J' || (c.doc || '').length === 14 ? 'empresa' : 'consumidor';
}
const ehInstalador = c => ['instalador', 'revenda'].includes(tipoCli(c));

/** Calcula RFM, segmento e curva ABC para a carteira carregada (D.clientes). Guarda o resultado em cache por tamanho da lista. */
function rfm() {
  const l = D.clientes || [];
  if (rfm.cache && rfm.cache.n === l.length && rfm.cache.ref === l) return rfm.cache.mapa;
  const nota = (vals, inverso) => { const ord = [...vals].sort((a, b) => a - b); return v => { let i = ord.findIndex(x => x >= v); if (i < 0) i = ord.length - 1; const q = Math.min(5, 1 + Math.floor(i / ord.length * 5)); return inverso ? 6 - q : q; }; };
  const nR = nota(l.map(c => +c.dias_sem_comprar), true), nF = nota(l.map(c => +c.pedidos)), nM = nota(l.map(c => +c.total));
  const totalGeral = soma(l.map(c => +c.total)) || 1;
  let acc = 0; const abc = {};
  for (const c of [...l].sort((a, b) => b.total - a.total)) { acc += +c.total; abc[c.chave] = acc / totalGeral <= 0.8 ? 'A' : acc / totalGeral <= 0.95 ? 'B' : 'C'; }
  const mapa = {};
  for (const c of l) {
    const r = nR(+c.dias_sem_comprar), f = nF(+c.pedidos), m = nM(+c.total);
    const novo = c.primeira && (Date.now() - pd(c.primeira)) / 864e5 <= 60 && c.pedidos <= 2;
    const seg = r >= 4 && f >= 4 && m >= 4 ? 'campeoes' : novo ? 'novos' : f >= 4 && r >= 3 ? 'fieis' : r >= 4 && f <= 2 ? 'promissores'
      : r <= 2 && (f >= 3 || m >= 4) ? 'em_risco' : r <= 2 ? 'hibernando' : 'atencao';
    mapa[c.chave] = { r, f, m, seg, abc: abc[c.chave] };
  }
  rfm.cache = { n: l.length, ref: l, mapa };
  return mapa;
}
const seloSeg = k => k ? `<span class="tag seg-${k}" title="${esc(SEGMENTOS[k].d)}">${SEGMENTOS[k].n}</span>` : '';

function abaMelhores() {
  const mapa = rfm(), todos = D.clientes;
  const fT = UI.melTipo || 'todos', fS = UI.melSeg || '';
  const base = todos.filter(c => fT === 'todos' || (fT === 'instaladores' ? ehInstalador(c) : !ehInstalador(c)));
  const lista = base.filter(c => !fS || mapa[c.chave]?.seg === fS).sort((a, b) => b.total - a.total);
  const porSeg = k => base.filter(c => mapa[c.chave]?.seg === k);
  const totalBase = soma(base.map(c => +c.total)) || 1;
  const abcN = k => base.filter(c => mapa[c.chave]?.abc === k);
  return `<div class="filtros"><div class="chips">${[['todos', 'Todos'], ['instaladores', '🛠 Instaladores e revendas'], ['finais', '🏠 Consumidor final e empresas']].map(([k, n]) => `<button class="chip ${fT === k ? 'on' : ''}" data-a="melTipo" data-v="${k}">${n}</button>`).join('')}</div></div>
    <div class="segs">${Object.entries(SEGMENTOS).map(([k, s]) => { const l = porSeg(k);
      return `<div class="card seg-card clic ${fS === k ? 'on' : ''}" data-a="melSeg" data-v="${k}"><div class="seg-n">${s.n}</div><div class="seg-v">${l.length}</div>
        <div class="sub">${R0(soma(l.map(c => +c.total)))} · ${P(soma(l.map(c => +c.total)) / totalBase)} da venda</div><div class="seg-acao">${s.acao}</div></div>`; }).join('')}</div>
    <div class="grid g3 mt">${['A', 'B', 'C'].map(k => { const l = abcN(k); return `<div class="card kpi-card"><div class="rot">Curva ${k} ${k === 'A' ? '· 80% da venda' : k === 'B' ? '· próximos 15%' : '· últimos 5%'}</div><div class="val">${l.length} <small style="font-size:14px">cliente(s)</small></div><div class="sub">${P(l.length / (base.length || 1))} da carteira · ${R0(soma(l.map(c => +c.total)))}</div></div>`; }).join('')}</div>
    <div class="card mt"><div class="secao-titulo"><h2>${fS ? SEGMENTOS[fS].n : 'Ranking da carteira'}</h2><small>${lista.length} cliente(s) · últimos 12 meses${fS ? ` · <a href="#" data-a="melSeg" data-v="">ver todos</a>` : ''}</small></div>
      ${fS ? `<p class="explica" style="margin-top:0"><b>O que fazer:</b> ${SEGMENTOS[fS].acao}.</p>` : ''}
      ${listaCurta('melLista', `<table class="tabela"><thead><tr><th>#</th><th>Cliente</th><th>Segmento</th><th class="cen">ABC</th><th class="cen" title="Recência · Frequência · Valor (1 a 5)">R·F·V</th><th>Vendedor</th><th class="dir">12 meses</th><th class="dir">Pedidos</th><th>Última</th></tr></thead><tbody>
        ${lista.slice(0, 500).map((c, i) => { const x = mapa[c.chave] || {}; return `<tr class="clic" data-a="verCliente" data-chave="${esc(c.chave)}"><td class="mut">${i + 1}</td><td><b>${esc(c.nome)}</b><br><small>${TIPOS_CLI[tipoCli(c)] || ''}${c.cidade ? ' · ' + esc(c.cidade) : ''}${c.fone ? '' : ' · <span class="c-med">sem telefone</span>'}</small></td>
          <td>${seloSeg(x.seg)}</td><td class="cen"><b>${x.abc || ''}</b></td><td class="cen"><small>${x.r}·${x.f}·${x.m}</small></td><td><span style="color:${corVendedor(c.vendedor_id)}">●</span> <small>${esc(nomeVendedor(c.vendedor_id))}</small></td>
          <td class="dir num">${R0(c.total)}</td><td class="dir">${c.pedidos}</td><td><small>${fmtCurta(c.ultima)}/${String(c.ultima).slice(2, 4)}</small></td></tr>`; }).join('')}
      </tbody></table>`, 'Buscar cliente, cidade, vendedor…', true)}
      <div class="acoes mt"><button class="btn peq" data-a="melCsv">⬇ Baixar CSV (para campanhas)</button></div></div>`;
}
function melCsv() {
  const mapa = rfm();
  const linhas = [['nome', 'documento', 'telefone', 'email', 'cidade', 'tipo', 'segmento', 'abc', 'total_12m', 'pedidos', 'ultima_compra', 'vendedor']]
    .concat((D.clientes || []).filter(c => !c.nao_contatar).map(c => { const x = mapa[c.chave] || {}; return [c.nome, c.doc || '', c.fone || '', c.email || '', c.cidade || '', TIPOS_CLI[tipoCli(c)] || '', SEGMENTOS[x.seg]?.n || '', x.abc || '', Math.round(c.total), c.pedidos, c.ultima, nomeVendedor(c.vendedor_id)]; }));
  const csv = '﻿' + linhas.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `clientes-${hoje()}.csv`; a.click();
}

// ─── campanha diária de prospecção ───
const LISTAS_PRO = {
  complemento: ['🧩 Complemento', 'azul'], recompra: ['🔁 Recompra', 'ok'], reativacao: ['⚠️ Reativação', 'med'],
  indicacao: ['🤝 Indicação', ''], instalador: ['🛠 Instalador', ''], novo: ['🏢 Cliente novo', ''],
};
const RES_PRO = { respondeu: '💬 Respondeu', orcamento: '📝 Pediu orçamento', comprou: '✅ Comprou', sem_resposta: '⏳ Sem resposta', sem_interesse: '🚫 Sem interesse', numero_errado: '☎️ Número errado', pular: '↷ Pular' };
const PRO = { dados: null, chave: '', carregando: false, hist: null };

async function carregarProspeccao(forcar) {
  const quem = UI.proPessoa || EU.id, chave = hoje() + quem;
  if (PRO.dados && PRO.chave === chave && !forcar) return;
  PRO.carregando = true;
  try {
    const [hojeL, hist] = await Promise.all([
      ok(sb.from('prospeccao').select('*').eq('data', hoje()).eq('pessoa_id', quem).order('id')),
      todas(() => sb.from('prospeccao').select('id,data,pessoa_id,cliente_chave,lista,resultado').gte('data', addDias(hoje(), -30))),
    ]);
    PRO.dados = hojeL; PRO.hist = hist; PRO.chave = chave;
  } finally { PRO.carregando = false; }
}
const nomeCurtoCli = n => { const s = (n || '').trim(); if (!s || /LTDA|EIRELI|\bME\b|S\/A|CONDOM|COMERCIO|SERVI[CÇ]OS|EMPREENDIMENTOS/i.test(s)) return ''; const p = s.split(/\s+/)[0]; return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); };
/** Mensagem pronta (o vendedor revisa antes de enviar). */
function mensagemPro(x, vendedor) {
  const ola = nomeCurtoCli(x.cliente_nome) ? `Olá, ${nomeCurtoCli(x.cliente_nome)}!` : 'Olá, tudo bem?';
  const eu = `Aqui é o ${vendedor} da Protemaxxi.`, d = x.dados || {};
  return {
    complemento: `${ola} ${eu} Vi que você levou ${(d.produto || 'um equipamento').slice(0, 60)} com a gente. Já tem ${d.sugestao || 'os acessórios'}? Temos em estoque e posso separar pra você. 😉`,
    recompra: `${ola} ${eu} Faz uns ${d.dias || ''} dias que você repôs ${d.itens || 'material'} com a gente. Precisa de reposição? Tenho em estoque pra retirar hoje.`,
    reativacao: `${ola} ${eu} Faz um tempo que não nos falamos! Chegaram novidades em câmeras, alarmes e acessórios. Posso te mandar as ofertas da semana?`,
    indicacao: `${ola} ${eu} Obrigado pela parceria! Conhece alguém (vizinho, síndico, empresa) que precise de câmeras ou alarme? Vou atender sua indicação com todo cuidado.`,
    instalador: `${ola} ${eu} Separei as novidades da semana para instaladores, com condição especial. Quer que eu te mande a lista?`,
    novo: `${ola} ${eu} Somos revenda autorizada de segurança eletrônica em Campinas. Posso te apresentar as soluções para o seu negócio?`,
  }[x.lista] || `${ola} ${eu}`;
}

function abaProspeccao() {
  const vends = D.pessoas.filter(p => p.ativo && p.tiny && pessoasQueVejo().includes(p.id));
  if (!UI.proPessoa || !vends.some(p => p.id === UI.proPessoa)) UI.proPessoa = vends.some(p => p.id === EU.id) ? EU.id : vends[0]?.id;
  if (!UI.proPessoa) return '<div class="card vazio">A campanha de prospecção é para vendedores ligados ao Tiny.</div>';
  const chave = hoje() + UI.proPessoa;
  if (!PRO.dados || PRO.chave !== chave) { if (!PRO.carregando) carregarProspeccao().then(render).catch(e => avisar(e.message)); return '<div class="card vazio">Carregando a campanha de hoje…</div>'; }
  const quem = pessoa(UI.proPessoa), cli = Object.fromEntries((D.clientes || []).map(c => [c.chave, c])), mapa = rfm();
  const feitos = PRO.dados.filter(x => x.resultado), pct = PRO.dados.length ? feitos.length / PRO.dados.length : 0;
  // resultados dos últimos 30 dias: venda = pedido do cliente em até 15 dias depois do contato
  const comprou = x => x.resultado === 'comprou' || D.pedidos.some(p => p.cliente_chave === x.cliente_chave && valido(p) && p.data >= x.data && p.data <= addDias(x.data, 15));
  const ind = vends.map(v => { const h = PRO.hist.filter(x => x.pessoa_id === v.id && x.resultado && x.resultado !== 'pular');
    const vend = h.filter(comprou); const fat = soma(vend.map(x => somaV(D.pedidos.filter(p => p.cliente_chave === x.cliente_chave && valido(p) && p.data >= x.data && p.data <= addDias(x.data, 15)))));
    return { v, n: h.length, resp: h.filter(x => ['respondeu', 'orcamento', 'comprou'].includes(x.resultado)).length, orc: h.filter(x => x.resultado === 'orcamento').length, vendas: vend.length, fat }; });
  const card = x => { const c = cli[x.cliente_chave] || {}, l = LISTAS_PRO[x.lista] || [x.lista, ''], fone = c.fone || '', msg = mensagemPro(x, quem?.nome?.split(' ')[0] || ''), wa = linkWa(fone);
    return `<div class="pro-card ${x.resultado ? 'feito' : ''}" id="pro_${x.id}">
      <div class="pro-topo"><span class="tag ${l[1]}">${l[0]}</span>${seloSeg(mapa[x.cliente_chave]?.seg)}${seloCredito(x.cliente_chave)}${x.resultado ? `<span class="tag ok">${RES_PRO[x.resultado]}</span>` : ''}</div>
      <div class="pro-nome"><a href="#" data-a="verCliente" data-chave="${esc(x.cliente_chave)}">${esc(x.cliente_nome || c.nome || '')}</a> <small class="mut">${esc(c.cidade || '')}</small></div>
      <div class="pro-motivo">${esc(x.motivo || '')}</div>
      ${fone ? `<div class="pro-fone">📱 ${esc(fone)}</div>` : `<div class="pro-fone sem"><input type="tel" placeholder="Sem telefone: digite com DDD" id="proFone_${x.id}"><button class="btn peq" data-a="proFone" data-id="${x.id}" data-chave="${esc(x.cliente_chave)}">Salvar</button></div>`}
      <textarea class="pro-msg" id="proMsg_${x.id}" rows="3">${esc(msg)}</textarea>
      <div class="acoes">${wa ? `<a class="btn pri peq" href="#" data-a="proWa" data-id="${x.id}" data-fone="${esc(fone)}">💬 Chamar no WhatsApp</a><a class="btn peq" href="tel:${esc(fone.replace(/\D/g, ''))}">📞 Ligar</a>` : ''}</div>
      <div class="pro-res">${Object.entries(RES_PRO).map(([k, n]) => `<button class="chip ${x.resultado === k ? 'on' : ''}" data-a="proRes" data-id="${x.id}" data-v="${k}">${n}</button>`).join('')}</div></div>`; };
  return `<div class="filtros">${vends.length > 1 ? `<div class="chips">${vends.map(v => `<button class="chip ${UI.proPessoa === v.id ? 'on' : ''}" data-a="proPessoa" data-v="${v.id}">${esc(v.nome)}</button>`).join('')}</div>` : ''}
      ${ehDono() ? `<button class="btn peq" data-a="proGerar">↻ Gerar listas que faltam hoje</button>` : ''}</div>
    <div class="card"><div class="secao-titulo"><div><div class="eyebrow">Campanha de hoje · ${fmtData(hoje())}</div><h2 style="margin:4px 0 0">${esc(quem?.nome || '')}: ${feitos.length} de ${PRO.dados.length} contatos</h2></div>
      <small>Máx. 1 abordagem por cliente a cada 30 dias · "Sem interesse" sai por 90 dias</small></div>${barra(pct)}</div>
    ${PRO.dados.length ? `<div class="pro-grid mt">${[...PRO.dados].sort((a, b) => !!a.resultado - !!b.resultado).map(card).join('')}</div>`
      : `<div class="card vazio mt">A lista de hoje ainda não foi gerada. Ela sai sozinha às 7h (segunda a sábado).<br><br><button class="btn pri" data-a="proGerar">Gerar a minha lista agora</button></div>`}
    <div class="card mt"><div class="secao-titulo"><h2>Resultado da prospecção</h2><small>últimos 30 dias · venda = pedido em até 15 dias depois do contato</small></div>
      <div class="rolagem"><table class="tabela"><thead><tr><th>Vendedor</th><th class="dir">Contatos</th><th class="dir">Responderam</th><th class="dir">Orçamentos</th><th class="dir">Vendas</th><th class="dir">Faturamento gerado</th></tr></thead><tbody>
      ${ind.map(x => `<tr><td><b>${esc(x.v.nome)}</b></td><td class="dir">${x.n}</td><td class="dir">${x.resp} <small>(${P(x.n ? x.resp / x.n : 0)})</small></td><td class="dir">${x.orc}</td><td class="dir"><b>${x.vendas}</b></td><td class="dir num">${R0(x.fat)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
}

async function proRes(id, res) {
  const x = PRO.dados.find(r => String(r.id) === String(id)); if (!x) return;
  const novo = x.resultado === res ? null : res;
  await ok(sb.from('prospeccao').update({ resultado: novo, resultado_em: novo ? new Date().toISOString() : null }).eq('id', x.id));
  x.resultado = novo;
  if (novo && !['pular'].includes(novo)) {
    const prox = novo === 'orcamento' ? addDias(hoje(), 2) : novo === 'sem_resposta' ? addDias(hoje(), 3) : null;
    const int = await ok(sb.from('interacoes').insert({ cliente_chave: x.cliente_chave, cliente_nome: x.cliente_nome, autor_id: EU.id, tipo: 'whatsapp',
      texto: `Prospecção (${LISTAS_PRO[x.lista]?.[0] || x.lista}): ${RES_PRO[novo]}. ${x.motivo || ''}`.trim(), proximo_contato: prox }).select().single()).catch(() => null);
    if (int) D.interacoes.unshift(int);
    if (novo === 'numero_errado' || novo === 'sem_interesse') avisar(novo === 'sem_interesse' ? 'Ok: este cliente sai das campanhas por 90 dias.' : 'Ok: corrija o telefone na ficha do cliente quando puder.');
    if (prox) avisar(`Follow-up marcado para ${fmtCurta(prox)}.`);
  }
  const h = PRO.hist.find(r => r.id === x.id); if (h) h.resultado = novo; else PRO.hist.push({ ...x });
  render();
}
function proWa(id, fone) {
  const msg = $('#proMsg_' + id)?.value || '';
  const url = linkWa(fone); if (!url) return;
  window.open(`${url}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}
async function proFone(id, chave) {
  const v = $('#proFone_' + id)?.value || '';
  await ok(sb.rpc('cliente_marcar', { p_chave: chave, p_fone: v }));
  const c = (D.clientes || []).find(x => x.chave === chave); if (c) c.fone = v.replace(/\D/g, '');
  avisar('Telefone salvo.'); render();
}
async function proGerar() {
  const n = await ok(sb.rpc('prospeccao_gerar'));
  avisar(`Listas geradas: ${n} contato(s) no total de hoje.`);
  await carregarProspeccao(true); render();
}

// ─── ficha do cliente: tipo, "não contatar", telefone e observação ───
function blocoFichaCRM(c) {
  if (!c) return '';
  const x = rfm()[c.chave] || {};
  const hist = (PRO.hist || []).filter(p => p.cliente_chave === c.chave);
  return `<div class="ficha-crm">
    <div class="ficha-selos">${seloSeg(x.seg)} <span class="tag">Curva ${x.abc || '—'}</span> <span class="tag" title="Recência · Frequência · Valor">R${x.r}·F${x.f}·V${x.m}</span>${c.nao_contatar ? ' <span class="tag ruim">🚫 Não contatar</span>' : ''}</div>
    <div class="form-grid" style="margin-top:8px">
      <label class="campo">Tipo de cliente<select id="fcTipo"><option value="">${esc('Automático: ' + (TIPOS_CLI[tipoCli({ ...c, tipo_cliente: null })] || ''))}</option>${Object.entries(TIPOS_CLI).map(([k, n]) => `<option value="${k}" ${c.tipo_cliente === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="campo">Telefone / WhatsApp<input type="tel" id="fcFone" value="${esc(c.fone || '')}" placeholder="DDD + número"></label>
      <label class="campo inteiro">Observações do cliente<textarea id="fcObs" rows="2" placeholder="Ex.: síndico é o Sr. Carlos; prefere WhatsApp à tarde">${esc(c.obs || '')}</textarea></label>
      <label class="campo"><span><input type="checkbox" id="fcNao" ${c.nao_contatar ? 'checked' : ''}> Não incluir em campanhas de prospecção</span></label>
    </div>
    ${(CRM.neg || []).filter(n => n.cliente_chave === c.chave).map(n => `<div class="atv"><div style="flex:1"><b>🎯 ${esc(n.titulo)}</b><br><small>${NOME_ETAPA[n.etapa]} · ${R0(n.valor)} · ${esc(nomeP(n.pessoa_id))}</small></div><button class="btn peq" data-a="crmAbrir" data-id="${n.id}">Abrir</button></div>`).join('')}
    <div class="acoes"><button class="btn peq pri" data-a="fichaSalvar" data-chave="${esc(c.chave)}">Salvar dados do cliente</button><button class="btn peq" data-a="crmNovo" data-chave="${esc(c.chave)}" data-nome="${esc(c.nome)}">🎯 Novo negócio</button>
      ${hist.length ? `<small class="mut">Prospecção: ${hist.map(h => `${fmtCurta(h.data)} ${LISTAS_PRO[h.lista]?.[0] || h.lista}${h.resultado ? ' → ' + RES_PRO[h.resultado] : ''}`).join(' · ')}</small>` : ''}</div></div>`;
}
async function fichaSalvar(chave) {
  const tipo = $('#fcTipo').value, fone = $('#fcFone').value.trim(), obs = $('#fcObs').value, nao = $('#fcNao').checked;
  await ok(sb.rpc('cliente_marcar', { p_chave: chave, p_tipo: tipo, p_nao_contatar: nao, p_obs: obs, p_fone: fone }));
  const c = D.clientes.find(x => x.chave === chave);
  if (c) Object.assign(c, { tipo_cliente: tipo || null, fone: fone.replace(/\D/g, '') || c.fone, obs, nao_contatar: nao });
  rfm.cache = null; avisar('Dados do cliente salvos.'); abrirCliente(chave);
}
