// E-mail da Intelcamp → nossa OS (25/11): "Nº OS Terceiros" é o número da nossa OS; vazio, não pega a linha seguinte;
// série contida (loja digitou "NS: YQ8K500(*)50779NS:") bate; dois RMAs abertos da mesma OS viram um.
// Roda o código da função email-entrada (TypeScript) sem o Deno: recorta o trecho puro e tira as anotações de tipo.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const src = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/email-entrada/index.ts'), 'utf8');
const { stripTypeScriptTypes } = require('node:module');
const trecho = stripTypeScriptTypes(src.slice(src.indexOf('const ENT:'), src.indexOf('/** Acha a nossa OS')));
const ctx = vm.createContext({});
vm.runInContext(trecho + '\nthis.lerSHOficina = lerSHOficina; this.serieBate = serieBate; this.umPorOS = umPorOS; this.htmlTexto = htmlTexto;', ctx);

const status = (terceiros, serie) => ctx.htmlTexto(`<p>OS: 102118</p><p>Aparelho: CAMERA MIBO</p><p>Modelo: IMX C</p><p>Nº de Série: ${serie}</p><p>Nº OS Terceiros: ${terceiros}</p>
  <p>: PROTEMAXXI, este &eacute; um aviso de que voc&ecirc; tem uma OS conosco que se encontra no status: AGUARDANDO AVALIAÇÃO DO TÉCNICO Para consultar</p>`);
let l = ctx.lerSHOficina(status('941', '*'), 'Notificação de status da OS 102118');
assert.equal(l.os, '102118'); assert.equal(l.terceiros, '941'); assert.equal(l.status, 'AGUARDANDO AVALIAÇÃO DO TÉCNICO');
// campo vazio: antes vinha ":" ou "Acessórios: SEM HD E FONTE"
assert.equal(ctx.lerSHOficina(ctx.htmlTexto('<td>Nº OS Terceiros</td><td></td><td>Acessórios: SEM HD E FONTE</td>'), 'Orçamento Nº101762').terceiros, null);
assert.equal(ctx.lerSHOficina(status('', 'X'), 'Notificação de status da OS 1').terceiros, null);
assert.equal(ctx.lerSHOficina(status('S/N', 'X'), 'Notificação de status da OS 1').terceiros, null);
assert.equal(ctx.lerSHOficina(status('T942', 'X'), 'Notificação de status da OS 1').terceiros, '942');

// orçamento do SHOficina (tabela): OS deles, série, total e item
l = ctx.lerSHOficina(ctx.htmlTexto(`<table><tr><td>Ordem de serviço 102338</td></tr><tr><td>Nº de Série</td><td><i>M7RM0301982Z6</i></td></tr>
  <tr><td>Nº OS Terceiros</td><td><i>944</i></td></tr><tr><td>Valores do Orçamento</td></tr><tr><td>Serviços a executar</td><td>Horas</td><td>Valor</td></tr>
  <tr><td>Troca da placa principal</td><td>1,00x</td><td>R$ 220,00</td></tr><tr><td>Totais</td></tr><tr><td>TOTAL</td><td>R$ 220,00</td></tr></table>`), 'Orçamento Nº102338');
assert.equal(l.os, '102338'); assert.equal(l.serie_norm, 'M7RM0301982Z6'); assert.equal(l.terceiros, '944');
assert.equal(l.total, 220); assert.equal(l.orcamento, true); assert.equal(l.itens[0].custo, 220); assert.match(l.itens[0].descricao, /Troca da placa/);

// série
assert.equal(ctx.serieBate('YQ8K50050779NS', 'YQ8K50050779'), true, 'série contida, 10+ caracteres');
assert.equal(ctx.serieBate('DIR0008561356', 'DIR0008561356'), true);
assert.equal(ctx.serieBate('592', '59'), false, 'curta não vale por contida');
assert.equal(ctx.serieBate('ABC123456789', 'ABC123456780'), false);

// RMAs da mesma OS
const r17 = { id: 17, os_id: 164, os_assistencia: '101762' }, r26 = { id: 26, os_id: 164, os_assistencia: null };
assert.equal(JSON.stringify(ctx.umPorOS([r26, r17], '101762').map(r => r.id)), "[17]", 'fica o ligado a esta OS da assistência');
assert.equal(JSON.stringify(ctx.umPorOS([r17, r26], null).map(r => r.id)), "[26]", 'senão o mais novo');
assert.equal(ctx.umPorOS([r17, { id: 30, os_id: 999 }], null).length, 2, 'OS diferentes continuam ambíguas');
console.log('✔ intelcamp-vinculo.cjs');
