// Linha do tempo do LCP por imagem: quando cada imagem começou/terminou de baixar,
// prioridade e se veio do preload scanner. Mobile 390px, DPR 2, rede lenta (igual ao probe-lcp-blocking).
// DESKTOP=1 usa 1350x940 sem throttling de rede. MATCH=regex filtra as URLs listadas (padrão: imagens).
// Uso: node scripts/perf/probe-lcp-image.mjs <url>
import { chromium } from 'playwright';

const url = process.argv[2];
const desktop = process.env.DESKTOP === '1';
const match = new RegExp(process.env.MATCH || '\\.(webp|jpe?g|png|avif|gif)(\\?|$)', 'i');

const browser = await chromium.launch();
const ctx = await browser.newContext(desktop
  ? { viewport: { width: 1350, height: 940 }, ignoreHTTPSErrors: true }
  : { viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
if (!desktop) {
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 94000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

const reqs = new Map();
let t0 = null;
cdp.on('Network.requestWillBeSent', (e) => {
  if (t0 === null) t0 = e.timestamp;
  reqs.set(e.requestId, { url: e.request.url, prio: e.request.initialPriority, start: e.timestamp, type: e.type, initiator: e.initiator?.type });
});
cdp.on('Network.resourceChangedPriority', (e) => { const r = reqs.get(e.requestId); if (r) r.newPrio = e.newPriority; });
cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.end = e.timestamp; r.kb = Math.round(e.encodedDataLength / 1024); } });

await page.addInitScript(() => {
  window.__lcp = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__lcp.push({ t: Math.round(e.startTime), el: e.element ? e.element.tagName.toLowerCase() + '.' + [...e.element.classList].join('.') : '', url: (e.url || '').slice(-70) });
  }).observe({ type: 'largest-contentful-paint', buffered: true });
});

await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForTimeout(4000);
const lcp = await page.evaluate(() => window.__lcp);
await browser.close();

const ms = (t) => Math.round((t - t0) * 1000);
console.log(`\n${url} ${desktop ? 'desktop' : 'mobile'}`);
console.log('LCP:', lcp);
const rows = [...reqs.values()].sort((a, b) => a.start - b.start);
console.log('\nPrimeiros 25 requests (ordem de início):');
for (const r of rows.slice(0, 25)) console.log(`  ${String(ms(r.start)).padStart(6)}→${String(r.end ? ms(r.end) : '?').padStart(6)} ${(r.prio + (r.newPrio ? '→' + r.newPrio : '')).padEnd(16)} ${String(r.kb ?? '?').padStart(4)}KB ${r.type.padEnd(10)} ${r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 90)}`);
console.log('\nImagens:');
for (const r of rows.filter((r) => match.test(r.url)).slice(0, 15)) console.log(`  ${String(ms(r.start)).padStart(6)}→${String(r.end ? ms(r.end) : '?').padStart(6)} ${(r.prio + (r.newPrio ? '→' + r.newPrio : '')).padEnd(16)} ${String(r.kb ?? '?').padStart(4)}KB ${r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 100)}`);
console.log(`\nTotal requests: ${rows.length}; terminados antes da imagem LCP: ver acima.`);
