// A/B na página real: A = produção; B = HTML/CSS reescritos na interceptação
// simulando a branch perf/typekit-font-fallback (embed CSS do Typekit em vez do
// kit JS, preconnect com crossorigin e @font-face de fallback com métricas).
//
// Uso:
//   node ab-typekit-embed.mjs --url https://www.recetasnestle.com.do/marcas/carnation \
//     --fallback-css /caminho/cookit-main.css --runs 3
// --fallback-css: CSS compilado do tema; só os @font-face "* Fallback*" são usados.
// Saída: data/font-fallback/ab-<host>.json
import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { KnownDevices } from 'puppeteer';

const arg = (k, d) => (process.argv.includes(`--${k}`) ? process.argv[process.argv.indexOf(`--${k}`) + 1] : d);
const url = arg('url');
const runs = Number(arg('runs', 3));
const compiled = fs.readFileSync(arg('fallback-css'), 'utf8');
const fallbackFaces = (compiled.match(/@font-face\s*{[^}]*Fallback[^}]*}/g) || []).join('\n');
const GIBSON_OLD = /(["']?)canada-type-gibson\1\s*,\s*sans-serif/g;
const FLASH_OLD = /(["']?)ltc-flash\1\s*,\s*sans-serif/g;
const GIBSON_NEW = '"canada-type-gibson", "Gibson Fallback", "Gibson Fallback Android", sans-serif';
const FLASH_NEW = '"ltc-flash", "LTC Flash Fallback", "LTC Flash Fallback Android", sans-serif';

function rewriteHtml(html) {
  return html
    .replace(/<script>\s*\(function\(d\) {\s*var config = {\s*kitId: 'kzf4sci'[\s\S]*?<\/script>/,
      `<link rel="preload" href="https://use.typekit.net/kzf4sci.css" as="style" onload="this.onload=null;this.rel='stylesheet'"><style>${fallbackFaces}</style>`)
    .replace('<link rel="preconnect" href="https://use.typekit.net">', '<link rel="preconnect" href="https://use.typekit.net" crossorigin>')
    .replace('<link rel="preconnect" href="https://p.typekit.net">', '')
    .replace('<link rel="preconnect" href="https://fonts.googleapis.com">', '')
    .replace('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>', '')
    .replace(GIBSON_OLD, GIBSON_NEW)
    .replace(FLASH_OLD, FLASH_NEW);
}

async function measure(variant) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.emulate(KnownDevices['Moto G4']);
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const fonts = [];
  page.on('response', async (res) => {
    if (res.request().resourceType() === 'font') {
      const len = Number(res.headers()['content-length'] || 0);
      fonts.push({ url: res.url().replace(/\?.*fvd=([a-z]\d).*/, '?fvd=$1'), bytes: len });
    }
  });

  // O WAF do site responde 403 ao Chromium headless; nas duas variantes os
  // requests do próprio domínio passam pelo fetch do Node (A sem reescrita).
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    if (new URL(req.url()).host !== new URL(url).host) return req.continue();
    const isDoc = req.isNavigationRequest() && req.frame() === page.mainFrame();
    const isCss = req.resourceType() === 'stylesheet';
    try {
      const r = await fetch(req.url(), { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10) Chrome/130 Mobile', Accept: req.headers().accept || '*/*', 'Accept-Encoding': 'identity' } });
      const contentType = r.headers.get('content-type') || '';
      let body = Buffer.from(await r.arrayBuffer());
      if (variant === 'B' && (isDoc || isCss)) {
        const text = body.toString('utf8');
        body = isDoc ? rewriteHtml(text) : text.replace(GIBSON_OLD, GIBSON_NEW).replace(FLASH_OLD, FLASH_NEW);
      }
      req.respond({ status: r.status, contentType, body });
    } catch { req.continue(); }
  });

  await page.evaluateOnNewDocument(() => {
    window.__cls = 0; window.__lcp = 0; window.__lcpEl = '';
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__lcp = e.startTime; window.__lcpEl = e.element ? e.element.tagName + '.' + (e.element.className || '').toString().split(' ')[0] : ''; })).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 8000));
  const vitals = await page.evaluate(() => ({ title: document.title.slice(0, 40), htmlKiB: Math.round(document.documentElement.outerHTML.length / 1024), lcp: Math.round(window.__lcp), cls: Number(window.__cls.toFixed(4)), lcpEl: window.__lcpEl, fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0), usedFonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`) }));
  await browser.close();
  return { variant, ...vitals, fontRequests: fonts.length, fontKiB: Math.round(fonts.reduce((s, f) => s + f.bytes, 0) / 1024), fonts };
}

const results = [];
for (let i = 0; i < runs; i++) for (const v of ['A', 'B']) results.push(await measure(v));
const outFile = path.join('data/font-fallback', `ab-${new URL(url).host}.json`);
fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
console.table(results.map(({ fonts, usedFonts, ...r }) => r));
const med = (v, k) => { const a = results.filter((r) => r.variant === v).map((r) => r[k]).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
console.table(['fontRequests', 'fontKiB', 'fcp', 'lcp', 'cls'].map((k) => ({ métrica: k, A: med('A', k), B: med('B', k) })));
console.log('Fontes usadas em B:', results.find((r) => r.variant === 'B')?.usedFonts);
