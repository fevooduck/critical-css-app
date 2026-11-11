// Calcula os overrides de métricas (size-adjust, ascent/descent/line-gap-override)
// para fontes de fallback locais (Arial/Liberation, Roboto) imitarem uma web font.
//
// Uso:
//   node font-fallback-metrics.mjs --config data/font-fallback/config.json
//
// config.json:
// {
//   "referer": "https://www.recetasnestle.com.do/",        // exigido pelo Typekit
//   "sampleUrl": "https://www.recetasnestle.com.do/marcas/carnation", // texto p/ largura média
//   "targets":   { "gibson-400": "https://use.typekit.net/af/.../l?...", ... },
//   "fallbacks": { "arial-400": "/mnt/c/Windows/Fonts/arial.ttf", "roboto-400": "https://...ttf", ... },
//   "pairs":     [ ["gibson-400", "arial-400"], ["gibson-400", "roboto-400"], ... ]
// }
//
// As fontes baixadas ficam em data/font-fallback/cache/ (gitignored) só para medição;
// fontes Adobe não podem ser hospedadas, nada daqui vai para o tema.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as fontkit from 'fontkit';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
const configPath = args.config || 'data/font-fallback/config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const outDir = path.dirname(configPath);
const cacheDir = path.join(outDir, 'cache');
fs.mkdirSync(cacheDir, { recursive: true });

async function load(src) {
  if (!/^https?:/.test(src)) return fs.readFileSync(src);
  const file = path.join(cacheDir, crypto.createHash('sha1').update(src).digest('hex').slice(0, 16));
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const res = await fetch(src, { headers: { Referer: config.referer || '', 'User-Agent': 'Mozilla/5.0 Chrome/130' } });
  if (!res.ok) throw new Error(`${res.status} ao baixar ${src}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf;
}

async function sampleText() {
  if (config.sampleFile && fs.existsSync(config.sampleFile)) return fs.readFileSync(config.sampleFile, 'utf8');
  const html = await (await fetch(config.sampleUrl, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/130' } })).text();
  const text = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  fs.writeFileSync(path.join(outDir, 'sample.txt'), text);
  return text;
}

function metrics(font, text) {
  const upm = font.unitsPerEm;
  // Largura média por caractere em em, só com glifos presentes na fonte.
  let width = 0;
  let count = 0;
  for (const ch of text) {
    const glyph = font.glyphForCodePoint(ch.codePointAt(0));
    if (!glyph || glyph.id === 0) continue;
    width += glyph.advanceWidth;
    count += 1;
  }
  const os2 = font['OS/2'] || {};
  const useTypo = Boolean(os2.fsSelection && os2.fsSelection.useTypoMetrics);
  return {
    name: font.fullName,
    upm,
    avgWidth: width / count / upm,
    // Chrome/Firefox usam hhea, exceto quando USE_TYPO_METRICS está ligado.
    ascent: (useTypo ? os2.typoAscender : font.hhea.ascent) / upm,
    descent: Math.abs(useTypo ? os2.typoDescender : font.hhea.descent) / upm,
    lineGap: (useTypo ? os2.typoLineGap : font.hhea.lineGap) / upm,
    useTypo,
    raw: {
      hhea: [font.hhea.ascent, font.hhea.descent, font.hhea.lineGap],
      typo: [os2.typoAscender, os2.typoDescender, os2.typoLineGap],
      win: [os2.winAscent, os2.winDescent],
    },
  };
}

const pct = (n) => `${(n * 100).toFixed(2).replace(/\.?0+$/, '')}%`;

const text = await sampleText();
const fonts = {};
for (const [key, src] of Object.entries({ ...config.targets, ...config.fallbacks })) {
  fonts[key] = metrics(fontkit.create(await load(src)), text);
}

const results = config.pairs.map(([target, fallback]) => {
  const t = fonts[target];
  const f = fonts[fallback];
  const sizeAdjust = t.avgWidth / f.avgWidth;
  return {
    target,
    fallback,
    'size-adjust': pct(sizeAdjust),
    'ascent-override': pct(t.ascent / sizeAdjust),
    'descent-override': pct(t.descent / sizeAdjust),
    'line-gap-override': pct(t.lineGap / sizeAdjust),
  };
});

const out = { generatedAt: new Date().toISOString(), sampleChars: [...text].length, fonts, results };
fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(out, null, 2));
console.table(results);
console.table(Object.fromEntries(Object.entries(fonts).map(([k, v]) => [k, {
  name: v.name, avgWidth: v.avgWidth.toFixed(4), ascent: v.ascent.toFixed(4), descent: v.descent.toFixed(4), lineGap: v.lineGap.toFixed(4), typo: v.useTypo,
}])));
