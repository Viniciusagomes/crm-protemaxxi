'use strict';
/* Intranet Protemaxxi — Tutoriais: vídeos curtos de cada tela (tabela tutoriais + bucket PRIVADO "tutoriais").
   Todos com login assistem aos publicados (link assinado de 1 hora). O dono vê os rascunhos, envia o MP4 e publica/oculta. */

const TUT = { lista: null, carregando: false, urls: {}, semArquivo: {}, pedindo: false, enviando: '' };

async function carregarTutoriais(forcar) {
  if (TUT.carregando || (TUT.lista && !forcar)) return;
  TUT.carregando = true;
  try { TUT.lista = await ok(sb.from('tutoriais').select('*').order('ordem')); }
  finally { TUT.carregando = false; }
}
/** Links assinados (1 h) dos vídeos que ainda não têm link; o arquivo que não existe no bucket fica marcado. */
async function tutUrls(lista) {
  const falta = lista.filter(t => !TUT.urls[t.arquivo] && !TUT.semArquivo[t.arquivo]);
  if (!falta.length || TUT.pedindo) return;
  TUT.pedindo = true;
  try {
    const { data } = await sb.storage.from('tutoriais').createSignedUrls(falta.map(t => t.arquivo), 3600);
    for (const [i, t] of falta.entries()) { const u = data?.[i]?.signedUrl; if (u) TUT.urls[t.arquivo] = u; else TUT.semArquivo[t.arquivo] = true; }
  } finally { TUT.pedindo = false; }
}
/** Duração curta: 1:05. Exportada para o teste. */
const tutDur = s => !s ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function vTutoriais() {
  const cab = topo('Tutoriais', 'Vídeos curtos de cada tela da Intranet, com exemplos fictícios. Assista na ordem ou vá direto à tela que precisa.');
  if (!TUT.lista) { if (!TUT.carregando) carregarTutoriais().then(render).catch(e => avisar(e.message)); return cab + `<div class="card">${esqueleto(4, 3)}</div>`; }
  const dono = ehDono(), l = TUT.lista.filter(t => t.publicado || dono);
  if (l.some(t => !TUT.urls[t.arquivo] && !TUT.semArquivo[t.arquivo])) tutUrls(l).then(render).catch(() => {});
  const card = t => {
    const url = TUT.urls[t.arquivo], sem = TUT.semArquivo[t.arquivo];
    const player = url ? `<video controls preload="metadata" playsinline src="${esc(url)}#t=0.6" style="width:100%;aspect-ratio:16/9;border-radius:10px;background:#0b1220;display:block"></video>`
      : `<div class="vazio" style="aspect-ratio:16/9;display:grid;place-items:center;border-radius:10px;background:var(--card2)">${sem ? (dono ? 'Vídeo ainda não enviado' : 'Vídeo em preparação') : 'Carregando…'}</div>`;
    const acoes = dono ? `<div class="acoes mt" style="gap:6px;flex-wrap:wrap">
        <label class="btn peq ${sem ? 'pri' : ''}" style="cursor:pointer">${TUT.enviando === t.arquivo ? 'Enviando…' : sem ? '⬆ Enviar vídeo' : '⬆ Trocar vídeo'}<input type="file" accept="video/mp4" hidden data-c="tutArquivo" data-arq="${esc(t.arquivo)}"></label>
        <button class="btn peq" data-a="tutPublicar" data-id="${t.id}">${t.publicado ? 'Ocultar' : 'Publicar'}</button>
        <small class="mut">${esc(t.arquivo)}</small></div>` : '';
    return `<div class="card"><div class="secao-titulo"><h2 style="margin:0">${t.ordem}. ${esc(t.titulo)}</h2><span>${t.publicado ? '' : '<span class="tag med">rascunho</span> '}<small class="mut">${tutDur(+t.duracao_s)}</small></span></div>
      ${player}${t.descricao ? `<p class="mut" style="margin:10px 0 0">${esc(t.descricao)}</p>` : ''}${acoes}</div>`;
  };
  return cab + (l.length ? `<div class="grid g2">${l.map(card).join('')}</div>` : '<div class="card vazio">Nenhum tutorial publicado ainda.</div>');
}

/** Dono: envia (ou troca) o MP4 de um tutorial. O nome no bucket é sempre o da tabela. */
async function tutEnviar(arquivo, f) {
  if (!ehDono() || !f) return;
  if (!/\.mp4$/i.test(f.name) && f.type !== 'video/mp4') return avisar('Envie um arquivo MP4.');
  if (f.size > 50 * 1024 * 1024) return avisar('O vídeo passa de 50 MB.');
  TUT.enviando = arquivo; render();
  try {
    const { error } = await sb.storage.from('tutoriais').upload(arquivo, f, { upsert: true, contentType: 'video/mp4', cacheControl: '3600' });
    if (error) throw new Error(error.message);
    delete TUT.urls[arquivo]; delete TUT.semArquivo[arquivo];
    avisar('Vídeo enviado.');
  } finally { TUT.enviando = ''; render(); }
}
/** Dono: publica ou oculta um tutorial. */
async function tutPublicar(id) {
  const t = (TUT.lista || []).find(x => String(x.id) === String(id)); if (!t || !ehDono()) return;
  await ok(sb.from('tutoriais').update({ publicado: !t.publicado }).eq('id', t.id));
  t.publicado = !t.publicado; avisar(t.publicado ? 'Tutorial publicado.' : 'Tutorial oculto.'); render();
}
