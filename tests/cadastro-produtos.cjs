// Cadastro de produtos (rotina dos GTINs): dígito do GTIN, montagem do PUT do Tiny (só preenche vazios) e a tela.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');

// ─── PUT do Tiny (mesmo texto da Edge Function, sem os tipos do TypeScript) ───
const srv = fs.readFileSync(path.join(root, 'supabase/functions/produto-sugestoes/index.ts'), 'utf8');
const ini = srv.indexOf('const vazio ='), fim = srv.indexOf('async function aplicarUm');
const trecho = srv.slice(ini, fim).replace(/export function/, 'function').replace(/: (any|string\[\]|unknown)/g, '');
const m = vm.runInNewContext(`${trecho}; ({ montarPut })`, {});
const P = (a, s) => JSON.parse(JSON.stringify(m.montarPut(a, s)));

const tiny = { sku: '4570057', descricao: 'Câmera X', gtin: '', descricaoComplementar: '', dimensoes: { altura: 0, largura: 12.5, comprimento: 0, pesoBruto: 0, pesoLiquido: 0.2, embalagem: { id: null, tipo: 2 }, quantidadeVolumes: 1 } };
const sug = { gtin: '7896637683913', peso_bruto: 0.35, peso_liquido: 0.25, altura: 8, largura: 15, comprimento: 20, ml_descricao: 'Texto ML' };
const r = P(tiny, sug);
assert.equal(r.corpo.sku, '4570057'); assert.equal(r.corpo.descricao, 'Câmera X');          // a v3 exige os dois, iguais
assert.equal(r.corpo.gtin, '7896637683913');
assert.equal(r.corpo.dimensoes.pesoBruto, 0.35); assert.equal(r.corpo.dimensoes.altura, 8); assert.equal(r.corpo.dimensoes.comprimento, 20);
assert.equal(r.corpo.dimensoes.largura, 12.5, 'largura já preenchida não muda');
assert.equal(r.corpo.dimensoes.pesoLiquido, 0.2, 'peso líquido já preenchido não muda');
assert.deepEqual(r.corpo.dimensoes.embalagem, { id: null, tipo: 2 }, 'o resto do bloco dimensoes vai igual ao lido');
assert.equal(r.corpo.descricaoComplementar, 'Texto ML');
assert.equal(r.ignorados.length, 2);
// GTIN já preenchido no Tiny: não troca
const r2 = P({ ...tiny, gtin: '7899298710424', descricaoComplementar: 'já tem', dimensoes: { altura: 1, largura: 1, comprimento: 1, pesoBruto: 1, pesoLiquido: 1 } }, sug);
assert.equal(r2.corpo.gtin, undefined); assert.equal(r2.corpo.dimensoes, undefined); assert.equal(r2.corpo.descricaoComplementar, undefined);
assert.deepEqual(r2.muda, []);
// sugestão sem dado nenhum: nada muda
assert.deepEqual(P(tiny, {}).muda, []);
// só campos permitidos podem mudar na conferência
assert.ok(srv.includes("dimensoes\\.(pesoBruto|pesoLiquido|altura|largura|comprimento)"), 'lista de campos permitidos');
assert.ok(srv.includes('eh_dono') && srv.includes('Só o administrador'), 'só o dono aplica');

// ─── tela ───
const ctx = vm.createContext({ console, document: { querySelector: () => null, addEventListener: () => {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext("var EU = { id: 'vini', papel: 'dono', permissoes: {} }, UI = {}; const ehDono = () => true, render = () => {};"
  + "const listaCurta = (id, c) => c;", ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/cadastroprod.js'), 'utf8'), ctx, { filename: 'cadastroprod.js' });
const v = code => vm.runInContext(code, ctx);
assert.equal(v("cpGtinValido('7896637683913')"), true);
assert.equal(v("cpGtinValido('7899298710424')"), true);
assert.equal(v("cpGtinValido('789618808981')"), false, 'GTIN-12 inválido (PSN0101)');
assert.equal(v("cpGtinValido('7896637683914')"), false);
assert.equal(v("cpGtinValido('96385074')"), true, 'GTIN-8');
assert.equal(v("cpGtinValido('abc')"), false);
v(`CP.lista = [
  { id: 1, status: 'pendente', codigo: 'A1', nome: '<img src=x>', lote: '2026-11-09', gtin: '7896637683913', gtin_certeza: 'alta', gtin_fonte: 'javascript:alert(1)', ml_titulo: 'Título' },
  { id: 2, status: 'pendente', codigo: 'B2', nome: 'Outro', lote: '2026-11-09', gtin: '7896637683914', gtin_certeza: 'media' },
  { id: 3, status: 'aplicada', codigo: 'C3', nome: 'Feito', lote: '2026-11-08', resultado: { ignorados: ['x'] } }];`);
const html = v('vCadastroProd()');
assert.ok(!html.includes('<img src=x>'), 'nome escapado');
assert.ok(!html.includes('javascript:alert'), 'link de fonte só http(s)');
assert.ok(html.includes('dígito inválido'), 'mostra GTIN inválido');
assert.ok(html.includes('Aprovar os de certeza alta (1)'), html.match(/Aprovar os de certeza alta \(\d+\)/)?.[0]);
assert.ok(!html.includes('Feito'), 'filtro padrão mostra só os pendentes');
assert.equal(v('cpPendentes()'), 2);
console.log('cadastro-produtos: ok');
