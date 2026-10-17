'use strict';
/* Página pública de avaliação do atendimento (avaliar.html?t=…). Toda nota fica no nosso log.
   4–5 estrelas: agradece e convida a avaliar no Google. 1–3: pede o relato (vai só para a loja) e também mostra, discreto,
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

  function tela() {
    caixa.innerHTML = `<p>Olá${a.cliente ? ', ' + esc(a.cliente) : ''}! Como foi o atendimento na <b>${esc(emp)}</b>?</p>
      <div class="estrelas">${[1, 2, 3, 4, 5].map(n => `<button data-n="${n}" class="${n <= nota ? 'on' : ''}" aria-label="${n} estrela(s)">★</button>`).join('')}</div>
      <div class="rot" id="rot">${ROT[nota] || 'Toque nas estrelas'}</div><div id="resto"></div>`;
    caixa.querySelectorAll('.estrelas button').forEach(b => b.onclick = () => { nota = +b.dataset.n; tela(); responder(null, false); });
    const resto = document.getElementById('resto');
    if (!nota) return;
    if (nota >= 4) {
      resto.innerHTML = `<p style="margin-top:14px"><b>Obrigado! 💚</b> Ficamos muito felizes.</p>
        ${google ? `<p>Pode contar isso também no Google? Ajuda muito outras pessoas a nos conhecer.</p><a class="btn pri" id="btnGoogle" href="${esc(google)}" target="_blank" rel="noopener">⭐ Avaliar no Google</a>` : ''}
        <textarea id="txt" placeholder="Quer deixar um recado para a nossa equipe? (opcional)"></textarea><button class="btn ${google ? 'google' : 'pri'}" id="btnEnviar">Enviar recado</button>`;
    } else {
      resto.innerHTML = `<p style="margin-top:14px"><b>Sentimos muito.</b> Conte o que aconteceu: sua mensagem vai direto para a gerência, e vamos entrar em contato.</p>
        <textarea id="txt" placeholder="O que podemos melhorar?"></textarea><button class="btn pri" id="btnEnviar">Enviar para a loja</button>
        ${google ? `<a class="discreto" id="btnGoogle" href="${esc(google)}" target="_blank" rel="noopener">Prefere avaliar publicamente no Google?</a>` : ''}`;
    }
    document.getElementById('btnEnviar').onclick = async () => {
      const txt = document.getElementById('txt').value.trim();
      if (!txt) { document.getElementById('txt').focus(); return; }
      await responder(txt, false);
      resto.innerHTML = `<p style="margin-top:14px"><b>Recebemos sua mensagem. Obrigado!</b></p>${google && nota >= 4 ? `<a class="btn pri" href="${esc(google)}" target="_blank" rel="noopener" id="btnGoogle2">⭐ Avaliar no Google</a>` : ''}`;
      document.getElementById('btnGoogle2')?.addEventListener('click', () => responder(null, true));
    };
    document.getElementById('btnGoogle')?.addEventListener('click', () => responder(document.getElementById('txt')?.value.trim(), true));
  }
  tela();
  if (nota && !a.respondido) responder(null, false);   // veio do e-mail já com a estrela escolhida
})();
