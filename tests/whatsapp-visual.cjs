// WhatsApp (tela parecida com o app): tempo de espera, aba "Esperando", respostas com variáveis, separador de dia e bolhas.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console, Date, document: { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], hasFocus: () => true } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/atendimento.js'), 'utf8'), ctx);
vm.runInContext("var EU = { id: 'pedro', permissoes: { atendimento: true } }; var ehDono = () => false; var nomeP = id => ({ pedro: 'Pedro Silva' })[id] || '—'; var UI = { view: 'atendimento' };", ctx);
const run = s => vm.runInContext(s, ctx);
const agora = Date.parse('2026-11-17T15:00:00Z'); ctx.T = agora;
const iso = min => new Date(agora - min * 60e3).toISOString();

// espera: só quando a última mensagem é do cliente e a conversa está aberta
ctx.c1 = { status: 'aberta', ultima_entrada_em: iso(20), ultima_msg_em: iso(20) };
ctx.c2 = { status: 'aberta', ultima_entrada_em: iso(20), ultima_msg_em: iso(5) };
ctx.c3 = { status: 'encerrada', ultima_entrada_em: iso(20), ultima_msg_em: iso(20) };
assert.equal(run('waEsperaMin(c1, T)'), 20);
assert.equal(run('waEsperaMin(c2, T)'), null, 'já respondida');
assert.equal(run('waEsperaMin(c3, T)'), null, 'encerrada');
assert.equal(run('waEsperaCls(3)'), 'ok'); assert.equal(run('waEsperaCls(7)'), 'med'); assert.equal(run('waEsperaCls(30)'), 'ruim');
assert.equal(run('waEsperaTxt(12)'), '12 min'); assert.equal(run('waEsperaTxt(130)'), '2 h'); assert.equal(run('waEsperaTxt(3000)'), '2 d');

ctx.Date = class extends Date { constructor(...a) { super(...(a.length ? a : [agora])); } static now() { return agora; } };
run('Date = this.Date');
// aba "Esperando": minhas e sem dono, a mais recente primeiro; de outro vendedor não entra
run(`WA.conv = [
  { id: 1, wa_id: '5519', status: 'aberta', responsavel: 'pedro', ultima_entrada_em: '${iso(5)}', ultima_msg_em: '${iso(5)}' },
  { id: 2, wa_id: '5518', status: 'aberta', responsavel: null, ultima_entrada_em: '${iso(50)}', ultima_msg_em: '${iso(50)}' },
  { id: 3, wa_id: '5517', status: 'aberta', responsavel: 'felipe', ultima_entrada_em: '${iso(90)}', ultima_msg_em: '${iso(90)}' },
  { id: 4, wa_id: '5516', status: 'aberta', responsavel: 'pedro', ultima_entrada_em: '${iso(90)}', ultima_msg_em: '${iso(1)}' }];`);
assert.deepEqual(run("waFiltro('esperando').map(c => c.id)"), [1, 2]);
assert.deepEqual(run("waFiltro('equipe').map(c => c.id)"), [4, 1, 2, 3], 'todas as abas: mais recente primeiro');
assert.match(run('waAbasHtml()'), /Esperando<span>2<\/span>/);

// variáveis das respostas prontas
assert.equal(run("waVariaveis('{saudacao}, {nome}! Aqui é o {vendedor}.', { nome_perfil: 'joão carlos' })").replace(/^(Bom dia|Boa tarde|Boa noite)/, 'X'), 'X, João! Aqui é o Pedro.');
assert.equal(run("waVariaveis('Oi {nome}!', {})"), 'Oi!', 'sem nome não sobra espaço');
assert.equal(run('waSaudacao(9)'), 'Bom dia'); assert.equal(run('waSaudacao(14)'), 'Boa tarde'); assert.equal(run('waSaudacao(20)'), 'Boa noite');
run("WA.resp = [{ id: 1, atalho: 'saudação', texto: 'Olá' }, { id: 2, atalho: 'orçamento', texto: 'Segue o orçamento' }]");
assert.deepEqual(run("waSugestoes('orç').map(r => r.id)"), [2]);
assert.equal(run('WA_PACOTE.length'), 7);

// separador de dia
assert.equal(run("waDiaRot('2026-11-17T12:00:00', new Date('2026-11-17T18:00:00'))"), 'Hoje');
assert.equal(run("waDiaRot('2026-11-16T12:00:00', new Date('2026-11-17T18:00:00'))"), 'Ontem');
assert.equal(run("waDiaRot('2026-10-01T12:00:00', new Date('2026-11-17T18:00:00'))"), '1 de outubro');

// bolha: escapa HTML, mostra citação, tique azul de lida e quem enviou
ctx.lista = [{ wa_msg_id: 'a', direcao: 'entrada', texto: 'Quanto custa?', tipo: 'text' }];
const h = run("waMsgHtml({ direcao: 'saida', texto: '<b>oi</b> *R$ 10*', em: '2026-11-17T12:00:00Z', status: 'lida', por: 'pedro', resposta_a: 'a' }, lista)");
assert.match(h, /&lt;b&gt;oi&lt;\/b&gt; <b>R\$ 10<\/b>/, 'escapa e aplica negrito do WhatsApp');
assert.match(h, /wa-cit entrada[\s\S]*Quanto custa\?/); assert.match(h, /wa-tk lida/); assert.match(h, /Pedro Silva - Vendas/);
assert.match(run("waMsgHtml({ direcao: 'nota', tipo: 'nota', texto: 'ligar amanhã', por: 'pedro', em: '2026-11-17T12:00:00Z' })"), /Nota de Pedro/);
assert.match(run("waIniciais('Ricardo Ferreira De Oliveira')"), /^RO$/);

// cache novo no index
assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /css\/app\.css\?v=\d{8}[a-z]/);
console.log('ok whatsapp visual');
