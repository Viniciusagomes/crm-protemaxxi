// Intranet → WhatsApp (Cloud API da Meta). Chamada pelo site com o login de quem atende.
//  POST {conversa, texto}                                   → mensagem de texto
//  POST {conversa, midia_path, midia_nome, midia_mime, texto?} → foto/vídeo/áudio/documento já enviado ao bucket 'whatsapp' em saida/<pessoa>/…
//  POST {acao: "modelos"}                                    → modelos aprovados pela Meta (para o botão "Enviar modelo")
//  POST {conversa, modelo: {nome, idioma, params: [...]}}    → modelo aprovado (vale também fora da janela de 24 h)
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

/** Corpo e número de variáveis de cada modelo, a partir da resposta da Meta. Exportada para o teste. */
export function lerModelos(lista: any[]) {
  return (lista ?? []).filter((t) => t?.status === "APPROVED").map((t) => {
    const corpo = String((t.components ?? []).find((c: any) => c.type === "BODY")?.text ?? "");
    const botoes = ((t.components ?? []).find((c: any) => c.type === "BUTTONS")?.buttons ?? []).map((b: any) => String(b.text ?? "")).filter(Boolean);
    const n = Math.max(0, ...[...corpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
    return { nome: String(t.name), idioma: String(t.language), categoria: String(t.category ?? ""), corpo, variaveis: n, botoes };
  }).sort((a, b) => a.nome.localeCompare(b.nome));
}
/** Texto final do modelo com as variáveis preenchidas. Exportada para o teste. */
export const preencherModelo = (corpo: string, params: any) => String(corpo).replace(/\{\{(\d+)\}\}/g, (_, i) => String(params[Number(i) - 1] ?? ""));
/** A Meta recusa variável vazia, com quebra de linha, tab ou 4+ espaços seguidos. Devolve o problema ou "". Exportada para o teste. */
export function problemaParams(params: any, n: number) {
  if (!Array.isArray(params) || params.length !== n) return `Preencha os ${n} campos do modelo.`;
  for (const [i, p] of params.entries()) {
    const v = String(p ?? "");
    if (!v.trim()) return `Preencha o campo ${i + 1}.`;
    if (/[\n\t]| {4,}/.test(v)) return `O campo ${i + 1} não pode ter quebra de linha nem muitos espaços seguidos.`;
    if (v.length > 300) return `O campo ${i + 1} está grande demais.`;
  }
  return "";
}

async function graph(cfg: any, caminho: string, init: RequestInit) {
  const r = await fetch(`https://graph.facebook.com/${cfg.graph_version || "v23.0"}/${caminho}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

/** Modelos aprovados: tenta a conta de modelos e a conta do número salvas em config (a Meta separa as duas). */
async function modelosAprovados(cfg: any) {
  for (const conta of [cfg.modelos_waba_id, cfg.waba_id].filter(Boolean)) {
    const r = await graph(cfg, `${conta}/message_templates?fields=name,language,status,category,components&limit=100`, { method: "GET" });
    if (r.ok && Array.isArray(r.j?.data)) return lerModelos(r.j.data);
  }
  return [];
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const eu = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const corpo = await req.json().catch(() => ({}));
  const { data: cfgRow0 } = await sb.from("config").select("valor").eq("chave", "whatsapp").maybeSingle();
  if (corpo.acao === "modelos") {
    const { data: quem0 } = await eu.rpc("eu");
    if (!quem0) return json({ erro: "Login sem colaborador ligado." }, 403);
    return json({ modelos: await modelosAprovados(cfgRow0?.valor ?? {}) });
  }
  const id = Number(corpo.conversa), texto = String(corpo.texto ?? "").trim().slice(0, 4096);
  if (!(id > 0) || (!texto && !corpo.midia_path && !corpo.modelo)) return json({ erro: "Escreva a mensagem." }, 400);
  // a leitura com o login de quem chamou aplica a RLS: se não vê a conversa, não envia
  const { data: c } = await eu.from("wa_conversas").select("*").eq("id", id).maybeSingle();
  if (!c) return json({ erro: "Conversa não encontrada." }, 404);
  const { data: quem } = await eu.rpc("eu");
  if (!quem) return json({ erro: "Login sem colaborador ligado." }, 403);
  if (!corpo.modelo && !dentroJanela(c.ultima_entrada_em)) return json({ erro: "Passaram mais de 24 h desde a última mensagem do cliente. Pela regra do WhatsApp, agora só dá para mandar um modelo aprovado: use o botão \"Enviar modelo\"." }, 400);
  const cfg = cfgRow0?.valor ?? {};
  if (!TOKEN || !cfg.phone_number_id) return json({ erro: "O WhatsApp ainda não está configurado (token ou ID do número)." }, 400);

  // perfil de atendimento: "*Felipe Moreira - Vendas*" em cima da mensagem (áudio não tem legenda, sai sem)
  const [{ data: pe }, { data: at }] = await Promise.all([
    sb.from("pessoas").select("nome").eq("id", quem).maybeSingle(),
    sb.from("wa_atendentes").select("*").eq("pessoa", quem).maybeSingle(),
  ]);
  const assin = assinaturaTexto(pe?.nome ?? null, at?.setores ?? null, at?.assinatura ?? null);
  let payload: any, tipo = "text", midia: any = {}, enviado = comAssinatura(assin, texto);
  if (corpo.modelo) {
    // só modelo aprovado de verdade (confere na Meta); cliente que pediu para não ser contatado não recebe
    if (c.cliente_chave) { const { data: cl } = await sb.from("clientes").select("nao_contatar").eq("chave", c.cliente_chave).maybeSingle(); if (cl?.nao_contatar) return json({ erro: "Este cliente pediu para não ser contatado." }, 400); }
    const mod = (await modelosAprovados(cfg)).find((m) => m.nome === String(corpo.modelo.nome) && m.idioma === String(corpo.modelo.idioma || "pt_BR"));
    if (!mod) return json({ erro: "Este modelo não está aprovado pela Meta." }, 400);
    const params = (corpo.modelo.params ?? []).map((p: unknown) => String(p ?? "").trim());
    const prob = problemaParams(params, mod.variaveis); if (prob) return json({ erro: prob }, 400);
    tipo = "template"; enviado = preencherModelo(mod.corpo, params) + (mod.botoes.length ? `\n[${mod.botoes.join("] [")}]` : "");
    payload = { template: { name: mod.nome, language: { code: mod.idioma }, ...(params.length ? { components: [{ type: "body", parameters: params.map((t: string) => ({ type: "text", text: t })) }] } : {}) } };
  } else if (corpo.midia_path) {
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
  await sb.from("wa_conversas").update({ ultima_msg_em: new Date().toISOString(), ultima_msg_texto: (tipo === "template" ? enviado : texto || `[${tipo}]`).slice(0, 200), nao_lidas: 0, status: "aberta" }).eq("id", id);
  return json({ ok: true, id: msg!.id, wa_msg_id: wamid });
});
