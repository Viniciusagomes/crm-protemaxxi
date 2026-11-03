// Tráfego: a aba Propostas relê a fila (gads_acoes) ao abrir, sem F5, e sem repetir a leitura a cada render.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');

const FixedDate = class extends Date {
  constructor(...args) { super(...(args.length ? args : [state.agora])); }
  static now() { return state.agora; }
};
const state = { agora: Date.parse('2026-10-30T15:00:00Z'), leituras: 0, falhar: false, linhas: [] };
const ctx = vm.createContext({ console: { ...console, warn: () => {} }, Date: FixedDate, document: { querySelector: () => null, addEventListener: () => {} }, state });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(`
var EU = { id: 'vini', papel: 'dono', permissoes: {} }, UI = {}, renders = 0;
var D = { sync: { gads: { conectado: true, conta: 'Protemaxxi', ultima_sync: new Date().toISOString() }, gads_varredura: {} } };
const ehDono = () => true, nomeP = id => id, tempoDesde = () => '1 min', render = () => { renders++; };
const ok = async q => { const r = await q; if (r.error) throw new Error(r.error); return r.data; };
const sb = { from: () => ({ select() { return this; }, order() { return this; }, limit() { state.leituras++; return state.falhar ? Promise.resolve({ error: 'sem rede' }) : Promise.resolve({ data: state.linhas }); } }) };
`, ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/trafego.js'), 'utf8'), ctx, { filename: 'trafego.js' });
const run = code => vm.runInContext(code, ctx);
const esperar = () => new Promise(r => setImmediate(r));

const acao = (id, status) => ({ id, criada_em: '2026-10-30T16:59:00Z', tipo: 'remover_negativa', alvo: { recursos: [] }, motivo: 'm', proposto_por: 'brain', status });
run(`TR.d = { campanhas: [], dia: [], termos: [], palavras: [], negativas: [], conv: [], hora: [], acoes: [], leads: [], grupos: [], anuncios: [], recursos: [], locais: [], recom: [], mudancas: [], gn: {}, cn: {} }; TR.aba = 'propostas'; TR.acoesEm = state.agora;`);

(async () => {
  // Lista recém-carregada (menos de 20 s): vTrafego não lê de novo.
  run('vTrafego()');
  assert.equal(state.leituras, 0);

  // Passados 20 s: a primeira renderização dispara UMA leitura e, ao chegar, atualiza a lista e a tela.
  state.agora += 21_000; state.linhas = [acao(31, 'proposta')];
  run('vTrafego()'); run('vTrafego()');
  assert.equal(state.leituras, 1, 'leitura em andamento não pode ser repetida');
  await esperar();
  assert.equal(run('TR.d.acoes.length'), 1);
  assert.equal(run('trPendentes()'), 1);
  assert.equal(run('renders'), 1);
  assert.ok(run('vTrafego()').includes('Aguardando aprovação'));
  assert.equal(state.leituras, 1, 'o render seguinte não relê');

  // Outras abas não leem a fila.
  state.agora += 60_000; run(`TR.aba = 'visao'`);
  try { run('vTrafego()'); } catch { /* a visão geral usa dados que este teste não monta */ }
  assert.equal(state.leituras, 1);

  // Falha de leitura: mantém a lista que estava na tela e não quebra.
  run(`TR.aba = 'propostas'`); state.falhar = true;
  run('vTrafego()'); await esperar();
  assert.equal(run('TR.d.acoes.length'), 1);
  assert.equal(run('TR.recarregandoAcoes'), false);
  console.log('trafego-propostas: ok');
})().catch(e => { console.error(e); process.exit(1); });
