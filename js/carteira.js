'use strict';
/* Intranet Protemaxxi — Melhores clientes (RFM + curva ABC) e campanha diária de prospecção.
   RFM: Recência (dias sem comprar), Frequência (pedidos) e Valor (R$) nos últimos 12 meses, em notas de 1 a 5 (quintis). */

const SEGMENTOS = {
  campeoes: { n: '🏆 Campeões', d: 'Compram muito, sempre e recentemente', acao: 'Tratamento VIP, lançamento em primeira mão, pedir indicação' },
  fieis: { n: '💚 Fiéis', d: 'Compram com frequência', acao: 'Programa de indicação, condição para volume' },
  promissores: { n: '🌟 Promissores', d: 'Compraram recentemente, ainda pouco', acao: 'Mostrar o mix: câmeras, alarmes, acessórios' },
  novos: { n: '🌱 Novos', d: 'Primeira compra nos últimos 60 dias', acao: 'Pós-venda e segunda compra' },
  em_risco: { n: '⚠️ Em risco', d: 'Compravam bem e estão sumindo', acao: 'Ligar já: oferta personalizada' },
  atencao: { n: '👀 Precisam de atenção', d: 'Sem contato registrado nos últimos 30 dias', acao: 'Retomar a última compra e oferecer reposição ou complemento' },
  acompanhamento: { n: '💬 Em acompanhamento', d: 'Precisavam de atenção e receberam contato nos últimos 30 dias', acao: 'Acompanhar a conversa e cumprir o próximo retorno' },
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

/** Contato comercial registrado; anotações e clientes apenas pulados não contam como abordagem. */
function contatosRecentes() {
  const desde = addDias(hoje(), -30), ate = hoje(), mapa = {};
  const guardar = (chave, data) => { const dia = String(data || '').slice(0, 10); if (chave && dia >= desde && dia <= ate && (!mapa[chave] || dia > mapa[chave])) mapa[chave] = dia; };
  for (const i of D.interacoes || []) if (['ligacao', 'whatsapp', 'visita', 'email'].includes(i.tipo)) guardar(i.cliente_chave, i.criado_em);
  for (const x of PRO.hist || []) if (x.resultado && x.resultado !== 'pular') guardar(x.cliente_chave, x.resultado_em || x.data);
  return mapa;
}
function acompanharRFM(mapa) {
  const contatos = contatosRecentes();
  return Object.fromEntries(Object.entries(mapa).map(([chave, x]) => [chave, { ...x, seg: x.seg === 'atencao' && contatos[chave] ? 'acompanhamento' : x.seg, ultimo_contato: contatos[chave] }]));
}

/** Calcula RFM, segmento e curva ABC para a carteira carregada (D.clientes). Guarda o resultado em cache por tamanho da lista. */
function rfm() {
  const l = D.clientes || [];
  if (rfm.cache && rfm.cache.n === l.length && rfm.cache.ref === l && rfm.cache.dia === hoje()) return acompanharRFM(rfm.cache.mapa);
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
  rfm.cache = { n: l.length, ref: l, mapa, dia: hoje() };
  return acompanharRFM(mapa);
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
const PRO = { dados: null, chave: '', carregando: false, hist: null, resumo: null, resumoDia: '', resumoEm: 0, resumoErro: false, resumoPromise: null, gravando: new Set(), rascunhos: {} };
const contatoPro = x => !!x.resultado && x.resultado !== 'pular';
const CANAIS_CONTATO = { whatsapp: '💬 WhatsApp', ligacao: '📞 Ligação', email: '✉ E-mail', visita: '🤝 Visita' };
const contatoPausado = c => !!c?.contato_pausa_ate && c.contato_pausa_ate >= hoje();
/** Selos das regras de contato do cliente (canal preferido, pausa, não contatar). */
function seloContato(c) {
  if (!c) return '';
  return `${c.nao_contatar ? '<span class="tag ruim">🚫 Não contatar</span>' : ''}${contatoPausado(c) ? `<span class="tag med" title="${esc(c.contato_motivo || '')}">⏸ Pausa até ${fmtCurta(c.contato_pausa_ate)}</span>` : ''}${c.contato_canal ? `<span class="tag" title="Canal preferido">${CANAIS_CONTATO[c.contato_canal]}</span>` : ''}`;
}
function resumoPro(lista) {
  return { total: lista.length, contatos: lista.filter(contatoPro).length, pulados: lista.filter(x => x.resultado === 'pular').length, pendentes: lista.filter(x => !x.resultado).length };
}
async function carregarResumoPro(forcar = false) {
  if (PRO.resumoPromise) return PRO.resumoPromise;
  if (!forcar && PRO.resumoDia === hoje() && Date.now() - PRO.resumoEm < 60e3) return;
  const dia = hoje(); PRO.resumoEm = Date.now(); PRO.resumoErro = false;
  PRO.resumoPromise = (async () => {
    try {
      const l = await todas(() => sb.from('prospeccao').select('id,pessoa_id,resultado').eq('data', dia).order('id'));
      PRO.resumo = l; PRO.resumoDia = dia;
    } catch (e) { PRO.resumoErro = true; throw e; }
    finally { PRO.resumoPromise = null; }
  })();
  return PRO.resumoPromise;
}
function campanhaHoje(quem) {
  if (PRO.resumoDia !== hoje() || Date.now() - PRO.resumoEm >= 60e3) {
    if (!PRO.resumoPromise && (!PRO.resumoErro || Date.now() - PRO.resumoEm >= 60e3)) carregarResumoPro().then(render).catch(e => { avisar('Não foi possível atualizar a campanha: ' + e.message); render(); });
  }
  if (PRO.resumoDia !== hoje() || PRO.resumoErro) return null;
  return resumoPro(PRO.resumo.filter(x => x.pessoa_id === quem));
}

async function carregarProspeccao(forcar) {
  const quem = UI.proPessoa || EU.id, chave = hoje() + quem;
  if (PRO.dados && PRO.chave === chave && !forcar) return;
  PRO.carregando = true;
  try {
    const [hojeL, hist] = await Promise.all([
      ok(sb.from('prospeccao').select('*').eq('data', hoje()).eq('pessoa_id', quem).order('id')),
      todas(() => sb.from('prospeccao').select('id,data,pessoa_id,cliente_chave,lista,resultado,resultado_em').gte('data', addDias(hoje(), -30)).order('id')),
    ]);
    PRO.dados = hojeL; PRO.hist = hist; PRO.chave = chave;
    if (PRO.resumoDia === hoje()) PRO.resumo = PRO.resumo.filter(x => x.pessoa_id !== quem).concat(hojeL.map(x => ({ id: x.id, pessoa_id: x.pessoa_id, resultado: x.resultado })));
  } finally { PRO.carregando = false; }
}
const nomeCurtoCli = n => { const s = (n || '').trim(); if (!s || /LTDA|EIRELI|\bME\b|S\/A|CONDOM|COMERCIO|SERVI[CÇ]OS|EMPREENDIMENTOS/i.test(s)) return ''; const p = s.split(/\s+/)[0]; return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); };
/** Tempo natural, calculado por dias civis. Data ausente, inválida ou futura não vira afirmação. */
function tempoCompra(data, referencia = hoje()) {
  const dia = String(data || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || ds(pd(dia)) !== dia) return '';
  const utc = s => { const [a,m,d] = s.split('-').map(Number); return Date.UTC(a,m-1,d); };
  const dias = Math.round((utc(referencia) - utc(dia)) / 864e5);
  if (dias < 0 || !Number.isFinite(dias)) return '';
  if (!dias) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 14) return 'há alguns dias';
  if (dias < 45) return 'há algumas semanas';
  if (dias < 330) return 'há alguns meses';
  if (dias < 550) return 'há cerca de um ano';
  if (dias < 730) return 'há mais de um ano';
  return 'há alguns anos';
}
/** Mensagem pronta (o vendedor revisa antes de enviar). */
function mensagemPro(x, vendedor) {
  const ola = nomeCurtoCli(x.cliente_nome) ? `Olá, ${nomeCurtoCli(x.cliente_nome)}!` : 'Olá, tudo bem?';
  const eu = vendedor ? `Aqui é ${vendedor}, da Protemaxxi.` : 'Aqui é da Protemaxxi.', d = x.dados || {};
  const limpar = v => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  const produto = limpar(d.produto_ultima_compra || d.produto || d.itens);
  const tempo = tempoCompra(d.ultima_compra);
  // Só usa a data com o produto da compra correspondente; não mistura um complemento antigo com a última compra.
  const compra = produto ? `Você comprou ${produto} com a gente${tempo && d.produto_ultima_compra ? ' ' + tempo : ''}.` : '';
  const inicio = `${ola} ${eu}${compra ? ' ' + compra : ''}`;
  return {
    complemento: `${inicio} Está pensando em ampliar o sistema ou precisa de algum acessório?${d.sugestao ? ' Posso conferir se ' + limpar(d.sugestao) + ' faz sentido para o seu projeto.' : ' Posso conferir as opções compatíveis com o seu projeto.'}`,
    recompra: `${inicio} Está precisando repor material para os próximos serviços? Se me disser o que está faltando, preparo uma cotação para você.`,
    reativacao: `${inicio} Estou retomando nosso contato para saber como posso ajudar hoje. Tem alguma instalação, reposição ou ampliação em vista?`,
    indicacao: `${inicio} Como tem sido sua experiência com o material? Se precisar de algo, estou por aqui. E, se conhecer alguém que precise de segurança eletrônica, pode passar meu contato.`,
    instalador: `${inicio} Tem algum projeto em andamento ou previsto? Posso ajudar a conferir os equipamentos e acessórios para montar a lista de materiais.`,
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
  const feitos = PRO.dados.filter(contatoPro), pct = PRO.dados.length ? feitos.length / PRO.dados.length : 0;
  const filtro = UI.proFiltro || 'todos';
  const filtros = [['todos', 'Todos'], ['pendentes', 'Não contatados'], ['contatados', 'Contatados'], ['pulados', 'Pulados']];
  const doFiltro = (x, f) => f === 'todos' || (f === 'pendentes' ? !x.resultado : f === 'pulados' ? x.resultado === 'pular' : !!x.resultado && x.resultado !== 'pular');
  const lista = PRO.dados.filter(x => doFiltro(x, filtro));
  // resultados dos últimos 30 dias: venda = pedido do cliente em até 15 dias depois do contato
  const comprou = x => x.resultado === 'comprou' || D.pedidos.some(p => p.cliente_chave === x.cliente_chave && valido(p) && p.data >= x.data && p.data <= addDias(x.data, 15));
  const ind = vends.map(v => { const h = PRO.hist.filter(x => x.pessoa_id === v.id && x.resultado && x.resultado !== 'pular');
    const vend = h.filter(comprou); const fat = soma(vend.map(x => somaV(D.pedidos.filter(p => p.cliente_chave === x.cliente_chave && valido(p) && p.data >= x.data && p.data <= addDias(x.data, 15)))));
    return { v, n: h.length, resp: h.filter(x => ['respondeu', 'orcamento', 'comprou'].includes(x.resultado)).length, orc: h.filter(x => x.resultado === 'orcamento').length, vendas: vend.length, fat }; });
  const card = x => { const c = cli[x.cliente_chave] || {}, l = LISTAS_PRO[x.lista] || [x.lista, ''], fone = c.fone || '', msg = mensagemPro(x, quem?.nome?.split(' ')[0] || ''), wa = linkWa(fone);
    return `<div class="pro-card ${x.resultado === 'pular' ? 'pulado' : x.resultado ? 'feito' : ''}" id="pro_${x.id}">
      <div class="pro-topo"><span class="tag ${l[1]}">${l[0]}</span>${seloSeg(mapa[x.cliente_chave]?.seg)}${seloCredito(x.cliente_chave)}${seloContato(c)}${x.resultado ? `<span class="tag ok">${RES_PRO[x.resultado]}</span>` : ''}</div>
      <div class="pro-nome"><a href="#" data-a="verCliente" data-chave="${esc(x.cliente_chave)}">${esc(x.cliente_nome || c.nome || '')}</a> <small class="mut">${esc(c.cidade || '')}</small></div>
      <div class="pro-motivo">${esc(x.motivo || '')}</div>
      <small class="${x.resultado && x.resultado !== 'pular' ? 'c-ok' : 'mut'}">${x.resultado === 'pular' ? '↷ Pulado · não conta como contato' : x.resultado ? `✓ Contato registrado${x.resultado_em ? ' · ' + fmtCurta(x.resultado_em.slice(0, 10)) : ''}` : '○ Ainda não contatado'}</small>
      ${fone ? `<div class="pro-fone">📱 ${esc(fone)}</div>` : `${x.dados?.fone_errado ? `<small class="c-ruim">📵 ${esc(foneFmt(x.dados.fone_errado))} marcado como errado</small>` : ''}<div class="pro-fone sem"><input type="tel" placeholder="Sem telefone: digite com DDD" id="proFone_${x.id}"><button class="btn peq" data-a="proFone" data-id="${x.id}" data-chave="${esc(x.cliente_chave)}">Salvar</button></div>`}
      <textarea class="pro-msg" id="proMsg_${x.id}" data-fid="proMsg_${x.id}" data-pro-rascunho="${x.id}" rows="4">${esc(PRO.rascunhos[x.id] ?? msg)}</textarea><small class="mut">Sugestão para revisar antes de enviar. Abrir o WhatsApp não registra contato.</small>
      <div class="acoes">${c.nao_contatar || contatoPausado(c) ? `<small class="c-med">${c.nao_contatar ? '🚫 Cliente pediu para não ser contatado' : `⏸ Contato pausado até ${fmtCurta(c.contato_pausa_ate)}`}${c.contato_motivo ? ': ' + esc(c.contato_motivo) : ''}. Use "Pular".</small>` : wa ? `<a class="btn pri peq" href="#" data-a="proWa" data-id="${x.id}" data-fone="${esc(fone)}">💬 Chamar no WhatsApp</a><a class="btn peq" href="tel:${esc(fone.replace(/\D/g, ''))}">📞 Ligar</a>` : ''}</div>
      ${x.resultado === 'orcamento' ? (negocioDaPro(x.id) ? `<button class="btn peq" data-a="crmAbrir" data-id="${negocioDaPro(x.id).id}">🎯 Ver negócio</button>` : `<button class="btn peq pri" data-a="proNegocio" data-id="${x.id}">🎯 Criar negócio</button>`) : ''}
      <div class="pro-res">${Object.entries(RES_PRO).map(([k, n]) => `<button class="chip ${x.resultado === k ? 'on' : ''}" data-a="proRes" data-id="${x.id}" data-v="${k}">${n}</button>`).join('')}</div></div>`; };
  return `<div class="filtros">${vends.length > 1 ? `<div class="chips">${vends.map(v => `<button class="chip ${UI.proPessoa === v.id ? 'on' : ''}" data-a="proPessoa" data-v="${v.id}">${esc(v.nome)}</button>`).join('')}</div>` : ''}
      ${ehDono() ? `<button class="btn peq" data-a="proGerar">↻ Gerar listas que faltam hoje</button>` : ''}</div>
    <div class="card"><div class="secao-titulo"><div><div class="eyebrow">Campanha de hoje · ${fmtData(hoje())} · meta: ${Number(D.config.prospeccao?.por_dia) || 50} clientes</div><h2 style="margin:4px 0 0">${esc(quem?.nome || '')}: ${feitos.length} de ${PRO.dados.length} contatos</h2></div>
      <small>Máx. 1 abordagem por cliente a cada 30 dias · "Sem interesse" sai por 90 dias</small></div>${barra(pct)}</div>
    <div class="chips mt">${filtros.map(([k, n]) => `<button class="chip ${filtro === k ? 'on' : ''}" data-a="proFiltro" data-v="${k}">${n} <b>${PRO.dados.filter(x => doFiltro(x, k)).length}</b></button>`).join('')}</div>
    ${PRO.dados.length ? `<div class="pro-grid mt">${[...lista].sort((a, b) => !!a.resultado - !!b.resultado).map(card).join('') || '<div class="card vazio">Nenhum cliente neste filtro.</div>'}</div>${PRO.dados.length < (Number(D.config.prospeccao?.por_dia) || 50) ? '<p class="mut">Lista menor que a meta: foram mantidos os limites de frequência e as restrições de contato dos clientes elegíveis.</p>' : ''}`
      : `<div class="card vazio mt">A lista de hoje ainda não foi gerada. Ela sai sozinha às 7h (segunda a sábado).<br><br><button class="btn pri" data-a="proGerar">Gerar a minha lista agora</button></div>`}
    ${blocoTelefones(UI.proPessoa)}
    <div class="card mt"><div class="secao-titulo"><h2>Resultado da prospecção</h2><small>últimos 30 dias · venda = pedido em até 15 dias depois do contato</small></div>
      <div class="rolagem"><table class="tabela"><thead><tr><th>Vendedor</th><th class="dir">Contatos</th><th class="dir">Responderam</th><th class="dir">Orçamentos</th><th class="dir">Vendas</th><th class="dir">Faturamento gerado</th></tr></thead><tbody>
      ${ind.map(x => `<tr><td><b>${esc(x.v.nome)}</b></td><td class="dir">${x.n}</td><td class="dir">${x.resp} <small>(${P(x.n ? x.resp / x.n : 0)})</small></td><td class="dir">${x.orc}</td><td class="dir"><b>${x.vendas}</b></td><td class="dir num">${R0(x.fat)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
}

async function proRes(id, res) {
  const x = PRO.dados.find(r => String(r.id) === String(id)); if (!x) return;
  if (PRO.gravando.has(x.id)) return;
  const novo = x.resultado === res ? null : res;
  const c = (D.clientes || []).find(k => k.chave === x.cliente_chave);
  PRO.gravando.add(x.id);
  try {
    const anterior = x.interacao_id, eraErrado = x.resultado === 'numero_errado';
    // manda o número que estava na tela: é ele que fica marcado como errado
    const r = await ok(sb.rpc('prospeccao_registrar', { p_id: x.id, p_resultado: novo, p_esperado: x.resultado || null, p_fone: c?.fone || null }));
    Object.assign(x, r.prospeccao);
    if (novo === 'numero_errado' || eraErrado) await atualizarFoneCli(x.cliente_chave);
    const velha = D.interacoes.find(i => i.id === anterior); if (velha) velha.feito = true;
    if (r.interacao && !D.interacoes.some(i => i.id === r.interacao.id)) D.interacoes.unshift(r.interacao);
    const h = (PRO.hist || []).find(r => r.id === x.id); if (h) Object.assign(h, x); else (PRO.hist ||= []).push({ ...x });
    if (PRO.resumoDia === hoje()) { const s = PRO.resumo.find(r => r.id === x.id); if (s) s.resultado = x.resultado; else PRO.resumo.push({ id: x.id, pessoa_id: x.pessoa_id, resultado: x.resultado }); }
    avisar(r.interacao?.proximo_contato ? `Contato salvo e retorno marcado para ${fmtCurta(r.interacao.proximo_contato)}.` : novo === 'pular' ? 'Pulado, sem contar como contato.' : novo === 'sem_interesse' ? 'Registrado. Cliente fora da campanha por 90 dias.' : 'Resultado salvo.');
    render();
    if (novo === 'orcamento') formProNegocio(x.id).catch(e => avisar(e.message));
  } finally {
    PRO.gravando.delete(x.id);
  }
}
function proWa(id, fone) {
  const msg = $('#proMsg_' + id)?.value || '';
  const url = linkWa(fone); if (!url) return;
  window.open(`${url}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}
/** Negócio já criado a partir deste contato da campanha. */
const negocioDaPro = id => (CRM.neg || []).find(n => String(n.prospeccao_id) === String(id));
/** "Pediu orçamento": oferece criar o negócio já preenchido ou ligar a um negócio aberto do mesmo cliente. */
async function formProNegocio(id) {
  const x = (PRO.dados || []).find(r => String(r.id) === String(id)); if (!x) return;
  if (!CRM.neg) await carregarCRM();
  const ja = negocioDaPro(x.id);
  if (ja) return crmAbrir(ja.id);
  const abertos = (CRM.neg || []).filter(n => n.cliente_chave === x.cliente_chave && !n.prospeccao_id && !['ganho', 'perdido'].includes(n.etapa));
  const d = x.dados || {}, sug = d.sugestao || d.produto_ultima_compra || d.itens || '';
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>🎯 Pediu orçamento: ${esc(x.cliente_nome || '')}</h2>
    <p class="mut">Registre o negócio para acompanhar até o fechamento. Quando o orçamento for lançado no Tiny para este cliente, ele entra neste mesmo negócio.</p>
    ${abertos.length ? `<h3>Já existe negociação aberta deste cliente</h3>${abertos.map(n => `<div class="atv"><div style="flex:1"><b>${esc(n.titulo)}</b><br><small>${NOME_ETAPA[n.etapa]} · ${R0(n.valor)} · ${esc(nomeP(n.pessoa_id))}</small></div><button class="btn peq" data-a="proNegocioSalvar" data-id="${x.id}" data-negocio="${n.id}">Ligar a este</button></div>`).join('')}<h3 class="mt">Ou crie um novo</h3>` : ''}
    <div class="form-grid">
      <label class="campo inteiro">O que o cliente quer *<input type="text" id="pnTit" maxlength="160" placeholder="Ex.: orçamento de 4 câmeras e gravador" value="${esc(sug ? 'Orçamento: ' + String(sug).slice(0, 120) : '')}"></label>
      <label class="campo">Valor estimado (R$)<input type="number" step="0.01" min="0" id="pnValor"></label>
      <label class="campo">Próximo passo em<input type="date" id="pnData" min="${hoje()}" value="${diaUtil(addDias(hoje(), 1))}"></label>
      <label class="campo inteiro">Próximo passo *<input type="text" id="pnAtv" maxlength="200" value="Montar e enviar o orçamento"></label>
    </div>
    <div class="acoes mt"><button class="btn pri" data-a="proNegocioSalvar" data-id="${x.id}">Criar negócio</button><button class="btn" data-a="fecharModal">Agora não</button></div>`);
}
async function proNegocioSalvar(id, negocioId) {
  if (PRO.gravando.has('neg' + id)) return;
  const tit = $('#pnTit')?.value.trim() || '', data = $('#pnData')?.value || '', atv = $('#pnAtv')?.value.trim() || '';
  if (!negocioId && !tit) return avisar('Diga o que o cliente quer.');
  if (!data || data < hoje() || !atv) return avisar('Defina a data e o próximo passo.');
  PRO.gravando.add('neg' + id);
  try {
    const r = await ok(sb.rpc('prospeccao_negocio', { p_prospeccao: Number(id), p_negocio: negocioId ? Number(negocioId) : null, p_titulo: tit,
      p_valor: Number($('#pnValor')?.value) || 0, p_atv_data: data, p_atv_titulo: atv }));
    const i = (CRM.neg || []).findIndex(n => n.id === r.negocio.id);
    if (i >= 0) CRM.neg[i] = r.negocio; else (CRM.neg ||= []).unshift(r.negocio);
    if (r.atividade && !CRM.atv.some(a => a.id === r.atividade.id)) CRM.atv.push(r.atividade);
    const x = (PRO.dados || []).find(p => String(p.id) === String(id)), fu = x && D.interacoes.find(k => k.id === x.interacao_id); if (fu) fu.feito = true;
    fecharModal(); avisar(r.repetido ? 'Este contato já tinha virado negócio.' : negocioId ? 'Contato ligado ao negócio e próximo passo agendado.' : 'Negócio criado com o próximo passo.'); render();
  } finally { PRO.gravando.delete('neg' + id); }
}
async function proFone(id, chave) {
  await telCorrigir(chave, $('#proFone_' + id)?.value || '');
}

// ─── telefones marcados como errados: fila para corrigir ───
const TELF = { lista: null, em: 0, carregando: false };
async function carregarTelErrados(forcar) {
  if (TELF.carregando || (!forcar && TELF.lista && Date.now() - TELF.em < 5 * 60e3)) return;
  TELF.carregando = true;
  try {
    TELF.lista = await todas(() => sb.from('cliente_telefones').select('cliente_chave,telefone,errado_em,errado_por').not('errado_em', 'is', null).order('errado_em', { ascending: false }).order('telefone'));
    TELF.em = Date.now();
  } finally { TELF.carregando = false; }
}
/** Clientes do vendedor sem nenhum número válido porque o(s) número(s) foram marcados como errados. */
function filaTelefones(quem) {
  if (!TELF.lista) { if (!TELF.carregando) carregarTelErrados().then(render).catch(() => {}); return null; }
  if (!D.clientes) return null;
  const cli = Object.fromEntries(D.clientes.map(c => [c.chave, c])), tiny = pessoa(quem)?.tiny, vistos = new Set();
  return TELF.lista.filter(t => { const c = cli[t.cliente_chave];
    if (!c || c.fone || vistos.has(t.cliente_chave) || !(c.vendedor_id === tiny || t.errado_por === quem)) return false;
    vistos.add(t.cliente_chave); return true; }).map(t => ({ ...t, c: cli[t.cliente_chave] }));
}
function blocoTelefones(quem, limite) {
  const l = filaTelefones(quem);
  if (!l?.length) return '';
  return `<div class="card mt"><div class="secao-titulo"><h2>📵 Telefones para corrigir</h2><small>${l.length} cliente(s) fora da campanha até ter um número certo</small></div>
    ${l.slice(0, limite || 50).map(t => `<div class="atv"><div style="flex:1"><a href="#" data-a="verCliente" data-chave="${esc(t.cliente_chave)}"><b>${esc(t.c.nome || t.cliente_chave)}</b></a><br>
      <small class="mut">${esc(foneFmt(t.telefone))} marcado como errado ${fmtCurta(t.errado_em.slice(0, 10))}${t.errado_por ? ' por ' + esc(nomeP(t.errado_por)) : ''}</small></div>
      <input type="tel" id="telCor_${esc(t.cliente_chave)}" placeholder="Número novo com DDD" style="max-width:170px">
      <button class="btn peq pri" data-a="telCorrigir" data-chave="${esc(t.cliente_chave)}">Salvar</button>
      <button class="btn peq" data-a="telCerto" data-chave="${esc(t.cliente_chave)}" data-v="${esc(t.telefone)}" title="O número estava certo: volta para o cadastro">Estava certo</button></div>`).join('')}
    ${l.length > (limite || 50) ? `<p class="mut">Mostrando ${limite || 50} de ${l.length}.</p>` : ''}</div>`;
}
/** Número novo: entra na agenda como incluído na Intranet (passa na frente dos do Tiny) e o cliente volta à campanha. */
async function telCorrigir(chave, valor) {
  const f = foneNorm(valor ?? $('#telCor_' + chave)?.value);
  if (!f) return avisar('Número inválido. Use DDD + número (celular com 9 dígitos).');
  const { error } = await sb.from('cliente_telefones').insert({ telefone: f, cliente_chave: chave, celular: f.length === 13, origem: 'manual', por: EU.id });
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  // o mesmo número já existia marcado como errado: incluir de novo = confirmar que está certo
  if (error) await ok(sb.rpc('telefone_errado', { p_chave: chave, p_telefone: f, p_errado: false }));
  const usado = await atualizarFoneCli(chave);
  avisar(usado && usado !== f ? `${foneFmt(f)} salvo ✓ · o cadastro continua usando ${foneFmt(usado)}, confirmado antes` : `${foneFmt(f)} salvo ✓`); render();
}
async function telCerto(chave, fone) {
  await ok(sb.rpc('telefone_errado', { p_chave: chave, p_telefone: fone, p_errado: false }));
  await atualizarFoneCli(chave);
  avisar('Número confirmado: voltou para o cadastro.'); render();
}
/** Relê o telefone que o cadastro usa de fato (v_clientes escolhe entre os números válidos). */
async function atualizarFoneCli(chave) {
  const r = await ok(sb.from('v_clientes').select('fone').eq('chave', chave).maybeSingle());
  const c = (D.clientes || []).find(x => x.chave === chave); if (c) c.fone = r?.fone || '';
  delete AGD.tels[chave]; TELF.lista = null;
  if (document.getElementById('cliTels')) carregarTelsFicha(chave);
  return r?.fone || '';
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
    <div class="ficha-selos">${seloSeg(x.seg)} <span class="tag">Curva ${x.abc || '—'}</span> <span class="tag" title="Recência · Frequência · Valor">R${x.r}·F${x.f}·V${x.m}</span> ${seloContato(c)}</div>
    <div class="form-grid" style="margin-top:8px">
      <label class="campo">Tipo de cliente<select id="fcTipo"><option value="">${esc('Automático: ' + (TIPOS_CLI[tipoCli({ ...c, tipo_cliente: null })] || ''))}</option>${Object.entries(TIPOS_CLI).map(([k, n]) => `<option value="${k}" ${c.tipo_cliente === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="campo">Telefone / WhatsApp<input type="tel" id="fcFone" value="${esc(c.fone || '')}" placeholder="DDD + número"></label>
      <label class="campo inteiro">Observações do cliente<textarea id="fcObs" rows="2" placeholder="Ex.: síndico é o Sr. Carlos; prefere WhatsApp à tarde">${esc(c.obs || '')}</textarea></label>
      <label class="campo"><span><input type="checkbox" id="fcNao" ${c.nao_contatar ? 'checked' : ''}> Não incluir em campanhas de prospecção</span></label>
      <label class="campo">Pausar contato comercial até<input type="date" id="fcPausa" min="${hoje()}" value="${contatoPausado(c) ? c.contato_pausa_ate : ''}"></label>
      <label class="campo">Canal preferido<select id="fcCanal"><option value="">Sem preferência</option>${Object.entries(CANAIS_CONTATO).map(([k, n]) => `<option value="${k}" ${c.contato_canal === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="campo inteiro">Motivo da pausa ou da preferência<input type="text" id="fcMotivo" maxlength="300" value="${esc(c.contato_motivo || '')}" placeholder="Ex.: pediu para falar só depois das férias; atendimento só por WhatsApp"></label>
      <p class="explica inteiro" style="margin:0">A pausa tira o cliente das campanhas até a data. Pedidos em andamento e assistência continuam sendo atendidos normalmente.</p>
    </div>
    ${(CRM.neg || []).filter(n => n.cliente_chave === c.chave).map(n => `<div class="atv"><div style="flex:1"><b>🎯 ${esc(n.titulo)}</b><br><small>${NOME_ETAPA[n.etapa]} · ${R0(n.valor)} · ${esc(nomeP(n.pessoa_id))}</small></div><button class="btn peq" data-a="crmAbrir" data-id="${n.id}">Abrir</button></div>`).join('')}
    <div class="acoes"><button class="btn peq pri" data-a="fichaSalvar" data-chave="${esc(c.chave)}">Salvar dados do cliente</button><button class="btn peq" data-a="crmNovo" data-chave="${esc(c.chave)}" data-nome="${esc(c.nome)}">🎯 Novo negócio</button>
      ${hist.length ? `<small class="mut">Prospecção: ${hist.map(h => `${fmtCurta(h.data)} ${LISTAS_PRO[h.lista]?.[0] || h.lista}${h.resultado ? ' → ' + RES_PRO[h.resultado] : ''}`).join(' · ')}</small>` : ''}</div></div>`;
}
async function fichaSalvar(chave) {
  const tipo = $('#fcTipo').value, fone = $('#fcFone').value.trim(), obs = $('#fcObs').value, nao = $('#fcNao').checked;
  const pausa = $('#fcPausa').value || null, canal = $('#fcCanal').value, motivo = $('#fcMotivo').value.trim();
  if (pausa && pausa < hoje()) return avisar('A pausa precisa terminar hoje ou depois.');
  await ok(sb.rpc('cliente_marcar', { p_chave: chave, p_tipo: tipo, p_nao_contatar: nao, p_obs: obs, p_fone: fone }));
  await ok(sb.rpc('contato_regras', { p_chave: chave, p_nao_contatar: nao, p_pausa_ate: pausa, p_canal: canal, p_motivo: motivo }));
  const c = D.clientes.find(x => x.chave === chave);
  if (c) Object.assign(c, { tipo_cliente: tipo || null, fone: fone.replace(/\D/g, '') || c.fone, obs, nao_contatar: nao, contato_pausa_ate: pausa, contato_canal: canal || null, contato_motivo: motivo || null });
  rfm.cache = null; avisar('Dados do cliente salvos.'); abrirCliente(chave);
}
