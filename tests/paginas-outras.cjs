// Outras páginas (18/11): Créditos, Brindes, E-mails, Tráfego e Calendário no padrão novo.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..'), ler = f => fs.readFileSync(path.join(root, f), 'utf8');
const cre = ler('js/creditos.js'), em = ler('js/emails.js'), tr = ler('js/trafego.js'), cal = ler('js/calendario.js'), pain = ler('js/painel.js'), css = ler('css/app.css');

assert.match(cre, /painKpi\('Crédito em aberto'/); assert.match(cre, /<h2>Maiores saldos<\/h2>/); assert.match(cre, /<summary><b>Como funciona<\/b>/);
assert.match(cre, /painKpi\('Custo no mês'/, 'brindes com números'); assert.match(cre, /painKpi\('Estoque baixo'/);
assert.match(em, /`<div class="subabas">\$\{chips\}<\/div>/, 'caixas de e-mail como sub-abas'); assert.match(em, /painKpi\('Sem nota ligada'/);
assert.match(tr, /const abas = `<div class="subabas">/, 'abas do Tráfego no padrão novo');
assert.match(tr, /painKpi\('Gasto', R\(a\.c\), trDelta\(a\.c, b\.c, false\), painSpark\(serie\('custo'\)\)/, 'gasto com linha');
assert.match(tr, /<div class="tr-barras">/); assert.doesNotMatch(tr, /background:\$\{cv > 0 \? '#2e9e6b'/, 'barras sem estilo solto');
assert.match(cal, /topo\('Calendário de marketing',/, 'título sem emoji'); assert.match(cal, /<h2>Por canal<\/h2>/);
assert.match(css, /\.subabas\.sec \{/, 'sub-abas internas (Configurações) diferentes das do grupo');

// barras com cor: só aceita #hex (a cor vem de constante, mas o filtro barra qualquer outra coisa)
const ctx = vm.createContext({});
vm.runInContext(ler('js/util.js').split('\n// ─── Emoji da interface')[0], ctx);
vm.runInContext(pain.slice(pain.indexOf('function painDist'), pain.indexOf('/** Checklist médio')), ctx);
const html = vm.runInContext(`painDist([{ rot: 'Instagram', v: 3, cor: '#C13584' }, { rot: 'X', v: 1, cor: 'red;x:expression(1)' }])`, ctx);
assert.match(html, /width:100%;background:#C13584"/); assert.doesNotMatch(html, /expression/);
console.log('✔ paginas-outras.cjs');
