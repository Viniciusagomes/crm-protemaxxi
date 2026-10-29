// Lote 3 · entrega A: fila de cadastros parecidos e a conferência registrada (sem fundir cadastros).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console, document: { querySelector: () => null, addEventListener: () => {}, getElementById: () => null } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(`
let D={config:{prospeccao:{por_dia:50},feriados:[]},clientes:[],interacoes:[],pedidos:[],pessoas:[{id:'pedro',nome:'Pedro',ativo:true,tiny:'1'}]},
UI={},EU={id:'pedro'};
const pessoasQueVejo=()=>['pedro'],pessoa=id=>D.pessoas.find(x=>x.id===id),ehDono=()=>false,nomeP=id=>pessoa(id)?.nome||id;
const seloCredito=()=>'',nomeVendedor=()=>'',corVendedor=()=>'',valido=()=>true,render=()=>{};
let rpcs=[]; const sb={rpc:(f,a)=>{rpcs.push([f,a]);return Promise.resolve({data:{},error:null});}};
let avisos=[]; avisar=m=>avisos.push(m);
`, ctx);
for (const file of ['clientes.js', 'agenda.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), ctx, { filename: file });
const run = code => vm.runInContext(code, ctx);

const lado = (chave, nome, doc) => ({ chave, nome, doc, cidade: 'Campinas', uf: 'SP', pedidos: 2, total12m: 900, ultima: '2026-10-01', vendedor: 'Pedro', telefones: ['5519999990000'], negocios: 0 });
run(`UI.parStatus='pendente'; PARES.status='pendente'; PARES.lista=${JSON.stringify([
  { a: lado('111', 'Ana Silva', '11111111111'), b: lado('n:ana silva', 'Ana Silva', null), motivos: ['mesmo nome (um sem CPF/CNPJ)', 'telefone 5519999990000'], forca: 3, ativos: 2, status: 'pendente', pode_decidir: true },
  { a: lado('222', 'Bruno', '22222222222'), b: lado('333', 'Carla', '33333333333'), motivos: ['telefone 5519988887777'], forca: 2, ativos: 1, status: 'pendente', pode_decidir: false },
])};`);
const html = run('abaPares()');
assert.ok(html.includes('sem CPF/CNPJ') && html.includes('os dois têm movimento'));
assert.ok(html.includes('telefone (19) 99999-0000'), 'telefone do motivo formatado');
assert.equal((html.match(/data-a="parDecidir"/g) || []).length, 3, 'só o par com acesso aos dois tem os botões');
assert.ok(html.includes('é preciso ter acesso aos dois cadastros'));

// "Precisa conferir" exige observação e não chama o banco sem ela.
run(`parDecidir('111','n:ana silva','conferir')`);
assert.equal(run('rpcs.length'), 0);
assert.match(run('avisos[0]'), /o que precisa ser conferido/);

console.log('OK: cadastros parecidos (fila, motivos, permissão e conferência).');
