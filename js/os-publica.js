'use strict';
/* Página pública "Acompanhe sua OS": lê só com o código secreto do link (?t=…). Mostra etapa, linha do tempo e contato da loja;
   não mostra CPF, telefone nem endereço do cliente. */
(async () => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = document.getElementById('conteudo');
  const t = new URLSearchParams(location.search).get('t') || '';
  if (!/^[a-f0-9]{20,}$/.test(t)) { el.innerHTML = '<div class="card vazio">Link inválido. Confira o link que recebeu da loja.</div>'; return; }
  const sb = window.supabase.createClient(window.CRM_CONFIG.url, window.CRM_CONFIG.anonKey, { auth: { persistSession: false } });
  const { data: o, error } = await sb.rpc('os_publica', { p_token: t });
  if (error || !o) { el.innerHTML = '<div class="card vazio">Não encontramos esta OS. Fale com a loja.</div>'; return; }
  const NOMES = { recebido: 'Recebido', em_analise: 'Em análise técnica', aguardando_cliente: 'Aguardando sua aprovação', aguardando_peca: 'Aguardando peça', na_assistencia: 'Na assistência técnica do fabricante', retornou: 'Retornou da assistência', pronto: 'Disponível para retirada', entregue: 'Entregue', cancelado: 'Cancelada' };
  const ETAPA = { enviado: 'Enviado à Assistência Técnica', recebido: 'Recebido pela Assistência Técnica', em_analise: 'Em análise pela Assistência Técnica', orcamento: 'Orçamento para aprovação',
    aprovado: 'Em manutenção na Assistência Técnica', recusado: 'Devolução sem reparo (orçamento recusado)', finalizado: 'Manutenção finalizada, aguardando retirada pela empresa' };
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const RES = { reparado: 'Reparado', trocado: 'Trocado', sem_defeito: 'Sem defeito constatado', negado: 'Garantia negada pelo fabricante', devolvido: 'Devolvido sem reparo', credito: 'Convertido em crédito' };
  const passo = { recebido: 1, em_analise: 2, aguardando_cliente: 2, aguardando_peca: 2, na_assistencia: 3, retornou: 3, pronto: 4, entregue: 5, cancelado: 0 }[o.status] ?? 1;
  const data = d => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '';
  const emp = o.empresa || {};
  document.getElementById('titulo').textContent = `OS ${o.numero}`;
  document.title = `OS ${o.numero} · ${emp.nome || ''}`;
  const zap = (emp.whatsapp || '').replace(/\D/g, '');
  el.innerHTML = `<div class="card"><div style="color:#4D5B69">Olá${o.cliente ? ', ' + esc(o.cliente) : ''}! Situação do seu equipamento:</div>
      <div style="margin-top:8px"><span class="status">${esc(o.status === 'na_assistencia' && ETAPA[o.assistencia_etapa] ? ETAPA[o.assistencia_etapa] : NOMES[o.status] || o.status)}</span></div>
      ${o.status !== 'cancelado' ? `<div class="barra">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= passo ? 'on' : ''}"></i>`).join('')}</div><div class="rotulos"><span>Recebido</span><span>Análise</span><span>Assistência</span><span>Pronto</span><span>Entregue</span></div>` : ''}
      ${o.orcamento ? (q => q ? `<div class="orc"><h3 style="margin:14px 0 6px;font-family:Archivo">Orçamento para aprovação</h3>
          ${(q.itens || []).map(i => `<div class="linha"><span>${esc(i.descricao)}</span><b>${brl(i.valor)}</b></div>`).join('')}${+q.frete ? `<div class="linha"><span>Frete</span><b>${brl(q.frete)}</b></div>` : ''}
          <div class="linha" style="font-size:18px"><span><b>Total</b></span><b>${brl(q.total)}</b></div>
          ${q.validade ? `<p style="margin:6px 0 0;color:#4D5B69">Válido até ${data(q.validade)}.</p>` : ''}${q.obs ? `<p style="margin:6px 0 0">${esc(q.obs)}</p>` : ''}
          ${+q.taxa_recusa ? `<p style="margin:6px 0 0;color:#4D5B69">Se não aprovar, há uma taxa de análise de ${brl(q.taxa_recusa)}.</p>` : ''}</div>`
        : `<p style="margin:14px 0 0"><b>Orçamento aguardando sua aprovação: ${brl(o.orcamento)}</b></p>`)(o.orcamento_detalhe) : ''}
      ${o.orcamento_responder ? `<div class="aprov"><p style="margin:10px 0">${o.diagnostico ? `<b>Diagnóstico:</b> ${esc(o.diagnostico)}<br>` : ''}Para responder, confirme seus dados (os mesmos do cadastro da OS):</p>
        <label>CPF ou CNPJ<input id="apDoc" inputmode="numeric" autocomplete="off"></label>
        <label>Nome completo<input id="apNome" autocomplete="name"></label>
        <div class="aprov-bts"><button type="button" id="apSim" class="sim">✔ Aprovar orçamento</button><button type="button" id="apNao" class="nao">✕ Recusar</button></div>
        <div id="apRecusa" style="display:none"><label>Por que não vai aprovar? <small>(obrigatório)</small><input id="apObs" maxlength="300" placeholder="Ex.: valor alto, vou comprar um novo…"></label>
          <div class="aprov-bts"><button type="button" id="apNaoOk" class="nao">Confirmar recusa</button></div></div>
        <div id="apMsg" class="ap-msg"></div></div>` : ''}
      ${o.resultado ? `<p style="margin:14px 0 0">Resultado: <b>${esc(RES[o.resultado] || o.resultado)}</b></p>` : ''}</div>
    <div class="card">${(o.itens && o.itens.length ? o.itens : [{ descricao: o.produto, marca: o.marca, modelo: o.modelo, serie: o.serie, quantidade: 1 }]).map((i, k, l) => `<div class="linha"><span>${l.length > 1 ? 'Produto ' + (k + 1) : 'Equipamento'}</span><b>${+i.quantidade > 1 ? esc(String(i.quantidade)) + 'x ' : ''}${esc(i.descricao || '')}${[i.marca, i.modelo].filter(Boolean).length ? ' · ' + esc([i.marca, i.modelo].filter(Boolean).join(' ')) : ''}${i.serie ? ' · SN ' + esc(i.serie) : ''}</b></div>`).join('')}<div class="linha"><span>Aberta em</span><b>${data(o.aberta_em)}</b></div>
      ${o.previsao && !o.entregue_em ? `<div class="linha"><span>Previsão</span><b>${data(o.previsao)}</b></div>` : ''}${o.entregue_em ? `<div class="linha"><span>Entregue em</span><b>${data(o.entregue_em)}</b></div>` : ''}</div>
    <div class="card"><h3 style="margin:0 0 12px;font-family:Archivo">Andamento</h3><ul class="passos">${(o.eventos || []).slice().reverse().map(e => `<li><b>${esc(e.texto)}</b><small>${new Date(e.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></li>`).join('')}</ul></div>
    ${zap ? `<div class="card contato"><a href="https://wa.me/${zap.length > 11 ? zap : '55' + zap}?text=${encodeURIComponent('Olá! Quero falar sobre a minha OS ' + o.numero)}" target="_blank" rel="noopener">💬 Falar com a loja sobre esta OS</a></div>` : ''}`;
  const responder = async aprova => {
    const doc = document.getElementById('apDoc').value.replace(/\D/g, ''), nome = document.getElementById('apNome').value.trim(), msg = document.getElementById('apMsg');
    if (doc.length !== 11 && doc.length !== 14) { msg.textContent = 'Informe o CPF (11 números) ou o CNPJ (14 números).'; return; }
    if (nome.split(/\s+/).length < 2) { msg.textContent = 'Informe o nome completo.'; return; }
    const obs = document.getElementById('apObs')?.value.trim() || '';
    if (!aprova && obs.length < 3) { msg.textContent = 'Conte o motivo da recusa.'; document.getElementById('apObs')?.focus(); return; }
    if (!confirm(aprova ? 'Confirma a APROVAÇÃO do orçamento?' : 'Confirma que NÃO aprova o orçamento? O equipamento será devolvido sem reparo.')) return;
    document.querySelectorAll('.aprov-bts button').forEach(x => { x.disabled = true; });
    const { data: r, error: er } = await sb.rpc('os_orcamento_responder', { p_token: t, p_doc: doc, p_nome: nome, p_aprova: aprova, p_obs: obs || null });
    if (er || !r?.ok) { msg.textContent = r?.erro || 'Não foi possível registrar agora. Tente de novo ou fale com a loja.'; document.querySelectorAll('.aprov-bts button').forEach(x => { x.disabled = false; }); return; }
    msg.className = 'ap-msg ok'; msg.textContent = aprova ? 'Orçamento aprovado! Vamos seguir com o serviço e avisamos a cada etapa.' : 'Resposta registrada. Avisaremos quando o equipamento estiver disponível para retirada.';
    setTimeout(() => location.reload(), 2500);
  };
  document.getElementById('apSim')?.addEventListener('click', () => responder(true));
  document.getElementById('apNao')?.addEventListener('click', () => { document.getElementById('apRecusa').style.display = 'block'; document.getElementById('apObs').focus(); });
  document.getElementById('apNaoOk')?.addEventListener('click', () => responder(false));
  document.getElementById('rodape').innerHTML = `${esc(emp.nome || '')}${emp.endereco ? ' · ' + esc(emp.endereco) : ''}${emp.telefone ? ' · ' + esc(emp.telefone) : ''}`;
})();
