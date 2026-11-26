// Fontes de layout-shift no desktop (viewport do PSI 1350x940).
// CSS_DELAY=ms segura as folhas do site (não Typekit) para simular rede lenta.
// Uso: CSS_DELAY=1500 node scripts/perf/probe-shift-desktop.mjs <url...>
// BLOCKING=1 reescreve o HTML: CSS adiado (preload/print+onload) vira bloqueante = crítico desligado.
import { chromium } from 'playwright';
const delay = +(process.env.CSS_DELAY || 0);
const mobile = process.env.MOBILE === '1';
const browser = await chromium.launch();
for (const url of process.argv.slice(2)) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 412, height: 823 }, isMobile: true, deviceScaleFactor: 2, ignoreHTTPSErrors: true } : { viewport: { width: 1350, height: 940 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  if (delay) await ctx.route(/\/(sites|themes|modules|core)\/.*\.css(\?|$)/, async (r) => { await new Promise((ok) => setTimeout(ok, delay)); r.continue(); });
  if (process.env.BLOCKING === '1') await ctx.route((u) => u.href === url, async (r) => { const res = await r.fetch(); let h = await res.text(); h = h.replace(/<link([^>]*?)rel="preload"([^>]*?)as="style"([^>]*?)>/g, (m, a, b, c) => /typekit/.test(m) ? m : `<link${a}rel="stylesheet"${b}${c.replace(/onload="[^"]*"/, '')}>`).replace(/<link([^>]*?)media="print"([^>]*?)onload="this.media=(?:'|&#039;)all(?:'|&#039;)"([^>]*)>/g, '<link$1media="all"$2$3>'); r.fulfill({ response: res, body: h }); });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__s = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__s.push({ t: Math.round(e.startTime), v: +e.value.toFixed(3), src: e.sources.map((s) => { const n = s.node; if (!n || !n.tagName) return '#text'; return n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ` y${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)} h${Math.round(s.previousRect.height)}→${Math.round(s.currentRect.height)}`; }) }); }).observe({ type: 'layout-shift', buffered: true }); });
  await page.goto(url, { waitUntil: process.env.WAIT || 'load', timeout: 120000 }); await page.waitForTimeout(5000);
  const s = await page.evaluate(() => window.__s);
  console.log(`\n${url}  total=${s.reduce((a, x) => a + x.v, 0).toFixed(3)}`);
  for (const x of s.filter((x) => x.v >= 0.005)) console.log(`  t=${x.t} v=${x.v} ${x.src.slice(0, 4).join(' | ')}`);
  await ctx.close();
}
await browser.close();
