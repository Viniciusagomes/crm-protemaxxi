// Tráfego: programação de horário pela fila (tipo programacao_horario). Confere a descrição na tela e as travas do servidor.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');

const ctx = vm.createContext({ console, document: { querySelector: () => null, addEventListener: () => {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext("var EU = { id: 'vini', papel: 'dono', permissoes: {} }, UI = {}; var D = { sync: {} }; const ehDono = () => true, nomeP = id => id, render = () => {};", ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/trafego.js'), 'utf8'), ctx, { filename: 'trafego.js' });
vm.runInContext("TR.d = { cn: { 7: '(S) RMC Plus', 8: '<img src=x>' }, negativas: [], palavras: [], recursos: [], anuncios: [], gn: {} };", ctx);
const desc = (a) => { ctx.__a = a; return vm.runInContext('trDescAcao(__a)', ctx); };

const corte = desc({ tipo: 'programacao_horario', alvo: { campanha_ids: [7], inicio_hora: 5, fim_hora: 24 } });
assert.ok(corte.includes('05h às 24h') && corte.includes('de 00h às 05h') && corte.includes('(S) RMC Plus') && corte.includes('1 campanha(s)'), corte);
assert.ok(!corte.includes('à meia-noite'), 'fim 24h não corta a noite');
const noite = desc({ tipo: 'programacao_horario', alvo: { campanha_ids: [7], inicio_hora: 0, fim_hora: 22 } });
assert.ok(noite.includes('de 22h à meia-noite') && !noite.includes('de 00h às'), noite);
const xss = desc({ tipo: 'programacao_horario', alvo: { campanha_ids: [8], inicio_hora: 5 } });
assert.ok(!xss.includes('<img'), 'nome da campanha precisa ser escapado');

const srv = fs.readFileSync(path.join(root, 'supabase/functions/gads-aplicar/index.ts'), 'utf8');
assert.ok(srv.includes('a.tipo === "programacao_horario"'), 'servidor precisa conhecer o tipo');
assert.ok(srv.includes("campaign_criterion.type = 'AD_SCHEDULE'"), 'precisa recusar campanha que já tem programação');
assert.ok(srv.includes('d.tipo === "remover_programacao"'), 'precisa saber desfazer');
const mig = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(f => f.includes('programacao_horario'));
assert.equal(mig.length, 1);
assert.ok(fs.readFileSync(path.join(root, 'supabase/migrations', mig[0]), 'utf8').includes("'programacao_horario'"));
console.log('programacao-horario: ok');
