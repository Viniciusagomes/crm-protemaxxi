// Contas a pagar (18/11): leitura da planilha do fornecedor, resumo por semana/fornecedor, acesso só dos donos e banco.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..'), ler = f => fs.readFileSync(path.join(root, f), 'utf8');
const cp = ler('js/contas.js'), main = ler('js/main.js'), html = ler('index.html');

// ligações na tela
assert.match(main, /contas: \(\) => vContas\(\)/); assert.match(main, /const SO_DONO = \[[^\]]*'contas'/, 'só os donos');
assert.match(main, /\['', 'contas', '🧾', 'Contas a pagar'\]/, 'no menu Financeiro');
assert.match(html, /<script src="js\/contas\.js\?v=\d{8}[a-z]"><\/script>\s*<script src="js\/painel\.js/);
assert.doesNotMatch(html, /xlsx\.full\.min\.js/, 'o leitor de planilha só carrega quando alguém importa');
assert.match(cp, /s\.src = 'js\/vendor\/xlsx\.full\.min\.js\?v=0\.20\.3'/);
assert.ok(fs.statSync(path.join(root, 'js/vendor/xlsx.full.min.js')).size > 500000, 'SheetJS no próprio site');
assert.match(ler('js/vendor/xlsx.full.min.js').slice(0, 80), /SheetJS/);

// lógica: contexto mínimo
const ctx = vm.createContext({});
vm.runInContext(ler('js/util.js').split('\n// ─── Emoji da interface')[0], ctx);
vm.runInContext(cp.slice(cp.indexOf('// ─── números'), cp.indexOf('// ─── tela ───')), ctx);
const run = c => vm.runInContext(c, ctx), js = c => JSON.parse(run(`JSON.stringify(${c})`));

// números e datas de célula
assert.equal(run(`cpaNum('1.234,56')`), 1234.56); assert.equal(run(`cpaNum('R$ 26.714,64')`), 26714.64); assert.equal(run(`cpaNum(431.5)`), 431.5);
assert.equal(run(`cpaNum('1234.50')`), 1234.5); assert.equal(run(`cpaNum('')`), null);
assert.equal(run(`cpaData('30/10/2026')`), '2026-10-30'); assert.equal(run(`cpaData('5/1/27')`), '2027-01-05'); assert.equal(run(`cpaData('2026-11-20')`), '2026-11-20');
assert.equal(run(`cpaData(46325)`), '2026-10-30', 'número de série do Excel'); assert.equal(run(`cpaData(new Date(2026, 10, 25))`), '2026-11-25'); assert.equal(run(`cpaData('abc')`), null);

// planilha no formato da Supritec (dados fictícios): cabeçalho, parcelas e a linha de total que fica de fora
const sup = js(`cpaLerPlanilha([
  ['Nº Lancto', 'Sq', 'Tipo Documento de Quitação', 'Valor Líquido', 'Dt. Emissão', 'Dt. Vencimento'],
  ['FT100', 2, '4 - Boleto Bancário', 1000.5, '2026-08-19', '2026-10-30'],
  ['TM200', 5, '4 - Boleto Bancário', '250,00', '2026-06-03', '25/11/2026'],
  ['', '', '', 1250.5, '', '']])`);
assert.equal(sup.itens.length, 2); assert.equal(sup.ignoradas, 1, 'linha do total fica de fora');
assert.deepEqual(sup.itens[0], { documento: 'FT100', parcela: '2', valor: 1000.5, vencimento: '2026-10-30' });
assert.deepEqual(sup.itens[1], { documento: 'TM200', parcela: '5', valor: 250, vencimento: '2026-11-25' });
assert.equal(sup.colunas.valor_liq, 'Valor Líquido'); assert.equal(sup.colunas.vencimento, 'Dt. Vencimento');
// cabeçalho mais abaixo e nomes diferentes; sem vencimento → erro claro
const outra = js(`cpaLerPlanilha([['Relatório de títulos'], [], ['Título', 'Parcela', 'Vencimento', 'Valor'], ['NF 55', '1/3', '01/12/2026', '1.000,00']])`);
assert.deepEqual(outra.itens, [{ documento: 'NF 55', parcela: '1/3', valor: 1000, vencimento: '2026-12-01' }]);
assert.match(js(`cpaLerPlanilha([['Nome', 'Total'], ['x', 10]])`).erro, /vencimento e valor/);
// linhas coladas do Excel
assert.equal(js(`cpaLerPlanilha(cpaColado('Doc\\tVenc.\\tValor\\nA1\\t20/11/2026\\t99,90\\n'))`).itens[0].valor, 99.9);

// resumo: vencidas, semana (até domingo), 30 dias, por semana e por fornecedor
const r = js(`cpaResumo([
  { status: 'a_pagar', valor: 100, vencimento: '2026-11-10', beneficiario: 'A' },
  { status: 'a_pagar', valor: 200, vencimento: '2026-11-20', beneficiario: 'A' },
  { status: 'a_pagar', valor: 300, vencimento: '2026-11-25', beneficiario: 'B' },
  { status: 'a_pagar', valor: 50, vencimento: null, beneficiario: null },
  { status: 'pago', valor: 999, vencimento: '2026-11-19', beneficiario: 'A' }], '2026-11-18')`);
assert.deepEqual([r.aberto.n, r.aberto.total, r.vencidos.total, r.semana.total, r.semana.ate, r.mes.total, r.semData], [4, 650, 100, 200, '2026-11-22', 500, 1]);
assert.equal(r.semanas[0].ini, '2026-11-16'); assert.equal(r.semanas[0].total, 300, 'a 1ª semana leva os vencidos'); assert.equal(r.semanas[1].total, 300);
assert.deepEqual(r.porFornecedor.map(f => [f.nome, f.total]), [['A', 300], ['B', 300], ['Fornecedor não identificado', 50]]);

// banco: só donos, importação e junção com o boleto do e-mail, CNPJ conferido
const mig = fs.readdirSync(path.join(root, 'supabase/migrations')).find(f => f.endsWith('_contas_pagar_aba.sql'));
assert.ok(mig, 'migration existe'); const sql = ler('supabase/migrations/' + mig);
assert.match(sql, /if not public\.eh_dono\(\) then raise exception/);
assert.match(sql, /create policy boletos_pagar_ins on public\.boletos_pagar for insert to authenticated with check \(public\.eh_dono\(\) and origem in \('planilha', 'manual'\)\)/);
assert.match(sql, /create policy boletos_pagar_del on public\.boletos_pagar for delete to authenticated using \(public\.eh_dono\(\) and origem <> 'email'\)/);
assert.match(sql, /create trigger boletos_pagar_casar after insert/); assert.match(sql, /if n <> 1 then return null; end if;/, 'só junta quando há uma parcela só');
assert.match(sql, /revoke all on function public\.contas_pagar_importar\(text, text, jsonb, date\) from public, anon;/);
// a leitura do e-mail confere os dígitos do CNPJ e não usa números da linha digitável
const fn = ler('supabase/functions/email-entrada/index.ts');
assert.match(fn, /function cnpjValido\(c: string\)/); assert.match(fn, /filter\(\(c\) => !linha \|\| !linha\.includes\(c\)\)/);
assert.match(fn, /beneficiario\(t, b\.linha\)/); assert.match(fn, /beneficiario\(textoTodo, b\.linha\)/);
{ const a = fn.indexOf('function cnpjValido'), b = fn.indexOf('/** Razão social');
  const c2 = vm.createContext({ NOSSOS_CNPJ: ['21114063000149'], dig: s => String(s ?? '').replace(/\D/g, '') });
  vm.runInContext(fn.slice(a, b).replace('(c: string)', '(c)').replace('(n: number)', '(n)').replace('(texto: string, linha?: string | null)', '(texto, linha)'), c2);
  const linha = '34191090081234567890123456789012116410000276988';
  assert.equal(vm.runInContext(`beneficiario('Beneficiário ACME LTDA CNPJ 08.268.970/0001-84 ${linha.slice(33)}', '${linha}').cnpj`, c2), '08268970000184');
  assert.equal(vm.runInContext(`beneficiario('Cedente ACME 1 ${linha.slice(33)}', '${linha}').cnpj`, c2), null, 'número do código de barras não vira CNPJ');
  assert.equal(vm.runInContext(`beneficiario('Pagador 21.114.063/0001-49', '').cnpj`, c2), null, 'o nosso CNPJ não conta'); }
console.log('✔ contas-pagar.cjs');
