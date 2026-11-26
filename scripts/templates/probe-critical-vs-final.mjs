// Compara o estado "só crítico, sem JS" (1ª pintura) com o final, mobile 412px.
// Lista blocos do <main> cuja posição/altura muda e salva os dois screenshots.
// Uso: node scripts/templates/probe-critical-vs-final.mjs <url> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [url, out = 'data/critical-vs-final'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const snap = (page) => page.evaluate(() => {
  const els = [...document.querySelectorAll('main *, .mainWrapper > *, header, #onetrust-banner-sdk')].filter((e) => { const b = e.getBoundingClientRect(); return b.top < 1600 && b.height > 30 && e.children.length; });
  const key = (e) => { const p = []; let n = e; while (n && n !== document.body) { p.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + ':' + [...n.parentNode.children].indexOf(n)); n = n.parentElement; } return p.join('>'); };
  return Object.fromEntries(els.map((e) => { const b = e.getBoundingClientRect(); return [key(e), { cls: (e.tagName.toLowerCase() + '.' + String(e.className).trim().split(/\s+/).slice(0, 2).join('.')), y: Math.round(b.top + scrollY), h: Math.round(b.height), w: Math.round(b.width) }]; }));
});
async function run(critOnly) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 823 }, isMobile: true, deviceScaleFactor: 1, ignoreHTTPSErrors: true, javaScriptEnabled: !critOnly });
  if (critOnly) await ctx.route(/\.css(\?|$)/, (r) => (/typekit/.test(r.request().url()) ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 180000 }); await page.waitForTimeout(critOnly ? 1000 : 6000);
  const s = await snap(page);
  await page.screenshot({ path: `${out}/${critOnly ? 'critical' : 'final'}.png` });
  await ctx.close(); return s;
}
const a = await run(true), b = await run(false);
const rows = Object.keys(a).filter((k) => b[k] && (Math.abs(a[k].y - b[k].y) > 8 || Math.abs(a[k].h - b[k].h) > 8)).map((k) => ({ el: a[k].cls, y: `${a[k].y}→${b[k].y}`, h: `${a[k].h}→${b[k].h}`, depth: k.split('>').length }));
rows.sort((x, y) => x.depth - y.depth);
for (const r of rows.slice(0, 40)) console.log(`${'  '.repeat(Math.max(0, r.depth - 3))}${r.el}  y ${r.y}  h ${r.h}`);
await browser.close();
