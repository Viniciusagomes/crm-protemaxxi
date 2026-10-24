'use strict';
/* Página pública de avaliação: toda nota tem relato privado e acesso opcional ao Google. */
(async () => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const caixa = document.getElementById('caixa'), q = new URLSearchParams(location.search), t = q.get('t') || '';
  if (!/^[a-f0-9]{20,}$/.test(t)) { caixa.innerHTML = '<p>Link inválido.</p>'; return; }
  const sb = window.supabase.createClient(window.CRM_CONFIG.url, window.CRM_CONFIG.anonKey, { auth: { persistSession: false } });
  if (q.get('sair') === '1') {
    await sb.rpc('avaliacao_descadastrar', { p_token: t });
    caixa.innerHTML = '<p><b>Pronto.</b></p><p>Você não vai mais receber nossos e-mails de avaliação.</p>'; return;
  }
  const { data: a } = await sb.rpc('avaliacao_ver', { p_token: t });
  if (!a) { caixa.innerHTML = '<p>Este link de avaliação não é mais válido.</p>'; return; }
  const emp = a.empresa || 'nossa loja', google = /^https:\/\//i.test(a.google || '') ? a.google : '';
  const ROT = ['', 'Muito ruim', 'Ruim', 'Regular', 'Bom', 'Excelente!'];
  let nota = +q.get('n') || a.nota || 0;
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) nota = 0;
  let salvando = false, confirmada = !!a.respondido;
  // async: a chamada do supabase-js só sai quando é aguardada; assim ela sai mesmo quando ninguém espera a resposta
  const responder = async (comentario, foiGoogle) => {
    const r = await sb.rpc('avaliacao_responder', { p_token: t, p_nota: nota, p_comentario: comentario || null, p_google: !!foiGoogle });
    if (r.error || !r.data) throw new Error('Não foi possível salvar sua avaliação. Tente novamente.');
  };

  /** Confirma a nota antes de exibir as mesmas opções de avaliação pública e privada. */
  async function escolher(n) {
    if (salvando) return;
    salvando = true; nota = n; confirmada = false;
    try { await responder(null, false); confirmada = true; tela(); }
    catch (e) { alert(e.message); }
    finally { salvando = false; }
  }

  function conviteGoogle() {
    return google ? `<p><a class="btn" id="btnGoogle" href="${esc(google)}" target="_blank" rel="noopener">Avaliar também no Google</a></p><p class="discreto">Opcional: sua avaliação no Google é pública. O recado abaixo vai somente para a loja.</p>` : '';
  }
  function ligarGoogle() {
    const b = document.getElementById('btnGoogle');
    if (b) b.onclick = () => { responder(null,true).catch(() => {}); };
  }

  function tela() {
    caixa.innerHTML = `<p>Olá${a.cliente ? ', ' + esc(a.cliente) : ''}! Como foi o atendimento na <b>${esc(emp)}</b>?</p>
      <div class="estrelas">${[1, 2, 3, 4, 5].map(n => `<button data-n="${n}" class="${n <= nota ? 'on' : ''}" aria-label="${n} estrela(s)">★</button>`).join('')}</div>
      <div class="rot" id="rot">${ROT[nota] || 'Toque nas estrelas'}</div><div id="resto"></div>`;
    caixa.querySelectorAll('.estrelas button').forEach(b => b.onclick = () => escolher(+b.dataset.n));
    const resto = document.getElementById('resto');
    if (!nota || !confirmada) return;
    resto.innerHTML = nota >= 4
      ? `${conviteGoogle()}<p style="margin-top:14px"><b>Obrigado! 💚</b> Sua avaliação foi registrada.</p><textarea id="txt" placeholder="Quer deixar um recado para a nossa equipe? (opcional)"></textarea><button class="btn pri" id="btnEnviar">Enviar recado</button>`
      : `${conviteGoogle()}<p style="margin-top:14px"><b>Sentimos muito.</b> Conte o que aconteceu para nossa equipe analisar e acompanhar seu atendimento.</p>
        <textarea id="txt" placeholder="O que podemos melhorar?" autofocus></textarea><button class="btn pri" id="btnEnviar">Enviar para a loja</button>`;
    ligarGoogle();
    document.getElementById('txt')?.focus();
    document.getElementById('btnEnviar').onclick = async () => {
      const txt = document.getElementById('txt').value.trim();
      if (!txt) { document.getElementById('txt').focus(); return; }
      const botao = document.getElementById('btnEnviar'); botao.disabled = true;
      try {
        await responder(txt, false);
        resto.innerHTML = '<p style="margin-top:14px"><b>Recebemos sua mensagem. Obrigado!</b> Nossa equipe pode acompanhar seu relato.</p>' + conviteGoogle();
        ligarGoogle();
      } catch (e) { alert(e.message); botao.disabled = false; }
    };
  }
  // Veio do e-mail com a estrela escolhida (?n=): só mostra a nota marcada e pede um toque para confirmar.
  // Não grava sozinho: robôs de segurança de e-mail abrem os links e gerariam notas falsas.
  if (nota && !a.respondido && q.get('n')) {
    caixa.innerHTML = `<p>Olá${a.cliente ? ', ' + esc(a.cliente) : ''}! Você escolheu:</p>
      <div class="estrelas">${[1, 2, 3, 4, 5].map(n => `<button data-n="${n}" class="${n <= nota ? 'on' : ''}" aria-label="${n} estrela(s)">★</button>`).join('')}</div>
      <div class="rot">${ROT[nota]}</div><button class="btn pri" id="btnConfirma">Confirmar minha nota</button>`;
    caixa.querySelectorAll('.estrelas button').forEach(b => b.onclick = () => escolher(+b.dataset.n));
    document.getElementById('btnConfirma').onclick = () => escolher(nota);
  } else tela();
})();
