// Screenshot dos cards de receita (SDC card-recipe) numa página do cookit-2.
// Uso: node shot-card-recipe.js <url> <saida-dir>
import { chromium } from 'playwright';
(async () => {
  const [url, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 393, height: 852 }]]) {
    const page = await browser.newPage({ viewport: vp, ignoreHTTPSErrors: true });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.addStyleTag({ content: '#onetrust-consent-sdk{display:none!important}' });
    const cards = page.locator('.card-recipe');
    const n = await cards.count();
    console.log(name, 'cards:', n);
    if (!n) { await page.close(); continue; }
    const card = cards.first();
    await card.scrollIntoViewIfNeeded();
    await card.locator('img').evaluate((img) => img.complete || new Promise((r) => { img.onload = r; img.onerror = r; }));
    await card.screenshot({ path: `${out}/card-${name}.png` });
    if (name === 'desktop') {
      await card.hover();
      await page.waitForTimeout(400);
      await card.screenshot({ path: `${out}/card-${name}-hover.png` });
      const box = await card.boundingBox();
      console.log('size', Math.round(box.width), 'x', Math.round(box.height));
    }
    await page.close();
  }
  await browser.close();
})();
