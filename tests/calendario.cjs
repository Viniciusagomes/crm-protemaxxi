// Calendário de marketing: itens por dia de quem tem a permissão "calendario", com o supervisor e o dono incluindo itens.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');
const campos = {}, aviso = { textContent: '', hidden: true };
const ctx = vm.createContext({ console, URL, location: { href: 'https://exemplo.test/index.html' }, window: { innerWidth: 1280 }, setTimeout: () => {}, clearTimeout: () => {},
  document: { querySelector: s => s === '#aviso' ? aviso : campos[s] != null ? { value: campos[s], focus() {} } : null, querySelectorAll: () => [], addEventListener: () => {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
vm.runInContext(`var UI = {}, EU = null, D = { pessoas: [] }, renders = 0, modalHtml = '', gravados = [], proximoId = 100;
  const ehDono = () => !!EU && EU.papel === 'dono';
  async function ok(q) { const { data, error } = await q; if (error) throw new Error(error.message); return data; }
  const pessoa = id => D.pessoas.find(p => p.id === id), nomeP = id => pessoa(id)?.nome || '—';
  const pessoasQueVejo = () => ehDono() ? D.pessoas.map(p => p.id) : [EU.id, ...D.pessoas.filter(p => p.supervisor === EU.id).map(p => p.id)];
  const render = () => { renders++; }, modal = h => { modalHtml = h; }, fecharModal = () => { modalHtml = ''; }, confirm = () => true;
  // banco de mentira: guarda o que foi pedido e devolve as linhas como o PostgREST devolveria
  const sb = { from: t => { const q = { t, op: 'select', filtros: [] };
    const b = { select: () => b, in: () => b, gte: () => b, lte: () => b, lt: () => b, neq: () => b, order: () => b, limit: () => b,
      eq: (c, v) => { q.filtros.push([c, v]); return b; },
      insert: linhas => { q.op = 'insert'; q.linhas = linhas; return b; }, update: m => { q.op = 'update'; q.mud = m; return b; }, delete: () => { q.op = 'delete'; return b; },
      single: () => b, maybeSingle: () => b,
      then: (ok, err) => { gravados.push(q); let data = [];
        if (q.op === 'insert') data = q.linhas.map(l => ({ id: proximoId++, criado_por: EU.id, criado_em: '2026-11-05T12:00:00Z', obs: null, ...l }));
        if (q.op === 'update') { const i = calItem(q.filtros[0][1]); data = { ...i, ...q.mud }; }
        if (q.op === 'delete') data = { id: q.filtros[0][1] };
        return Promise.resolve({ data, error: null }).then(ok, err); } };
    return b; } };`, ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/calendario.js'), 'utf8'), ctx, { filename: 'calendario.js' });
const run = code => vm.runInContext(code, ctx);
const js = code => JSON.parse(run(`JSON.stringify(${code})`));

// pessoas fictícias: dono, supervisor, estagiário com calendário e outra estagiária sem calendário
run(`D.pessoas = [
  { id: 'dono1', nome: 'Dono Teste', papel: 'dono', ativo: true, permissoes: {} },
  { id: 'sup1', nome: 'Supervisor Teste', papel: 'supervisor', supervisor: 'dono1', ativo: true, permissoes: {} },
  { id: 'est1', nome: 'Estagiário Teste', papel: 'estagiario', supervisor: 'sup1', ativo: true, permissoes: { calendario: true } },
  { id: 'est2', nome: 'Estagiária Dois', papel: 'estagiario', supervisor: 'dono1', ativo: true, permissoes: {} }];
  EU = pessoa('sup1');`);

// repetir
assert.deepEqual(js(`calDatasRepetir('2026-11-06', 'u5')`), ['2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'], 'dia útil pula o fim de semana');
assert.deepEqual(js(`calDatasRepetir('2026-01-31', 'm3')`), ['2026-01-31', '2026-02-28', '2026-03-31'], 'mês curto cai no último dia');
assert.deepEqual(js(`calDatasRepetir('2026-11-05', 's4')`), ['2026-11-05', '2026-11-12', '2026-11-19', '2026-11-26'], 'toda semana');
assert.deepEqual(js(`calDatasRepetir('2026-11-05', '0')`), ['2026-11-05'], 'sem repetir');
assert.deepEqual(js(`calTitulos('- Reels do kit\\n\\n2. Story\\n10 dicas de câmera')`), ['Reels do kit', 'Story', '10 dicas de câmera'], 'uma linha por item');

// quem enxerga
assert.deepEqual(js(`calPessoas().map(p => p.id)`), ['est1'], 'supervisor vê o calendário do estagiário');
run(`EU = pessoa('est2')`); assert.equal(run(`calPessoas().length`), 0, 'quem não é da equipe não vê');
run(`EU = pessoa('dono1')`); assert.equal(run(`calPessoas().length`), 1, 'dono vê');
assert.equal(run(`cardCalendario(pessoa('est2'))`), '', 'sem permissão de calendário: sem card');

// itens carregados (como viriam do banco)
const h = run('hoje()'), ontem = run(`addDias(hoje(), -1)`);
run(`EU = pessoa('sup1'); Object.assign(CAL, { mes: mesDe(hoje()), dia: hoje(), de: addDias(hoje(), -40), ate: addDias(hoje(), 40), erro: '',
  itens: [{ id: 1, pessoa_id: 'est1', data: hoje(), titulo: 'Post do kit', canal: 'instagram', status: 'a_fazer', ordem: 0, criado_por: 'sup1' },
          { id: 2, pessoa_id: 'est1', data: hoje(), titulo: 'Arte <b>nova</b>', canal: 'design', status: 'feito', ordem: 1, criado_por: 'est1', link: 'javascript:alert(1)' }],
  atrasados: [{ id: 3, pessoa_id: 'est1', data: '${ontem}', titulo: 'Reels atrasado', canal: 'instagram', status: 'fazendo', ordem: 0, criado_por: 'sup1' }] });`);
const card = run(`cardCalendario(pessoa('est1'))`);
assert.ok(card.includes('Post do kit') && card.includes('Reels atrasado') && card.includes('1 atrasado'), 'card: itens de hoje e atrasados');
assert.ok(card.includes('Arte &lt;b&gt;nova&lt;/b&gt;') && !card.includes('javascript:'), 'card: texto escapado e link perigoso fora');
assert.ok(card.includes('data-a="calNovo"') && card.includes('passado por Supervisor Teste'), 'card: incluir e quem passou');

// grade do mês: semanas completas, item arrastável para quem pode mexer
const grade = run(`gradeCal('est1', mesDe(hoje()))`);
assert.equal((grade.match(/data-cal-dia=/g) || []).length % 7, 0, 'grade em semanas completas');
assert.ok(grade.includes(`data-cal-dia="${h}"`) && /data-cal="1"[^>]*/.test(grade) && grade.includes('draggable="true" data-cal="1"'), 'supervisor arrasta o item');
assert.ok(run(`vCalendario()`).includes('Calendário de marketing'), 'tela do mês abre');
run(`UI.calVista = 'lista'`); assert.ok(run(`vCalendario()`).includes('Post do kit'), 'tela em lista abre');

// estagiário: item passado pelo supervisor só muda andamento e observação
run(`EU = pessoa('est1')`);
assert.equal(run(`calPodeEditar(calItem(1))`), false, 'item do supervisor: estagiário não reescreve');
assert.equal(run(`calPodeEditar(calItem(2))`), true, 'item próprio: estagiário edita');
assert.ok(!run(`calChip(calItem(1))`).includes('draggable'), 'item do supervisor não arrasta');
run(`calForm(calItem(1))`);
assert.ok(/id="calTitulo"[^>]*disabled/.test(run('modalHtml')) && !/id="calStatusF"[^>]*disabled/.test(run('modalHtml')), 'formulário: título travado, andamento livre');
assert.ok(!run('modalHtml').includes('calExcluir'), 'estagiário não exclui item do supervisor');

(async () => {
  Object.assign(campos, { '#calData': ontem, '#calCanal': 'design', '#calStatusF': 'revisar', '#calTitulo': 'trocado', '#calDescricao': '', '#calLink': '', '#calObs': 'falta a foto' });
  await run(`calSalvar({ dataset: { id: '1', p: 'est1' } })`);
  assert.ok(run("gravados.length"), "nada gravado: " + aviso.textContent);
  assert.deepEqual(js(`gravados.at(-1).mud`), { status: 'revisar', obs: 'falta a foto' }, 'estagiário grava só andamento e observação');
  run(`gravados.length = 0; calMover('1', addDias(hoje(), 2))`);
  assert.equal(run('gravados.length'), 0, 'não muda a data do item do supervisor');

  // supervisor inclui duas linhas repetindo por 4 semanas
  run(`EU = pessoa('sup1'); gravados.length = 0`);
  Object.assign(campos, { '#calData': h, '#calCanal': 'instagram', '#calStatusF': 'a_fazer', '#calTitulo': 'Reels\nStory', '#calRepetir': 's4', '#calLink': 'https://drive.exemplo.test/x' });
  await run(`calSalvar({ dataset: { id: '', p: 'est1' } })`);
  const ins = js(`gravados[0].linhas`);
  assert.equal(ins.length, 8, '2 itens x 4 semanas');
  assert.ok(ins.every(l => l.pessoa_id === 'est1' && !('criado_por' in l)), 'quem criou fica por conta do banco');
  assert.equal(ins[0].ordem, 2, 'entra depois dos itens que já estavam no dia');
  campos['#calLink'] = 'ftp://x'; run('gravados.length = 0');
  await run(`calSalvar({ dataset: { id: '', p: 'est1' } })`);
  assert.equal(run('gravados.length'), 0, 'link que não é http(s) não grava');

  // concluir pelo checkbox tira dos atrasados
  await run(`calMudar(3, { status: 'feito' })`);
  assert.equal(run(`CAL.atrasados.length`), 0, 'feito sai dos atrasados');

  // virada do dia: o que era de hoje vira atrasado, então recarrega em vez de mostrar a lista velha
  run(`CAL.dia = '2000-01-01'`);
  assert.ok(run(`cardCalendario(pessoa('est1'))`).includes('Carregando'), 'virada do dia recarrega');
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8'), crm = fs.readFileSync(path.join(root, 'js/crm.js'), 'utf8');
  assert.ok(main.includes("calendario: () => vCalendario()") && main.includes("add('calendario')") && main.includes("['calendario', 'Calendário de marketing']"), 'aba, perfil e permissão ligados');
  assert.ok(crm.includes('cardCalendario(EU)') && fs.readFileSync(path.join(root, 'js/equipe.js'), 'utf8').includes('cardCalendario(p, d)'), 'card no Meu dia e no Checklist');
  console.log('OK: calendário de marketing.');
})().catch(e => { console.error(e); process.exit(1); });
