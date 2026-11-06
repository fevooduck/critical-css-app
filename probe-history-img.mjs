// Lista src/estado das imagens dos cards do histórico de receitas.
import { chromium } from 'playwright';
const [url, term] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate((t) => localStorage.setItem('searchHistory', JSON.stringify([t])), term);
await page.reload({ waitUntil: 'networkidle' });
await page.locator('#onetrust-accept-btn-handler').click().catch(() => {});
await page.waitForSelector('.recipeListHistory .card-recipe img', { timeout: 30000 });
await page.locator('.recipeListHistory').scrollIntoViewIfNeeded();
await page.waitForTimeout(1500);
console.log(JSON.stringify(await page.$$eval('.recipeListHistory .card-recipe img', (imgs) => imgs.slice(0, 4).map((i) => [i.getAttribute('src'), i.complete, i.naturalWidth]))));
console.log(JSON.stringify(await page.$$eval('.recipeListHistory .card-recipe', (c) => c.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().width)))));
await browser.close();
