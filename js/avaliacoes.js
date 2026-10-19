'use strict';
/* Intranet Protemaxxi — Avaliação do atendimento: convites 5 dias depois da compra (e-mail automático ou WhatsApp com um toque),
   log de todas as notas, notas baixas para tratar e configuração (link do Google, prazos). */

const AVA = { lista: null, cfg: null, carregando: false, em: 0 };
const ST_AVA = { pendente: ['⏳ A enviar', 'med'], enviado: ['📨 Enviado', 'azul'], erro: ['⚠ Erro', 'ruim'], respondido: ['✅ Respondeu', 'ok'], descadastrado: ['🚫 Saiu da lista', ''], cancelado: ['✕ Cancelado', ''] };
const linkAva = a => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}avaliar.html?t=${a.token}`;
const estrelas = n => n ? `<span class="ava-est">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>` : '<span class="mut">—</span>';

async function carregarAva(forcar) {
  if (AVA.carregando || (!forcar && AVA.lista && Date.now() - AVA.em < 60e3)) return;
  AVA.carregando = true;
  try {
    const [lista, cfg] = await Promise.all([
      todas(() => sb.from('avaliacoes').select('*').eq('teste', false).gte('criado_em', new Date(Date.now() - 180 * 864e5).toISOString()).order('criado_em', { ascending: false })),
      sb.from('config').select('valor').eq('chave', 'avaliacoes').maybeSingle().then(r => r.data?.valor || {}),
    ]);
    AVA.lista = lista; AVA.cfg = cfg; AVA.em = Date.now();
  } finally { AVA.carregando = false; }
}

function vAvaliacoes() {
  if (!AVA.lista) { if (!AVA.carregando) carregarAva().then(render).catch(e => avisar(e.message)); return topo('Avaliações', '') + '<div class="card vazio">Carregando…</div>'; }
  const l = AVA.lista, c = AVA.cfg || {}, d30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const mes = l.filter(a => a.criado_em >= d30), resp = mes.filter(a => a.nota), notas = l.filter(a => a.nota);
  const media = notas.length ? soma(notas.map(a => a.nota)) / notas.length : null;
  const tratar = l.filter(a => a.nota && a.nota <= 3 && !a.tratado);
  const zap = l.filter(a => a.canal === 'whatsapp' && a.status === 'pendente');
  const porV = Object.values(notas.reduce((m, a) => { const k = a.vendedor_id || '_'; (m[k] ||= { vid: a.vendedor_id, n: 0, s: 0, ruins: 0 }); m[k].n++; m[k].s += a.nota; if (a.nota <= 3) m[k].ruins++; return m; }, {})).sort((a, b) => b.s / b.n - a.s / a.n);
  // quem fez e quem não fez
  const FILTROS_AVA = { todos: ['Todos', () => true], responderam: ['✅ Responderam', a => !!a.nota], nao: ['⏳ Receberam e não responderam', a => a.status === 'enviado' && !a.nota],
    fila: ['📮 Na fila de envio', a => a.status === 'pendente'], erro: ['⚠ Erro / saíram da lista', a => ['erro', 'descadastrado', 'cancelado'].includes(a.status)] };
  UI.avaFiltro = FILTROS_AVA[UI.avaFiltro] ? UI.avaFiltro : 'todos';
  const lf = l.filter(FILTROS_AVA[UI.avaFiltro][1]);
  const pausado = c.ativo && Number(c.limite_dia ?? 90) === 0;
  const linha = a => `<tr><td><b>${esc(a.cliente_nome || '')}</b>${a.email ? `<br><small class="mut">${esc(a.email)}</small>` : ''}<br><small>pedido ${esc(a.pedido_numero || '')} · ${a.data_compra ? fmtCurta(a.data_compra) : ''} · <span style="color:${corVendedor(a.vendedor_id)}">●</span> ${esc(nomeVendedor(a.vendedor_id))}</small></td>
    <td>${a.canal === 'email' ? '✉' : '💬'} <span class="tag ${ST_AVA[a.status][1]}">${ST_AVA[a.status][0]}</span>${a.enviado_em ? `<br><small class="mut">enviado ${fmtCurta(a.enviado_em.slice(0, 10))}</small>` : ''}${a.erro ? `<br><small class="c-ruim">${esc(a.erro.slice(0, 80))}</small>` : ''}</td><td>${estrelas(a.nota)}${a.clicou_google ? ' <small title="Clicou em avaliar no Google">G</small>' : ''}</td>
    <td><small>${esc(a.comentario || '')}</small>${a.tratado ? `<br><small class="c-ok">✔ tratado por ${esc(nomeP(a.tratado_por))}${a.nota_interna ? ': ' + esc(a.nota_interna) : ''}</small>` : ''}</td></tr>`;
  return topo('Avaliações', 'Avaliação do atendimento: o cliente recebe o convite 5 dias depois da compra. Nota 4–5 é convidada a avaliar no Google; nota 1–3 conta o problema direto para vocês.',
      `<button class="btn" data-a="avaAtualizar">↻ Atualizar</button>`)
    + `${pausado ? `<div class="alerta med"><span class="ic">⏸</span><span><b>Envios pausados</b> (limite por dia = 0). ${ehDono() ? 'Mande um e-mail de teste e, se estiver tudo certo, coloque o limite por dia (ex.: 90) na configuração.' : ''}</span></div>` : ''}
    ${!c.ativo ? `<div class="alerta med"><span class="ic">⏸</span><span><b>Os convites estão desligados.</b> ${ehDono() ? 'Confira a configuração no fim da página e ligue quando o e-mail estiver pronto e o link do Google preenchido.' : 'O Vinícius liga quando estiver tudo pronto.'}</span></div>` : ''}
    <div class="grid g4 mt"><div class="card kpi-card destaque"><div class="rot">Nota média</div><div class="val verde">${media ? media.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' ★' : '—'}</div><div class="sub">${notas.length} avaliação(ões)</div></div>
      <div class="card kpi-card"><div class="rot">Convites (30 dias)</div><div class="val">${mes.length}</div><div class="sub">${P(mes.length ? resp.length / mes.length : 0)} responderam</div></div>
      <div class="card kpi-card"><div class="rot">Notas 4 e 5</div><div class="val c-ok">${P(notas.length ? notas.filter(a => a.nota >= 4).length / notas.length : 0)}</div><div class="sub">${notas.filter(a => a.clicou_google).length} clicaram em avaliar no Google</div></div>
      <div class="card kpi-card"><div class="rot">Para tratar</div><div class="val ${tratar.length ? 'c-ruim' : 'c-ok'}">${tratar.length}</div><div class="sub">notas 1 a 3 sem retorno</div></div></div>
    ${tratar.length ? `<div class="card mt"><div class="secao-titulo"><h2>⚠️ Clientes insatisfeitos: entrar em contato</h2></div>${tratar.map(a => `<div class="atv"><div style="flex:1">${estrelas(a.nota)} <b>${esc(a.cliente_nome || '')}</b> · <small>pedido ${esc(a.pedido_numero || '')} · ${esc(nomeVendedor(a.vendedor_id))}</small><br>${a.comentario ? `<span>“${esc(a.comentario)}”</span>` : '<small class="mut">(não escreveu comentário)</small>'}</div>
        ${a.fone ? `<a class="btn peq" href="${linkWa(a.fone)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}<button class="btn peq pri" data-a="avaTratar" data-id="${a.id}">✔ Tratado</button></div>`).join('')}</div>` : ''}
    ${zap.length ? `<div class="card mt"><div class="secao-titulo"><h2>💬 Convites para enviar pelo WhatsApp</h2><small>clientes sem e-mail · um toque abre o WhatsApp com a mensagem pronta</small></div>
      ${zap.map(a => `<div class="atv"><div style="flex:1"><b>${esc(a.cliente_nome || '')}</b><br><small>${esc(a.fone || '')} · pedido ${esc(a.pedido_numero || '')} · ${esc(nomeVendedor(a.vendedor_id))}</small></div><button class="btn peq pri" data-a="avaWa" data-id="${a.id}">Enviar</button><button class="btn peq" data-a="avaPular" data-id="${a.id}">Pular</button></div>`).join('')}</div>` : ''}
    <div class="grid g2 mt"><div class="card"><h2>Por vendedor</h2><table class="tabela"><tbody>${porV.map(v => `<tr><td><span style="color:${corVendedor(v.vid)}">●</span> ${esc(nomeVendedor(v.vid))}</td><td class="dir">${(v.s / v.n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ★</td><td class="dir"><small>${v.n} avaliação(ões)${v.ruins ? ` · ${v.ruins} baixa(s)` : ''}</small></td></tr>`).join('') || '<tr><td class="mut">Sem avaliações ainda.</td></tr>'}</tbody></table></div>
      ${ehDono() ? `<div class="card"><h2>⚙ Configuração</h2><div class="form-grid">
        <label class="campo inteiro">Link de avaliação do Google *<input type="url" id="avGoogle" value="${esc(c.google_link || '')}" placeholder="https://g.page/r/…/review"></label>
        <label class="campo">Dias depois da compra<input type="number" id="avDias" value="${c.dias_apos_compra ?? 5}" min="1" max="30"></label>
        <label class="campo">Não repetir o cliente por (dias)<input type="number" id="avInt" value="${c.intervalo_dias ?? 90}" min="7"></label>
        <label class="campo">E-mails por dia (0 = pausado)<input type="number" id="avLim" value="${c.limite_dia ?? 90}" min="0" max="3000"></label>
        <label class="campo inteiro"><span><input type="checkbox" id="avAtivo" ${c.ativo ? 'checked' : ''}> <b>Convites ligados</b> (cria os convites todo dia às 9h; e-mail sai entre 9h e 19h)</span></label></div>
        <div class="acoes"><button class="btn pri" data-a="avaConfig">Salvar configuração</button><button class="btn" data-a="avaTeste">📧 Enviar e-mail de teste</button></div>
        <p class="mut" style="font-size:12.5px">O link do Google fica no Perfil da Empresa: Google Maps → sua empresa → "Pedir avaliações" → copiar link.</p></div>` : ''}</div>
    <div class="card mt"><div class="secao-titulo"><h2>Quem respondeu e quem não respondeu</h2><small>últimos 180 dias</small></div>
      <div class="chips" style="margin-bottom:10px">${Object.entries(FILTROS_AVA).map(([k, [n, f]]) => `<button class="chip ${UI.avaFiltro === k ? 'on' : ''}" data-a="avaFiltro" data-v="${k}">${n}<span class="n">${l.filter(f).length}</span></button>`).join('')}</div>
      ${lf.length ? listaCurta('avaLog', `<table class="tabela"><thead><tr><th>Cliente</th><th>Convite</th><th>Nota</th><th>Comentário</th></tr></thead><tbody>${lf.map(linha).join('')}</tbody></table>`, 'Buscar cliente, vendedor, comentário…', true) : '<div class="vazio">Nenhum convite ainda.</div>'}</div>`;
}
async function avaTratar(id) {
  const nota = prompt('O que foi feito com este cliente? (fica registrado)'); if (nota === null) return;
  const a = AVA.lista.find(x => String(x.id) === String(id));
  Object.assign(a, await ok(sb.from('avaliacoes').update({ tratado: true, tratado_por: EU.id, tratado_em: new Date().toISOString(), nota_interna: nota || null }).eq('id', id).select().single()));
  render();
}
async function avaWa(id) {
  const a = AVA.lista.find(x => String(x.id) === String(id)); if (!a) return;
  const empresa = (await sb.from('config').select('valor').eq('chave', 'assistencia').maybeSingle()).data?.valor?.empresa || '';
  const msg = (AVA.cfg?.whatsapp || 'Olá, {cliente}! Pode avaliar nosso atendimento? {link}').replace(/\{cliente\}/g, (a.cliente_nome || '').split(' ')[0]).replace(/\{empresa\}/g, empresa).replace(/\{link\}/g, linkAva(a));
  window.open(`${linkWa(a.fone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  Object.assign(a, await ok(sb.from('avaliacoes').update({ status: 'enviado', enviado_em: new Date().toISOString() }).eq('id', id).select().single()));
  render();
}
async function avaPular(id) {
  const a = AVA.lista.find(x => String(x.id) === String(id));
  Object.assign(a, await ok(sb.from('avaliacoes').update({ status: 'cancelado' }).eq('id', id).select().single())); render();
}
async function avaTeste() {
  const email = prompt('Enviar o e-mail de avaliação de TESTE para qual endereço?', EU.email || '');
  if (!email) return;
  try { const r = await chamarFuncao('avaliacoes-email', { teste_email: email.trim(), nome: primeiroNome(EU) });
    alert(`E-mail de teste enviado para ${r.enviado_para} ✓\n\nConfira a caixa de entrada (e o spam). O teste não entra nas estatísticas.`); }
  catch (e) { alert('Não enviou: ' + e.message); }
}
async function avaConfig() {
  const google = $('#avGoogle').value.trim(), ativo = $('#avAtivo').checked;
  if (ativo && !/^https:\/\/(g\.page|search\.google|www\.google|maps\.app\.goo\.gl|goo\.gl|maps\.google)/.test(google)) return avisar('Para ligar os convites, cole o link de avaliação do Google (começa com https://g.page/… ou https://search.google.com/…).');
  const lim = Math.max(0, Math.round(+$('#avLim').value || 0));
  const valor = { ...(AVA.cfg || {}), google_link: google || null, ativo, dias_apos_compra: Math.max(1, +$('#avDias').value || 5), intervalo_dias: Math.max(7, +$('#avInt').value || 90), limite_dia: lim };
  await ok(sb.from('config').update({ valor }).eq('chave', 'avaliacoes'));
  AVA.cfg = valor; avisar(ativo ? 'Convites ligados.' : 'Configuração salva (convites desligados).'); render();
}
