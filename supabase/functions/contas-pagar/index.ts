// Contas a pagar: resumo diário das 17h (pg_cron 'contas-pagar-17h', x-sync-secret).
// Liga boletos a notas (contas_pagar_preparar) e manda por e-mail ao dono o que pagar até o próximo dia útil + o que já venceu,
// com a linha digitável de cada boleto. Destino e remetente em config 'contas_pagar' {email, remetente, ativo}.
// O e-mail também fica na Caixa de e-mails da Intranet (Enviados) e o resumo em sync_estado 'contas_pagar'.
// Desde 18/11 a lista inclui as parcelas importadas da planilha do fornecedor e as lançadas à mão (aba Contas a pagar):
// essas podem não ter boleto ainda, e aí aparecem com o documento/parcela no lugar da linha digitável.
//  POST {}            rodada normal (envia)
//  POST {teste:true}  só monta o resumo e devolve, sem enviar
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const R = (v: unknown) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: string) => d ? d.split("-").reverse().join("/") : "—";
const linhaFmt = (l: string) => l?.length === 47 ? `${l.slice(0, 5)}.${l.slice(5, 10)} ${l.slice(10, 15)}.${l.slice(15, 21)} ${l.slice(21, 26)}.${l.slice(26, 32)} ${l[32]} ${l.slice(33)}` : (l ?? "");
const DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

Deno.serve(async (req) => {
  const { data: ok } = await sb.rpc("sync_segredo_ok", { s: req.headers.get("x-sync-secret") ?? "" });
  if (ok !== true) return json({ erro: "não autorizado" }, 401);
  const corpo = await req.json().catch(() => ({}));
  const { data: r, error } = await sb.rpc("contas_pagar_preparar");
  if (error) return json({ erro: error.message }, 500);
  await sb.from("sync_estado").upsert({ chave: "contas_pagar", valor: { ...r, em: new Date().toISOString() }, atualizado_em: new Date().toISOString() });

  const { data: cfgs } = await sb.from("config").select("chave,valor").in("chave", ["contas_pagar", "assistencia", "site"]);
  const cfg = Object.fromEntries((cfgs ?? []).map((c: any) => [c.chave, c.valor]));
  const cp = cfg.contas_pagar ?? {}, empresa = cfg.assistencia?.empresa ?? "Protemaxxi", site = cfg.site?.url ?? "";
  const pagar: any[] = r.pagar ?? [], vencidos = pagar.filter((b) => b.vencido), proximos = pagar.filter((b) => !b.vencido);
  // documento/parcela das contas da planilha e das lançadas à mão (contas_pagar_preparar não devolve esses campos)
  const ids = pagar.map((b) => b.id).filter(Boolean);
  const { data: extras } = ids.length ? await sb.from("boletos_pagar").select("id,documento,parcela,origem").in("id", ids) : { data: [] };
  const ext = Object.fromEntries((extras ?? []).map((x: any) => [x.id, x]));
  const doc = (b: any) => { const x = ext[b.id]; return x?.documento ? `${x.documento}${x.parcela ? " · parcela " + x.parcela : ""}` : ""; };
  const ate = new Date(r.ate + "T12:00:00Z"), quando = `${DIA[ate.getUTCDay()]}, ${dataBR(r.ate)}`;
  const assunto = pagar.length ? `${empresa} · Pagar até ${dataBR(r.ate)}: ${R(r.total)} (${pagar.length} conta${pagar.length > 1 ? "s" : ""})` : `${empresa} · Nada para pagar até ${dataBR(r.ate)}`;

  const linha = (b: any) => `<tr><td style="padding:8px;border-bottom:1px solid #eee"><b>${esc(b.beneficiario || "Fornecedor não identificado")}</b>
      ${doc(b) ? `<br><small style="color:#4D5B69">${esc(doc(b))}</small>` : ""}
      ${b.nf_numero ? `<br><small style="color:#4D5B69">NF ${esc(b.nf_numero)}${b.vinculo === "provavel" ? " (provável)" : ""}${b.nf_valor ? " · nota de " + R(b.nf_valor) : ""}</small>` : ""}
      ${b.alerta ? `<br><small style="color:#C53030">⚠ ${esc(b.alerta)}</small>` : ""}
      <br>${b.linha ? `<small style="font-family:monospace;color:#11202F">${esc(linhaFmt(b.linha))}</small>` : `<small style="color:#B7791F">boleto ainda não chegou por e-mail</small>`}</td>
    <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${b.vencido ? `<b style="color:#C53030">venceu ${dataBR(b.vencimento)}</b>` : dataBR(b.vencimento)}</td>
    <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap"><b>${R(b.valor)}</b></td></tr>`;
  const tabela = (l: any[], tit: string) => l.length ? `<h3 style="margin:18px 0 6px">${tit}</h3><table style="width:100%;border-collapse:collapse;font-size:14px">${l.map(linha).join("")}</table>` : "";
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#11202F;max-width:640px">
    <div style="background:#0E1A2B;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:bold">${esc(empresa)} · Contas a pagar</div>
    <div style="border:1px solid #E8DFD3;border-top:0;padding:20px;border-radius:0 0 12px 12px">
      ${pagar.length ? `<p>Para pagar até <b>${quando}</b>: <b style="font-size:20px">${R(r.total)}</b></p>` : `<p>Nenhuma conta para pagar até <b>${quando}</b>.</p>`}
      ${tabela(vencidos, "Já vencidas (ainda em aberto)")}${tabela(proximos, `Vencem até ${dataBR(r.ate)}`)}
      <p style="color:#4D5B69;font-size:13px;margin-top:18px">Próximos 7 dias depois disso: ${R(r.proximos_7)}${r.sem_vencimento ? ` · ${r.sem_vencimento} sem vencimento lido` : ""}.
      Depois de pagar, marque como paga na Intranet (Financeiro › Contas a pagar)${site ? `: <a href="${esc(site)}#/contas">abrir</a>` : ""}.</p></div></div>`;
  const texto = pagar.length ? `Pagar até ${quando}: ${R(r.total)}\n` + pagar.map((b) => `- ${b.beneficiario || "?"}${doc(b) ? " · " + doc(b) : ""} · ${dataBR(b.vencimento)} · ${R(b.valor)}${b.vencido ? " (VENCIDA)" : ""}\n  ${b.linha ? linhaFmt(b.linha) : "boleto ainda não chegou por e-mail"}`).join("\n") : `Nada para pagar até ${quando}.`;

  if (corpo.teste) return json({ ok: true, teste: true, assunto, resumo: r });
  const chave = Deno.env.get("RESEND_API_KEY"), para = cp.email, de = cp.remetente || cfg.assistencia?.email_remetente;
  if (cp.ativo === false || !chave || !para || !de) return json({ ok: true, enviado: false, motivo: "desligado ou sem e-mail configurado", resumo: r });
  const env = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: de, to: [para], subject: assunto, html, text: texto }) });
  if (!env.ok) return json({ erro: `Resend ${env.status}: ${(await env.text()).slice(0, 200)}` }, 500);
  await sb.from("emails").insert({ direcao: "saida", caixa: "enviados", de, para, assunto, texto, html, recebido_em: new Date().toISOString(), lido_em: new Date().toISOString(), ref_tipo: "contas_pagar" });
  return json({ ok: true, enviado: true, para, total: r.total, boletos: pagar.length });
});
