const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');
const FixedDate = class extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-24T12:00:00Z'])); }
  static now() { return new Date('2026-10-24T12:00:00Z').getTime(); }
};
const ctx = vm.createContext({ console, Date: FixedDate, document: { querySelector: () => null } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(`
let D={config:{prospeccao:{por_dia:50}},clientes:[],interacoes:[],pedidos:[],pessoas:[{id:'pedro',nome:'Pedro',ativo:true,tiny:'1'}]},
UI={proPessoa:'pedro'},EU={id:'pedro'};
const pessoasQueVejo=()=>['pedro'],pessoa=id=>D.pessoas.find(x=>x.id===id),ehDono=()=>false;
const seloCredito=()=>'',nomeVendedor=()=>'',corVendedor=()=>'',valido=()=>true;
`, ctx);
for (const file of ['clientes.js', 'carteira.js', 'solicitacoes.js', 'assistencia.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), ctx, { filename: file });
}
const run = code => vm.runInContext(code, ctx);
run('TELF.lista=[];'); // fila de telefones já carregada (sem números errados) para não buscar no banco
const json = code => JSON.parse(run(`JSON.stringify(${code})`));

// A ordem solicitada aparece nos dois quadros, com compatibilidade para RMAs antigos.
assert.deepEqual(json('COLUNAS_OS.slice(1,6)'), ['em_analise','na_assistencia','aguardando_peca','retornou','aguardando_cliente']);
assert.deepEqual(json('ETAPAS_RMA.slice(1,6)'), ['Análise','Envio assistência','Aguardando peça','Retorno técnica','Aguardando cliente']);
assert.equal(run('etapaRMA("Enviado ao fabricante")'), 'Envio assistência');
assert.equal(run('etapaRMA("Retornou do fabricante")'), 'Retorno técnica');
assert.equal(run('etapaRMA("Em análise")'), 'Análise');

// Registrar contato muda a categoria de atenção imediatamente, mesmo com RFM em cache.
run(`D.clientes=Array.from({length:5},(_,i)=>({chave:'c'+i,nome:'Cliente '+i,dias_sem_comprar:(i+1)*10,pedidos:i+1,total:(i+1)*100,primeira:'2025-01-01'}));`);
assert.equal(run('rfm().c2.seg'), 'atencao');
const notasAntes = json('[rfm().c2.r,rfm().c2.f,rfm().c2.m]');
run(`D.interacoes.unshift({cliente_chave:'c2',tipo:'whatsapp',criado_em:'2026-10-24T10:00:00Z'});`);
assert.equal(run('rfm().c2.seg'), 'acompanhamento');
assert.deepEqual(json('[rfm().c2.r,rfm().c2.f,rfm().c2.m]'), notasAntes);
run(`D.interacoes=[{cliente_chave:'c2',tipo:'nota',criado_em:'2026-10-24T10:00:00Z'}];`);
assert.equal(run('rfm().c2.seg'), 'atencao');
run(`D.interacoes=[{cliente_chave:'c2',tipo:'ligacao',criado_em:'2026-09-01T10:00:00Z'}];`);
assert.equal(run('rfm().c2.seg'), 'atencao');
run(`D.interacoes=[]; PRO.hist=[{cliente_chave:'c2',data:'2026-10-24',resultado:'pular'}];`);
assert.equal(run('rfm().c2.seg'), 'atencao');
run(`PRO.hist[0].resultado='sem_resposta';`);
assert.equal(run('rfm().c2.seg'), 'acompanhamento');

// Cada mensagem de retomada usa o produto real, sem promessa de estoque nem oferta genérica.
for (const lista of ['reativacao','recompra','indicacao','instalador']) {
  const msg = run(`mensagemPro({lista:'${lista}',cliente_nome:'Leandro',dados:{produto_ultima_compra:'Câmera VIP 1230'}},'Pedro')`);
  assert.ok(msg.includes('Câmera VIP 1230'));
  assert.ok(!/ofertas da semana|em estoque|retirar hoje/i.test(msg));
}
assert.ok(run(`mensagemPro({lista:'reativacao',cliente_nome:'Leandro',dados:{}},'Pedro')`).includes('retomando nosso contato'));

// Filtros e marcação distinguem contatos de pulos; pular não soma no progresso.
run(`PRO.hist=[]; PRO.chave=hoje()+'pedro'; PRO.dados=[
{id:1,cliente_chave:'c1',cliente_nome:'Pendente',lista:'reativacao',dados:{}},
{id:2,cliente_chave:'c2',cliente_nome:'Já contatado',lista:'recompra',resultado:'respondeu',resultado_em:'2026-10-24T10:00:00Z',dados:{}},
{id:3,cliente_chave:'c3',cliente_nome:'Cliente pulado',lista:'reativacao',resultado:'pular',dados:{}}];`);
let html = run('abaProspeccao()');
assert.ok(html.includes('1 de 3 contatos'));
assert.ok(html.includes('meta: 50 clientes'));
assert.ok(html.includes('Contato registrado'));
assert.ok(html.includes('Ainda não contatado'));
run(`UI.proFiltro='contatados';`);
html = run('abaProspeccao()');
assert.ok(html.includes('id="pro_2"'));
assert.ok(!html.includes('id="pro_1"') && !html.includes('id="pro_3"'));
run(`UI.proFiltro='pendentes';`);
html = run('abaProspeccao()');
assert.ok(html.includes('id="pro_1"') && !html.includes('id="pro_2"'));
run(`UI.proFiltro='pulados';`);
html = run('abaProspeccao()');
assert.ok(html.includes('id="pro_3"') && !html.includes('id="pro_2"'));
console.log('OK: ordem RMA, contatos/pendentes/pulados, acompanhamento sem mudar RFM e mensagens pela última compra.');
