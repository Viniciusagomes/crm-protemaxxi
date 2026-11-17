// Menu simplificado (17/11): abas reunidas em grupos com sub-abas, mesmas permissões de antes.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const ctx = vm.createContext({ console, Date, Intl });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
const pedaco = (ini, fim) => main.slice(main.indexOf(ini), main.indexOf(fim));
vm.runInContext(pedaco('// Abas que moram dentro de outra', 'const VIEWS_FN') + "\nconst SO_DONO = ['config', 'geral', 'logs', 'cadastroprod'];", ctx);
const run = s => vm.runInContext(s, ctx);
// vendedor comum: sem dono, sem equipe, sem estoque
run(`var UI = { view: 'checklist' }, EU = { id: 'ana', tiny: 5, permissoes: {} }, D = { ml: null }, CRM = {}, SIT = {}, BOL = {}, AVA = {}, CRE = {}, EXP = null, COMP = {}, WA = {}, EM = {}, AT = {};
  var vis = new Set(['inicio', 'meudia', 'checklist', 'pedidos', 'vendas', 'clientes', 'crm', 'situacao', 'boletos', 'solicitacoes', 'feedbacks', 'ajuda']);
  var podeAba = k => vis.has(k), ehDono = () => false, veMonitoria = () => false, veTudoVendas = () => false, veML = () => false, veTrafego = () => false, veCompras = () => false,
    veAtendimento = () => false, veEmails = () => false, calPessoas = () => [], temEquipe = () => false, veExp = () => false, minhasPendentes = () => [], trPendentes = () => 0, cpPendentes = () => 0;`);
const html = run('menu()');
const itens = [...html.replace(/<div class="menu-sub">.*?<\/div>/gs, '').matchAll(/data-v="([^"]+)"/g)].map(m => m[1]);
assert.deepEqual(itens, ['inicio', 'meudia', 'crm', 'clientes', 'vendas', 'boletos', 'solicitacoes', 'feedbacks'], 'vendedor vê o mesmo de antes, agrupado (Como usar foi para o rodapé)');
assert.doesNotMatch(html.replace(/<div class="menu-sub">.*?<\/div>/gs, ''), /data-v="checklist"|data-v="pedidos"/, 'checklist e pedidos ficam dentro de Meu dia e Vendas');
assert.match(html, /class="on" data-a="nav" data-v="meudia"/, 'estando no checklist, o Meu dia fica marcado');
assert.match(html, /<span class="rot">Feedbacks<\/span>/, 'grupo com uma sub-aba só mostra o nome dela');
assert.doesNotMatch(html, /data-c="Marketing"|data-c="Operação"|data-c="Sistema"/, 'categoria sem aba visível some');
assert.match(run("UI.view = 'pedidos'; menu()"), /class="menu-cat aberta"><button class="grupo" data-a="menuCat" data-c="Vendas" aria-expanded="true" disabled/, 'categoria da aba atual fica aberta');
assert.match(html, /class="menu-cat "><button class="grupo" data-a="menuCat" data-c="Vendas" aria-expanded="false"/, 'as outras começam fechadas');
run("UI.view = 'checklist'");
assert.match(html, /<div class="menu-sub">.*data-v="checklist"/s, 'sub-itens aparecem embaixo da aba aberta');
assert.deepEqual(run("subAbas('checklist').map(x => x[0])"), ['meudia', 'checklist']);
assert.deepEqual(run("subAbas('feedbacks')"), [], 'sem barra quando só há uma');
// dono vê tudo, com Logs dentro de Configurações e Visão da equipe dentro de Equipe
run("ehDono = () => true; podeAba = () => true; temEquipe = () => true; veExp = () => true; veML = () => true; veCompras = () => true");
const dono = run('menu()');
assert.doesNotMatch(dono, /data-v="logs"|data-v="geral"|data-v="brindes"/);
assert.deepEqual(run("subAbas('logs').map(x => x[0])"), ['config', 'logs']);
assert.deepEqual(run("subAbas('geral').map(x => x[0])"), ['supervisao', 'geral', 'metas', 'feedbacks']);
const total = (dono.match(/data-a="nav"/g) || []).length;
assert.ok(total <= 40, `menu do dono com ${total} itens (antes eram 34)`); console.log('itens do dono:', total);
// sub-abas aparecem no topo das telas
assert.match(run("UI.view = 'brindes'; topo('Brindes', '')"), /class="subabas".*data-v="creditos".*class="on" data-a="nav" data-v="brindes"/s);
// Operação do Fefão: Estoque (visão geral, estoque, TV) e Compras e produtos (compras, cadastro)
assert.doesNotMatch(dono.replace(/<div class="menu-sub">.*?<\/div>/gs, ''), /data-v="estoque"|data-v="abrirTV"|data-v="cadastroprod"|data-v="situacao"/);
assert.deepEqual(run("subAbas('estoque').map(x => x[0])"), ['visaoestoque', 'estoque', 'abrirTV']);
assert.deepEqual(run("subAbas('situacao').map(x => x[0])"), ['vendas', 'pedidos', 'situacao']);
console.log('✔ menu.cjs');
