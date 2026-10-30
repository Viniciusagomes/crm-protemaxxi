// Cada página carrega vários js/*.js que dividem o mesmo escopo global do navegador.
// Um const/let/class repetido entre dois arquivos derruba o script inteiro (SyntaxError) e a tela fica em branco.
// Aqui cada página tem seus scripts carregados num mesmo contexto vm, na ordem do HTML, como o navegador faz.
// O contexto é vazio (sem document, fetch, supabase...): o código para no primeiro acesso ao navegador, sem efeito
// nenhum. A colisão de nomes acontece antes de qualquer linha rodar, na criação dos nomes globais do script.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');
// funções async do topo (ex.: avaliar.js) também param ao tocar no navegador, mas o erro chega depois, como promessa
process.on('unhandledRejection', () => {});

const paginas = fs.readdirSync(root).filter(f => f.endsWith('.html'));
let total = 0;
for (const pagina of paginas) {
  const html = fs.readFileSync(path.join(root, pagina), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)]
    .filter(m => !/\btype\s*=\s*["']?module/i.test(m[1]))               // módulos têm escopo próprio
    .map(m => (m[1].match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) || []).slice(1).find(Boolean))
    .filter(s => s && !/^(?:https?:)?\/\//i.test(s))
    .map(s => s.split(/[?#]/)[0].replace(/^\.?\//, ''));
  const ctx = vm.createContext({});
  for (const s of scripts) {
    const arq = path.join(root, s);
    assert.ok(fs.existsSync(arq), `${pagina}: ${s} não existe`);
    const src = fs.readFileSync(arq, 'utf8');
    try { new vm.Script(src, { filename: s }); }
    catch (e) { assert.fail(`${s}: erro de sintaxe: ${e.message}`); }
    try { new vm.Script(src, { filename: s }).runInContext(ctx, { timeout: 2000 }); }
    catch (e) {
      // qualquer outro erro é o código tentando usar o navegador, que não existe aqui
      if (e?.name === 'SyntaxError' && /already been declared/.test(e.message))
        assert.fail(`${pagina}: ${s}: ${e.message} (nome já declarado por um script carregado antes nesta página)`);
    }
  }
  total += scripts.length;
}
console.log(`OK: ${paginas.length} páginas, ${total} scripts sem erro de sintaxe nem nome global repetido.`);
