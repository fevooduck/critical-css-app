// LCP (elemento + tempo), FCP, recursos bloqueantes e long tasks. Mobile, CPU 4x, rede lenta.
// Uso: node scripts/perf/probe-lcp-blocking.mjs <url...>
import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const url of process.argv.slice(2)) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 94000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    window.__p = { lcp: [], lt: [] };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { const n = e.element; window.__p.lcp.push({ t: Math.round(e.startTime), size: e.size, url: (e.url || '').slice(0, 120), el: n ? n.tagName.toLowerCase() + '.' + String(n.className).slice(0, 60) : null }); } }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__p.lt.push({ t: Math.round(e.startTime), d: Math.round(e.duration), src: (e.scripts || []).map((s) => (s.sourceURL || '').split('?')[0].slice(-70) + ' ' + Math.round(s.duration)).slice(0, 3) }); }).observe({ type: 'long-animation-frame', buffered: true });
  });
  await page.goto(url, { waitUntil: 'load', timeout: 180000 }); await page.waitForTimeout(5000);
  const r = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const res = performance.getEntriesByType('resource').filter((e) => e.renderBlockingStatus === 'blocking').map((e) => ({ u: e.name.slice(0, 110), end: Math.round(e.responseEnd), kb: Math.round(e.transferSize / 1024) }));
    const nav = performance.getEntriesByType('navigation')[0];
    return { fcp: fcp && Math.round(fcp.startTime), ttfb: Math.round(nav.responseStart), html: Math.round(nav.responseEnd), htmlKb: Math.round(nav.transferSize / 1024), blocking: res, ...window.__p };
  });
  console.log(`\n${url}\nTTFB=${r.ttfb} htmlEnd=${r.html} (${r.htmlKb}KB) FCP=${r.fcp}`);
  console.log('blocking:', r.blocking);
  console.log('lcp:', r.lcp);
  const tot = r.lt.filter((x) => x.d > 50).reduce((a, x) => a + x.d - 50, 0);
  console.log('LoAF >50ms (soma excedente)', tot);
  for (const x of r.lt.filter((x) => x.d > 150).sort((a, b) => b.d - a.d).slice(0, 12)) console.log('  ', x.t, x.d, x.src.join(' | '));
  await ctx.close();
}
await browser.close();
