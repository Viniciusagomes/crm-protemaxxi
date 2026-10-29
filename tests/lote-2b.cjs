// Lote 2 · entrega B: dia útil, o que falta no negócio, recuperar orçamentos, reagendamento e "Pediu orçamento" → negócio.
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
let D={config:{prospeccao:{por_dia:50},feriados:['2026-11-02','2026-11-20']},clientes:[],interacoes:[],pedidos:[],pessoas:[{id:'pedro',nome:'Pedro',ativo:true,tiny:'1'}]},
UI={proPessoa:'pedro'},EU={id:'pedro'};
const pessoasQueVejo=()=>['pedro'],pessoa=id=>D.pessoas.find(x=>x.id===id),ehDono=()=>false,nomeP=id=>id;
const seloCredito=()=>'',nomeVendedor=()=>'',corVendedor=()=>'',valido=()=>true,render=()=>{};
let ultimoModal=''; const modal=h=>{ultimoModal=h;};
`, ctx);
for (const file of ['clientes.js', 'agenda.js', 'carteira.js', 'crm.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), ctx, { filename: file });
}
const run = code => vm.runInContext(code, ctx);
const json = code => JSON.parse(run(`JSON.stringify(${code})`));

// Dia útil: segunda a sábado; domingo e feriado passam para o próximo dia útil (mesma regra de public.dia_util).
assert.equal(run(`diaUtil('2026-10-31')`), '2026-10-31');           // sábado: a loja abre
assert.equal(run(`diaUtil('2026-11-01')`), '2026-11-03');           // domingo → segunda é feriado (02/11) → terça
assert.equal(run(`diaUtil('2026-11-20')`), '2026-11-21');           // feriado de sexta → sábado
assert.equal(run(`ehDiaUtil('2026-11-02')`), false);

// O que falta: só aponta, não bloqueia; orçamento no Tiny só conta a partir da etapa orçamento.
run(`CRM.neg=[{id:1,cliente_chave:'c1',cliente_nome:'Ana',titulo:'CFTV',etapa:'orcamento',valor:5000,orcamento_numero:'123',orcamento_data:'2026-10-01',pessoa_id:'pedro'},
              {id:2,cliente_chave:'c2',cliente_nome:'Bia',titulo:'Alarme',etapa:'qualificado',valor:0,pessoa_id:'pedro',criado_em:'2026-10-27T10:00:00Z'},
              {id:3,cliente_chave:'c3',cliente_nome:'Caio',titulo:'Portão',etapa:'negociacao',valor:800,orcamento_data:'2026-10-25',pessoa_id:'pedro',previsao:'2026-11-10'}];
CRM.revisoes=[];
CRM.atv=[{id:10,negocio_id:1,pessoa_id:'pedro',tipo:'followup',titulo:'Retomar',quando:'2026-10-30',feito:false},
         {id:11,negocio_id:1,pessoa_id:'pedro',tipo:'followup',titulo:'Cobrou 1',quando:'2026-10-10',feito:true,feito_em:'2026-10-10T10:00:00Z',resultado:'sem resposta'},
         {id:12,negocio_id:1,pessoa_id:'pedro',tipo:'followup',titulo:'Cobrou 2',quando:'2026-10-15',feito:true,feito_em:'2026-10-15T10:00:00Z',resultado:'pediu desconto'},
         {id:13,negocio_id:1,pessoa_id:'pedro',tipo:'followup',titulo:'Cobrou 3',quando:'2026-10-20',feito:true,feito_em:'2026-10-20T10:00:00Z',resultado:'vai decidir'}];`);
assert.deepEqual(json('faltaNegocio(CRM.neg[0])'), ['previsão de fechamento']);
assert.deepEqual(json('faltaNegocio(CRM.neg[1])'), ['próximo passo', 'previsão de fechamento', 'valor']);
assert.ok(json('faltaNegocio(CRM.neg[2])').includes('orçamento no Tiny'));
assert.ok(run('blocoAvancar(CRM.neg[0])').includes('Salvar previsão'));

// Recuperar: 7+ dias, 3+ tentativas vêm primeiro com "Decidir"; o de 4 dias não entra.
assert.deepEqual(json('tentativasNegocio(CRM.neg[0])').n, 3);
const rec = run('abaRecuperarCRM(CRM.neg)');
assert.ok(rec.includes('Ana') && rec.includes('Decidir') && rec.includes('vai decidir'));
assert.ok(!rec.includes('Caio'), 'orçamento de 4 dias ainda não é "parado"');

// Reagendar: mostra o combinado original e quantas vezes mudou.
assert.match(run(`seloReagendada({quando_original:'2026-10-20',reagendamentos:[{de:'2026-10-20',para:'2026-10-25',motivo:'cliente viajando'}]})`), /reagendada 1× \(combinado 20\/10\)/);
assert.equal(run(`seloReagendada({reagendamentos:[]})`), '');

// "Pediu orçamento": oferece ligar ao negócio aberto do cliente (sem prospecção) ou criar um novo com data em dia útil.
run(`PRO.dados=[{id:50,cliente_chave:'c1',cliente_nome:'Ana',lista:'complemento',resultado:'orcamento',dados:{sugestao:'HD para gravação'}}];`);
run('formProNegocio(50)');
const m = run('ultimoModal');
assert.ok(m.includes('Ligar a este') && m.includes('data-negocio="1"'));
assert.ok(m.includes('Orçamento: HD para gravação'));
assert.ok(m.includes('value="2026-10-30"'));
run(`CRM.neg[0].prospeccao_id=50;`);
assert.equal(json('negocioDaPro(50).id'), 1);

console.log('OK: dia útil, falta no negócio, recuperar orçamentos, reagendamento e prospecção → negócio.');
