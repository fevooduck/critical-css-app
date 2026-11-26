// Print de um elemento numa página.
// Uso: node scripts/components/shot-section.mjs <url> <seletor> <saida.png> [largura]
import { chromium } from 'playwright';

const [url, sel, out, width = '1440'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +width, height: 900 }, ignoreHTTPSErrors: true });
await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
await page.addStyleTag({ content: '#onetrust-consent-sdk,.container-btn-chat-tag{display:none!important}' }).catch(() => {});
const el = page.locator(sel).first();
await el.scrollIntoViewIfNeeded();
await page.waitForTimeout(1500);
await el.screenshot({ path: out });
await browser.close();
