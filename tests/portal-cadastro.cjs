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
assert.ok(!portal.includes('resetPasswordForEmail'), 'nova senha não depende do e-mail do Supabase Auth');
assert.ok(portal.includes("invoke('forn-senha'") && portal.includes("verifyOtp({ token_hash: REC, type: 'recovery' })"), 'nova senha: pedido pela função e link trocado por sessão');
const senha = fs.readFileSync(path.join(root, 'supabase/functions/forn-senha/index.ts'), 'utf8');
assert.ok(senha.includes('#rec=') && senha.includes('return json({ ok: true })'), 'link no fragmento e resposta sempre igual');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261103112348_portal_fornecedor_cadastro.sql'), 'utf8');
assert.ok(sql.includes('revoke execute on function public.forn_cadastrar(text, jsonb, uuid) from anon, authenticated, public'), 'cadastrar fora do alcance do navegador');

// excluir cadastro: botão só para quem não enviou proposta; a regra vale no banco
run(`var htmlModal = ''; modal = h => { htmlModal = h; }; COMP.forn = [{ id: 1, nome: 'Teste', status: 'ativo', marcas: [] }, { id: 2, nome: 'Com proposta', status: 'ativo', marcas: [] }];
  COMP.props = [{ fornecedor_id: 2, status: 'enviada', oportunidade_id: 9 }]; COMP.conv = []; COMP.ops = [];`);
run('formFornecedor(1)');
assert.ok(run('htmlModal').includes('data-a="compExcluirForn" data-id="1"'), 'sem proposta: mostra Excluir');
run('formFornecedor(2)');
assert.ok(!run('htmlModal').includes('compExcluirForn') && run('htmlModal').includes('Bloqueado'), 'com proposta: sem Excluir, indica Bloqueado');
run('var listaCurta = (id, html) => html;');   // stub do util da tela (não carregado neste teste)
const lista = run('abaFornecedores()');
assert.ok(lista.includes('data-a="compExcluirForn" data-id="1"') && !lista.includes('data-a="compExcluirForn" data-id="2"'), 'lista: 🗑 só para quem pode ser excluído');
run(`COMP.ops = [{ id: 9, status: 'cancelada' }];`);
assert.ok(run('abaFornecedores()').includes('data-a="compExcluirForn" data-id="2"'), 'proposta em oportunidade cancelada não impede excluir');
const exc = fs.readFileSync(path.join(root, 'supabase/migrations/20261103160745_compras_excluir_fornecedor_cancelada.sql'), 'utf8');
assert.ok(exc.includes('pode_compras()') && exc.includes("status <> 'rascunho'") && exc.includes("o.status <> 'cancelada'") && exc.includes('not exists (select 1 from pessoas where user_id = f.user_id)'), 'excluir: permissão, proposta enviada (fora de cancelada) e login da equipe protegidos');
console.log('OK: convite com CNPJ, link de quem tem login e excluir cadastro.');
