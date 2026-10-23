'use strict';
/* Caixa de e-mails: tudo que chega em @portalprotemaxxi.com.br (Cloudflare → função email-entrada) e o que a Intranet envia.
 * Caixas: OS Intelbras (os.intelbras@), Boletos (boletos@), Notas fiscais (nfe@), Outros e Enviados.
 * Os boletos lidos viram a lista "A pagar" (vencimento, valor, linha digitável, alertas de conferência). Quem vê: o dono tudo; os outros
 * só as caixas liberadas para a pessoa em config 'caixa_emails'.acessos ({pessoa_id: [caixas]}, "os" = todas as caixas de OS). */

const EM = { lista: null, boletos: [], nfs: [], carregando: false, em: 0, caixa: 'todos', sel: null, corpo: {}, naoLidos: 0 };
const emAcessos = () => D?.config?.caixa_emails?.acessos?.[EU?.id] || [];
const veEmails = () => ehDono() || emAcessos().length > 0;
const emPodeArquivar = () => !!EU && EU.id !== 'marcos';
const EM_CAIXAS = { todos: ['📥', 'Todos'], os_intelbras: ['🔧', 'OS Intelbras'], boletos: ['🧾', 'Boletos'], nfe: ['📄', 'Notas fiscais'], outros: ['✉', 'Outros'], enviados: ['📤', 'Enviados'], arquivados: ['🗃', 'Arquivados'] };
const emCaixasMinhas = () => ehDono() ? Object.keys(EM_CAIXAS) : ['todos', ...Object.keys(EM_CAIXAS).filter(c => !['todos', 'arquivados'].includes(c) && emAcessos().some(a => a === c || (a === 'os' && c.startsWith('os_')))), 'arquivados'];
const emListaDaCaixa = c => (EM.lista || []).filter(e => c === 'arquivados' ? e.arquivado : !e.arquivado && (c === 'todos' ? e.direcao === 'entrada' : e.caixa === c));
const emTam = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

async function carregarEmails(forcar) {
  if (EM.carregando || (!forcar && EM.lista && Date.now() - EM.em < 30e3)) return;
  EM.carregando = true;
  try {
    const desde = addDias(hoje(), -120) + 'T00:00:00';
    const campos = 'id,direcao,caixa,de,de_nome,para,assunto,recebido_em,lido_em,arquivado,processado,erro,ref_tipo,ref_id,tamanho,anexos:email_anexos(id,nome,tipo,tamanho,caminho)';
    const [lista, arquivados, boletos, nfs] = await Promise.all([
      ok(sb.from('emails').select(campos).eq('arquivado', false)
        .gte('recebido_em', desde).order('recebido_em', { ascending: false }).limit(600)),
      todas(() => sb.from('emails').select(campos).eq('arquivado', true).order('recebido_em', { ascending: false }).order('id', { ascending: false })),
      sb.from('boletos_pagar').select('*').or(`status.eq.a_pagar,criado_em.gte.${addDias(hoje(), -60)}`).order('vencimento').then(r => r.data || []),
      sb.from('nfs_recebidas').select('*').gte('criado_em', addDias(hoje(), -120)).order('criado_em', { ascending: false }).then(r => r.data || []),
    ]);
    Object.assign(EM, { lista: [...lista, ...arquivados], boletos, nfs, em: Date.now(), naoLidos: lista.filter(e => e.direcao === 'entrada' && !e.lido_em && !e.arquivado).length });
  } finally { EM.carregando = false; }
}

/** Resumo do que a Intranet leu no e-mail (aparece na lista e no e-mail aberto). */
function emLido(e, completo) {
  return (e.processado || []).map(p => {
    if (p.tipo === 'boleto') {
      const b = EM.boletos.find(x => x.id === p.id);
      return `<span class="tag ${p.alerta ? 'med' : 'ok'}" title="${esc(p.alerta || '')}">🧾 Boleto ${p.valor ? R(p.valor) : ''}${p.vencimento ? ' · vence ' + fmtCurta(p.vencimento) : ''}${p.alerta ? ' ⚠' : ''}${b?.status === 'pago' ? ' · pago' : ''}</span>`
        + (completo && p.alerta ? `<div class="alerta med" style="margin-top:6px"><span class="ic">⚠</span><span><b>Confira antes de pagar:</b> ${esc(p.alerta)}</span></div>` : '');
    }
    if (p.tipo === 'nfe' || p.tipo === 'nfse') return `<span class="tag ok">📄 ${p.tipo === 'nfse' ? 'NFS-e' : 'NF-e'} ${esc(p.numero || '')}${p.valor ? ' · ' + R(p.valor) : ''}${p.emitente ? ' · ' + esc(p.emitente) : ''}</span>`
      + (completo ? ` <small class="mut">${p.na_entrada ? 'já está na Entrada de NF' : p.tipo === 'nfe' ? 'ainda não apareceu na Entrada de NF (o Tiny importa da SEFAZ)' : ''}</small>` : '');
    if (p.tipo === 'os') return (p.os || []).map(o => `<span class="tag azul">🔧 OS ${esc(o.numero)} · ${esc(o.cliente || '')}</span>`).join(' ')
      + (p.valores?.length ? ` <span class="tag">valores no e-mail: ${p.valores.map(R).join(', ')}</span>` : '') + (!p.os?.length && completo ? ' <small class="mut">Não achei o número de série de nenhuma OS aberta neste e-mail.</small>' : '');
    return '';
  }).join(' ');
}

function vEmails() {
  if (!EM.lista) { if (!EM.carregando) carregarEmails().then(render).catch(e => avisar(e.message)); return topo('Caixa de e-mails', '') + '<div class="card vazio">Carregando…</div>'; }
  const minhas = emCaixasMinhas();
  if (!minhas.includes(EM.caixa)) EM.caixa = 'todos';
  const daCaixa = emListaDaCaixa;
  const chips = minhas.map(c => { const n = c === 'arquivados' ? daCaixa(c).length : daCaixa(c).filter(e => e.direcao === 'entrada' && !e.lido_em).length;
    return `<button class="btn peq ${EM.caixa === c ? 'pri' : ''}" data-a="emCaixa" data-v="${c}">${EM_CAIXAS[c][0]} ${EM_CAIXAS[c][1]}${n ? ` <b>${n}</b>` : ''}</button>`; }).join('');
  const lista = daCaixa(EM.caixa);
  const linha = e => `<div class="item-lista em-item ${EM.sel === e.id ? 'on' : ''} ${e.direcao === 'entrada' && !e.lido_em ? 'nao-lido' : ''}" data-a="emAbrir" data-id="${e.id}">
      <div class="secao-titulo" style="margin:0"><b>${esc(e.direcao === 'saida' ? 'Para: ' + (e.para || '') : (e.de_nome || e.de || ''))}</b><small class="mut">${dataHora(e.recebido_em)}</small></div>
      <div>${['todos', 'arquivados'].includes(EM.caixa) ? `<small class="mut">${EM_CAIXAS[e.caixa]?.[0] || ''}</small> ` : ''}${esc(e.assunto || '(sem assunto)')}${e.anexos?.length ? ` <small class="mut">📎 ${e.anexos.length}</small>` : ''}</div>
      <div style="margin-top:3px">${emLido(e)}${e.erro ? ' <span class="tag ruim" title="' + esc(e.erro) + '">erro na leitura</span>' : ''}</div></div>`;
  const pagar = EM.caixa === 'boletos' ? emAPagar() : '';
  const config = !EM.lista.some(e => e.direcao === 'entrada') ? `<div class="card mt"><h2>Ainda não chegou nenhum e-mail</h2><p class="explica">Os endereços <b>boletos@</b>, <b>nfe@</b> e <b>os.intelbras@</b>portalprotemaxxi.com.br começam a funcionar depois do passo a passo no Cloudflare
    (arquivo <code>crm-protemaxxi/cloudflare/PASSO-A-PASSO-EMAIL.md</code>). Os enviados pela Intranet (avisos de OS e convites de avaliação) aparecem em "Enviados".</p></div>` : '';
  return topo('Caixa de e-mails', 'Tudo que chega em @portalprotemaxxi.com.br e o que a Intranet envia', `<button class="btn" data-a="emAtualizar">↻ Atualizar</button>`)
    + `<div class="acoes mt">${chips}</div>${config}${pagar}
    <div class="grid g2 mt em-grid"><div class="card"><div class="secao-titulo"><h2>${EM_CAIXAS[EM.caixa][1]}</h2><small>${lista.length} e-mail(s) · ${EM.caixa === 'arquivados' ? 'todos os arquivados disponíveis' : 'últimos 120 dias'}</small></div>
        <input type="search" placeholder="Buscar remetente, assunto…" data-filtro="emLista" style="width:100%;margin:6px 0">
        <div id="emLista" class="em-lista">${lista.map(linha).join('') || '<div class="vazio">Nada por aqui.</div>'}</div></div>
      <div class="card em-leitor">${emLeitor()}</div></div>`;
}

function emAPagar() {
  const ab = EM.boletos.filter(b => b.status === 'a_pagar'), h = hoje(), semana = addDias(h, 7);
  const venc = ab.filter(b => b.vencimento && b.vencimento < h), prox = ab.filter(b => b.vencimento && b.vencimento >= h && b.vencimento <= semana);
  const linha = b => `<tr class="${b.vencimento && b.vencimento < h ? 'c-ruim' : ''}"><td><b>${esc(b.beneficiario || 'Beneficiário não lido')}</b><br><small class="mut">${b.cnpj ? esc(b.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')) : ''}${b.banco ? ' · banco ' + esc(b.banco) : ''}</small>
      ${b.alerta ? `<br><small class="c-med">⚠ ${esc(b.alerta)}</small>` : ''}
      <br><small>${b.nf_numero ? `📄 NF ${esc(b.nf_numero)}${b.nf_valor ? ' de ' + R(b.nf_valor) : ''} <span class="tag ${b.vinculo === 'provavel' ? 'med' : 'ok'}">${{ certa: 'valor bate', provavel: 'provável', manual: 'ligada à mão' }[b.vinculo] || ''}</span>` : '<span class="c-med">sem nota ligada</span>'}
        <a href="#" data-a="emBolNF" data-id="${b.id}">${b.nf_numero ? 'trocar' : 'ligar nota'}</a></small></td>
      <td class="dir">${b.vencimento ? fmtCurta(b.vencimento) : '—'}</td><td class="dir"><b>${b.valor ? R(b.valor) : '—'}</b></td>
      <td class="dir"><button class="btn peq" data-a="emCopiar" data-v="${esc(b.linha)}" title="Copiar a linha digitável">📋 Linha</button>
        ${b.email_id ? `<button class="btn peq" data-a="emAbrir" data-id="${b.email_id}">Ver e-mail</button>` : ''}
        <button class="btn pri peq" data-a="emBolPago" data-id="${b.id}">✓ Pago</button> <button class="btn peq" data-a="emBolIgnorar" data-id="${b.id}" title="Duplicado, cancelado ou não é nosso">Ignorar</button></td></tr>`;
  return `<div class="grid g3 mt"><div class="card kpi-card"><div class="rot">A pagar</div><div class="val">${R(soma(ab.map(b => +b.valor || 0)))}</div><div class="sub">${ab.length} boleto(s)</div></div>
      <div class="card kpi-card"><div class="rot">Vence em 7 dias</div><div class="val">${R(soma(prox.map(b => +b.valor || 0)))}</div><div class="sub">${prox.length} boleto(s)</div></div>
      <div class="card kpi-card"><div class="rot">Vencidos</div><div class="val ${venc.length ? 'c-ruim' : ''}">${R(soma(venc.map(b => +b.valor || 0)))}</div><div class="sub">${venc.length} boleto(s)</div></div></div>
    <div class="card mt"><div class="secao-titulo"><h2>Boletos a pagar</h2><small>lidos dos e-mails · confira os alertas antes de pagar</small></div>
      ${ab.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Beneficiário</th><th class="dir">Vencimento</th><th class="dir">Valor</th><th></th></tr></thead><tbody>${ab.map(linha).join('')}</tbody></table></div>` : '<div class="vazio">Nenhum boleto em aberto.</div>'}</div>`;
}

function emLeitor() {
  const e = EM.lista.find(x => x.id === EM.sel);
  if (!e) return '<div class="vazio">Escolha um e-mail na lista.</div>';
  const c = EM.corpo[e.id];
  const corpo = !c ? '<div class="vazio">Abrindo…</div>' : c.html
    ? `<iframe class="em-html" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" srcdoc="${esc(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: cid:; style-src 'unsafe-inline'; font-src data: https:"><base target="_blank">` + c.html)}"></iframe>`
    : `<pre class="em-texto">${esc(c.texto || '(sem texto)')}</pre>`;
  return `<div class="secao-titulo" style="margin:0;align-items:flex-start"><div><h2 style="margin:0">${esc(e.assunto || '(sem assunto)')}</h2>
      <small class="mut">${e.direcao === 'saida' ? 'Enviado para' : 'De'} <b>${esc(e.direcao === 'saida' ? e.para || '' : `${e.de_nome ? e.de_nome + ' · ' : ''}${e.de || ''}`)}</b>${e.direcao === 'entrada' ? ` · para ${esc(e.para || '')}` : ''} · ${dataHora(e.recebido_em)}</small></div>
      <div class="acoes">${e.direcao === 'entrada' && emPodeArquivar() ? `<button class="btn peq" data-a="emArquivar" data-id="${e.id}">${e.arquivado ? 'Desarquivar' : 'Arquivar'}</button>` : ''}</div></div>
    ${e.processado ? `<div style="margin:8px 0">${emLido(e, true)}</div>` : ''}
    ${(e.processado || []).filter(p => p.tipo === 'os').flatMap(p => p.os || []).map(o => `<button class="btn peq" data-a="verOS" data-id="${o.id}">Abrir OS ${esc(o.numero)}</button>`).join(' ')}
    ${e.anexos?.length ? `<div class="acoes" style="margin:8px 0">${e.anexos.map(a => `<button class="btn peq" data-a="emAnexo" data-id="${a.id}" data-e="${e.id}">📎 ${esc(a.nome)} <small class="mut">${emTam(a.tamanho || 0)}</small></button>`).join('')}</div>` : ''}
    ${e.erro ? `<p class="c-ruim"><small>Erro na leitura: ${esc(e.erro)}</small></p>` : ''}
    <div class="mt">${corpo}</div>`;
}

async function emAbrir(id) {
  id = Number(id); EM.sel = id;
  const e = EM.lista.find(x => x.id === id);
  if (!e) { EM.caixa = 'todos'; await carregarEmails(true); }
  render();
  if (!EM.corpo[id]) {
    const { data } = await sb.from('emails').select('texto,html').eq('id', id).single();
    EM.corpo[id] = data || { texto: '' }; render();
  }
  const x = EM.lista.find(y => y.id === id);
  if (x && x.direcao === 'entrada' && !x.lido_em) {
    x.lido_em = new Date().toISOString(); if (!x.arquivado) EM.naoLidos = Math.max(0, EM.naoLidos - 1);
    await sb.from('emails').update({ lido_em: x.lido_em, lido_por: EU.id }).eq('id', id); render();
  }
}
async function emAnexo(id, emailId) {
  const a = EM.lista.find(e => e.id === Number(emailId))?.anexos?.find(x => x.id === Number(id)); if (!a) return;
  const { data, error } = await sb.storage.from('emails').createSignedUrl(a.caminho, 600, { download: /pdf|image/.test(a.tipo || '') ? false : a.nome });
  if (error) return avisar(error.message);
  window.open(data.signedUrl, '_blank', 'noopener');
}
/** Liga o boleto à nota do mesmo CNPJ à mão (a ligação automática das 17h não troca o que foi ligado à mão). */
async function emBolNF(id) {
  const b = EM.boletos.find(x => x.id === Number(id)); if (!b?.cnpj) return avisar('Este boleto não tem CNPJ do beneficiário.');
  const cnpjFmt = b.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const [tiny, email] = await Promise.all([
    sb.from('nf_entradas').select('numero,chave,valor,emissao').or(`fornecedor_doc.eq.${b.cnpj},fornecedor_doc.eq.${cnpjFmt}`).order('emissao', { ascending: false }).limit(30).then(r => r.data || []),
    sb.from('nfs_recebidas').select('numero,chave,valor,emissao').eq('cnpj', b.cnpj).order('emissao', { ascending: false }).limit(30).then(r => r.data || []),
  ]);
  const notas = [...email.map(n => ({ ...n, origem: 'email' })), ...tiny.filter(t => !email.some(e => e.chave && e.chave === t.chave)).map(n => ({ ...n, origem: 'tiny' }))];
  if (!notas.length) return avisar('Nenhuma nota desse CNPJ na Intranet (nem por e-mail nem no Tiny).');
  modal(`<button class="btn peq fechar" data-a="fecharModal">✕</button><h2>Ligar nota ao boleto</h2>
    <p class="explica">${esc(b.beneficiario || '')} · boleto de <b>${R(b.valor)}</b>${b.vencimento ? ' · vence ' + fmtCurta(b.vencimento) : ''}</p>
    <div class="acoes" style="flex-direction:column;align-items:stretch">${notas.map((n, i) => `<button class="btn" data-a="emBolNFOk" data-id="${b.id}" data-i="${i}" style="text-align:left">NF <b>${esc(n.numero || '')}</b> · ${R(n.valor)} · emitida ${n.emissao ? fmtCurta(String(n.emissao).slice(0, 10)) : '—'} <small class="mut">(${n.origem === 'tiny' ? 'Tiny' : 'e-mail'})</small></button>`).join('')}
      ${b.nf_numero ? `<button class="btn peq" data-a="emBolNFOk" data-id="${b.id}" data-i="-1">Tirar a ligação</button>` : ''}</div>`);
  EM.notasEscolha = notas;
}
async function emBolNFSalvar(id, i) {
  const b = EM.boletos.find(x => x.id === Number(id)), n = EM.notasEscolha?.[Number(i)];
  const upd = n ? { nf_chave: n.chave || null, nf_numero: n.numero || null, nf_valor: n.valor || null, nf_origem: n.origem, vinculo: 'manual' } : { nf_chave: null, nf_numero: null, nf_valor: null, nf_origem: null, vinculo: null };
  Object.assign(b, await ok(sb.from('boletos_pagar').update(upd).eq('id', b.id).select().single()));
  fecharModal(); avisar(n ? `Boleto ligado à NF ${n.numero}.` : 'Ligação retirada.'); render();
}
async function emBoleto(id, status) {
  const b = EM.boletos.find(x => x.id === Number(id)); if (!b) return;
  if (status === 'pago' && !confirm(`Marcar como PAGO o boleto de ${b.beneficiario || ''} (${b.valor ? R(b.valor) : ''})?`)) return;
  const obs = status === 'ignorado' ? prompt('Por que ignorar? (duplicado, cancelado, não é nosso…)') : null;
  if (status === 'ignorado' && obs == null) return;
  const r = await ok(sb.from('boletos_pagar').update({ status, pago_em: status === 'pago' ? new Date().toISOString() : null, pago_por: status === 'pago' ? EU.id : null, obs: obs || b.obs }).eq('id', b.id).select().single());
  Object.assign(b, r); avisar(status === 'pago' ? 'Boleto marcado como pago.' : 'Boleto ignorado.'); render();
}
async function emArquivar(id) {
  if (!emPodeArquivar()) return avisar('Seu acesso permite consultar os e-mails, mas não arquivar ou desarquivar.');
  const e = EM.lista.find(x => x.id === Number(id)); if (!e) return;
  await ok(sb.from('emails').update({ arquivado: !e.arquivado }).eq('id', e.id).select('id'));
  e.arquivado = !e.arquivado; EM.sel = null;
  EM.naoLidos = EM.lista.filter(x => x.direcao === 'entrada' && !x.lido_em && !x.arquivado).length;
  render();
}
