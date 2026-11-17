// Páginas de vendas (17/11): funil desenhado, idade do negócio, atraso por faixa e resumo de pedidos por situação.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), ler = f => fs.readFileSync(path.join(root, f), 'utf8');
const crm = ler('js/crm.js'), bol = ler('js/boletos.js'), ven = ler('js/vendas.js'), cli = ler('js/clientes.js'), at = ler('js/assistencia.js'), main = ler('js/main.js');
assert.match(crm, /funilDesenho\(neg\) \+ abaIndicadoresCRM/, 'funil desenhado nos indicadores');
assert.match(crm, /id="crmBusca"/); assert.match(crm, /c\.hidden = !!q && !semAcento/, 'busca só esconde cards, sem redesenhar');
assert.match(crm, /kcard-idade/); assert.match(bol, /\$\{faixasAtraso\(ab\)\}/);
assert.match(ven, /data-a="pedSitRapido"/); assert.match(main, /pedSitRapido: el =>/);
for (const [n, s] of [['crm', crm], ['clientes', cli], ['assistência', at]]) assert.match(s, /<div class="subabas">/, `sub-abas no padrão novo: ${n}`);
// faixas de atraso: soma certa por faixa
const vm = require('vm'), ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8').split('\n// ─── Emoji da interface')[0], ctx);
vm.runInContext(`var diasAtraso = b => b.d;` + bol.slice(bol.indexOf('function faixasAtraso'), bol.indexOf('function vBoletos')), ctx);
const html = vm.runInContext(`faixasAtraso([{ d: 5, valor: 100 }, { d: 45, valor: 200 }, { d: 200, valor: 50 }, { d: 30, valor: 10 }])`, ctx);
assert.match(html, /até 30 dias<\/span><b>R\$\s?110<\/b><small>2 boleto/); assert.match(html, /mais de 90<\/span><b>R\$\s?50<\/b>/);
assert.equal(vm.runInContext('faixasAtraso([])', ctx), '');
const so = ler('js/solicitacoes.js'), av = ler('js/avaliacoes.js');
assert.match(so, /class="card sol-resumo"/); assert.match(so, /<div class="subabas">\$\{caixas/); assert.match(av, /\$\{distNotas\(notas\)\}/);
console.log('✔ paginas-vendas.cjs');
