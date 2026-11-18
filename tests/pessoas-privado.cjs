// Pessoas (18/11): e-mail e permissões só por pessoas_privado(); a tela não lê essas colunas direto da tabela.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..'), ler = f => fs.readFileSync(path.join(root, f), 'utf8');
const js = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => [f, ler('js/' + f)]);

// nenhuma leitura de pessoas com * nem com email/permissoes; nada de upsert (ele leria as permissões de volta)
for (const [f, s] of js) {
  for (const m of s.matchAll(/from\('pessoas'\)([^;]*)/g)) {
    assert.doesNotMatch(m[1], /\.select\('\*'\)/, `${f}: select('*') em pessoas`);
    assert.doesNotMatch(m[1], /\.select\('[^']*(email|permissoes)/, `${f}: lê email/permissões direto da tabela`);
    assert.doesNotMatch(m[1], /\.upsert\(/, `${f}: upsert em pessoas`);
  }
}
const dados = ler('js/dados.js');
assert.match(dados, /const PESSOAS_COLS = 'id,nome,cargo,papel,supervisor_id,vinculo,dias,ativo,inicio,cor,tiny_vendedor_id,user_id,ordem';/);
assert.doesNotMatch(dados.match(/const PESSOAS_COLS = '([^']*)'/)[1], /email|permissoes/);
assert.match(ler('js/main.js'), /const rows = await pessoasComPrivado\(\);/, 'Acessos recarrega o e-mail pela função');

// junção: quem não vem da função fica sem e-mail e sem permissões
const ctx = vm.createContext({});
vm.runInContext(dados.slice(dados.indexOf('function juntarPrivado'), dados.indexOf('async function pessoasComPrivado')), ctx);
const r = vm.runInContext(`juntarPrivado([{ id: 'a', nome: 'A' }, { id: 'b', nome: 'B' }], [{ id: 'a', email: 'a@x', permissoes: { atendimento: true } }, { id: 'b', email: null, permissoes: {} }])`, ctx);
assert.equal(r[0].email, 'a@x'); assert.deepEqual(JSON.parse(JSON.stringify(r[0].permissoes)), { atendimento: true });
assert.equal(r[1].email, ''); assert.equal(r[1].nome, 'B');
assert.equal(vm.runInContext(`juntarPrivado([{ id: 'c' }], null)[0].email`, ctx), '');

// a função do banco: definer, sem anon, e-mail só próprio/dono, permissões da equipe e só "atendimento" dos demais
const mig = fs.readdirSync(path.join(root, 'supabase/migrations')).find(f => f.endsWith('_pessoas_privado_rpc.sql'));
assert.ok(mig, 'migration da função existe');
const sql = ler('supabase/migrations/' + mig);
assert.match(sql, /security definer set search_path = public/);
assert.match(sql, /case when public\.eh_dono\(\) or \(p\.user_id is not null and p\.user_id = seg\.uid\(\)\) then p\.email end/);
assert.match(sql, /when p\.id in \(select seg\.pessoas_visiveis\(\)\) then coalesce\(p\.permissoes/);
assert.match(sql, /then '\{"atendimento": true\}'::jsonb/);
assert.match(sql, /where seg\.eh_membro\(\)/); assert.match(sql, /revoke all on function public\.pessoas_privado\(\) from public, anon;/);
console.log('✔ pessoas-privado.cjs');
