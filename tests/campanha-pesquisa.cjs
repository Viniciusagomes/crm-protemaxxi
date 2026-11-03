// Tráfego: criar campanha de Pesquisa pela fila (tipo campanha_pesquisa) e ativar/pausar (status_campanha).
// Confere o montador (supabase/functions/gads-aplicar/campanha.js) e a descrição na tela de Propostas.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');

// ─── montador ───
const codigo = fs.readFileSync(path.join(root, 'supabase/functions/gads-aplicar/campanha.js'), 'utf8').replace(/^export function/m, 'function');
const m = vm.runInNewContext(`${codigo}; ({ montarCampanhaPesquisa })`, { console });
const monta = (alvo, limites) => m.montarCampanhaPesquisa(JSON.parse(JSON.stringify(alvo)), '5866786402', limites);

const base = {
  nome: 'PESQ | Teste | Campinas 30km', orcamento_dia: 30, cpc_max: 3, url_final: 'https://exemplo.com.br',
  local: { lat: -22.9056, lng: -47.0608, raio_km: 30 },
  negativas: ['jogo', 'o que é', 'packet tracer'],
  grupos: [
    { nome: 'A', palavras: [{ texto: 'revenda teste', tipo: 'PHRASE' }, { texto: 'revenda teste', tipo: 'EXACT' }],
      anuncio: { titulos: [{ t: 'Título um', fixo: 'HEADLINE_1' }, { t: 'Título dois' }, { t: 'Título três' }], descricoes: [{ t: 'Descrição um' }, { t: 'Descrição dois' }] } },
    { nome: 'B', palavras: [{ texto: 'switch teste', tipo: 'PHRASE' }],
      anuncio: { titulos: [{ t: 'Outro um' }, { t: 'Outro dois' }, { t: 'Outro três' }], descricoes: [{ t: 'Outra um' }, { t: 'Outra dois' }], caminho1: 'switch' } },
  ],
  sitelinks: [{ titulo: 'Peça sua cotação' }, { titulo: 'Loja em Campinas', descricao1: 'Av. Exemplo, 120', descricao2: 'Retirada com NF' }],
  frases_destaque: ['Entrega no Brasil todo', 'Revenda Teste'],
};
const falha = (alvo, trecho, limites) => assert.throws(() => monta(alvo, limites), e => e.message.includes(trecho), `esperava erro com "${trecho}"`);
const mexe = f => { const c = JSON.parse(JSON.stringify(base)); f(c); return c; };

const { operacoes: opsVm, resumo } = monta(base);
const ops = JSON.parse(JSON.stringify(opsVm));   // sai do contexto do vm (comparação de arrays entre contextos falha no deepEqual)
const tipos = ops.map(o => Object.keys(o)[0]);
assert.deepEqual(JSON.parse(JSON.stringify(resumo)), { nome: base.nome, orcamento_dia: 30, cpc_max: 3, raio_km: 30, grupos: 2, palavras: 3, negativas: 3, anuncios: 2, sitelinks: 2, destaques: 2, nasce: 'PAUSADA' });
assert.equal(tipos[0], 'campaignBudgetOperation');
assert.equal(tipos[1], 'campaignOperation');

// A campanha nasce pausada, só na Pesquisa, "presença", com teto de CPC; o orçamento vem em micros.
const camp = ops[1].campaignOperation.create;
assert.equal(camp.status, 'PAUSED');
assert.equal(camp.advertisingChannelType, 'SEARCH');
assert.deepEqual(JSON.parse(JSON.stringify(camp.networkSettings)), { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false });
assert.equal(camp.geoTargetTypeSetting.positiveGeoTargetType, 'PRESENCE');
assert.equal(camp.targetSpend.cpcBidCeilingMicros, '3000000');
assert.equal(ops[0].campaignBudgetOperation.create.amountMicros, '30000000');
assert.equal(ops[0].campaignBudgetOperation.create.explicitlyShared, false);
assert.equal(ops.filter(o => o.campaignOperation && o.campaignOperation.create.status !== 'PAUSED').length, 0);

// Local: raio de 30 km em volta do ponto, idioma português, negativas (1 palavra = ampla; várias = frase).
const crit = ops.filter(o => o.campaignCriterionOperation).map(o => o.campaignCriterionOperation.create);
assert.deepEqual(JSON.parse(JSON.stringify(crit[0].proximity)), { geoPoint: { latitudeInMicroDegrees: -22905600, longitudeInMicroDegrees: -47060800 }, radius: 30, radiusUnits: 'KILOMETERS' });
assert.equal(crit[1].language.languageConstant, 'languageConstants/1014');
assert.deepEqual(JSON.parse(JSON.stringify(crit.filter(c => c.negative).map(c => [c.keyword.text, c.keyword.matchType]))), [['jogo', 'BROAD'], ['o que é', 'PHRASE'], ['packet tracer', 'PHRASE']]);

// Palavras, anúncios (título 1 fixo) e extensões.
const kw = ops.filter(o => o.adGroupCriterionOperation).map(o => JSON.parse(JSON.stringify(o.adGroupCriterionOperation.create.keyword)));
assert.deepEqual(kw, [{ text: 'revenda teste', matchType: 'PHRASE' }, { text: 'revenda teste', matchType: 'EXACT' }, { text: 'switch teste', matchType: 'PHRASE' }]);
const ads = ops.filter(o => o.adGroupAdOperation).map(o => o.adGroupAdOperation.create);
assert.equal(ads[0].ad.responsiveSearchAd.headlines[0].pinnedField, 'HEADLINE_1');
assert.equal(ads[0].ad.responsiveSearchAd.headlines[1].pinnedField, undefined);
assert.equal(ads[1].ad.responsiveSearchAd.path1, 'switch');
assert.deepEqual(JSON.parse(JSON.stringify(ads[0].ad.finalUrls)), ['https://exemplo.com.br']);
const sl = ops.filter(o => o.assetOperation && o.assetOperation.create.sitelinkAsset).map(o => JSON.parse(JSON.stringify(o.assetOperation.create.sitelinkAsset)));
assert.deepEqual(sl, [{ linkText: 'Peça sua cotação' }, { linkText: 'Loja em Campinas', description1: 'Av. Exemplo, 120', description2: 'Retirada com NF' }]);

// Todo ID temporário referenciado foi criado ANTES (o Google resolve na ordem).
const criados = new Set();
for (const o of ops) {
  const c = Object.values(o)[0].create; if (!c) continue;
  for (const campo of ['campaignBudget', 'campaign', 'adGroup', 'asset']) if (c[campo]) assert.ok(criados.has(c[campo]), `${campo} usado antes de criar: ${c[campo]}`);
  if (c.resourceName) { assert.ok(!criados.has(c.resourceName), 'ID temporário repetido ' + c.resourceName); criados.add(c.resourceName); }
}
assert.ok([...criados].every(r => /\/-\d+$/.test(r)), 'só IDs temporários negativos');

// Recusas.
falha(mexe(c => { c.orcamento_dia = 80; }), 'Orçamento diário inválido');
monta(mexe(c => { c.orcamento_dia = 80; }), { max_orcamento: 100 });
falha(mexe(c => { c.orcamento_dia = 0; }), 'Orçamento diário inválido');
falha(mexe(c => { c.cpc_max = 50; }), 'CPC máximo inválido');
falha(mexe(c => { c.url_final = 'http://exemplo.com.br'; }), 'Endereço final inválido');
falha(mexe(c => { c.local.raio_km = 500; }), 'Local inválido');
falha(mexe(c => { c.local.lat = 40; }), 'Local inválido');
falha(mexe(c => { c.grupos = []; }), '1 a 5 grupos');
falha(mexe(c => { c.grupos[0].palavras[0].tipo = 'BROAD'; }), 'ampla não é aceita');
falha(mexe(c => { c.grupos[0].palavras.push({ texto: 'revenda teste', tipo: 'PHRASE' }); }), 'Palavra repetida');
falha(mexe(c => { c.grupos[0].palavras[0].texto = 'switch!!'; }), 'inválida');
falha(mexe(c => { c.grupos[0].anuncio.titulos[1].t = 'x'.repeat(31); }), 'mais de 30 caracteres');
falha(mexe(c => { c.grupos[0].anuncio.titulos[1].t = 'título um'; }), 'repetido');
falha(mexe(c => { c.grupos[0].anuncio.titulos = c.grupos[0].anuncio.titulos.slice(0, 2); }), 'Títulos');
falha(mexe(c => { c.grupos[0].anuncio.descricoes[0].t = 'y'.repeat(91); }), 'mais de 90 caracteres');
falha(mexe(c => { c.grupos[0].anuncio.titulos[0].fixo = 'HEADLINE_9'; }), 'posição fixa inválida');
falha(mexe(c => { c.grupos[1].nome = 'a'; }), 'repetido');
falha(mexe(c => { c.sitelinks[0].descricao1 = 'só uma'; }), 'duas descrições');
falha(mexe(c => { c.sitelinks[0].titulo = 'z'.repeat(26); }), 'título de 1 a 25');
falha(mexe(c => { c.frases_destaque[0] = 'w'.repeat(26); }), 'Frase de destaque');
falha(mexe(c => { c.nome = ''; }), 'Nome da campanha');
falha(mexe(c => { c.negativas.push('a;b'); }), 'Negativa inválida');
// Cabem os limites exatos.
monta(mexe(c => { c.grupos[0].anuncio.titulos[1].t = 'x'.repeat(30); c.grupos[0].anuncio.descricoes[0].t = 'y'.repeat(90); c.frases_destaque[0] = 'w'.repeat(25); }));

// ─── descrição na tela de Propostas ───
const FixedDate = class extends Date { constructor(...a) { super(...(a.length ? a : ['2026-10-30T15:00:00Z'])); } static now() { return new Date('2026-10-30T15:00:00Z').getTime(); } };
const ctx = vm.createContext({ console, Date: FixedDate, document: { querySelector: () => null, addEventListener: () => {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext("var EU = { id: 'vini', papel: 'dono', permissoes: {} }, UI = {}; var D = { sync: {} }; const ehDono = () => true, nomeP = id => id, render = () => {};", ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/trafego.js'), 'utf8'), ctx, { filename: 'trafego.js' });
const desc = (a) => { ctx.__a = a; return vm.runInContext('trDescAcao(__a)', ctx); };
vm.runInContext("TR.d = { cn: { 7: '(D) Revenda' }, negativas: [], palavras: [], recursos: [], anuncios: [], gn: {} };", ctx);
const ativar = desc({ tipo: 'status_campanha', alvo: { campanha_id: 7, status: 'ENABLED' } });
assert.ok(ativar.includes('ATIVAR') && ativar.includes('(D) Revenda') && ativar.includes('volta a gastar'));
const pausar = desc({ tipo: 'status_campanha', alvo: { campanha_id: 7, status: 'PAUSED' } });
assert.ok(pausar.includes('PAUSAR') && !pausar.includes('ATIVAR'));
const nova = desc({ tipo: 'campanha_pesquisa', alvo: base });
assert.ok(nova.includes('PAUSADA') && nova.includes('R$') && nova.includes('30 km') && nova.includes('3 palavras-chave') && nova.includes('2 grupo(s)') && nova.includes('https://exemplo.com.br'), nova);
assert.ok(nova.includes('[revenda teste]') && nova.includes('“revenda teste”'));
const xss = desc({ tipo: 'campanha_pesquisa', alvo: { ...base, nome: '<img src=x onerror=1>' } });
assert.ok(!xss.includes('<img'), 'o nome da campanha precisa ser escapado');
// Revisão do Codex (30/10): contagens só de array (nada de HTML via ".length"), situação só no texto exato.
const mal = desc({ tipo: 'campanha_pesquisa', alvo: { ...base, negativas: { length: '<img src=x onerror=1>' }, sitelinks: 'x', frases_destaque: { length: '<b>' }, grupos: [{ nome: 'g', palavras: { length: '<i>' } }, null, 'texto'], local: { raio_km: '<u>' }, orcamento_dia: '<s>' } });
assert.ok(!/<(img|b>|i>|u>|s>)/.test(mal.replace(/<\/?(b|small|br)[^>]*>/g, '')), mal);
assert.ok(mal.includes('1 grupo(s)') && mal.includes('0 negativas'));
const minusculo = desc({ tipo: 'status_campanha', alvo: { campanha_id: 7, status: 'enabled' } });
assert.ok(minusculo.includes('SITUAÇÃO INVÁLIDA') && !minusculo.includes('PAUSAR') && !minusculo.includes('ATIVAR'), minusculo);
const srv = fs.readFileSync(path.join(root, 'supabase/functions/gads-aplicar/index.ts'), 'utf8');
assert.ok(srv.includes('novo = String(alvo.status ?? "");') && !/status_campanha[\s\S]{0,200}toUpperCase/.test(srv), 'status_campanha não pode converter a caixa');
assert.ok(srv.includes('antes.biddingStrategyType === "TARGET_SPEND"'), 'lance_campanha precisa recusar campanha em Maximizar cliques (sem desfazer)');
console.log('campanha-pesquisa: ok');
