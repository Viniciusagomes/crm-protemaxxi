// Cadastro de produtos: aplica no Tiny (API v3) as sugestões que o DONO aprovou na Intranet.
//  POST {acao:"aplicar", ids:[...]}   até 8 por chamada (a tela repete até acabar)
// Regras de segurança (lição de 16/10: produto.alterar da v2 apaga campos; aqui é só a v3, com PUT parcial):
//  - só PREENCHE o que está vazio no Tiny: GTIN vazio, peso/medida = 0, descrição complementar vazia. Nunca troca valor existente.
//  - o PUT leva sku e descrição iguais aos de hoje (a v3 exige) e o bloco "dimensoes" inteiro relido na hora, só com os vazios trocados.
//  - relê depois e confere: se mudou algum campo fora do permitido, marca "erro" com a diferença para o Vinícius ver.
// Não renova o token da v3: usa o que a tiny-sync mantém (o refresh token é de uso único).
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const V3 = "https://api.tiny.com.br/public-api/v3";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_POR_CHAMADA = 8;
const PERMITIDOS = /^(gtin|descricaoComplementar|dimensoes\.(pesoBruto|pesoLiquido|altura|largura|comprimento))$/;

async function token() {
  const { data: t } = await sb.rpc("v3_ler");
  if (!t?.v3_access || Date.now() > Date.parse(t.v3_access_exp) - 5 * 60e3) throw new Error("O acesso ao Tiny está renovando. Tente de novo em 2 minutos.");
  return t.v3_access as string;
}
async function v3(tk: string, metodo: string, caminho: string, corpo?: unknown) {
  for (let i = 1; i <= 3; i++) {
    const r = await fetch(V3 + caminho, { method: metodo, headers: { Authorization: `Bearer ${tk}`, Accept: "application/json", ...(corpo ? { "Content-Type": "application/json" } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
    if (r.status === 429) { await dormir(4000 * i); continue; }
    const txt = await r.text(); let j: unknown = null; try { j = txt ? JSON.parse(txt) : null; } catch { j = txt; }
    return { status: r.status, ok: r.ok, corpo: j as any };
  }
  return { status: 429, ok: false, corpo: "Tiny ocupado (429)" as any };
}
function diferencas(a: any, b: any, pre = ""): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    const x = a?.[k], y = b?.[k], nome = pre + k;
    if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x)) Object.assign(out, diferencas(x, y, nome + "."));
    else if (JSON.stringify(x) !== JSON.stringify(y)) out[nome] = [x, y];
  }
  return out;
}
const vazio = (v: unknown) => v == null || v === "" || Number(v) === 0;
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** Monta o PUT só com o que está vazio no Tiny. Exportada para o teste (tests/cadastro-produtos.cjs lê o mesmo texto). */
export function montarPut(a: any, s: any) {
  const corpo: any = { sku: a.sku, descricao: a.descricao }, muda: string[] = [], ignorados: string[] = [];
  if (s.gtin) { if (vazio(a.gtin)) { corpo.gtin = s.gtin; muda.push("gtin"); } else if (String(a.gtin) !== String(s.gtin)) ignorados.push(`GTIN já preenchido no Tiny (${a.gtin})`); }
  const d = { ...(a.dimensoes ?? {}) }; let mudouDim = false;
  for (const [campo, chave] of [["peso_bruto", "pesoBruto"], ["peso_liquido", "pesoLiquido"], ["altura", "altura"], ["largura", "largura"], ["comprimento", "comprimento"]]) {
    const v = num(s[campo]); if (v == null) continue;
    if (vazio(d[chave])) { d[chave] = v; mudouDim = true; muda.push(chave); } else if (Number(d[chave]) !== v) ignorados.push(`${chave} já preenchido (${d[chave]})`);
  }
  if (mudouDim) corpo.dimensoes = d;
  if (s.ml_descricao && vazio(a.descricaoComplementar)) { corpo.descricaoComplementar = s.ml_descricao; muda.push("descricaoComplementar"); }
  return { corpo, muda, ignorados };
}

async function aplicarUm(tk: string, s: any, quem: string) {
  const agora = new Date().toISOString();
  const marcar = (status: string, resultado: unknown) => sb.from("produto_sugestoes").update({ status, resultado, decidido_por: quem, decidido_em: agora, ...(status === "aplicada" ? { aplicado_em: agora } : {}) }).eq("id", s.id);
  const antes = await v3(tk, "GET", `/produtos/${s.produto_id}`);
  if (!antes.ok) { await marcar("erro", { etapa: "ler", status: antes.status, corpo: antes.corpo }); return { id: s.id, ok: false, erro: "não consegui ler o produto no Tiny" }; }
  const { corpo, muda, ignorados } = montarPut(antes.corpo, s);
  if (!muda.length) { await marcar("aplicada", { nada_a_mudar: true, ignorados }); return { id: s.id, ok: true, muda, ignorados }; }
  const put = await v3(tk, "PUT", `/produtos/${s.produto_id}`, corpo);
  if (!put.ok) { await marcar("erro", { etapa: "gravar", status: put.status, corpo: put.corpo, enviado: corpo }); return { id: s.id, ok: false, erro: "o Tiny recusou a gravação" }; }
  const depois = await v3(tk, "GET", `/produtos/${s.produto_id}`);
  const dif = depois.ok ? diferencas(antes.corpo, depois.corpo) : {};
  const fora = Object.keys(dif).filter((k) => !PERMITIDOS.test(k));
  if (!depois.ok || fora.length) { await marcar("erro", { etapa: "conferir", mudou: dif, fora_do_permitido: fora, enviado: corpo }); return { id: s.id, ok: false, erro: fora.length ? `mudou campo fora do permitido: ${fora.join(", ")}` : "não consegui reler" }; }
  const d = depois.corpo ?? {};
  await sb.from("produtos").update({ ...(d.gtin ? { gtin: d.gtin } : {}), ...(d.dimensoes?.pesoBruto ? { peso_bruto: d.dimensoes.pesoBruto } : {}) }).eq("id", s.produto_id);
  await marcar("aplicada", { mudou: dif, ignorados });
  return { id: s.id, ok: true, muda, ignorados };
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const eu = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: dono } = await eu.rpc("eh_dono");
  if (dono !== true) return json({ erro: "Só o administrador aprova o cadastro de produtos." }, 403);
  const { data: quem } = await eu.rpc("eu");
  const { acao, ids } = await req.json().catch(() => ({}));
  if (acao !== "aplicar") return json({ erro: "ação desconhecida" }, 400);
  const lista = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => n > 0))].slice(0, MAX_POR_CHAMADA);
  if (!lista.length) return json({ erro: "Nenhuma sugestão escolhida." }, 400);
  const { data: sugs } = await sb.from("produto_sugestoes").select("*").in("id", lista).in("status", ["pendente", "erro"]);
  if (!sugs?.length) return json({ erro: "Essas sugestões já foram decididas." }, 400);
  const { data: travou } = await sb.rpc("sync_travar", { nome: "produto_sugestoes", segundos: 140 });
  if (!travou) return json({ erro: "Outra aprovação está rodando. Espere terminar." }, 409);
  try {
    const tk = await token(), res = [];
    for (const s of sugs) { res.push(await aplicarUm(tk, s, quem ?? null).catch((e) => ({ id: s.id, ok: false, erro: String((e as Error).message) }))); await dormir(1500); }
    return json({ ok: true, resultados: res });
  } catch (e) { return json({ erro: String((e as Error).message) }, 400); }
  finally { await sb.rpc("sync_liberar", { nome: "produto_sugestoes" }); }
});
