// Expedição: botão "Finalizado" no balcão grava as etapas que faltam (separado → pago → entregue) numa confirmação só.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console, URL, location: { href: 'https://exemplo.test/index.html' }, document: { querySelector: () => null, addEventListener: () => {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(`var D = {}, UI = {}, EU = { id: 'fefao', papel: 'colaborador', permissoes: { expedicao: true } }, chamadas = [], rpcs = [], avisos = [], renders = 0;
  const ehDono = () => false, nomeP = id => id, render = () => { renders++; }, confirm = () => true, alert = m => avisos.push('ALERTA ' + m);
  const seloCredito = () => '', brindesDoPedido = () => [], tipoTV = () => ['loja', 'Balcão'], SUBSTATUS_NOME = {}, CRE = {};
  const sb = { rpc: async (n, a) => { rpcs.push([n, a]); return { error: null }; } };
  async function chamarFuncao(nome, corpo) { chamadas.push(corpo.etapa); const e = EXP.exp[corpo.pedido_id] || { pedido_id: corpo.pedido_id };
    return { expedicao: { ...e, [corpo.etapa + '_em']: '2026-11-04T12:00:00Z' } }; }`, ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/expedicao.js'), 'utf8'), ctx, { filename: 'expedicao.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'js/expedicao2.js'), 'utf8'), ctx, { filename: 'expedicao2.js' });
const run = code => vm.runInContext(code, ctx);

run(`EXP = { exp: {}, eventos: {}, ml: {}, itens: {}, prod: {}, ocs: [], cfg: {}, ecom: [
  { id: '1', numero: '101', tipo: 'loja', situacao: 'Aprovado', data: '2026-11-04', valor: 50, pag_forma: 'Dinheiro' },
  { id: '2', numero: '102', tipo: 'loja', situacao: 'Aprovado', data: '2026-11-04', valor: 80, pag_forma: 'Depósito' },
  { id: '3', numero: '103', tipo: 'envio', envio_forma: 'Correios', situacao: 'Aprovado', data: '2026-11-04', valor: 90, pag_forma: 'Dinheiro' }] };`);
const card = id => run(`cardExp2(infoPedido(EXP.ecom.find(p => p.id === '${id}')))`);

assert.ok(card('1').includes('data-a="expFinalizar" data-id="1"'), 'balcão aberto: mostra Finalizado');
assert.ok(!card('2').includes('expFinalizar'), 'depósito sem aprovação: sem Finalizado (aprovação continua obrigatória)');
assert.ok(!card('3').includes('expFinalizar'), 'envio (Correios): sem Finalizado');

(async () => {
  await run(`expFinalizar('1')`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(chamadas)')), ['separado', 'pago', 'despachado'], 'grava as três etapas na ordem');
  assert.deepEqual(JSON.parse(run('JSON.stringify(rpcs)')), [['exp_pago_como', { p_pedido: '1', p_como: 'retirada' }]], 'pagamento recebido no balcão');
  assert.ok(!card('1').includes('expFinalizar'), 'depois de finalizado o botão some');

  // já separado e pago: só falta entregar, e o botão normal "Entregue ao cliente" já resolve
  run(`chamadas.length = 0; EXP.exp['1'] = { pedido_id: '1', separado_em: 'x', pago_em: 'x' };`);
  assert.ok(!card('1').includes('expFinalizar') && card('1').includes('Entregue ao cliente'), 'separado e pago: só o Entregue');
  // separado, sem pagamento: Finalizado grava pago e entregue
  run(`EXP.exp['1'] = { pedido_id: '1', separado_em: 'x' };`);
  await run(`expFinalizar('1')`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(chamadas)')), ['pago', 'despachado'], 'pula o que já está feito');
  // clique duplo: a segunda chamada não repete as etapas
  run(`chamadas.length = 0; EXP.exp['1'] = { pedido_id: '1' };`);
  await Promise.all([run(`expFinalizar('1')`), run(`expFinalizar('1')`)]);
  assert.deepEqual(JSON.parse(run('JSON.stringify(chamadas)')), ['separado', 'pago', 'despachado'], 'clique duplo grava uma vez só');
  console.log('OK: Finalizado no balcão grava separado, pago e entregue.');
})().catch(e => { console.error(e); process.exit(1); });
