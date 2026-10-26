// E-mail da Intelcamp na Caixa de e-mails: OS deles, status, nossa OS (certa/provável), rascunho e o botão "É a OS".
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert/strict');
const repo=path.join(__dirname,'..');
const ctx=vm.createContext({console,Date,avisos:[],chamadas:[],document:{querySelector:()=>null}});
vm.runInContext(fs.readFileSync(path.join(repo,'js/util.js'),'utf8'),ctx);
vm.runInContext(`let D={config:{}}, EU={id:'dono'}; const ehDono=()=>true; const render=()=>{}; avisar=t=>avisos.push(t); const dataHora=x=>x;
const sb={functions:{invoke:async(nome,{body})=>{chamadas.push({nome,body});return {data:{ok:true,lido:{tipo:'os',fonte:'intelcamp',certeza:'certa',os:[{id:158,numero:'T925',rma_id:8}],etapa_mudou:true,intelcamp:{os:'101345'}}},error:null};}}};`,ctx);
vm.runInContext(fs.readFileSync(path.join(repo,'js/emails.js'),'utf8'),ctx);
vm.runInContext(`EM.lista=[
 {id:5,caixa:'os_intelbras',direcao:'entrada',processado:[{tipo:'os',fonte:'intelcamp',certeza:'certa',intelcamp:{os:'101201',modelo:'MHDX 1008',serie:'J2AG11013817Q'},os:[{id:19,numero:'T923',cliente:'LR',rma_id:4}],orcamento:{id:2,novo:true,custo:390,valor:624}}]},
 {id:6,caixa:'os_intelbras',direcao:'entrada',processado:[{tipo:'os',fonte:'intelcamp',certeza:'provavel',intelcamp:{os:'101345',serie:'YQ8H390141291',status:'AGUARDANDO AVALIAÇÃO DO TÉCNICO'},os:[{id:158,numero:'T925',cliente:'JH',rma_id:8,serie:'NS: YQBH390141291'}]}]}];`,ctx);
const certo=vm.runInContext('emLido(EM.lista[0], true)',ctx);
assert.ok(certo.includes('Intelcamp OS 101201'));
assert.ok(certo.includes('Rascunho') && certo.includes('624'));
assert.ok(!certo.includes('emOsConfirmar'));
const provavel=vm.runInContext('emLido(EM.lista[1], true)',ctx);
assert.ok(provavel.includes('(provável)') && provavel.includes('AGUARDANDO AVALIAÇÃO'));
assert.ok(provavel.includes('data-a="emOsConfirmar" data-id="6" data-r="8"'));
assert.ok(!vm.runInContext('emLido(EM.lista[1], false)',ctx).includes('emOsConfirmar'));
(async()=>{
 await vm.runInContext('emOsConfirmar("6","8")',ctx);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.chamadas)),[{nome:'email-entrada',body:{acao:'reler',email_id:6,rma_id:8}}]);
 assert.equal(vm.runInContext('EM.lista[1].processado[0].certeza',ctx),'certa');
 assert.ok(ctx.avisos[0].includes('T925'));
 console.log('OK: e-mail da Intelcamp mostra OS, status e rascunho; prováveis pedem confirmação e relêem pela função.');
})().catch(e=>{console.error(e);process.exitCode=1;});
