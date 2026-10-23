const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert/strict');
const repo=path.join(__dirname,'..');
const ctx=vm.createContext({console,Date, avisos:[],updates:[],document:{querySelector:()=>null}});
vm.runInContext(fs.readFileSync(path.join(repo,'js/util.js'),'utf8'),ctx);
vm.runInContext(`let D={config:{caixa_emails:{acessos:{marcos:['os']}}}}, EU={id:'marcos'}; const ehDono=()=>EU.id==='dono';
const render=()=>{}; avisar=t=>avisos.push(t); const dataHora=x=>x;
const sb={from:()=>({update:p=>{updates.push(p);return {eq:()=>({select:async()=>({data:[],error:null})})}}})};
const ok=async q=>{const r=await q;if(r.error)throw r.error;return r.data;};`,ctx);
vm.runInContext(fs.readFileSync(path.join(repo,'js/emails.js'),'utf8'),ctx);
vm.runInContext(`EM.lista=[
{id:1,caixa:'os_intelbras',direcao:'entrada',assunto:'OS ativa',recebido_em:'2026-10-23',arquivado:false},
{id:2,caixa:'os_intelbras',direcao:'entrada',assunto:'OS arquivada antiga',recebido_em:'2025-01-01',arquivado:true}
];EM.corpo={1:{texto:'ativa'},2:{texto:'arquivada'}}; EM.sel=1; EM.naoLidos=1;`,ctx);
const json=code=>JSON.parse(vm.runInContext('JSON.stringify('+code+')',ctx));
assert.deepEqual(json('emListaDaCaixa("arquivados").map(x=>x.id)'),[2]);
assert.deepEqual(json('emListaDaCaixa("todos").map(x=>x.id)'),[1]);
assert.deepEqual(json('emListaDaCaixa("os_intelbras").map(x=>x.id)'),[1]);
assert.ok(vm.runInContext('vEmails()',ctx).includes('Arquivados'));
assert.ok(!vm.runInContext('emLeitor()',ctx).includes('data-a="emArquivar"'));
(async()=>{
 await vm.runInContext('emArquivar(1)',ctx);
 assert.equal(ctx.updates.length,0);assert.equal(ctx.avisos.length,1);
 vm.runInContext(`EM.sel=2; EM.caixa='arquivados';`,ctx);
 assert.ok(vm.runInContext('vEmails()',ctx).includes('OS arquivada antiga'));
 await vm.runInContext('emAbrir(2)',ctx);
 assert.equal(json('EM.naoLidos'),1);
 vm.runInContext(`EU={id:'dono'}; EM.sel=2;`,ctx);
 assert.ok(vm.runInContext('emLeitor()',ctx).includes('Desarquivar'));
 await vm.runInContext('emArquivar(2)',ctx);
 assert.deepEqual(json('emListaDaCaixa("arquivados").map(x=>x.id)'),[]);
 assert.deepEqual(json('emListaDaCaixa("os_intelbras").map(x=>x.id)'),[1,2]);
 assert.equal(json('EM.naoLidos'),1);
 vm.runInContext('EM.sel=1;',ctx);
 assert.ok(vm.runInContext('emLeitor()',ctx).includes('>Arquivar</button>'));
 await vm.runInContext('emArquivar(1)',ctx);
 assert.equal(json('EM.naoLidos'),0);
 assert.deepEqual(json('emListaDaCaixa("arquivados").map(x=>x.id)'),[1]);
 const dados=fs.readFileSync(path.join(repo,'js/dados.js'),'utf8');
 vm.runInContext(dados.slice(dados.indexOf('async function todas('),dados.indexOf('// ─── papéis')),ctx);
 vm.runInContext(`globalThis.consultas=[]; sb.from=table=>{
   const state={table,arquivado:false,de:0,ate:999,gte:false}; consultas.push(state);
   const q={select:()=>q,eq:(key,value)=>{state.arquivado=value;return q},gte:()=>{state.gte=true;return q},
     order:()=>q,limit:()=>q,or:()=>q,range:(de,ate)=>{state.de=de;state.ate=ate;return q},
     then:(resolve,reject)=>Promise.resolve({data:table!=='emails'?[]:state.arquivado?
       Array.from({length:1001},(_,i)=>({id:i+10,arquivado:true,direcao:'entrada',caixa:'os_intelbras',recebido_em:'2025-01-01'})).slice(state.de,state.ate+1):
       [{id:1,arquivado:false,direcao:'entrada',caixa:'os_intelbras'}],error:null}).then(resolve,reject)};
   return q;
 };`,ctx);
 await vm.runInContext('carregarEmails(true)',ctx);
 assert.equal(json('emListaDaCaixa("arquivados").length'),1001);
 assert.equal(json('consultas.filter(x=>x.table==="emails" && x.arquivado && !x.gte).length'),2);
 assert.equal(json('emListaDaCaixa("todos").length'),1);
 console.log('OK: lista de arquivados, Marcos sem ação, dono restaura/arquiva e contagem de não lidos preservada.');
})().catch(e=>{console.error(e);process.exitCode=1;});
