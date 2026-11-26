// Lista as fontes de layout-shift (mobile, CPU 4x, rede lenta). Uso: node scripts/perf/probe-shift-sources.mjs <url...>
import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const url of process.argv.slice(2)) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 94000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => { window.__s = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__s.push({ t: Math.round(e.startTime), v: +e.value.toFixed(3), src: e.sources.map((s) => { const n = s.node; if (!n || !n.tagName) return '#text'; return n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ` ${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)}`; }) }); }).observe({ type: 'layout-shift', buffered: true }); });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 }); await page.waitForTimeout(4000);
  const s = await page.evaluate(() => window.__s);
  console.log(`\n${url}  total=${s.reduce((a, x) => a + x.v, 0).toFixed(3)}`);
  for (const x of s.filter((x) => x.v >= 0.01)) console.log(`  t=${x.t} v=${x.v} ${x.src.join(' | ')}`);
  await ctx.close();
}
await browser.close();
