// Lote 2 · entrega A: fila única do Meu dia, telefones marcados como errados e regras de contato.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');
const FixedDate = class extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-29T12:00:00Z'])); }
  static now() { return new Date('2026-10-29T12:00:00Z').getTime(); }
};
const ctx = vm.createContext({ console, Date: FixedDate, document: { querySelector: () => null, addEventListener: () => {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(`
let D={config:{prospeccao:{por_dia:50}},clientes:[],interacoes:[],pedidos:[],pessoas:[{id:'pedro',nome:'Pedro',ativo:true,tiny:'1'}]},
UI={proPessoa:'pedro'},EU={id:'pedro'};
const pessoasQueVejo=()=>['pedro'],pessoa=id=>D.pessoas.find(x=>x.id===id),ehDono=()=>false,nomeP=id=>id;
const seloCredito=()=>'',nomeVendedor=()=>'',corVendedor=()=>'',valido=()=>true,render=()=>{};
`, ctx);
for (const file of ['clientes.js', 'agenda.js', 'carteira.js', 'crm.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), ctx, { filename: file });
}
const run = code => vm.runInContext(code, ctx);
const json = code => JSON.parse(run(`JSON.stringify(${code})`));

// Fila única: um cartão por cliente, retorno combinado primeiro, depois atrasado, e negócio parado por último.
run(`CRM.neg=[{id:10,cliente_chave:'c1',cliente_nome:'Ana',titulo:'CFTV',etapa:'orcamento',valor:5000,pessoa_id:'pedro',atualizado_em:'2026-10-01T00:00:00Z'},
              {id:11,cliente_chave:'c3',cliente_nome:'Caio',titulo:'Alarme',etapa:'orcamento',valor:900,pessoa_id:'pedro',atualizado_em:'2026-10-20T00:00:00Z'}];
CRM.revisoes=[];
CRM.atv=[{id:1,negocio_id:10,cliente_chave:'c1',cliente_nome:'Ana',pessoa_id:'pedro',tipo:'ligar',titulo:'Ligar',quando:'2026-10-29',feito:false},
         {id:2,cliente_chave:'c2',cliente_nome:'Bia',pessoa_id:'pedro',tipo:'whatsapp',titulo:'Cobrar retorno',quando:'2026-10-25',feito:false},
         {id:3,cliente_chave:'c9',cliente_nome:'Outro',pessoa_id:'felipe',tipo:'ligar',titulo:'De outro vendedor',quando:'2026-10-20',feito:false}];
D.interacoes=[{id:7,cliente_chave:'c1',cliente_nome:'Ana',autor_id:'pedro',texto:'Prospecção: pediu orçamento',proximo_contato:'2026-10-29',feito:false}];`);
let fila = json('filaDoDia("pedro").map(k=>({chave:k.chave,prio:k.prio,linhas:k.linhas.length,motivos:k.motivos}))');
assert.deepEqual(fila.map(k => k.chave), ['c1', 'c2', 'c3']);
assert.equal(fila[1].prio, 1);
assert.match(fila[1].motivos[0], /Atrasada há 4 dia/);
// Ana: atividade de hoje + retorno combinado no mesmo cartão (o negócio tem atividade, então não entra como parado)
assert.equal(fila[0].linhas, 2);
assert.ok(fila[0].motivos.includes('Retorno combinado para hoje'));
assert.equal(fila[2].prio, 3);
assert.match(fila[2].motivos[0], /sem próximo passo/);
assert.ok(!fila.some(k => k.chave === 'c9'), 'atividade de outro vendedor não aparece');
const html = run('cartaoFila(filaDoDia("pedro")[0])');
assert.ok(html.includes('data-a="atvFeita"') && html.includes('data-a="followupFeito"'));

// Atividade sem cliente_chave, mas ligada a negócio: usa o cliente do negócio (não duplica o cartão).
run(`CRM.atv.push({id:4,negocio_id:11,pessoa_id:'pedro',tipo:'ligar',titulo:'Retomar',quando:'2026-10-29',feito:false});
D.interacoes.push({id:8,cliente_chave:'c3',cliente_nome:'Caio',autor_id:'pedro',texto:'Retorno',proximo_contato:'2026-10-29',feito:false});`);
assert.equal(json('filaDoDia("pedro").filter(k=>k.nome==="Caio").length'), 1);
assert.equal(json('filaDoDia("pedro").find(k=>k.chave==="c3").prio'), 2);

// Meu dia: cliente pausado ou "não contatar" não aparece nos contatos rápidos; a mensagem é editável.
run(`PRO.chave=hoje()+'pedro'; PRO.dados=[{id:21,cliente_chave:'p1',cliente_nome:'Pausado',lista:'reativacao',dados:{}},{id:22,cliente_chave:'p2',cliente_nome:'Livre',lista:'reativacao',dados:{}}];
D.clientes=[{chave:'p1',nome:'Pausado',fone:'5519999990000',contato_pausa_ate:'2026-11-30'},{chave:'p2',nome:'Livre',fone:'5519999991111'}];`);
const rapido = run('blocoProspeccaoDia("pedro")');
assert.ok(rapido.includes('Livre') && !rapido.includes('Pausado'));
assert.ok(/<textarea class="pro-msg" id="proMsg_22"/.test(rapido) && !rapido.includes('hidden'));

// Telefones: só aparece cliente do vendedor que ficou sem nenhum número válido.
run(`D.clientes=[{chave:'c1',nome:'Ana',fone:'',vendedor_id:'1'},{chave:'c2',nome:'Bia',fone:'5519999990000',vendedor_id:'1'},{chave:'c4',nome:'Dani',fone:'',vendedor_id:'2'}];
TELF.lista=[{cliente_chave:'c1',telefone:'5519988887777',errado_em:'2026-10-28T10:00:00Z',errado_por:'pedro'},
            {cliente_chave:'c2',telefone:'5519911112222',errado_em:'2026-10-28T10:00:00Z',errado_por:'pedro'},
            {cliente_chave:'c4',telefone:'5519933334444',errado_em:'2026-10-28T10:00:00Z',errado_por:'felipe'}];`);
assert.deepEqual(json('filaTelefones("pedro").map(t=>t.cliente_chave)'), ['c1']);
assert.ok(run('blocoTelefones("pedro")').includes('(19) 98888-7777'));

// Regras de contato: pausa vencida não aparece; canal preferido aparece.
assert.ok(run(`seloContato({contato_pausa_ate:'2026-11-10',contato_canal:'whatsapp'})`).includes('Pausa até'));
assert.ok(!run(`seloContato({contato_pausa_ate:'2026-10-01'})`).includes('Pausa'));
assert.ok(run(`seloContato({contato_canal:'ligacao'})`).includes('Ligação'));

console.log('OK: fila única, telefones errados e regras de contato.');
