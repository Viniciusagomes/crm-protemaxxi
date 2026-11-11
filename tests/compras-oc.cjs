// Compras: montagem da ordem de compra do Tiny (mesmo texto da Edge Function compras-oc) e travas no código.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');

const srv = fs.readFileSync(path.join(root, 'supabase/functions/compras-oc/index.ts'), 'utf8');
const ini = srv.indexOf('const somarDias ='), fim = srv.indexOf('async function gerar');
const trecho = srv.slice(ini, fim).replace(/export function/, 'function').replace(/: (any\[\]|any|string\[\]|unknown|number|string|Record<string, number>)/g, '');
const m = vm.runInNewContext(`${trecho}; ({ montarOrdem, somarDias })`, {});
const M = (...a) => JSON.parse(JSON.stringify(m.montarOrdem(...a)));

const o = { id: 7, titulo: 'Cabos de rede', pagamento: '28 dias' };
const p = { id: 3, frete: 45.5, prazo_entrega_dias: 5, pagamento: '30/60', validade: '2026-11-20', obs: 'Entrega na loja' };
const itens = [
  { id: 1, descricao: 'Cabo UTP cx 305 m', produto_codigo: 'CAB0001', quantidade: 4 },
  { id: 2, descricao: 'Conector RJ45', produto_codigo: 'CON1920', quantidade: 500 },
  { id: 3, descricao: 'Patch panel', produto_codigo: 'PAT0024', quantidade: 2 },
];
const pitens = [
  { item_id: 1, preco_unit: 389.9, disponivel: true, marca_modelo: 'Furukawa' },
  { item_id: 2, preco_unit: 0.13, disponivel: true },
  { item_id: 3, preco_unit: 0, disponivel: false },                       // não cotou: fica fora
];
const prods = { CAB0001: 111, CON1920: 642113106, PAT0024: 333 };

const r = M(o, p, itens, pitens, 647254781, prods, '2026-11-10');
assert.equal(r.erros, undefined);
assert.equal(r.corpo.contato.id, 647254781);
assert.equal(r.corpo.data, '2026-11-10');
assert.equal(r.corpo.dataPrevista, '2026-11-15', 'previsão = hoje + prazo da proposta');
assert.equal(r.corpo.itens.length, 2, 'item não cotado fica fora');
assert.deepEqual(r.corpo.itens[0], { produto: { id: 111, tipo: 'P' }, quantidade: 4, valor: 389.9, informacoesAdicionais: 'Furukawa' });
assert.equal(r.corpo.frete, 45.5); assert.equal(r.corpo.fretePorConta, 'D');
assert.equal(r.corpo.condicao, '30/60', 'condição da proposta tem prioridade');
assert.match(r.corpo.observacoes, /Cotação #7/); assert.match(r.corpo.observacoes, /20\/11\/2026/);
assert.equal(r.total, 4 * 389.9 + 500 * 0.13 + 45.5);
assert.equal(r.previsao, '2026-11-15');

// frete grátis = por conta do fornecedor; sem prazo = sem previsão; condição cai na da oportunidade
const r2 = M(o, { ...p, frete: 0, prazo_entrega_dias: null, pagamento: '' }, itens, pitens, 1, prods, '2026-12-30');
assert.equal(r2.corpo.fretePorConta, 'R'); assert.equal(r2.corpo.dataPrevista, null); assert.equal(r2.corpo.condicao, '28 dias');
assert.equal(m.somarDias('2026-12-30', 5), '2027-01-04', 'virada de ano');

// item cotado sem código ou com código que não existe no Tiny: bloqueia (não cria ordem pela metade)
const r3 = M(o, p, [{ ...itens[0], produto_codigo: null }, { ...itens[1], produto_codigo: 'XYZ' }], pitens, 1, prods, '2026-11-10');
assert.equal(r3.erros.length, 2); assert.match(r3.erros[0], /sem o código/); assert.match(r3.erros[1], /XYZ/);
// vencedor que não cotou nada
assert.match(M(o, p, itens, pitens.map(x => ({ ...x, disponivel: false })), 1, prods, '2026-11-10').erros[0], /nenhum item/);

// travas no código da função
assert.ok(srv.includes("eh_dono") && srv.includes('Só o administrador'), 'só o dono gera');
assert.ok(/oc_status: "enviando"/.test(srv) && srv.includes('.or(`oc_status.is.null'), 'marca enviando antes de chamar o Tiny (update condicional)');
assert.ok(srv.includes('metodo === "GET"'), 'POST não é repetido em 429');

// banco: não troca o vencedor depois da ordem; o fornecedor só vê o pedido se for o vencedor
const mig = fs.readdirSync(path.join(root, 'supabase/migrations')).find(f => f.endsWith('_compras_ordem_tiny.sql'));
const sql = fs.readFileSync(path.join(root, 'supabase/migrations', mig), 'utf8');
assert.match(sql, /oc_status in \('enviando', 'criada'\)\) then\s+raise exception/);
assert.match(sql, /p\.id = o\.vencedora_id and p\.fornecedor_id = fid/);

// telas: o botão chama a função; o portal mostra o pedido e o botão de confirmar
const comp = fs.readFileSync(path.join(root, 'js/compras.js'), 'utf8'), forn = fs.readFileSync(path.join(root, 'js/fornecedor.js'), 'utf8');
assert.ok(comp.includes("functions.invoke('compras-oc'") && !comp.includes('aguardando aprovação do Vinícius'));
assert.ok(forn.includes("rpc('forn_pedido_confirmar'") && forn.includes('Pedido de compra nº'));
console.log('ok compras-oc');
