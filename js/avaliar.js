'use strict';
/* Página pública de avaliação do atendimento (avaliar.html?t=…). Toda nota fica no nosso log.
   4–5 estrelas: registra a nota e abre direto a avaliação do Google. 1–3: pede o relato (vai só para a loja) e também mostra, discreto,
   o link do Google — a regra do Google proíbe esconder o convite de quem deu nota baixa. */
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
  const emp = a.empresa || 'nossa loja', google = a.google || '';
  const ROT = ['', 'Muito ruim', 'Ruim', 'Regular', 'Bom', 'Excelente!'];
  let nota = +q.get('n') || a.nota || 0;
  // async: a chamada do supabase-js só sai quando é aguardada; assim ela sai mesmo quando ninguém espera a resposta
  const responder = async (comentario, foiGoogle) => { await sb.rpc('avaliacao_responder', { p_token: t, p_nota: nota, p_comentario: comentario || null, p_google: !!foiGoogle }); };

  /** Escolha da nota: 4 e 5 registram e vão direto para o Google; 1 a 3 abrem a caixa de texto para a loja. */
  async function escolher(n) {
    nota = n;
    if (nota >= 4 && google) {
      caixa.innerHTML = `<p style="font-size:40px;margin:6px 0">💚</p><p><b>Obrigado!</b> Abrindo o Google para você contar como foi…</p>
        <p class="discreto">Se não abrir sozinho, <a href="${esc(google)}">toque aqui</a>.</p>`;
      await responder(null, true).catch(() => {});
      location.href = google;
      return;
    }
    tela();
    responder(null, false);
  }

  function tela() {
    caixa.innerHTML = `<p>Olá${a.cliente ? ', ' + esc(a.cliente) : ''}! Como foi o atendimento na <b>${esc(emp)}</b>?</p>
      <div class="estrelas">${[1, 2, 3, 4, 5].map(n => `<button data-n="${n}" class="${n <= nota ? 'on' : ''}" aria-label="${n} estrela(s)">★</button>`).join('')}</div>
      <div class="rot" id="rot">${ROT[nota] || 'Toque nas estrelas'}</div><div id="resto"></div>`;
    caixa.querySelectorAll('.estrelas button').forEach(b => b.onclick = () => escolher(+b.dataset.n));
    const resto = document.getElementById('resto');
    if (!nota || (nota >= 4 && google)) return;
    resto.innerHTML = nota >= 4
      ? `<p style="margin-top:14px"><b>Obrigado! 💚</b></p><textarea id="txt" placeholder="Quer deixar um recado para a nossa equipe? (opcional)"></textarea><button class="btn pri" id="btnEnviar">Enviar recado</button>`
      : `<p style="margin-top:14px"><b>Sentimos muito.</b> Conte o que aconteceu: sua mensagem vai direto para a gerência, e vamos entrar em contato.</p>
        <textarea id="txt" placeholder="O que podemos melhorar?" autofocus></textarea><button class="btn pri" id="btnEnviar">Enviar para a loja</button>
        ${google ? `<a class="discreto" id="btnGoogle" href="${esc(google)}" target="_blank" rel="noopener">Prefere avaliar publicamente no Google?</a>` : ''}`;
    document.getElementById('txt')?.focus();
    document.getElementById('btnEnviar').onclick = async () => {
      const txt = document.getElementById('txt').value.trim();
      if (!txt) { document.getElementById('txt').focus(); return; }
      await responder(txt, false);
      resto.innerHTML = '<p style="margin-top:14px"><b>Recebemos sua mensagem. Obrigado!</b> Vamos entrar em contato.</p>';
    };
    document.getElementById('btnGoogle')?.addEventListener('click', () => responder(document.getElementById('txt')?.value.trim(), true));
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
