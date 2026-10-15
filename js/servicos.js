'use strict';
/* CRM Protemaxxi — Ordens de serviço e serviços do Tiny (API v3). */

const OS_ABERTAS = ['Em aberto', 'Orçada', 'Aprovada', 'Em andamento'];
const COR_OS = { 'Em aberto': 'st-aberta', 'Orçada': 'st-aguardando', 'Aprovada': 'st-aberta', 'Em andamento': 'st-em_andamento', 'Serviço concluído': 'st-concluida', 'Finalizada': 'st-concluida', 'Não aprovada': 'st-cancelada', 'Cancelada': 'st-cancelada' };

async function carregarOS(forcar) {
  if (D.os && !forcar) return D.os;
  const desde = `${addMes(mesDe(hoje()), -12)}-01`;
  D.os = await todas(() => sb.from('ordens_servico').select('*').gte('data', desde).order('data', { ascending: false }).order('id', { ascending: false }));
  for (const o of D.os) { o.valor = Number(o.valor) || 0; }
  return D.os;
}

function blocoOS() {
  const v3 = D.sync.v3 || {};
  if (!v3.conectado && !(D.os && D.os.length)) {
    return `<div class="card mt em-breve"><h2>Ordens de serviço do Tiny</h2><p class="explica">${v3.erro ? `⚠ ${esc(v3.erro)}<br>` : ''}A leitura das ordens de serviço usa a API v3 do Tiny. ${ehDono() ? 'Conecte em <a href="#/config" data-a="cfgTiny">Configurações › Integração Tiny</a> com o botão "Conectar ao Tiny v3".' : 'Peça ao administrador para conectar.'}</p></div>`;
  }
  if (!D.os) { carregarOS().then(render).catch(e => avisar(e.message)); return '<div class="card mt vazio">Carregando ordens de serviço…</div>'; }
  const m = mesDe(hoje()), b = (UI.osBusca || '').toLowerCase().trim();
  let lista = D.os;
  if (UI.osFiltro === 'abertas') lista = lista.filter(o => OS_ABERTAS.includes(o.situacao));
  else if (UI.osFiltro && UI.osFiltro !== 'todas') lista = lista.filter(o => o.situacao === UI.osFiltro);
  if (b) lista = lista.filter(o => [o.cliente_nome, o.numero, o.equipamento, o.equipamento_serie, o.tecnico].some(x => String(x || '').toLowerCase().includes(b)));
  const abertas = D.os.filter(o => OS_ABERTAS.includes(o.situacao));
  const atrasadas = abertas.filter(o => o.data_prevista && o.data_prevista.slice(0, 10) < hoje());
  const doMes = D.os.filter(o => (o.data || '').startsWith(m) && o.situacao !== 'Cancelada');
  const sits = [...new Set(D.os.map(o => o.situacao).filter(Boolean))];
  return `<h2 class="mt2">Ordens de serviço (Tiny)</h2>
    <div class="grid g4"><div class="card kpi-card"><div class="rot">OS em aberto</div><div class="val">${abertas.length}</div><div class="sub">${R0(soma(abertas.map(o => o.valor)))}</div></div>
      <div class="card kpi-card"><div class="rot">Com previsão vencida</div><div class="val ${atrasadas.length ? 'c-ruim' : ''}">${atrasadas.length}</div></div>
      <div class="card kpi-card"><div class="rot">OS abertas no mês</div><div class="val">${doMes.length}</div><div class="sub">${R0(soma(doMes.map(o => o.valor)))}</div></div>
      <div class="card kpi-card"><div class="rot">Concluídas no mês</div><div class="val c-ok">${D.os.filter(o => ['Serviço concluído', 'Finalizada'].includes(o.situacao) && (o.data_conclusao || o.data || '').startsWith(m)).length}</div></div></div>
    <div class="filtros mt"><input type="search" placeholder="Buscar cliente, nº da OS, equipamento, série ou técnico" value="${esc(UI.osBusca || '')}" data-c="ui" data-k="osBusca" data-fid="osBusca">
      <select data-c="ui" data-k="osFiltro"><option value="abertas" ${UI.osFiltro === 'abertas' || !UI.osFiltro ? 'selected' : ''}>Em aberto</option><option value="todas" ${UI.osFiltro === 'todas' ? 'selected' : ''}>Todas</option>${sits.map(s => `<option ${UI.osFiltro === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <button class="btn" data-a="recarregarOS">↻ Recarregar</button></div>
    <div class="card rolagem"><table class="tabela"><thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Equipamento</th><th>Técnico</th><th>Previsão</th><th>Situação</th><th class="dir">Valor</th></tr></thead><tbody>
      ${lista.slice(0, 300).map(o => { const atr = OS_ABERTAS.includes(o.situacao) && o.data_prevista && o.data_prevista.slice(0, 10) < hoje();
        return `<tr class="clic" data-a="verOS" data-id="${o.id}"><td><b>${esc(o.numero || o.id)}</b></td><td>${o.data ? fmtCurta(o.data) + '/' + o.data.slice(2, 4) : ''}</td><td>${esc(o.cliente_nome || '')}</td><td>${esc(o.equipamento || '')}${o.equipamento_serie ? `<br><small>série ${esc(o.equipamento_serie)}</small>` : ''}</td><td>${esc(o.tecnico || '')}</td>
          <td>${o.data_prevista ? `<span class="${atr ? 'c-ruim' : ''}">${fmtCurta(o.data_prevista.slice(0, 10))}${atr ? ' · vencida' : ''}</span>` : '—'}</td><td><span class="st ${COR_OS[o.situacao] || ''}">${esc(o.situacao || '')}</span></td><td class="dir">${R0(o.valor)}</td></tr>`; }).join('') || '<tr><td colspan="8" class="vazio">Nenhuma OS com esses filtros.</td></tr>'}
    </tbody></table>${lista.length > 300 ? `<p class="mut">Mostrando 300 de ${lista.length}.</p>` : ''}</div>`;
}

function abrirOS(id) {
  const o = (D.os || []).find(x => String(x.id) === String(id)); if (!o) return;
  const linha = (rot, v) => v ? `<tr><td class="mut" style="width:32%">${rot}</td><td style="white-space:pre-wrap">${esc(v)}</td></tr>` : '';
  const wa = linkWa(o.cliente_fone);
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button>
    <small class="mut">Ordem de serviço do Tiny · emitida em ${o.data ? fmtData(o.data) : '—'}</small>
    <h2 style="margin-top:4px">OS ${esc(o.numero || o.id)} <span class="st ${COR_OS[o.situacao] || ''}">${esc(o.situacao || '')}</span></h2>
    <p><b>Cliente:</b> ${o.cliente_chave ? `<a href="#" data-a="verCliente" data-chave="${esc(o.cliente_chave)}">${esc(o.cliente_nome || '')}</a>` : esc(o.cliente_nome || '')}${o.cliente_fone ? ` · ${esc(o.cliente_fone)}` : ''}${wa ? ` · <a class="wa" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</p>
    <table class="tabela"><tbody>
      ${linha('Equipamento', o.equipamento)}${linha('Nº de série', o.equipamento_serie)}${linha('Problema relatado', o.descricao_problema)}
      ${linha('Técnico', o.tecnico)}${linha('Vendedor', o.vendedor_nome)}${linha('Categoria', o.categoria)}
      ${linha('Previsão', o.data_prevista)}${linha('Conclusão', o.data_conclusao && fmtData(o.data_conclusao))}
      ${linha('Observações', o.observacoes)}${linha('Observações do serviço', o.observacoes_servico)}${linha('Observações internas', o.observacoes_internas)}
      <tr><td class="mut">Valores</td><td>Serviços ${R(o.total_servicos)} · Peças ${R(o.total_pecas)} · <b>Total ${R(o.valor)}</b></td></tr>
    </tbody></table>
    ${o.detalhado ? '' : '<p class="mut">Os detalhes desta OS ainda estão sendo baixados do Tiny.</p>'}
    <div class="acoes mt"><button class="btn" data-a="novaSolicitacao" data-tipo="rma" ${o.cliente_chave ? `data-chave="${esc(o.cliente_chave)}" data-nome="${esc(o.cliente_nome || '')}"` : ''}>+ Abrir RMA a partir desta OS</button></div>`, true);
}

function cardTinyV3() {
  const v3 = D.sync.v3 || {}, os = D.sync.ultimo_os?.em;
  const fmt = s => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  return `<div class="card mt"><h2>API v3 (ordens de serviço e serviços)</h2>
    <table class="tabela"><tbody>
      <tr><td>Situação</td><td>${v3.conectado ? '<span class="tag ok">conectado</span>' : `<span class="tag ${v3.erro ? 'ruim' : ''}">${v3.erro ? 'desconectado' : 'não conectado'}</span>`}</td></tr>
      ${v3.erro ? `<tr><td>Último erro</td><td class="c-ruim">${esc(v3.erro)}</td></tr>` : ''}
      <tr><td>Conectado em</td><td>${fmt(v3.conectado_em)}</td></tr>
      <tr><td>Última renovação automática</td><td>${fmt(v3.renovado_em)}</td></tr>
      <tr><td>Última leitura das OS</td><td>${fmt(os)}</td></tr>
    </tbody></table>
    <p class="explica">O acesso da API v3 dura 4 horas e o servidor renova sozinho antes de vencer. Se ficar mais de 1 dia sem renovar (por exemplo, o Tiny fora do ar), é preciso clicar em "Conectar" de novo.</p>
    <div class="acoes"><button class="btn pri" data-a="conectarV3">${v3.conectado ? '↻ Reconectar ao Tiny v3' : '🔗 Conectar ao Tiny v3'}</button>${v3.conectado ? '<button class="btn perigo" data-a="desconectarV3">Desconectar</button>' : ''}</div></div>`;
}
