// Roda todos os testes tests/*.cjs, cada um no seu processo. Usado pelo CI do GitHub e localmente:
//   node tests/rodar-todos.cjs
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testes = fs.readdirSync(__dirname).filter(f => f.endsWith('.cjs') && f !== path.basename(__filename)).sort();
const falhas = [];
for (const t of testes) {
  const r = spawnSync(process.execPath, [path.join(__dirname, t)], { encoding: 'utf8', timeout: 120_000 });
  const ok = r.status === 0;
  console.log(`${ok ? '✔' : '✘'} ${t}`);
  if (!ok) { falhas.push(t); console.log((r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : '')); }
}
console.log(`\n${testes.length - falhas.length}/${testes.length} testes passaram.`);
process.exit(falhas.length ? 1 : 0);
