// Lista erros JS (com stack) de uma página. Uso: node probe-page-errors.mjs <url>
import { chromium } from 'playwright';
const [url] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ ignoreHTTPSErrors: true });
page.on('pageerror', (e) => console.log(e.stack));
await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
await browser.close();
