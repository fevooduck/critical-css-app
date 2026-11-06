// Screenshot da seção de versões e dos relacionados da sidebar na receita.
// Uso: node shot-recipe-versions.mjs <url> <saida-dir>
import { chromium } from 'playwright';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch();
for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 393, height: 852 }]]) {
  const page = await browser.newPage({ viewport: vp, ignoreHTTPSErrors: true });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.addStyleTag({ content: '#onetrust-consent-sdk{display:none!important}' });
  const versions = page.locator('section.recipeSection:has(.list--recipeSidebar)');
  console.log(name, 'sections', await versions.count(), 'new cards in versions', await page.locator('.recipeSection .card-recipe').count());
  for (let i = 0; i < await versions.count(); i++) {
    const s = versions.nth(i);
    await s.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await s.screenshot({ path: `${out}/versions-${name}-${i}.png` });
  }
  await page.close();
}
await browser.close();
