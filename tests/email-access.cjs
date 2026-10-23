const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert/strict');
const repo=path.join(__dirname,'..');
async function scenario(mailConfig,person){
  const tables={pessoas:[{id:person,user_id:'test-user',nome:person,cargo:'Suporte',papel:person==='dono'?'dono':'supervisor',ativo:true,permissoes:person==='marcos'?{suporte:true}:{} }],config:mailConfig?[{chave:'caixa_emails',valor:mailConfig}]:[]};
  const client={from:table=>{const q={then:(resolve,reject)=>Promise.resolve({data:tables[table]||[],error:null}).then(resolve,reject)};for(const method of ['select','order','gte','range'])q[method]=()=>q;return q;},auth:{getUser:async()=>({data:{user:{id:'test-user'}}})}};
  const ctx=vm.createContext({console,Date,Set,Map,window:{addEventListener:()=>{},CRM_CONFIG:{url:'local',anonKey:'local'},supabase:{createClient:()=>client}},localStorage:{getItem:()=>null,setItem:()=>{}},document:{querySelector:()=>null}});
  for(const file of ['util.js','dados.js','emails.js'])vm.runInContext(fs.readFileSync(path.join(repo,'js',file),'utf8'),ctx,{filename:file});
  vm.runInContext('carregarPedidos=async()=>{}; carregarBonif=async()=>{}; globalThis.carregarSolicitacoes=async()=>{};globalThis.carregarInteracoes=async()=>{};',ctx);
  await vm.runInContext('carregarTudo()',ctx);
  const main=fs.readFileSync(path.join(repo,'js/main.js'),'utf8');
  const start=main.indexOf('function abasDoPerfil()');
  const end=main.indexOf('function render()',start);
  vm.runInContext('globalThis.veML=()=>false;globalThis.veTrafego=()=>false;globalThis.veExp=()=>false;globalThis.veCompras=()=>false;globalThis.veMonitoria=()=>false;'+main.slice(start,end),ctx);
  return JSON.parse(vm.runInContext('JSON.stringify({menu:veEmails(),route:podeAba("emails"),boxes:emCaixasMinhas(),config:D.config.caixa_emails})',ctx));
}
(async()=>{
  const before=await scenario(null,'marcos');
  const marcos=await scenario({acessos:{marcos:['os']}},'marcos');
  const other=await scenario({acessos:{marcos:['os']}},'outro');
  const owner=await scenario({acessos:{marcos:['os']}},'dono');
  assert.equal(before.menu,false);assert.equal(before.route,false);
  assert.equal(marcos.menu,true);assert.equal(marcos.route,true);assert.deepEqual(marcos.boxes,['todos','os_intelbras']);
  assert.equal(other.menu,false);assert.equal(other.route,false);
  assert.equal(owner.menu,true);assert.ok(owner.boxes.includes('boletos'));
  console.log(JSON.stringify({passed:true,marcos,other_user:other,owner_access_preserved:owner.menu,missing_config_denies_access:!before.menu},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
