// Código compartilhado das funções do Google Ads (copiado em cada função no deploy).
// Autenticação: OAuth do usuário (refresh token no schema privado). O token de desenvolvedor foi extinto pelo
// Google em 09/09/2026; se existir o secret GOOGLE_ADS_DEVELOPER_TOKEN ele ainda é enviado (o Google ignora).
import { createClient } from "jsr:@supabase/supabase-js@2";

export const URL_SB = Deno.env.get("SUPABASE_URL")!;
export const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
export const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret" };
export const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
export const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const ESCOPO = "https://www.googleapis.com/auth/adwords openid email";
export const API_BASE = "https://googleads.googleapis.com";

export async function estado(chave: string) { const { data } = await sb.from("sync_estado").select("valor").eq("chave", chave).maybeSingle(); return data?.valor ?? null; }
export async function salvarEstado(chave: string, valor: unknown) { await sb.from("sync_estado").upsert({ chave, valor, atualizado_em: new Date().toISOString() }); }
export async function gravar(dados: Record<string, string | null>) { await sb.rpc("v3_gravar", { dados }); }
export async function ler() { const { data } = await sb.rpc("gads_ler"); return (data ?? {}) as Record<string, string>; }
export async function config() { const { data } = await sb.from("config").select("valor").eq("chave", "gads").maybeSingle(); return (data?.valor ?? {}) as Record<string, any>; }

export const micros = (v: unknown) => Number(v ?? 0) / 1e6;
export const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
/** Hoje no fuso de Brasília (a conta usa America/Sao_Paulo). */
export const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
export const diasAtras = (n: number) => new Date(Date.now() - 3 * 3600e3 - n * 864e5).toISOString().slice(0, 10);

export async function autorizadoCron(req: Request) {
  const s = req.headers.get("x-sync-secret"); if (!s) return false;
  const { data } = await sb.rpc("sync_segredo_ok", { s }); return data === true;
}

/** Access token válido (renova com trava para duas execuções não renovarem ao mesmo tempo). */
export async function gadsToken(): Promise<string | null> {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const t = await ler();
    if (!t.gads_refresh) return null;
    if (t.gads_access && Date.now() < Date.parse(t.gads_access_exp) - 120e3) return t.gads_access;
    const { data: travou } = await sb.rpc("sync_travar", { nome: "gads_token", segundos: 30 });
    if (!travou) { await dormir(2000); continue; }
    try {
      const r = await fetch(TOKEN_URL, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: Deno.env.get("GOOGLE_ADS_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")!, refresh_token: t.gads_refresh }),
      });
      if (!r.ok) {
        const txt = (await r.text()).slice(0, 300);
        const est = await estado("gads");
        if (r.status === 400 || r.status === 401) {
          await gravar({ gads_access: null, gads_access_exp: null, gads_refresh: null });
          await salvarEstado("gads", { ...(est ?? {}), conectado: false, erro: `O Google recusou renovar o acesso (${r.status}): ${txt}. Se o app do Google Cloud ainda está em "Teste", a autorização vence em 7 dias: publique o app ("Em produção") e conecte de novo.` });
        }
        return null;
      }
      const j = await r.json();
      await gravar({ gads_access: j.access_token, gads_access_exp: new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString() });
      return j.access_token;
    } finally {
      await sb.rpc("sync_liberar", { nome: "gads_token" });
    }
  }
  return null;
}

function erroGoogle(j: any, status: number) {
  const det = j?.error?.details?.flatMap((d: any) => d.errors ?? [])?.map((e: any) => e.message)?.filter(Boolean)?.join("; ");
  return `Google Ads (${status}): ${det || j?.error?.message || JSON.stringify(j).slice(0, 300)}`;
}

export interface Ads {
  cfg: Record<string, any>;
  cliente: string;
  /** Consulta GAQL (searchStream). Devolve as linhas já achatadas em um vetor. */
  gaql(query: string): Promise<any[]>;
  /** POST em customers/{id}/{recurso}:mutate. */
  mutar(recurso: string, corpo: unknown): Promise<any>;
  chamar(caminho: string, corpo?: unknown, metodo?: string): Promise<any>;
}

/** Abre a conexão com o Google Ads; null se não estiver conectado. */
export async function abrir(): Promise<Ads | null> {
  const token = await gadsToken();
  if (!token) return null;
  const cfg = await config();
  const cliente = String(cfg.customer_id ?? "").replace(/\D/g, "");
  if (!cliente) throw new Error("config 'gads'.customer_id não definido.");
  const versoes = [...new Set([cfg.api_version, "v26", "v25", "v24"].filter(Boolean))] as string[];
  let boa: string | null = null;

  const chamar = async (caminho: string, corpo?: unknown, metodo = "POST") => {
    let ultimo = "";
    for (const v of boa ? [boa] : versoes) {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      if (cfg.login_customer_id) headers["login-customer-id"] = String(cfg.login_customer_id).replace(/\D/g, "");
      const dev = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN"); if (dev) headers["developer-token"] = dev;
      for (let i = 1; i <= 3; i++) {
        const r = await fetch(`${API_BASE}/${v}/${caminho}`, { method: metodo, headers, body: metodo === "GET" ? undefined : JSON.stringify(corpo ?? {}) });
        if (r.status === 429 || r.status === 503) { await dormir(2000 * i); continue; }
        const txt = await r.text(); let j: any = {}; try { j = JSON.parse(txt); } catch { /* texto */ }
        if (r.status === 404 && !boa) { ultimo = erroGoogle(j, 404); break; }   // versão aposentada: tenta a próxima
        if (!r.ok) throw new Error(erroGoogle(Array.isArray(j) ? j[0] : j, r.status));
        if (boa !== v) { boa = v; if (cfg.api_version !== v) await sb.from("config").update({ valor: { ...cfg, api_version: v } }).eq("chave", "gads"); }
        return j;
      }
    }
    throw new Error(ultimo || "Google Ads: não consegui falar com a API.");
  };

  return {
    cfg, cliente, chamar,
    async gaql(query: string) {
      const j = await chamar(`customers/${cliente}/googleAds:searchStream`, { query });
      return (Array.isArray(j) ? j : [j]).flatMap((c: any) => c.results ?? []);
    },
    mutar: (recurso: string, corpo: unknown) => chamar(`customers/${cliente}/${recurso}:mutate`, corpo),
  };
}
