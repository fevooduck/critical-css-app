// Diagnóstico do topo numa URL publicada: filmstrip, fontes de layout-shift e como o CSS carrega.
// Uso: node scripts/perf/probe-remote-header.mjs <url> <outdir> [largura=1440]
import fs from 'node:fs';
import { chromium } from 'playwright';
const [url, out, width = '1440'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +width, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 1.2e6, uploadThroughput: 300000 });
await page.addInitScript(() => {
  window.__s = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__s.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), src: e.sources.map((s) => { const n = s.node; const d = n && n.tagName ? n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.') : '') : '#text'; return `${d} y${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)} h${Math.round(s.previousRect.height)}→${Math.round(s.currentRect.height)} w${Math.round(s.previousRect.width)}→${Math.round(s.currentRect.width)}`; }) }); }).observe({ type: 'layout-shift', buffered: true });
});
const shots = [];
const nav = page.goto(url, { waitUntil: 'load', timeout: 120000 });
const t0 = Date.now();
for (let i = 0; i < 14; i++) { await page.waitForTimeout(i < 8 ? 250 : 700); try { await page.screenshot({ path: `${out}/f${String(i).padStart(2, '0')}.jpg`, quality: 50, clip: { x: 0, y: 0, width: +width, height: 260 } }); shots.push(Date.now() - t0); } catch {} }
await nav; await page.waitForTimeout(3000);
const info = await page.evaluate(() => ({
  shifts: window.__s,
  cls: window.__s.reduce((a, x) => a + x.v, 0),
  inlineStyles: [...document.head.querySelectorAll('style')].map((s) => ({ attrs: [...s.attributes].map((a) => a.name + '=' + a.value).join(' ').slice(0, 60), kb: +(s.textContent.length / 1024).toFixed(1), btnCta: /\.btn\s*,\s*\.cta\s*\{/.test(s.textContent), header: /\.header-core|\.header-menu|#header\b/.test(s.textContent) })).filter((s) => s.kb > 0.5),
  links: [...document.head.querySelectorAll('link[rel=stylesheet],link[rel=preload][as=style]')].map((l) => `${l.rel}${l.media && l.media !== 'all' ? ' media=' + l.media : ''}${l.getAttribute('onload') ? ' onload' : ''} ${l.href.replace(location.origin, '').split('?')[0].slice(0, 80)}`),
}));
console.log('frames(ms):', shots.join(','));
fs.writeFileSync(out + '/info.json', JSON.stringify(info, null, 1));
console.log('CLS', info.cls.toFixed(3));
for (const s of info.shifts.filter((x) => x.v >= 0.01)) console.log('  v', s.v, 't', s.t, s.src.slice(0, 3).join(' | '));
await browser.close();
