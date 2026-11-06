// Simula histórico de busca e tira screenshot do carrossel "Receitas baseadas em".
// Uso: node shot-history-recipes.mjs <url> <termo> <saida-dir>
import { chromium } from 'playwright';
const [url, term, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
await page.evaluate((t) => localStorage.setItem('searchHistory', JSON.stringify([t])), term);
await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
const accept = page.locator('#onetrust-accept-btn-handler');
if (await accept.count()) await accept.click().catch(() => {});
const section = page.locator('.recipeListHistory');
await page.waitForSelector('.recipeListHistory .card-recipe, .recipeListHistory .recipes__card', { timeout: 30000 }).catch(() => {});
console.log('sections', await section.count(), 'cards', await page.locator('.recipeListHistory .card-recipe').count(), 'legacy', await page.locator('.recipeListHistory .recipes__card').count());
if (await section.count()) {
  await section.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await section.first().screenshot({ path: `${out}/history-desktop.png` });
}
await browser.close();
