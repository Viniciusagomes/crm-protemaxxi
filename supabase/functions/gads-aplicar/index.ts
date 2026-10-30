// Aplica na conta Google Ads as mudanças PROPOSTAS na fila gads_acoes. Só o dono aprova.
//  POST {acao:"testar",  id}            valida no Google sem alterar nada (validateOnly)
//  POST {acao:"aprovar", id}            aplica de verdade e registra o que fazer para desfazer
//  POST {acao:"recusar", id, motivo?}
//  POST {acao:"desfazer", id}           reverte uma ação aplicada
// Tipos: negativa_campanha · remover_negativa · pausar_palavra · orcamento_dia · local_presenca · vincular_extensoes · telefone_chamada
//        anuncio_textos · lance_campanha · status_campanha · campanha_pesquisa
// Nada aqui apaga campanhas, anúncios ou palavras: o máximo que faz é pausar/ativar uma campanha ou palavra, remover uma negativa
// ou tirar o vínculo de uma extensão com a campanha (a extensão continua na conta).
// Única exceção: desfazer "campanha_pesquisa" remove a campanha CRIADA POR ESSA AÇÃO, e só se ela nunca teve impressão.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { URL_SB, abrir, autorizadoCron, cors, json, sb, type Ads } from "./comum.ts";
import { montarCampanhaPesquisa } from "./campanha.js";

const CORRESP = ["BROAD", "PHRASE", "EXACT"];
const TIPOS_LOCAL = ["PRESENCE", "PRESENCE_OR_INTEREST"];
const CAMPOS_EXT = ["SITELINK", "CALLOUT", "STRUCTURED_SNIPPET"];
const LOCAIS_TIS = ["ANYWHERE_ON_PAGE", "TOP_OF_PAGE", "ABSOLUTE_TOP_OF_PAGE"];
/** Lista de títulos/descrições de RSA: [{t, fixo?}] → formato da API, conferindo tamanho, quantidade e repetição. */
function textosRSA(l: unknown, max: number, min: number, ate: number, nome: string) {
  const v = (Array.isArray(l) ? l : []).map((x: any) => ({ text: String(x?.t ?? x?.text ?? x ?? "").replace(/\s+/g, " ").trim(), pinnedField: x?.fixo ?? x?.pinnedField ?? undefined })).filter((x) => x.text);
  if (v.length < min || v.length > ate) throw new Error(`${nome}: são ${v.length}; o Google aceita de ${min} a ${ate}.`);
  const longo = v.find((x) => [...x.text].length > max); if (longo) throw new Error(`${nome} com mais de ${max} caracteres: "${longo.text}" (${[...longo.text].length}).`);
  const vistos = new Set<string>(); for (const x of v) { const k = x.text.toLowerCase(); if (vistos.has(k)) throw new Error(`${nome} repetido: "${x.text}".`); vistos.add(k); }
  return v.map((x) => (x.pinnedField ? x : { text: x.text }));
}
const limpar = (t: unknown) => String(t ?? "").replace(/["\[\]]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

async function campanhasValidas(ids: unknown): Promise<number[]> {
  const lista = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (!lista.length) throw new Error("Nenhuma campanha informada.");
  const { data } = await sb.from("gads_campanhas").select("id").in("id", lista);
  const ok = new Set((data ?? []).map((c) => Number(c.id)));
  const faltam = lista.filter((i) => !ok.has(i));
  if (faltam.length) throw new Error(`Campanha(s) desconhecida(s): ${faltam.join(", ")}. Sincronize e tente de novo.`);
  return lista;
}

async function executar(ads: Ads, a: any, teste: boolean): Promise<{ resultado: any; desfazer: any }> {
  const c = ads.cliente, alvo = a.alvo ?? {};
  const validateOnly = teste;

  if (a.tipo === "negativa_campanha") {
    const texto = limpar(alvo.texto), corr = String(alvo.correspondencia ?? "PHRASE").toUpperCase();
    if (!texto || texto.length > 80 || texto.split(" ").length > 10) throw new Error("Palavra negativa inválida (1 a 80 caracteres, até 10 palavras).");
    if (!CORRESP.includes(corr)) throw new Error("Correspondência inválida.");
    const ids = await campanhasValidas(alvo.campanha_ids);
    const r = await ads.mutar("campaignCriteria", { operations: ids.map((id) => ({ create: { campaign: `customers/${c}/campaigns/${id}`, negative: true, keyword: { text: texto, matchType: corr } } })), validateOnly });
    const recursos = (r.results ?? []).map((x: any) => x.resourceName).filter(Boolean);
    return { resultado: { campanhas: ids, texto, correspondencia: corr, recursos }, desfazer: recursos.length ? { tipo: "remover_negativa", recursos } : null };
  }

  if (a.tipo === "remover_negativa") {
    const recursos: string[] = (Array.isArray(alvo.recursos) ? alvo.recursos : []).map(String);
    if (!recursos.length) throw new Error("Nenhuma negativa informada.");
    const { data: linhas } = await sb.from("gads_negativas").select("*").in("recurso", recursos);
    if ((linhas ?? []).length !== recursos.length) throw new Error("Há negativa que não está na lista sincronizada. Sincronize e tente de novo.");
    const deCampanha = recursos.filter((x) => x.includes("/campaignCriteria/")), deGrupo = recursos.filter((x) => x.includes("/adGroupCriteria/"));
    if (deCampanha.length) await ads.mutar("campaignCriteria", { operations: deCampanha.map((resourceName) => ({ remove: resourceName })), validateOnly });
    if (deGrupo.length) await ads.mutar("adGroupCriteria", { operations: deGrupo.map((resourceName) => ({ remove: resourceName })), validateOnly });
    const recria = (linhas ?? []).filter((l) => l.nivel === "campanha").map((l) => ({ campanha_id: l.campanha_id, texto: l.texto, correspondencia: l.correspondencia }));
    return { resultado: { removidas: recursos.length }, desfazer: recria.length ? { tipo: "recriar_negativas", itens: recria } : null };
  }

  if (a.tipo === "pausar_palavra") {
    const grupo = Number(alvo.grupo_id), crit = Number(alvo.criterio_id), novo = String(alvo.status ?? "PAUSED").toUpperCase();
    if (!grupo || !crit || !["PAUSED", "ENABLED"].includes(novo)) throw new Error("Palavra ou situação inválida.");
    const { data: p } = await sb.from("gads_palavras").select("status,texto").eq("grupo_id", grupo).eq("criterio_id", crit).maybeSingle();
    if (!p) throw new Error("Palavra não encontrada na lista sincronizada.");
    await ads.mutar("adGroupCriteria", { operations: [{ update: { resourceName: `customers/${c}/adGroupCriteria/${grupo}~${crit}`, status: novo }, updateMask: "status" }], validateOnly });
    return { resultado: { palavra: p.texto, de: p.status, para: novo }, desfazer: { tipo: "pausar_palavra", alvo: { grupo_id: grupo, criterio_id: crit, status: p.status } } };
  }

  if (a.tipo === "orcamento_dia") {
    const id = Number(alvo.campanha_id), novo = Number(alvo.novo_valor);
    if (!id || !(novo > 0)) throw new Error("Campanha ou valor inválido.");
    const { data: camp } = await sb.from("gads_campanhas").select("orcamento_id,orcamento_dia,nome").eq("id", id).maybeSingle();
    if (!camp?.orcamento_id) throw new Error("Orçamento da campanha não encontrado. Sincronize e tente de novo.");
    const atual = Number(camp.orcamento_dia), limite = Number(ads.cfg.limite_orcamento_pct ?? 50);
    if (atual > 0 && Math.abs(novo - atual) / atual * 100 > limite) throw new Error(`Mudança de ${Math.round(Math.abs(novo - atual) / atual * 100)}% passa do limite de ${limite}% por vez (de R$ ${atual} para R$ ${novo}). Faça em etapas.`);
    await ads.mutar("campaignBudgets", { operations: [{ update: { resourceName: `customers/${c}/campaignBudgets/${camp.orcamento_id}`, amountMicros: String(Math.round(novo * 1e6)) }, updateMask: "amountMicros" }], validateOnly });
    return { resultado: { campanha: camp.nome, de: atual, para: novo }, desfazer: { tipo: "orcamento_dia", alvo: { campanha_id: id, novo_valor: atual } } };
  }

  if (a.tipo === "local_presenca") {
    const ids = await campanhasValidas(alvo.campanha_ids), valor = String(alvo.valor ?? "PRESENCE").toUpperCase(), por = alvo.por_campanha ?? {};
    for (const v of [valor, ...Object.values(por).map(String)]) if (!TIPOS_LOCAL.includes(v)) throw new Error(`Tipo de local inválido: ${v}.`);
    const antes = await ads.gaql(`SELECT campaign.id, campaign.geo_target_type_setting.positive_geo_target_type FROM campaign WHERE campaign.id IN (${ids.join(",")})`);
    const de = Object.fromEntries(antes.map((x: any) => [String(x.campaign.id), x.campaign.geoTargetTypeSetting?.positiveGeoTargetType ?? "PRESENCE_OR_INTEREST"]));
    await ads.mutar("campaigns", { operations: ids.map((id) => ({ update: { resourceName: `customers/${c}/campaigns/${id}`, geoTargetTypeSetting: { positiveGeoTargetType: por[id] ?? valor } },
      updateMask: "geo_target_type_setting.positive_geo_target_type" })), validateOnly });
    if (!teste) for (const id of ids) await sb.from("gads_campanhas").update({ local_tipo: por[id] ?? valor }).eq("id", id);
    return { resultado: { campanhas: ids, de, para: valor }, desfazer: { tipo: "local_presenca", alvo: { campanha_ids: ids, por_campanha: de } } };
  }

  if (a.tipo === "vincular_extensoes") {
    const ids = await campanhasValidas(alvo.campanha_ids), campo = String(alvo.campo ?? "").toUpperCase();
    if (!CAMPOS_EXT.includes(campo)) throw new Error("Tipo de extensão inválido.");
    const assets = [...new Set((Array.isArray(alvo.asset_ids) ? alvo.asset_ids : []).map(Number).filter((n: number) => n > 0))];
    const { data: conhecidos } = await sb.from("gads_recursos").select("asset_id,campanha_id,nivel").eq("campo", campo).in("asset_id", assets.length ? assets : [0]);
    if (!assets.length || new Set((conhecidos ?? []).map((x) => Number(x.asset_id))).size !== assets.length) throw new Error("Extensão que não está na lista sincronizada. Sincronize e tente de novo.");
    const ja = new Set((conhecidos ?? []).filter((x) => x.nivel === "campanha").map((x) => `${x.campanha_id}~${x.asset_id}`));
    const pares = ids.flatMap((id) => assets.map((as) => ({ id, as }))).filter((x) => !ja.has(`${x.id}~${x.as}`));
    if (!pares.length) throw new Error("Essas extensões já estão em todas as campanhas escolhidas.");
    const r = await ads.mutar("campaignAssets", { operations: pares.map((x) => ({ create: { campaign: `customers/${c}/campaigns/${x.id}`, asset: `customers/${c}/assets/${x.as}`, fieldType: campo } })), validateOnly });
    const recursos = (r.results ?? []).map((x: any) => x.resourceName).filter(Boolean);
    return { resultado: { vinculos: pares.length, campo, campanhas: ids }, desfazer: recursos.length ? { tipo: "remover_vinculos", recursos } : null };
  }

  if (a.tipo === "telefone_chamada") {
    const ids = await campanhasValidas(alvo.campanha_ids), fone = String(alvo.telefone ?? "").replace(/\D/g, "");
    if (fone && !/^\d{10,11}$/.test(fone)) throw new Error("Telefone inválido (DDD + número).");
    const fmt = !fone ? null : fone.length === 11 ? `(${fone.slice(0, 2)}) ${fone.slice(2, 7)}-${fone.slice(7)}` : `(${fone.slice(0, 2)}) ${fone.slice(2, 6)}-${fone.slice(6)}`;
    const { data: velhos } = await sb.from("gads_recursos").select("recurso,asset_id,campanha_id,texto").eq("nivel", "campanha").eq("campo", "CALL").neq("status", "REMOVED").in("campanha_id", ids);
    const ops: any[] = (velhos ?? []).map((v) => ({ campaignAssetOperation: { remove: v.recurso } }));
    if (fmt) ops.push({ assetOperation: { create: { resourceName: `customers/${c}/assets/-1`, callAsset: { countryCode: "BR", phoneNumber: fmt } } } },
      ...ids.map((id) => ({ campaignAssetOperation: { create: { campaign: `customers/${c}/campaigns/${id}`, asset: `customers/${c}/assets/-1`, fieldType: "CALL" } } })));
    if (!ops.length) throw new Error("Nada a mudar: as campanhas não têm telefone.");
    const r = await ads.chamar(`customers/${c}/googleAds:mutate`, { mutateOperations: ops, validateOnly });
    const novos = (r.mutateOperationResponses ?? []).map((x: any) => x.campaignAssetResult?.resourceName).filter((x: any) => x && !(velhos ?? []).some((v) => v.recurso === x));
    return { resultado: { de: [...new Set((velhos ?? []).map((v) => v.texto))], para: fmt, campanhas: ids },
      desfazer: { tipo: "telefone_restaurar", novos, velhos: (velhos ?? []).map((v) => ({ campanha_id: v.campanha_id, asset_id: v.asset_id })) } };
  }

  if (a.tipo === "anuncio_textos") {
    const grupo = Number(alvo.grupo_id), ad = Number(alvo.anuncio_id);
    if (!grupo || !ad) throw new Error("Anúncio inválido.");
    const headlines = textosRSA(alvo.titulos, 30, 3, 15, "Títulos"), descriptions = textosRSA(alvo.descricoes, 90, 2, 4, "Descrições");
    const atual = (await ads.gaql(`SELECT ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions
        FROM ad_group_ad WHERE ad_group.id = ${grupo} AND ad_group_ad.ad.id = ${ad}`))[0]?.adGroupAd?.ad;
    if (!atual) throw new Error("Anúncio não encontrado no Google (pode ter sido removido). Sincronize e tente de novo.");
    if (atual.type !== "RESPONSIVE_SEARCH_AD") throw new Error("Só anúncio responsivo de pesquisa.");
    const volta = (l: any[]) => (l ?? []).map((h: any) => ({ t: h.text, fixo: h.pinnedField ?? null }));
    await ads.mutar("ads", { operations: [{ update: { resourceName: `customers/${c}/ads/${ad}`, responsiveSearchAd: { headlines, descriptions } },
      updateMask: "responsive_search_ad.headlines,responsive_search_ad.descriptions" }], validateOnly });
    if (!teste) await sb.from("gads_anuncios").update({ titulos: headlines.map((h: any) => ({ t: h.text, fixo: h.pinnedField ?? null })), descricoes: descriptions.map((h: any) => ({ t: h.text, fixo: h.pinnedField ?? null })) }).eq("grupo_id", grupo).eq("id", ad);
    return { resultado: { anuncio: ad, titulos: headlines.length, descricoes: descriptions.length },
      desfazer: { tipo: "anuncio_textos", alvo: { grupo_id: grupo, anuncio_id: ad, titulos: volta(atual.responsiveSearchAd?.headlines), descricoes: volta(atual.responsiveSearchAd?.descriptions) } } };
  }

  if (a.tipo === "lance_campanha") {
    const id = Number(alvo.campanha_id), est = String(alvo.estrategia ?? "").toUpperCase();
    const [campv] = await campanhasValidas([id]);
    const antes = (await ads.gaql(`SELECT campaign.id, campaign.bidding_strategy_type, campaign.bidding_strategy, campaign.maximize_conversions.target_cpa_micros,
        campaign.target_impression_share.location, campaign.target_impression_share.location_fraction_micros, campaign.target_impression_share.cpc_bid_ceiling_micros
        FROM campaign WHERE campaign.id = ${campv}`))[0]?.campaign;
    if (!antes) throw new Error("Campanha não encontrada no Google.");
    if (antes.biddingStrategy) throw new Error("A campanha usa uma estratégia de portfólio (compartilhada): mude pelo painel do Google.");
    if (antes.biddingStrategyType === "TARGET_SPEND") throw new Error("A campanha usa \"Maximizar cliques\" (é o modelo das campanhas novas criadas pela Intranet): esta ação não sabe desfazer essa troca. Mude o lance pelo painel do Google.");
    let campanha: any, mask: string;
    if (est === "TARGET_IMPRESSION_SHARE") {
      const local = String(alvo.local ?? "TOP_OF_PAGE").toUpperCase(), parcela = Number(alvo.parcela ?? 0.9), teto = Number(alvo.teto);
      if (!LOCAIS_TIS.includes(local) || !(parcela >= 0.1 && parcela <= 1) || !(teto > 0 && teto <= 20)) throw new Error("Parcela (10% a 100%), local ou teto de CPC (até R$ 20) inválido.");
      campanha = { targetImpressionShare: { location: local, locationFractionMicros: String(Math.round(parcela * 1e6)), cpcBidCeilingMicros: String(Math.round(teto * 1e6)) } };
      mask = "target_impression_share.location,target_impression_share.location_fraction_micros,target_impression_share.cpc_bid_ceiling_micros";
    } else if (est === "MAXIMIZE_CONVERSIONS") {
      const cpa = alvo.cpa != null ? Number(alvo.cpa) : null;
      if (cpa != null && !(cpa > 0)) throw new Error("CPA inválido.");
      // CPA 0 = maximizar conversões sem CPA desejado (o Google não aceita a máscara "maximize_conversions" sozinha)
      campanha = { maximizeConversions: { targetCpaMicros: String(cpa ? Math.round(cpa * 1e6) : 0) } };
      mask = "maximize_conversions.target_cpa_micros";
    } else throw new Error("Estratégia não suportada (use parcela de impressões ou maximizar conversões).");
    await ads.mutar("campaigns", { operations: [{ update: { resourceName: `customers/${c}/campaigns/${campv}`, ...campanha }, updateMask: mask }], validateOnly });
    if (!teste) await sb.from("gads_campanhas").update({ estrategia_lance: est }).eq("id", campv);
    const tis = antes.targetImpressionShare ?? {};
    const desfaz = antes.biddingStrategyType === "TARGET_IMPRESSION_SHARE"
      ? { campanha_id: campv, estrategia: "TARGET_IMPRESSION_SHARE", local: tis.location, parcela: Number(tis.locationFractionMicros ?? 0) / 1e6, teto: Number(tis.cpcBidCeilingMicros ?? 0) / 1e6 }
      : antes.biddingStrategyType === "MAXIMIZE_CONVERSIONS" ? { campanha_id: campv, estrategia: "MAXIMIZE_CONVERSIONS", cpa: antes.maximizeConversions?.targetCpaMicros ? Number(antes.maximizeConversions.targetCpaMicros) / 1e6 : null } : null;
    return { resultado: { campanha: campv, de: antes.biddingStrategyType, para: est }, desfazer: desfaz ? { tipo: "lance_campanha", alvo: desfaz } : null };
  }
  if (a.tipo === "status_campanha") {
    const id = Number(alvo.campanha_id), novo = String(alvo.status ?? "");   // sem converter caixa: a tela compara o mesmo texto
    if (!["ENABLED", "PAUSED"].includes(novo)) throw new Error("Situação inválida (use exatamente ENABLED ou PAUSED).");
    const [campv] = await campanhasValidas([id]);
    const antes = (await ads.gaql(`SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${campv}`))[0];
    if (!antes) throw new Error("Campanha não encontrada no Google.");
    if (!["ENABLED", "PAUSED"].includes(antes.campaign.status)) throw new Error(`A campanha está "${antes.campaign.status}" e não pode mudar de situação por aqui.`);
    if (antes.campaign.status === novo) throw new Error(`A campanha já está ${novo === "ENABLED" ? "ativa" : "pausada"}.`);
    await ads.mutar("campaigns", { operations: [{ update: { resourceName: `customers/${c}/campaigns/${campv}`, status: novo }, updateMask: "status" }], validateOnly });
    if (!teste) await sb.from("gads_campanhas").update({ status: novo }).eq("id", campv);
    return { resultado: { campanha: antes.campaign.name, de: antes.campaign.status, para: novo, orcamento_dia: Number(antes.campaignBudget?.amountMicros ?? 0) / 1e6 },
      desfazer: { tipo: "status_campanha", alvo: { campanha_id: campv, status: antes.campaign.status } } };
  }

  if (a.tipo === "campanha_pesquisa") {
    const { operacoes, resumo } = montarCampanhaPesquisa(alvo, c, { max_orcamento: Number(ads.cfg.limite_nova_campanha_dia ?? 50) });
    const jaExiste = (await ads.gaql(`SELECT campaign.id FROM campaign WHERE campaign.name = '${resumo.nome.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' AND campaign.status != 'REMOVED'`))[0];
    if (jaExiste) throw new Error(`Já existe uma campanha chamada "${resumo.nome}" (id ${jaExiste.campaign.id}).`);
    const r = await ads.chamar(`customers/${c}/googleAds:mutate`, { mutateOperations: operacoes, validateOnly });
    if (teste) return { resultado: resumo, desfazer: null };
    const resp = r.mutateOperationResponses ?? [];
    const idCamp = String(resp.find((x: any) => x.campaignResult)?.campaignResult?.resourceName ?? "").split("/").pop();
    const idOrc = String(resp.find((x: any) => x.campaignBudgetResult)?.campaignBudgetResult?.resourceName ?? "").split("/").pop();
    if (idCamp) await sb.from("gads_campanhas").upsert({ id: Number(idCamp), nome: resumo.nome, status: "PAUSED", canal: "SEARCH", estrategia_lance: "TARGET_SPEND", orcamento_id: idOrc ? Number(idOrc) : null, orcamento_dia: resumo.orcamento_dia, atualizado_em: new Date().toISOString() });
    return { resultado: { campanha_id: idCamp, ...resumo }, desfazer: idCamp ? { tipo: "remover_campanha_nova", campanha_id: Number(idCamp) } : null };
  }

  if (a.tipo === "remover_campanha_nova") {
    const id = Number(alvo.campanha_id);
    const x = (await ads.gaql(`SELECT campaign.id, campaign.status, metrics.impressions FROM campaign WHERE campaign.id = ${id}`))[0];
    if (!x) throw new Error("Campanha não encontrada no Google.");
    if (Number(x.metrics?.impressions ?? 0) > 0) throw new Error("A campanha já teve impressões: pause no Google Ads em vez de remover.");
    await ads.mutar("campaigns", { operations: [{ remove: `customers/${c}/campaigns/${id}` }], validateOnly });
    if (!teste) await sb.from("gads_campanhas").update({ status: "REMOVED" }).eq("id", id);
    return { resultado: { removida: id }, desfazer: null };
  }
  throw new Error("Tipo de ação desconhecido.");
}

/** Reverte usando o que foi guardado em `desfazer`. */
async function reverter(ads: Ads, d: any) {
  if (d.tipo === "remover_negativa") return executar(ads, { tipo: "remover_negativa", alvo: { recursos: d.recursos } }, false);
  if (d.tipo === "pausar_palavra" || d.tipo === "orcamento_dia" || d.tipo === "local_presenca" || d.tipo === "anuncio_textos" || d.tipo === "lance_campanha" || d.tipo === "status_campanha") return executar(ads, { tipo: d.tipo, alvo: d.alvo }, false);
  if (d.tipo === "remover_campanha_nova") return executar(ads, { tipo: "remover_campanha_nova", alvo: { campanha_id: d.campanha_id } }, false);
  if (d.tipo === "remover_vinculos") { await ads.mutar("campaignAssets", { operations: d.recursos.map((resourceName: string) => ({ remove: resourceName })) }); return { resultado: { removidos: d.recursos.length }, desfazer: null }; }
  if (d.tipo === "telefone_restaurar") {
    const c = ads.cliente, ops = [...(d.novos ?? []).map((x: string) => ({ campaignAssetOperation: { remove: x } })),
      ...(d.velhos ?? []).map((v: any) => ({ campaignAssetOperation: { create: { campaign: `customers/${c}/campaigns/${v.campanha_id}`, asset: `customers/${c}/assets/${v.asset_id}`, fieldType: "CALL" } } }))];
    if (ops.length) await ads.chamar(`customers/${c}/googleAds:mutate`, { mutateOperations: ops });
    return { resultado: { restaurado: true }, desfazer: null };
  }
  if (d.tipo === "recriar_negativas") {
    for (const it of d.itens) await executar(ads, { tipo: "negativa_campanha", alvo: { campanha_ids: [it.campanha_id], texto: it.texto, correspondencia: it.correspondencia } }, false);
    return { resultado: { recriadas: d.itens.length }, desfazer: null };
  }
  throw new Error("Não sei desfazer esta ação.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // o servidor (x-sync-secret) só pode TESTAR (validateOnly): serve para o Brain conferir uma proposta antes de você aprovar
  if (await autorizadoCron(req)) {
    const { acao, id } = await req.json().catch(() => ({}));
    if (acao !== "testar") return json({ erro: "Só teste pelo servidor." }, 403);
    const { data: a } = await sb.from("gads_acoes").select("*").eq("id", Number(id)).maybeSingle();
    const ads = a ? await abrir() : null;
    if (!a || !ads) return json({ erro: "Ação não encontrada ou Google desconectado." }, 400);
    try { const r = await executar(ads, a, true); return json({ ok: true, previa: r.resultado }); } catch (e) { return json({ erro: String((e as Error).message) }, 400); }
  }
  const eu = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: dono } = await eu.rpc("eh_dono");
  if (dono !== true) return json({ erro: "Só o administrador aprova mudanças no Google Ads." }, 403);
  const { data: quem } = await eu.rpc("eu");
  const { acao, id, motivo } = await req.json().catch(() => ({}));
  const { data: a } = await sb.from("gads_acoes").select("*").eq("id", Number(id)).maybeSingle();
  if (!a) return json({ erro: "Ação não encontrada." }, 404);
  const agora = new Date().toISOString();

  if (acao === "recusar") {
    if (a.status !== "proposta") return json({ erro: `Esta ação está "${a.status}".` }, 400);
    await sb.from("gads_acoes").update({ status: "recusada", decidido_por: quem ?? null, decidido_em: agora, resultado: { motivo: String(motivo ?? "").slice(0, 300) } }).eq("id", a.id);
    return json({ ok: true });
  }

  if (!["testar", "aprovar", "desfazer"].includes(acao)) return json({ erro: "ação desconhecida" }, 400);
  const ads = await abrir();
  if (!ads) return json({ erro: "Google Ads desconectado." }, 400);

  if (acao === "testar") {
    if (!["proposta", "erro"].includes(a.status)) return json({ erro: `Esta ação está "${a.status}".` }, 400);
    try { const r = await executar(ads, a, true); return json({ ok: true, mensagem: "O Google aceitou (nada foi alterado).", previa: r.resultado }); }
    catch (e) { return json({ erro: String((e as Error).message) }, 400); }
  }

  if (acao === "aprovar") {
    if (!["proposta", "erro"].includes(a.status)) return json({ erro: `Esta ação está "${a.status}".` }, 400);
    await sb.from("gads_acoes").update({ status: "aprovada", decidido_por: quem ?? null, decidido_em: agora }).eq("id", a.id);
    try {
      const r = await executar(ads, a, false);
      await sb.from("gads_acoes").update({ status: "aplicada", aplicada_em: new Date().toISOString(), resultado: r.resultado, desfazer: r.desfazer }).eq("id", a.id);
      return json({ ok: true, resultado: r.resultado });
    } catch (e) {
      await sb.from("gads_acoes").update({ status: "erro", resultado: { erro: String((e as Error).message).slice(0, 500) } }).eq("id", a.id);
      return json({ erro: String((e as Error).message) }, 400);
    }
  }

  // desfazer
  if (a.status !== "aplicada" || !a.desfazer) return json({ erro: "Esta ação não pode ser desfeita." }, 400);
  try {
    await reverter(ads, a.desfazer);
    await sb.from("gads_acoes").update({ status: "desfeita", resultado: { ...(a.resultado ?? {}), desfeita_em: new Date().toISOString(), desfeita_por: quem ?? null } }).eq("id", a.id);
    return json({ ok: true });
  } catch (e) { return json({ erro: String((e as Error).message) }, 400); }
});
