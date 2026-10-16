'use strict';
/* Intranet Protemaxxi — Logs (só o dono): tudo o que foi feito no sistema, por quem e quando.
   Junta a tabela "logs" (ações do servidor, como aprovações e etapas da expedição), a auditoria das tabelas,
   as notas emitidas, as contagens de estoque e as entradas no sistema. */

const LOGS = { dados: null, chave: '', aberto: null, carregando: false };
const CAT_IC = { 'expedição': '📦', 'nota fiscal': '🧾', estoque: '🔢', acesso: '🔑', equipe: '👥', 'remuneração': '💰', 'configuração': '⚙', 'solicitação': '📨', 'mercado livre': '🛍', cadastro: '🏷' };

function periodoLogs() {
  const h = hoje(), p = UI.logPeriodo || 'hoje';
  const ini = p === 'hoje' ? h : p === '7' ? addDias(h, -6) : p === '30' ? addDias(h, -29) : (UI.logDe || h);
  const fim = p === 'data' ? (UI.logAte || h) : h;
  return { de: new Date(ini + 'T00:00:00').toISOString(), ate: new Date(addDias(fim, 1) + 'T00:00:00').toISOString(), chave: ini + fim };
}
async function carregarLogs(forcar) {
  const { de, ate, chave } = periodoLogs();
  if (LOGS.dados && LOGS.chave === chave && !forcar) return;
  LOGS.carregando = true;
  try { LOGS.dados = await ok(sb.rpc('logs_ler', { p_desde: de, p_ate: ate })); LOGS.chave = chave; }
  finally { LOGS.carregando = false; }
}

function vLogs() {
  if (!ehDono()) return topo('Logs', '') + '<div class="card vazio">Só o dono vê os logs.</div>';
  const { chave } = periodoLogs();
  if (!LOGS.dados || LOGS.chave !== chave) { if (!LOGS.carregando) carregarLogs().then(render).catch(e => avisar(e.message)); return topo('Logs', '') + '<div class="card vazio">Carregando os logs…</div>'; }
  const busca = (UI.logBusca || '').toLowerCase().trim();
  const lista = LOGS.dados.filter(l => (!UI.logCat || l.categoria === UI.logCat) && (!UI.logPessoa || (UI.logPessoa === '_sistema' ? !l.pessoa_id : l.pessoa_id === UI.logPessoa))
    && (!busca || `${l.descricao} ${l.ref || ''} ${nomeP(l.pessoa_id)} ${l.acao}`.toLowerCase().includes(busca)));
  const cats = [...new Set(LOGS.dados.map(l => l.categoria))].sort();
  const pessoasLog = [...new Set(LOGS.dados.map(l => l.pessoa_id).filter(Boolean))];
  const detalhe = l => {
    const m = l.detalhes?.mudou;
    const campos = m ? Object.entries(m).filter(([k]) => !['id'].includes(k)) : [];
    const resto = Object.entries(l.detalhes || {}).filter(([k, v]) => k !== 'mudou' && k !== 'tabela' && v !== null && v !== '');
    return `<tr class="detalhe-log"><td colspan="5">${campos.length ? `<table class="tabela"><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${campos.slice(0, 40).map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td><small>${esc(JSON.stringify(v.antes ?? null)).slice(0, 300)}</small></td><td><small>${esc(JSON.stringify(v.depois ?? null)).slice(0, 300)}</small></td></tr>`).join('')}</tbody></table>` : ''}
      ${resto.length ? `<div class="mut" style="margin-top:6px">${resto.map(([k, v]) => `<b>${esc(k)}:</b> ${esc(typeof v === 'object' ? JSON.stringify(v) : String(v))}`).join(' · ')}</div>` : ''}${!campos.length && !resto.length ? '<span class="mut">Sem detalhes.</span>' : ''}</td></tr>`;
  };
  return topo('Logs', 'Tudo o que foi feito na Intranet: quem, quando e o quê. Só você vê esta tela.',
    `<button class="btn" data-a="logsAtualizar">↻ Atualizar</button><button class="btn" data-a="logsCsv">⬇ Baixar CSV</button>`)
    + `<div class="filtros"><div class="chips">${[['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['data', 'Escolher datas']].map(([k, n]) => `<button class="chip ${(UI.logPeriodo || 'hoje') === k ? 'on' : ''}" data-a="logPeriodo" data-v="${k}">${n}</button>`).join('')}</div>
      ${UI.logPeriodo === 'data' ? `<input type="date" value="${UI.logDe || hoje()}" data-c="ui" data-k="logDe"> até <input type="date" value="${UI.logAte || hoje()}" data-c="ui" data-k="logAte">` : ''}
      <select data-c="ui" data-k="logCat"><option value="">Todas as áreas</option>${cats.map(c => `<option value="${esc(c)}" ${UI.logCat === c ? 'selected' : ''}>${CAT_IC[c] || '•'} ${esc(c)}</option>`).join('')}</select>
      <select data-c="ui" data-k="logPessoa"><option value="">Todas as pessoas</option>${pessoasLog.map(id => `<option value="${esc(id)}" ${UI.logPessoa === id ? 'selected' : ''}>${esc(nomeP(id))}</option>`).join('')}<option value="_sistema" ${UI.logPessoa === '_sistema' ? 'selected' : ''}>Sistema / automático</option></select>
      <input type="search" placeholder="Buscar: pedido, nome, NF, produto…" value="${esc(UI.logBusca || '')}" data-c="ui" data-k="logBusca"></div>
    <div class="card rolagem"><table class="tabela"><thead><tr><th>Quando</th><th>Quem</th><th>Área</th><th>O que aconteceu</th><th>Ref.</th></tr></thead><tbody>
      ${lista.slice(0, 500).map((l, i) => { const k = `${l.quando}|${i}`;
        return `<tr class="clic" data-a="logAbrir" data-k="${esc(k)}"><td><small>${new Date(l.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })}</small></td>
          <td>${l.pessoa_id ? esc(nomeP(l.pessoa_id)) : '<span class="mut">sistema</span>'}</td><td><span class="tag">${CAT_IC[l.categoria] || '•'} ${esc(l.categoria)}</span></td>
          <td><b>${esc(l.acao)}</b> · ${esc(l.descricao || '')}</td><td><small>${esc(l.ref || '')}</small></td></tr>${LOGS.aberto === k ? detalhe(l) : ''}`; }).join('') || '<tr><td colspan="5" class="vazio">Nada neste período.</td></tr>'}
    </tbody></table>${lista.length > 500 ? `<p class="mut">Mostrando 500 de ${lista.length}. Use os filtros ou baixe o CSV.</p>` : ''}</div>`;
}

function baixarLogsCsv() {
  const linhas = [['quando', 'quem', 'area', 'acao', 'descricao', 'ref']].concat((LOGS.dados || []).map(l => [new Date(l.quando).toLocaleString('pt-BR'), l.pessoa_id ? nomeP(l.pessoa_id) : 'sistema', l.categoria, l.acao, l.descricao || '', l.ref || '']));
  const csv = '﻿' + linhas.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `logs-intranet-${hoje()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
