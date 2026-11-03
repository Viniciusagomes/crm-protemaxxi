// Monta e confere a criação de uma campanha de PESQUISA para a fila gads_acoes (tipo "campanha_pesquisa").
// Devolve as operações do GoogleAdsService.mutate com IDs temporários negativos (tudo ou nada, aceita validateOnly).
// A campanha SEMPRE nasce PAUSADA: ativar é outra ação aprovada (status_campanha). Só rede de Pesquisa, só "presença".
// Arquivo em JavaScript puro (sem tipos) para o teste em Node (tests/campanha-pesquisa.cjs) ler o mesmo código do Deno.

const CORRESP = ["BROAD", "PHRASE", "EXACT"];
const PIN = ["HEADLINE_1", "HEADLINE_2", "HEADLINE_3"];
const tam = (s) => [...String(s)].length;
const limpo = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const TEXTO_PALAVRA = /^[\p{L}\p{N} .'\-+&]+$/u;

function textos(lista, max, min, ate, nome) {
  const v = (Array.isArray(lista) ? lista : []).map((x) => ({ text: limpo(x?.t ?? x?.text ?? x), fixo: x?.fixo ?? null })).filter((x) => x.text);
  if (v.length < min || v.length > ate) throw new Error(`${nome}: são ${v.length}; o Google aceita de ${min} a ${ate}.`);
  const vistos = new Set();
  for (const x of v) {
    if (tam(x.text) > max) throw new Error(`${nome} com mais de ${max} caracteres: "${x.text}" (${tam(x.text)}).`);
    const k = x.text.toLowerCase(); if (vistos.has(k)) throw new Error(`${nome} repetido: "${x.text}".`); vistos.add(k);
    if (x.fixo && !PIN.includes(x.fixo)) throw new Error(`${nome}: posição fixa inválida (${x.fixo}).`);
  }
  return v.map((x) => (x.fixo ? { text: x.text, pinnedField: x.fixo } : { text: x.text }));
}

function palavra(texto, nome) {
  const t = limpo(texto).toLowerCase();
  if (!t || tam(t) > 80 || t.split(" ").length > 10 || !TEXTO_PALAVRA.test(t)) throw new Error(`${nome} inválida: "${texto}" (até 80 caracteres e 10 palavras, sem símbolos).`);
  return t;
}

function urlFinal(u) {
  const s = limpo(u);
  if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(s)) throw new Error(`Endereço final inválido: "${u}" (precisa começar com https://).`);
  return s;
}

/**
 * @param {object} spec  alvo da proposta (ver tests/campanha-pesquisa.cjs)
 * @param {string} cliente  ID da conta, só dígitos
 * @param {{max_orcamento?: number}} limites
 * @returns {{operacoes: object[], resumo: object}}
 */
export function montarCampanhaPesquisa(spec, cliente, limites = {}) {
  const s = spec ?? {};
  const nome = limpo(s.nome);
  if (!nome || tam(nome) > 128) throw new Error("Nome da campanha inválido (1 a 128 caracteres).");
  const orc = Number(s.orcamento_dia), cpc = Number(s.cpc_max), maxOrc = Number(limites.max_orcamento ?? 50);
  if (!(orc >= 1 && orc <= maxOrc)) throw new Error(`Orçamento diário inválido (R$ 1 a R$ ${maxOrc}).`);
  if (!(cpc >= 0.1 && cpc <= 20)) throw new Error("CPC máximo inválido (R$ 0,10 a R$ 20).");
  const loc = s.local ?? {};
  const lat = Number(loc.lat), lng = Number(loc.lng), raio = Number(loc.raio_km);
  if (!(lat >= -34 && lat <= 6 && lng >= -74 && lng <= -34) || !(raio >= 1 && raio <= 100)) throw new Error("Local inválido (latitude/longitude do Brasil e raio de 1 a 100 km).");
  const url = urlFinal(s.url_final);
  const grupos = Array.isArray(s.grupos) ? s.grupos : [];
  if (!grupos.length || grupos.length > 5) throw new Error("A campanha precisa de 1 a 5 grupos de anúncios.");

  const R = (tipo, id) => `customers/${cliente}/${tipo}/${id}`;
  const TB = -1, TC = -2;   // orçamento e campanha; grupos a partir de -10, extensões a partir de -100
  const ops = [];

  ops.push({ campaignBudgetOperation: { create: { resourceName: R("campaignBudgets", TB), name: limpo(s.nome_orcamento) || `${nome} (orçamento)`, amountMicros: String(Math.round(orc * 1e6)), deliveryMethod: "STANDARD", explicitlyShared: false } } });
  ops.push({ campaignOperation: { create: {
    resourceName: R("campaigns", TC), name: nome, status: "PAUSED", advertisingChannelType: "SEARCH", campaignBudget: R("campaignBudgets", TB),
    targetSpend: { cpcBidCeilingMicros: String(Math.round(cpc * 1e6)) },                      // "Maximizar cliques" com teto de CPC
    networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false },
    geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE" },                              // só quem está na região
    containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
  } } });
  ops.push({ campaignCriterionOperation: { create: { campaign: R("campaigns", TC), proximity: { geoPoint: { latitudeInMicroDegrees: Math.round(lat * 1e6), longitudeInMicroDegrees: Math.round(lng * 1e6) }, radius: raio, radiusUnits: "KILOMETERS" } } } });
  ops.push({ campaignCriterionOperation: { create: { campaign: R("campaigns", TC), language: { languageConstant: "languageConstants/1014" } } } });   // português

  const negativas = [...new Set((Array.isArray(s.negativas) ? s.negativas : []).map((t) => palavra(t, "Negativa")))];
  for (const t of negativas) ops.push({ campaignCriterionOperation: { create: { campaign: R("campaigns", TC), negative: true, keyword: { text: t, matchType: t.includes(" ") ? "PHRASE" : "BROAD" } } } });

  let nPalavras = 0, nAnuncios = 0, idGrupo = -10;
  const nomesGrupo = new Set();
  for (const g of grupos) {
    const gnome = limpo(g?.nome);
    if (!gnome || tam(gnome) > 255 || nomesGrupo.has(gnome.toLowerCase())) throw new Error(`Nome de grupo inválido ou repetido: "${gnome}".`);
    nomesGrupo.add(gnome.toLowerCase());
    const pal = Array.isArray(g.palavras) ? g.palavras : [];
    if (!pal.length || pal.length > 50) throw new Error(`Grupo "${gnome}": de 1 a 50 palavras-chave.`);
    const GR = idGrupo--;
    ops.push({ adGroupOperation: { create: { resourceName: R("adGroups", GR), name: gnome, campaign: R("campaigns", TC), status: "ENABLED", type: "SEARCH_STANDARD" } } });
    const vistas = new Set();
    for (const p of pal) {
      const texto = palavra(p?.texto, `Palavra do grupo "${gnome}"`), tipo = String(p?.tipo ?? "PHRASE").toUpperCase();
      if (!CORRESP.includes(tipo)) throw new Error(`Correspondência inválida em "${texto}".`);
      if (tipo === "BROAD") throw new Error(`"${texto}": correspondência ampla não é aceita neste modelo (use frase ou exata).`);
      const k = `${texto}|${tipo}`; if (vistas.has(k)) throw new Error(`Palavra repetida no grupo "${gnome}": ${texto} (${tipo}).`); vistas.add(k);
      ops.push({ adGroupCriterionOperation: { create: { adGroup: R("adGroups", GR), status: "ENABLED", keyword: { text: texto, matchType: tipo } } } });
      nPalavras++;
    }
    const an = g.anuncio ?? {};
    const headlines = textos(an.titulos, 30, 3, 15, `Títulos (${gnome})`), descriptions = textos(an.descricoes, 90, 2, 4, `Descrições (${gnome})`);
    const p1 = limpo(an.caminho1), p2 = limpo(an.caminho2);
    if (tam(p1) > 15 || tam(p2) > 15 || (p2 && !p1)) throw new Error("Caminhos do endereço: até 15 caracteres cada (o 2º só com o 1º).");
    ops.push({ adGroupAdOperation: { create: { adGroup: R("adGroups", GR), status: "ENABLED", ad: { finalUrls: [url], responsiveSearchAd: { headlines, descriptions, ...(p1 ? { path1: p1 } : {}), ...(p2 ? { path2: p2 } : {}) } } } } });
    nAnuncios++;
  }

  let idExt = -100, nSite = 0, nDest = 0;
  for (const l of Array.isArray(s.sitelinks) ? s.sitelinks : []) {
    const titulo = limpo(l?.titulo), d1 = limpo(l?.descricao1), d2 = limpo(l?.descricao2);
    if (!titulo || tam(titulo) > 25) throw new Error(`Sitelink: título de 1 a 25 caracteres ("${titulo}").`);
    if (!!d1 !== !!d2) throw new Error(`Sitelink "${titulo}": as duas descrições juntas ou nenhuma.`);
    if (tam(d1) > 35 || tam(d2) > 35) throw new Error(`Sitelink "${titulo}": descrições até 35 caracteres.`);
    const AS = idExt--;
    ops.push({ assetOperation: { create: { resourceName: R("assets", AS), finalUrls: [urlFinal(l.url ?? url)], sitelinkAsset: { linkText: titulo, ...(d1 ? { description1: d1, description2: d2 } : {}) } } } });
    ops.push({ campaignAssetOperation: { create: { campaign: R("campaigns", TC), asset: R("assets", AS), fieldType: "SITELINK" } } });
    nSite++;
  }
  for (const f of Array.isArray(s.frases_destaque) ? s.frases_destaque : []) {
    const t = limpo(f);
    if (!t || tam(t) > 25) throw new Error(`Frase de destaque: de 1 a 25 caracteres ("${t}").`);
    const AS = idExt--;
    ops.push({ assetOperation: { create: { resourceName: R("assets", AS), calloutAsset: { calloutText: t } } } });
    ops.push({ campaignAssetOperation: { create: { campaign: R("campaigns", TC), asset: R("assets", AS), fieldType: "CALLOUT" } } });
    nDest++;
  }

  return { operacoes: ops, resumo: { nome, orcamento_dia: orc, cpc_max: cpc, raio_km: raio, grupos: grupos.length, palavras: nPalavras, negativas: negativas.length, anuncios: nAnuncios, sitelinks: nSite, destaques: nDest, nasce: "PAUSADA" } };
}
