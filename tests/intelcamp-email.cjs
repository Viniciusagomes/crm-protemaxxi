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
// OS achada, mas sem o envio à assistência registrado: mostra a OS e pede para registrar
vm.runInContext(`EM.lista.push({id:178,caixa:'os_intelbras',direcao:'entrada',processado:[{tipo:'os',fonte:'intelcamp',certeza:'sem_rma',por:'terceiros',intelcamp:{os:'102338',total:220},os:[{id:179,numero:'T944',cliente:'MS',rma_id:null}]}]});`,ctx);
const semRma=vm.runInContext('emLido(EM.lista[2], true)',ctx);
assert.ok(semRma.includes('OS T944') && semRma.includes('envio não registrado') && semRma.includes('Registre o envio'));
assert.ok(semRma.includes('orçamento de') && semRma.includes('220'));
assert.ok(!semRma.includes('emOsConfirmar'));
// orçamento ignorado (OS já aprovada)
assert.ok(vm.runInContext(`emLido({processado:[{tipo:'os',fonte:'intelcamp',certeza:'certa',intelcamp:{os:'1'},os:[{id:1,numero:'T1'}],orcamento:{ignorado:true,motivo:'OS já aprovada na assistência',custo:180}}]})`,ctx).includes('não lançado: OS já aprovada'));
(async()=>{
 // imagem do corpo que vem como anexo (Mlogo.jpg / cid:) vira link assinado; link externo fica como está
 vm.runInContext(`sb.storage={from:()=>({createSignedUrl:async c=>({data:{signedUrl:'https://x/'+c+'?t=1'}})})};`,ctx);
 const html=await vm.runInContext(`emImagensAnexas('<img width=238 src="Mlogo.jpg"><img src="cid:foto.png@01D"><img src="https://site/a.png">',[{nome:'Mlogo.jpg',tipo:'image/jpeg',caminho:'178/1-Mlogo.jpg'},{nome:'foto.png',tipo:'image/png',caminho:'178/2-foto.png'},{nome:'nota.pdf',tipo:'application/pdf',caminho:'178/3.pdf'}])`,ctx);
 assert.ok(html.includes('src="https://x/178/1-Mlogo.jpg?t=1"'),html);
 assert.ok(html.includes('src="https://x/178/2-foto.png?t=1"'),html);
 assert.ok(html.includes('src="https://site/a.png"'));
 assert.equal(await vm.runInContext(`emImagensAnexas('<p>oi</p>',[])`,ctx),'<p>oi</p>');
 await vm.runInContext('emOsConfirmar("6","8")',ctx);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.chamadas)),[{nome:'email-entrada',body:{acao:'reler',email_id:6,rma_id:8}}]);
 assert.equal(vm.runInContext('EM.lista[1].processado[0].certeza',ctx),'certa');
 assert.ok(ctx.avisos[0].includes('T925'));
 console.log('OK: e-mail da Intelcamp mostra OS, status e rascunho; prováveis pedem confirmação e relêem pela função.');
})().catch(e=>{console.error(e);process.exitCode=1;});
