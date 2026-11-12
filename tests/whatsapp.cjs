// WhatsApp fase 1: leitura das mensagens da Meta, assinatura do webhook, regras de envio, SQL e tela.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');
const semTipos = s => s.replace(/export (async )?function/g, '$1function').replace(/export const/g, 'const')
  .replace(/: (string\[\] \| null|string \| null|string|any\[\]|any|number|Record<string, string>)(?=\s*[,)=;])/g, '');

// ─── webhook ───
const wh = fs.readFileSync(path.join(root, 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
const W = vm.runInNewContext(semTipos(wh.slice(wh.indexOf('/** Confere a assinatura'), wh.indexOf('const EXT'))) + '; ({ assinaturaOk, lerMensagem })',
  { crypto: globalThis.crypto, TextEncoder, Date, Number, String });

const contatos = [{ wa_id: '5519987654321', profile: { name: 'Ana Cliente' } }];
const base = { from: '5519987654321', id: 'wamid.1', timestamp: '1762790400' };
let m = W.lerMensagem({ ...base, type: 'text', text: { body: 'Oi, tem câmera?' } }, contatos);
assert.equal(m.de, '5519987654321'); assert.equal(m.nome, 'Ana Cliente'); assert.equal(m.texto, 'Oi, tem câmera?');
assert.equal(m.wa_msg_id, 'wamid.1'); assert.equal(m.em, new Date(1762790400000).toISOString()); assert.equal(m.resposta_a, null);
m = W.lerMensagem({ ...base, type: 'image', image: { id: 'MID', mime_type: 'image/jpeg', caption: 'essa aqui' }, context: { id: 'wamid.0' } }, []);
assert.equal(m.midia_id, 'MID'); assert.equal(m.midia_mime, 'image/jpeg'); assert.equal(m.texto, 'essa aqui'); assert.equal(m.nome, null); assert.equal(m.resposta_a, 'wamid.0');
m = W.lerMensagem({ ...base, type: 'document', document: { id: 'D1', mime_type: 'application/pdf', filename: 'nf.pdf' } }, []);
assert.equal(m.midia_nome, 'nf.pdf');
m = W.lerMensagem({ ...base, type: 'location', location: { latitude: -22.9, longitude: -47.06, name: 'Loja' } }, []);
assert.match(m.texto, /maps\.google\.com\/\?q=-22\.9,-47\.06/);
m = W.lerMensagem({ ...base, type: 'interactive', interactive: { button_reply: { title: 'Sim' } } }, []);
assert.equal(m.texto, 'Sim');
m = W.lerMensagem({ ...base, type: 'unsupported', unsupported: {} }, []);
assert.equal(m.tipo, 'outro'); assert.match(m.texto, /celular/);

(async () => {
  const corpo = '{"entry":[]}', sig = 'sha256=' + crypto.createHmac('sha256', 'segredo').update(corpo).digest('hex');
  assert.equal(await W.assinaturaOk('segredo', corpo, sig), true);
  assert.equal(await W.assinaturaOk('segredo', corpo + ' ', sig), false, 'corpo alterado');
  assert.equal(await W.assinaturaOk('outro', corpo, sig), false, 'segredo errado');
  assert.equal(await W.assinaturaOk('', corpo, sig), false, 'sem segredo configurado não aceita nada');
  assert.equal(await W.assinaturaOk('segredo', corpo, null), false, 'sem cabeçalho');
  assert.ok(wh.includes("status: 401") && wh.indexOf('assinaturaOk(SEGREDO') < wh.indexOf('processar(corpo)'), 'confere a assinatura antes de gravar');

  // ─── envio ───
  const en = fs.readFileSync(path.join(root, 'supabase/functions/whatsapp-enviar/index.ts'), 'utf8');
  const E = vm.runInNewContext('const JANELA_MS = 24 * 3600e3;' + semTipos(en.slice(en.indexOf('/** Tipo de mensagem'), en.indexOf('async function graph'))) + '; ({ tipoMidia, dentroJanela, assinaturaTexto, comAssinatura })', { Date, String });
  // perfil de atendimento em cima da mensagem
  assert.equal(E.assinaturaTexto('Felipe Moreira', ['vendas'], null), 'Felipe Moreira - Vendas');
  assert.equal(E.assinaturaTexto('Ana', ['suporte', 'vendas'], ''), 'Ana - Suporte Técnico');
  assert.equal(E.assinaturaTexto('Pedro Silva', null, '  Pedro - Vendas '), 'Pedro - Vendas', 'o perfil cadastrado vale');
  assert.equal(E.comAssinatura('Pedro - Vendas', 'Bom dia!'), '*Pedro - Vendas*\nBom dia!');
  assert.equal(E.comAssinatura('*Pedro*', ''), '*Pedro*', 'sem texto (só arquivo) e sem asterisco duplicado');
  assert.ok(en.includes('if (tipo === "audio") enviado = "";'), 'áudio não tem legenda');
  assert.equal(E.tipoMidia('image/jpeg'), 'image'); assert.equal(E.tipoMidia('image/webp'), 'document', 'webp a Meta só aceita como figurinha');
  assert.equal(E.tipoMidia('audio/ogg; codecs=opus'), 'audio'); assert.equal(E.tipoMidia('application/pdf'), 'document'); assert.equal(E.tipoMidia(''), 'document');
  const agora = Date.parse('2026-11-10T15:00:00Z');
  assert.equal(E.dentroJanela('2026-11-09T15:30:00Z', agora), true); assert.equal(E.dentroJanela('2026-11-09T14:59:00Z', agora), false); assert.equal(E.dentroJanela(null, agora), false);
  assert.ok(en.includes('eu.from("wa_conversas")'), 'lê a conversa com o login de quem envia (RLS)');
  assert.ok(en.includes('startsWith(`saida/${quem}/`)'), 'só envia arquivo da própria pasta');
  assert.ok(!/EAA[A-Za-z0-9]{20}/.test(en + wh), 'nenhum token da Meta no código');

  // ─── banco ───
  const mig = fs.readdirSync(path.join(root, 'supabase/migrations')).find(f => f.endsWith('_whatsapp_fase1.sql'));
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations', mig), 'utf8');
  assert.match(sql, /on conflict \(wa_msg_id\) do nothing/, 'mensagem repetida da Meta não duplica');
  assert.match(sql, /revoke execute on function public\.wa_entrada\(jsonb\) from public, anon, authenticated/);
  assert.match(sql, /revoke execute on function public\.wa_verify_ok\(text\) from public, anon, authenticated/);
  assert.match(sql, /create policy wa_conv_sel on public\.wa_conversas for select to authenticated using \(seg\.ve_conversa\(responsavel\)\)/);
  assert.ok(!/policy wa_(conv|msg)_\w+ on public\.wa_(conversas|mensagens) for (insert|update|delete|all)/.test(sql), 'site não grava direto nas conversas/mensagens');
  assert.match(sql, /public\.wa_mensagens set status = p_status[\s\S]*array_position/, 'status só avança');

  // ─── tela ───
  const at = fs.readFileSync(path.join(root, 'js/atendimento.js'), 'utf8'), main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8'), idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(idx.indexOf('js/atendimento.js') > 0 && idx.indexOf('js/atendimento.js') < idx.indexOf('js/main.js'), 'atendimento.js carrega antes do main.js');
  assert.ok(main.includes("atendimento: () => vAtendimento()") && main.includes("['atendimento', 'Atendimento WhatsApp']"));
  assert.match(idx, /media-src 'self' blob: https:\/\/qeacyyccxgytqrwmddyl\.supabase\.co/, 'áudio e vídeo do bucket liberados na CSP');
  const ctx = vm.createContext({ console, Date, document: { addEventListener: () => {}, querySelector: () => null, hasFocus: () => true } });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
  vm.runInContext(at, ctx);
  vm.runInContext("var EU = { id: 'vini', permissoes: {} }; var ehDono = () => false;", ctx);
  assert.equal(vm.runInContext("waFone('5519987654321')", ctx), '(19) 98765-4321');
  assert.equal(vm.runInContext("veAtendimento()", ctx), false);
  vm.runInContext("EU.permissoes.atendimento = true; WA.conv = [{ id: 1, status: 'aberta', responsavel: 'vini', nao_lidas: 2 }, { id: 2, status: 'aberta', responsavel: null, nao_lidas: 1 }, { id: 3, status: 'aberta', responsavel: 'outro', nao_lidas: 5 }, { id: 4, status: 'encerrada', responsavel: 'vini', nao_lidas: 9 }];", ctx);
  assert.equal(vm.runInContext("veAtendimento()", ctx), true);
  assert.equal(vm.runInContext("waNaoLidas()", ctx), 3, 'contador: minhas + sem dono, só abertas');
  assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(['minhas','fila','equipe','encerradas'].map(a => waFiltro(a).map(c => c.id)))", ctx)), [[1], [2], [1, 2, 3], [4]]);
  assert.equal(vm.runInContext("waTexto('oi *bom* <b>x</b> https://a.b/c')", ctx), 'oi <b>bom</b> &lt;b&gt;x&lt;/b&gt; <a href="https://a.b/c" target="_blank" rel="noopener">https://a.b/c</a>', 'escapa HTML do cliente');
  console.log('ok whatsapp');
})().catch(e => { console.error(e); process.exit(1); });
