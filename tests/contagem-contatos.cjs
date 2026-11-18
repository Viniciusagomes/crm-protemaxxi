// Contagem sem aprovação (texto da tela) e contatos de clientes sem dono para o vendedor (18/11).
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), ler = f => fs.readFileSync(path.join(root, f), 'utf8');
const exp = ler('js/expedicao.js');
assert.match(exp, /EXP\.cfg\.ajuste_auto_sem_aprovacao \? 'corrige sozinha qualquer diferença, sem precisar de aprovação\.'/);
const mig = fs.readdirSync(path.join(root, 'supabase/migrations')).find(f => f.endsWith('_contatos_clientes_sem_dono.sql'));
assert.ok(mig, 'migration dos contatos existe');
const sql = ler('supabase/migrations/' + mig);
assert.match(sql, /seg\.sou_vendedor\(\)\) and seg\.cliente_sem_dono\(cliente_chave\)/, 'só vendedor vê os sem dono');
assert.match(sql, /n\.etapa <> 'perdido'/, 'negócio perdido não prende o cliente');
assert.match(sql, /pe\.ativo and pe\.tiny_vendedor_id::text = p\.vendedor_id/, 'só vendedor ativo é dono');
assert.match(sql, /revoke all on function seg\.cliente_sem_dono\(text\), seg\.sou_vendedor\(\) from public, anon/);
console.log('✔ contagem-contatos.cjs');
