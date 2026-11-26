// A/B do 1º card eager/high × lazy (reescreve o HTML no Playwright). Mobile, CPU 4x, rede lenta.
// Mede o LCP da imagem do card e o tempo até ela terminar de baixar.
// Uso: node scripts/perf/ab-card-priority.mjs <url> [rodadas]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const [url, runs = '2'] = process.argv.slice(2);
const browser = await chromium.launch();
async function run(lazy) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 823 }, isMobile: true, deviceScaleFactor: 1.75, ignoreHTTPSErrors: true });
  await ctx.route((u) => u.href === url, async (r) => {
    // curl: os headers de debug do Drupal (cache tags) estouram o parser do Node.
    let body = execFileSync('curl', ['-sk', url], { maxBuffer: 1 << 26 }).toString();
    if (lazy) body = body.replace('loading="eager" fetchpriority="high">', 'loading="lazy" decoding="async">');
    await r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 94000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => { window.__l = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__l.push({ t: Math.round(e.startTime), img: !!e.url }); }).observe({ type: 'largest-contentful-paint', buffered: true }); });
  await page.goto(url, { waitUntil: 'load', timeout: 240000 }); await page.waitForTimeout(3000);
  const r = await page.evaluate(() => { const img = document.querySelector('.card-recipe__image'); const e = performance.getEntriesByType('resource').find((x) => img && x.name === img.currentSrc); return { lcp: window.__l.at(-1), imgStart: e && Math.round(e.startTime), imgEnd: e && Math.round(e.responseEnd) }; });
  await ctx.close(); return r;
}
for (let i = 0; i < +runs; i++) for (const lazy of [false, true]) console.log(lazy ? 'lazy ' : 'eager', JSON.stringify(await run(lazy)));
await browser.close();
