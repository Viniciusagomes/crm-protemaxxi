// Caixa de e-mails: recebe os e-mails do domínio portalprotemaxxi.com.br (Cloudflare Email Routing → Worker → aqui).
//  POST e-mail cru (Content-Type message/rfc822, cabeçalhos x-email-de / x-email-para) ou JSON {de, para, raw} com o MIME em base64.
//  Autenticação: cabeçalho x-email-segredo = secret EMAIL_ENTRADA_SEGREDO
//  (o mesmo valor fica na variável EMAIL_SEGREDO do Worker; o Vinícius cadastra nos dois painéis, nunca pelo chat).
//  Também aceita x-sync-secret (testes do servidor) e {acao:"limpar_orfaos"} (apaga anexos de e-mails excluídos).
// Guarda o e-mail e os anexos (bucket 'emails/<id>/') e lê o que der, conforme o endereço:
//  boletos@      PDF do boleto → linha digitável (confere os dígitos), valor, vencimento, CNPJ e nome do beneficiário → boletos_pagar
//                com alerta quando o CNPJ não é de fornecedor cadastrado, o banco mudou ou o e-mail veio de outro domínio;
//                o nome do beneficiário vem do fornecedor, do cadastro do Tiny ou da consulta pública de CNPJ (BrasilAPI)
//  nfe@          XML da NF-e / NFS-e → chave, emitente, número, valor → nfs_recebidas (e diz se já está na Entrada de NF)
//  os.intelbras@ e-mails da Intelcamp (SHOficina): liga à OS na assistência, atualiza a etapa e cria o orçamento como RASCUNHO
//                (veja processarOS). {acao:"reler", email_id, rma_id?} relê um e-mail (servidor ou usuário que vê o e-mail).
// Os XML de NF e os boletos são lidos em qualquer endereço (fornecedor que manda tudo para o mesmo e-mail).
import { createClient } from "jsr:@supabase/supabase-js@2";
import PostalMime from "npm:postal-mime@2.4.4";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const NOSSOS_CNPJ = ["21114063000149"];
const CAIXAS: Record<string, string> = { boletos: "boletos", nfe: "nfe", "os.intelbras": "os_intelbras" };

function igualSeguro(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
async function autorizado(req: Request) {
  const seg = Deno.env.get("EMAIL_ENTRADA_SEGREDO") ?? "";
  if (igualSeguro(req.headers.get("x-email-segredo") ?? "", seg)) return true;
  const s = req.headers.get("x-sync-secret"); if (!s) return false;
  const { data } = await sb.rpc("sync_segredo_ok", { s }); return data === true;
}
const deB64 = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
const nomeSeguro = (n: string) => (n || "anexo").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-120);

// ─── boleto ───
const mod10 = (s: string) => { let soma = 0, peso = 2; for (let i = s.length - 1; i >= 0; i--) { let n = Number(s[i]) * peso; if (n > 9) n = Math.floor(n / 10) + (n % 10); soma += n; peso = peso === 2 ? 1 : 2; } return (10 - (soma % 10)) % 10; };
/** Linha digitável de boleto bancário (47 dígitos) com os 3 dígitos verificadores dos campos conferidos. */
function linhaValida(d: string) {
  return d.length === 47 && mod10(d.slice(0, 9)) === Number(d[9]) && mod10(d.slice(10, 20)) === Number(d[20]) && mod10(d.slice(21, 31)) === Number(d[31]);
}
/** Vencimento pelo fator (o fator recomeçou em 1000 no dia 22/02/2025): fica a data mais próxima de hoje. */
function vencimentoDoFator(f: number) {
  if (!f) return null;
  const dia = 864e5, cands = [Date.UTC(1997, 9, 7) + f * dia];
  if (f >= 1000) cands.push(Date.UTC(2025, 1, 22) + (f - 1000) * dia);
  const t = cands.sort((a, b) => Math.abs(a - Date.now()) - Math.abs(b - Date.now()))[0];
  return new Date(t).toISOString().slice(0, 10);
}
function lerBoleto(texto: string) {
  const achados: string[] = [];
  for (const m of texto.matchAll(/\d{5}[.\s]?\d{5}\s+\d{5}[.\s]?\d{6}\s+\d{5}[.\s]?\d{6}\s+\d\s+\d{14}/g)) achados.push(dig(m[0]));
  for (const m of texto.matchAll(/\d{47}/g)) achados.push(m[0]);
  const linha = achados.find(linhaValida);
  if (!linha) {
    const conta = texto.match(/8\d{10}[-\s]?\d\s+\d{11}[-\s]?\d\s+\d{11}[-\s]?\d\s+\d{11}[-\s]?\d/);   // conta de consumo / tributo (48)
    return conta ? { linha: dig(conta[0]), banco: null, valor: Number(dig(conta[0]).slice(4, 15)) / 100 || null, vencimento: null } : null;
  }
  return { linha, banco: linha.slice(0, 3), valor: Number(linha.slice(37)) / 100 || null, vencimento: vencimentoDoFator(Number(linha.slice(33, 37))) };
}
function beneficiario(texto: string) {
  const cnpjs = [...texto.matchAll(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g)].map((m) => dig(m[0])).filter((c) => c.length === 14 && !NOSSOS_CNPJ.includes(c));
  // o nome vem logo depois de "Beneficiário"; corta onde começam outros campos do boleto (agência, nosso número, CNPJ…)
  let nome = texto.match(/(?:Benefici[aá]rio|Cedente)(?:\s*final)?\s*[:\-]?\s*([A-Za-zÀ-ú][^\n\r]{2,120})/i)?.[1] ?? null;
  nome = nome?.split(/\s*(?:CNPJ|CPF|Nosso\s*N|Ag[eê]ncia|C[oó]digo|Data|Vencimento|Valor|Parcela|\d{4,})/i)[0]?.trim() ?? null;
  return { cnpj: cnpjs[0] ?? null, nome: nome && nome.length >= 3 ? nome.slice(0, 120) : null };
}
/** Razão social pelo CNPJ: cadastro do Tiny e, se não tiver, a consulta pública (BrasilAPI). */
async function nomeDoCnpj(cnpj: string | null) {
  if (!cnpj) return null;
  const { data: c } = await sb.from("contatos_tiny").select("nome").eq("doc", cnpj).limit(1).maybeSingle();
  if (c?.nome) return c.nome;
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) { const j = await r.json(); return j.nome_fantasia ? `${j.nome_fantasia} (${j.razao_social})` : j.razao_social ?? null; }
  } catch { /* consulta pública fora do ar: fica o nome lido do boleto */ }
  return null;
}
async function pdfTexto(bytes: Uint8Array) {
  try { const pdf = await getDocumentProxy(bytes); const { text } = await extractText(pdf, { mergePages: true }); return String(text ?? ""); }
  catch { return ""; }
}
async function registrarBoleto(b: any, ben: any, de: string, emailId: number, anexoId: number | null) {
  const alertas: string[] = [];
  let fornecedor: any = null;
  if (ben.cnpj) ({ data: fornecedor } = await sb.from("fornecedores").select("id,nome,email").eq("cnpj", ben.cnpj).maybeSingle());
  if (!fornecedor && ben.cnpj) { const { data: l } = await sb.from("fornecedores").select("id,nome,email,cnpj"); fornecedor = (l ?? []).find((f: any) => dig(f.cnpj) === ben.cnpj) ?? null; }
  if (!ben.cnpj) alertas.push("não achei o CNPJ do beneficiário no boleto");
  else if (!fornecedor) alertas.push("CNPJ do beneficiário não está no cadastro de fornecedores");
  if (fornecedor?.email && de && de.split("@")[1] && !String(fornecedor.email).toLowerCase().includes(de.split("@")[1].toLowerCase())) alertas.push(`e-mail veio de @${de.split("@")[1]}, diferente do cadastro do fornecedor`);
  if (ben.cnpj && b.banco) {
    const { data: ant } = await sb.from("boletos_pagar").select("banco").eq("cnpj", ben.cnpj).neq("linha", b.linha).limit(20);
    const bancos = [...new Set((ant ?? []).map((x: any) => x.banco).filter(Boolean))];
    if (bancos.length && !bancos.includes(b.banco)) alertas.push(`banco ${b.banco} diferente dos boletos anteriores deste CNPJ (${bancos.join(", ")})`);
  }
  if (b.vencimento && b.vencimento < new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)) alertas.push("vencimento já passou");
  if (!fornecedor) ben = { ...ben, nome: (await nomeDoCnpj(ben.cnpj)) ?? ben.nome };
  const { data, error } = await sb.from("boletos_pagar").upsert({ linha: b.linha, banco: b.banco, valor: b.valor, vencimento: b.vencimento, beneficiario: fornecedor?.nome ?? ben.nome,
    cnpj: ben.cnpj, fornecedor_id: fornecedor?.id ?? null, alerta: alertas.join(" · ") || null, email_id: emailId, anexo_id: anexoId }, { onConflict: "linha", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw new Error("boleto: " + error.message);
  return { tipo: "boleto", id: data?.id ?? null, duplicado: !data, valor: b.valor, vencimento: b.vencimento, beneficiario: fornecedor?.nome ?? ben.nome, cnpj: ben.cnpj, alerta: alertas.join(" · ") || null };
}

// ─── NF-e / NFS-e (XML) ───
const tag = (x: string, t: string, dentro?: string) => { const base = dentro ? (x.match(new RegExp(`<${dentro}[\\s>][\\s\\S]*?</${dentro}>`))?.[0] ?? "") : x; return base.match(new RegExp(`<(?:\\w+:)?${t}>([^<]*)</(?:\\w+:)?${t}>`))?.[1]?.trim() ?? null; };
function lerNF(xml: string) {
  if (/<infNFe/.test(xml)) {
    const chave = xml.match(/Id="NFe(\d{44})"/)?.[1] ?? tag(xml, "chNFe");
    return { tipo: "nfe", chave, numero: tag(xml, "nNF", "ide"), emitente: tag(xml, "xNome", "emit"), cnpj: tag(xml, "CNPJ", "emit"), emissao: tag(xml, "dhEmi") ?? tag(xml, "dEmi"), valor: Number(tag(xml, "vNF")) || null };
  }
  if (/Nfse|NFSe|CompNfse/i.test(xml)) {
    const numero = tag(xml, "Numero"), cnpj = xml.match(/<(?:\w+:)?Cnpj>(\d{14})</)?.[1] ?? null;
    return { tipo: "nfse", chave: cnpj && numero ? `nfse:${cnpj}:${numero}` : null, numero, emitente: tag(xml, "RazaoSocial"), cnpj, emissao: tag(xml, "DataEmissao"), valor: Number(tag(xml, "ValorServicos") ?? tag(xml, "ValorLiquidoNfse")) || null };
  }
  return null;
}
async function registrarNF(nf: any, emailId: number, anexoId: number | null) {
  if (!nf.chave) return { ...nf, aviso: "sem chave" };
  const emissao = nf.emissao && !isNaN(Date.parse(nf.emissao)) ? new Date(nf.emissao).toISOString() : null;
  const { data } = await sb.from("nfs_recebidas").upsert({ chave: nf.chave, tipo: nf.tipo, numero: nf.numero, emitente: nf.emitente, cnpj: nf.cnpj, emissao, valor: nf.valor, email_id: emailId, anexo_id: anexoId },
    { onConflict: "chave", ignoreDuplicates: true }).select("id").maybeSingle();
  let entrada = null;
  if (nf.tipo === "nfe") { const { data: e } = await sb.from("nf_entradas").select("id_tiny,status").eq("chave", nf.chave).maybeSingle(); entrada = e ?? null; }
  return { ...nf, id: data?.id ?? null, duplicado: !data, na_entrada: entrada };
}

// ─── Intelbras / Intelcamp (OS) ───
// A Intelcamp (assistência Intelbras) usa o SHOficina: "Orçamento Nº101201" (serviços + total + validade) e
// "Notificação de status da OS 101346" (status: AGUARDANDO AVALIAÇÃO DO TÉCNICO …). Cada e-mail traz a OS deles, o modelo e o nº de série.
// Liga à nossa OS que está na assistência (RMA aberto): pela OS deles já conhecida, pelo nº de série igual (certa)
// ou com 1 caractere diferente (provável: só avisa, quem confere confirma no e-mail).
// Quando é certa: guarda a OS deles e o status, avança a etapa da assistência (nunca volta) e, se for orçamento,
// cria o orçamento ao cliente como RASCUNHO (custo × margem) — ninguém recebe nada até a loja conferir e enviar.
const ENT: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', ordm: "º", ordf: "ª", deg: "°", ccedil: "ç", Ccedil: "Ç" };
for (const [l, s] of Object.entries({ a: "áàãâ", e: "éèẽê", i: "íìĩî", o: "óòõô", u: "úùũû" }))
  ["acute", "grave", "tilde", "circ"].forEach((k, i) => { ENT[l + k] = s[i]; ENT[l.toUpperCase() + k] = s[i].toUpperCase(); });
const entidades = (s: string) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, c) => c[0] === "#" ? String.fromCodePoint(c[1].toLowerCase() === "x" ? parseInt(c.slice(2), 16) : Number(c.slice(1))) : ENT[c] ?? m);
/** HTML → texto com uma linha por bloco (td, p, br, div…), para ler os campos do SHOficina. */
const htmlTexto = (h: string) => entidades(h.replace(/<(style|head|script)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<(br|\/p|\/tr|\/div|\/td|\/th|\/li|\/h\d)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " "));
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const valorBR = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
/** Nº de série sem o "NS:" que a loja digita na frente, sem espaço, ponto e traço. */
const serieNorm = (s: unknown) => String(s ?? "").toUpperCase().replace(/^\s*N\s*[º°.]?\s*S(?:[EÉ]RIE)?\b\s*[:.\-]?\s*/, "").replace(/[^A-Z0-9]/g, "");
function distancia(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return 9;
  let ant = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    ant = cur;
  }
  return ant[b.length];
}
const ORDEM_ETAPA = ["enviado", "recebido", "em_analise", "orcamento", "aprovado", "finalizado"];
const posEtapa = (e: string) => e === "recusado" ? 4 : ORDEM_ETAPA.indexOf(e || "enviado");
function etapaDoStatus(st: string) {
  const s = semAcento(st);
  if (/PRONTO|CONSERTAD|FINALIZAD|AGUARDANDO RETIRADA|SEM CONSERTO|ENTREGUE|LIBERAD/.test(s)) return "finalizado";
  if (/APROVAD|EM CONSERTO|EM MANUTENC|EM REPARO/.test(s)) return "aprovado";
  if (/AGUARDANDO AVALIAC|RECEBID|ENTRADA|NA FILA/.test(s)) return "recebido";
  if (/AVALIAC|ANALISE|ORCAMENTO|AGUARDANDO APROVAC/.test(s)) return "em_analise";
  return null;
}

function lerSHOficina(texto: string, assunto: string) {
  const linhas = texto.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const campo = (rot: RegExp) => {
    const i = linhas.findIndex((l) => rot.test(l)); if (i < 0) return null;
    const resto = linhas[i].replace(rot, "").replace(/^[\s:]+/, "").trim();
    return (resto || linhas[i + 1] || "").trim() || null;
  };
  const os = assunto.match(/N[º°o]\s*(\d{4,})|\bOS\s*(\d{4,})/i)?.slice(1).find(Boolean) ?? campo(/^(?:Ordem de servi[cç]o|OS)\s*:?/i)?.match(/\d{4,}/)?.[0] ?? null;
  const serie = campo(/^N[º°o.]?\s*de\s*S[ée]rie\s*:?/i);
  const terceiros = campo(/^N[º°o.]?\s*OS\s*Terceiros\s*:?/i);
  const corrido = linhas.join(" ");
  const status = corrido.match(/status:\s*(.+?)\s*(?:Para consultar|Qualquer d[uú]vida|$)/i)?.[1]?.trim() ?? null;
  // orçamento: linhas "descrição  1,00x  R$ 390,00" entre "Valores do Orçamento" e "Totais"
  const bloco = corrido.match(/Valores do Or[cç]amento([\s\S]*?)(?:Totais|TOTAL\s+R\$)/i)?.[1] ?? "";
  const itens: any[] = [];
  let ini = 0;
  for (const m of bloco.matchAll(/(\d+(?:,\d+)?)\s*x\s+R\$\s*([\d.]+,\d{2})/gi)) {
    const descricao = bloco.slice(ini, m.index).replace(/(Servi[cç]os a executar|Pe[cç]as(?: a utilizar| e produtos)?|Produtos|Horas|Qtd\.?|Quantidade|Valor(?: unit[aá]rio| total)?)(?![\wÀ-ú])\s*/gi, " ").replace(/\s+/g, " ").trim();
    itens.push({ descricao: descricao.slice(0, 200) || "Serviço da assistência", qtd: valorBR(m[1]) || 1, custo: valorBR(m[2]) });
    ini = (m.index ?? 0) + m[0].length;
  }
  const total = [...corrido.matchAll(/TOTAL\s+R\$\s*([\d.]+,\d{2})/gi)].map((m) => valorBR(m[1])).pop() ?? null;
  // o valor da linha pode ser unitário: se só "qtd × valor" fecha o total, usa assim
  if (total && itens.length && Math.abs(itens.reduce((s, i) => s + i.custo, 0) - total) > 0.05 && Math.abs(itens.reduce((s, i) => s + i.custo * i.qtd, 0) - total) <= 0.05) itens.forEach((i) => { i.custo = Math.round(i.custo * i.qtd * 100) / 100; });
  if (total && !itens.length) itens.push({ descricao: `Serviço conforme orçamento da assistência (OS ${os ?? "?"})`, qtd: 1, custo: total });
  const validade = Number(corrido.match(/validade (?:at[eé]|de)\s*(\d+)\s*dias/i)?.[1]) || null;
  return { os, serie, serie_norm: serieNorm(serie), modelo: campo(/^Modelo\s*:?/i), aparelho: campo(/^Aparelho\s*:?/i), terceiros: terceiros && !/^S\/?N$/i.test(terceiros) ? terceiros : null,
    status, orcamento: /Or[cç]amento/i.test(assunto) || itens.length > 0, itens, total, validade_dias: validade };
}

/** Acha a nossa OS na assistência (RMA aberto) para o e-mail: certa (OS deles já ligada ou série igual) ou provável (série com 1 caractere diferente). */
async function acharOS(l: any) {
  const { data: rmas } = await sb.from("at_rma").select("id,os_id,assistencia,etapa,os_assistencia,at_os!inner(id,numero,cliente_nome,status,numero_serie,produto_descricao,token,avisar_whatsapp,avisar_email,cliente_fone,cliente_email)")
    .is("retornou_em", null).not("at_os.status", "in", "(entregue,cancelado)");
  const lista = rmas ?? [];
  if (l.os) { const r = lista.filter((x: any) => x.os_assistencia === l.os); if (r.length) return { certeza: "certa", por: "os", rmas: r }; }
  if (!l.serie_norm || l.serie_norm.length < 6) return { certeza: null, rmas: [] };
  const ids = lista.map((x: any) => x.os_id);
  const { data: itens } = ids.length ? await sb.from("at_os_itens").select("os_id,numero_serie").in("os_id", ids).not("numero_serie", "is", null) : { data: [] };
  const series = (r: any) => [r.at_os.numero_serie, ...(itens ?? []).filter((i: any) => i.os_id === r.os_id).map((i: any) => i.numero_serie)].map(serieNorm).filter((s) => s.length >= 6);
  const iguais = lista.filter((r: any) => series(r).includes(l.serie_norm));
  if (iguais.length) return { certeza: "certa", por: "serie", rmas: iguais };
  const perto = lista.filter((r: any) => l.serie_norm.length >= 8 && series(r).some((s) => distancia(s, l.serie_norm) <= 1));
  return perto.length ? { certeza: "provavel", por: "serie_parecida", rmas: perto } : { certeza: null, rmas: [] };
}

async function eventoUnico(osId: number, status: string, texto: string, publico = false) {
  const { data: ja } = await sb.from("at_eventos").select("id").eq("os_id", osId).eq("texto", texto).limit(1).maybeSingle();
  if (!ja) await sb.from("at_eventos").insert({ os_id: osId, status, texto, publico, por: null });
}

/** Lê o e-mail da caixa os.intelbras@ e aplica na OS. forcarRma = a loja confirmou qual é a OS (botão no e-mail). */
async function processarOS(emailId: number, assunto: string, texto: string, quando: string, forcarRma?: number) {
  const l = lerSHOficina(texto, assunto);
  const valores = [...new Set([...texto.matchAll(/R\$\s*([\d.]+,\d{2})/g)].map((m) => valorBR(m[1])).filter((v) => v > 0))].slice(0, 10);
  let achado: any;
  if (forcarRma) {
    const { data: r } = await sb.from("at_rma").select("id,os_id,assistencia,etapa,os_assistencia,at_os!inner(id,numero,cliente_nome,status,numero_serie,produto_descricao,token)").eq("id", forcarRma).maybeSingle();
    achado = r ? { certeza: "certa", por: "confirmado", rmas: [r] } : { certeza: null, rmas: [] };
  } else achado = await acharOS(l);
  const base = { tipo: "os", fonte: "intelcamp", intelcamp: { os: l.os, modelo: l.modelo, serie: l.serie, terceiros: l.terceiros, status: l.status }, certeza: achado.certeza, por: achado.por ?? null, valores,
    os: achado.rmas.map((r: any) => ({ id: r.os_id, numero: r.at_os.numero, cliente: r.at_os.cliente_nome, status: r.at_os.status, rma_id: r.id, serie: r.at_os.numero_serie })) };
  if (!l.os && !l.serie_norm) return base;
  const quem = `Intelcamp (OS ${l.os ?? "?"})`;
  if (achado.certeza === "provavel") {
    for (const r of achado.rmas) await eventoUnico(r.os_id, r.at_os.status, `📧 ${quem}: e-mail com nº de série ${l.serie} parecido com o desta OS (${r.at_os.numero_serie}). Confira na Caixa de e-mails e confirme se é esta OS.`);
    return base;
  }
  if (achado.certeza !== "certa" || achado.rmas.length !== 1) return base;

  const r = achado.rmas[0], o = r.at_os;
  const { data: cfgs } = await sb.from("config").select("chave,valor").eq("chave", "assistencia").maybeSingle();
  const cfg: any = cfgs?.valor ?? {};
  const nova = l.orcamento ? "em_analise" : etapaDoStatus(l.status ?? "");
  const situacao = l.orcamento && l.total ? `Orçamento de ${l.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : l.status;
  const upd: any = { situacao_em: quando };
  if (l.os) upd.os_assistencia = l.os;
  if (situacao) upd.situacao_assistencia = situacao.slice(0, 200);
  if (nova && posEtapa(nova) > posEtapa(r.etapa)) upd.etapa = nova;
  const { error: eu } = await sb.from("at_rma").update(upd).eq("id", r.id);
  if (eu) throw new Error("etapa: " + eu.message);
  const res: any = { ...base, etapa: upd.etapa ?? r.etapa, etapa_mudou: !!upd.etapa };
  if (l.status) await eventoUnico(r.os_id, o.status, `📧 ${quem}: status "${l.status}"${upd.etapa ? " — etapa da assistência atualizada" : ""}.`);

  if (l.orcamento && l.itens.length) {
    const margem = Number(cfg.margem_orcamento) || 1.6, arred = (v: number) => (cfg.orcamento_arredondar ?? "inteiro") === "inteiro" ? Math.ceil(v - 1e-9) : Math.round(v * 100) / 100;
    const itens = l.itens.map((i: any) => ({ descricao: i.descricao, custo: i.custo, valor: arred(i.custo * margem) }));
    const custo = itens.reduce((s: number, i: any) => s + i.custo, 0), valor = itens.reduce((s: number, i: any) => s + i.valor, 0);
    const dias = Math.min(Number(cfg.orcamento_validade_dias) || 7, l.validade_dias || 99);
    const validade = new Date(new Date(quando).getTime() - 3 * 3600e3 + dias * 864e5).toISOString().slice(0, 10);
    // a loja já lançou este orçamento à mão (mesmo custo, ainda valendo): não duplica
    const { data: manual } = await sb.from("at_orcamentos").select("id,status").eq("os_id", r.os_id).in("status", ["rascunho", "enviado", "aprovado"]).eq("custo_total", custo).or(`email_id.is.null,email_id.neq.${emailId}`).limit(1).maybeSingle();
    if (manual) { res.orcamento = { id: manual.id, ja_lancado: true, status: manual.status, custo }; return res; }
    const { data: atual } = await sb.from("at_orcamentos").select("id").eq("os_id", r.os_id).eq("email_id", emailId).maybeSingle();
    const { data: q, error: eq } = atual ? { data: null, error: null } : await sb.from("at_orcamentos").insert({ os_id: r.os_id, rma_id: r.id, itens, custo_total: custo, margem, frete: 0, valor_cliente: valor,
      taxa_recusa: Number(cfg.taxa_recusa) || 0, validade, status: "rascunho", email_id: emailId, origem: "email", criado_por: null }).select("id").single();
    if (eq) throw new Error("orçamento: " + eq.message);
    if (q) await sb.from("at_rma").update({ custo }).eq("id", r.id);
    const R$ = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    await eventoUnico(r.os_id, o.status, `📧 ${quem}: orçamento de ${R$(custo)} recebido. Rascunho de ${R$(valor)} ao cliente criado — confira e envie pela OS.`);
    res.orcamento = { id: q?.id ?? atual?.id ?? null, novo: !!q, custo, valor, validade, itens: itens.length };
  }
  return res;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  // o Worker manda o e-mail cru (message/rfc822) com remetente/destino nos cabeçalhos; o JSON {de, para, raw base64} segue valendo
  const cru = (req.headers.get("content-type") ?? "").startsWith("message/");
  const corpo = cru ? { de: req.headers.get("x-email-de"), para: req.headers.get("x-email-para"), bytes: new Uint8Array(await req.arrayBuffer()) } : await req.json().catch(() => ({}));
  // reler um e-mail da caixa os.intelbras@ (servidor, ou alguém da Intranet que vê esse e-mail — p.ex. o botão "É esta OS")
  if (corpo.acao === "reler") {
    const id = Number(corpo.email_id), rma = corpo.rma_id ? Number(corpo.rma_id) : undefined;
    let pode = await autorizado(req);
    if (!pode && /^Bearer /i.test(req.headers.get("authorization") ?? "")) {
      const doUsuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("authorization")! } } });
      const { data: visto } = await doUsuario.from("emails").select("id").eq("id", id).eq("caixa", "os_intelbras").maybeSingle();
      const { data: rmaVisto } = rma ? await doUsuario.from("at_rma").select("id").eq("id", rma).maybeSingle() : { data: true };
      pode = !!visto && !!rmaVisto;
    }
    if (!pode) return json({ erro: "não autorizado" }, 401);
    const { data: e } = await sb.from("emails").select("id,assunto,texto,html,recebido_em,processado,caixa").eq("id", id).maybeSingle();
    if (!e || e.caixa !== "os_intelbras") return json({ erro: "e-mail não encontrado na caixa os.intelbras" }, 404);
    try {
      const lido = await processarOS(e.id, e.assunto ?? "", `${e.assunto ?? ""}\n${e.texto ?? ""}\n${htmlTexto(e.html ?? "")}`, e.recebido_em, rma);
      const proc = [...(e.processado ?? []).filter((p: any) => p.tipo !== "os"), lido];
      const ref = lido.certeza === "certa" && lido.os.length === 1 ? ["os", String(lido.os[0].id)] : [null, null];
      await sb.from("emails").update({ processado: proc, erro: null, ref_tipo: ref[0], ref_id: ref[1] }).eq("id", e.id);
      return json({ ok: true, id: e.id, lido });
    } catch (x) { return json({ erro: String((x as Error).message).slice(0, 300) }, 500); }
  }
  if (!(await autorizado(req))) return json({ erro: "não autorizado" }, 401);
  // manutenção: apaga do bucket os anexos de e-mails que não existem mais (pasta = id do e-mail)
  if (corpo.acao === "limpar_orfaos") {
    const { data: pastas } = await sb.storage.from("emails").list("", { limit: 1000 });
    const ids = (pastas ?? []).map((p: any) => p.name).filter((n: string) => /^\d+$/.test(n));
    const { data: vivos } = ids.length ? await sb.from("emails").select("id").in("id", ids.map(Number)) : { data: [] };
    const orfas = ids.filter((n: string) => !(vivos ?? []).some((v: any) => String(v.id) === n));
    let apagados = 0;
    for (const p of orfas) {
      const { data: arqs } = await sb.storage.from("emails").list(p, { limit: 1000 });
      const nomes = (arqs ?? []).map((a: any) => `${p}/${a.name}`);
      if (nomes.length) { await sb.storage.from("emails").remove(nomes); apagados += nomes.length; }
    }
    return json({ ok: true, pastas_orfas: orfas.length, apagados });
  }
  if (!corpo.raw && !corpo.bytes?.length) return json({ erro: "faltou o e-mail (raw)" }, 400);
  const bruto: Uint8Array = corpo.bytes ?? deB64(corpo.raw);
  const m: any = await PostalMime.parse(bruto);
  const para = String(corpo.para || m.to?.[0]?.address || "").toLowerCase(), de = String(corpo.de || m.from?.address || "").toLowerCase();
  const caixa = CAIXAS[para.split("@")[0]] ?? "outros";
  const messageId = m.messageId || null;
  if (messageId) {
    const { data: ja } = await sb.from("emails").select("id").eq("message_id", messageId).eq("direcao", "entrada").maybeSingle();
    if (ja) return json({ ok: true, duplicado: true, id: ja.id });
  }
  const { data: e, error } = await sb.from("emails").insert({
    direcao: "entrada", caixa, de, de_nome: m.from?.name || null, para, cc: (m.cc ?? []).map((x: any) => x.address).join(", ") || null,
    assunto: (m.subject || "(sem assunto)").slice(0, 500), texto: (m.text || "").slice(0, 200_000), html: (m.html || "").slice(0, 400_000) || null,
    message_id: messageId, em_resposta_a: m.inReplyTo || null, recebido_em: m.date && !isNaN(Date.parse(m.date)) ? new Date(m.date).toISOString() : new Date().toISOString(), tamanho: bruto.length,
  }).select("id").single();
  if (error) return json({ erro: error.message }, 500);

  const lidos: any[] = [], erros: string[] = [];
  let textoTodo = `${m.subject ?? ""}\n${m.text ?? ""}\n${htmlTexto(m.html ?? "")}`;
  for (const [i, a] of (m.attachments ?? []).entries()) {
    const bytes = a.content instanceof ArrayBuffer ? new Uint8Array(a.content) : typeof a.content === "string" ? new TextEncoder().encode(a.content) : new Uint8Array(a.content);
    const nome = a.filename || `anexo-${i + 1}`, caminho = `${e.id}/${i + 1}-${nomeSeguro(nome)}`;
    const up = await sb.storage.from("emails").upload(caminho, bytes, { contentType: a.mimeType || "application/octet-stream", upsert: true });
    if (up.error) { erros.push(`anexo ${nome}: ${up.error.message}`); continue; }
    const { data: an } = await sb.from("email_anexos").insert({ email_id: e.id, nome, tipo: a.mimeType || null, tamanho: bytes.length, caminho }).select("id").single();
    try {
      if (/xml/i.test(a.mimeType ?? "") || /\.xml$/i.test(nome)) {
        const nf = lerNF(new TextDecoder().decode(bytes));
        if (nf) lidos.push(await registrarNF(nf, e.id, an?.id ?? null));
      } else if (/pdf/i.test(a.mimeType ?? "") || /\.pdf$/i.test(nome)) {
        const t = await pdfTexto(bytes); textoTodo += "\n" + t;
        const b = lerBoleto(t);
        if (b && (caixa === "boletos" || caixa === "outros" || /boleto/i.test(nome + (m.subject ?? "")))) lidos.push(await registrarBoleto(b, beneficiario(t), de, e.id, an?.id ?? null));
      }
    } catch (x) { erros.push(`${nome}: ${String((x as Error).message).slice(0, 150)}`); }
  }
  try {
    if (caixa === "boletos" && !lidos.some((l) => l.tipo === "boleto")) { const b = lerBoleto(textoTodo); if (b) lidos.push(await registrarBoleto(b, beneficiario(textoTodo), de, e.id, null)); }
    if (caixa === "os_intelbras") lidos.push(await processarOS(e.id, m.subject ?? "", textoTodo, m.date && !isNaN(Date.parse(m.date)) ? new Date(m.date).toISOString() : new Date().toISOString()));
  } catch (x) { erros.push(String((x as Error).message).slice(0, 150)); }

  const lOS = lidos.find((l) => l.tipo === "os"), os1 = lOS?.certeza === "certa" ? lOS.os : null;
  const ref = lidos.find((l) => l.tipo === "boleto" && l.id) ? ["boleto", String(lidos.find((l) => l.tipo === "boleto").id)]
    : lidos.find((l) => (l.tipo === "nfe" || l.tipo === "nfse") && l.id) ? ["nf", String(lidos.find((l) => l.id).id)] : os1?.length === 1 ? ["os", String(os1[0].id)] : [null, null];
  await sb.from("emails").update({ processado: lidos.length ? lidos : null, erro: erros.join(" | ") || null, ref_tipo: ref[0], ref_id: ref[1] }).eq("id", e.id);
  return json({ ok: true, id: e.id, caixa, lidos, erros });
});
