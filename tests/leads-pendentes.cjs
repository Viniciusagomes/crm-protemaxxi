// Leads do site ficam na campanha até o vendedor tratar (19/11).
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..'), ler = f => fs.readFileSync(path.join(root, f), 'utf8');
const mig = fs.readdirSync(path.join(root, 'supabase/migrations')).find(f => f.endsWith('_prospeccao_leads_pendentes.sql'));
assert.ok(mig, 'migration existe'); const sql = ler('supabase/migrations/' + mig);
assert.match(sql, /x\.lista = 'site' and x\.resultado is null and x\.data < p_data/, 'só lead do site sem resultado');
assert.match(sql, /not exists \(select 1 from public\.prospeccao y where y\.cliente_chave = x\.cliente_chave and y\.data > x\.data\)/, 'reenviado não duplica');
assert.match(sql, /a\.automatica like 'lead_ads:%' and not a\.feito/, 'lead que está na fila não vai para a campanha');
assert.match(sql, /coalesce\(x\.dados->>'desde', x\.data::text\)/, 'guarda o primeiro dia');
assert.match(sql, /command := 'select public\.prospeccao_levar_leads\(\); select public\.prospeccao_gerar\(\);'/, 'roda antes de montar a campanha');
assert.match(sql, /revoke all on function public\.prospeccao_levar_leads\(date\) from public, anon;/);
// etiqueta na tela
const cart = ler('js/carteira.js');
assert.match(cart, /<div class="pro-motivo">\$\{proEsperando\(x\)\}/);
const ctx = vm.createContext({});
vm.runInContext(ler('js/util.js').split('\n// ─── Emoji da interface')[0], ctx);
vm.runInContext(cart.slice(cart.indexOf('function proEsperando'), cart.indexOf('function resumoPro')), ctx);
const r = c => vm.runInContext(c, ctx);
assert.match(r(`proEsperando({ data: '2026-11-20', dados: { desde: '2026-11-16' } })`), /esperando desde 16\/11 · 4 dias/);
assert.match(r(`proEsperando({ data: '2026-11-20', dados: { desde: '2026-11-19' } })`), /class="tag med".*1 dia</);
assert.equal(r(`proEsperando({ data: '2026-11-20', dados: { desde: '2026-11-20' } })`), '', 'entrou hoje: sem etiqueta');
assert.equal(r(`proEsperando({ data: '2026-11-20', resultado: 'respondeu', dados: { desde: '2026-11-16' } })`), '', 'tratado: sem etiqueta');
assert.equal(r(`proEsperando({ data: '2026-11-20', dados: {} })`), '');
console.log('✔ leads-pendentes.cjs');
