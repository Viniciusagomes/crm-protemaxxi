// WhatsApp fase 2: expediente, avisos/bloqueio, distribuição (carteira + rodízio) e botão "Enviar para o vendedor".
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');

// ─── banco ───
const mig = fs.readdirSync(path.join(root, 'supabase/migrations')).find(f => f.endsWith('_whatsapp_fase2.sql'));
assert.ok(mig, 'migration da fase 2 existe');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations', mig), 'utf8');
/** Corpo de uma função da migration: do nome até a próxima "create or replace function". */
const fn = nome => { const i = sql.indexOf(`function ${nome}(`); assert.ok(i > 0, nome); const j = sql.indexOf('create or replace function', i + 10); return sql.slice(i, j > 0 ? j : undefined); };

// disponível = trabalhando + Intranet aberta na tela do WhatsApp (3 min) + sem bloqueio
const disp = fn('seg.wa_disponivel');
assert.match(disp, /a\.estado = 'trabalhando'/);
assert.match(disp, /a\.visto_em > now\(\) - interval '3 minutes' and a\.tela_em > now\(\) - interval '3 minutes'/);
assert.match(disp, /a\.bloqueado_ate is null or a\.bloqueado_ate <= now\(\)/);

// avisos: 1º aviso, 2º aviso final, 3º bloqueio de 3 dias corridos (contagem zera)
const pres = fn('seg.wa_verificar_presenca');
assert.match(pres, /estado = 'trabalhando' and coalesce\(visto_em, desde, now\(\)\) < now\(\) - interval '5 minutes'/, 'Intranet fechada estando em expediente');
assert.match(pres, /estado = 'almoco' and coalesce\(desde, now\(\)\) < now\(\) - interval '3 hours'/, 'almoço sem retornar');
assert.match(pres, /if f >= 3 then[\s\S]*faltas = 0, bloqueado_ate = now\(\) \+ interval '3 days'/);
assert.match(pres, /f = 1 then 'Atenção[\s\S]*1º aviso/);
assert.match(pres, /Último aviso[\s\S]*Na próxima vez você fica 3 dias/);
assert.match(sql, /cron\.schedule\('wa-presenca', '\* \* \* \* \*'/, 'confere a cada minuto, mesmo sem ninguém conectado');

// distribuição: carteira primeiro (se disponível), depois rodízio do setor; sem ninguém = fila
const atr = fn('seg.wa_atribuir');
assert.ok(atr.indexOf('c.vendedor_carteira is not null and seg.wa_disponivel(c.vendedor_carteira)') < atr.indexOf('order by a.ultimo_lead_em nulls first'), 'carteira antes do rodízio');
assert.match(atr, /c\.setor = any\(a\.setores\) and seg\.wa_disponivel\(a\.pessoa\)/);
assert.match(atr, /if quem is null then return null; end if;/, 'ninguém disponível: fica sem dono');
assert.match(fn('seg.wa_vendedor_carteira'), /x\.numero_ecommerce is null and coalesce\(x\.situacao, ''\) !~\* 'cancel'/, 'carteira ignora marketplace e cancelados');
const ent = fn('public.wa_entrada');
assert.match(ent, /responsavel = case when antes\.id is null or antes\.status = 'encerrada' then null else responsavel end/, 'contato novo passa pela distribuição');
assert.match(ent, /on conflict \(wa_msg_id\) do nothing/, 'continua sem duplicar');
assert.match(sql, /revoke execute on function public\.wa_entrada\(jsonb\) from public, anon, authenticated/);

// botões e segurança
const exp = fn('public.wa_expediente');
assert.match(exp, /p_acao = 'almoco' and a\.estado = 'trabalhando'/); assert.match(exp, /p_acao = 'retorno' and a\.estado = 'almoco'/);
assert.ok(exp.indexOf('seg.wa_verificar_presenca()') < exp.indexOf("p_acao = 'inicio'"), 'conta a saída sem botão antes de iniciar de novo');
const env = fn('public.wa_enviar_vendedor');
assert.match(env, /not seg\.wa_disponivel\(c\.vendedor_carteira\)/, 'só envia quando o vendedor está disponível');
assert.match(env, /c\.responsavel <> eu and not public\.eh_dono\(\)/, 'só quem atende (ou o dono)');
assert.match(fn('public.wa_desbloquear'), /if not public\.eh_dono\(\)/); assert.match(fn('public.wa_atendente_cfg'), /if not public\.eh_dono\(\)/);
assert.match(sql, /revoke execute on function seg\.wa_disponivel\(text\), seg\.wa_vendedor_carteira\(text\), seg\.wa_atribuir\(bigint\), seg\.wa_distribuir_fila\(\), seg\.wa_verificar_presenca\(\)\s+from public, anon, authenticated/);
assert.ok(!/policy \w+ on public\.wa_atendentes for (insert|update|delete|all)/.test(sql), 'expediente só muda pelas funções');
assert.match(sql, /policy wa_hor_dono on public\.wa_horarios for all to authenticated using \(public\.eh_dono\(\)\)/, 'horários: só o dono edita');

// ─── tela ───
const at = fs.readFileSync(path.join(root, 'js/atendimento.js'), 'utf8'), idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(idx, /js\/atendimento\.js\?v=20261112a/);
const ctx = vm.createContext({ console, Date, document: { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], hasFocus: () => true } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(at, ctx);
vm.runInContext("var EU = { id: 'pedro', permissoes: { atendimento: true } }; var ehDono = () => false; var nomeP = id => ({ pedro: 'Pedro Silva', felipe: 'Felipe Moreira' })[id] || '—'; var UI = { view: 'atendimento' };", ctx);
const agora = Date.parse('2026-11-12T15:00:00Z'), iso = ms => new Date(agora - ms).toISOString();
ctx.T = { agora, ok: iso(30e3), velho: iso(4 * 60e3), futuro: new Date(agora + 86400e3).toISOString() };
vm.runInContext(`WA.equipe = [
  { pessoa: 'felipe', estado: 'trabalhando', visto_em: T.ok, tela_em: T.ok },
  { pessoa: 'ana', estado: 'trabalhando', visto_em: T.ok, tela_em: T.velho },
  { pessoa: 'bia', estado: 'almoco', visto_em: T.ok, tela_em: T.ok },
  { pessoa: 'caio', estado: 'trabalhando', visto_em: T.ok, tela_em: T.ok, bloqueado_ate: T.futuro }];`, ctx);
assert.deepEqual(['felipe', 'ana', 'bia', 'caio', 'ninguem'].map(p => vm.runInContext(`waDisp('${p}', T.agora)`, ctx)), [true, false, false, false, false], 'mesma regra do banco');
// botões conforme o estado
vm.runInContext("WA.equipe.push({ pessoa: 'pedro', estado: 'fora', faltas: 1 })", ctx);
let h = vm.runInContext('waExpHtml()', ctx); assert.match(h, /Iniciar expediente/); assert.match(h, /avisos: 1\/2/);
vm.runInContext("waEu().estado = 'trabalhando'", ctx); h = vm.runInContext('waExpHtml()', ctx); assert.match(h, /Almoço/); assert.match(h, /Finalizar expediente/);
vm.runInContext("waEu().estado = 'almoco'", ctx); h = vm.runInContext('waExpHtml()', ctx); assert.match(h, /Retornar do almoço/);
// "Enviar para o vendedor" só aparece com o vendedor da carteira disponível e para quem atende
ctx.Date = class extends Date { constructor(...a) { super(...(a.length ? a : [agora])); } static now() { return agora; } };
vm.runInContext('Date = this.Date', ctx);
const cab = c => vm.runInContext(`waCabHtml(${JSON.stringify(c)})`, ctx);
assert.match(cab({ id: 9, status: 'aberta', responsavel: 'pedro', vendedor_carteira: 'felipe', wa_id: '5519' }), /Enviar para o vendedor: Felipe/);
assert.doesNotMatch(cab({ id: 9, status: 'aberta', responsavel: 'pedro', vendedor_carteira: 'ana', wa_id: '5519' }), /Enviar para o vendedor/);
assert.match(cab({ id: 9, status: 'aberta', responsavel: 'pedro', vendedor_carteira: 'ana', wa_id: '5519' }), /indisponível/);
assert.doesNotMatch(cab({ id: 9, status: 'aberta', responsavel: 'felipe', vendedor_carteira: 'felipe', wa_id: '5519' }), /Vendedor da carteira|Enviar para o vendedor/);
assert.doesNotMatch(cab({ id: 9, status: 'aberta', responsavel: 'bia', vendedor_carteira: 'felipe', wa_id: '5519' }), /Enviar para o vendedor/, 'conversa de outra pessoa');
console.log('ok whatsapp fase 2');
