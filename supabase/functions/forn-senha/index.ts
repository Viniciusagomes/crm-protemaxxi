// "Esqueci a senha" do portal do fornecedor (página pública fornecedor.html).
//  POST { email } → se for o login de um fornecedor ativo, manda pelo Resend o link para criar a nova senha.
// Não usa o e-mail do Supabase Auth (que só entrega para a equipe do projeto) nem a lista de redirecionamento:
// o link leva o hashed_token no fragmento (#rec=), e a página troca por uma sessão com verifyOtp.
// A resposta é sempre a mesma e sai antes do trabalho (EdgeRuntime.waitUntil), para nem o conteúdo nem o tempo
// revelarem quem tem cadastro. Um pedido a cada 5 min por fornecedor, reservado num único UPDATE (fornecedores.senha_pedida_em).
import { createClient } from "jsr:@supabase/supabase-js@2";
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const PORTAL = "https://portalprotemaxxi.com.br/fornecedor";
const INTERVALO = 5 * 60 * 1000;

async function pedir(email: string) {
  // reserva atômica: dois pedidos ao mesmo tempo, só um passa
  const limite = new Date(Date.now() - INTERVALO).toISOString();
  const { data: f } = await sb.from("fornecedores").update({ senha_pedida_em: new Date().toISOString() })
    .eq("email", email).eq("status", "ativo").not("user_id", "is", null).or(`senha_pedida_em.is.null,senha_pedida_em.lt.${limite}`)
    .select("nome,user_id").then((r) => ({ data: r.data?.[0] }));
  if (!f) return;
  const { data: u } = await sb.auth.admin.getUserById(f.user_id);
  const user = u?.user;
  if (!user || user.email?.toLowerCase() !== email) return;

  const chave = Deno.env.get("RESEND_API_KEY");
  const { data: cfgRow } = await sb.from("config").select("valor").eq("chave", "assistencia").maybeSingle();
  const cfg = cfgRow?.valor ?? {}, dominio = String(cfg.email_remetente ?? "").match(/@([^>\s]+)/)?.[1];
  if (!chave || !dominio) { console.error("senha: e-mail não configurado"); return; }

  const { data: link, error: e1 } = await sb.auth.admin.generateLink({ type: "recovery", email: user.email! });
  const hash = link?.properties?.hashed_token;
  if (e1 || !hash) { console.error("senha: link", e1?.message); return; }

  const empresa = String(cfg.empresa ?? "Protemaxxi"), url = `${PORTAL}#rec=${hash}`;
  const texto = `Olá, ${f.nome}.\n\nRecebemos um pedido para criar uma nova senha no portal do fornecedor da ${empresa}.\nAbra o link abaixo (vale por 1 hora e só pode ser usado uma vez):\n${url}\n\nSe você não pediu, ignore este e-mail: sua senha continua a mesma.`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#11202F;max-width:560px">
    <div style="background:#0E1A2B;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:bold">${esc(empresa)} · Portal do fornecedor</div>
    <div style="border:1px solid #E8DFD3;border-top:0;padding:20px;border-radius:0 0 12px 12px">
      <p>Olá, ${esc(f.nome)}.</p><p>Recebemos um pedido para criar uma nova senha no portal do fornecedor.</p>
      <p><a href="${esc(url)}" style="display:inline-block;background:#0E1A2B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Criar nova senha</a></p>
      <p style="color:#4D5B69;font-size:13px">O link vale por 1 hora e só pode ser usado uma vez. Se você não pediu, ignore este e-mail: sua senha continua a mesma.</p></div></div>`;
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${empresa} Compras <compras@${dominio}>`, to: [user.email], subject: "Nova senha do portal do fornecedor", html, text: texto }) });
  if (!r.ok) console.error("senha: resend", r.status, (await r.text()).slice(0, 200));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "método não aceito" }, 405);
  let b: { email?: string };
  try { b = await req.json(); } catch { return json({ erro: "pedido inválido" }, 400); }
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 160) return json({ erro: "Digite um e-mail válido." }, 400);
  EdgeRuntime.waitUntil(pedir(email).catch((e) => console.error("senha", (e as Error).message)));
  return json({ ok: true });
});
