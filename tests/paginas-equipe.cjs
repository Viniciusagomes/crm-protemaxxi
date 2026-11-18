// Páginas da equipe (18/11): Visão da equipe, Supervisão, Metas, Remuneração, Feedbacks e Configurações.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..'), ler = f => fs.readFileSync(path.join(root, f), 'utf8');
const eq = ler('js/equipe.js'), pain = ler('js/painel.js'), main = ler('js/main.js');
const trecho = (s, ini, fim) => { const a = s.indexOf(ini), b = s.indexOf(fim, a + 1); assert.ok(a >= 0 && b > a, 'trecho ' + ini); return s.slice(a, b); };

// telas montadas com as peças novas
assert.match(eq, /painEquipe\(placar\)/, 'placar em barras na Visão da equipe');
assert.match(eq, /painChkSemanaHtml\(painChkSemana\(ativos\(\), h\)\)/, 'checklist da semana');
assert.match(eq, /al\.map\(painDeAlerta\)/, 'avisos no formato da lista de atenção');
assert.match(eq, /<details class="card mt dobra"><summary><b>Organograma/, 'organograma recolhido');
assert.match(eq, /\+ resumo \+ `<div class="card"><div class="cab-pessoa">/, 'resumo no topo da Supervisão');
assert.match(eq, /<summary><b>O que cobrar de cada um/, 'referência da Supervisão recolhida');
assert.match(eq, /navMes\(\)\) \+ resumo \+ cards/, 'resumo nas Metas');
assert.match(eq, /<th style="width:110px">Composição<\/th>/, 'composição na Remuneração');
assert.match(eq, /<details class="nota-legal mt dobra">/, 'nota legal recolhida');
assert.match(eq, /<div class="subabas">\$\{tabs\.map/, 'Configurações com sub-abas no padrão novo');
assert.match(main, /fbTipoFiltro: el =>/); assert.match(main, /fbNovo11: el =>/);
assert.match(main, /details\.dobra:not\(\[open\]\)/, 'imprimir abre o que está recolhido');

// lógica: contexto mínimo
const ctx = vm.createContext({});
vm.runInContext(ler('js/util.js').split('\n// ─── Emoji da interface')[0], ctx);
vm.runInContext(`
  var D = { feedbacks: [] };
  var pessoasT = { a: ['2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18'] };
  var tarefas = (p, f) => p.td || [];
  var trabalha = (p, d) => (p.dias || []).includes(d);
  var pctDia = (p, d) => p.pc[d] ?? null;
  var kpiProj = (p, k, m) => k.proj, kpiReal = (p, k, m) => k.real, ehTiny = k => !!k.tiny;
  var ating = (k, v) => k.meta ? (k.dir === 'menor' ? k.meta / Math.max(v, 1e-9) : v / k.meta) : null;
` + trecho(pain, 'function painChkSemana', 'function painChkSemanaHtml')
  + trecho(pain, 'function painDist', '/** Checklist médio')
  + trecho(eq, 'function metasSituacao', 'function detalheLancamentos')
  + trecho(eq, 'function fbUltimo11', 'function vFeedbacks'), ctx);

// checklist da semana: média só de quem trabalhou no dia; dia sem ninguém = null
const sem = vm.runInContext(`painChkSemana([
  { td: [1], dias: ['2026-11-17', '2026-11-18'], pc: { '2026-11-17': 1, '2026-11-18': 0.5 } },
  { td: [1], dias: ['2026-11-17'], pc: { '2026-11-17': 0.5 } },
  { td: [], dias: ['2026-11-17'], pc: { '2026-11-17': 0 } }], '2026-11-18')`, ctx);
assert.equal(sem.length, 7); assert.equal(sem[6].d, '2026-11-18'); assert.ok(sem[6].hoje);
assert.equal(sem[6].pc, 0.5); assert.equal(sem[6].n, 1);
assert.equal(sem[5].pc, 0.75, 'média de quem trabalhou (sem quem não tem tarefa diária)'); assert.equal(sem[5].n, 2);
assert.equal(sem[0].pc, null);

// metas: no ritmo / em risco / abaixo; meta zero e média ficam de fora
const st = vm.runInContext(`metasSituacao([{ kpis: [
  { meta: 100, entrada: 'D', proj: 120 }, { meta: 100, entrada: 'D', proj: 80 }, { meta: 100, entrada: 'D', proj: 50 },
  { meta: 0, entrada: 'D', proj: 50 }, { meta: 10, entrada: 'D', agreg: 'media', proj: 1 },
  { meta: 100, entrada: 'M', real: 100, proj: 0 }, { meta: 10, entrada: 'D', dir: 'menor', proj: 20 }] }], '2026-11')`, ctx);
assert.equal(st.itens.length, 5); assert.equal(st.ok.length, 2, 'mensal usa o realizado'); assert.equal(st.risco.length, 1); assert.equal(st.abaixo.length, 2, 'menor é melhor: o dobro do limite fica abaixo');

// último 1:1 de cada pessoa
vm.runInContext(`D.feedbacks = [{ pessoa: 'a', tipo: 'um_a_um', data: '2026-10-01' }, { pessoa: 'a', tipo: 'um_a_um', data: '2026-11-10' }, { pessoa: 'a', tipo: 'elogio', data: '2026-11-17' }, { pessoa: 'b', tipo: 'elogio', data: '2026-11-17' }]`, ctx);
const u = vm.runInContext(`fbUltimo11([{ id: 'a' }, { id: 'b' }])`, ctx);
assert.equal(u[0].d, '2026-11-10'); assert.equal(u[1].d, null);

// distribuição: largura relativa ao maior, zero sem barra
const html = vm.runInContext(`painDist([{ rot: 'A', v: 4 }, { rot: 'B', v: 2, cls: 'ok' }, { rot: 'C', v: 0 }])`, ctx);
assert.match(html, /style="width:100%"/); assert.match(html, /class="ok" style="width:50%"/); assert.match(html, /style="width:0%"/);
assert.match(vm.runInContext(`painDist([])`, ctx), /Sem dados/);
console.log('✔ paginas-equipe.cjs');
