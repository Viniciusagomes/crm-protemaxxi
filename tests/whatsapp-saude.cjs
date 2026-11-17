// WhatsApp: mensagens em páginas de 50, erro em português + "Tentar de novo", painel de saúde, menu só quando muda.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/atendimento.js'), 'utf8');
const ctx = vm.createContext({ console, Date, document: { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], hasFocus: () => true } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(src, ctx);
vm.runInContext("var EU = { id: 'pedro', permissoes: { atendimento: true } }; var ehDono = () => true; var nomeP = id => ({ pedro: 'Pedro Silva' })[id] || '—'; var UI = { view: 'atendimento' };", ctx);
const run = s => vm.runInContext(s, ctx);

// erros comuns da Meta em português; desconhecido mostra o original
assert.match(run("waErroPt('131047 Re-engagement message')"), /24 h/);
assert.match(run("waErroPt('131026 Message undeliverable')"), /não tem WhatsApp/);
assert.match(run("waErroPt('190 Authentication Error')"), /token/);
assert.equal(run("waErroPt('999999 Coisa nova')"), '999999 Coisa nova');
assert.equal(run('waErroPt(null)'), 'motivo não informado');

// bolha que falhou: motivo traduzido + botão (só em saída com conteúdo)
let h = run("waMsgHtml({ id: 7, direcao: 'saida', texto: 'oi', status: 'falhou', erro: '131026 x', em: '2026-11-17T12:00:00Z', por: 'pedro' }, [])");
assert.match(h, /não tem WhatsApp/); assert.match(h, /data-wa="reenviar" data-id="7"/);
assert.doesNotMatch(run("waMsgHtml({ id: 8, direcao: 'saida', texto: 'oi', status: 'lida', em: '2026-11-17T12:00:00Z', por: 'pedro' }, [])"), /reenviar/);

// paginação: pede as 50 mais novas e mostra na ordem certa; marca que há mais
ctx.ok = async x => x;
const linhas = Array.from({ length: 50 }, (_, i) => ({ id: 100 - i, em: new Date(Date.UTC(2026, 10, 17, 12, 0, 0) - i * 6e4).toISOString() }));
const pedidos = [];
ctx.sb = { from: () => { const q = { select: () => q, eq: () => q, lt: (c, v) => { pedidos.push(['lt', v]); return q; }, order: (c, o) => { pedidos.push(['order', c, o?.ascending]); return q; }, limit: n => { pedidos.push(['limit', n]); return Promise.resolve(linhas.map(m => ({ ...m }))); } }; return q; } };
run('sb = this.sb; ok = this.ok');
(async () => {
  const l = await run('waMensagens(5, true)');
  assert.equal(l[0].id, 51); assert.equal(l[49].id, 100, 'antigas em cima, novas embaixo');
  assert.deepEqual(pedidos.slice(0, 3), [['order', 'em', false], ['order', 'id', false], ['limit', 50]]);
  assert.equal(run('WA.temMais[5]'), true);
  // anteriores: busca antes da primeira, sem duplicar
  linhas.length = 3; linhas.forEach((m, i) => { m.id = 10 - i; m.em = new Date(Date.UTC(2026, 10, 16, 9, 0, 0) - i * 6e4).toISOString(); });
  await run('waMaisAntigas(5)');
  assert.equal(run('WA.msgs[5].length'), 53); assert.equal(run('WA.msgs[5][0].id'), 8); assert.equal(run('WA.temMais[5]'), false);
  assert.ok(pedidos.some(p => p[0] === 'lt'), 'usa a data da mais antiga carregada');

  // painel de saúde
  const agora = Date.parse('2026-11-17T15:00:00Z'); ctx.A = agora;
  let s = run("waSaudeLinhas(new Date(A - 3600e3).toISOString(), new Date(A).toISOString(), 0, 0, A)");
  assert.deepEqual(s.map(x => x.ok), [true, true, true, true]);
  s = run("waSaudeLinhas(new Date(A - 20 * 3600e3).toISOString(), null, 2, 3, A)");
  assert.deepEqual(s.map(x => x.ok), [false, false, false, false]);
  assert.match(s[0].txt, /mais de 12 h/); assert.match(s[2].txt, /2 mensagem/); assert.match(s[3].txt, /token/);

  // menu do lado só é redesenhado quando muda
  let escritas = 0; const nav = { _h: '', get innerHTML() { return this._h; }, set innerHTML(v) { escritas++; this._h = v; } };
  ctx.document.querySelector = sel => sel === '#nav' ? nav : null; ctx.menu = () => '<b>menu</b>'; run('menu = this.menu; UI.view = "outra"');
  run('waAtualizar(); waAtualizar(); waAtualizar()');
  assert.equal(escritas, 1);
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /atendimento\.js\?v=20261117[c-z]/, 'cache novo');
  console.log('ok whatsapp saúde/paginação');
})().catch(e => { console.error(e); process.exit(1); });
