// Lê os JSON do compare-lp.mjs e lista as diferenças de estilo computado (novo x velho).
// Uso: node compare-lp-diff.mjs <saida-dir> <slug> <desktop|mobile> [filtro-regex-da-chave]
import fs from 'node:fs';
const [out, slug, vp, filter] = process.argv.slice(2);
const load = env => new Map(JSON.parse(fs.readFileSync(`${out}/${slug}-${env}-${vp}.json`)).map(e => [e.key, e]));
const novo = load('novo'), velho = load('velho');
const re = filter ? new RegExp(filter) : null;
const IGNORE_SIZE = new Set(['width', 'height']);
let n = 0;
for (const [k, v] of velho) {
  if (re && !re.test(k)) continue;
  const a = novo.get(k);
  if (!a) continue;
  const diffs = [];
  for (const p in v.st) {
    if (IGNORE_SIZE.has(p)) continue;
    if (v.st[p] !== a.st[p]) diffs.push(`${p}: ${v.st[p]} → ${a.st[p]}`);
  }
  const [, , w0, h0] = v.rect, [, , w1, h1] = a.rect;
  if (Math.abs(w0 - w1) > 2 || Math.abs(h0 - h1) > 2) diffs.push(`box: ${w0}x${h0} → ${w1}x${h1}`);
  if (diffs.length) { n++; console.log(`\n${k}\n  ` + diffs.join('\n  ')); }
}
const onlyOld = [...velho.keys()].filter(k => !novo.has(k) && (!re || re.test(k)));
const onlyNew = [...novo.keys()].filter(k => !velho.has(k) && (!re || re.test(k)));
console.log(`\n== ${n} elementos com diferença | só no velho: ${onlyOld.length} | só no novo: ${onlyNew.length}`);
