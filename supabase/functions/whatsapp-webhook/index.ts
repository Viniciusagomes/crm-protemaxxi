// WhatsApp (Cloud API da Meta) → Intranet. Publicada com verify_jwt = false: quem chama é a Meta.
//  GET  ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…  → confirmação do webhook (token em privado.segredos 'wa_verify')
//  POST (assinado com X-Hub-Signature-256 = HMAC-SHA256 do corpo com a chave secreta do app, secret META_APP_SECRET)
//       mensagens → wa_entrada (não duplica: wa_msg_id único) + baixa a mídia para o bucket privado 'whatsapp'
//       statuses  → wa_status (enviada/entregue/lida/falhou)
// Sem a assinatura certa nada é gravado. Responde 200 rápido para a Meta não reenviar.
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SEGREDO = Deno.env.get("META_APP_SECRET") ?? "";
const TOKEN = Deno.env.get("META_WA_TOKEN") ?? "";
const MAX_MIDIA = 20 * 1024 * 1024;

/** Confere a assinatura da Meta em tempo constante. Exportada para o teste. */
export async function assinaturaOk(segredo: string, corpo: string, cab: string | null) {
  if (!segredo || !cab?.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo)));
  const esperado = [...mac].map((b) => b.toString(16).padStart(2, "0")).join(""), veio = cab.slice(7).toLowerCase();
  if (veio.length !== esperado.length) return false;
  let dif = 0; for (let i = 0; i < veio.length; i++) dif |= veio.charCodeAt(i) ^ esperado.charCodeAt(i);
  return dif === 0;
}

/** Converte uma mensagem da Meta no formato da wa_entrada. Exportada para o teste. */
export function lerMensagem(m: any, contatos: any[]) {
  const nome = contatos.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
  const base: any = { de: m.from, nome, wa_msg_id: m.id, tipo: m.type, em: new Date(Number(m.timestamp) * 1000).toISOString(), resposta_a: m.context?.id ?? null };
  const t = m.type, x = m[t] ?? {};
  if (t === "text") base.texto = x.body;
  else if (["image", "video", "audio", "document", "sticker"].includes(t)) {
    Object.assign(base, { midia_id: x.id, midia_mime: x.mime_type ?? null, midia_nome: x.filename ?? null, texto: x.caption ?? null });
    if (t === "audio" && x.voice) base.texto = null;
  } else if (t === "location") base.texto = `📍 ${x.name ? x.name + " — " : ""}${x.address ?? ""} https://maps.google.com/?q=${x.latitude},${x.longitude}`.trim();
  else if (t === "contacts") base.texto = "👤 " + (x[0]?.name?.formatted_name ?? m.contacts?.[0]?.name?.formatted_name ?? "contato") + " " + ((m.contacts?.[0]?.phones ?? []).map((p: any) => p.phone).join(", "));
  else if (t === "reaction") base.texto = `reagiu ${m.reaction?.emoji ?? ""}`.trim();
  else if (t === "button") base.texto = m.button?.text ?? null;
  else if (t === "interactive") base.texto = x.button_reply?.title ?? x.list_reply?.title ?? null;
  else { base.tipo = "outro"; base.texto = "[mensagem que o WhatsApp não mostra aqui — veja no celular]"; }
  return base;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "video/mp4": "mp4", "application/pdf": "pdf" };
async function baixarMidia(cfg: any, conversa: number, msgId: number, midiaId: string, mime: string | null) {
  if (!TOKEN) return;
  const v = cfg.graph_version || "v23.0";
  const info = await fetch(`https://graph.facebook.com/${v}/${midiaId}`, { headers: { Authorization: `Bearer ${TOKEN}` } }).then((r) => r.json());
  if (!info?.url || Number(info.file_size) > MAX_MIDIA) return;
  const r = await fetch(info.url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) return;
  const tipo = info.mime_type || mime || "application/octet-stream", ext = EXT[tipo.split(";")[0]] ?? "bin";
  const caminho = `entrada/${conversa}/${msgId}.${ext}`;
  const { error } = await sb.storage.from("whatsapp").upload(caminho, new Uint8Array(await r.arrayBuffer()), { contentType: tipo, upsert: true });
  if (!error) await sb.from("wa_mensagens").update({ midia_path: caminho, midia_mime: tipo }).eq("id", msgId);
}

async function processar(corpo: any) {
  const { data: cfgRow } = await sb.from("config").select("valor").eq("chave", "whatsapp").maybeSingle();
  const cfg = cfgRow?.valor ?? {};
  for (const e of corpo?.entry ?? []) for (const ch of e.changes ?? []) {
    if (ch.field !== "messages") continue;
    const v = ch.value ?? {};
    if (cfg.phone_number_id && v.metadata?.phone_number_id && String(v.metadata.phone_number_id) !== String(cfg.phone_number_id)) continue;   // outro número
    for (const m of v.messages ?? []) {
      const p = lerMensagem(m, v.contacts ?? []);
      const { data: r, error } = await sb.rpc("wa_entrada", { p });
      if (error) { console.error("wa_entrada", error.message); continue; }
      if (r?.mensagem && p.midia_id) await baixarMidia(cfg, r.conversa, r.mensagem, p.midia_id, p.midia_mime).catch((x) => console.error("midia", String(x)));
    }
    for (const s of v.statuses ?? []) {
      const erro = s.errors?.length ? s.errors.map((x: any) => `${x.code} ${x.title}${x.error_data?.details ? ": " + x.error_data.details : ""}`).join("; ") : null;
      const st = s.status === "failed" ? "falhou" : s.status === "sent" ? "enviada" : s.status === "delivered" ? "entregue" : s.status === "read" ? "lida" : null;
      if (st) await sb.rpc("wa_status", { p_wa_msg_id: s.id, p_status: st, p_erro: erro });
    }
  }
}

if (import.meta.main) Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && (await sb.rpc("wa_verify_ok", { s: url.searchParams.get("hub.verify_token") ?? "" })).data === true;
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : new Response("proibido", { status: 403 });
  }
  if (req.method !== "POST") return new Response("método", { status: 405 });
  const bruto = await req.text();
  if (!(await assinaturaOk(SEGREDO, bruto, req.headers.get("x-hub-signature-256")))) return new Response("assinatura inválida", { status: 401 });
  let corpo: any; try { corpo = JSON.parse(bruto); } catch { return new Response("ok", { status: 200 }); }
  try { await processar(corpo); } catch (e) { console.error("webhook", String(e)); }
  return new Response("ok", { status: 200 });
});
