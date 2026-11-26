// Mede o padding-top do body com a toolbar do Drupal e os elementos que o displace usa.
// Uso: node scripts/components/probe-toolbar-offset.mjs <uli-url> <path> [largura]
import { chromium } from 'playwright';
const [uli, path, width = '1440'] = process.argv.slice(2);
const base = new URL(uli).origin;
const browser = await chromium.launch();
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: +width, height: 900 } });
await page.goto(uli, { waitUntil: 'load', timeout: 120000 });
await page.goto(base + path, { waitUntil: 'load', timeout: 120000 }); await page.waitForTimeout(2500);
const r = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-offset-top]')].map((e) => {
    const b = e.getBoundingClientRect();
    return { el: e.tagName.toLowerCase() + '#' + e.id + '.' + String(e.className).split(' ').slice(0, 4).join('.'), top: Math.round(b.top), height: Math.round(b.height), display: getComputedStyle(e).display, position: getComputedStyle(e).position };
  });
  const tray = document.querySelector('.toolbar-tray-horizontal.is-active, .toolbar-tray.is-active');
  const tall = tray ? [...tray.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().height > 500).slice(0, 6).map((x) => {
    const cs = getComputedStyle(x); return `${x.tagName.toLowerCase()}.${String(x.className).split(' ').slice(0, 3).join('.')} h=${Math.round(x.getBoundingClientRect().height)} display=${cs.display} flex-dir=${cs.flexDirection} width=${Math.round(x.getBoundingClientRect().width)}`;
  }) : [];
  return { bodyPadding: document.body.style.paddingTop, offsets: els, tall, displace: window.Drupal?.displace?.offsets };
});
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: '/tmp/claude-1000/-home-codeduck-projects-nestle-cult/699cfd18-558f-4a1f-ab45-44b086b717da/scratchpad/toolbar.png' });
await browser.close();
