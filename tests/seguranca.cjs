// Segurança (pentest 18/11): limite de leads pelo IP da conexão, CSP restrita, telefones fechados por cliente,
// Assistência só para suporte/dono e nenhum telefone real de cliente no repositório.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..'), ler = f => fs.readFileSync(path.join(root, f), 'utf8');

// ads-lead: o IP da conexão manda; o do corpo só vale sem cabeçalho
const src = ler('supabase/functions/ads-lead/index.ts');
const fn = src.slice(src.indexOf('export function ipDoPedido'), src.indexOf('if (import.meta.main)'))
  .replace('export function', 'function').replace(/: \(n: string\) => string \| null/, '').replace(/: unknown/, '');
const ip = vm.runInNewContext(fn + '; ipDoPedido', { String });
const cab = h => n => h[n] ?? null;
assert.equal(ip(cab({ 'x-forwarded-for': '200.1.1.1, 10.0.0.1' }), '9.9.9.9'), '200.1.1.1', 'ip do corpo não fura o limite');
assert.equal(ip(cab({ 'cf-connecting-ip': '201.2.2.2', 'x-forwarded-for': '200.1.1.1' }), '9.9.9.9'), '201.2.2.2');
assert.equal(ip(cab({}), '9.9.9.9'), '9.9.9.9', 'sem cabeçalho, usa o do corpo');
assert.equal(ip(cab({}), undefined), '');

// CSP: só o arquivo do supabase-js no jsdelivr; páginas estáticas também com CSP
for (const f of ['index.html', 'os.html', 'avaliar.html', 'fornecedor.html']) {
  const h = ler(f);
  assert.match(h, /script-src 'self' https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.45\.4\/;/, `CSP restrita em ${f}`);
  for (const m of h.matchAll(/<script src="(https:[^"]+)"/g)) assert.ok(m[1].startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/'), `script de fora fora da CSP em ${f}: ${m[1]}`);
}
for (const f of ['privacidade.html', 'termos.html']) assert.match(ler(f), /Content-Security-Policy/, `CSP em ${f}`);

// banco: telefones por cliente visível, Assistência só suporte/dono, config financeira fechada
const mig = fs.readdirSync(path.join(root, 'supabase/migrations')).find(f => f.endsWith('_seguranca_pentest_rodada2.sql'));
assert.ok(mig, 'migration da rodada 2 existe');
const sql = ler('supabase/migrations/' + mig);
assert.match(sql, /alter policy clitel_sel[\s\S]+seg\.pode_mexer_cliente\(cliente_chave\)/);
assert.match(sql, /alter policy at_os_upd on public\.at_os using \(\(select seg\.pode_assist\(\)\)\)/);
assert.match(sql, /seg\.minha_permissao\('suporte'\)/);
assert.match(sql, /chave not in \('encargos', 'fiscal', 'contas_pagar'\)/);
assert.match(sql, /revoke all on function seg\.pode_assist\(\) from public, anon/);

// repositório público: nenhum dos telefones reais achados no pentest
const tudo = ['js', 'tests', 'docs'].flatMap(d => fs.readdirSync(path.join(root, d), { recursive: true }).map(f => path.join(d, String(f))))
  .filter(f => /\.(js|cjs|md|html)$/.test(f) && !f.endsWith('seguranca.cjs')).map(ler).join('\n');
for (const t of [['98166', '4877'], ['99547', '8814']].flatMap(([a, b]) => [a + '-' + b, '19' + a + b])) assert.ok(!tudo.includes(t), `telefone real no repositório: ${t}`);
console.log('✔ seguranca.cjs');
