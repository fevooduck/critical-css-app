// Conta cards visíveis nos carrosséis com card-recipe e tira screenshot.
// Uso: node shot-recipe-sliders.mjs <url> <saida-dir>
import { chromium } from 'playwright';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
await page.addStyleTag({ content: '#onetrust-consent-sdk{display:none!important}' });
const sliders = page.locator('.sliders:has(.card-recipe)');
const n = await sliders.count();
for (let i = 0; i < n; i++) {
  const s = sliders.nth(i);
  await s.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const info = await s.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const vis = [...el.querySelectorAll('.card-recipe')].filter((c) => { const b = c.getBoundingClientRect(); return b.width && b.left >= r.left - 2 && b.right <= r.right + 2; });
    return { set: el.dataset.glideSet, visible: vis.length, cardW: Math.round(vis[0]?.getBoundingClientRect().width || 0), sliderW: Math.round(r.width) };
  });
  console.log(i, JSON.stringify(info));
  if (i === 0) await s.screenshot({ path: `${out}/slider-desktop.png` });
}
await browser.close();
