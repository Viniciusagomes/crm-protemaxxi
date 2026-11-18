// Meu dia em 3 telas (18/11): resumo, fila e leads, checklist; atendimento do WhatsApp por pessoa.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), ler = f => fs.readFileSync(path.join(root, f), 'utf8');
const main = ler('js/main.js'), crm = ler('js/crm.js'), painel = ler('js/painel.js');
assert.match(main, /meudia: \[\['meudia', 'Meu dia'\], \['fila', 'Fila e leads'\], \['checklist', 'Checklist'\]\]/, 'três sub-abas, fila logo depois do resumo');
assert.match(main, /fila: \(\) => vFilaDia\(\)/); assert.match(main, /fila: \(\) => !!EU\.tiny \|\| ehDono\(\) \|\| !!EU\.permissoes\?\.vendas_todas/, 'fila só para quem vende');
assert.match(main, /fila: \(\) => CRM\.atv \?/, 'o número de pendências fica na fila');
const resumo = crm.slice(crm.indexOf('function vMeuDia()'), crm.indexOf('function diaAtendimento'));
assert.ok(!resumo.includes('cartaoFila') && !resumo.includes('cardChecklistHoje('), 'o resumo não carrega a fila nem o checklist inteiro');
assert.match(resumo, /painel_atendimento|diaAtendimento\(quem\)/); assert.match(resumo, /Propostas no mês/);
const fila = crm.slice(crm.indexOf('function vFilaDia()'), crm.indexOf('/** Meu dia (resumo)'));
assert.ok(!fila.includes('cardChecklistHoje(') && !fila.includes('painDiaResumo('), 'a fila começa direto nos leads');
assert.match(fila, /pain-vistas/);
assert.ok(!/v: 'meudia'/.test(painel), 'o Início manda o trabalho para a fila');
const mig = fs.readdirSync(path.join(root, 'supabase/migrations')).find(f => f.endsWith('_painel_atendimento.sql'));
const sql = ler('supabase/migrations/' + mig);
assert.match(sql, /p_pessoa not in \(select seg\.pessoas_visiveis\(\)\)/, 'só a própria pessoa, o supervisor ou o dono');
assert.match(sql, /revoke all on function public\.painel_atendimento\(text, int\) from public, anon/);
console.log('✔ meudia-3-telas.cjs');
