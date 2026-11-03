// Lote 4 · entrega A: prioridade explicada no Meu dia, mensagens por contexto, recompra pelo ciclo e motivo do orçamento parado.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');
const FixedDate = class extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-30T15:00:00Z'])); }
  static now() { return new Date('2026-10-30T15:00:00Z').getTime(); }
};
const ctx = vm.createContext({ console, Date: FixedDate, document: { querySelector: () => null, addEventListener: () => {} }, encodeURIComponent });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(`
let D={config:{prospeccao:{por_dia:50},feriados:[]},clientes:[{chave:'c9',nome:'Pausado',fone:'11900000009',contato_pausa_ate:'2026-12-01'},{chave:'c8',nome:'Rui',fone:'11900000008'}],interacoes:[],pedidos:[],pessoas:[{id:'vend',nome:'Ana Teste',ativo:true,tiny:'1'}]},
UI={},EU={id:'vend'};
const pessoasQueVejo=()=>['vend'],pessoa=id=>D.pessoas.find(x=>x.id===id),ehDono=()=>false,nomeP=id=>id;
const seloCredito=()=>'',nomeVendedor=()=>'',corVendedor=()=>'',valido=()=>true,render=()=>{};
`, ctx);
for (const file of ['clientes.js', 'agenda.js', 'carteira.js', 'crm.js', 'campanhas.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), ctx, { filename: file });
const run = code => vm.runInContext(code, ctx);
const json = code => JSON.parse(run(`JSON.stringify(${code})`));

// Passo 31: compromisso e retorno vêm antes do lead, e o lead antes da tarefa comum, mesmo com tarefa mais atrasada.
run(`TELF.lista=[]; CRM.neg=[]; CRM.revisoes=[];
CRM.atv=[{id:1,cliente_chave:'a',cliente_nome:'Tarefa velha',pessoa_id:'vend',tipo:'ligar',titulo:'Ligar',quando:'2026-10-01',feito:false},
 {id:2,cliente_nome:'(11) 90000-0001 ~Lead Teste',pessoa_id:'vend',tipo:'whatsapp',titulo:'Lead Google Ads (formulário, 30/10 09:46): Lead Teste · Controle de acesso — (11) 90000-0001',quando:'2026-10-30',feito:false,automatica:'lead_ads:5511900000001'},
 {id:3,cliente_chave:'b',cliente_nome:'Combinada',pessoa_id:'vend',tipo:'ligar',titulo:'Retomar',quando:'2026-10-30',feito:false,quando_original:'2026-10-20',reagendamentos:[{de:'2026-10-20',para:'2026-10-30',motivo:'cliente pediu'}]},
 {id:4,cliente_chave:'d',cliente_nome:'Com hora',pessoa_id:'vend',tipo:'reuniao',titulo:'Visita',quando:'2026-10-30',hora:'14:00:00',feito:false}];
D.interacoes=[{id:7,cliente_chave:'c8',cliente_nome:'Rui',autor_id:'vend',texto:'Pediu retorno',proximo_contato:'2026-10-30',feito:false},
 {id:8,cliente_chave:'c9',cliente_nome:'Pausado',autor_id:'vend',texto:'Pediu retorno',proximo_contato:'2026-10-30',feito:false}];`);
const fila = json('filaDoDia("vend").map(k=>({nome:k.nome,motivos:k.motivos,linhas:k.linhas.length}))');
assert.equal(fila.at(-1).nome, 'Tarefa velha');
assert.ok(!fila.some(k => k.nome.includes('Lead Teste')), 'lead fica no botão próprio');
assert.deepEqual(json('filaDoDia("vend",true).map(k=>k.nome)'), ['(11) 90000-0001 ~Lead Teste']);
assert.ok(fila.find(k => k.nome === 'Com hora').motivos.includes('Compromisso às 14:00'));
assert.ok(fila.find(k => k.nome === 'Combinada').motivos.includes('Data combinada'));

// Passo 34: o lead abre o WhatsApp com a mensagem pronta; retorno de cliente pausado não oferece mensagem.
const cartoes = run('[...filaDoDia("vend"),...filaDoDia("vend",true)].map(cartaoFila).join("§")').split('§');
const cLead = cartoes.find(c => c.includes('Lead Teste'));
assert.ok(cLead.includes('wa.me/5511900000001?text='));
assert.ok(decodeURIComponent(cLead.match(/text=([^"]+)/)[1]).includes('Olá, Lead! Aqui é Ana, da Protemaxxi. Vi que você pediu informações sobre controle de acesso'));
assert.ok(cartoes.find(c => c.includes('>Rui<')).includes('wa.me'));
assert.ok(!cartoes.find(c => c.includes('>Pausado<')).includes('wa.me'));
assert.match(run(`mensagemLead({cliente_nome:'(11) 9 ~Lead sem nome',titulo:'Lead Google Ads: sem nome'},'Ana')`), /^Olá, tudo bem\? .* informações pelo nosso site/);

// Passo 32 + 34: recompra fala do produto que repõe, muda o texto entre clientes e não promete estoque.
const m = id => run(`mensagemPro({id:${id},lista:'recompra',cliente_nome:'Beto',dados:{produto_repor:'Cabo coaxial',repor_chave:'CAB1',ultima_repor:'2026-09-01',produto_ultima_compra:'Outro item'}},'Ana')`);
assert.ok(m(2).includes('costuma levar Cabo coaxial') && m(2).includes('há alguns meses'));
assert.notEqual(m(1), m(2));
assert.ok(!/Outro item|em estoque/.test(m(2)));
// quem não tem ciclo continua com a mensagem antiga
assert.ok(run(`mensagemPro({id:3,lista:'recompra',dados:{produto_ultima_compra:'Cabo'}},'Ana')`).includes('repor material'));

// Passo 36: motivo marcado muda a sugestão e a mensagem; sem motivo, pergunta se viu o orçamento.
run(`CRM.neg=[{id:50,cliente_chave:'c8',cliente_nome:'Rui',titulo:'CFTV',etapa:'orcamento',valor:5000,orcamento_data:'2026-10-01',pessoa_id:'vend',travado_motivo:'preco'},
              {id:51,cliente_chave:'c9',cliente_nome:'Pausado',titulo:'Alarme',etapa:'orcamento',valor:900,orcamento_data:'2026-10-01',pessoa_id:'vend'}];`);
const rec = run('abaRecuperarCRM(CRM.neg)');
assert.ok(rec.includes('data-a="crmTrava"') && rec.includes('Revise os itens e veja alternativas'));
assert.equal((rec.match(/Mensagem<\/a>/g) || []).length, 1, 'cliente pausado não recebe sugestão de mensagem');
assert.ok(run('mensagemTrava(CRM.neg[0],"Ana")').includes('alternativas'));
assert.ok(run('mensagemTrava(CRM.neg[1],"Ana")').includes('conseguiu ver o orçamento'));

// Revisão do Codex: lead bloqueado ou com número errado não oferece WhatsApp; telefone nunca vira nome.
run(`D.clientes.push({chave:'c7',nome:'Bloqueado',fone:'(11) 90000-0001',nao_contatar:true});`);
assert.ok(!run('filaDoDia("vend",true).map(cartaoFila).join("")').includes('wa.me/5511900000001'));
run(`D.clientes.pop(); TELF.lista=[{cliente_chave:null,telefone:foneNorm('5511900000001')}];`);
assert.ok(!run('filaDoDia("vend",true).map(cartaoFila).join("")').includes('wa.me/5511900000001'));
run(`TELF.lista=[]; D.clientes.push({chave:'c6',telefone:'(11) 90000-0001',contato_pausa_ate:'2026-12-01'});`);
assert.ok(!run('filaDoDia("vend",true).map(cartaoFila).join("")').includes('wa.me/5511900000001'), 'número em outro campo do cadastro');
run(`D.clientes.pop(); var salvos=D.clientes; D.clientes=null;`);
assert.ok(!run('filaDoDia("vend",true).map(cartaoFila).join("")').includes('wa.me/5511900000001'), 'sem carteira carregada não libera');
run(`D.clientes=salvos;`);
assert.ok(run('filaDoDia("vend",true).map(cartaoFila).join("")').includes('wa.me/5511900000001'));

// Leads Campanhas: mensagem por contato, restrições e só o que é do vendedor.
run(`CAMP.lista=[{id:1,nome:'Bateria',ativa:true,mensagem:'{ola} Aqui é {vendedor}. Você comprou a bateria {produto} com a gente{quando}.',mensagem_recompra:'{ola} Como está?'},{id:2,nome:'Parada',ativa:false,mensagem:'x'}];
CAMP.contatos=[{id:1,campanha_id:1,pessoa_id:'vend',cliente_nome:'Maria Teste',celular:'11900000002',produto:'XB 1270',compra_data:'2024-10-08'},
 {id:2,campanha_id:1,pessoa_id:'vend',cliente_nome:'Empresa LTDA',email:'teste@example.com',produto:'XB'},
 {id:3,campanha_id:1,pessoa_id:'outro',cliente_nome:'De outro',celular:'11900000003'},
 {id:4,campanha_id:2,pessoa_id:'vend',cliente_nome:'Pausada',celular:'11900000004'},
 {id:5,campanha_id:1,pessoa_id:'vend',cliente_chave:'c9',cliente_nome:'Pausado',celular:'11900000005',ja_comprou:true},
 {id:6,campanha_id:1,pessoa_id:'vend',cliente_nome:'Feito',celular:'11900000006',resultado:'respondeu'}];`);
assert.deepEqual(json('campPendentes("vend").map(c=>c.id)'), [1, 2, 5]);
assert.equal(run('mensagemCampanha(CAMP.contatos[0],"Ana")'), 'Olá, Maria! Aqui é o Ana, da Protemaxxi. Você comprou a bateria XB 1270 com a gente em 10/2024.');
assert.equal(run('mensagemCampanha(CAMP.contatos[4],"Ana")'), 'Olá, Pausado! Como está?');
run(`D.clientes.push({chave:'c5',celular:'(11) 90000-0002',nao_contatar:true});`);
assert.ok(run('campBloqueio(CAMP.contatos[0])').includes('não ser contatado'), 'bloqueio pelo número, sem chave');
run(`D.clientes.pop(); CAMP.restricoes={1:{contato_id:1,nao_contatar:false,pausa_ate:'2026-12-01'}};`);
assert.ok(run('campBloqueio(CAMP.contatos[0])').includes('pausado'), 'restrição vinda do banco, fora da carteira');
run(`CAMP.restricoes={};`);
const bc = run('blocoCampanhasDia("vend")');
assert.ok(bc.includes('wa.me/5511900000002') && bc.includes('mailto:teste@example.com') && !bc.includes('wa.me/5511900000005') && !bc.includes('De outro') && !bc.includes('>Feito<') && !bc.includes('Parada'));
assert.deepEqual(json(`lerContatosCampanha('Ana; (11) 90000-0000; a@b.c; Fonte\\n\\nBia')`), [{cliente_nome:'Ana',celular:'11900000000',email:'a@b.c',produto:'Fonte'},{cliente_nome:'Bia',celular:null,email:null,produto:null}]);
assert.match(run(`mensagemRetorno({cliente_nome:'(11) 90000-0009 ~Maria',proximo_contato:'2026-10-30'},'Ana')`), /^Olá, Maria!/);
assert.match(run(`mensagemTrava({cliente_nome:'(11) 90000-0009'},'Ana')`), /^Olá, tudo bem\?/);

console.log('OK: prioridade explicada, mensagens por contexto, recompra pelo ciclo e motivo do orçamento parado.');
