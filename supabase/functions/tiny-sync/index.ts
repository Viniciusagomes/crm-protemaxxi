// Sincronização Tiny (API v2, somente leitura) → banco do CRM.
// Modos: auto (padrão) | backfill | incremental | detalhar
//  - backfill:   cabeçalhos dos pedidos dos últimos 12 meses + mês atual, mês a mês (retoma de onde parou)
//  - incremental: pedidos e contatos alterados desde a última rodada (a cada rodada do agendador, ~2 min: o balcão precisa ver os pedidos logo)
//  - detalhar:   abre os pedidos ainda sem detalhe (cliente com CPF/CNPJ, itens, canal)
//  - excluídos:  a cada hora confere o mês atual e o anterior; pedido excluído no Tiny vira "Cancelado" (excluido_tiny_em)
// Chamado pelo pg_cron a cada 10 min (header x-sync-secret) ou pelo dono no botão "Atualizar agora".
import { createClient } from "jsr:@supabase/supabase-js@2";

const TINY = "https://api.tiny.com.br/api2";
const ORCAMENTO_MS = 115_000;
const INTERVALO_MS = 1100;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

class TinyErro extends Error {}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ctx() {
  const t0 = Date.now();
  return { t0, ultima: 0, chamadas: 0, tempo: () => Date.now() - t0 < ORCAMENTO_MS };
}
type Ctx = ReturnType<typeof ctx>;

async function tiny(c: Ctx, endpoint: string, params: Record<string, string>) {
  const token = Deno.env.get("TINY_API_TOKEN");
  if (!token) throw new TinyErro("TINY_API_TOKEN não configurado nas secrets da função");
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    const espera = INTERVALO_MS - (Date.now() - c.ultima);
    if (espera > 0) await dormir(espera);
    const corpo = new URLSearchParams({ token, formato: "json", ...params });
    const r = await fetch(`${TINY}/${endpoint}`, { method: "POST", body: corpo });
    c.ultima = Date.now(); c.chamadas++;
    if (!r.ok) throw new TinyErro(`${endpoint}: HTTP ${r.status}`);
    const ret = (await r.json())?.retorno ?? {};
    if (String(ret.status || "").toLowerCase() === "erro") {
      const msg = JSON.stringify(ret.erros ?? ret.codigo_erro ?? ret);
      if (/bloquead|excedid/i.test(msg)) {
        if (!c.tempo()) throw new TinyErro("API do Tiny bloqueada por excesso de chamadas");
        await dormir(10_000 * tentativa); continue;
      }
      if (/registro/i.test(msg)) return null; // "não retornou registros"
      throw new TinyErro(`${endpoint}: ${msg}`);
    }
    return ret;
  }
  throw new TinyErro(`${endpoint}: bloqueada após várias tentativas`);
}

// ─── utilidades ───
const iso = (br: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(br || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const norm = (s: string) => (s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const digitos = (s: string) => (s || "").replace(/\D/g, "");
const chaveCliente = (doc: string, nome: string) => { const d = digitos(doc); return d.length >= 11 ? d : "n:" + norm(nome); };
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
function brData(d: Date, comHora = true) {
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return comHora ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}` : `${p.day}/${p.month}/${p.year}`;
}
async function estado(chave: string) { const { data } = await sb.from("sync_estado").select("valor").eq("chave", chave).maybeSingle(); return data?.valor ?? null; }
async function salvarEstado(chave: string, valor: unknown) { await sb.from("sync_estado").upsert({ chave, valor, atualizado_em: new Date().toISOString() }); }

// ─── gravação ───
async function gravarCabecalhos(lista: any[]) {
  if (!lista.length) return 0;
  const ids = lista.map((p) => String(p.id));
  const { data: existentes } = await sb.from("pedidos").select("id").in("id", ids);
  const ja = new Set((existentes ?? []).map((x) => x.id));
  const agora = new Date().toISOString();
  const linhas = lista.map((p) => {
    const l: Record<string, unknown> = {
      id: String(p.id), numero: p.numero ?? null, numero_ecommerce: p.numero_ecommerce || null,
      data: iso(p.data_pedido), cliente_nome: (p.nome || "").trim(), vendedor_id: p.id_vendedor ? String(p.id_vendedor) : null,
      vendedor_nome: (p.nome_vendedor || "").trim() || null, valor: num(p.valor) ?? 0, situacao: p.situacao ?? null,
      detalhado: false, atualizado_em: agora,
    };
    if (!ja.has(String(p.id))) l.cliente_chave = chaveCliente("", p.nome);
    return l;
  }).filter((l) => l.data);
  const novos = linhas.filter((l) => !ja.has(l.id as string));
  const velhos = linhas.filter((l) => ja.has(l.id as string));
  if (novos.length) {
    const cli = new Map<string, any>();
    for (const l of novos) cli.set(l.cliente_chave as string, { chave: l.cliente_chave, nome: l.cliente_nome || "(sem nome)" });
    await sb.from("clientes").upsert([...cli.values()], { onConflict: "chave", ignoreDuplicates: true });
    const { error } = await sb.from("pedidos").upsert(novos);
    if (error) throw new Error("gravar pedidos novos: " + error.message);
  }
  if (velhos.length) {
    const { error } = await sb.from("pedidos").upsert(velhos);
    if (error) throw new Error("gravar pedidos: " + error.message);
  }
  return linhas.length;
}

async function detalharUm(c: Ctx, id: string) {
  let ret;
  try { ret = await tiny(c, "pedido.obter.php", { id }); }
  catch (e) { if (/localizad/i.test(String(e))) return await marcarExcluido(id); throw e; } // excluído antes de detalhar
  const p = ret?.pedido;
  if (!p) { await sb.from("pedidos").update({ detalhado: true }).eq("id", id); return; }
  const cl = p.cliente ?? {};
  const chave = chaveCliente(cl.cpf_cnpj, cl.nome || "");
  const cliente: Record<string, unknown> = { chave, nome: (cl.nome || "(sem nome)").trim(), atualizado_em: new Date().toISOString() };
  const doc = digitos(cl.cpf_cnpj); if (doc) cliente.doc = doc;
  for (const [k, v] of [["tipo_pessoa", cl.tipo_pessoa], ["cidade", cl.cidade], ["uf", (cl.uf || "").trim()], ["bairro", cl.bairro], ["fone", cl.fone], ["email", cl.email]]) {
    if (v && String(v).trim()) cliente[k as string] = String(v).trim();
  }
  await sb.from("clientes").upsert(cliente, { onConflict: "chave" });
  await sb.from("pedidos").update({
    cliente_chave: chave, cliente_nome: cliente.nome, canal: p.ecommerce?.nomeEcommerce || null,
    total_produtos: num(p.total_produtos), desconto: num(p.valor_desconto), frete: num(p.valor_frete),
    forma_pagamento: p.forma_pagamento || null, obs: (p.obs || "").trim() || null, obs_interna: (p.obs_interna || "").trim() || null, detalhado: true, ...(await extraV3(c, id, p)),
  }).eq("id", id);
  await sb.from("pedido_itens").delete().eq("pedido_id", id);
  const itens = (p.itens ?? []).map((x: any, i: number) => ({
    pedido_id: id, seq: i + 1, produto_id: x.item?.id_produto ?? null, codigo: x.item?.codigo ?? null,
    descricao: x.item?.descricao ?? null, quantidade: num(x.item?.quantidade), valor_unitario: num(x.item?.valor_unitario),
  }));
  if (itens.length) await sb.from("pedido_itens").insert(itens);
}

/** Pedidos da expedição (desde 16/10/2026): forma de envio e de pagamento pela v3 (a v2 não traz o nome da forma de envio). */
let tokV3: string | null = null;
async function extraV3(c: Ctx, id: string, p: any) {
  const base = { pag_forma: p.forma_pagamento || null, pag_meio: p.meio_pagamento || null } as Record<string, unknown>;
  if ((iso(p.data_pedido) ?? "") < "2026-10-16" || !tokV3) return base;
  try {
    const o = await v3get(c, tokV3, `/pedidos/${id}`);
    const t = o?.transportador ?? {};
    return { envio_forma: t?.formaEnvio?.nome ?? t?.formaFrete?.nome ?? null, envio_servico: t?.formaFrete?.nome || t?.nome || null,
      pag_forma: o?.pagamento?.formaPagamento?.nome ?? base.pag_forma, pag_meio: o?.pagamento?.meioPagamento?.nome ?? base.pag_meio };
  } catch { return base; }
}

// ─── modos ───
function mesesBackfill(): string[] {
  const hoje = new Date(); const out: string[] = [];
  for (let i = 12; i >= 0; i--) { const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
  return out;
}
async function backfill(c: Ctx, r: any) {
  const st = await estado("backfill") ?? { pendentes: mesesBackfill(), pagina: 1, concluido: false };
  while (!st.concluido && c.tempo()) {
    const mes = st.pendentes[0];
    if (!mes) { st.concluido = true; st.fim = new Date().toISOString(); break; }
    const [a, m] = mes.split("-").map(Number); const ult = new Date(a, m, 0).getDate();
    const ret = await tiny(c, "pedidos.pesquisa.php", { dataInicial: `01/${String(m).padStart(2, "0")}/${a}`, dataFinal: `${ult}/${String(m).padStart(2, "0")}/${a}`, pagina: String(st.pagina) });
    const lista = (ret?.pedidos ?? []).map((x: any) => x.pedido);
    r.pedidos += await gravarCabecalhos(lista);
    const total = Number(ret?.numero_paginas ?? 1);
    if (!ret || st.pagina >= total) { st.pendentes.shift(); st.pagina = 1; } else st.pagina++;
    if (!st.pendentes.length) { st.concluido = true; st.fim = new Date().toISOString(); }
    await salvarEstado("backfill", st);
  }
  if (st.concluido) { const ult = await estado("ultimo_incremental"); if (!ult) await salvarEstado("ultimo_incremental", { em: new Date(Date.now() - 3600e3).toISOString() }); }
  return st.concluido;
}
async function incremental(c: Ctx, r: any) {
  const inicio = new Date();
  const ult = await estado("ultimo_incremental");
  const desde = new Date((ult?.em ? new Date(ult.em).getTime() : Date.now() - 2 * 3600e3) - 10 * 60e3);
  for (let pag = 1, tot = 1; pag <= tot && c.tempo(); pag++) {
    const ret = await tiny(c, "pedidos.pesquisa.php", { dataAtualizacao: brData(desde), pagina: String(pag) });
    if (!ret) break; tot = Number(ret.numero_paginas ?? 1);
    r.pedidos += await gravarCabecalhos((ret.pedidos ?? []).map((x: any) => x.pedido));
  }
  for (let pag = 1, tot = 1; pag <= tot && c.tempo(); pag++) {
    const ret = await tiny(c, "contatos.pesquisa.php", { dataMinimaAtualizacao: brData(desde), pagina: String(pag) });
    if (!ret) break; tot = Number(ret.numero_paginas ?? 1);
    const linhas = (ret.contatos ?? []).map((x: any) => x.contato).map((k: any) => ({
      id: String(k.id), nome: (k.nome || "").trim(), doc: digitos(k.cpf_cnpj) || null, tipo_pessoa: k.tipo_pessoa || null,
      fone: k.fone || null, email: k.email || null, cidade: k.cidade || null, uf: (k.uf || "").trim() || null,
      vendedor_id: k.id_vendedor ? String(k.id_vendedor) : null, situacao: k.situacao || null, data_criacao: k.data_criacao || null,
      atualizado_em: new Date().toISOString(),
    }));
    if (linhas.length) { await sb.from("contatos_tiny").upsert(linhas); r.contatos += linhas.length; }
  }
  const v = await tiny(c, "vendedores.pesquisa.php", {});
  const vend = (v?.vendedores ?? []).map((x: any) => ({ id: String(x.vendedor.id), nome: (x.vendedor.nome || "").trim(), situacao: x.vendedor.situacao }));
  if (vend.length) await sb.from("vendedores_tiny").upsert(vend);
  if (c.tempo()) await salvarEstado("ultimo_incremental", { em: inicio.toISOString() });
}
/** O pedido ainda existe no Tiny? "sim" | "nao" (excluído: "Pedido não localizado") | null (não deu para saber). */
async function existeNoTiny(c: Ctx, id: string): Promise<"sim" | "nao" | null> {
  try { const ret = await tiny(c, "pedido.obter.php", { id }); return ret?.pedido ? "sim" : null; }
  catch (e) { if (/localizad/i.test(String(e))) return "nao"; throw e; }
}
/** Pedido excluído no Tiny: sai das somas como cancelado (todas as telas já descartam "Cancelado"). */
async function marcarExcluido(id: string) {
  const { error } = await sb.from("pedidos").update({ situacao: "Cancelado", excluido_tiny_em: new Date().toISOString(), detalhado: true }).eq("id", id);
  if (error) throw new Error("marcar excluído: " + error.message);
}
// Pedido EXCLUÍDO no Tiny (não cancelado) some da pesquisa e nunca volta no incremental: ficava somando nas vendas.
// A cada hora confere o mês atual e o anterior (a fila pode receber meses antigos para uma limpeza): compara os ids do
// Tiny com os do banco e só marca depois de confirmar um a um no pedido.obter.
async function conferirExcluidos(c: Ctx, r: any) {
  const st = await estado("conferencia_excluidos") ?? { fila: [], em: null };
  if (!st.fila?.length) {
    if (st.em && Date.now() - Date.parse(st.em) < 60 * 60e3) return;
    st.fila = mesesBackfill().slice(-2); st.em = new Date().toISOString();
  }
  const mes = st.fila[0];
  const [a, m] = mes.split("-").map(Number); const ult = new Date(a, m, 0).getDate(); const mm = String(m).padStart(2, "0");
  const noTiny = new Set<string>();
  for (let pag = 1, tot = 1; pag <= tot; pag++) {
    if (!c.tempo()) return; // sem tempo: tenta o mês de novo na próxima rodada, sem marcar nada
    const ret = await tiny(c, "pedidos.pesquisa.php", { dataInicial: `01/${mm}/${a}`, dataFinal: `${ult}/${mm}/${a}`, pagina: String(pag) });
    if (!ret) break; tot = Number(ret.numero_paginas ?? 1);
    for (const x of ret.pedidos ?? []) noTiny.add(String(x.pedido.id));
  }
  const { data, error } = await sb.from("pedidos").select("id").gte("data", `${mes}-01`).lte("data", `${mes}-${ult}`).or("situacao.is.null,situacao.neq.Cancelado");
  if (error) throw new Error("conferir excluídos: " + error.message);
  const suspeitos = (data ?? []).map((x) => x.id as string).filter((id) => !noTiny.has(id));
  let pendentes = 0;
  for (const id of suspeitos) {
    if (!c.tempo()) { pendentes++; continue; }
    const ex = await existeNoTiny(c, id);
    if (ex === "nao") { await marcarExcluido(id); r.excluidos = (r.excluidos ?? 0) + 1; }
  }
  if (!pendentes) st.fila.shift();
  await salvarEstado("conferencia_excluidos", st);
}
async function detalhar(c: Ctx, r: any) {
  while (c.tempo()) {
    const { data } = await sb.from("pedidos").select("id").eq("detalhado", false).order("data", { ascending: false }).limit(50);
    if (!data?.length) break;
    for (const { id } of data) { if (!c.tempo()) break; await detalharUm(c, id); r.detalhados++; }
  }
  const { count } = await sb.from("pedidos").select("id", { count: "exact", head: true }).eq("detalhado", false);
  await salvarEstado("fila_detalhe", { pendentes: count ?? 0 });
}

// ─── autorização ───

// ═══════════ API v3 (OAuth): ordens de serviço e serviços ═══════════
const V3 = "https://api.tiny.com.br/public-api/v3";
const TOKEN_URL = "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token";
const SIT_OS: Record<string, string> = { "0": "Em aberto", "1": "Orçada", "2": "Serviço concluído", "3": "Finalizada", "4": "Não aprovada", "5": "Aprovada", "6": "Em andamento", "7": "Cancelada" };
async function v3Token(): Promise<string | null> {
  const { data: t } = await sb.rpc("v3_ler");
  if (!t?.v3_refresh) return null;
  if (t.v3_access && Date.now() < Date.parse(t.v3_access_exp) - 30 * 60e3) return t.v3_access;
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: Deno.env.get("TINY_V3_CLIENT_ID")!, client_secret: Deno.env.get("TINY_V3_CLIENT_SECRET")!, refresh_token: t.v3_refresh }) });
  if (!r.ok) {
    if (r.status === 400 || r.status === 401) await sb.rpc("v3_gravar", { dados: { v3_access: null, v3_refresh: null } });
    await salvarEstado("v3", { conectado: false, erro: `não conseguiu renovar o acesso (${r.status}). Clique em "Conectar ao Tiny v3" de novo.`, em: new Date().toISOString() });
    return null;
  }
  const j = await r.json(), agora = Date.now();
  await sb.rpc("v3_gravar", { dados: { v3_access: j.access_token, v3_refresh: j.refresh_token ?? t.v3_refresh,
    v3_access_exp: new Date(agora + (j.expires_in ?? 14400) * 1000).toISOString(),
    v3_refresh_exp: new Date(agora + (j.refresh_expires_in ?? 86400) * 1000).toISOString() } });
  const est = await estado("v3");
  await salvarEstado("v3", { ...(est ?? {}), conectado: true, erro: null, renovado_em: new Date().toISOString(), renovar_ate: new Date(agora + (j.refresh_expires_in ?? 86400) * 1000).toISOString() });
  return j.access_token;
}
async function v3get(c: Ctx, token: string, caminho: string) {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const espera = 700 - (Date.now() - c.ultima); if (espera > 0) await dormir(espera);
    const r = await fetch(V3 + caminho, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    c.ultima = Date.now(); c.chamadas++;
    if (r.status === 429) { if (!c.tempo()) throw new TinyErro("API v3 com limite de chamadas"); await dormir(8000 * tentativa); continue; }
    if (r.status === 404) return null;
    if (!r.ok) throw new TinyErro(`v3 ${caminho.split("?")[0]}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    return await r.json();
  }
  throw new TinyErro("v3: limite de chamadas");
}
const dataV3 = (v: any) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || "")); return m && m[1] !== "0000" && m[2] !== "00" ? `${m[1]}-${m[2]}-${m[3]}` : null; };
const listaV3 = (j: any) => Array.isArray(j) ? j : (j?.itens ?? j?.data ?? []);
function clienteOS(cl: any) {
  const doc = digitos(cl?.cpfCnpj);
  return { cliente_id: cl?.id ?? null, cliente_nome: (cl?.nome || "").trim() || null, cliente_doc: doc || null,
    cliente_fone: cl?.celular || cl?.telefone || null, cliente_email: cl?.email || null, cliente_chave: cl?.nome || doc ? chaveCliente(doc, cl?.nome || "") : null };
}
async function sincronizarOS(c: Ctx, r: any, token: string, forcar: boolean) {
  const ult = await estado("ultimo_os");
  if (!forcar && ult?.em && Date.now() - Date.parse(ult.em) < 55 * 60e3) return;
  const d = new Date(); d.setMonth(d.getMonth() - 12);
  const desde = d.toISOString().slice(0, 10);
  for (let offset = 0; c.tempo();) {
    const j = await v3get(c, token, `/ordem-servico?dataInicialEmissao=${desde}&limit=100&offset=${offset}&orderBy=desc`);
    const lista = listaV3(j);
    if (!lista.length) break;
    const ids = lista.map((o: any) => o.id);
    const { data: ex } = await sb.from("ordens_servico").select("id,situacao,valor").in("id", ids);
    const mapa = new Map((ex ?? []).map((x: any) => [Number(x.id), x]));
    const linhas = lista.map((o: any) => {
      const sit = SIT_OS[String(o.situacao)] ?? o.situacao ?? null, antes = mapa.get(Number(o.id));
      const mudou = !antes || antes.situacao !== sit || Number(antes.valor) !== Number(o.valor);
      return { id: o.id, numero: o.numeroOrdemServico ?? null, situacao: sit, data: dataV3(o.data), data_prevista: o.dataPrevista || null,
        valor: num(o.valor), ...clienteOS(o.cliente), ...(mudou ? { detalhado: false } : {}), atualizado_em: new Date().toISOString() };
    });
    for (const l of linhas) await sb.from("ordens_servico").upsert(l);
    r.os = (r.os ?? 0) + linhas.length;
    offset += lista.length;
    if (lista.length < 100) break;
  }
  const us = await estado("ultimo_servicos");
  if (c.tempo() && (forcar || !us?.em || Date.now() - Date.parse(us.em) > 24 * 3600e3)) {
    for (let offset = 0; c.tempo();) {
      const lista = listaV3(await v3get(c, token, `/servicos?limit=100&offset=${offset}`));
      if (!lista.length) break;
      await sb.from("servicos").upsert(lista.map((s: any) => ({ id: s.id, nome: s.nome, codigo: s.codigo, preco: num(s.preco), situacao: s.situacao, unidade: s.unidade, descricao: s.descricaoComplementar || null, atualizado_em: new Date().toISOString() })));
      offset += lista.length; if (lista.length < 100) break;
    }
    if (c.tempo()) await salvarEstado("ultimo_servicos", { em: new Date().toISOString() });
  }
  if (c.tempo()) await salvarEstado("ultimo_os", { em: new Date().toISOString() });
}
async function detalharOS(c: Ctx, r: any, token: string) {
  const { data } = await sb.from("ordens_servico").select("id").eq("detalhado", false).order("data", { ascending: false }).limit(40);
  for (const { id } of data ?? []) {
    if (!c.tempo()) break;
    const o = await v3get(c, token, `/ordem-servico/${id}`);
    if (!o) { await sb.from("ordens_servico").update({ detalhado: true }).eq("id", id); continue; }
    const cl = o.contato ?? o.cliente;
    const { error } = await sb.from("ordens_servico").update({
      situacao: SIT_OS[String(o.situacao)] ?? o.situacao ?? null, data_conclusao: dataV3(o.dataConclusao),
      valor: num(o.totalOrdemServico) ?? undefined, total_servicos: num(o.totalServicos), total_pecas: num(o.totalPecas),
      ...(cl ? clienteOS(cl) : {}), vendedor_id: o.vendedor?.id ? String(o.vendedor.id) : null, vendedor_nome: o.vendedor?.nome || null,
      tecnico: o.tecnico || null, equipamento: o.equipamento || null, equipamento_serie: o.equipamentoSerie || null,
      descricao_problema: o.descricaoProblema || null, observacoes: o.observacoes || null, observacoes_servico: o.observacoesServico || null,
      observacoes_internas: o.observacoesInternas || null, categoria: o.categoria?.descricao || null, detalhado: true,
    }).eq("id", id);
    if (error) { r.erro_v3 = `OS ${id}: ${error.message}`; await sb.from("ordens_servico").update({ detalhado: true }).eq("id", id); continue; }
    r.os_detalhadas = (r.os_detalhadas ?? 0) + 1;
  }
}

async function autorizado(req: Request) {
  const segredo = req.headers.get("x-sync-secret");
  if (segredo) { const { data } = await sb.rpc("sync_segredo_ok", { s: segredo }); return data === true; }
  const auth = req.headers.get("Authorization");
  if (!auth) return false;
  const u = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data } = await u.rpc("eh_dono");
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  if (!(await autorizado(req))) return json({ erro: "não autorizado" }, 401);
  const url = new URL(req.url);
  let modo = url.searchParams.get("modo") || "auto";
  const forcar = url.searchParams.get("forcar") === "1";
  const { data: travou } = await sb.rpc("sync_travar", { nome: "tiny", segundos: 150 });
  if (!travou) return json({ ok: false, motivo: "outra sincronização em andamento" }, 409);
  const c = ctx();
  const r: any = { modo, pedidos: 0, detalhados: 0, contatos: 0, chamadas: 0, backfill_concluido: null as boolean | null };
  const { data: log } = await sb.from("sync_log").insert({ modo }).select("id").single();
  try {
    if (modo === "auto") {
      const bf = await estado("backfill");
      if (!bf?.concluido) modo = "backfill";
      else {
        const ult = await estado("ultimo_incremental");
        if (forcar || !ult?.em || Date.now() - new Date(ult.em).getTime() > 90e3) await incremental(c, r);
      }
    }
    if (modo === "backfill") r.backfill_concluido = await backfill(c, r);
    if (modo === "incremental") await incremental(c, r);
    if (modo !== "backfill" && c.tempo()) { try { await conferirExcluidos(c, r); } catch (e) { r.erro_excluidos = String(e); } }
    if (c.tempo()) {
      try {
        const tok = await v3Token();
        if (tok) { await sincronizarOS(c, r, tok, forcar); if (c.tempo()) await detalharOS(c, r, tok); }
      } catch (e) { r.erro_v3 = String(e); }
    }
    if (c.tempo()) { tokV3 = await v3Token().catch(() => null); await detalhar(c, r); }
    r.chamadas = c.chamadas;
    await sb.from("sync_log").update({ fim: new Date().toISOString(), chamadas: c.chamadas, pedidos: r.pedidos, detalhados: r.detalhados, contatos: r.contatos, ok: true, erro: r.erro_v3 ?? r.erro_excluidos ?? null }).eq("id", log!.id);
    return json({ ok: true, ...r });
  } catch (e) {
    await sb.from("sync_log").update({ fim: new Date().toISOString(), chamadas: c.chamadas, ok: false, erro: String(e) }).eq("id", log!.id);
    return json({ ok: false, erro: String(e), ...r }, 500);
  } finally {
    await sb.rpc("sync_liberar", { nome: "tiny" });
  }
});
