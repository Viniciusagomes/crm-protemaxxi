// WhatsApp: etiquetas (lista fixa igual à do banco), filtro por etiqueta, aba Lembretes e aviso de lembrete vencido.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/atendimento.js'), 'utf8');
const ctx = vm.createContext({ console, Date, document: { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], hasFocus: () => true } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(src, ctx);
vm.runInContext("var EU = { id: 'pedro', permissoes: { atendimento: true } }; var ehDono = () => false; var nomeP = id => ({ pedro: 'Pedro Silva', ana: 'Ana Souza' })[id] || '—'; var UI = { view: 'outra' }; var avisos = []; avisar = m => avisos.push(m);", ctx);
const run = s => vm.runInContext(s, ctx);

// a lista do front é a mesma que o banco aceita
const mig = fs.readdirSync(path.join(root, 'supabase/migrations')).find(f => f.endsWith('_whatsapp_etiquetas_lembretes.sql'));
assert.ok(mig, 'migration das etiquetas existe');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations', mig), 'utf8');
const doBanco = sql.match(/ok text\[\] := array\[([^\]]+)\]/)[1].match(/'([a-z_]+)'/g).map(x => x.slice(1, -1)).sort();
assert.deepEqual(run('Object.keys(WA_ETIQ)').slice().sort(), doBanco, 'etiquetas iguais no front e no banco');
assert.match(sql, /revoke all on function public\.wa_etiquetas[^;]+from public, anon/);
assert.match(sql, /revoke all on function public\.wa_lembrete[^;]+from public, anon/);

const agora = Date.now(), h = n => new Date(agora + n * 3600e3).toISOString();
run(`WA.conv = [
  { id: 1, status: 'aberta', responsavel: 'pedro', ultima_msg_em: '${h(-1)}', etiquetas: ['orcamento'], lembrete_em: '${h(-0.5)}', lembrete_por: 'pedro', lembrete_txt: 'ligar' },
  { id: 2, status: 'aberta', responsavel: 'pedro', ultima_msg_em: '${h(-2)}', etiquetas: ['instalador', 'orcamento'], lembrete_em: '${h(3)}', lembrete_por: 'pedro' },
  { id: 3, status: 'aberta', responsavel: 'ana', ultima_msg_em: '${h(-3)}', etiquetas: [], lembrete_em: '${h(-1)}', lembrete_por: 'ana' },
  { id: 4, status: 'aberta', responsavel: 'pedro', ultima_msg_em: '${h(-4)}', etiquetas: ['fechou'] },
]; WA.busca = '';`);

// aba Lembretes: só os meus, o que vence primeiro no topo (o da Ana não aparece)
assert.deepEqual(run("waFiltro('lembretes').map(c => c.id)"), [1, 2]);
// filtro por etiqueta vale em qualquer aba
run("WA.etq = 'orcamento'"); assert.deepEqual(run("waFiltro('minhas').map(c => c.id)"), [1, 2]);
run("WA.etq = null"); assert.deepEqual(run("waFiltro('minhas').map(c => c.id)"), [1, 2, 4]);
// chips do filtro só com as etiquetas em uso, e a etiqueta desconhecida não aparece
const f = run('waEtqFiltroHtml()');
assert.match(f, /Orçamento/); assert.match(f, /Instalador/); assert.match(f, /Fechou/); assert.doesNotMatch(f, /Perdido/);
assert.equal(run("waEtiqHtml({ etiquetas: ['xyz'] })"), '');
// filtro que ficou sem conversa se desliga sozinho
run("WA.etq = 'perdido'; waEtqFiltroHtml()"); assert.equal(run('WA.etq'), null);

// lembrete vencido avisa uma vez só, e só para quem marcou
assert.deepEqual(run('waLembretesVencidos().map(c => c.id)'), [1]);
assert.deepEqual(run('waLembretesVencidos().map(c => c.id)'), []);
assert.match(run('avisos[0]'), /Lembrete: .*ligar/);

// ficha: etiquetas marcadas e botões de lembrete
const fx = run('waFichaExtraHtml(WA.conv[1])');
assert.match(fx, /data-wa="etq" data-id="2" data-e="instalador">Instalador/);
assert.match(fx, /class="wa-etq on"[^>]*data-e="orcamento"/);
assert.match(fx, /data-wa="lembApagar"/);
assert.doesNotMatch(run('waFichaExtraHtml(WA.conv[3])'), /lembApagar/);

const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(idx, /js\/atendimento\.js\?v=20261117p/);
console.log('✔ whatsapp-etiquetas.cjs');
