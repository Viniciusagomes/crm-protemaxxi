// Lote 2 · entrega C: linha do tempo do cliente e central de pendências comerciais da Supervisão.
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
let D={config:{prospeccao:{por_dia:50},feriados:[]},clientes:[],interacoes:[],pedidos:[],solicitacoes:[],
  pessoas:[{id:'pedro',nome:'Pedro Lima',ativo:true,tiny:'1'},{id:'felipe',nome:'Felipe Menezes',ativo:true,tiny:'2'}]},
UI={proPessoa:'pedro'},EU={id:'felipe'};
const pessoasQueVejo=()=>['pedro','felipe'],pessoa=id=>D.pessoas.find(x=>x.id===id),ehDono=()=>false,nomeP=id=>pessoa(id)?.nome||id;
const seloCredito=()=>'',nomeVendedor=()=>'Pedro',corVendedor=()=>'',valido=()=>true,render=()=>{};
let ultimoModal=''; const modal=h=>{ultimoModal=h;};
`, ctx);
for (const file of ['clientes.js', 'agenda.js', 'carteira.js', 'crm.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), ctx, { filename: file });
}
const run = code => vm.runInContext(code, ctx);
const json = code => JSON.parse(run(`JSON.stringify(${code})`));

// Linha do tempo: junta compra, contato, campanha, negócio (aberto/juntado) e atividade, do mais recente ao mais antigo;
// o contato que a campanha gera não aparece duas vezes.
run(`D.pedidos=[{cliente_chave:'c1',data:'2026-10-02',numero:'777',valor:1200,situacao:'Faturado',vendedor_id:'1'}];
D.interacoes=[{id:1,cliente_chave:'c1',tipo:'ligacao',texto:'Ligou pedindo prazo',criado_em:'2026-10-20T10:00:00Z',autor_id:'pedro'},
              {id:2,cliente_chave:'c1',tipo:'whatsapp',texto:'Prospecção (reativacao): orcamento. Entrega sexta',criado_em:'2026-10-25T10:00:00Z',autor_id:'pedro'}];`);
const ev = json(`eventosCliente('c1',{pro:[{data:'2026-10-25',resultado_em:'2026-10-25T10:00:00Z',lista:'reativacao',resultado:'orcamento',pessoa_id:'pedro',interacao_id:2},{data:'2026-09-01',lista:'recompra',pessoa_id:'pedro'}],
  negs:[{titulo:'CFTV',valor:3000,criado_em:'2026-10-26T09:00:00Z',pessoa_id:'pedro',etapa:'perdido',fechado_em:'2026-10-28T09:00:00Z',juntado_a:9}],
  atvs:[{tipo:'ligar',titulo:'Retomar',feito:true,feito_em:'2026-10-27T09:00:00Z',resultado:'vai decidir',pessoa_id:'pedro'}], oss:[]})`);
assert.equal(ev.length, 7);
assert.ok(ev[0].txt.includes('juntado'));
assert.equal(ev.filter(e => /Entrega sexta/.test(e.txt)).length, 1, 'contato da campanha aparece uma vez, com o texto');
assert.ok(!ev.some(e => e.txt.startsWith('Campanha ⚠️')), 'resultado que virou contato não duplica');
assert.ok(ev.some(e => e.txt.includes('na lista, sem registro')), 'campanha sem contato aparece');
assert.equal(ev[ev.length - 1].txt.includes('na lista'), true, 'mais antigo por último');
assert.ok(run(`blocoLinhaTempo(${JSON.stringify(ev)})`).includes('Compra nº 777'));

// Central de pendências: retorno vencido, negócio sem próximo passo e prospecção sem registro, por vendedor.
run(`CRM.neg=[{id:1,cliente_chave:'c1',cliente_nome:'Ana',titulo:'CFTV',etapa:'orcamento',valor:5000,pessoa_id:'pedro',mov_em:'2026-10-10T10:00:00Z'},
              {id:2,cliente_chave:'c2',cliente_nome:'Bia',titulo:'Alarme',etapa:'orcamento',valor:900,pessoa_id:'pedro'}];
CRM.revisoes=[];
CRM.atv=[{id:10,negocio_id:2,cliente_nome:'Bia',pessoa_id:'pedro',tipo:'ligar',titulo:'Cobrar',quando:'2026-10-27',feito:false},
         {id:11,cliente_nome:'Lead',pessoa_id:'felipe',tipo:'whatsapp',titulo:'Lead Google Ads',quando:'2026-10-29',feito:false}];
D.interacoes=[{id:5,cliente_chave:'c3',cliente_nome:'Caio',autor_id:'pedro',texto:'Ligar de volta',proximo_contato:'2026-10-26',feito:false}];
CRM.neg.push({id:3,cliente_chave:'c4',cliente_nome:'Dani',titulo:'Vendido',etapa:'ganho',valor:100,pessoa_id:'pedro'});
CRM.atv.push({id:12,negocio_id:3,cliente_nome:'Dani',pessoa_id:'pedro',tipo:'posvenda',titulo:'Pós-venda',quando:'2026-10-25',feito:false});
TELF.lista=[]; PRO.resumoDia=hoje(); PRO.resumoEm=Date.now(); PRO.resumo=[{id:1,pessoa_id:'pedro',resultado:null},{id:2,pessoa_id:'pedro',resultado:'respondeu'}];`);
const it = json(`pendenciasComerciais(D.pessoas).map(x=>[x.k,x.p.id,x.passar?x.passar[0]:null])`);
assert.deepEqual(it, [['atrasado', 'pedro', 'negocio'], ['atrasado', 'pedro', null], ['atrasado', 'pedro', null], ['semPasso', 'pedro', 'negocio'], ['adesao', 'pedro', null]]);
assert.ok(json(`pendenciasComerciais(D.pessoas).some(x=>x.txt.includes('retorno combinado'))`), 'retorno combinado vencido entra');
const html = run(`blocoPendencias(D.pessoas[1],[D.pessoas[0]])`);
assert.ok(html.includes('Central de pendências comerciais') && html.includes('data-a="crmPassar"') && html.includes('1 de 2 registrados'));

// Passar: só oferece outra pessoa e exige motivo antes de gravar.
run(`crmPassar('negocio',1,'pedro')`);
const m = run('ultimoModal');
assert.ok(m.includes('value="felipe"') && !m.includes('value="pedro"') && m.includes('Motivo *'));

console.log('OK: linha do tempo do cliente e central de pendências.');
