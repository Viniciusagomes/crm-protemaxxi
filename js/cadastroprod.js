'use strict';
/* Intranet Protemaxxi — Cadastro de produtos: a rotina da manhã (Brain) sugere GTIN, peso, medidas e textos do Mercado Livre
   para produtos ativos sem GTIN. O dono confere, corrige se quiser e aprova; só então a função produto-sugestoes grava no Tiny,
   preenchendo apenas o que está vazio lá. Só o dono vê. */

const CP = { lista: null, carregando: false, sel: new Set(), aplicando: false };
const CP_CAMPOS = ['gtin', 'peso_bruto', 'peso_liquido', 'altura', 'largura', 'comprimento', 'ml_titulo', 'ml_descricao'];
const CP_STATUS = { pendente: ['A aprovar', ''], aplicada: ['✅ No Tiny', 'ok'], recusada: ['Recusada', 'mut'], erro: ['⚠ Erro', 'c-ruim'], sem_dados: ['Sem dados', 'mut'] };

/** GTIN-8/12/13/14 com dígito verificador (o mesmo cálculo do banco: seg.gtin_valido). */
function cpGtinValido(t) {
  const s = String(t || '');
  if (!/^(\d{8}|\d{12,14})$/.test(s)) return false;
  let soma = 0;
  for (let i = 1; i < s.length; i++) soma += +s[s.length - 1 - i] * (i % 2 === 1 ? 3 : 1);
  return (10 - soma % 10) % 10 === +s[s.length - 1];
}
const cpPendentes = () => (CP.lista || []).filter(s => s.status === 'pendente').length;

async function carregarCadastroProd(forcar) {
  if (CP.lista && !forcar) return;
  CP.carregando = true;
  try {
    CP.lista = await ok(sb.from('produto_sugestoes').select('*').gte('criado_em', addDias(hoje(), -60)).order('lote', { ascending: false }).order('id').limit(1000));
    CP.sel.clear();
  } finally { CP.carregando = false; }
}

function vCadastroProd() {
  if (!ehDono()) return topo('Cadastro de produtos', '') + '<div class="card vazio">Sem acesso.</div>';
  if (!CP.lista) {
    if (!CP.carregando) carregarCadastroProd().then(render).catch(e => avisar(e.message));
    return topo('Cadastro de produtos', '') + '<div class="card vazio">Carregando as sugestões…</div>';
  }
  const f = UI.cpFiltro || 'pendente';
  const conta = k => CP.lista.filter(s => s.status === k).length;
  const lista = CP.lista.filter(s => f === 'todos' || s.status === f);
  const chips = [['pendente', 'A aprovar'], ['aplicada', 'No Tiny'], ['erro', 'Com erro'], ['recusada', 'Recusadas'], ['sem_dados', 'Sem dados'], ['todos', 'Todas']]
    .map(([k, n]) => `<button class="chip ${f === k ? 'on' : ''}" data-a="cpFiltro" data-v="${k}">${n}${k !== 'todos' ? ` <span class="n">${conta(k)}</span>` : ''}</button>`).join('');
  const abertos = lista.filter(s => s.status === 'pendente' || s.status === 'erro');
  const altas = abertos.filter(s => s.gtin_certeza === 'alta' && cpGtinValido(s.gtin));
  const inp = (s, k, w, tipo = 'number', ph = '') => `<input type="${tipo}" ${tipo === 'number' ? 'step="0.001" min="0"' : ''} style="width:${w}" value="${esc(s[k] ?? '')}" placeholder="${ph}"
    data-c="cpCampo" data-id="${s.id}" data-k="${k}" ${s.status === 'pendente' || s.status === 'erro' ? '' : 'disabled'}>`;
  const linha = s => {
    const aberto = s.status === 'pendente' || s.status === 'erro', st = CP_STATUS[s.status] || [s.status, ''];
    const gOk = !s.gtin || cpGtinValido(s.gtin);
    const fonte = (u, t) => u && /^https?:\/\//.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${t}</a>` : '';
    return `<tr>
      <td>${aberto ? `<input type="checkbox" data-c="cpSel" data-id="${s.id}" ${CP.sel.has(s.id) ? 'checked' : ''}>` : ''}</td>
      <td><b>${esc(s.codigo || '—')}</b> ${esc(s.nome || '')}<br><small class="mut">sugerido em ${fmtCurta(s.lote)}</small>${s.obs ? `<br><small>${esc(s.obs)}</small>` : ''}</td>
      <td>${inp(s, 'gtin', '130px', 'text', 'sem GTIN')}<br><small>${s.gtin ? (gOk ? '✔ dígito ok' : '<span class="c-ruim">✖ dígito inválido</span>') : ''}
        ${s.gtin_certeza ? ` · certeza <b class="${s.gtin_certeza === 'alta' ? 'c-ok' : s.gtin_certeza === 'media' ? 'c-med' : 'c-ruim'}">${esc(s.gtin_certeza)}</b>` : ''} ${fonte(s.gtin_fonte, 'fonte')}</small></td>
      <td style="white-space:nowrap">${inp(s, 'peso_bruto', '70px', 'number', 'bruto')} ${inp(s, 'peso_liquido', '70px', 'number', 'líq.')}<br><small class="mut">kg · bruto / líquido</small></td>
      <td style="white-space:nowrap">${inp(s, 'altura', '56px', 'number', 'A')} ${inp(s, 'largura', '56px', 'number', 'L')} ${inp(s, 'comprimento', '56px', 'number', 'C')}<br><small class="mut">cm (embalagem) ${fonte(s.medidas_fonte, 'fonte')}</small></td>
      <td>${inp(s, 'ml_titulo', '230px', 'text', 'título ML (até 60)')}<br><small class="mut">${[...(s.ml_titulo || '')].length}/60</small>
        ${s.ml_descricao || aberto ? `<details><summary><small>Descrição ML</small></summary><textarea rows="6" style="width:100%" data-c="cpCampo" data-id="${s.id}" data-k="ml_descricao" ${aberto ? '' : 'disabled'}>${esc(s.ml_descricao || '')}</textarea></details>` : ''}</td>
      <td><span class="${st[1]}">${st[0]}</span>${s.status === 'erro' && s.resultado ? `<br><small class="c-ruim">${esc(cpErroTexto(s.resultado))}</small>` : ''}
        ${s.status === 'aplicada' && s.resultado?.ignorados?.length ? `<br><small class="mut" title="${esc(s.resultado.ignorados.join('; '))}">${s.resultado.ignorados.length} campo(s) já preenchido(s) no Tiny</small>` : ''}</td>
      <td class="dir" style="white-space:nowrap">${aberto ? `<button class="btn peq" data-a="cpAprovar" data-id="${s.id}" ${gOk ? '' : 'disabled title="Corrija o GTIN"'}>✔ Aprovar</button> <button class="btn peq" data-a="cpRecusar" data-id="${s.id}">✖</button>` : ''}</td></tr>`;
  };
  return topo('Cadastro de produtos', 'Toda manhã o Brain pesquisa GTIN, peso, medidas e textos do Mercado Livre para 30 produtos sem GTIN. Nada vai para o Tiny sem a sua aprovação, e só os campos vazios lá são preenchidos.',
      `<button class="btn" data-a="cpAtualizar">↻ Atualizar</button>`)
    + `<div class="card"><div class="filtros" style="margin-bottom:8px"><div class="chips">${chips}</div></div>
      ${abertos.length ? `<div class="acoes" style="margin-bottom:8px">
        <button class="btn" data-a="cpAprovarSel" ${CP.sel.size && !CP.aplicando ? '' : 'disabled'}>✔ Aprovar selecionados (${CP.sel.size})</button>
        <button class="btn" data-a="cpAprovarAltas" ${altas.length && !CP.aplicando ? '' : 'disabled'} title="GTIN com certeza alta e dígito conferido">✔ Aprovar os de certeza alta (${altas.length})</button>
        ${CP.aplicando ? '<span class="mut">Gravando no Tiny…</span>' : ''}</div>` : ''}
      ${lista.length ? listaCurta('cpLista', `<table class="tabela"><thead><tr><th></th><th>Produto</th><th>GTIN</th><th>Peso</th><th>Medidas</th><th>Mercado Livre</th><th>Situação</th><th></th></tr></thead><tbody>${lista.map(linha).join('')}</tbody></table>`, 'Buscar produto, código, GTIN…', true)
        : `<div class="vazio">${f === 'pendente' ? 'Nada para aprovar agora. A próxima lista chega amanhã de manhã.' : 'Nada aqui.'}</div>`}
      <p class="mut" style="font-size:12.5px;margin:8px 0 0">Peso e medidas são aproximados, da embalagem, pesquisados na internet: confira os que parecerem estranhos antes de aprovar. A descrição do ML vai para a "descrição complementar" do Tiny, só se ela estiver vazia.</p></div>`;
}

function cpErroTexto(r) {
  if (r.fora_do_permitido?.length) return 'O Tiny mudou outros campos: ' + r.fora_do_permitido.join(', ') + '. Confira o produto.';
  if (r.etapa === 'gravar') return 'O Tiny recusou: ' + (typeof r.corpo === 'string' ? r.corpo : JSON.stringify(r.corpo || '')).slice(0, 160);
  if (r.etapa === 'ler') return 'Não consegui ler o produto no Tiny.';
  return r.erro || 'Erro ao gravar.';
}

function cpCampo(el) {
  const s = CP.lista.find(x => x.id === +el.dataset.id); if (!s) return;
  const k = el.dataset.k; let v = el.value.trim();
  if (k === 'gtin') v = v.replace(/\D/g, '');
  s[k] = v === '' ? null : (['peso_bruto', 'peso_liquido', 'altura', 'largura', 'comprimento'].includes(k) ? Number(v.replace(',', '.')) : v);
  s._editado = true;
}

/** Grava as correções feitas na tela e manda aplicar no Tiny, de 8 em 8. */
async function cpAprovar(ids) {
  ids = ids.filter(id => { const s = CP.lista.find(x => x.id === id); return s && (s.status === 'pendente' || s.status === 'erro'); });
  if (!ids.length) return;
  const ruins = ids.map(id => CP.lista.find(x => x.id === id)).filter(s => s.gtin && !cpGtinValido(s.gtin));
  if (ruins.length) return avisar(`GTIN com dígito inválido: ${ruins.map(s => s.codigo).join(', ')}. Corrija ou apague antes de aprovar.`);
  if (ids.length > 1 && !confirm(`Gravar ${ids.length} produto(s) no Tiny? Só os campos vazios lá serão preenchidos.`)) return;
  CP.aplicando = true; render();
  let okN = 0, erros = [];
  try {
    for (const id of ids) {
      const s = CP.lista.find(x => x.id === id);
      if (s._editado) { const m = {}; CP_CAMPOS.forEach(k => (m[k] = s[k] ?? null)); await ok(sb.from('produto_sugestoes').update(m).eq('id', id)); s._editado = false; }
    }
    for (let i = 0; i < ids.length; i += 8) {
      const { data, error } = await sb.functions.invoke('produto-sugestoes', { body: { acao: 'aplicar', ids: ids.slice(i, i + 8) } });
      if (error) throw new Error((await error.context?.json?.().catch(() => null))?.erro || error.message);
      for (const r of data.resultados || []) r.ok ? okN++ : erros.push(`${CP.lista.find(x => x.id === r.id)?.codigo || r.id}: ${r.erro}`);
    }
  } catch (e) { erros.push(e.message); }
  finally { CP.aplicando = false; }
  await carregarCadastroProd(true);
  render();
  avisar(`${okN} gravado(s) no Tiny.${erros.length ? ' Problemas: ' + erros.join(' · ') : ''}`);
}

async function cpRecusar(id) {
  const motivo = prompt('Por que recusar? (opcional; ex.: modelo errado)');
  if (motivo === null) return;
  await ok(sb.from('produto_sugestoes').update({ status: 'recusada', decidido_por: EU.id, decidido_em: new Date().toISOString(), resultado: { motivo: motivo || null } }).eq('id', id));
  const s = CP.lista.find(x => x.id === id); if (s) s.status = 'recusada';
  CP.sel.delete(id); render();
}
