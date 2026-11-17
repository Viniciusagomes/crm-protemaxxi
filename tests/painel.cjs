// Painéis do Início e do Meu dia (17/11): números do mês, comparação, frase do ritmo, atenção e anel.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console, Date, Intl, document: { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], body: null } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/painel.js'), 'utf8'), ctx);
const run = s => vm.runInContext(s, ctx);
// base mínima: 2 meses de pedidos de exemplo (fictícios)
run(`var D = { config: { feriados: [] }, pedidos: [
  { data: '2026-11-03', valor: 1000, situacao: 'Faturado', vendedor_id: 1 }, { data: '2026-11-10', valor: 500, situacao: 'Faturado', vendedor_id: 2 },
  { data: '2026-11-10', valor: 999, situacao: 'Cancelado', vendedor_id: 1 }, { data: '2026-11-17', valor: 300, situacao: 'Em aberto', vendedor_id: 1 },
  { data: '2026-10-05', valor: 2000, situacao: 'Faturado', vendedor_id: 1 }, { data: '2026-10-25', valor: 4000, situacao: 'Faturado', vendedor_id: 1 } ] };
  var valido = p => p.situacao !== 'Cancelado';
  function diasUteisEntre(ini, fim) { let n = 0; for (let d = ini; d <= fim; d = addDias(d, 1)) if (dow(d) !== 0) n++; return n; }`);
const r = run("painResumo(() => true, '2026-11-17')");
assert.equal(r.mes, 1800, 'soma o mês até hoje, sem cancelado');
assert.equal(r.antMesmo, 2000, 'mês passado só até o mesmo dia');
assert.equal(r.ant, 6000); assert.equal(r.pedidos, 3); assert.equal(r.hoje, 300); assert.equal(r.pedHoje, 1);
assert.equal(r.acum.length, 17); assert.equal(r.acum[16], 1800); assert.equal(r.ult30.length, 30); assert.equal(r.ult30[29], 300);
assert.equal(run("painResumo(p => p.vendedor_id === 2, '2026-11-17').mes"), 500, 'filtro por vendedor');
// variação
assert.match(run('painDelta(1100, 1000)'), /sobe.*10%/); assert.match(run('painDelta(900, 1000)'), /desce.*10%/); assert.match(run('painDelta(5, 0)'), /sem base/);
// frase: abaixo do mês passado e quanto falta por dia útil
const f = run("painFrase(painResumo(() => true, '2026-11-17'), 10000)");
assert.match(f, /10% abaixo/); assert.match(f, /faltam/); assert.match(f, /por dia útil/);
assert.match(run("painFrase(painResumo(() => true, '2026-11-17'), 1000)"), /Meta batida/);
assert.doesNotMatch(run("painFrase(painResumo(() => true, '2026-11-17'), 0)"), /meta/i, 'sem meta não fala de meta');
// gráficos não quebram com mês vazio
run("D.pedidos = []");
assert.match(run("painRitmo(painResumo(() => true, '2026-11-17'), 0)"), /<svg/);
assert.match(run('painAnel(0.5, 100, "3/6")'), /3\/6/); assert.match(run('painAnel(2, 100)'), /cheio/, 'passou de 100% fica cheio');
assert.match(run("painK(1234567)"), /1,2 mi/); assert.equal(run("painK(12400)"), '12 mil');
// HTML: nenhum emoji nos painéis
const src = fs.readFileSync(path.join(root, 'js/painel.js'), 'utf8');
assert.ok(!/\p{Extended_Pictographic}/u.test(src), 'painel sem emoji');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(idx.indexOf('js/painel.js') > 0 && idx.indexOf('js/painel.js') < idx.indexOf('js/main.js'), 'painel.js carregado antes do main.js');
assert.ok(!/function vInicio\(/.test(fs.readFileSync(path.join(root, 'js/main.js'), 'utf8')), 'vInicio só no painel.js');
console.log('✔ painel.cjs');
