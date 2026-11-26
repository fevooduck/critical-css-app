// Triagem da varredura do compare-lp-batch.mjs: tira o ruído conhecido, agrupa as diferenças de estilo por
// (elemento, propriedade, de → para) e classifica cada página.
//
// Uso: node scripts/theme-compare/component-pages-triage.mjs [--label=antes] [--vp=desktop] [--top=60]
// Saída: data/component-pages/<label>/triage.json (por página) e patterns.tsv (padrões x nº de páginas).
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=') || d;
const LABEL = opt('label', 'antes');
const VP = opt('vp', 'desktop');
const TOP = Number(opt('top', 60));
const DIR = path.join('data/component-pages', LABEL);
const results = JSON.parse(fs.readFileSync(path.join(DIR, 'results.json')));

// Ruído conhecido (não é regressão):
// - host nas URLs (cookit-2 x cookit-3 / prod);
// - fallback métrico da fonte (perf/typekit-font-fallback): compara só a 1ª família;
// - .sr-only do tema novo (visualmente escondido de verdade);
// - --filter-white/--filter-black com o valor novo também no legado (decisão de 24/11/2026).
const norm = (prop, v) => {
  v = v.replace(/https?:\/\/[^/"')]+/g, '').replace(/\/themes\/custom\/(new_)?cookit\//g, '/themes/custom/T/');
  if (prop === 'font-family') v = v.split(',')[0].trim().replace(/"/g, '');
  if (prop === 'filter') v = v.replace(/^brightness\(0\) invert\(1\)$/, 'invert(1)').replace(/^invert\(0\.12\) sepia\(0\.01\).*$|^brightness\(0\)$/, 'BLACK');
  return v;
};
const ignoreKey = (leaf) => /(^|\.)sr-only(\.|$)|chat-tag|bubble-whats|modal--login|modal__/.test(leaf);
const leafOf = (key) => key.replace(/ #\d+$/, '').split(' > ').pop();

const patterns = new Map();
const triage = {};
for (const [slug, rec] of Object.entries(results)) {
  const r = rec.vp?.[VP] || {};
  const sn = r.signals_novo || {};
  const sv = r.signals_velho || {};
  const t = { path: rec.path, title: rec.title, nid: rec.nid, ref: r.ref, status: [r.statusNovo, r.statusVelho], tags: [], diffs: 0 };
  triage[slug] = t;
  const fn = path.join(DIR, `${slug}-novo-${VP}.json`);
  const fv = path.join(DIR, `${slug}-velho-${VP}.json`);
  if (!fs.existsSync(fn) || !fs.existsSync(fv)) { t.tags.push('sem-comparacao'); continue; }
  const novo = new Map(JSON.parse(fs.readFileSync(fn)).map((e) => [e.key, e]));
  const velho = JSON.parse(fs.readFileSync(fv));
  const fam = { espacamento: 0, botao: 0, tipografia: 0, filtro: 0, cor: 0, layout: 0 };
  for (const e of velho) {
    const a = novo.get(e.key);
    const leaf = leafOf(e.key);
    if (!a || ignoreKey(leaf)) continue;
    for (const p in e.st) {
      if (p === 'width' || p === 'height') continue;
      const from = norm(p, e.st[p]);
      const to = norm(p, a.st[p]);
      if (from === to) continue;
      t.diffs++;
      const isBtn = /(^|\.)(cta|btn)/.test(leaf);
      if (isBtn) fam.botao++;
      else if (/^(margin|padding|gap)/.test(p)) fam.espacamento++;
      else if (/^(font|line-height|letter|text-)/.test(p)) fam.tipografia++;
      else if (p === 'filter') fam.filtro++;
      else if (/color|background/.test(p)) fam.cor++;
      else fam.layout++;
      const k = [leaf.slice(0, 70), p, from.slice(0, 50), to.slice(0, 50)].join('\t');
      if (!patterns.has(k)) patterns.set(k, new Set());
      patterns.get(k).add(slug);
    }
  }
  t.fam = fam;
  const hn = sn.mainHeight || 0;
  const hv = sv.mainHeight || 1;
  t.heightRatio = +(hn / hv).toFixed(2);
  t.pixels = r.pixels?.pct;
  const unN = (sn.handGlide || 0) - (sn.handGlideMounted || 0);
  const unV = (sv.handGlide || 0) - (sv.handGlideMounted || 0);
  if (unN > unV) t.tags.push(`slider-nao-monta(${unN - unV})`);
  if ((sn.cardSdc || 0) > (sv.cardSdc || 0)) t.tags.push(`card-sdc(${sn.cardSdc - (sv.cardSdc || 0)})`);
  if (fam.espacamento) t.tags.push('espacamento');
  if (fam.botao) t.tags.push('botao');
  if (fam.filtro) t.tags.push('filtro');
  if (sn.h1 !== sv.h1) t.tags.push('conteudo-diferente');
  if (r.ref === 'prod') t.tags.push('ref-prod');
  if (t.heightRatio > 1.1 || t.heightRatio < 0.9) t.tags.push(`altura(${t.heightRatio})`);
  if (!t.tags.length || (t.diffs < 5 && (t.pixels ?? 100) < 5)) t.tags.unshift('ok');
  t.lpCss = sn.lpCss || [];
}

const rows = [...patterns.entries()].map(([k, s]) => [s.size, k, [...s].slice(0, 3).join(',')]).sort((a, b) => b[0] - a[0]);
fs.writeFileSync(path.join(DIR, 'patterns.tsv'), 'paginas\telemento\tpropriedade\tvelho\tnovo\texemplos\n' + rows.map((r) => r.join('\t')).join('\n'));
fs.writeFileSync(path.join(DIR, 'triage.json'), JSON.stringify(triage, null, 1));

const count = {};
for (const t of Object.values(triage)) for (const tag of t.tags) { const b = tag.replace(/\(.*/, ''); count[b] = (count[b] || 0) + 1; }
console.log('páginas por tag:', count);
console.log(`\nTop ${TOP} padrões (nº de páginas):`);
for (const r of rows.slice(0, TOP)) console.log(r[0] + '\t' + r[1]);
