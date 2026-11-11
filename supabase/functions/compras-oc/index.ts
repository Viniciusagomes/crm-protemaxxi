// Compras: gera a ORDEM DE COMPRA no Tiny (API v3, POST /ordem-compra) a partir da proposta vencedora de uma cotação.
//  POST {acao:"gerar", op:<id>}   → só o dono; cria a ordem, relê no Tiny e grava número/previsão em oportunidades.oc_*
// Travas:
//  - oc_status 'enviando' é marcado ANTES de chamar o Tiny (update condicional), então dois cliques não criam duas ordens.
//  - se uma tentativa travar no meio (sem resposta), só dá para tentar de novo 10 min depois, e a tela avisa para conferir no Tiny.
//  - todo item precisa do código (SKU) de um produto cadastrado no Tiny; o fornecedor precisa existir no Tiny com o mesmo CNPJ.
// Não renova o token da v3: usa o que a tiny-sync mantém (o refresh token é de uso único).
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const V3 = "https://api.tiny.com.br/public-api/v3";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function token() {
  const { data: t } = await sb.rpc("v3_ler");
  if (!t?.v3_access || Date.now() > Date.parse(t.v3_access_exp) - 5 * 60e3) throw new Error("O acesso ao Tiny está renovando. Tente de novo em 2 minutos.");
  return t.v3_access as string;
}
async function v3(tk: string, metodo: string, caminho: string, corpo?: unknown) {
  for (let i = 1; i <= 3; i++) {
    const r = await fetch(V3 + caminho, { method: metodo, headers: { Authorization: `Bearer ${tk}`, Accept: "application/json", ...(corpo ? { "Content-Type": "application/json" } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
    if (r.status === 429 && metodo === "GET") { await dormir(4000 * i); continue; }   // POST não repete: poderia duplicar a ordem
    const txt = await r.text(); let j: unknown = null; try { j = txt ? JSON.parse(txt) : null; } catch { j = txt; }
    return { status: r.status, ok: r.ok, corpo: j as any };
  }
  return { status: 429, ok: false, corpo: "Tiny ocupado (429)" as any };
}
const soDig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const fmtCnpj = (d: string) => d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d;
const dataSP = (d = new Date()) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const somarDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Monta o corpo do POST /ordem-compra. Exportada para o teste (tests/compras-oc.cjs lê o mesmo texto).
 *  produtos: mapa SKU → id do produto no Tiny. Devolve {corpo, total, previsao} ou {erros:[...]} */
export function montarOrdem(o: any, p: any, itens: any[], pitens: any[], contatoId: number, produtos: Record<string, number>, hoje: string) {
  const erros: string[] = [], linhas: any[] = [];
  for (const i of itens) {
    const x = pitens.find((y) => y.item_id === i.id);
    if (!x?.disponivel || !(Number(x.preco_unit) > 0)) continue;            // o vencedor não cotou este item: fica fora da ordem
    const cod = String(i.produto_codigo ?? "").trim();
    if (!cod) { erros.push(`"${i.descricao}" está sem o código do Tiny`); continue; }
    const pid = produtos[cod];
    if (!pid) { erros.push(`o código ${cod} ("${i.descricao}") não existe no Tiny`); continue; }
    linhas.push({ produto: { id: pid, tipo: "P" }, quantidade: Number(i.quantidade), valor: Number(x.preco_unit), ...(x.marca_modelo ? { informacoesAdicionais: String(x.marca_modelo).slice(0, 200) } : {}) });
  }
  if (!linhas.length && !erros.length) erros.push("o vencedor não cotou nenhum item");
  if (erros.length) return { erros };
  const frete = r2(Number(p.frete) || 0), produtosTot = r2(linhas.reduce((s, l) => s + l.quantidade * l.valor, 0));
  const previsao = p.prazo_entrega_dias != null ? somarDias(hoje, Number(p.prazo_entrega_dias)) : null;
  const obs = [`Cotação #${o.id} do portal do fornecedor: ${o.titulo}`, p.validade ? `Proposta válida até ${p.validade.split("-").reverse().join("/")}` : "", p.obs ? `Obs. do fornecedor: ${p.obs}` : ""].filter(Boolean).join("\n");
  const corpo: any = {
    data: hoje, dataPrevista: previsao, contato: { id: contatoId }, itens: linhas, frete,
    fretePorConta: frete > 0 ? "D" : "R",                                   // frete cobrado = por nossa conta; grátis = por conta do fornecedor
    condicao: String(p.pagamento || o.pagamento || "").slice(0, 100) || null,
    observacoes: obs.slice(0, 1000), observacoesInternas: `Gerada pela Intranet (cotação #${o.id}).`,
  };
  return { corpo, total: r2(produtosTot + frete), previsao };
}

async function gerar(opId: number, quem: string | null) {
  const { data: o } = await sb.from("oportunidades").select("*").eq("id", opId).maybeSingle();
  if (!o) return json({ erro: "Cotação não encontrada." }, 404);
  if (o.status !== "concluida" || !o.vencedora_id) return json({ erro: "Escolha o vencedor antes de gerar a ordem." }, 400);
  if (o.oc_status === "criada") return json({ erro: `A ordem nº ${o.oc_numero} já foi gerada.` }, 409);
  if (o.oc_status === "enviando" && Date.now() - Date.parse(o.oc_em) < 10 * 60e3)
    return json({ erro: "Uma tentativa ainda está em andamento. Espere 10 minutos e confira no Tiny antes de tentar de novo." }, 409);

  const [{ data: p }, { data: itens }] = await Promise.all([
    sb.from("propostas").select("*").eq("id", o.vencedora_id).single(),
    sb.from("op_itens").select("*").eq("oportunidade_id", opId).order("ordem"),
  ]);
  const [{ data: pitens }, { data: f }] = await Promise.all([
    sb.from("proposta_itens").select("*").eq("proposta_id", p.id),
    sb.from("fornecedores").select("*").eq("id", p.fornecedor_id).single(),
  ]);
  const cods = [...new Set((itens ?? []).map((i: any) => String(i.produto_codigo ?? "").trim()).filter(Boolean))];
  const { data: prods } = cods.length ? await sb.from("produtos").select("id, codigo").in("codigo", cods) : { data: [] };
  const mapa = Object.fromEntries((prods ?? []).map((x: any) => [x.codigo, Number(x.id)]));

  const tk = await token();
  // fornecedor no Tiny: o id guardado ou a busca pelo CNPJ (e guarda para a próxima vez)
  let contatoId = Number(f.tiny_contato_id) || 0;
  if (!contatoId) {
    const doc = soDig(f.cnpj);
    if (doc.length !== 14) return json({ erro: "O fornecedor está sem CNPJ válido." }, 400);
    let achado: any = null;
    for (const busca of [fmtCnpj(doc), doc]) {   // o filtro do Tiny pode querer o CNPJ com ou sem pontuação
      const r = await v3(tk, "GET", `/contatos?cpfCnpj=${encodeURIComponent(busca)}&limit=5`);
      achado = (r.corpo?.itens ?? []).find((c: any) => soDig(c.cpfCnpj) === doc);
      if (achado) break;
    }
    if (!achado) return json({ erro: `${f.nome} não está cadastrado no Tiny com o CNPJ ${fmtCnpj(doc)}. Cadastre o fornecedor no Tiny e tente de novo.` }, 400);
    contatoId = Number(achado.id);
    await sb.from("fornecedores").update({ tiny_contato_id: String(contatoId) }).eq("id", f.id);
  }

  const m = montarOrdem(o, p, itens ?? [], pitens ?? [], contatoId, mapa, dataSP());
  if ("erros" in m) return json({ erro: "Não dá para gerar a ordem ainda: " + m.erros.join("; ") + "." }, 400);

  // trava: só um envio por vez (update condicional)
  const { data: trav } = await sb.from("oportunidades").update({ oc_status: "enviando", oc_em: new Date().toISOString(), oc_por: quem, oc_erro: null })
    .eq("id", opId).or(`oc_status.is.null,oc_status.eq.erro,and(oc_status.eq.enviando,oc_em.lt.${new Date(Date.now() - 10 * 60e3).toISOString()})`).select("id");
  if (!trav?.length) return json({ erro: "Outra pessoa está gerando esta ordem agora." }, 409);

  const r = await v3(tk, "POST", "/ordem-compra", m.corpo);
  const novoId = Number(r.corpo?.id) || 0;
  if (!r.ok || !novoId) {
    const msg = typeof r.corpo === "string" ? r.corpo : r.corpo?.mensagem || JSON.stringify(r.corpo?.detalhes ?? r.corpo ?? "").slice(0, 400);
    await sb.from("oportunidades").update({ oc_status: "erro", oc_erro: `Tiny ${r.status}: ${msg}` }).eq("id", opId);
    return json({ erro: `O Tiny recusou a ordem (${r.status}): ${msg}` }, 400);
  }
  const lido = await v3(tk, "GET", `/ordem-compra/${novoId}`);
  const numero = String(lido.corpo?.numero ?? r.corpo?.numeroPedido ?? "");
  await sb.from("oportunidades").update({ oc_status: "criada", oc_tiny_id: novoId, oc_numero: numero, oc_previsao: m.previsao, oc_total: m.total, oc_erro: null }).eq("id", opId);
  return json({ ok: true, id: novoId, numero, total: m.total, previsao: m.previsao, conferido: lido.ok });
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const eu = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: dono } = await eu.rpc("eh_dono");
  if (dono !== true) return json({ erro: "Só o administrador gera a ordem de compra no Tiny." }, 403);
  const { data: quem } = await eu.rpc("eu");
  const { acao, op } = await req.json().catch(() => ({}));
  if (acao !== "gerar" || !(Number(op) > 0)) return json({ erro: "pedido inválido" }, 400);
  try { return await gerar(Number(op), (quem as string) ?? null); }
  catch (e) { return json({ erro: String((e as Error).message) }, 400); }
});
