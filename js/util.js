'use strict';
/* CRM Protemaxxi — utilidades compartilhadas */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ds = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const hoje = () => ds(new Date());
const mesDe = s => s.slice(0, 7);
const addDias = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
const addMes = (m, n) => { const d = pd(m + '-01'); d.setMonth(d.getMonth() + n); return ds(d).slice(0, 7); };
const dow = s => pd(s).getDay();
const segundaDa = s => { const d = pd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ds(d); };
const ultimoDia = m => { const [y, mm] = m.split('-').map(Number); return new Date(y, mm, 0).getDate(); };
const diasDoMes = m => Array.from({ length: ultimoDia(m) }, (_, i) => `${m}-${pad(i + 1)}`);
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DIAS_LONGO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const fmtData = s => { const d = pd(s); return `${DIAS_LONGO[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const fmtCurta = s => { const d = pd(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
const fmtMes = m => { const d = pd(m + '-01'); return `${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const R = v => brl2.format(v || 0);
const R0 = v => brl0.format(Math.round(v || 0));
const P = v => v == null ? '—' : `${Math.round(v * 100)}%`;
const N = v => v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtK = (k, v) => v == null ? '—' : k.un === 'R$' ? R0(v) : k.un === '%' ? `${N(v)}%` : k.un === 'h' ? `${N(v)} h` : N(Math.round(v));
const classe = a => a == null ? '' : a >= 0.9 ? 'ok' : a >= 0.7 ? 'med' : 'ruim';
const iniciais = nome => nome.split(/\s+/).filter(w => /^[A-Za-zÀ-ÿ]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const uid = () => Math.random().toString(36).slice(2, 9);
const clone = o => JSON.parse(JSON.stringify(o));
const soma = a => a.reduce((x, y) => x + y, 0);
const media = a => { const v = a.filter(x => x != null); return v.length ? soma(v) / v.length : null; };
const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function avisar(txt) { const el = $('#aviso'); el.textContent = txt; el.hidden = false; clearTimeout(avisar.t); avisar.t = setTimeout(() => (el.hidden = true), 2600); }
const corSegura = c => /^#[0-9a-fA-F]{3,8}$/.test(c || '') ? c : '#8AA0B4';
const av = (p, cls = '') => `<div class="avatar ${cls}" style="background:${corSegura(p.cor)}">${esc(iniciais(p.nome))}</div>`;
const barra = (a, cls) => `<div class="barra ${cls ?? classe(a)}"><i style="width:${Math.max(0, Math.min(1, a ?? 0)) * 100}%"></i></div>`;
const tagPct = a => `<span class="tag ${classe(a)}">${P(a)}</span>`;
const topo = (titulo, sub, acoes = '') => `<div class="topo"><div><h1>${titulo}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="acoes">${acoes}</div></div>${topoSubAbas()}`;
/** Barra de sub-abas quando a aba atual mora dentro de outra (ex.: Checklist dentro do Meu dia). */
function topoSubAbas() {
  if (typeof subAbas !== 'function' || typeof UI === 'undefined' || !UI?.view) return '';
  const l = subAbas(UI.view); if (!l.length) return '';
  return `<div class="subabas" role="tablist" aria-label="Sub-abas">${l.map(([k, n]) => `<button class="${UI.view === k ? 'on' : ''}" data-a="nav" data-v="${k}">${n}${typeof badgeAba === 'function' && badgeAba(k) ? `<span class="badge">${badgeAba(k)}</span>` : ''}</button>`).join('')}</div>`;   // div, não nav: o estilo de nav é o do menu lateral
}
const navMes = () => `<div class="navdia"><button class="btn peq" data-a="mes" data-v="-1">◀</button><span class="data">${fmtMes(UI.mes)}</span><button class="btn peq" data-a="mes" data-v="1">▶</button>${UI.mes !== mesDe(hoje()) ? '<button class="btn peq" data-a="mes" data-v="0">Mês atual</button>' : ''}</div>`;
const optPessoas = (sel, lista = D.pessoas, vazio) => (vazio ? `<option value="">${vazio}</option>` : '') + lista.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
const VINCULO = { clt: 'CLT', estagio: 'Estágio', socio: 'Sócio', pj: 'PJ' };

/** Ícones de traço (24×24, currentColor) no lugar dos emoji do menu. Desenhados aqui, sem biblioteca. */
const ICONES = {
  inicio: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  meudia: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  crm: '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
  vendas: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  pedidos: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
  situacao: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  boletos: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M12 11v4M12 18h.01"/>',
  clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.6c2.3.7 3.5 2.6 3.5 5.4"/>',
  monitoria: '<path d="M3 12.5V3h9.5l8.5 8.5-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  avaliacoes: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
  creditos: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
  brindes: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8c-1.5-3.5-5-4-5-1.5S10 8 12 8c2 0 5 .1 5-1.5S13.5 4.5 12 8"/>',
  ml: '<path d="M5 7h14l-1.2 14H6.2zM9 9V7a3 3 0 0 1 6 0v2"/>',
  trafego: '<path d="M3 10v4h4l8 5V5L7 10zM18.5 9a4 4 0 0 1 0 6"/>',
  visaoestoque: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  expedicao: '<path d="M2 6h12v10H2zM14 9.5h4l3.5 3.5v3H14"/><circle cx="6" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
  estoque: '<path d="m3 7.5 9-4.5 9 4.5v9L12 21l-9-4.5zM3 7.5 12 12l9-4.5M12 12v9"/>',
  abrirTV: '<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M8 20.5h8M12 16.5v4"/>',
  compras: '<path d="M3 4h2.2l2.4 11h11L21 7.5H6.4"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17.5" cy="19.5" r="1.5"/>',
  cadastroprod: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>',
  atendimento: '<path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-4.9A8.5 8.5 0 1 1 20.5 12z"/>',
  solicitacoes: '<path d="M3 13.5 6 5h12l3 8.5V19H3zM3 13.5h5l1 2.5h6l1-2.5h5"/>',
  emails: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  suporte: '<path d="M14.7 6.3a4.5 4.5 0 0 0 5.9 5.9L13 19.8a2.5 2.5 0 0 1-3.5-3.5l7.6-7.6a4.5 4.5 0 0 0-2.4-2.4zM4 4l4 4"/>',
  checklist: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  supervisao: '<path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5"/>',
  geral: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4"/>',
  metas: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  remuneracao: '<path d="M3 7.5h15.5a2.5 2.5 0 0 1 2.5 2.5v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7.5 15 4v3.5M16.5 14h.01"/>',
  feedbacks: '<path d="M4 4h16v12H8.5L4 20z"/>',
  config: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  logs: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  ajuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.5v.5M12 17h.01"/>',
  busca: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  sino: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  telefone: '<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
};
const icone = (nome, tam = 18) => ICONES[nome] ? `<svg class="ico" viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>` : '';
/** Esqueleto de carregamento (blocos cinza pulsando) no lugar de "Carregando…". */
const esqueleto = (linhas = 4, kpis = 0) => `<div class="esq" role="status" aria-label="Carregando">${kpis ? `<div class="esq-kpis">${'<div class="esq-b esq-kpi"></div>'.repeat(kpis)}</div>` : ''}${Array.from({ length: linhas }, (_, i) => `<div class="esq-b esq-l" style="width:${[92, 78, 85, 64, 88, 70][i % 6]}%"></div>`).join('')}</div>`;

// ─── Emoji da interface → ícones de traço (17/11) ───
// Depois de cada desenho, troca os emoji conhecidos dos textos da interface por ícones; os decorativos (🎉 👏…) somem.
// Não mexe no que cliente/equipe escreveram (mensagens, e-mails, comentários), em campos de formulário nem nas abas do estoque.
Object.assign(ICONES, {
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alerta: '<path d="M12 3.5 2.5 20h19zM12 10v4.5M12 17.5h.01"/>',
  lixo: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  clipe: '<path d="M20 11.5 12.2 19.3a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
  nota: '<path d="M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h5"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  repetir: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4.5h-4.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  local: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  cadeado: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  chave: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  camera: '<path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  impressora: '<path d="M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z"/>',
  ponto: '<circle cx="12" cy="12" r="5" fill="currentColor"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pausa: '<path d="M9 5v14M15 5v14"/>',
  parar: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  trofeu: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6"/>',
  mao: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V5.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5-2.7L3.5 14a1.5 1.5 0 0 1 2.5-1.6L8 15"/>',
  ideia: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  raio: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  fabrica: '<path d="M3 20V10l5 3V10l5 3V10l5 3V4h3v16zM7 17h2M12 17h2M17 17h1"/>',
  loja: '<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5.5 12v8h13v-8M10 20v-5h4v5"/>',
  entrada: '<path d="M4 14v5h16v-5M12 4v10M8 10l4 4 4-4"/>',
  saida: '<path d="M4 14v5h16v-5M12 14V4M8 8l4-4 4 4"/>',
  arquivo: '<path d="M3.5 5h17v4h-17zM5 9v10h14V9M10 13h4"/>',
  pasta: '<path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/>',
  bandeira: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  pin: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3zM12 14v7"/>',
  semfone: '<path d="M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2M3 3l18 18"/>',
  pincel: '<path d="M14.5 4.5 19.5 9.5 11 18l-5-5zM6 13l-2.5 6.5L10 17"/>',
  escudo: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/>',
  negativo: '<path d="M7 4h9.5l2.5 8h-6l1 5a2 2 0 0 1-3.6 1.4L7 12zM7 4H4v8h3"/>',
  lupa2: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5M8 10.5h5"/>',
  envelope: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="m4 7 8 6 8-6"/>',
  numero: '<path d="M9 4 7 20M17 4l-2 16M4.5 9h16M3.5 15h16"/>',
  predio: '<path d="M5 21V4h10v17M15 9h4v12M3 21h18M8 8h4M8 12h4M8 16h4"/>',
  seta: '<path d="m9 6 6 6-6 6"/>',
  tema: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/>',
  sair: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  recolher: '<path d="M11 6l-6 6 6 6M19 6l-6 6 6 6"/>',
  broto: '<path d="M12 21v-8M12 13c0-4 3-7 7-7 0 4-3 7-7 7zM12 15c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5z"/>',
});
const EMOJI_ICONE = {
  '📞': 'telefone', '📱': 'telefone', '☎': 'telefone', '✉': 'emails', '📧': 'emails', '📩': 'emails', '📨': 'solicitacoes', '💬': 'atendimento', '🗨': 'atendimento',
  '🎯': 'metas', '📈': 'vendas', '📉': 'vendas', '📊': 'geral', '🧾': 'pedidos', '🚦': 'situacao', '👤': 'clientes', '👥': 'clientes', '🧑': 'clientes', '🏷': 'monitoria',
  '⭐': 'avaliacoes', '🌟': 'avaliacoes', '💳': 'creditos', '🎁': 'brindes', '🛍': 'ml', '🛒': 'compras', '📣': 'trafego', '📢': 'trafego', '📋': 'visaoestoque', '📦': 'estoque',
  '🚚': 'expedicao', '📺': 'abrirTV', '🤝': 'compras', '🧩': 'cadastroprod', '🔧': 'suporte', '🛠': 'suporte', '🔨': 'suporte', '☑': 'checklist', '✅': 'check', '✔': 'check',
  '📅': 'calendario', '🗓': 'calendario', '📆': 'calendario', '💰': 'remuneracao', '💵': 'remuneracao', '💲': 'remuneracao', '⚙': 'config', '📜': 'logs', '🔎': 'busca', '🔍': 'busca',
  '🔔': 'sino', '⚠': 'alerta', '❗': 'alerta', '‼': 'alerta', '⛔': 'alerta', '🚫': 'alerta', '❌': 'alerta', '🗑': 'lixo', '📎': 'clipe', '📝': 'nota', '🗒': 'nota', '📄': 'nota', '📃': 'nota',
  '📁': 'nota', '📂': 'nota', '⏰': 'relogio', '⏱': 'relogio', '🕓': 'relogio', '⏳': 'relogio', '⌛': 'relogio', '🔁': 'repetir', '🔄': 'repetir', '🔗': 'link', '📍': 'local',
  '🔒': 'cadeado', '🔐': 'cadeado', '🔑': 'chave', '✏': 'editar', '✍': 'editar', '🖊': 'editar', '📷': 'camera', '📸': 'camera', '🖨': 'impressora', '▶': 'play', '⏸': 'pausa',
  '⏹': 'parar', '🍽': 'pausa', '🏆': 'trofeu', '🥇': 'trofeu', '🙋': 'mao', '💡': 'ideia', '⚡': 'raio', '🟢': 'ponto', '🔴': 'ponto', '🟡': 'ponto', '🟠': 'ponto', '⚪': 'ponto',
  '❓': 'ajuda', '❔': 'ajuda', '☀': 'meudia', '🏠': 'inicio', '🌐': 'link', '🤖': 'raio', '👀': 'busca', '👉': null, '🎉': null, '👏': null, '🚀': null, '✨': null, '🙂': null,
  '😊': null, '😉': null, '🔥': null, '💪': null, '🙌': null, '👍': null, '👋': null, '🥳': null, '🎊': null, '❤': null, '💚': null,
  // 17/11: os que ainda apareciam na Intranet
  '🏭': 'fabrica', '🏪': 'loja', '🏬': 'loja', '🏢': 'predio', '🏛': 'predio', '✎': 'editar', '📲': 'telefone', '📵': 'semfone', '🔵': 'ponto', '🟣': 'ponto',
  '📮': 'envelope', '📬': 'envelope', '📭': 'envelope', '📥': 'entrada', '⬇': 'entrada', '📤': 'saida', '⬆': 'saida', '🗃': 'arquivo', '🗄': 'arquivo', '🗂': 'pasta',
  '🔬': 'lupa2', '🧪': 'lupa2', '🏁': 'bandeira', '🚩': 'bandeira', '📌': 'pin', '🎨': 'pincel', '🛡': 'escudo', '👎': 'negativo', '🎟': 'creditos', '🎫': 'creditos',
  '📘': 'trafego', '🔢': 'numero', '💤': 'relogio', '🚨': 'alerta', '💥': 'alerta', '🧭': 'local', '🗣': 'atendimento', '⚖': 'geral', '🌱': 'broto',
  '🟰': null, '😀': null, '😃': null, '😄': null, '😁': null, '🙏': null, '💯': null,
};
const PONTO_COR = { '🟢': 'ok', '🔴': 'ruim', '🟡': 'med', '🟠': 'med', '⚪': '', '🔵': 'azul', '🟣': 'roxo' };
// Qualquer outro emoji que sobrar na interface some (o texto fica, sem o desenho)
const EMOJI_RESTO = /\p{Extended_Pictographic}\uFE0F?\s?/gu;
const semEmoji = t => String(t).replace(EMOJI_RE, '').replace(EMOJI_RESTO, '').trim();
const EMOJI_RE = new RegExp('(' + Object.keys(EMOJI_ICONE).sort((a, b) => b.length - a.length).map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?\\s?', 'gu');
// Onde NÃO trocar: texto escrito por pessoas (WhatsApp, e-mail, comentários), campos e as abas do estoque/expedição/ML.
const EMOJI_FORA = 'option,select,textarea,input,script,style,code,pre,[contenteditable],.sem-icone,.wa-msgs,.wa-item .prev,.wa-cab-c,.coment p,.em-html,.em-texto,.em-leitor .em-corpo,.email-corpo,.email-ler,.leitura';
const EMOJI_ABAS_FORA = new Set(['ml', 'expedicao', 'estoque', 'visaoestoque', 'tvestoque', 'abrirTV', 'compras', 'cadastroprod', 'envioml']);
/** Troca os emoji de uma árvore do DOM (exportada para o teste). */
function trocarEmojis(raiz) {
  if (!raiz || typeof document === 'undefined' || !document.createTreeWalker) return 0;
  if (typeof UI !== 'undefined' && UI && EMOJI_ABAS_FORA.has(UI.view) && !raiz.closest?.('#nav, .barra-inf, .sino-painel')) return 0;
  const alvos = [], w = document.createTreeWalker(raiz, 4 /* texto */);
  for (let n = w.nextNode(); n; n = w.nextNode()) { EMOJI_RE.lastIndex = 0; EMOJI_RESTO.lastIndex = 0; if ((EMOJI_RE.test(n.nodeValue) || EMOJI_RESTO.test(n.nodeValue)) && !n.parentElement?.closest(EMOJI_FORA)) alvos.push(n); }
  for (const n of alvos) {
    const partes = n.nodeValue.split(EMOJI_RE), frag = document.createDocumentFragment();
    // split com grupo: [texto, emoji, texto, emoji, …]
    partes.forEach((p, i) => {
      if (i % 2 === 0) { p = p.replace(EMOJI_RESTO, ''); if (p) frag.appendChild(document.createTextNode(p)); return; }
      const nome = EMOJI_ICONE[p]; if (!nome) return;
      const s = document.createElement('span'); s.className = 'ico-em' + (nome === 'ponto' ? ' ' + (PONTO_COR[p] || '') : ''); s.innerHTML = icone(nome, 15);
      frag.appendChild(s); if (partes[i + 1] && !/^\s/.test(partes[i + 1])) frag.appendChild(document.createTextNode(' '));
    });
    n.parentNode.replaceChild(frag, n);
  }
  // Dicas (title), textos de campo vazio e opções de lista não aceitam ícone: o emoji só sai
  const tem = t => { EMOJI_RE.lastIndex = 0; EMOJI_RESTO.lastIndex = 0; return !!t && (EMOJI_RE.test(t) || EMOJI_RESTO.test(t)); };
  const fora = '.wa-msgs,.coment p,.em-html,.em-texto,.em-leitor .em-corpo,.email-corpo,.sem-icone,[contenteditable]';
  const els = raiz.querySelectorAll ? [raiz, ...raiz.querySelectorAll('[title],[placeholder],[aria-label],option')] : [];
  for (const el of els) {
    if (!el.getAttribute || el.closest?.(fora)) continue;
    for (const a of ['title', 'placeholder', 'aria-label']) { const v = el.getAttribute(a); if (tem(v)) el.setAttribute(a, semEmoji(v)); }
    if (el.tagName === 'OPTION' && tem(el.textContent)) { if (!el.hasAttribute('value')) el.setAttribute('value', el.textContent); el.textContent = semEmoji(el.textContent); }
  }
  return alvos.length;
}
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
  let pend = new Set(), agendado = false;
  new MutationObserver(ms => {
    for (const m of ms) for (const n of m.addedNodes) { if (n.nodeType === 1) pend.add(n); else if (n.nodeType === 3 && n.parentElement) pend.add(n.parentElement); }
    if (pend.size && !agendado) { agendado = true; requestAnimationFrame(() => { agendado = false; const l = [...pend]; pend = new Set(); l.forEach(el => el.isConnected && trocarEmojis(el)); }); }
  }).observe(document.body, { childList: true, subtree: true });
}
