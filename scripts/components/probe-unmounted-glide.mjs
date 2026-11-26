// Lista os .glide com slides que não montaram (sem glide--slider/--carousel). Uso: node scripts/components/probe-unmounted-glide.mjs <base> <path...>
import { chromium } from 'playwright';
const [base, ...paths] = process.argv.slice(2);
const browser = await chromium.launch();
for (const p of paths) {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  await page.goto(base + p, { waitUntil: 'load', timeout: 120000 }); await page.waitForTimeout(2500);
  const r = await page.evaluate(() => [...document.querySelectorAll('.glide')].filter((g) => !/glide--(slider|carousel)/.test(g.className) && g.querySelector('.glide__slides')).map((g) => {
    const chain = []; let e = g; for (let i = 0; i < 4 && e; i++, e = e.parentElement) chain.push(e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).trim().split(/\s+/).slice(0, 3).join('.') : ''));
    return chain.reverse().join(' > ') + ` [slides=${g.querySelectorAll('.glide__slide').length}, data-glide-set=${g.dataset.glideSet ?? '-'}, in-paragraph=${g.closest('[class*=paragraph--type]')?.className.match(/paragraph--type--[\w-]+/)?.[0] ?? '-'}]`;
  }));
  const libs = await page.evaluate(() => [...document.querySelectorAll('link[href*="glide"],script[src*="glide"],script[src*="sliders"]')].map((x) => (x.href || x.src).replace(location.origin, '').split('?')[0]));
  console.log(`\n${p}  height=${await page.evaluate(() => document.body.scrollHeight)}\n  libs: ${libs.join(', ')}\n  ` + (r.join('\n  ') || '(todos montados)'));
  await page.close();
}
await browser.close();
