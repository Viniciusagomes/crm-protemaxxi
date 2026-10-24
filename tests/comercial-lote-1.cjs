const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, 'js', f), 'utf8');
const FixedDate = class extends Date {
  constructor(...a) { super(...(a.length ? a : ['2026-10-24T12:00:00Z'])); }
  static now() { return new Date('2026-10-24T12:00:00Z').getTime(); }
};
const elements = {};
const context = vm.createContext({ console, Date: FixedDate,
  document: { querySelector: s => elements[s] || null, addEventListener() {} },
  window: { open: (...args) => { context.opened = args; } },
  location: { origin: 'https://example.test', pathname: '/index.html' }, confirm: () => true,
});
vm.runInContext(source('util.js'), context);
vm.runInContext(`
let D={clientes:[],pedidos:[],interacoes:[],pessoas:[],config:{}},UI={},EU={id:'pedro',tiny:'1'};
const pessoasQueVejo=()=>['pedro','marcos'],ehDono=()=>false;
let renders=0;function render(){renders++;} function avisar(t){globalThis.aviso=t;}
function fecharModal(){globalThis.fechou=true;} function modal(t){globalThis.form=t;}
const ok=async q=>{const r=await q;if(r.error)throw Error(r.error.message);return r.data;};
const todas=async f=>ok(f());
let rpcFailure=false,rpcCalls=0,summaryCalls=0;
let sb={rpc:async(n,args)=>{rpcCalls++;if(rpcFailure)return {error:{message:'Falha simulada'}};
return {data:{prospeccao:{...PRO.dados[0],resultado:args.p_resultado,interacao_id:41},interacao:{id:41,proximo_contato:'2026-10-26'}}};},
from:()=>({select(){return this},eq(){return this},order(){return Promise.resolve({data:[{id:1,pessoa_id:'pedro',resultado:'pular'},{id:2,pessoa_id:'pedro',resultado:'respondeu'},{id:3,pessoa_id:'pedro',resultado:null}]})}})};
`, context);
for (const f of ['carteira.js','crm.js','avaliacoes.js']) vm.runInContext(source(f), context, { filename: f });
const run = c => vm.runInContext(c, context);
const json = c => JSON.parse(run(`JSON.stringify(${c})`));

async function main() {
  // Fronteiras, dados inválidos e data futura não produzem idade inventada.
  const tempos = [[0,'hoje'],[1,'ontem'],[2,'há alguns dias'],[13,'há alguns dias'],[14,'há algumas semanas'],[44,'há algumas semanas'],[45,'há alguns meses'],[243,'há alguns meses'],[329,'há alguns meses'],[330,'há cerca de um ano'],[549,'há cerca de um ano'],[550,'há mais de um ano'],[729,'há mais de um ano'],[730,'há alguns anos']];
  for (const [dias, esperado] of tempos) assert.equal(run(`tempoCompra(addDias(hoje(),-${dias}))`), esperado);
  for (const data of [null,'','2026-02-30','não é data','2026-10-25']) assert.equal(run(`tempoCompra(${JSON.stringify(data)})`), '');
  for (const lista of ['complemento','recompra','reativacao','indicacao','instalador']) {
    const m = run(`mensagemPro({lista:'${lista}',cliente_nome:'Leandro',dados:{ultima_compra:addDias(hoje(),-243),produto_ultima_compra:'Câmera VIP 1230'}},'Pedro')`);
    assert.ok(m.includes('Câmera VIP 1230') && m.includes('há alguns meses'));
    assert.doesNotMatch(m,/243|oferta da semana|em estoque|Já tem|ainda não|cobrar/i);
  }
  assert.doesNotMatch(run(`mensagemPro({lista:'reativacao',dados:{}},'Pedro')`), /comprou|há alguns/);
  assert.doesNotMatch(run(`mensagemPro({lista:'complemento',dados:{produto:'Produto antigo',ultima_compra:'2026-10-24'}},'Pedro')`), /hoje/);
  assert.ok(run(`mensagemPro({lista:'recompra',dados:{produto_ultima_compra:'Cabo',ultima_compra:'2023-10-01'}},'Pedro')`).includes('há alguns anos'));

  // Meu dia e Supervisão buscam o resumo independentemente da abertura de Prospecção.
  assert.equal(run('PRO.dados'), null);
  await run('carregarResumoPro()');
  assert.deepEqual(json(`campanhaHoje('pedro')`), {total:3,contatos:1,pulados:1,pendentes:1});
  assert.equal(run('PRO.dados'), null);
  assert.deepEqual(json(`campanhaHoje('marcos')`), {total:0,contatos:0,pulados:0,pendentes:0});
  run(`PRO.resumoErro=true`); assert.equal(run(`campanhaHoje('pedro')`), null); run(`PRO.resumoErro=false`);

  // Uma falha de RPC não muda o resultado local, o histórico nem o progresso.
  run(`PRO.dados=[{id:2,pessoa_id:'pedro',resultado:null,cliente_chave:'c'}];PRO.hist=[];rpcFailure=true;`);
  await assert.rejects(run(`proRes('2','orcamento')`), /Falha simulada/);
  assert.equal(run('PRO.dados[0].resultado'), null); assert.equal(run('D.interacoes.length'),0);
  assert.equal(run('PRO.gravando.size'),0);
  run(`rpcFailure=false`);
  await run(`proRes('2','orcamento')`);
  assert.equal(run('D.interacoes.length'),1); assert.equal(run(`campanhaHoje('pedro').contatos`),1);
  // Duplo clique não envia duas gravações concorrentes.
  run(`rpcCalls=0`);
  await Promise.all([run(`proRes('2','respondeu')`),run(`proRes('2','respondeu')`)]);
  assert.equal(run('rpcCalls'),1); assert.equal(run('D.interacoes.length'),1);

  // Só cobranças ambíguas vão para revisão; pós-venda e tarefas válidas continuam.
  run(`CRM.neg=[{id:1,etapa:'ganho'},{id:2,etapa:'orcamento'}];`);
  const a = {negocio_id:1,feito:false,tipo:'followup'};
  assert.equal(run(`atvRevisar(${JSON.stringify(a)})`),true);
  assert.equal(run(`atvPendente(${JSON.stringify(a)})`),false);
  assert.equal(run(`atvPendente(${JSON.stringify({...a,revisada_em:'2026-10-24'})})`),true);
  assert.equal(run(`atvPendente(${JSON.stringify({...a,tipo:'posvenda'})})`),true);
  assert.equal(run(`atvPendente(${JSON.stringify({...a,arquivada_em:'2026-10-24'})})`),false);
  run(`CRM.atv=[{id:20,negocio_id:2,feito:false,titulo:'Contato'}]`);
  await run(`atvFeita('20')`);
  assert.ok(context.form.includes('Concluir e agendar retorno') && context.form.includes('Concluir sem novo retorno'));
  assert.equal(run('CRM.atv[0].feito'),false);
  elements['#acData']={value:'2026-10-26'}; elements['#acTitulo']={value:'Rever cotação'};
  elements['#acTipo']={value:'followup'}; elements['#acResultado']={value:'Pediu retorno'};
  run(`rpcFailure=true`);
  await assert.rejects(run(`atvConcluir('20',true)`),/Falha simulada/);
  assert.equal(run('CRM.atv[0].feito'),false); assert.equal(run('CRM.atv.length'),1);
  run(`CRM.revisoes=[{negocio_id:2,inativo:true}]; sb.rpc=async()=>({data:{atividade:{id:20,negocio_id:2,feito:true},proxima:{id:21,negocio_id:2,feito:false},interacao:{id:42}}});`);
  await run(`atvConcluir('20',true)`);
  assert.equal(run('CRM.atv[0].feito'),true); assert.equal(run('CRM.atv.length'),2);
  assert.equal(run('CRM.revisoes[0].inativo'),false);

  // Preparar WhatsApp mantém status pendente; só confirmação manual registra envio.
  const writes=[];
  context.writes=writes;
  run(`AVA.lista=[{id:1,canal:'whatsapp',status:'pendente',fone:'19999999999',token:'abc',cliente_nome:'Leandro'}];
  function linkWa(){return 'https://wa.me/5519999999999';}
  sb.from=()=>({patch:null,update(v){this.patch=v;return this;},eq(){return this;},select(){return this;},single(){writes.push(this.patch);return Promise.resolve({data:{...AVA.lista[0],...this.patch}})}});`);
  await run('avaWa(1)');
  assert.equal(writes[0].status, undefined); assert.ok(writes[0].preparado_em);
  assert.equal(run('AVA.lista[0].status'),'pendente'); assert.equal(run('AVA.lista[0].enviado_em'),undefined);
  await run('avaConfirmar(1)'); assert.equal(run('AVA.lista[0].status'),'enviado');

  await testarAvaliacoes();
  console.log('OK: linguagem natural, resumo independente, falhas atômicas no cliente, duplo clique, revisão de atividades, WhatsApp preparado e Google para todas as notas.');
}

async function testarAvaliacoes() {
  for (let nota=1;nota<=5;nota++) {
    const nodes={},calls=[];
    const get=id=>nodes[id] ||= {innerHTML:'',value:'Meu relato',focus(){},querySelectorAll(){return []}};
    const c=vm.createContext({console,URLSearchParams,alert:message=>{throw Error(message)},location:{search:'?t=abcdef1234567890abcdef12',href:''},
      document:{getElementById:get},window:{CRM_CONFIG:{},supabase:{createClient:()=>({rpc:async(name,args)=>{
        calls.push({name,args});return {data:name==='avaliacao_ver'?{google:'https://example.test/review',cliente:'Teste'}:true};
      }})}}});
    await vm.runInContext(source('avaliar.js'),c);
    // Os botões de estrelas são capturados sem construir uma árvore DOM artificial.
    const buttons=[1,2,3,4,5].map(n=>({dataset:{n:String(n)}}));
    get('caixa').querySelectorAll=()=>buttons;
    // Recarrega a página para ligar os botões ao DOM de teste.
    await vm.runInContext(source('avaliar.js'),c);
    await buttons[nota-1].onclick();
    assert.ok(get('resto').innerHTML.includes('Avaliar também no Google'),`Google disponível para nota ${nota}`);
    assert.equal(c.location.href,'');
    assert.ok(!calls.some(x=>x.args?.p_google));
    await get('btnGoogle').onclick();
    assert.ok(calls.some(x=>x.args?.p_google && x.args.p_nota===nota));
    await get('btnEnviar').onclick();
    assert.ok(calls.some(x=>x.args?.p_comentario==='Meu relato'));
    assert.ok(get('resto').innerHTML.includes('Avaliar também no Google'));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
