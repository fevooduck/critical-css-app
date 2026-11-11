// Confere no Chromium se o fallback com overrides imita a web font: renderiza o mesmo
// texto na fonte alvo (arquivo do cache local, só para teste) e no fallback local()
// com os overrides, e compara largura de uma linha, altura com line-height normal
// e número de linhas num box estreito.
//
// Uso: node compare-font-fallback.mjs --config data/font-fallback/config.json
// Lê data/font-fallback/metrics.json (gerado por font-fallback-metrics.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer';

const configPath = process.argv[process.argv.indexOf('--config') + 1] || 'data/font-fallback/config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const outDir = path.dirname(configPath);
const metrics = JSON.parse(fs.readFileSync(path.join(outDir, 'metrics.json'), 'utf8'));
const sample = fs.readFileSync(path.join(outDir, 'sample.txt'), 'utf8').slice(0, 1200);
const cacheFile = (src) => path.join(outDir, 'cache', crypto.createHash('sha1').update(src).digest('hex').slice(0, 16));

// Só os pares com fallback disponível no Linux (Liberation = métricas da Arial).
const pairs = metrics.results.filter((r) => r.fallback.startsWith('liberation'));

async function run(sizeAdjusts) {
const faces = [];
const cases = [];
pairs.forEach((r, i) => {
  const weight = Number(r.target.split('-')[1]);
  const t = metrics.fonts[r.target];
  const sa = sizeAdjusts[i];
  const localName = r.fallback.endsWith('700') ? 'Liberation Sans Bold' : 'Liberation Sans';
  const b64 = fs.readFileSync(cacheFile(config.targets[r.target])).toString('base64');
  faces.push(`@font-face{font-family:"T${i}";src:url(data:font/woff2;base64,${b64}) format("woff2");font-weight:${weight};}`);
  const variants = {
    typo: [t.raw.typo[0], Math.abs(t.raw.typo[1]), t.raw.typo[2]],
    hhea: [t.raw.hhea[0], Math.abs(t.raw.hhea[1]), t.raw.hhea[2]],
  };
  for (const [v, [a, d, g]] of Object.entries(variants)) {
    const p = (n) => `${((n / t.upm / sa) * 100).toFixed(2)}%`;
    faces.push(`@font-face{font-family:"F${i}${v}";src:local("${localName}");font-weight:${weight};size-adjust:${(sa * 100).toFixed(2)}%;ascent-override:${p(a)};descent-override:${p(d)};line-gap-override:${p(g)};}`);
  }
  cases.push({ i, weight, sa, target: r.target, fallback: r.fallback, variant: t.useTypo ? 'typo' : 'hhea' });
});

const html = `<!doctype html><meta charset="utf-8"><style>${faces.join('\n')}
body{margin:0} .box{width:340px;font-size:16px;line-height:normal} .line{white-space:nowrap;display:inline-block;font-size:16px}
</style><body>${cases
  .map(({ i, weight }) => ['T' + i, 'F' + i + 'typo', 'F' + i + 'hhea']
    .map((fam) => `<div class="box" data-fam="${fam}" style="font-family:'${fam}';font-weight:${weight}">${sample}</div><span class="line" data-fam="${fam}" style="font-family:'${fam}';font-weight:${weight}">${sample}</span><br>`)
    .join(''))
  .join('')}</body>`;

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const data = await page.evaluate(() => {
  const out = {};
  document.querySelectorAll('[data-fam]').forEach((el) => {
    const r = el.getBoundingClientRect();
    out[el.dataset.fam] ||= {};
    if (el.classList.contains('box')) {
      out[el.dataset.fam].boxH = r.height;
    } else out[el.dataset.fam].lineW = r.width;
  });
  return out;
});
await browser.close();

return { cases, data };
}

const diff = (a, b) => `${(((a - b) / b) * 100).toFixed(1)}%`;
const first = await run(pairs.map((r) => parseFloat(r['size-adjust']) / 100));
// Calibra size-adjust pela largura renderizada (inclui kerning da fonte alvo).
const calibrated = first.cases.map(({ i, sa, variant }) => sa * first.data['T' + i].lineW / first.data[`F${i}${variant}`].lineW);
const second = await run(calibrated);

const rows = second.cases.map(({ i, sa, target, fallback, variant }) => {
  const t = metrics.fonts[target];
  const T = second.data['T' + i];
  const F = second.data[`F${i}${variant}`];
  const [a, d, g] = [t.raw[variant][0], Math.abs(t.raw[variant][1]), t.raw[variant][2]];
  const p = (n) => `${((n / t.upm / sa) * 100).toFixed(2)}%`;
  return {
    target, fallback, métrica: variant,
    'largura antes': diff(first.data[`F${i}${variant}`].lineW, first.data['T' + i].lineW),
    'largura depois': diff(F.lineW, T.lineW),
    'altura box': `${F.boxH.toFixed(0)} vs ${T.boxH.toFixed(0)}`,
    'size-adjust': `${(sa * 100).toFixed(2)}%`, 'ascent-override': p(a), 'descent-override': p(d), 'line-gap-override': p(g),
  };
});
fs.writeFileSync(path.join(outDir, 'compare.json'), JSON.stringify(rows, null, 2));
console.table(rows);
