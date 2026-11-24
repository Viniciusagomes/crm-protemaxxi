// Aba Tutoriais (24/11): quem não é dono vê só os publicados, sem botões; o dono vê rascunhos, enviar e publicar.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console, Date, Intl });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/tutoriais.js'), 'utf8'), ctx);
const run = s => vm.runInContext(s, ctx);
run(`var dono = false, ehDono = () => dono, render = () => {}, avisar = () => {}, UI = { view: 'tutoriais' }, subAbas = () => [];
  var sb = { storage: { from: () => ({ createSignedUrls: async l => ({ data: l.map(a => a === '02.mp4' ? { error: 'not found' } : { signedUrl: 'https://x/' + a }) }) }) } };
  TUT.lista = [{ id: 1, ordem: 1, titulo: 'Tela Início', descricao: 'Primeira tela', arquivo: '01.mp4', duracao_s: 65, publicado: true },
               { id: 2, ordem: 2, titulo: 'Meu dia', arquivo: '02.mp4', duracao_s: 23.6, publicado: false }];`);
assert.equal(run('tutDur(65)'), '1:05'); assert.equal(run('tutDur(23.6)'), '0:24'); assert.equal(run('tutDur(0)'), '');
(async () => {
  await run('tutUrls(TUT.lista)');
  assert.equal(run("TUT.urls['01.mp4']"), 'https://x/01.mp4');
  assert.equal(run("TUT.semArquivo['02.mp4']"), true, 'arquivo que não está no bucket fica marcado');
  const vend = run('vTutoriais()');
  assert.match(vend, /<video controls preload="metadata" playsinline src="https:\/\/x\/01\.mp4#t=0\.6"/, 'link assinado, abrindo no quadro de abertura');
  assert.doesNotMatch(vend, /Meu dia|rascunho|data-c="tutArquivo"|data-a="tutPublicar"/, 'vendedor não vê rascunho nem botões do dono');
  run('dono = true');
  const d = run('vTutoriais()');
  assert.match(d, /2\. Meu dia/); assert.match(d, /rascunho/); assert.match(d, /Vídeo ainda não enviado/);
  assert.match(d, /⬆ Enviar vídeo<input type="file" accept="video\/mp4" hidden data-c="tutArquivo" data-arq="02\.mp4">/);
  assert.match(d, /data-a="tutPublicar" data-id="2">Publicar/); assert.match(d, /data-a="tutPublicar" data-id="1">Ocultar/);
  run('TUT.lista = []; dono = false');
  assert.match(run('vTutoriais()'), /Nenhum tutorial publicado ainda/);
  console.log('✔ tutoriais.cjs');
})().catch(e => { console.error(e); process.exit(1); });
