// Intranet → WhatsApp (Cloud API da Meta). Chamada pelo site com o login de quem atende.
//  POST {conversa, texto}                                   → mensagem de texto
//  POST {conversa, midia_path, midia_nome, midia_mime, texto?} → foto/vídeo/áudio/documento já enviado ao bucket 'whatsapp' em saida/<pessoa>/…
// Regras: só quem vê a conversa (mesma RLS do site); fora da janela de 24 h a Meta só aceita modelo aprovado → recusa com aviso;
// quem responde uma conversa sem dono vira o responsável. Token da Meta só no secret META_WA_TOKEN.
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TOKEN = Deno.env.get("META_WA_TOKEN") ?? "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const JANELA_MS = 24 * 3600e3;

/** Tipo de mensagem da Meta pelo MIME do arquivo. Exportada para o teste. */
export function tipoMidia(mime: string) {
  const m = String(mime || "").split(";")[0].toLowerCase();
  if (["image/jpeg", "image/png"].includes(m)) return "image";
  if (["video/mp4", "video/3gpp"].includes(m)) return "video";
  if (["audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr"].includes(m)) return "audio";
  return "document";
}
/** Dentro da janela de 24 h desde a última mensagem do cliente? Exportada para o teste. */
export const dentroJanela = (ultimaEntrada: string | null, agora = Date.now()) => !!ultimaEntrada && agora - Date.parse(ultimaEntrada) < JANELA_MS;
const SETOR_NOME: Record<string, string> = { vendas: "Vendas", suporte: "Suporte Técnico" };
/** Perfil de atendimento: o que foi cadastrado em 👥 Equipe, ou "Nome - Setor". Exportada para o teste. */
export function assinaturaTexto(nome: string | null, setores: string[] | null, assinatura: string | null) {
  const a = String(assinatura ?? "").trim();
  if (a) return a;
  return `${String(nome ?? "").trim() || "Atendimento"} - ${SETOR_NOME[(setores ?? [])[0] ?? "vendas"] ?? "Vendas"}`;
}
/** Nome em negrito na primeira linha, como o cliente vê no WhatsApp. Exportada para o teste. */
export const comAssinatura = (assin: string, texto: string) => `*${assin.replace(/\*/g, "")}*${texto ? "\n" + texto : ""}`.slice(0, 4096);

async function graph(cfg: any, caminho: string, init: RequestInit) {
  const r = await fetch(`https://graph.facebook.com/${cfg.graph_version || "v23.0"}/${caminho}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const eu = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const corpo = await req.json().catch(() => ({}));
  const id = Number(corpo.conversa), texto = String(corpo.texto ?? "").trim().slice(0, 4096);
  if (!(id > 0) || (!texto && !corpo.midia_path)) return json({ erro: "Escreva a mensagem." }, 400);
  // a leitura com o login de quem chamou aplica a RLS: se não vê a conversa, não envia
  const { data: c } = await eu.from("wa_conversas").select("*").eq("id", id).maybeSingle();
  if (!c) return json({ erro: "Conversa não encontrada." }, 404);
  const { data: quem } = await eu.rpc("eu");
  if (!quem) return json({ erro: "Login sem colaborador ligado." }, 403);
  if (!dentroJanela(c.ultima_entrada_em)) return json({ erro: "Passaram mais de 24 h desde a última mensagem do cliente. Pela regra do WhatsApp, agora só dá para mandar um modelo aprovado (vem na próxima fase). Ligue ou espere o cliente escrever." }, 400);
  const { data: cfgRow } = await sb.from("config").select("valor").eq("chave", "whatsapp").maybeSingle();
  const cfg = cfgRow?.valor ?? {};
  if (!TOKEN || !cfg.phone_number_id) return json({ erro: "O WhatsApp ainda não está configurado (token ou ID do número)." }, 400);

  // perfil de atendimento: "*Felipe Moreira - Vendas*" em cima da mensagem (áudio não tem legenda, sai sem)
  const [{ data: pe }, { data: at }] = await Promise.all([
    sb.from("pessoas").select("nome").eq("id", quem).maybeSingle(),
    sb.from("wa_atendentes").select("*").eq("pessoa", quem).maybeSingle(),
  ]);
  const assin = assinaturaTexto(pe?.nome ?? null, at?.setores ?? null, at?.assinatura ?? null);
  let payload: any, tipo = "text", midia: any = {}, enviado = comAssinatura(assin, texto);
  if (corpo.midia_path) {
    const caminho = String(corpo.midia_path);
    if (!caminho.startsWith(`saida/${quem}/`)) return json({ erro: "Arquivo inválido." }, 400);
    const { data: arq, error } = await sb.storage.from("whatsapp").download(caminho);
    if (error || !arq) return json({ erro: "Não achei o arquivo enviado." }, 400);
    const mime = String(corpo.midia_mime || arq.type || "application/octet-stream"), nome = String(corpo.midia_nome || "arquivo").slice(0, 120);
    tipo = tipoMidia(mime);
    const fd = new FormData();
    fd.append("messaging_product", "whatsapp"); fd.append("type", mime); fd.append("file", new Blob([await arq.arrayBuffer()], { type: mime }), nome);
    const up = await graph(cfg, `${cfg.phone_number_id}/media`, { method: "POST", body: fd });
    if (!up.ok || !up.j?.id) return json({ erro: `A Meta recusou o arquivo: ${up.j?.error?.message ?? up.status}` }, 400);
    midia = { midia_id: up.j.id, midia_path: caminho, midia_mime: mime, midia_nome: nome };
    if (tipo === "audio") enviado = "";
    payload = { [tipo]: { id: up.j.id, ...(enviado ? { caption: enviado.slice(0, 1024) } : {}), ...(tipo === "document" ? { filename: nome } : {}) } };
  } else payload = { text: { body: enviado, preview_url: true } };

  // registra antes de enviar (aparece na hora para quem está olhando) e assume a conversa se estava sem dono
  const { data: msg } = await sb.from("wa_mensagens").insert({ conversa_id: id, direcao: "saida", tipo, texto: enviado || null, status: "enviando", por: quem, ...midia }).select("id").single();
  if (!c.responsavel) await sb.from("wa_conversas").update({ responsavel: quem }).eq("id", id).is("responsavel", null);
  const r = await graph(cfg, `${cfg.phone_number_id}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: c.wa_id, type: tipo, ...payload }),
  });
  const wamid = r.j?.messages?.[0]?.id;
  if (!r.ok || !wamid) {
    const erro = r.j?.error ? `${r.j.error.code ?? ""} ${r.j.error.message ?? ""}`.trim() : `HTTP ${r.status}`;
    await sb.from("wa_mensagens").update({ status: "falhou", erro }).eq("id", msg!.id);
    return json({ erro: `O WhatsApp recusou: ${erro}` }, 400);
  }
  await sb.from("wa_mensagens").update({ wa_msg_id: wamid, status: "enviada" }).eq("id", msg!.id);
  await sb.from("wa_conversas").update({ ultima_msg_em: new Date().toISOString(), ultima_msg_texto: (texto || `[${tipo}]`).slice(0, 200), nao_lidas: 0, status: "aberta" }).eq("id", id);
  return json({ ok: true, id: msg!.id, wa_msg_id: wamid });
});
