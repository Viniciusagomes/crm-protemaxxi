// Checklist: aparece no "Meu dia" de cada um, o dono edita as tarefas na própria tela e dá para colar várias de uma vez.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console, URL, location: { href: 'https://exemplo.test/index.html' }, document: { querySelector: () => null, addEventListener: () => {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(`var UI = {}, EU = null;
  var D = { config: { inicioUso: '2026-01-01', feriados: [] }, reg: {}, sem: {}, mes: {}, pessoas: [] };
  const ehDono = () => !!EU && EU.papel === 'dono';`, ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/equipe.js'), 'utf8'), ctx, { filename: 'equipe.js' });
const run = code => vm.runInContext(code, ctx);

// pessoa fictícia que trabalha todos os dias
run(`D.pessoas = [{ id: 'est1', nome: 'Estagiária Teste', cargo: 'Estagiária', papel: 'estagiario', dias: [0, 1, 2, 3, 4, 5, 6], ativo: true, inicio: '2026-01-01', kpis: [], regras: [],
  tarefas: [{ id: 'a1', titulo: 'Abrir o painel', freq: 'D', bloco: 'abertura' }, { id: 'f1', titulo: 'Fechar o caixa', freq: 'D', bloco: 'fechamento' },
    { id: 's1', titulo: 'Relatório da semana', freq: 'S', diaSemana: 5 }] }];
  EU = D.pessoas[0];`);

const card = run(`cardChecklistHoje(EU)`);
assert.ok(card.includes('Checklist de hoje') && card.includes('Abrir o painel') && card.includes('Fechar o caixa'), 'Meu dia: mostra as diárias');
assert.ok(card.includes('Relatório da semana'), 'Meu dia: semanal pendente aparece');
assert.ok(card.includes('data-c="chk"'), 'Meu dia: dá para marcar ali mesmo');
assert.equal(run(`cardChecklistHoje({ ...EU, tarefas: [] })`), '', 'sem tarefas: não mostra nada');

// lote: uma por linha, tira marcador de lista, mas não o número que faz parte do texto
const lote = JSON.parse(run(`JSON.stringify(tarefasDoLote('- Responder o ML\\n2. Conferir pedidos\\n\\n10 ligações para clientes', 'D:fechamento'))`));
assert.deepEqual(lote.map(t => t.titulo), ['Responder o ML', 'Conferir pedidos', '10 ligações para clientes'], 'lote: títulos limpos');
assert.ok(lote.every(t => t.freq === 'D' && t.bloco === 'fechamento' && /^t/.test(t.id)), 'lote: diária no bloco escolhido');
const sem = JSON.parse(run(`JSON.stringify(tarefasDoLote('Planilha', 'S:5'))`))[0];
assert.ok(sem.freq === 'S' && sem.diaSemana === 5, 'lote: semanal até sexta');

// editor: o mesmo nas Configurações e no modo Editar do checklist
const ed = run(`editorTarefas(0)`);
assert.ok(ed.includes('data-path="pessoas.0.tarefas.0.titulo"') && ed.includes('data-a="addTarefasLote"'), 'editor: campos e lote');

// modo Editar só para o dono; a estagiária não confere o próprio dia
run(`UI.pessoa = 'est1'; UI.data = hoje(); UI.chkEditar = true;
`);
const telaEst = run(`vChecklist()`);
assert.ok(!telaEst.includes('chkEditar') && telaEst.includes('Abrir o painel'), 'estagiária: sem Editar, vê as tarefas');
run(`D.pessoas.push({ id: 'dono1', nome: 'Dono', cargo: 'Dono', papel: 'dono', dias: [1], ativo: true, kpis: [], regras: [], tarefas: [] }); D.pessoas[0].supervisor = 'dono1'; EU = D.pessoas[1];`);
const telaDono = run(`vChecklist()`);
assert.ok(telaDono.includes('data-a="chkEditar"') && telaDono.includes('data-a="addTarefasLote"'), 'dono: modo Editar mostra o editor');
run(`EU = D.pessoas[0]; UI.chkEditar = false;`);
assert.ok(/data-c="conferido"[^>]*disabled/.test(run(`vChecklist()`)), 'a própria pessoa não marca o "conferido"');

const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
assert.ok(main.includes("if (EU.tarefas?.length) add('checklist')"), 'quem tem tarefas vê a aba do próprio checklist');
console.log('OK: checklist no Meu dia, edição na tela e tarefas em lote.');
