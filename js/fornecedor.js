'use strict';
/* Portal do fornecedor (página pública). Acesso:
   ?c=<convite>  → cadastro do fornecedor (link de uso único, já com o CNPJ; cria o login);
   sem nada ou ?o=<id> → entrar com e-mail e senha;
   ?t=<token>[&o=<id>] → só para fornecedor cadastrado pela equipe, ainda sem login.
   Tudo passa pelas funções forn_* do banco: o fornecedor não lê nenhuma tabela e só vê a própria proposta. */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const R = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const N = v => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const dh = s => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const num = s => { const t = String(s ?? '').trim().replace(/\s|R\$/g, ''); if (!t) return null; const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return isFinite(n) && n >= 0 ? n : NaN; };
  const el = document.getElementById('conteudo'), $ = s => document.querySelector(s);
  const q = new URLSearchParams(location.search), recuperando = location.hash.includes('type=recovery');
  const sb = window.supabase.createClient(window.CRM_CONFIG.url, window.CRM_CONFIG.anonKey, { auth: { persistSession: true, storageKey: 'portal-fornecedor', detectSessionInUrl: true } });
  const guardar = t => { try { t ? localStorage.setItem('forn-token', t) : localStorage.removeItem('forn-token'); } catch { /* sem armazenamento */ } };
  const lido = () => { try { return localStorage.getItem('forn-token'); } catch { return null; } };
  let TOKEN = q.get('t') || null, PORTAL = null, OP = null;
  const valido = t => /^[a-f0-9]{32,}$/.test(t || '');
  const erro = m => { el.oninput = el.onchange = null; el.innerHTML = `<div class="card vazio">${esc(m)}</div>`; };
  const SIT = { aberta: ['Recebendo propostas', 'ok'], encerrada: ['Prazo encerrado', 'med'], concluida: ['Encerrada', ''], cancelada: ['Cancelada', 'ruim'] };

  const fmtCnpj = s => String(s || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const camposEndereco = (p, f) => `<div class="grade">
      <label>CEP *<input id="${p}Cep" inputmode="numeric" maxlength="9" value="${esc(f.cep || '')}"></label>
      <label>Rua *<input id="${p}Logradouro" maxlength="160" value="${esc(f.logradouro || '')}"></label>
      <label>Número *<input id="${p}Numero" maxlength="20" value="${esc(f.numero || '')}"></label>
      <label>Complemento<input id="${p}Complemento" maxlength="80" value="${esc(f.complemento || '')}"></label>
      <label>Bairro *<input id="${p}Bairro" maxlength="80" value="${esc(f.bairro || '')}"></label>
      <label>Cidade *<input id="${p}Cidade" maxlength="80" value="${esc(f.cidade || '')}"></label>
      <label>UF *<input id="${p}Uf" maxlength="2" value="${esc(f.uf || '')}"></label></div>`;
  const lerEndereco = p => ({ cep: $(`#${p}Cep`).value.trim(), logradouro: $(`#${p}Logradouro`).value.trim(), numero: $(`#${p}Numero`).value.trim(), complemento: $(`#${p}Complemento`).value.trim(),
    bairro: $(`#${p}Bairro`).value.trim(), cidade: $(`#${p}Cidade`).value.trim(), uf: $(`#${p}Uf`).value.trim().toUpperCase() });

  // ─── cadastro por convite ───
  async function telaCadastro(c) {
    const { data: cv, error } = await sb.rpc('forn_convite_ver', { p_convite: c });
    if (error || !cv) return erro('Este convite não vale mais (já foi usado ou venceu). Peça um novo link à equipe de compras.');
    $('#titulo').textContent = 'Cadastro de fornecedor';
    $('#subtitulo').textContent = `${cv.empresa || 'A loja'} convidou você para enviar cotações pelo portal.`;
    el.innerHTML = `<div class="card"><h2>Acesso ao portal</h2><div class="grade">
        <label>E-mail para login *<input id="cEmail" type="email" autocomplete="username" maxlength="160" value="${esc(cv.email || '')}"></label>
        <label>Senha *<input id="cSenha" type="password" autocomplete="new-password" maxlength="72" placeholder="Mínimo 8, com letras e números"></label>
        <label>Repita a senha *<input id="cSenha2" type="password" autocomplete="new-password" maxlength="72"></label></div></div>
      <div class="card"><h2>Empresa</h2><div class="grade">
        <label>CNPJ<input value="${esc(fmtCnpj(cv.cnpj))}" disabled></label>
        <label>Razão social *<input id="cNome" maxlength="160" value="${esc(cv.nome || '')}"></label></div>
        <h3>Contatos</h3><div class="grade">
        <label>Telefone *<input id="cTelefone" type="tel"></label>
        <label>WhatsApp *<input id="cZap" type="tel" value="${esc(cv.whatsapp || '')}"></label>
        <label>Nome do contato<input id="cContato" maxlength="120"></label></div>
        <h3>Endereço</h3>${camposEndereco('c', {})}
      <div class="acoes"><button class="btn pri" id="cSalvar">Concluir cadastro</button></div></div>`;
    $('#cSalvar').onclick = async () => {
      const b = $('#cSalvar'), email = $('#cEmail').value.trim(), senha = $('#cSenha').value, end = lerEndereco('c');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return alert('Digite um e-mail válido para o login.');
      if (senha.length < 8 || !/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) return alert('A senha precisa ter pelo menos 8 caracteres, com letras e números.');
      if (senha !== $('#cSenha2').value) return alert('As senhas não são iguais.');
      if ($('#cNome').value.trim().length < 2) return alert('Informe a razão social.');
      if (!$('#cTelefone').value.trim() || !$('#cZap').value.trim()) return alert('Informe o telefone e o WhatsApp.');
      if (end.cep.replace(/\D/g, '').length !== 8) return alert('Informe o CEP com 8 números.');
      if (!end.logradouro || !end.numero || !end.bairro || !end.cidade || end.uf.length !== 2) return alert('Preencha o endereço completo.');
      b.disabled = true;
      const { data, error: e } = await sb.functions.invoke('forn-cadastro', { body: { convite: c, email, senha, dados: { nome: $('#cNome').value, contato: $('#cContato').value, telefone: $('#cTelefone').value, whatsapp: $('#cZap').value, ...end } } });
      if (e || !data?.ok) { b.disabled = false; let m = data?.erro; try { m = m || (await e?.context?.json())?.erro; } catch { /* sem detalhe */ } return alert(m || 'Não foi possível concluir. Tente de novo.'); }
      const { error: e2 } = await sb.auth.signInWithPassword({ email, password: senha });
      TOKEN = null; guardar(null); history.replaceState(null, '', location.pathname);
      if (e2) return telaEntrar('Cadastro feito! Entre com seu e-mail e senha.');
      await telaPortal();
      el.insertAdjacentHTML('afterbegin', '<div class="card aviso">✓ Cadastro feito! Daqui em diante, entre com seu e-mail e senha.</div>');
    };
  }

  // ─── lista de cotações ───
  async function telaPortal(irPara) {
    const { data, error } = await sb.rpc('forn_portal', { p_token: TOKEN });
    if (error || !data) {
      guardar(null); TOKEN = null;
      await sb.auth.signOut();   // login que não é de fornecedor (ou bloqueado) não fica preso no portal
      return telaEntrar('Não encontramos um acesso de fornecedor ativo. Entre com seu e-mail e senha ou fale com a equipe de compras.');
    }
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
        <label>Contato<input id="mContato" value="${esc(f.contato || '')}"></label><label>Telefone<input id="mTelefone" type="tel" value="${esc(f.telefone || '')}"></label><label>WhatsApp<input id="mZap" type="tel" value="${esc(f.whatsapp || '')}"></label>
        <label>E-mail${f.tem_login ? ' (login)' : ''}<input id="mEmail" type="email" value="${esc(f.email || '')}" ${f.tem_login ? 'disabled' : ''}></label><label>Marcas<input id="mMarcas" value="${esc((f.marcas || []).join(', '))}"></label></div>
        <h3>Endereço</h3>${camposEndereco('m', f)}
        <div class="acoes"><button class="btn" id="mSalvar">Salvar meus dados</button>${f.tem_login ? '<button class="btn" id="mSair">Sair</button>' : ''}<small class="mut">CNPJ ${esc(fmtCnpj(f.cnpj))}</small></div></div>`;
    el.querySelectorAll('.op').forEach(d => d.onclick = () => telaOp(+d.dataset.op));
    $('#mSalvar').onclick = async () => {
      const { error: e } = await sb.rpc('forn_meus_dados', { p_token: TOKEN, p: { contato: $('#mContato').value, telefone: $('#mTelefone').value, whatsapp: $('#mZap').value, email: $('#mEmail').value, marcas: $('#mMarcas').value.split(','), ...lerEndereco('m') } });
      alert(e ? 'Não foi possível salvar: ' + e.message : 'Dados salvos.');
    };
    if ($('#mSair')) $('#mSair').onclick = async () => { await sb.auth.signOut(); history.replaceState(null, '', location.pathname); telaEntrar(); };
  }

  // ─── uma cotação: preencher e enviar a proposta ───
  async function telaOp(id) {
    const { data: o, error } = await sb.rpc('forn_oportunidade', { p_token: TOKEN, p_op: id });
    if (error || !o) return erro('Cotação não encontrada.');
    OP = o; history.replaceState(null, '', TOKEN ? `?t=${TOKEN}&o=${o.id}` : `?o=${o.id}`);
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

  // ─── entrar com e-mail e senha ───
  function telaEntrar(msg) {
    $('#titulo').textContent = 'Portal do fornecedor'; $('#subtitulo').textContent = ''; el.oninput = el.onchange = null;
    el.innerHTML = `<div class="card">${msg ? `<div class="aviso med" style="margin-bottom:14px">${esc(msg)}</div>` : ''}
      <h2>Entrar</h2><div class="grade">
        <label>E-mail<input id="eEmail" type="email" autocomplete="username"></label>
        <label>Senha<input id="eSenha" type="password" autocomplete="current-password"></label></div>
      <div class="acoes"><button class="btn pri" id="eEntrar">Entrar</button><button class="btn" id="eEsqueci">Esqueci a senha</button></div>
      <p class="mut" style="margin-bottom:0">Ainda não tem acesso? O cadastro é feito pelo convite que a equipe de compras envia.</p></div>`;
    $('#eEntrar').onclick = async () => {
      const b = $('#eEntrar'); b.disabled = true;
      const { error: e } = await sb.auth.signInWithPassword({ email: $('#eEmail').value.trim(), password: $('#eSenha').value });
      b.disabled = false;
      if (e) return alert(/invalid/i.test(e.message) ? 'E-mail ou senha incorretos.' : e.message);
      TOKEN = null; guardar(null); await telaPortal(+q.get('o') || null);
    };
    $('#eEsqueci').onclick = async () => {
      const email = $('#eEmail').value.trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return alert('Digite seu e-mail no campo acima.');
      await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      alert('Se este e-mail tiver acesso, o link para criar a nova senha chega em alguns minutos.');   // mesma resposta sempre: não revela quem é cadastrado
    };
  }
  function telaNovaSenha() {
    $('#titulo').textContent = 'Nova senha'; $('#subtitulo').textContent = '';
    el.innerHTML = `<div class="card"><h2>Crie sua nova senha</h2><div class="grade">
        <label>Nova senha<input id="nSenha" type="password" autocomplete="new-password" maxlength="72"></label>
        <label>Repita a senha<input id="nSenha2" type="password" autocomplete="new-password" maxlength="72"></label></div>
      <div class="acoes"><button class="btn pri" id="nSalvar">Salvar</button></div></div>`;
    $('#nSalvar').onclick = async () => {
      const s = $('#nSenha').value;
      if (s.length < 8 || !/[a-zA-Z]/.test(s) || !/\d/.test(s)) return alert('A senha precisa ter pelo menos 8 caracteres, com letras e números.');
      if (s !== $('#nSenha2').value) return alert('As senhas não são iguais.');
      const { error: e } = await sb.auth.updateUser({ password: s });
      if (e) return alert('Não foi possível trocar a senha: ' + e.message);
      history.replaceState(null, '', location.pathname); await telaPortal();
    };
  }

  (async () => {
    const c = q.get('c');
    if (c) return valido(c) ? telaCadastro(c) : erro('Link de convite inválido.');
    const { data: { session } } = await sb.auth.getSession();
    if (recuperando && session) return telaNovaSenha();
    if (session) { TOKEN = null; guardar(null); }   // logado: as funções reconhecem o fornecedor pelo usuário (token nulo)
    else {
      if (TOKEN && !valido(TOKEN)) TOKEN = null;
      if (!TOKEN) TOKEN = valido(lido()) ? lido() : null;
      if (!TOKEN) return telaEntrar();
    }
    await telaPortal(+q.get('o') || null);
  })().catch(e => erro('Erro ao carregar: ' + e.message));
})();
