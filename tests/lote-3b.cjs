// Lote 3 · entrega B: pedido ligado ao negócio por confirmação, vendido/saldo, cancelamento e fila de pedidos para ligar.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');
const FixedDate = class extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-29T15:00:00Z'])); }
  static now() { return new Date('2026-10-29T15:00:00Z').getTime(); }
};
const ctx = vm.createContext({ console, Date: FixedDate, document: { querySelector: () => null, addEventListener: () => {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(`
let D={config:{prospeccao:{por_dia:50},feriados:[]},clientes:[],interacoes:[],pedidos:[],pessoas:[{id:'pedro',nome:'Pedro',ativo:true,tiny:'1'}]},
UI={},EU={id:'pedro'};
const pessoasQueVejo=()=>['pedro'],pessoa=id=>D.pessoas.find(x=>x.id===id),ehDono=()=>false,nomeP=id=>pessoa(id)?.nome||id;
const seloCredito=()=>'',nomeVendedor=()=>'Pedro',corVendedor=()=>'',valido=()=>true,render=()=>{};
`, ctx);
for (const file of ['clientes.js', 'agenda.js', 'carteira.js', 'crm.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), ctx, { filename: file });
const run = code => vm.runInContext(code, ctx);
const json = code => JSON.parse(run(`JSON.stringify(${code})`));

run(`CRM.neg=[{id:1,cliente_chave:'c1',cliente_nome:'Ana',titulo:'CFTV galpão',etapa:'orcamento',valor:5000,orcamento_data:'2026-10-10',pessoa_id:'pedro'},
              {id:2,cliente_chave:'c2',cliente_nome:'Bia',titulo:'Alarme',etapa:'orcamento',valor:900,criado_em:'2026-10-20T10:00:00Z',pessoa_id:'pedro'}];
CRM.revisoes=[]; CRM.atv=[];
CRM.vinc=[{id:7,negocio_id:1,pedido_id:'p1',vinculado_por:'pedro',vinculado_em:'2026-10-15T10:00:00Z',pedidos:{numero:'100',data:'2026-10-15',valor:2000,situacao:'Faturado'}},
          {id:8,negocio_id:1,pedido_id:'p2',vinculado_por:'pedro',vinculado_em:'2026-10-16T10:00:00Z',pedidos:{numero:'101',data:'2026-10-16',valor:700,situacao:'Cancelado'}}];
D.pedidos=[{id:'p1',numero:'100',data:'2026-10-15',valor:2000,situacao:'Faturado',cliente_chave:'c1'},
           {id:'p3',numero:'102',data:'2026-10-20',valor:800,situacao:'Aprovado',cliente_chave:'c1'},
           {id:'p4',numero:'103',data:'2026-09-01',valor:300,situacao:'Entregue',cliente_chave:'c1'},
           {id:'p5',numero:'104',data:'2026-10-21',valor:500,situacao:'Cancelado',cliente_chave:'c1'},
           {id:'p6',numero:'105',data:'2026-10-22',valor:150,situacao:'Aprovado',cliente_chave:'c1',numero_ecommerce:'ML1'},
           {id:'p7',numero:'106',data:'2026-10-25',valor:900,situacao:'Faturado',cliente_chave:'c2'}];`);

// Vendido conta só o que não foi cancelado; o cancelado aparece como divergência; saldo = negociado − vendido.
assert.deepEqual(json('(({vendido,pedidos,cancelados,saldo})=>({vendido,pedidos,cancelados,saldo}))(vendaNegocio(CRM.neg[0]))'), { vendido: 2000, pedidos: 1, cancelados: 1, saldo: 3000 });
const tags = run('alertasNegocio(CRM.neg[0])');
assert.ok(tags.includes('Pedido ligado cancelado') && tags.includes('Venda parcial'));

// Candidatos: mesmo cliente, loja, não cancelado, sem vínculo, a partir de 7 dias antes do orçamento.
assert.deepEqual(json('pedidosCandidatos(CRM.neg[0]).map(p=>p.numero)'), ['102']);
const bloco = run('blocoVendasNegocio(CRM.neg[0])');
assert.ok(bloco.includes('Negociado <b>R$') && bloco.includes('data-a="crmLigarPedido"') && bloco.includes('cancelado: não conta') && bloco.includes('Marcar como ganho'));

// Fila "Pedidos para ligar": só pedidos sem negócio de clientes com negociação aberta.
const fila = run('abaPedidosLigar(CRM.neg)');
assert.ok(fila.includes('pedido <b>102</b>') && fila.includes('pedido <b>106</b>'));
assert.ok(!fila.includes('pedido <b>100</b>') && !fila.includes('pedido <b>104</b>') && !fila.includes('pedido <b>105</b>'));

// Central de pendências: pedido ligado cancelado vira item de conferência.
run(`TELF.lista=[]; PRO.resumoDia=hoje(); PRO.resumoEm=Date.now(); PRO.resumo=[];`);
assert.ok(json(`pendenciasComerciais(D.pessoas).some(x=>x.k==='conferir' && x.txt.includes('cancelado'))`));

// Cadastro conferido como "mesmo cliente": o pedido do outro cadastro também é candidato.
run(`CRM.mesmo=[{a:'c1',b:'n:ana'}]; D.pedidos.push({id:'p8',numero:'107',data:'2026-10-26',valor:400,situacao:'Aprovado',cliente_chave:'n:ana'});`);
assert.ok(json('pedidosCandidatos(CRM.neg[0]).map(p=>p.numero)').includes('107'));
assert.ok(run('abaPedidosLigar(CRM.neg)').includes('pedido <b>107</b>'));

// Negócio ganho com pedido ligado cancelado continua com alerta e entra na central.
run(`CRM.neg[0].etapa='ganho';`);
assert.ok(run('alertasNegocio(CRM.neg[0])').includes('Pedido ligado cancelado'));
assert.ok(json(`pendenciasComerciais(D.pessoas).some(x=>x.k==='conferir' && x.txt.includes('negócio ganho'))`));

console.log('OK: venda ligada ao negócio, saldo, cancelamento e fila de pedidos para ligar.');
