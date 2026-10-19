'use strict';
/* Portal do fornecedor (página pública). Acesso:
   ?c=<convite>  → cadastro do fornecedor (link de uso único);
   ?t=<token>[&o=<id>] → cotações às quais ele foi convidado (o link é exclusivo de cada fornecedor);
   sem nada → link mágico por e-mail (só para fornecedor com login liberado pela Protemaxxi).
   Tudo passa pelas funções forn_* do banco: o fornecedor não lê nenhuma tabela e só vê a própria proposta. */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const R = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const N = v => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const dh = s => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const num = s => { const t = String(s ?? '').trim().replace(/\s|R\$/g, ''); if (!t) return null; const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return isFinite(n) && n >= 0 ? n : NaN; };
  const el = document.getElementById('conteudo'), $ = s => document.querySelector(s);
  const q = new URLSearchParams(location.search);
  const sb = window.supabase.createClient(window.CRM_CONFIG.url, window.CRM_CONFIG.anonKey, { auth: { persistSession: true, storageKey: 'portal-fornecedor', detectSessionInUrl: true } });
  const guardar = t => { try { t ? localStorage.setItem('forn-token', t) : localStorage.removeItem('forn-token'); } catch { /* sem armazenamento */ } };
  const lido = () => { try { return localStorage.getItem('forn-token'); } catch { return null; } };
  let TOKEN = q.get('t') || null, PORTAL = null, OP = null;
  const valido = t => /^[a-f0-9]{32,}$/.test(t || '');
  const erro = m => { el.oninput = el.onchange = null; el.innerHTML = `<div class="card vazio">${esc(m)}</div>`; };
  const SIT = { aberta: ['Recebendo propostas', 'ok'], encerrada: ['Prazo encerrado', 'med'], concluida: ['Encerrada', ''], cancelada: ['Cancelada', 'ruim'] };

  // ─── cadastro por convite ───
  async function telaCadastro(c) {
    const { data: cv, error } = await sb.rpc('forn_convite_ver', { p_convite: c });
    if (error || !cv) return erro('Este convite não vale mais (já foi usado ou venceu). Peça um novo link à equipe de compras.');
    $('#titulo').textContent = 'Cadastro de fornecedor';
    $('#subtitulo').textContent = `${cv.empresa || 'A loja'} convidou você para enviar cotações pelo portal.`;
    el.innerHTML = `<div class="card"><h2>Seus dados</h2><div class="grade">
        <label>Razão social *<input id="cNome" maxlength="160" value="${esc(cv.nome || '')}"></label>
        <label>CNPJ *<input id="cCnpj" inputmode="numeric" placeholder="00.000.000/0000-00"></label>
        <label>Seu nome (vendedor)<input id="cContato" maxlength="120"></label>
        <label>WhatsApp<input id="cZap" type="tel" value="${esc(cv.whatsapp || '')}"></label>
        <label>E-mail<input id="cEmail" type="email" value="${esc(cv.email || '')}"></label>
        <label>Marcas que você atende<input id="cMarcas" value="${esc((cv.marcas || []).join(', '))}" placeholder="Intelbras, Hikvision…"></label></div>
      <div class="acoes"><button class="btn pri" id="cSalvar">Concluir cadastro</button></div></div>`;
    $('#cSalvar').onclick = async () => {
      const b = $('#cSalvar'), cnpj = $('#cCnpj').value.replace(/\D/g, '');
      if ($('#cNome').value.trim().length < 2) return alert('Informe a razão social.');
      if (![11, 14].includes(cnpj.length)) return alert('CNPJ inválido.');
      b.disabled = true;
      const { data, error: e } = await sb.rpc('forn_cadastrar', { p_convite: c, p: { nome: $('#cNome').value, cnpj, contato: $('#cContato').value, whatsapp: $('#cZap').value, email: $('#cEmail').value, marcas: $('#cMarcas').value.split(',') } });
      if (e || !data?.token) { b.disabled = false; return alert('Não foi possível concluir: ' + (e?.message || 'tente de novo.')); }
      TOKEN = data.token; guardar(TOKEN); history.replaceState(null, '', `?t=${TOKEN}`);
      await telaPortal();
      el.insertAdjacentHTML('afterbegin', '<div class="card aviso">✓ Cadastro feito! Guarde o link desta página (ele é só seu): é por ele que você recebe e responde as cotações.</div>');
    };
  }

  // ─── lista de cotações ───
  async function telaPortal(irPara) {
    const { data, error } = await sb.rpc('forn_portal', { p_token: TOKEN });
    if (error || !data) { guardar(null); return telaEntrar('Este link não é válido ou foi trocado. Peça um novo à equipe de compras.'); }
    PORTAL = data; if (TOKEN) guardar(TOKEN);
    const f = data.fornecedor;
    $('#titulo').textContent = f.nome; $('#subtitulo').textContent = `Cotações de ${data.empresa || 'Protemaxxi'} para você`;
    if (irPara) return telaOp(irPara);
    el.oninput = el.onchange = null;
    const ops = data.oportunidades || [], abertas = ops.filter(o => o.aberta), outras = ops.filter(o => !o.aberta);
    const linha = o => { const [n, c] = o.vencedora ? ['🏆 Sua proposta venceu', 'ok'] : SIT[o.situacao] || ['', ''];
      return `<div class="op" data-op="${o.id}"><div><b>${esc(o.titulo)}</b><br><small class="mut">${o.itens} item(ns)${o.prazo_resposta ? ' · responder até ' + dh(o.prazo_resposta) : ''}</small></div>
        <div style="text-align:right"><span class="tag ${c}">${n}</span><br><small class="mut">${o.proposta === 'enviada' ? '✓ proposta enviada' : o.proposta === 'rascunho' ? 'rascunho salvo' : o.aberta ? 'aguardando sua proposta' : ''}</small></div></div>`; };
    el.innerHTML = `<div class="card"><h2>Abertas (${abertas.length})</h2>${abertas.map(linha).join('') || '<p class="mut">Nenhuma cotação aberta para você agora.</p>'}</div>
      ${outras.length ? `<div class="card"><h2>Anteriores</h2>${outras.map(linha).join('')}</div>` : ''}
      <div class="card"><h2>Meus dados</h2><div class="grade">
        <label>Contato<input id="mContato" value="${esc(f.contato || '')}"></label><label>WhatsApp<input id="mZap" type="tel" value="${esc(f.whatsapp || '')}"></label>
        <label>E-mail<input id="mEmail" type="email" value="${esc(f.email || '')}"></label><label>Marcas<input id="mMarcas" value="${esc((f.marcas || []).join(', '))}"></label></div>
        <div class="acoes"><button class="btn" id="mSalvar">Salvar meus dados</button><small class="mut">CNPJ ${esc(f.cnpj || '')}</small></div></div>`;
    el.querySelectorAll('.op').forEach(d => d.onclick = () => telaOp(+d.dataset.op));
    $('#mSalvar').onclick = async () => {
      const { error: e } = await sb.rpc('forn_meus_dados', { p_token: TOKEN, p: { contato: $('#mContato').value, whatsapp: $('#mZap').value, email: $('#mEmail').value, marcas: $('#mMarcas').value.split(',') } });
      alert(e ? 'Não foi possível salvar: ' + e.message : 'Dados salvos.');
    };
  }

  // ─── uma cotação: preencher e enviar a proposta ───
  async function telaOp(id) {
    const { data: o, error } = await sb.rpc('forn_oportunidade', { p_token: TOKEN, p_op: id });
    if (error || !o) return erro('Cotação não encontrada.');
    OP = o; if (TOKEN) history.replaceState(null, '', `?t=${TOKEN}&o=${o.id}`);
    const p = o.proposta || {}, pi = Object.fromEntries((p.itens || []).map(x => [x.item_id, x])), ed = o.aberta;
    const [sn, sc] = SIT[o.situacao] || ['', ''];
    const status = o.situacao === 'concluida' ? (p.vencedora ? '<div class="aviso">🏆 Sua proposta foi a escolhida! A equipe de compras vai entrar em contato com o pedido.</div>' : p.status === 'enviada' ? '<div class="aviso med">Esta cotação foi encerrada e desta vez escolhemos outra proposta. Obrigado por participar!</div>' : '<div class="aviso med">Esta cotação foi encerrada.</div>')
      : o.situacao === 'cancelada' ? '<div class="aviso ruim">Esta cotação foi cancelada pela loja.</div>'
      : !ed ? '<div class="aviso med">O prazo para responder terminou.</div>'
      : p.status === 'enviada' ? `<div class="aviso">✓ Proposta enviada em ${dh(p.enviada_em)}. Você pode alterar e reenviar até ${dh(o.prazo_resposta)}.</div>` : '';
    el.innerHTML = `<div class="card"><a class="voltar" id="voltar">← Todas as cotações</a>
        <h2 style="margin-top:10px">${esc(o.titulo)} <span class="tag ${sc}">${sn}</span></h2>
        <p class="mut" style="margin:0">${o.prazo_resposta ? 'Responder até <b>' + dh(o.prazo_resposta) + '</b>' : ''}${o.pagamento ? ' · Pagamento desejado: ' + esc(o.pagamento) : ''}${o.entrega ? ' · Entrega: ' + esc(o.entrega) : ''}</p>
        ${o.descricao ? `<p style="white-space:pre-wrap">${esc(o.descricao)}</p>` : ''}${status ? '<div style="margin-top:12px">' + status + '</div>' : ''}</div>
      <div class="card"><h2>Itens</h2><table class="itens"><thead><tr><th>Item</th><th class="num">Qtd</th><th class="num">Preço unitário (R$)</th><th>Marca / modelo ofertado</th><th>Tenho</th><th class="num">Subtotal</th></tr></thead><tbody>
        ${o.itens.map(i => { const x = pi[i.id] || {}; return `<tr data-item="${i.id}" data-qtd="${i.quantidade}"><td class="desc"><b>${esc(i.descricao)}</b>${i.codigo ? ` <small class="mut">[${esc(i.codigo)}]</small>` : ''}${i.especificacao ? `<br><small class="mut">${esc(i.especificacao)}</small>` : ''}</td>
          <td class="num">${N(i.quantidade)} ${esc(i.unidade)}</td><td class="num"><input class="preco" inputmode="decimal" value="${x.preco_unit != null ? String(x.preco_unit).replace('.', ',') : ''}" ${ed ? '' : 'disabled'} placeholder="0,00"></td>
          <td><input class="marca" maxlength="120" value="${esc(x.marca_modelo || '')}" ${ed ? '' : 'disabled'}></td><td><input type="checkbox" class="tem" ${x.disponivel === false ? '' : 'checked'} ${ed ? '' : 'disabled'}></td><td class="num sub">—</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="card"><h2>Condições</h2><div class="grade">
        <label>Prazo de entrega (dias) *<input id="pPrazo" type="number" min="0" max="365" value="${p.prazo_entrega_dias ?? ''}" ${ed ? '' : 'disabled'}></label>
        <label>Frete (R$, 0 = grátis)<input id="pFrete" inputmode="decimal" value="${p.frete ? String(p.frete).replace('.', ',') : ''}" ${ed ? '' : 'disabled'}></label>
        <label>Validade da proposta<input id="pValidade" type="date" value="${p.validade || ''}" ${ed ? '' : 'disabled'}></label>
        <label>Condição de pagamento<input id="pPag" maxlength="200" value="${esc(p.pagamento || '')}" ${ed ? '' : 'disabled'}></label></div>
        <label style="margin-top:12px">Observações<textarea id="pObs" rows="3" maxlength="1000" ${ed ? '' : 'disabled'}>${esc(p.obs || '')}</textarea></label>
        <div class="acoes" style="justify-content:space-between"><div>Total: <span class="total" id="pTotal">—</span><br><small class="mut" id="pCot"></small></div>
          ${ed ? '<div class="acoes" style="margin:0"><button class="btn" id="pRasc">Salvar rascunho</button><button class="btn pri" id="pEnviar">Enviar proposta</button></div>' : ''}</div></div>`;
    $('#voltar').onclick = () => { history.replaceState(null, '', TOKEN ? `?t=${TOKEN}` : location.pathname); telaPortal(); };
    const recalcular = () => {
      let tot = 0, cot = 0;
      el.querySelectorAll('tr[data-item]').forEach(tr => { const v = num(tr.querySelector('.preco').value), tem = tr.querySelector('.tem').checked, s = tem && v > 0 ? v * +tr.dataset.qtd : null;
        tr.querySelector('.sub').textContent = s != null ? R(s) : tem ? '—' : 'não tenho'; tr.querySelector('.preco').style.borderColor = Number.isNaN(v) ? 'var(--ruim)' : ''; if (s != null) { tot += s; cot++; } });
      const fr = num($('#pFrete').value) || 0; $('#pTotal').textContent = R(tot + fr);
      $('#pCot').textContent = `${cot} de ${o.itens.length} item(ns) cotado(s)${fr ? ' · frete ' + R(fr) : ''}`;
    };
    el.oninput = el.onchange = recalcular; recalcular();
    if (ed) { $('#pRasc').onclick = () => salvar(false); $('#pEnviar').onclick = () => salvar(true); }
  }
  async function salvar(enviar) {
    const itens = [...el.querySelectorAll('tr[data-item]')].map(tr => ({ item_id: +tr.dataset.item, preco_unit: num(tr.querySelector('.preco').value), disponivel: tr.querySelector('.tem').checked, marca_modelo: tr.querySelector('.marca').value.trim() || null }));
    if (itens.some(i => Number.isNaN(i.preco_unit))) return alert('Confira os preços marcados em vermelho (use números, ex.: 123,45).');
    const frete = num($('#pFrete').value);
    if (Number.isNaN(frete)) return alert('Confira o valor do frete.');
    if (enviar) {
      if (!itens.some(i => i.disponivel && i.preco_unit > 0)) return alert('Informe o preço de pelo menos um item.');
      if ($('#pPrazo').value === '') return alert('Informe o prazo de entrega em dias.');
      if (!confirm('Enviar a proposta? Você ainda pode alterar até o fim do prazo.')) return;
    }
    const botoes = el.querySelectorAll('#pRasc, #pEnviar'); botoes.forEach(b => (b.disabled = true));
    const { error } = await sb.rpc('forn_proposta_salvar', { p_token: TOKEN, p_op: OP.id, p_enviar: enviar, p: {
      prazo_entrega_dias: $('#pPrazo').value, frete: frete ?? 0, validade: $('#pValidade').value, pagamento: $('#pPag').value, obs: $('#pObs').value,
      itens: itens.map(i => ({ ...i, preco_unit: i.preco_unit ?? '' })) } });
    botoes.forEach(b => (b.disabled = false));
    if (error) return alert('Não foi possível salvar: ' + error.message);
    await telaOp(OP.id);
    el.insertAdjacentHTML('afterbegin', `<div class="card aviso">${enviar ? '✓ Proposta enviada. Obrigado!' : 'Rascunho salvo (ainda não foi enviado).'}</div>`);
    window.scrollTo(0, 0);
  }

  // ─── sem link: entrar por e-mail (link mágico) ───
  function telaEntrar(msg) {
    $('#titulo').textContent = 'Portal do fornecedor'; $('#subtitulo').textContent = ''; el.oninput = el.onchange = null;
    el.innerHTML = `<div class="card">${msg ? `<div class="aviso med" style="margin-bottom:14px">${esc(msg)}</div>` : ''}
      <h2>Como entrar</h2><p>Use o <b>link exclusivo</b> que a equipe de compras mandou para você por WhatsApp ou e-mail.</p>
      <p class="mut">Tem login liberado no portal? Receba um link de acesso no seu e-mail:</p>
      <div class="acoes" style="margin-top:0"><input id="eEmail" type="email" placeholder="seu@email.com" style="max-width:320px"><button class="btn" id="eEnviar">Enviar link</button></div></div>`;
    $('#eEnviar').onclick = async () => {
      const email = $('#eEmail').value.trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return alert('Digite um e-mail válido.');
      await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
      alert('Se este e-mail tiver acesso liberado, o link chega em alguns minutos.');   // mesma resposta sempre: não revela quem é cadastrado
    };
  }

  (async () => {
    const c = q.get('c');
    if (c) return valido(c) ? telaCadastro(c) : erro('Link de convite inválido.');
    if (TOKEN && !valido(TOKEN)) TOKEN = null;
    if (!TOKEN) TOKEN = valido(lido()) ? lido() : null;
    if (!TOKEN) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return telaEntrar();
      // login por link mágico: as funções reconhecem o fornecedor pelo usuário logado (token nulo)
    }
    await telaPortal(+q.get('o') || null);
  })().catch(e => erro('Erro ao carregar: ' + e.message));
})();
