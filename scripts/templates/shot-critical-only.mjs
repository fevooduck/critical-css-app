// Renderiza a página só com o CSS inline (crítico): bloqueia os .css do tema e o agregado.
// Uso: node scripts/templates/shot-critical-only.mjs <url> <out.png> [largura]
import { chromium } from 'playwright';
const [url, out, width = '1440'] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +width, height: 900 }, ignoreHTTPSErrors: true });
await ctx.route(/\.css(\?|$)/, (r) => (/typekit|print\.css/.test(r.request().url()) ? r.continue() : r.abort()));
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'load', timeout: 120000 }); await page.waitForTimeout(1500);
const r = await page.evaluate(() => [...document.querySelectorAll('body > *, .dialog-off-canvas-main-canvas > *, .mainWrapper > *, main > *')].slice(0, 25).map((e) => { const b = e.getBoundingClientRect(); return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).split(' ').slice(0, 3).join('.')} y=${Math.round(b.top)} h=${Math.round(b.height)} display=${getComputedStyle(e).display}`; }));
console.log(r.join('\n'));
await page.screenshot({ path: out });
await browser.close();
