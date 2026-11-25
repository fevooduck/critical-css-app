// Testa um bloco crítico novo numa URL publicada antes de colar no Drupal: troca os
// <style media="(max-width: 991.98px)"> / "(min-width: 992px)" do HTML pelos do arquivo,
// atrasa o CSS do site (CSS_DELAY, padrão 2000ms) e mede o CLS (mobile e desktop).
// Uso: node probe-block-swap.mjs <url> <bloco.html>   (SWAP=0 mede sem trocar, para comparar)
import fs from 'node:fs';
import { chromium } from 'playwright';

const [url, blockFile] = process.argv.slice(2);
const delay = +(process.env.CSS_DELAY ?? 2000);
const swap = process.env.SWAP !== '0';
const block = fs.readFileSync(blockFile, 'utf8');
const pick = (media) => (block.match(new RegExp(`<style media="\\(${media}\\)">[\\s\\S]*?</style>`)) || [''])[0];
const newMobile = pick('max-width: 991.98px');
const newDesktop = pick('min-width: 992px');

const browser = await chromium.launch();
for (const [label, opts] of [
  ['mobile', { viewport: { width: 412, height: 823 }, isMobile: true, deviceScaleFactor: 2 }],
  ['desktop', { viewport: { width: 1350, height: 940 } }],
]) {
  const ctx = await browser.newContext({ ...opts, ignoreHTTPSErrors: true });
  if (delay) await ctx.route(/\/(sites|themes|modules|core)\/.*\.css(\?|$)/, async (r) => { await new Promise((ok) => setTimeout(ok, delay)); r.continue(); });
  let swapped = 0;
  await ctx.route((u) => u.href === url, async (r) => {
    const res = await r.fetch();
    let html = await res.text();
    if (swap) {
      html = html.replace(/<style media="\(max-width: 991\.98px\)">[\s\S]*?<\/style>/, () => { swapped++; return newMobile; });
      html = html.replace(/<style media="\(min-width: 992px\)">[\s\S]*?<\/style>/, () => { swapped++; return newDesktop; });
    }
    r.fulfill({ response: res, body: html });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__s = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__s.push({ t: Math.round(e.startTime), v: +e.value.toFixed(3), src: e.sources.map((s) => { const n = s.node; if (!n || !n.tagName) return '#text'; return n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ` y${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)} h${Math.round(s.previousRect.height)}→${Math.round(s.currentRect.height)}`; }) }); }).observe({ type: 'layout-shift', buffered: true }); });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(5000);
  const s = await page.evaluate(() => window.__s);
  console.log(`${label.padEnd(8)} ${swap ? `bloco novo (${swapped} style trocados)` : 'bloco atual'}  CLS=${s.reduce((a, x) => a + x.v, 0).toFixed(3)}`);
  for (const x of s.filter((x) => x.v >= 0.005)) console.log(`   t=${x.t} v=${x.v} ${x.src.slice(0, 3).join(' | ')}`);
  await ctx.close();
}
await browser.close();
