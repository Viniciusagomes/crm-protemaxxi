// Campanha de prospecção: leads da landing page (lista "site") aparecem com telefone, botão de WhatsApp e mensagem própria.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(html, /js\/carteira\.js\?v=\d{8}[a-z]/, 'cache do carteira.js versionado');

const src = fs.readFileSync(path.join(root, 'js/carteira.js'), 'utf8');
assert.match(src, /site: \['🌐 Lead do site', 'azul'\]/, 'rótulo da lista');
assert.match(src, /fone = c\.fone \|\| \(x\.lista === 'site' \? foneFmt\(x\.dados\?\.fone \|\| ''\) : ''\)/, 'telefone do lead vem dos dados');
assert.match(src, /x\.lista === 'site' && !cli\[x\.cliente_chave\]/, 'lead sem cadastro não abre ficha de cliente');

// mensagem pronta
const pega = (ini, fim) => { const i = src.indexOf(ini); assert.ok(i >= 0, ini); return src.slice(i, src.indexOf(fim, i)); };
const codigo = [pega('const nomeCurtoCli', '\n/** Tempo natural'), pega('function tempoCompra', '\n/** Mensagem pronta'), pega('function mensagemPro', '\nfunction abaProspeccao')].join('\n');
const ctx = { hoje: () => '2026-11-16', ds: d => d, pd: d => d };
vm.createContext(ctx);
vm.runInContext(codigo + '\nthis.mensagemPro = mensagemPro;', ctx);
const m1 = ctx.mensagemPro({ id: 1, lista: 'site', cliente_nome: 'Clarinez', dados: { interesse: 'Cerca elétrica' } }, 'Pedro');
assert.equal(m1, 'Olá, Clarinez! Aqui é Pedro, da Protemaxxi. Vi que você deixou seu contato no nosso site com interesse em cerca elétrica. Posso te ajudar com um orçamento? Me conta um pouco do que você precisa.');
const m2 = ctx.mensagemPro({ id: 2, lista: 'site', cliente_nome: '', dados: {} }, 'Pedro');
assert.match(m2, /^Olá, tudo bem\? Aqui é Pedro, da Protemaxxi\. Vi que você deixou seu contato no nosso site\. Posso/);

console.log('leads-site: ok');
