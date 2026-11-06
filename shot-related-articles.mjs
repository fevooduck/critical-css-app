// Screenshot dos artigos relacionados na sidebar da receita (desktop e mobile).
// Uso: node shot-related-articles.mjs <url> <saida-dir> <prefixo>
import { chromium } from 'playwright';
const [url, out, prefix] = process.argv.slice(2);
const browser = await chromium.launch();
for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 393, height: 852 }]]) {
  const page = await browser.newPage({ viewport: vp, ignoreHTTPSErrors: true });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.addStyleTag({ content: '#onetrust-consent-sdk{display:none!important}' });
  const s = page.locator('section.article__all--aside').first();
  console.log(name, 'cardArticle', await page.locator('.article__all--aside .cardArticle').count(), 'card-article', await page.locator('.article__all--aside .card-article').count());
  if (await s.count()) {
    await s.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await s.screenshot({ path: `${out}/${prefix}-${name}.png` });
  }
  await page.close();
}
await browser.close();
