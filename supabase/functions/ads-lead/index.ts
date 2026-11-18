// Entrada dos leads da landing (fase G2 do Tráfego). Pública (a landing não tem login), por isso:
// valida o formato, limita 40 leads/minuto por IP e só grava pela função ads_lead_registrar (une servidor + navegador pelo código).
//  POST { codigo, tipo, botao, vendedor_nome, vendedor_whatsapp, gclid, gbraid, wbraid, utm_*, correspondencia, aparelho,
//         pagina, referencia, ip?, navegador?, nome?, fone?, interesse?, cidade?, produto? }
// O IP nunca é guardado: vira um hash com sal (serve só para o limite de abuso).
// Segurança (pentest 18/11): o IP do limite vem do cabeçalho da conexão (cf-connecting-ip / x-forwarded-for);
// o "ip" do corpo só vale se não houver cabeçalho — antes um robô mandava um ip diferente a cada envio e furava o limite.
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const CAMPOS = ["codigo", "tipo", "botao", "vendedor_nome", "vendedor_whatsapp", "gclid", "gbraid", "wbraid", "utm_source", "utm_medium", "utm_campaign",
  "utm_content", "utm_term", "correspondencia", "aparelho", "pagina", "referencia", "navegador", "nome", "fone", "interesse", "cidade", "produto"];

async function hash(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("pmx-ads:" + t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** IP para o limite de abuso: o da conexão manda; o do corpo só se não houver cabeçalho. Exportada para o teste. */
export function ipDoPedido(cab: (n: string) => string | null, corpoIp: unknown) {
  const daConexao = cab("cf-connecting-ip") ?? cab("x-forwarded-for")?.split(",")[0] ?? "";
  return String(daConexao.trim() || (corpoIp ?? "")).trim();
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  const txt = await req.text();
  if (txt.length > 8000) return json({ erro: "grande demais" }, 413);
  let d: Record<string, unknown> = {};
  try { d = JSON.parse(txt); } catch { return json({ erro: "json inválido" }, 400); }
  const limpo: Record<string, string> = {};
  for (const k of CAMPOS) { const v = d[k]; if (v != null && String(v).trim()) limpo[k] = String(v).trim().slice(0, 300); }
  if (!/^P[A-Z0-9]{4}$/.test((limpo.codigo ?? "").toUpperCase())) return json({ erro: "código inválido" }, 400);
  if (limpo.tipo && !["whatsapp", "formulario", "chatbot"].includes(limpo.tipo)) delete limpo.tipo;
  const ip = ipDoPedido((n) => req.headers.get(n), d.ip);
  limpo.ip_hash = ip ? await hash(ip) : "";
  if (!limpo.navegador) limpo.navegador = (req.headers.get("user-agent") ?? "").slice(0, 300);
  if (limpo.ip_hash) { const { data: ok } = await sb.rpc("ads_lead_limite", { p_ip_hash: limpo.ip_hash }); if (ok === false) return json({ erro: "muitos envios" }, 429); }
  const { data, error } = await sb.rpc("ads_lead_registrar", { d: limpo });
  if (error) return json({ erro: error.message }, 500);
  return json(data);
});
