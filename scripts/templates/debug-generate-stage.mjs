// Roda o pipeline do gerador por etapas para um viewport e conta seletores em cada uma:
// 1) snapshot limpo, 2) saída do `critical`, 3) depois do optimizeCriticalCSS.
// Serve para achar em que etapa uma regra some do crítico.
// REAL_UA=1 usa o user agent do navegador real, como o server.js.
// Uso: node scripts/templates/debug-generate-stage.mjs <url> <largura> <altura> --check=.a,.b
import { resolvePage } from '../../lib/page-resolver.js';
import { generateCriticalCss } from '../../lib/critical-generator.js';
import { resetCarouselState, removeExcludedElements, buildCssIgnoreRules } from '../../lib/html-cleaner.js';
import { optimizeCriticalCSS } from '../../lib/css-optimizer.js';
import { getRealUserAgent } from '../../lib/browser-manager.js';

const args = process.argv.slice(2);
const [url, w, h] = args.filter((a) => !a.startsWith('--'));
const check = (args.find((a) => a.startsWith('--check=')) || '--check=').slice(8).split(',').filter(Boolean);
const count = (css) => check.map((s) => `${s}=${css.split(s).length - 1}`).join(' ');

const excluded = ['.modal', '#onetrust-banner-sdk', '.dropdown-content'];
const page = await resolvePage(url, { isolateFirstFold: true, ignoreHeadInlineStyles: false });
const html = removeExcludedElements(resetCarouselState(page.html).html, excluded).html;
console.log('snapshot css  ', count(page.css || ''));
const ua = process.env.REAL_UA ? await getRealUserAgent() : undefined;
// BEFORE=1920x1080 gera outro viewport antes, no mesmo processo (ordem do server.js).
if (process.env.BEFORE) {
  const [bw, bh] = process.env.BEFORE.split('x').map(Number);
  const before = await generateCriticalCss({ html, pageUrl: url, dimensions: [{ width: bw, height: bh }], userAgent: ua, ignoreRules: buildCssIgnoreRules(excluded) });
  console.log(`antes ${process.env.BEFORE}`, count(before));
}
const raw = await generateCriticalCss({ html, pageUrl: url, dimensions: [{ width: +w, height: +h }], userAgent: ua, ignoreRules: buildCssIgnoreRules(excluded) });
console.log('critical      ', count(raw), `(${raw.length} chars)`);
const { css, audit } = await optimizeCriticalCSS(raw, { aggressivePruning: true, combineDuplicates: true });
if (process.env.OUT) (await import('node:fs')).writeFileSync(process.env.OUT, css);
console.log('otimizado     ', count(css), `(${css.length} chars, ${audit.gzipFormatted})`);
