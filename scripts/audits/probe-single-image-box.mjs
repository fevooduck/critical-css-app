// Mede a caixa de um .single-image (container útil, picture, img) numa URL/viewport.
// Uso: node scripts/audits/probe-single-image-box.mjs <url> [largura] [indice]
import { chromium } from 'playwright';
const [url, w = '1440', idx = '0'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: +w, height: 900 }, ignoreHTTPSErrors: true });
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForTimeout(1500);
const r = await page.evaluate(i => {
  const sec = document.querySelectorAll('.single-image')[i];
  const c = sec.querySelector('.container'); const cs = getComputedStyle(c);
  const box = e => e ? Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height) : null;
  const pic = sec.querySelector('picture'), img = sec.querySelector('img');
  return { secClass: sec.className, container: box(c), padding: cs.paddingLeft + ' ' + cs.paddingRight, maxW: cs.maxWidth, contentW: c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), picture: box(pic), pictureStyle: pic && pic.getAttribute('style'), img: box(img), imgMaxW: getComputedStyle(img).maxWidth, natural: [img.naturalWidth, img.naturalHeight], bodyOverflow: getComputedStyle(document.body).overflow, docW: document.documentElement.clientWidth };
}, +idx);
console.log(JSON.stringify(r, null, 1));
await browser.close();
