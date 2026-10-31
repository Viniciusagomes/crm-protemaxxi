// Portal do fornecedor: convite com CNPJ válido e, para quem tem login, link sem o token.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console, URL, location: { href: 'https://exemplo.test/index.html' }, document: { querySelector: () => null, addEventListener: () => {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(`let D={},UI={},EU={id:'x'}; const render=()=>{};`, ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/compras.js'), 'utf8'), ctx, { filename: 'compras.js' });
const run = code => vm.runInContext(code, ctx);

// CNPJs de exemplo, inventados só para o cálculo dos dígitos
assert.equal(run(`cnpjValido('11222333000181')`), true, 'CNPJ correto');
assert.equal(run(`cnpjValido('11222333000182')`), false, 'dígito errado');
assert.equal(run(`cnpjValido('11111111111111')`), false, 'todos iguais');
assert.equal(run(`cnpjValido('1122233300018')`), false, 'tamanho errado');

const comLogin = run(`botoesLinkForn({ token: 'a'.repeat(48), user_id: 'u1', whatsapp: '' }, { id: 7, titulo: 'Teste', prazo_resposta: '' })`);
assert.ok(comLogin.includes('fornecedor.html?o=7'), 'com login: link leva à cotação');
assert.ok(!comLogin.includes('aaaa'), 'com login: o token não sai no link');
const semLogin = run(`botoesLinkForn({ token: 'b'.repeat(48), user_id: null, whatsapp: '' }, { id: 7, titulo: 'Teste', prazo_resposta: '' })`);
assert.ok(semLogin.includes('t=bbbb'), 'sem login: continua com o link exclusivo');

const portal = fs.readFileSync(path.join(root, 'js/fornecedor.js'), 'utf8');
assert.ok(!/id="cCnpj"/.test(portal), 'o fornecedor não digita o CNPJ: ele vem do convite');
assert.ok(!portal.includes("rpc('forn_cadastrar'"), 'cadastro passa só pela Edge Function');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/portal_fornecedor_cadastro.sql'), 'utf8');
assert.ok(sql.includes('revoke execute on function public.forn_cadastrar(text, jsonb, uuid) from anon, authenticated, public'), 'cadastrar fora do alcance do navegador');
console.log('OK: convite com CNPJ e link de quem tem login.');
