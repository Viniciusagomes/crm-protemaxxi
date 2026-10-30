// A aba Tráfego não pode entrar em loop de render enquanto os dados estão carregando (congelava a página).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console, document: { querySelector: () => null, addEventListener: () => {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(`let D={sync:{gads:{conectado:true}}},UI={}; const ehDono=()=>false; let renders=0; const render=()=>{renders++;};`, ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/trafego.js'), 'utf8'), ctx, { filename: 'trafego.js' });
const run = code => vm.runInContext(code, ctx);

run(`var chamadas=0; carregarTrafego=async()=>{chamadas++;};`);
run('TR.carregando=true; vTrafego();');
assert.equal(run('chamadas'), 0, 'já carregando: não dispara outra carga nem outro render');
run('TR.carregando=false; vTrafego();');
assert.equal(run('chamadas'), 1, 'sem carga em andamento: carrega');
console.log('OK: Tráfego não entra em loop enquanto carrega.');
