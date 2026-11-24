// Estilos computados de cards (imagem, conteúdo, título, descrição) numa página.
// Uso: node probe-card-styles.mjs <url> <seletor-do-card> [largura]
import { chromium } from 'playwright';

const [url, sel, width = '1440'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +width, height: 900 }, ignoreHTTPSErrors: true });
await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
await page.waitForTimeout(1500);

const out = await page.evaluate((sel) => {
  const props = ['display', 'width', 'height', 'background-color', 'color', 'border-radius', 'padding', 'margin', 'gap', 'row-gap',
    'font-family', 'font-size', 'font-weight', 'line-height', 'text-align', 'aspect-ratio', 'object-fit', 'overflow', 'box-shadow',
    'position', 'top', 'left', '-webkit-line-clamp', 'justify-content', 'max-width'];
  const card = document.querySelector(sel);
  if (!card) return { error: 'not found' };
  const pick = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const o = { tag: el.tagName, cls: el.className };
    for (const p of props) o[p] = cs.getPropertyValue(p);
    return o;
  };
  const kids = [card, ...card.querySelectorAll('*')].filter((el) => !['SOURCE', 'PICTURE'].includes(el.tagName));
  return kids.slice(0, 12).map(pick);
}, sel);
console.log(JSON.stringify(out, null, 1));
await browser.close();
