#!/usr/bin/env node
/**
 * Compara as custom properties do :root legado (main.css) com as do :root novo
 * (new-theme-main.css) no CSS compilado do new_cookit, e lista quais outros CSS
 * do tema redefinem essas variáveis em :root.
 *
 * Uso: node scripts/theme-compare/audit-root-duplicates.mjs [<tema>]   (padrão: new_cookit do nestle-cult)
 * Saída: tabela no terminal + data/root-duplicates.json
 */
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const theme = process.argv[2] ?? '/home/codeduck/projects/nestle-cult/docroot/themes/custom/new_cookit';
const css = (f) => fs.readFileSync(path.join(theme, 'Content/css', f), 'utf8');

/** { "--var": { "<media>": valor } } só de regras cujo seletor é exatamente :root. */
function rootVars(source) {
  const out = {};
  postcss.parse(source).walkDecls(/^--/, (d) => {
    const rule = d.parent;
    if (rule.type !== 'rule' || rule.selector.trim() !== ':root') return;
    let media = 'base';
    for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) if (p.type === 'atrule') media = `@${p.name} ${p.params}`;
    (out[d.prop] ??= {})[media] = d.value.replace(/\s+/g, ' ').trim();
  });
  return out;
}

const legacy = rootVars(css('main.css'));
const fresh = rootVars(css('new-theme-main.css'));

const rows = [];
for (const [name, lv] of Object.entries(legacy)) {
  const nv = fresh[name];
  if (!nv) { rows.push({ name, kind: 'só legado', legacy: lv }); continue; }
  const same = JSON.stringify(lv) === JSON.stringify(nv);
  rows.push({ name, kind: same ? 'duplicada igual' : 'duplicada diferente', legacy: lv, novo: nv });
}

// Outros CSS do tema que redefinem em :root uma variável dos dois roots.
const watched = new Set(Object.keys(legacy));
const others = {};
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.css') ? [path.join(dir, e.name)] : []);
for (const file of walk(path.join(theme, 'Content/css'))) {
  const rel = path.relative(path.join(theme, 'Content/css'), file);
  if (['main.css', 'new-theme-main.css'].includes(rel) || rel.startsWith('critical/')) continue;
  for (const name of Object.keys(rootVars(fs.readFileSync(file, 'utf8')))) if (watched.has(name)) (others[name] ??= []).push(rel);
}

const fmt = (o) => o ? Object.entries(o).map(([m, v]) => (m === 'base' ? '' : m.replace(/screen and /, '') + ' ') + v).join(' | ') : '';
for (const kind of ['duplicada diferente', 'duplicada igual', 'só legado']) {
  const list = rows.filter((r) => r.kind === kind);
  console.log(`\n## ${kind} (${list.length})`);
  for (const r of list) console.log(`${r.name.padEnd(26)} legado: ${fmt(r.legacy).slice(0, 70).padEnd(70)} ${r.novo ? 'novo: ' + fmt(r.novo).slice(0, 70) : ''}${others[r.name] ? '  [também em: ' + others[r.name].join(', ') + ']' : ''}`);
}
fs.mkdirSync(new URL('../../data', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../../data/root-duplicates.json', import.meta.url), JSON.stringify({ rows, others }, null, 2));
