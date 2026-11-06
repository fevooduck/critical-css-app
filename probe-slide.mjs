// Inspeciona estilos computados do slide/card de receita num carrossel.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
await page.goto(process.argv[2], { waitUntil: 'networkidle', timeout: 90000 });
console.log(await page.evaluate(() => {
  const c = document.querySelector('.sliders .card-recipe');
  const p = c.parentElement, cs = getComputedStyle(c), ps = getComputedStyle(p);
  const all=[...document.querySelectorAll('.sliders .card-recipe')].slice(0,4).map(e=>{const s=getComputedStyle(e);return [e.className.replace(/card-recipe--\w+/g,''), s.height, s.marginTop, s.marginBottom, s.alignSelf, s.boxSizing]}); return JSON.stringify({ all, parent: p.className, pDisplay: ps.display, pAlign: ps.alignItems, alignSelf: cs.alignSelf, height: cs.height, maxH: cs.maxHeight, cardHeights: [...document.querySelectorAll('.sliders .card-recipe')].slice(0,4).map(e=>e.offsetHeight) });
}));
await browser.close();
