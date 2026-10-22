'use strict';
/* CRM Protemaxxi — login, menu, Início, administração e ações. */

// ═══════════════════════════ menu ═══════════════════════════
function menu() {
  const itens = [
    ['', 'inicio', '⌂', 'Início'],
    ['', 'meudia', '☀', 'Meu dia', CRM.atv ? CRM.atv.filter(a => a.pessoa_id === EU.id && !a.feito && a.quando <= hoje()).length : 0],
    ['Comercial'], ['', 'crm', '🎯', 'Funil (CRM)'], ['', 'vendas', '📈', 'Vendas'], ['', 'pedidos', '🧾', 'Pedidos'], ['', 'situacao', '🚦', 'Situação dos pedidos', SIT.lista ? SIT.lista.filter(p => !p.removido && passosPedido(p).estado === 'problema').length : 0], ['', 'boletos', '🧾', 'Boletos em atraso', BOL.lista ? (ehDono() ? bolAbertos() : meusBoletos()).length : 0], ['', 'clientes', '👤', 'Clientes'],
    ...(veMonitoria() ? [['', 'monitoria', '🏷', 'Monitoria de preços']] : []),
    ...(veTudoVendas() || EU.tiny ? [['', 'avaliacoes', '⭐', 'Avaliações', ehDono() && AVA.lista ? AVA.lista.filter(a => a.nota && a.nota <= 3 && !a.tratado).length : 0]] : []), ['', 'creditos', '💳', 'Créditos e vales', ehDono() && CRE.pend ? CRE.pend.length : 0], ['', 'brindes', '🎁', 'Brindes', ehDono() && CRE.bped ? CRE.bped.filter(b => b.status === 'pendente').length : 0],
    ...(veML() ? [['', 'ml', '🛍', 'Mercado Livre', D.ml ? D.ml.perguntas.filter(perguntaPendente).length : 0]] : []),
    ...(veTrafego() ? [['Marketing'], ['', 'trafego', '📣', 'Tráfego (Google Ads)', trPendentes()]] : []),
    ...(veExp() ? [['Operação'], ['', 'visaoestoque', '📋', 'Visão geral do estoque'], ['', 'expedicao', '📦', 'Expedição', EXP ? EXP.ecom.map(infoPedido).filter(x => !x.despachado && x.atrasado).length : 0], ['', 'estoque', '🏷', 'Estoque', EXP ? EXP.alertas.length : 0], ['', 'abrirTV', '📺', 'TV do estoque']] : []),
    ...(veCompras() ? [...(veExp() ? [] : [['Operação']]), ['', 'compras', '🤝', 'Compras e fornecedores', COMP.ops ? COMP.ops.filter(o => situacaoOp(o) === 'encerrada').length : 0]] : []),
    ['Comunicação'], ['', 'solicitacoes', '📨', 'Solicitações', minhasPendentes().length], ...(veEmails() ? [['', 'emails', '✉', 'Caixa de e-mails', EM.naoLidos]] : []), ['', 'suporte', '🔧', 'Assistência (OS)', AT.os ? AT.os.filter(o => o.status === 'pronto' || (o.previsao && o.previsao < hoje() && !['entregue', 'cancelado'].includes(o.status))).length : 0],
    ['Equipe'], ['', 'checklist', '☑', 'Checklist do dia'],
    ...(temEquipe() ? [['', 'supervisao', '👥', 'Supervisão']] : []),
    ...(ehDono() ? [['', 'geral', '◉', 'Visão da equipe']] : []),
    ['', 'metas', '🎯', 'Metas e números'], ['', 'remuneracao', '💰', ehDono() ? 'Remuneração' : 'Meu ganho'],
    ['', 'feedbacks', '💬', 'Feedbacks'],
    ['Sistema'], ...(ehDono() ? [['', 'config', '⚙', 'Configurações'], ['', 'logs', '📜', 'Logs']] : []), ['', 'ajuda', '?', 'Como usar'],
  ];
  // só as abas do perfil; tira títulos de grupo que ficaram vazios
  const vis = itens.filter(([g, k]) => (g !== '' && !k) || podeAba(k)).filter((it, i, arr) => !(it[0] !== '' && !it[1]) || (arr[i + 1] && arr[i + 1][0] === ''));
  return vis.map(([g, k, ic, nome, badge]) => g !== '' && !k ? `<div class="grupo">${g}</div>`
    : `<button class="${UI.view === k ? 'on' : ''}" data-a="nav" data-v="${k}"><span class="ic">${ic}</span>${nome}${badge ? `<span class="badge">${badge}</span>` : ''}</button>`).join('');
}
const VIEWS_FN = {
  inicio: () => vInicio(), vendas: () => vVendas(), ml: () => vML(), trafego: () => vTrafego(), pedidos: () => vPedidos(), clientes: () => vClientes(),
  solicitacoes: () => vIntranet(), suporte: () => vAssistencia(), expedicao: () => vExpedicao(), estoque: () => vEstoque(), visaoestoque: () => vVisaoEstoque(), tvestoque: () => vTVEstoque(), logs: () => vLogs(), monitoria: () => vMonitoria(), creditos: () => vCreditos(), brindes: () => vBrindes(), crm: () => vCRM(), meudia: () => vMeuDia(), situacao: () => vSituacao(), boletos: () => vBoletos(), emails: () => vEmails(), avaliacoes: () => vAvaliacoes(), compras: () => vCompras(),
  checklist: () => vChecklist(), supervisao: () => vSupervisao(), geral: () => vGeral(), metas: () => vMetas(),
  remuneracao: () => vRemuneracao(), feedbacks: () => vFeedbacks(), config: () => vConfig(), ajuda: () => vAjuda(),
};
const SO_DONO = ['config', 'geral', 'logs'];

/** Abas de cada perfil (o dono vê tudo). Vendedor: comercial + situação dos pedidos; estoque: expedição e TV;
 *  supervisor: tudo da própria área + supervisão da equipe. Remuneração, avaliações e configurações ficam só com o dono. */
function abasDoPerfil() {
  if (!EU || ehDono()) return null;
  const P = EU.permissoes || {}, s = new Set(['inicio', 'meudia', 'pedidos', 'clientes', 'solicitacoes', 'feedbacks', 'ajuda']);
  const add = (...ks) => ks.forEach(k => s.add(k));
  const comercial = !!EU.tiny || !!P.vendas_todas;
  if (comercial) add('crm', 'vendas', 'situacao', 'boletos');
  if (P.ecommerce) add('vendas');
  if (veML()) add('ml');
  if (veTrafego()) add('trafego');
  if (veExp()) add('visaoestoque', 'expedicao', 'estoque', 'abrirTV', 'tvestoque');
  if (veCompras()) add('compras');
  if (P.suporte) add('suporte');
  if (veEmails()) add('emails');
  if (veMonitoria()) add('monitoria');
  if (temEquipe()) { add('supervisao', 'checklist', 'metas'); if (comercial) add('creditos', 'brindes'); }
  return s;
}
const podeAba = k => { const s = abasDoPerfil(); return !s || s.has(k); };

function render() {
  if (!D || !EU) return;
  if (!podeAba(UI.view) || (SO_DONO.includes(UI.view) && !ehDono()) || (UI.view === 'ml' && !veML()) || (UI.view === 'trafego' && !veTrafego()) || (UI.view === 'monitoria' && !veMonitoria()) || (['expedicao', 'tvestoque', 'estoque', 'visaoestoque'].includes(UI.view) && !veExp()) || (UI.view === 'compras' && !veCompras())) UI.view = 'inicio';
  document.body.classList.toggle('tvestoque', UI.view === 'tvestoque');
  if (UI.view === 'checklist' && !D.pessoas.find(p => p.id === UI.pessoa && p.ativo && pessoasQueVejo().includes(p.id))) UI.pessoa = EU.id;
  const fid = document.activeElement?.dataset?.fid;
  const pos = document.activeElement?.selectionStart;
  const y = window.scrollY;
  if (!CRM.em && !CRM.carregando && (EU.tiny || ehDono())) { CRM.em = 1; carregarCRM(true).then(render).catch(() => {}); }
  if (!CRE.em && !CRE.carregando) { CRE.em = 1; carregarCreditos(true).then(render).catch(() => {}); }
  if (!BOL.em && !BOL.carregando && veBoletos()) { BOL.em = 1; carregarBoletos(true).then(render).catch(() => {}); }   // aviso de boleto em atraso   // saldos e pendências em segundo plano
  if (!AT.em && !AT.carregando && veAssist()) { AT.em = 1; carregarAT(true).then(render).catch(() => {}); }   // lembretes da assistência
  if (!COMP.em && !COMP.carregando && veCompras()) { COMP.em = 1; carregarCompras(true).then(render).catch(() => {}); }   // oportunidades para o contador do menu
  $('#nav').innerHTML = menu();
  $('#usuario').innerHTML = `${av(EU)}<div><b>${esc(EU.nome)}</b><small>${esc(EU.cargo)}</small></div>`;
  $('#main').innerHTML = (VIEWS_FN[UI.view] || vInicio)();
  window.scrollTo(0, y);
  if (UI.view === 'brindes') fotosBrindes().catch(() => {});
  if (fid) { const el = document.querySelector(`[data-fid="${CSS.escape(fid)}"]`); if (el) { el.focus(); if (pos != null && el.setSelectionRange) try { el.setSelectionRange(pos, pos); } catch { /* tipo sem seleção */ } } }
  if (location.hash !== '#/' + UI.view) history.replaceState(null, '', '#/' + UI.view);
  guardarUI();
  atualizarShell();
}
const pessoasQueVejo = () => ehDono() ? D.pessoas.map(p => p.id) : [EU.id, ...descendentes(EU.id)];
function descendentes(id) { const out = []; for (const p of D.pessoas.filter(x => x.supervisor === id)) out.push(p.id, ...descendentes(p.id)); return out; }

// gruposPessoas do módulo Equipe: só mostra quem eu posso ver
const _gruposOriginal = gruposPessoas;
gruposPessoas = function () {
  const vejo = new Set(pessoasQueVejo());
  return _gruposOriginal().map(([n, ps]) => [n, ps.filter(p => vejo.has(p.id))]).filter(([, ps]) => ps.length);
};

// ═══════════════════════════ INÍCIO ═══════════════════════════
function vInicio() {
  const h = hoje(), m = mesDe(h), hora = new Date().getHours();
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const pc = pctDia(EU, h), temTarefas = tarefas(EU, 'D').length > 0;
  const paraMim = minhasPendentes(), pedi = D.solicitacoes.filter(s => s.solicitante_id === EU.id && ABERTAS.includes(s.status));
  const fus = followupsHoje(ehDono() ? null : EU.id);
  const kFat = kpiDe(EU, 'fat');
  const r = EU.tiny ? resumoVendedor(EU.tiny, h) : null;
  const val = D.pedidos.filter(p => valido(p) && p.data.startsWith(m));
  const du = diasUteisEntre(`${m}-01`, h), duT = diasUteisEntre(`${m}-01`, `${m}-${pad(ultimoDia(m))}`);
  const rem = EU.regras.length ? calcRem(EU, m, 'projecao') : null;
  const al = ehDono() ? alertas().slice(0, 6) : [];
  const cards = [];
  if (veTudoVendas()) cards.push(`<div class="card kpi-card"><div class="rot">Vendas da loja no mês</div><div class="val">${R0(somaV(val))}</div><div class="sub">Projeção ${R0(du ? somaV(val) / du * duT : 0)} · hoje ${R0(somaV(val.filter(p => p.data === h)))}</div></div>`);
  if (r) cards.push(`<div class="card kpi-card"><div class="rot">Minhas vendas no mês</div><div class="val">${R0(r.mes)}</div><div class="sub">Projeção ${R0(r.proj)}${kFat ? ` · meta ${R0(kFat.meta)}` : ''}</div>${kFat ? `<div class="mt">${barra(r.proj / (kFat.meta || 1))}</div>` : ''}</div>`);
  if (temTarefas && podeAba('checklist')) cards.push(`<div class="card kpi-card clic" style="cursor:pointer" data-a="nav" data-v="checklist"><div class="rot">Meu checklist de hoje</div><div class="val c-${classe(pc)}">${pc == null ? 'folga' : P(pc)}</div><div class="sub">No mês: ${P(adesao(EU, m))}</div><div class="mt">${barra(pc)}</div></div>`);
  if (rem && ehDono()) cards.push(`<div class="card kpi-card clic" style="cursor:pointer" data-a="nav" data-v="remuneracao"><div class="rot">${ehDono() ? 'Meu ganho previsto' : 'Quanto vou ganhar este mês'}</div><div class="val c-ok">${R0(rem.total)}</div><div class="sub">Variável: ${R0(rem.variavel + rem.equipe)} · projeção</div></div>`);
  if (ehDono()) { const rs = D.pessoas.filter(p => p.ativo && p.regras.length).map(p => calcRem(p, m, 'projecao')); cards.push(`<div class="card kpi-card clic" style="cursor:pointer" data-a="nav" data-v="remuneracao"><div class="rot">Folha prevista do mês</div><div class="val">${R0(soma(rs.map(x => x.total)))}</div><div class="sub">Custo c/ encargos ${R0(soma(rs.map(x => x.custo)))}</div></div>`); }
  cards.push(`<div class="card kpi-card clic" style="cursor:pointer" data-a="nav" data-v="solicitacoes"><div class="rot">Solicitações para mim</div><div class="val ${paraMim.length ? 'c-med' : ''}">${paraMim.length}</div><div class="sub">${pedi.length} que eu pedi em aberto</div></div>`);
  const linhaSol = s => `<tr class="clic" data-a="verSolicitacao" data-id="${s.id}"><td>${(TIPOS_SOL[s.tipo] || TIPOS_SOL.outro).ic} <b>${esc(s.titulo)}</b><br><small>de ${esc(nomeP(s.solicitante_id))}${s.prazo ? ` · prazo ${fmtCurta(s.prazo)}` : ''}</small></td><td class="pri-${s.prioridade}">${PRIORIDADES[s.prioridade]}</td><td><span class="st st-${s.status}">${STATUS_SOL[s.status]}</span></td></tr>`;
  return topo(`${saud}, ${esc(primeiroNome(EU))}!`, `${fmtData(h)} · ${infoSync()}`, '<button class="btn pri" data-a="novaSolicitacao">+ Nova solicitação</button>')
    + `${avisoBoletos()}${avisoAssistencia()}<div class="grid g4">${cards.join('')}</div>
    <div class="grid g2 mt">
      <div class="card"><div class="secao-titulo"><h2>Para mim resolver</h2><a href="#/solicitacoes">ver todas</a></div>${paraMim.length ? `<table class="tabela"><tbody>${paraMim.slice(0, 8).map(linhaSol).join('')}</tbody></table>` : '<div class="vazio">Nenhuma solicitação pendente para você. 🎉</div>'}</div>
      <div class="card"><div class="secao-titulo"><h2>Follow-ups de hoje</h2><a href="#/clientes">clientes</a></div>${fus.length ? `<table class="tabela"><tbody>${fus.slice(0, 10).map(i => `<tr><td class="clic" data-a="verCliente" data-chave="${esc(i.cliente_chave)}" style="cursor:pointer"><b>${esc(i.cliente_nome || '')}</b><br><small>${TIPOS_INT[i.tipo] || ''} · ${esc(i.texto.slice(0, 80))}${ehDono() ? ' · ' + esc(nomeP(i.autor_id)) : ''}</small></td><td><span class="tag ${i.proximo_contato < h ? 'ruim' : 'ok'}">${fmtCurta(i.proximo_contato)}</span></td><td><button class="btn peq" data-a="followupFeito" data-id="${i.id}">✓ Feito</button></td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhum retorno marcado para hoje. Registre contatos na ficha do cliente e marque o próximo.</div>'}</div>
    </div>
    ${al.length ? `<div class="card mt"><div class="secao-titulo"><h2>Atenção na equipe</h2><a href="#/geral">visão da equipe</a></div><div class="alertas">${al.map(a => `<div class="alerta ${a.c}" ${a.p ? `data-a="abrirPessoa" data-p="${a.p.id}" data-d="${a.d || ''}"` : ''}><span class="ic">${a.ic}</span><span>${a.t}</span></div>`).join('')}</div></div>` : ''}
    ${r ? `<div class="card mt"><div class="secao-titulo"><h2>Minha corrida do mês</h2><a href="#/vendas">painel de vendas</a></div>${graficoCorrida([EU.tiny], h)}</div>` : ''}`;
}

// ═══════════════════════════ CONFIGURAÇÕES EXTRAS (dono) ═══════════════════════════
let USUARIOS = null;
function vConfigExtra(tab) {
  if (tab === 'acessos') {
    if (!USUARIOS) { chamarFuncao('admin-usuarios', { acao: 'listar' }).then(r => { USUARIOS = r.usuarios; render(); }).catch(e => { USUARIOS = []; avisar(e.message); }); }
    const PAPEIS = { dono: 'Dono / admin', supervisor: 'Supervisor', vendedor: 'Vendedor', estagiario: 'Estagiário', colaborador: 'Colaborador' };
    return `<div class="card"><p class="explica" style="margin-top:0">Cada pessoa entra com o próprio e-mail e senha e só vê o que o papel permite. <b>Vendedor</b> vê só as próprias vendas e clientes. <b>Supervisor</b> vê a equipe abaixo dele. <b>Dono</b> vê tudo e acessa as Configurações.</p>
      <div class="cfg-linha cfg-acesso cfg-cab"><span>Pessoa</span><span>Papel</span><span>Vendedor no Tiny</span><span>Pode ver também</span><span>Login</span></div>
      ${D.pessoas.map((p, i) => { const u = USUARIOS?.find(x => x.id === p.user_id);
        return `<div class="cfg-linha cfg-acesso"><div style="display:flex;gap:8px;align-items:center">${av(p)}<div><b>${esc(p.nome)}</b><br><small>${esc(p.cargo)}${p.ativo ? '' : ' · inativo'}</small></div></div>
        <select data-c="set" data-path="pessoas.${i}.papel">${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}" ${p.papel === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <select data-c="set" data-path="pessoas.${i}.tiny"><option value="">— não vende —</option>${D.vendedoresTiny.map(v => `<option value="${v.id}" ${p.tiny === v.id ? 'selected' : ''}>${esc(v.nome)}</option>`).join('')}${p.tiny && !D.vendedoresTiny.some(v => v.id === p.tiny) ? `<option value="${p.tiny}" selected>id ${p.tiny}</option>` : ''}</select>
        <div style="display:flex;flex-direction:column;gap:2px;font-size:13px">${[['vendas_todas', 'Todas as vendas e clientes'], ['ecommerce', 'Pedidos do e-commerce'], ['expedicao', 'Expedição e estoque'], ['aprovar_pagamento', 'Aprovar pagamento (depósito/Tray)'], ['suporte', 'Ordens de serviço (suporte)'], ['trafego', 'Tráfego (Google Ads)'], ['admin', 'Configurações (admin)']].map(([k, n]) => `<label><input type="checkbox" ${p.permissoes?.[k] ? 'checked' : ''} data-c="perm" data-i="${i}" data-k="${k}"> ${n}</label>`).join('')}</div>
        <div>${p.user_id ? `<b>${esc(p.email || u?.email || '')}</b><br><small>${u?.bloqueado ? '<span class="c-ruim">bloqueado</span>' : u?.ultimo_login ? 'último acesso ' + new Date(u.ultimo_login).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca entrou'}</small>
          <br><small>2FA: ${u?.mfa ? '<span class="c-ok">ativo</span>' : (['dono', 'supervisor'].includes(p.papel) || p.permissoes?.admin || p.permissoes?.mfa) ? '<span class="c-med">obrigatório, cadastra no próximo acesso</span>' : 'não exigido'}</small>
          <div class="acoes" style="margin-top:4px"><button class="btn peq" data-a="loginSenha" data-p="${p.id}">Trocar senha</button>${u?.mfa && p.id !== EU.id ? `<button class="btn peq" data-a="zerar2fa" data-p="${p.id}" title="Use se a pessoa perdeu ou trocou de celular">Zerar 2FA</button>` : ''}${p.papel !== 'dono' ? `<button class="btn peq" data-a="loginBloq" data-p="${p.id}" data-v="${u?.bloqueado ? 'desbloquear' : 'bloquear'}">${u?.bloqueado ? 'Desbloquear' : 'Bloquear'}</button><button class="btn peq perigo" data-a="loginRemover" data-p="${p.id}">Remover login</button>` : ''}</div>`
          : `<button class="btn peq pri" data-a="loginCriar" data-p="${p.id}" ${p.ativo ? '' : 'disabled'}>+ Criar login</button>`}</div></div>`; }).join('')}
      <p class="mut"><small>A senha precisa ter pelo menos 8 caracteres. Entregue a senha pessoalmente e peça para a pessoa trocar no primeiro acesso, no menu "Trocar minha senha". Ao bloquear, a pessoa sai do sistema na próxima ação.</small></p></div>`;
  }
  if (tab === 'auditoria') {
    if (!AUDITORIA) ok(sb.from('auditoria').select('*').order('quando', { ascending: false }).limit(200)).then(l => { AUDITORIA = l; render(); }).catch(e => avisar(e.message));
    const NOMES = { pessoas: 'Pessoa / acesso', regras: 'Regra de remuneração', kpis: 'Meta / indicador', config: 'Configuração', solicitacoes: 'Solicitação', feedbacks: 'Feedback' };
    const resumo = a => { const o = a.antes || {}, n = a.depois || {}; const mud = Object.keys({ ...o, ...n }).filter(k => !['atualizado_em', 'criado_em'].includes(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]));
      const alvo = n.nome || o.nome || n.pessoa_id || o.pessoa_id || n.chave || o.chave || n.titulo || o.titulo || n.id || o.id || '';
      return `${esc(String(alvo))}${a.operacao === 'UPDATE' && mud.length ? ` · mudou: ${mud.map(esc).join(', ')}` : ''}`; };
    return `<div class="card"><h2>Auditoria</h2><p class="explica" style="margin-top:0">Registro automático de quem alterou pessoas, acessos, metas, regras de ganho, configurações, solicitações e feedbacks apagados. Só o dono vê. Fica guardado por 2 anos.</p>
      <div class="rolagem"><table class="tabela"><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>
      ${(AUDITORIA || []).map(a => `<tr><td><small>${new Date(a.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></td><td>${esc(nomeP(a.pessoa_id) === '—' ? (a.usuario ? 'login ' + a.usuario.slice(0, 8) : 'sistema') : nomeP(a.pessoa_id))}</td><td>${NOMES[a.tabela] || esc(a.tabela)}</td><td><span class="tag ${a.operacao === 'DELETE' ? 'ruim' : a.operacao === 'INSERT' ? 'ok' : ''}">${{ INSERT: 'criou', UPDATE: 'alterou', DELETE: 'apagou' }[a.operacao] || esc(a.operacao)}</span></td><td><small>${resumo(a)}</small></td></tr>`).join('') || '<tr><td colspan="5" class="vazio">Nenhuma alteração registrada ainda.</td></tr>'}
      </tbody></table></div></div>`;
  }
  if (tab === 'solicitacoes') {
    return `<div class="card"><h2>Responsável padrão por tipo</h2><p class="explica" style="margin-top:0">Quando alguém abre uma solicitação, este nome já vem escolhido (dá para trocar na hora).</p>
      <div class="form-grid">${Object.entries(TIPOS_SOL).filter(([k]) => k !== 'outro').map(([k, t]) => `<label class="campo">${t.ic} ${t.nome}${Array.isArray(D.config.solicitacoes?.[k]) ? ` <small class="mut">hoje: ${esc(D.config.solicitacoes[k].map(nomeP).join(' + '))}</small>` : ''}<select data-c="solPadrao" data-k="${k}">${optPessoas(Array.isArray(D.config.solicitacoes?.[k]) ? '' : D.config.solicitacoes?.[k] || '', D.pessoas.filter(p => p.ativo), Array.isArray(D.config.solicitacoes?.[k]) ? '— manter os de hoje —' : '— a pessoa escolhe —')}</select></label>`).join('')}</div></div>`;
  }
  // tiny
  const bf = D.sync.backfill, ult = D.sync.ultimo_incremental?.em, fila = D.sync.fila_detalhe?.pendentes;
  if (!LOG_SYNC) ok(sb.from('sync_log').select('*').order('id', { ascending: false }).limit(15)).then(l => { LOG_SYNC = l; render(); }).catch(() => {});
  return `<div class="grid g2"><div class="card"><h2>Integração com o Tiny</h2>
      <table class="tabela"><tbody>
        <tr><td>Histórico (12 meses)</td><td>${bf?.concluido ? '<span class="tag ok">carregado</span>' : `<span class="tag med">carregando · faltam ${bf?.pendentes?.length ?? 13} mês(es)</span>`}</td></tr>
        <tr><td>Última atualização de pedidos e clientes</td><td>${ult ? new Date(ult).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td></tr>
        <tr><td>Pedidos aguardando detalhe (itens e CPF/CNPJ)</td><td>${fila ?? '—'}</td></tr>
        <tr><td>Pedidos carregados neste navegador</td><td>${D.pedidos.length}</td></tr>
      </tbody></table>
      <p class="explica">Como funciona: a cada 2 minutos o servidor confere o Tiny. Pedidos e clientes alterados são puxados <b>a cada 10 minutos</b>, e os detalhes dos pedidos vão sendo baixados aos poucos, porque o Tiny limita a 1 chamada por segundo. É tudo <b>só leitura</b>: a Intranet nunca altera nada no Tiny.</p>
      <button class="btn pri" data-a="syncAgora">↻ Atualizar agora</button></div>
    ${cardTinyV3()}
    <div class="card"><h2>Últimas rodadas</h2><table class="tabela"><thead><tr><th>Quando</th><th>Modo</th><th class="dir">Pedidos</th><th class="dir">Detalhes</th><th class="dir">Contatos</th><th></th></tr></thead><tbody>
      ${(LOG_SYNC || []).map(l => `<tr><td><small>${new Date(l.inicio).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></td><td>${esc(l.modo)}</td><td class="dir">${l.pedidos ?? ''}</td><td class="dir">${l.detalhados ?? ''}</td><td class="dir">${l.contatos ?? ''}</td><td>${l.ok === false ? `<span class="tag ruim" title="${esc(l.erro)}">erro</span>` : l.ok ? '<span class="tag ok">ok</span>' : '<span class="tag">…</span>'}</td></tr>`).join('') || '<tr><td class="mut">—</td></tr>'}
    </tbody></table></div></div>`;
}
let LOG_SYNC = null, AUDITORIA = null;

// ═══════════════════════════ AJUDA ═══════════════════════════
vAjuda = function () {
  return topo('Como usar a Intranet', 'A rotina de cada um, em poucos minutos por dia.') + `<div class="grid g2">
  <div class="card explica"><h2>Todo mundo</h2><ul>
    <li><b>Início</b>: o que é seu hoje. Solicitações para você resolver, follow-ups de clientes, checklist e quanto vai ganhar no mês.</li>
    <li><b>Solicitações</b>: em vez de pedir no corredor ou no WhatsApp, abra uma solicitação. Pode ser informação, compra, cotação, cadastro de produto ou RMA. Ela fica com dono, prazo e histórico até ser resolvida.</li>
    <li><b>Checklist do dia</b>: marque cada tarefa quando fizer. Os números de venda vêm sozinhos do Tiny.</li></ul></div>
  <div class="card explica"><h2>Vendedores</h2><ul>
    <li><b>Vendas</b>: sua corrida do mês, projeção x meta e últimos pedidos (o Tiny atualiza de hora em hora).</li>
    <li><b>Clientes</b>: abra a ficha e veja tudo o que o cliente comprou. Registre cada contato e marque a data do próximo. Ele aparece no seu Início no dia certo.</li>
    <li>Filtro <b>"Para reativar"</b>: clientes bons que sumiram. Comece pelos maiores, com o botão de WhatsApp.</li></ul></div>
  <div class="card explica"><h2>Supervisores</h2><ul>
    <li><b>Supervisão</b>: o que cobrar de cada um hoje, o mapa do mês e o "conferido".</li>
    <li><b>Feedbacks</b>: registre 1:1, elogios e ocorrências.</li>
    <li>As solicitações da sua equipe aparecem em "Da minha equipe".</li></ul></div>
  <div class="card explica"><h2>Dono</h2><ul>
    <li><b>Configurações › Logins e acessos</b>: crie o login de cada pessoa e defina o que ela vê.</li>
    <li><b>Remuneração</b>: realizado, projeção e simulação, com o faturamento real do Tiny.</li>
    <li><b>Configurações › Integração Tiny</b>: situação da sincronização e o botão "Atualizar agora".</li></ul></div></div>`;
};

// ═══════════════════════════ modal e TV ═══════════════════════════
function modal(html, largo) {
  let f = $('#modal');
  if (!f) { f = document.createElement('div'); f.id = 'modal'; f.className = 'modal-fundo'; f.addEventListener('click', e => { if (e.target === f) fecharModal(); }); document.body.appendChild(f); }
  f.innerHTML = `<div class="modal ${largo ? 'largo' : ''}">${html}</div>`;
}
function fecharModal() { $('#modal')?.remove(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { fecharModal(); if (document.body.classList.contains('tv')) A.tv(); } });
let timerTV = null;

// ═══════════════════════════ ações ═══════════════════════════
const A = {
  emCaixa: el => { EM.caixa = el.dataset.v; EM.sel = null; render(); },
  emAbrir: el => emAbrir(el.dataset.id).catch(e => avisar(e.message)),
  emAnexo: el => emAnexo(el.dataset.id, el.dataset.e).catch(e => avisar(e.message)),
  emCopiar: el => navigator.clipboard?.writeText(el.dataset.v).then(() => avisar('Linha digitável copiada.')).catch(() => prompt('Copie a linha digitável:', el.dataset.v)),
  emBolPago: el => emBoleto(el.dataset.id, 'pago').catch(e => avisar(e.message)),
  emBolIgnorar: el => emBoleto(el.dataset.id, 'ignorado').catch(e => avisar(e.message)),
  emArquivar: el => emArquivar(el.dataset.id).catch(e => avisar(e.message)),
  emAtualizar: () => carregarEmails(true).then(render).catch(e => avisar(e.message)),
  sitFiltro: el => { UI.sitFiltro = el.dataset.v; render(); },
  sitAtualizar: async () => { try { await carregarSituacao(true); avisar('Atualizado ✓'); } catch (e) { avisar(e.message); } render(); },
  nav: el => { if (el.dataset.v === 'abrirTV') return A.abrirTV(); UI.view = el.dataset.v; fecharModal(); render(); window.scrollTo(0, 0); },
  tema: () => {
    const r = document.documentElement, atual = r.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    r.dataset.theme = atual === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('crm-tema', r.dataset.theme); } catch { /* ok */ }
  },
  sair: async () => { await gravarPendentes(); await sb.auth.signOut(); location.reload(); },
  minhaSenha: () => modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Trocar minha senha</h2>
    <label class="campo">Nova senha (mínimo 8 caracteres)<input type="password" id="novaSenha" autocomplete="new-password"></label>
    <label class="campo mt">Repita a nova senha<input type="password" id="novaSenha2" autocomplete="new-password"></label>
    <div class="mt"><button class="btn pri" data-a="salvarMinhaSenha">Salvar</button></div>`),
  salvarMinhaSenha: async () => {
    const a = $('#novaSenha').value, b = $('#novaSenha2').value;
    if (a.length < 8) return avisar('A senha precisa ter pelo menos 8 caracteres.');
    if (a !== b) return avisar('As duas senhas não são iguais.');
    const { error } = await sb.auth.updateUser({ password: a }); if (error) return avisar(error.message);
    fecharModal(); avisar('Senha alterada.');
  },
  fecharModal: () => fecharModal(),
  tv: () => {
    const on = document.body.classList.toggle('tv');
    clearInterval(timerTV);
    if (on) {
      UI.view = 'vendas'; render();
      document.documentElement.requestFullscreen?.().catch(() => {});
      let n = 0;
      timerTV = setInterval(async () => {
        const vids = vendedoresPainel().map(p => p.tiny); if (vids.length) UI.vendSel = vids[(vids.indexOf(UI.vendSel) + 1) % vids.length];
        if (++n % 15 === 0) await carregarPedidos(`${addMes(mesDe(hoje()), -13)}-01`).catch(() => {});
        render();
      }, 20000);
    } else { if (document.fullscreenElement) document.exitFullscreen?.(); render(); }
  },
  vendSel: el => { UI.vendSel = el.dataset.v; render(); },
  vPer: el => { UI.vPer = el.dataset.v; render(); },
  solPegar: el => solPegar(el.dataset.id).catch(e => avisar(e.message)),
  monPer: el => { UI.monPer = el.dataset.v; render(); },
  monSelo: el => { UI.monSelo = el.dataset.v; render(); },
  monVend: el => { UI.monVend = el.dataset.v; UI.monSelo = 'todos'; render(); },
  monAtualizar: () => carregarMonitoria(true).then(render).catch(e => avisar(e.message)),
  monRever: el => monRever(el.dataset.k, el.dataset.s).catch(e => avisar(e.message)),
  syncAgora: async () => {
    avisar('Buscando no Tiny… pode levar até 2 minutos.');
    try {
      const r = await chamarFuncao('tiny-sync', {}, '?modo=auto&forcar=1');
      await Promise.all([carregarPedidos(`${addMes(mesDe(hoje()), -13)}-01`), ok(sb.from('sync_estado').select('*')).then(est => { D.sync = Object.fromEntries(est.map(x => [x.chave, { ...x.valor, em_db: x.atualizado_em }])); })]);
      D.clientes = null; LOG_SYNC = null; render();
      avisar(`Pronto: ${r.pedidos} pedido(s) atualizados, ${r.detalhados} detalhados.`);
    } catch (e) { avisar('Não deu para atualizar agora: ' + e.message); }
  },
  verPedido: el => abrirPedido(el.dataset.id),
  verOS: el => abrirOS(el.dataset.id),
  responderML: el => responderML(el.dataset.id),
  conferirNF: () => conferirNF(),
  emitirNF: el => emitirNF(el.dataset.id, el.dataset.num, el.dataset.st),
  emitirTodasNF: () => emitirTodasNF(),
  enviarXmlNF: el => enviarXmlNF(el.dataset.id, el.dataset.num),
  recarregarML: () => atualizarML(),
  conectarGads: async () => { try { const r = await chamarFuncao('gads-oauth', { acao: 'iniciar' }); location.href = r.url; } catch (e) { avisar(e.message); } },
  desconectarGads: async () => { if (!confirm('Desconectar o Google Ads? A Intranet para de acompanhar a conta.')) return; try { await chamarFuncao('gads-oauth', { acao: 'desconectar' }); D.sync.gads = { conectado: false }; TR.d = null; render(); } catch (e) { avisar(e.message); } },
  recarregarGads: () => trSincronizar(),
  trAba: el => { TR.aba = el.dataset.v; render(); },
  trPer: el => { TR.per = +el.dataset.v; render(); },
  trFiltro: el => { TR.termoFiltro = el.dataset.v; render(); },
  trNeg: el => trNegativar(el.dataset.termo, el.dataset.c).catch(e => avisar(e.message)),
  trPausar: el => trPausar(el.dataset.g, el.dataset.k).catch(e => avisar(e.message)),
  trRemNeg: el => trRemoverNeg(el.dataset.r).catch(e => avisar(e.message)),
  trOrc: el => trOrcamento(el.dataset.id).catch(e => avisar(e.message)),
  trTestar: el => trDecidir('testar', el.dataset.id),
  trAprovar: el => trDecidir('aprovar', el.dataset.id),
  trRecusar: el => trDecidir('recusar', el.dataset.id),
  trDesfazer: el => trDecidir('desfazer', el.dataset.id),
  imprimirEtiquetas: el => imprimirEtiquetas(el.dataset.envios),
  expAba: el => { UI.expAba = el.dataset.v; render(); },
  expFreteAba: el => { UI.expFrete = el.dataset.v; render(); },
  expBuscaLimpar: () => { UI.expBusca = ''; render(); },
  bolAtualizar: async () => { try { await carregarBoletos(true); } catch (e) { avisar(e.message); } render(); },
  bolFiltro: el => { UI.bolFiltro = el.dataset.v; render(); },
  bolNovo: () => bolNovo(),
  bolBuscar: () => bolBuscar(),
  bolSalvar: () => bolSalvar().catch(e => alert('Não salvou: ' + e.message)),
  bolStatus: el => bolStatus(el.dataset.id, el.dataset.v).catch(e => alert(e.message)),
  bolRenegociar: el => bolRenegociar(el.dataset.id).catch(e => alert(e.message)),
  bolExcluir: el => bolExcluir(el.dataset.id).catch(e => alert(e.message)),
  bolNF: el => bolNF(el.dataset.id),
  bolPedido: el => bolPedido(el.dataset.id).catch(e => alert(e.message)),
  bolImprimirPedido: () => bolImprimirPedido(),
  bolCompVer: el => bolCompVer(el.dataset.id),
  sitRemover: el => sitRemover(el.dataset.id).catch(e => alert('Não removeu: ' + e.message)),
  sitVoltar: el => sitVoltar(el.dataset.id).catch(e => alert(e.message)),
  bolCompExcluir: el => bolCompExcluir(el.dataset.id).catch(e => alert(e.message)),
  estAba: el => { UI.estAba = el.dataset.v; render(); },
  estIr: el => { UI.view = el.dataset.v; if (el.dataset.f) UI.expFiltro = el.dataset.f; if (el.dataset.fr) { UI.expFrete = el.dataset.fr; UI.expFiltro = 'a_separar'; } if (el.dataset.e) UI.estAba = el.dataset.e; render(); window.scrollTo(0, 0); },
  expFiltro: el => { UI.expFiltro = el.dataset.v; render(); },
  expFila: el => { UI.expFila = el.dataset.v; UI.expBusca = ''; render(); },
  expSo: el => { UI.expSo = UI.expSo === el.dataset.v ? null : el.dataset.v; render(); },
  expConclTodos: () => { UI.expConclTodos = !UI.expConclTodos; render(); },
  expPago: el => expPago(el.dataset.id, el.dataset.v),
  expTela: () => { UI.expClassica = !UI.expClassica; render(); window.scrollTo(0, 0); },
  expAtualizar: () => expAtualizar(),
  expEtapa: el => expEtapa(el.dataset.id, el.dataset.k),
  expAprovarPag: el => expAprovarPag(el.dataset.id),
  tvAtivar: () => ativarTV(),
  avaAtualizar: () => carregarAva(true).then(render).catch(e => avisar(e.message)),
  avaTratar: el => avaTratar(el.dataset.id).catch(e => avisar(e.message)),
  avaWa: el => avaWa(el.dataset.id).catch(e => avisar(e.message)),
  avaPular: el => avaPular(el.dataset.id).catch(e => avisar(e.message)),
  avaConfig: () => avaConfig().catch(e => avisar(e.message)),
  atAtualizar: () => carregarAT(true).then(render).catch(e => avisar(e.message)),
  atNova: () => formOS(),
  atSalvar: () => atSalvar().catch(e => avisar(e.message)),
  atAddItem: () => atAddItem(),
  atRemItem: el => atRemItem(el),
  atTinyEnviar: el => { const o = AT.os.find(x => String(x.id) === el.dataset.id); if (o) atEnviarTiny(o).then(r => { avisar(`Criada no Tiny (nº ${r.tiny_os_numero}).`); atAbrir(o.id); }).catch(e => { avisar(e.message); atAbrir(o.id); }); },
  atTinySinc: el => { const o = AT.os.find(x => String(x.id) === el.dataset.id); if (o) atSincTiny(o).then(() => atAbrir(o.id)); },
  atAba: el => { UI.atAba = el.dataset.v; render(); },
  atFiltro: el => { UI.atAba = 'os'; UI.atFiltro = el.dataset.v; render(); window.scrollTo(0, 0); },
  atAbrir: el => atAbrir(el.dataset.id).catch(e => avisar(e.message)),
  atAbrirVolta: el => atAbrir(el.dataset.id).catch(e => avisar(e.message)),
  atMudar: el => atMudarForm(el.dataset.id, el.dataset.v),
  atOrc: el => atOrcForm(el.dataset.id, el.dataset.q).catch(e => avisar(e.message)),
  atOrcAdd: () => { $('#orcLinhas').insertAdjacentHTML('beforeend', orcLinhaForm()); },
  atOrcRem: el => { if (document.querySelectorAll('#orcLinhas .orc-linha').length > 1) { el.closest('.orc-linha').remove(); $('#orcForm').dispatchEvent(new Event('input')); } },
  atOrcSalvar: el => atOrcSalvar(el.dataset.id, el.dataset.q, el.dataset.v === '1').catch(e => avisar(e.message)),
  atOrcResp: el => atOrcResp(el.dataset.id, el.dataset.v === '1').catch(e => avisar(e.message)),
  atEtapa: el => atEtapaForm(el.dataset.id, el.dataset.v),
  atEtapaOk: el => atEtapaSalvar(el.dataset.id, el.dataset.v).catch(e => avisar(e.message)),
  atAssEmail: el => atAssEmail(el.dataset.v, el.dataset.id).catch(e => avisar(e.message)),
  atConfirmar: el => atConfirmar(el.dataset.id, el.dataset.v).catch(e => avisar(e.message)),
  atEditar: el => atEditarForm(el.dataset.id),
  atEditarSalvar: el => atEditarSalvar(el.dataset.id).catch(e => avisar(e.message)),
  atWa: el => atWa(el.dataset.id).catch(e => avisar(e.message)),
  atNota: el => atNota(el.dataset.id).catch(e => avisar(e.message)),
  atCopiarLink: el => atCopiarLink(el.dataset.id),
  atTermo: el => atTermo(el.dataset.id).catch(e => avisar(e.message)),
  abrirBusca: () => abrirBusca(),
  fecharBusca: () => fecharBusca(),
  nadaBusca: () => {},
  buscaProduto: el => abrirProduto(el.dataset.id).catch(e => avisar(e.message)),
  sinoAbrir: () => { $('.sino-fundo')?.remove(); document.body.insertAdjacentHTML('beforeend', painelSino()); },
  sinoFechar: () => $('.sino-fundo')?.remove(),
  sinoPermitir: async () => { try { await Notification.requestPermission(); } catch { /* ok */ } $('.sino-fundo')?.remove(); checarSino(); },
  menuCel: () => document.body.classList.toggle('menu-aberto'),
  alternarLetra: () => alternarLetra(),
  instalarApp: () => instalarApp(),
  crmAtualizar: () => carregarCRM(true).then(render).catch(e => avisar(e.message)),
  crmNovo: el => formNegocio(null, el.dataset.chave, el.dataset.nome),
  crmEditar: el => formNegocio(el.dataset.id),
  crmAba: el => { UI.crmAba = el.dataset.v; render(); },
  crmAbrir: (el, e) => { if (e?.target?.closest?.('.kcard') && document.querySelector('.kcard.arrastando')) return; crmAbrir(el.dataset.id); },
  crmSalvar: el => crmSalvar(el.dataset.id).catch(e => avisar(e.message)),
  crmMover: el => crmMover(el.dataset.id, el.dataset.v).then(() => crmAbrir(el.dataset.id)).catch(e => avisar(e.message)),
  atvNova: el => atvNova(el.dataset.negocio, { chave: el.dataset.chave, nome: el.dataset.nome }).catch(e => avisar(e.message)),
  atvFeita: el => atvFeita(el.dataset.id).catch(e => avisar(e.message)),
  atvContato: el => atvContato(el.dataset.id).catch(e => avisar(e.message)),
  avaFiltro: el => { UI.avaFiltro = el.dataset.v; render(); },
  avaTeste: () => avaTeste(),
  diaPessoa: el => { UI.diaPessoa = el.dataset.v; render(); },
  irProspeccao: () => { UI.view = 'clientes'; UI.cliAba = 'prospeccao'; render(); },
  creAtualizar: () => carregarCreditos(true).then(render).catch(e => avisar(e.message)),
  creNovo: el => formCredito(el.dataset.chave, el.dataset.nome),
  // compras e portal do fornecedor
  compAtualizar: () => carregarCompras(true).then(render).catch(e => avisar(e.message)),
  compAba: el => { UI.compAba = el.dataset.v; render(); },
  compNovaOp: () => formOportunidade().catch(e => avisar(e.message)),
  compDeSol: el => { fecharModal(); formOportunidade(null, el.dataset.id).catch(e => avisar(e.message)); },
  compEditarOp: el => formOportunidade(el.dataset.id).catch(e => avisar(e.message)),
  compSalvarOp: el => salvarOportunidade(el),
  compVerOp: el => carregarCompras().then(() => verOportunidade(el.dataset.id)).catch(e => avisar(e.message)),
  compStatusOp: el => mudarStatusOp(el.dataset.id, el.dataset.v),
  compPrazoOp: el => prorrogarOp(el.dataset.id),
  compVencedor: el => escolherVencedor(el.dataset.op, el.dataset.p),
  compAddConv: async el => { const f = +$('#opAddForn')?.value; if (!f) return avisar('Escolha o fornecedor.'); try { await ok(sb.from('op_fornecedores').insert({ oportunidade_id: +el.dataset.op, fornecedor_id: f, convidado_por: EU.id })); await carregarCompras(true); verOportunidade(el.dataset.op); } catch (e) { avisar(e.message); } },
  compTirarConv: async el => { try { await ok(sb.from('op_fornecedores').delete().eq('oportunidade_id', +el.dataset.op).eq('fornecedor_id', +el.dataset.f)); await carregarCompras(true); verOportunidade(el.dataset.op); } catch (e) { avisar(e.message); } },
  compCopiar: el => copiarTexto(el.dataset.v),
  compVerForn: el => formFornecedor(el.dataset.id),
  compFornNovo: () => formFornecedor(),
  compSalvarForn: el => salvarFornecedor(el.dataset.id),
  compNovoToken: async el => { if (!confirm('Trocar o link deste fornecedor? O link antigo para de funcionar na hora.')) return; try { await ok(sb.from('fornecedores').update({ token: tokenNovo() }).eq('id', +el.dataset.id)); await carregarCompras(true); formFornecedor(el.dataset.id); avisar('Link trocado: mande o novo ao fornecedor.'); } catch (e) { avisar(e.message); } },
  compConvite: () => carregarCompras().then(formConvite).catch(e => avisar(e.message)),
  compSalvarConvite: () => salvarConvite(),
  compConviteLink: el => linkConvite(el.dataset.id),
  compConviteApagar: async el => { if (!confirm('Apagar este convite? O link deixa de funcionar.')) return; try { await ok(sb.from('forn_convites').delete().eq('id', +el.dataset.id)); await carregarCompras(true); render(); } catch (e) { avisar(e.message); } },
  creSalvar: () => creSalvar().catch(e => avisar(e.message)),
  creAprovar: el => creAprovar(el.dataset.id, el.dataset.v).catch(e => avisar(e.message)),
  creExtrato: el => creExtrato(el.dataset.chave).catch(e => avisar(e.message)),
  briNovo: () => formBrinde(),
  briEditar: el => formBrinde(el.dataset.id),
  briSalvar: el => briSalvar(el.dataset.id).catch(e => avisar(e.message)),
  briPedir: el => formPedirBrinde(el.dataset.id, el.dataset.chave, el.dataset.nome),
  briPedirSalvar: el => briPedirSalvar(el.dataset.id).catch(e => avisar(e.message)),
  briAprovar: el => briAprovar(el.dataset.id, el.dataset.v).catch(e => avisar(e.message)),
  cliAba: el => { UI.cliAba = el.dataset.v; render(); },
  telNovo: el => telNovo(el.dataset.chave).catch(e => alert(e.message)),
  telExcluir: el => telExcluir(el.dataset.chave, el.dataset.v).catch(e => alert(e.message)),
  agdAtualizar: () => carregarAgenda(true).then(render).catch(e => avisar(e.message)),
  melTipo: el => { UI.melTipo = el.dataset.v; render(); },
  melSeg: el => { UI.melSeg = UI.melSeg === el.dataset.v ? '' : el.dataset.v; render(); },
  melCsv: () => melCsv(),
  proPessoa: el => { UI.proPessoa = el.dataset.v; render(); },
  proRes: el => proRes(el.dataset.id, el.dataset.v).catch(e => avisar(e.message)),
  proWa: el => proWa(el.dataset.id, el.dataset.fone),
  proFone: el => proFone(el.dataset.id, el.dataset.chave).catch(e => avisar(e.message)),
  proGerar: () => proGerar().catch(e => avisar(e.message)),
  fichaSalvar: el => fichaSalvar(el.dataset.chave).catch(e => avisar(e.message)),
  alarmeMLAtivar: () => alarmeMLAtivar(),
  tvDetalhe: el => { TV.detalhe = el.dataset.id; render(); },
  tvFechar: () => { TV.detalhe = null; render(); },
  tvNada: () => {},
  entSync: () => entSync(),
  entFiltro: el => { UI.entFiltro = el.dataset.v; render(); },
  entAbrir: el => { UI.entNota = UI.entNota === el.dataset.id ? '' : el.dataset.id; render(); },
  entFechar: () => { UI.entNota = ''; render(); },
  entVincular: el => entVincular(el.dataset.nota, el.dataset.item).catch(e => avisar(e.message)),
  entProdBuscar: () => entProdBuscar().catch(e => avisar(e.message)),
  entEscolher: el => entEscolher(el.dataset.p),
  entCadastro: el => entPedirCadastro(el.dataset.nota, el.dataset.item),
  entConferirTudo: el => { if (confirm('Marcar todos os itens como recebidos na quantidade da nota?')) entAcao({ acao: 'conferir_tudo', id_nota: el.dataset.id }, 'Conferido ✓'); },
  entLancar: el => entLancar(el.dataset.id),
  entIgnorar: el => { const m = prompt('Por que ignorar esta nota? (ex.: uso e consumo, serviço, devolução)'); if (m !== null) entAcao({ acao: 'ignorar', id_nota: el.dataset.id, motivo: m }, 'Nota ignorada.'); },
  entReabrir: el => entAcao({ acao: 'reabrir', id_nota: el.dataset.id }, 'Nota reaberta.'),
  logPeriodo: el => { UI.logPeriodo = el.dataset.v; render(); },
  logAbrir: el => { LOGS.aberto = LOGS.aberto === el.dataset.k ? null : el.dataset.k; render(); },
  logsAtualizar: async () => { try { await carregarLogs(true); render(); avisar('Logs atualizados.'); } catch (e) { avisar(e.message); } },
  logsCsv: () => baixarLogsCsv(),
  abrirTV: () => { window.open(location.pathname + '#/tvestoque', 'tv-estoque'); },
  expDesfazer: el => expDesfazer(el.dataset.id),
  expCancelar: el => expCancelar(el.dataset.id),
  expFrete: el => expFrete(el.dataset.id),
  expNF: el => expNF(el.dataset.id),
  expNFDispensa: el => expNFDispensa(el.dataset.id),
  expFreteSalvar: el => expFreteSalvar(el.dataset.id, el),
  expCancelar2: el => expCancelar2(el.dataset.id),
  expOcorrencia: el => expFormOcorrencia(el.dataset.id),
  expOcExcluir: el => expOcExcluir(el.dataset.id).catch(e => avisar(e.message)),
  expSalvarOcorrencia: () => expSalvarOcorrencia(),
  expResolver: el => expResolver(el.dataset.id),
  expContar: el => expContar(el.dataset.id),
  expBuscar: () => expBuscar().catch(e => avisar(e.message)),
  expAprovar: el => expAprovar(el.dataset.id, el.dataset.k),
  expPedirCompra: el => expPedirCompra(el.dataset.id),
  alternarNFAuto: () => alternarNFAuto(),
  conectarML: async () => { try { const r = await chamarFuncao('ml-oauth', { acao: 'iniciar' }); location.href = r.url; } catch (e) { avisar(e.message); } },
  desconectarML: async () => { if (!confirm('Desconectar o Mercado Livre? A Intranet para de acompanhar pedidos e perguntas.')) return; try { await chamarFuncao('ml-oauth', { acao: 'desconectar' }); D.sync.ml = { conectado: false }; D.ml = null; render(); } catch (e) { avisar(e.message); } },
  recarregarOS: async () => { await carregarOS(true).catch(e => avisar(e.message)); render(); },
  cfgTiny: () => { UI.view = 'config'; UI.cfgTab = 'tiny'; render(); },
  conectarV3: async () => { try { const r = await chamarFuncao('tiny-oauth', { acao: 'iniciar' }); location.href = r.url; } catch (e) { avisar(e.message); } },
  desconectarV3: async () => { if (!confirm('Desconectar a API v3 do Tiny? As ordens de serviço param de atualizar.')) return; try { await chamarFuncao('tiny-oauth', { acao: 'desconectar' }); D.sync.v3 = { conectado: false }; render(); } catch (e) { avisar(e.message); } },
  verCliente: (el, e) => { e.preventDefault?.(); abrirCliente(el.dataset.chave); },
  recarregarClientes: async () => { D.clientes = null; await carregarInteracoes(); render(); },
  cliFiltro: el => { UI.cliFiltro = el.dataset.v; render(); },
  novaInteracao: el => formInteracao(el.dataset.chave, el.dataset.nome),
  salvarInteracao: el => salvarInteracao(el.dataset.chave, el.dataset.nome).catch(e => avisar(e.message)),
  followupFeito: el => concluirFollowup(el.dataset.id).catch(e => avisar(e.message)),
  novaSolicitacao: el => formSolicitacao(el.dataset.tipo, el.dataset.chave ? { chave: el.dataset.chave, nome: el.dataset.nome } : null),
  salvarSolicitacao: el => salvarSolicitacao(el.dataset.tipo, el.dataset.chave).catch(e => avisar(e.message)),
  verSolicitacao: el => abrirSolicitacao(el.dataset.id).catch(e => avisar(e.message)),
  comentarSolicitacao: el => comentarSolicitacao(el.dataset.id).catch(e => avisar(e.message)),
  concluirSolicitacao: el => mudarSolicitacao(el.dataset.id, 'status', 'concluida').catch(e => avisar(e.message)),
  solCaixa: el => { UI.solCaixa = el.dataset.v; render(); },
  loginCriar: async el => {
    const p = pessoa(el.dataset.p);
    modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Criar login: ${esc(p.nome)}</h2>
      <label class="campo">E-mail<input type="email" id="lgEmail" autocomplete="off"></label>
      <label class="campo mt">Senha inicial (mínimo 8 caracteres)<input type="text" id="lgSenha" autocomplete="off"></label>
      <p class="mut"><small>Papel atual: <b>${esc(p.papel)}</b>. Confira antes de entregar o acesso.</small></p>
      <button class="btn pri" data-a="loginCriarOk" data-p="${p.id}">Criar login</button>`);
  },
  loginCriarOk: async el => {
    try { await chamarFuncao('admin-usuarios', { acao: 'criar', pessoa_id: el.dataset.p, email: $('#lgEmail').value.trim(), senha: $('#lgSenha').value });
      fecharModal(); avisar('Login criado.'); await recarregarPessoas(); USUARIOS = null; render(); } catch (e) { avisar(e.message); }
  },
  loginSenha: el => modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Nova senha: ${esc(pessoa(el.dataset.p).nome)}</h2>
      <label class="campo">Nova senha (mínimo 8 caracteres)<input type="text" id="lgSenha" autocomplete="off"></label>
      <div class="mt"><button class="btn pri" data-a="loginSenhaOk" data-p="${el.dataset.p}">Salvar</button></div>`),
  loginSenhaOk: async el => { try { await chamarFuncao('admin-usuarios', { acao: 'senha', pessoa_id: el.dataset.p, senha: $('#lgSenha').value }); fecharModal(); avisar('Senha alterada.'); } catch (e) { avisar(e.message); } },
  loginBloq: async el => { try { await chamarFuncao('admin-usuarios', { acao: el.dataset.v, pessoa_id: el.dataset.p }); USUARIOS = null; render(); avisar(el.dataset.v === 'bloquear' ? 'Login bloqueado.' : 'Login liberado.'); } catch (e) { avisar(e.message); } },
  zerar2fa: async el => {
    const p = pessoa(el.dataset.p);
    if (!confirm(`Zerar o 2FA de ${p.nome}? No próximo acesso, a pessoa vai cadastrar o celular de novo (use quando ela perder ou trocar de celular).`)) return;
    try { await chamarFuncao('admin-usuarios', { acao: 'resetar_2fa', pessoa_id: p.id }); USUARIOS = null; render(); avisar('2FA zerado.'); } catch (e) { avisar(e.message); }
  },
  loginRemover: async el => {
    if (!confirm(`Remover o login de ${pessoa(el.dataset.p).nome}? O histórico da pessoa continua no sistema.`)) return;
    try { await chamarFuncao('admin-usuarios', { acao: 'remover_login', pessoa_id: el.dataset.p }); await recarregarPessoas(); USUARIOS = null; render(); } catch (e) { avisar(e.message); }
  },

  // ─── módulo Equipe ───
  selPessoa: el => { UI.pessoa = el.dataset.p; render(); },
  abrirPessoa: el => {
    const p = pessoa(el.dataset.p); if (!p) return;
    if (!p.ativo) { if (ehDono()) { UI.view = 'config'; UI.cfgTab = 'pessoas'; render(); } return; }
    UI.pessoa = p.id; if (el.dataset.d) UI.data = el.dataset.d;
    UI.view = el.dataset.view || 'checklist'; if (UI.view === 'metas') UI.metasDet = '';
    fecharModal(); render(); window.scrollTo(0, 0);
  },
  dia: async el => { const v = +el.dataset.v; UI.data = v === 0 ? hoje() : addDias(UI.data, v); await garantirMes(mesDe(UI.data)); render(); },
  mes: async el => { const v = +el.dataset.v; UI.mes = v === 0 ? mesDe(hoje()) : addMes(UI.mes, v); render(); let mudou = await garantirMes(UI.mes); if (!D.bonif?.[UI.mes]) { await carregarBonif(UI.mes).catch(() => {}); mudou = true; } if (mudou) render(); },
  sup: el => { UI.sup = el.dataset.p; render(); },
  verRem: (el, e) => { e.preventDefault(); UI.remPessoa = el.dataset.p; UI.view = 'remuneracao'; render(); window.scrollTo(0, 0); },
  remModo: el => { UI.remModo = el.dataset.v; render(); },
  remSel: el => { UI.remPessoa = el.dataset.p; render(); },
  metasDet: el => { UI.metasDet = UI.metasDet === el.dataset.p ? '' : el.dataset.p; render(); },
  print: () => window.print(),
  nota: el => {
    const r = reg(el.dataset.p, el.dataset.d, true), atual = r.notas[el.dataset.t] || '';
    const txt = prompt('Observação sobre esta tarefa (deixe vazio para apagar):', atual);
    if (txt === null) return;
    if (txt.trim()) r.notas[el.dataset.t] = txt.trim(); else delete r.notas[el.dataset.t];
    marcar('dia', el.dataset.p, el.dataset.d); render();
  },
  trabalhou: el => { reg(el.dataset.p, el.dataset.d, true).status = 'extra'; marcar('dia', el.dataset.p, el.dataset.d); render(); },
  fbAdd: async () => {
    const texto = $('#fbTexto').value.trim(); if (!texto) { avisar('Escreva o que aconteceu.'); return; }
    try {
      const n = await ok(sb.from('feedbacks').insert({ pessoa_id: $('#fbPessoa').value, autor_id: EU.id, tipo: $('#fbTipo').value, data: $('#fbData').value || hoje(), texto }).select().single());
      D.feedbacks.unshift({ id: n.id, pessoa: n.pessoa_id, autor: n.autor_id, tipo: n.tipo, data: n.data, texto: n.texto });
      UI.fbPessoa = n.pessoa_id; render(); avisar('Registro salvo.');
    } catch (e) { avisar(e.message); }
  },
  fbDel: async el => { if (!confirm('Apagar este registro?')) return; try { await ok(sb.from('feedbacks').delete().eq('id', el.dataset.id)); D.feedbacks = D.feedbacks.filter(f => f.id !== el.dataset.id); render(); } catch (e) { avisar(e.message); } },
  cfgTab: el => { UI.cfgTab = el.dataset.v; if (el.dataset.v === 'auditoria') AUDITORIA = null; render(); },
  del: el => {
    const arr = getPath(el.dataset.path); const i = +el.dataset.i;
    const item = arr[i]; const nome = item?.titulo || item?.nome;
    if (nome && !confirm(`Apagar "${nome}"?`)) return;
    arr.splice(i, 1); marcarPath(el.dataset.path); render();
  },
  mov: el => { const arr = getPath(el.dataset.path), i = +el.dataset.i, j = i + +el.dataset.v; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; marcarPath(el.dataset.path); render(); },
  addTarefa: el => { getPath(el.dataset.path).push({ id: 't' + uid(), titulo: 'Nova tarefa', freq: 'D', bloco: 'dia', diaSemana: 5, diaMes: 5, conferir: '', critica: false }); marcarPath(el.dataset.path); render(); },
  addKpi: el => { getPath(el.dataset.path).push({ id: 'k_' + uid(), nome: 'Novo indicador', un: 'un', meta: 0, entrada: 'D', agreg: 'soma', dir: 'maior', fonte: 'manual' }); marcarPath(el.dataset.path); render(); },
  addFaixaDesc: el => { const arr = getPath(el.dataset.path), ult = [...arr].sort((a, b) => a.ate - b.ate).pop(); arr.push({ ate: ult ? +(ult.ate + 1).toFixed(2) : 0.1, taxa: ult ? Math.max(0, +(ult.taxa - 0.1).toFixed(2)) : 1 }); marcarPath(el.dataset.path); render(); },
  addItemBonus: el => { getPath(el.dataset.path).push({ nome: 'Novo produto', codigos: [], valor: 0, equipe_qtd: 0, equipe_valor: 0 }); marcarPath(el.dataset.path); render(); },
  addFaixa: el => { const arr = getPath(el.dataset.path), ult = ordFaixas(arr).pop(); arr.push({ de: ult ? ult.de + 10 : 0, [el.dataset.campo]: ult ? ult[el.dataset.campo] : 0 }); marcarPath(el.dataset.path); render(); },
  addRegra: el => {
    const tipo = $('#novaRegra').value, p = pessoa(UI.cfgPessoa), k0 = p.kpis[0]?.id || '';
    const kEq = D.pessoas.find(x => x.supervisor === p.id && x.kpis.length)?.kpis[0]?.id || '';
    const modelos = {
      fixo: { nome: 'Valor fixo', valor: 0 },
      comissao: { nome: 'Comissão', kpi: k0, faixas: [{ de: 0, taxa: 1 }, { de: 100, taxa: 2 }] },
      override: { nome: 'Comissão sobre a equipe', kpi: kEq, faixas: [{ de: 0, taxa: 0 }, { de: 100, taxa: 0.5 }] },
      premio_meta: { nome: 'Prêmio de meta', kpi: k0, escopo: 'proprio', faixas: [{ de: 0, valor: 0 }, { de: 100, valor: 100 }] },
      premio_disciplina: { nome: 'Prêmio de disciplina', valor: 200, escopo: 'proprio', faixas: [{ de: 0, mult: 0 }, { de: 80, mult: 50 }, { de: 90, mult: 100 }] },
      premio_por_subordinado: { nome: 'Prêmio por pessoa da equipe na meta', kpi: kEq, valor: 100 },
      comissao_desconto: { nome: 'Comissão por desconto do pedido', kpi: 'fat', acima: 0.15, faixas: [0.1, 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1, 9.1].map((ate, i) => ({ ate, taxa: +(1.05 - i * 0.1).toFixed(2) })) },
      bonus_meta: { nome: 'Bônus ao bater a meta', kpi: 'fat', taxa: 0.5 },
      bonus_produtos: { nome: 'Produtos bonificados', kpi: 'fat', exige_meta: true, itens: [] },
    };
    getPath(el.dataset.path).push({ tipo, ...modelos[tipo] }); marcarPath(el.dataset.path); render();
  },
  addPessoa: () => {
    const modelo = pessoa($('#novoModelo').value);
    const nome = prompt('Nome da nova pessoa:'); if (!nome) return;
    const nova = { ...clone(modelo), id: nome.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + uid().slice(0, 3), nome: nome.trim(), ativo: true, inicio: hoje(), user_id: null, email: '', tiny: '' };
    D.pessoas.push(nova); marcar('pessoa', nova.id); render(); avisar(`${nome} adicionado(a) com início hoje.`);
  },
  delPessoa: async el => {
    const i = +el.dataset.i, p = D.pessoas[i];
    if (p.id === EU.id) return avisar('Você não pode remover a si mesmo.');
    if (!confirm(`Remover ${p.nome} do sistema? Todo o histórico (checklist, feedbacks) dessa pessoa será apagado. Para só desativar, desmarque "Ativo".`)) return;
    try {
      for (const x of D.pessoas.filter(x => x.supervisor === p.id)) { x.supervisor = p.supervisor || null; await GRAVAR.pessoa(x.id); }
      await ok(sb.from('pessoas').delete().eq('id', p.id));
      D.pessoas.splice(i, 1); render();
    } catch (e) { avisar(e.message); }
  },
  copiarTarefas: () => {
    const de = pessoa($('#copiarDe').value), p = pessoa(UI.cfgPessoa); if (!de) return;
    if (!confirm(`Substituir as ${p.tarefas.length} tarefas de ${p.nome} pelas ${de.tarefas.length} de ${de.nome}?`)) return;
    p.tarefas = clone(de.tarefas); marcar('pessoa', p.id); render();
  },
  exportar: () => {
    const blob = new Blob([JSON.stringify(D, (k, v) => v instanceof Set ? [...v] : v, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `crm-protemaxxi-copia-${hoje()}.json`; a.click(); URL.revokeObjectURL(a.href);
  },
};
async function recarregarPessoas() {
  const rows = await ok(sb.from('pessoas').select('id,user_id,email'));
  for (const r of rows) { const p = pessoa(r.id); if (p) { p.user_id = r.user_id; p.email = r.email || ''; } }
}
function getPath(path) { return path.split('.').reduce((o, k) => o?.[k], D); }
function setPath(path, val) { const ks = path.split('.'); let o = D; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = val; }
const numOuVazio = v => v === '' ? '' : Number(v);

let timerBusca = null;
const C = {
  adsEtapa: el => adsEtapa(el.dataset.id, el.value).catch(e => alert(e.message)),
  bolComp: el => { const a = el.files?.[0]; if (a) bolCompEnviar(el.dataset.id, a).catch(e => alert(e.message)); el.value = ''; },
  atFotos: el => { const arqs = [...el.files]; if (arqs.length) atFotos(el.dataset.id, arqs).catch(e => avisar(e.message)); },
  crmEtapa: el => crmMover(el.dataset.id, el.value).then(() => crmAbrir(el.dataset.id)).catch(e => avisar(e.message)),
  monRevTodos: el => { UI.monRev = el.checked ? 'todos' : ''; render(); },
  ui: el => { UI[el.dataset.k] = el.value; if (el.type === 'search') { clearTimeout(timerBusca); timerBusca = setTimeout(render, 150); } else render(); },
  chk: el => { const r = reg(el.dataset.p, el.dataset.d, true); if (el.checked) r.checks[el.dataset.t] = true; else delete r.checks[el.dataset.t]; marcar('dia', el.dataset.p, el.dataset.d); render(); },
  chkS: el => { const s = semReg(el.dataset.p, el.dataset.s, true); if (el.checked) s[el.dataset.t] = true; else delete s[el.dataset.t]; marcar('sem', el.dataset.p, el.dataset.s); render(); },
  chkM: el => { const s = mesReg(el.dataset.p, el.dataset.m, true); if (el.checked) s.checks[el.dataset.t] = true; else delete s.checks[el.dataset.t]; marcar('mes', el.dataset.p, el.dataset.m); render(); },
  kpiD: el => { const r = reg(el.dataset.p, el.dataset.d, true); if (el.value === '') delete r.kpi[el.dataset.k]; else r.kpi[el.dataset.k] = Number(el.value); marcar('dia', el.dataset.p, el.dataset.d); render(); },
  kpiM: el => { const r = mesReg(el.dataset.p, el.dataset.m, true); if (el.value === '') delete r.kpi[el.dataset.k]; else r.kpi[el.dataset.k] = Number(el.value); marcar('mes', el.dataset.p, el.dataset.m); render(); },
  status: el => { const r = reg(el.dataset.p, el.dataset.d, true); if (el.value === 'normal') delete r.status; else r.status = el.value; marcar('dia', el.dataset.p, el.dataset.d); render(); },
  conferido: el => { const r = reg(el.dataset.p, el.dataset.d, true); r.conferido = el.checked; r.conferidoEm = el.checked ? `${fmtCurta(hoje())} ${hora()} por ${EU.nome}` : ''; marcar('dia', el.dataset.p, el.dataset.d); render(); },
  obs: el => { reg(el.dataset.p, el.dataset.d, true).obs = el.value; marcar('dia', el.dataset.p, el.dataset.d); },
  irData: async el => { if (el.value) { UI.data = el.value; await garantirMes(mesDe(UI.data)); render(); } },
  meta: el => { const p = pessoa(el.dataset.p), k = kpiDe(p, el.dataset.k); k.meta = Number(el.value) || 0; marcar('pessoa', p.id); render(); },
  remPessoa: el => { UI.remPessoa = el.value; render(); },
  simMeta: el => { UI.simMeta = +el.value; render(); },
  simCheck: el => { UI.simCheck = +el.value; render(); },
  fbFiltro: el => { UI.fbPessoa = el.value; render(); },
  cfgPessoa: el => { UI.cfgPessoa = el.value; render(); },
  set: el => {
    const t = el.dataset.t; const v = t === 'bool' ? el.checked : t === 'num' ? numOuVazio(el.value) : el.value;
    setPath(el.dataset.path, t === 'num' && v === '' ? 0 : v); marcarPath(el.dataset.path); render();
  },
  setSup: el => { const p = D.pessoas[+el.dataset.i], novo = el.value || null;
    let x = novo && pessoa(novo); while (x) { if (x.id === p.id) { avisar('Isso criaria um ciclo no organograma.'); render(); return; } x = x.supervisor && pessoa(x.supervisor); }
    p.supervisor = novo; marcar('pessoa', p.id); render(); },
  dia: el => { const p = D.pessoas[+el.dataset.i], v = +el.dataset.v; p.dias = el.checked ? [...new Set([...p.dias, v])].sort() : p.dias.filter(x => x !== v); marcar('pessoa', p.id); render(); },
  codigos: el => { setPath(el.dataset.path, parseCodigos(el.value)); marcarPath(el.dataset.path); D.bonif = {}; carregarBonif(mesDe(hoje())).then(render); render(); },
  perm: el => { const p = D.pessoas[+el.dataset.i]; p.permissoes = { ...(p.permissoes || {}), [el.dataset.k]: el.checked }; marcar('pessoa', p.id); render(); },
  feriados: el => { D.config.feriados = el.value.split(/\s+/).map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)); marcar('config'); render(); },
  solPadrao: el => { if (!el.value && Array.isArray(D.config.solicitacoes?.[el.dataset.k])) return; D.config.solicitacoes = { ...(D.config.solicitacoes || {}), [el.dataset.k]: el.value }; marcar('config'); },
  entQtd: el => { if (el.value !== '') entAcao({ acao: 'conferir', id_nota: el.dataset.nota, id_item: el.dataset.item, qtd: Number(el.value) }); },
  solCampo: el => mudarSolicitacao(el.dataset.id, el.dataset.k, el.value).catch(e => avisar(e.message)),
  solResp: el => solResp(el.dataset.id, el.value, el.checked).catch(e => avisar(e.message)),
  solFotos: el => { const arqs = [...el.files]; if (arqs.length) solFotos(el.dataset.id, arqs).catch(e => avisar(e.message)); },
  solEtapa: el => mudarEtapa(el.dataset.id, el.value).catch(e => avisar(e.message)),
};

document.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (el && A[el.dataset.a]) { if (el.tagName === 'A') e.preventDefault(); A[el.dataset.a](el, e); } });
document.addEventListener('change', e => { const el = e.target.closest('[data-c]'); if (el && C[el.dataset.c] && el.type !== 'search') C[el.dataset.c](el, e); });
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.live) { const lb = document.getElementById(el.dataset.live); if (lb) lb.textContent = el.value + '%'; }
  if (el.type === 'search' && el.dataset.c === 'ui') C.ui(el);
  if (el.dataset.filtro) filtrarLista(el);
});
/** Busca instantânea numa lista já desenhada (sem redesenhar a tela): esconde as linhas que não batem. */
function filtrarLista(el) {
  const alvo = document.getElementById(el.dataset.filtro); if (!alvo) return;
  const termos = semAcento(el.value).toLowerCase().split(/\s+/).filter(Boolean);
  let n = 0;
  alvo.querySelectorAll('tbody tr, .item-lista').forEach(tr => {
    const okL = !termos.length || termos.every(t => (tr._txt ||= semAcento(tr.textContent).toLowerCase()).includes(t));
    tr.hidden = !okL; if (okL) n++;
  });
  const cont = document.getElementById(el.dataset.filtro + '_n'); if (cont) cont.textContent = termos.length ? `${n} encontrado(s)` : '';
}
const semAcento = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '');
/** Caixa de busca + lista com altura máxima e rolagem. */
const listaCurta = (id, conteudo, ph = 'Buscar…', alta) => `<input type="search" class="busca-lista" data-filtro="${id}" placeholder="${esc(ph)}" autocomplete="off"><div class="conta-lista" id="${id}_n"></div><div class="lista-curta ${alta ? 'alta' : ''}" id="${id}">${conteudo}</div>`;
window.addEventListener('hashchange', () => { const v = location.hash.replace('#/', ''); if (v && v !== UI.view && VIEWS_FN[v]) { UI.view = v; render(); } });

// ═══════════════════════════ login e início ═══════════════════════════
function telaLogin(msg = '') {
  document.body.innerHTML = `<div class="login"><form class="caixa" id="formLogin">
    <img src="img/logo.svg" alt="Protemaxxi"><div class="sub">Intranet</div>
    <label>E-mail<input type="email" id="lEmail" autocomplete="username" required></label>
    <label>Senha<input type="password" id="lSenha" autocomplete="current-password" required></label>
    <button class="btn pri" type="submit">Entrar</button><div class="erro" id="lErro">${esc(msg)}</div>
    <div class="rodape">Esqueceu a senha? Peça ao administrador para trocar.</div></form></div>`;
  $('#formLogin').addEventListener('submit', async e => {
    e.preventDefault(); $('#lErro').textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email: $('#lEmail').value.trim(), password: $('#lSenha').value });
    if (error) { $('#lErro').textContent = /invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message; return; }
    location.reload();
  });
}
// ─── proteções do navegador ───
// Não deixa a Intranet ser aberto dentro de outro site (clickjacking).
if (window.top !== window.self) { try { window.top.location = window.location.href; } catch { document.documentElement.innerHTML = ''; } }
// Sai sozinho depois de 8 horas sem uso.
const LIMITE_OCIOSO = 8 * 3600e3;
const marcarAtividade = () => { try { localStorage.setItem('crm-ativo', String(Date.now())); } catch { /* ok */ } };
['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, marcarAtividade, { passive: true }));
async function checarOcioso() {
  let ultimo = 0; try { ultimo = +localStorage.getItem('crm-ativo') || 0; } catch { /* ok */ }
  if (ultimo && Date.now() - ultimo > LIMITE_OCIOSO) { try { localStorage.removeItem('crm-ativo'); } catch { /* ok */ } await sb.auth.signOut(); location.reload(); return true; }
  return false;
}

// ─── 2FA (código no celular) ───
function caixaMFA(conteudo) {
  document.body.innerHTML = `<div class="login"><div class="caixa"><img src="img/logo.svg" alt="Protemaxxi"><div class="sub">Verificação em duas etapas</div>${conteudo}
    <div class="erro" id="mfaErro"></div><div class="rodape"><a href="#" id="mfaSair" style="color:#7F93A6">Sair e entrar com outro login</a></div></div></div>`;
  $('#mfaSair').addEventListener('click', async e => { e.preventDefault(); await sb.auth.signOut(); location.reload(); });
}
async function verificarCodigo(factorId) {
  const code = ($('#mfaCodigo').value || '').replace(/\D/g, '');
  if (code.length !== 6) { $('#mfaErro').textContent = 'Digite os 6 números do aplicativo.'; return; }
  $('#mfaErro').textContent = 'Conferindo…';
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) { $('#mfaErro').textContent = /invalid|expired/i.test(error.message) ? 'Código errado ou vencido. Use o código que está aparecendo agora.' : error.message; $('#mfaCodigo').value = ''; $('#mfaCodigo').focus(); return; }
  location.reload();
}
function campoCodigo(rotulo) {
  return `<label>${rotulo}<input id="mfaCodigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" style="font-size:24px;letter-spacing:.3em;text-align:center"></label>
    <button class="btn pri" id="mfaOk" type="button">Confirmar</button>`;
}
async function telaMFAVerificar() {
  const { data } = await sb.auth.mfa.listFactors();
  const f = data?.totp?.[0];
  if (!f) return telaMFACadastrar();
  caixaMFA(`<p style="text-align:center;color:#A9B7C4;font-size:14px">Abra o aplicativo autenticador no seu celular e digite o código da <b>Intranet Protemaxxi</b> (ou "CRM Protemaxxi", se cadastrou antes).</p>${campoCodigo('Código de 6 números')}`);
  const ir = () => verificarCodigo(f.id);
  $('#mfaOk').addEventListener('click', ir);
  $('#mfaCodigo').addEventListener('keydown', e => { if (e.key === 'Enter') ir(); });
  $('#mfaCodigo').focus();
}
async function telaMFACadastrar() {
  // apaga tentativas de cadastro que não foram concluídas
  const { data: lista } = await sb.auth.mfa.listFactors();
  for (const f of (lista?.all || []).filter(f => f.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Intranet Protemaxxi ' + new Date().toISOString().slice(0, 16) });
  if (error) { caixaMFA(`<p style="color:#FF8A80">Não deu para iniciar o cadastro do 2FA: ${esc(error.message)}</p>`); return; }
  caixaMFA(`<p style="color:#A9B7C4;font-size:14px;margin-top:0">Por segurança, o seu acesso precisa de um <b>código do celular</b> além da senha. É só na primeira vez:</p>
    <ol style="color:#C9D3DC;font-size:13.5px;padding-left:18px;margin:0 0 12px">
      <li>Instale no celular o <b>Google Authenticator</b> ou o <b>Microsoft Authenticator</b> (grátis).</li>
      <li>No aplicativo, toque em <b>+</b> e escolha <b>ler QR code</b>.</li>
      <li>Aponte para o código abaixo e digite os 6 números que aparecerem.</li></ol>
    <div style="background:#fff;border-radius:12px;padding:10px;width:200px;margin:0 auto 8px"><img src="${esc(data.totp.qr_code)}" alt="QR code do 2FA" style="width:180px;height:180px;display:block"></div>
    <p style="text-align:center;font-size:12px;color:#7F93A6;word-break:break-all">Sem câmera? Digite esta chave no aplicativo:<br><b style="color:#C9D3DC;font-family:monospace">${esc(data.totp.secret)}</b></p>
    ${campoCodigo('Código de 6 números')}`);
  const ir = () => verificarCodigo(data.id);
  $('#mfaOk').addEventListener('click', ir);
  $('#mfaCodigo').addEventListener('keydown', e => { if (e.key === 'Enter') ir(); });
}

async function iniciar() {
  try { const t = localStorage.getItem('crm-tema'); if (t) document.documentElement.dataset.theme = t; } catch { /* ok */ }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return telaLogin();
  if (await checarOcioso()) return;
  const { data: nivel } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (nivel?.currentLevel !== 'aal2') {
    if (nivel?.nextLevel === 'aal2') return telaMFAVerificar();
    const { data: precisa } = await sb.rpc('precisa_mfa');
    if (precisa === true) return telaMFACadastrar();
  }
  marcarAtividade();
  setInterval(checarOcioso, 60e3);
  try { await carregarTudo(); } catch (e) { console.error(e); return telaLogin('Erro ao carregar: ' + e.message); }
  if (!EU) { await sb.auth.signOut(); return telaLogin('Seu login ainda não está ligado a uma pessoa do sistema. Fale com o administrador.'); }
  const v = location.hash.replace('#/', ''); if (VIEWS_FN[v]) UI.view = v;
  const retornoML = new URLSearchParams(location.search).get('ml');
  if (retornoML) {
    history.replaceState(null, '', location.pathname + '#/ml'); UI.view = 'ml';
    const msg = { ok: '✓ Mercado Livre conectado! Os pedidos e as perguntas começam a chegar em poucos minutos.', negado: 'Você não autorizou o acesso no Mercado Livre.', expirado: 'O pedido de conexão expirou. Clique em Conectar de novo.', erro_token: 'O Mercado Livre recusou a conexão. Confira as chaves e a URL de redirect no app do ML.' }[retornoML] || 'Não foi possível conectar: ' + retornoML;
    setTimeout(() => avisar(msg), 400);
    if (retornoML === 'ok') D.sync.ml = { ...(D.sync.ml || {}), conectado: true };
  }
  const retornoGads = new URLSearchParams(location.search).get('gads');
  if (retornoGads) {
    history.replaceState(null, '', location.pathname + '#/trafego'); UI.view = 'trafego';
    const msg = { ok: '✓ Google Ads conectado! A primeira sincronização traz 90 dias de histórico (pode levar alguns minutos).', negado: 'Você não autorizou o acesso no Google.', expirado: 'O pedido de conexão expirou. Clique em Conectar de novo.', erro_token: 'O Google recusou a conexão. Veja o aviso na aba Tráfego.', sem_refresh: 'O Google não deu a autorização permanente. Veja o aviso na aba Tráfego.', sem_codigo: 'O Google não devolveu o código de acesso.' }[retornoGads] || 'Retorno do Google Ads.';
    setTimeout(() => avisar(msg), 400);
    if (retornoGads === 'ok') { D.sync.gads = { ...(D.sync.gads || {}), conectado: true }; chamarFuncao('gads-sync', { acao: 'sincronizar', completo: true }).then(() => carregarTrafego(true)).then(render).catch(() => {}); }
  }
  const retornoV3 = new URLSearchParams(location.search).get('tinyv3');
  if (retornoV3) {
    history.replaceState(null, '', location.pathname + location.hash);
    UI.view = 'config'; UI.cfgTab = 'tiny';
    const msg = { ok: '✓ Tiny v3 conectado! As ordens de serviço começam a chegar em poucos minutos.', negado: 'Você não autorizou o acesso no Tiny.', expirado: 'O pedido de conexão expirou. Clique em Conectar de novo.', erro_token: 'O Tiny recusou a conexão. Confira as chaves no Supabase e tente de novo.' }[retornoV3] || 'Não foi possível conectar: ' + retornoV3;
    setTimeout(() => avisar(msg), 400);
  }
  if (v === 'tv') { UI.view = 'vendas'; setTimeout(() => A.tv(), 300); }
  if (!UI.pessoa) UI.pessoa = EU.id;
  statusSalvo('✓ Conectado');
  render();
  if (veExp()) carregarExp().then(render).catch(e => console.warn('expedição', e));
  // mantém atualizado: a cada 10 min recarrega pedidos e solicitações; ao voltar para a aba também
  const atualizar = async () => { try { await Promise.all([carregarPedidos(`${addMes(mesDe(hoje()), -13)}-01`), carregarSolicitacoes(), carregarInteracoes(), carregarBonif(mesDe(hoje())), veML() && D.ml ? carregarML(true) : null, veExp() && EXP ? carregarExp(true) : null, ok(sb.from('sync_estado').select('*')).then(est => { D.sync = Object.fromEntries(est.map(x => [x.chave, { ...x.valor, em_db: x.atualizado_em }])); })]); if (!$('#modal')) render(); } catch { /* offline */ } };
  setInterval(atualizar, 10 * 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !document.activeElement?.matches('input,textarea,select')) atualizar(); });
  let diaAtual = hoje();
  setInterval(() => { if (hoje() !== diaAtual) { if (UI.data === diaAtual) UI.data = hoje(); if (UI.mes === mesDe(diaAtual)) UI.mes = mesDe(hoje()); diaAtual = hoje(); render(); } }, 60000);
}
iniciar();
