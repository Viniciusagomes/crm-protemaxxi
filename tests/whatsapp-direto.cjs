// WhatsApp: modo "atendimento direto" (config.whatsapp.responsavel_fixo) — conversa nova vai direto para uma pessoa
// e o expediente fica desligado.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');

// ─── banco ───
const mig = fs.readdirSync(path.join(root, 'supabase/migrations')).find(f => f.endsWith('_whatsapp_atendimento_direto.sql'));
assert.ok(mig, 'migration do atendimento direto existe');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations', mig), 'utf8');
const fn = nome => { const i = sql.indexOf(`function ${nome}(`); assert.ok(i > 0, nome); const j = sql.indexOf('create or replace function', i + 10); return sql.slice(i, j > 0 ? j : undefined); };

assert.match(fn('seg.wa_fixo'), /c\.valor->>'responsavel_fixo' and pe\.ativo/, 'só vale para pessoa ativa');
const atr = fn('seg.wa_atribuir');
assert.ok(atr.indexOf('if fixo is not null') < atr.indexOf('vendedor_carteira is not null'), 'responsável fixo vem antes da carteira e do rodízio');
assert.match(atr, /quem := fixo; como := 'atendimento direto'/);
const exp = fn('public.wa_expediente');
assert.match(exp, /p_acao in \('inicio', 'retorno'\) and seg\.wa_fixo\(\) is not null then\s+raise exception/, 'não deixa iniciar expediente');
assert.match(sql, /revoke execute on function seg\.wa_fixo\(\), seg\.wa_atribuir\(bigint\) from public, anon, authenticated/);
assert.match(sql, /update public\.wa_atendentes set estado = 'fora'/, 'tira todo mundo do expediente');

// ─── tela ───
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(html, /js\/atendimento\.js\?v=\d{8}[a-z]/, 'cache do atendimento.js atualizado');
const src = fs.readFileSync(path.join(root, 'js/atendimento.js'), 'utf8');
const ini = src.indexOf('function waExpHtml()'), fim = src.indexOf('\nasync function waExpAcao', ini);
const ctx = { WA: { cfg: {}, equipe: [] }, EU: { id: 'pedro' }, esc: s => String(s), nomeP: id => ({ pedro: 'Pedro' })[id] || id,
  waAssinatura: () => 'Pedro - Vendas', waEu: () => ({ estado: 'fora' }), waHora: () => '', waBloq: () => false, waDataHora: () => '' };
vm.createContext(ctx);
vm.runInContext(src.slice(ini, fim) + '\nthis.waExpHtml = waExpHtml;', ctx);

ctx.WA.cfg = { responsavel_fixo: 'pedro' };
let h = ctx.waExpHtml();
assert.match(h, /Expediente desligado/);
assert.match(h, /direto para <b>Pedro<\/b>/);
assert.doesNotMatch(h, /Iniciar expediente/, 'sem botão de iniciar no modo direto');

ctx.WA.cfg = {};
h = ctx.waExpHtml();
assert.match(h, /▶ Iniciar expediente/, 'sem responsável fixo, volta o botão');

console.log('whatsapp-direto: ok');
