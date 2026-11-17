// Visual das abas Início, Meu dia, Funil e Pedidos: esqueleto de carregamento, pílulas de situação, vazios sem emoji, ícones.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..'), ler = f => fs.readFileSync(path.join(root, f), 'utf8');
const ctx = vm.createContext({ console, document: { querySelector: () => null } });
vm.runInContext(ler('js/util.js'), ctx);
const esq = vm.runInContext('esqueleto(3, 2)', ctx);
assert.equal((esq.match(/esq-kpi"/g) || []).length, 2); assert.equal((esq.match(/esq-l/g) || []).length, 3); assert.match(esq, /aria-label="Carregando"/);
assert.match(vm.runInContext("icone('inicio')", ctx), /^<svg class="ico"/); assert.equal(vm.runInContext("icone('nao-existe')", ctx), '');
const v = ler('js/vendas.js'), ini = v.indexOf('const pedSitCls'), fim = v.indexOf('\n', ini);
vm.runInContext(v.slice(ini, fim).replace('const pedSitCls', 'this.pedSitCls'), ctx);
assert.deepEqual(['Cancelado', 'Entregue', 'Faturado', 'Em aberto', 'Aprovado', 'Outra'].map(s => ctx.pedSitCls(s)), ['ruim', 'ok', 'ok', 'med', 'med', '']);
for (const f of ['js/crm.js', 'js/main.js', 'js/vendas.js']) assert.doesNotMatch(ler(f), /class="(card )?vazio">[^<]*(👏|🎉)/, `${f}: estado vazio sem emoji`);
assert.doesNotMatch(ler('js/crm.js'), /card vazio">Carregando/, 'Funil e Meu dia com esqueleto');
// Pedidos: faixa de números e detalhe redesenhado
assert.match(ler('js/vendas.js'), /function pedResumo\(lista\)/); assert.match(ler('js/vendas.js'), /class="ped-totais"/);
// Clientes: iniciais e cabeçalho de perfil
assert.match(ler('js/clientes.js'), /const cliAvatar = /); assert.match(ler('js/clientes.js'), /class="cli-perfil"/); assert.doesNotMatch(ler('js/clientes.js'), /'👤 Carteira'/);
console.log('ok visual das abas');
