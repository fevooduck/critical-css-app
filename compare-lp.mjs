// De/para visual de LPs com CSS próprio entre dois ambientes (ex.: cookit-2 tema novo x cookit-3 tema velho).
// Gera screenshot full-page do <main> e um JSON com estilos computados de cada elemento do <main>.
// Uso: node compare-lp.mjs <saida-dir> <path> [hostNovo] [hostVelho]
import { chromium } from 'playwright';
import fs from 'node:fs';

const [out, path, hostA = 'https://cookit-2.lndo.site', hostB = 'https://cookit-3.lndo.site'] = process.argv.slice(2);
const slug = path.replace(/^\/|\/$/g, '').replace(/\//g, '_');
fs.mkdirSync(out, { recursive: true });

const PROPS = ['display', 'position', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'text-transform', 'text-align', 'color', 'background-color', 'background-image', 'margin-top', 'margin-bottom',
  'margin-left', 'margin-right', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'border-radius',
  'border-top-width', 'max-width', 'width', 'height', 'gap', 'flex-direction', 'grid-template-columns', 'box-sizing', 'list-style-type'];

const browser = await chromium.launch();
for (const [env, host] of [['novo', hostA], ['velho', hostB]]) {
  for (const [vpName, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 393, height: 852 }]]) {
    const page = await browser.newPage({ viewport: vp, ignoreHTTPSErrors: true });
    await page.goto(host + path, { waitUntil: 'load', timeout: 300000 });
    await page.waitForTimeout(2500);
    await page.addStyleTag({ content: '#onetrust-consent-sdk{display:none!important}' });
    // força lazy-load
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1200);
    const data = await page.evaluate((PROPS) => {
      const main = document.querySelector('main');
      const seen = {};
      const res = [];
      const label = el => el.tagName.toLowerCase() + (el.classList.length ? '.' + [...el.classList].filter(c => !/^paragraph--\d+|^glide__slide--|^js-|is-/.test(c)).join('.') : '');
      for (const el of main.querySelectorAll('*')) {
        if (el.closest('svg,script,style,noscript,template')) continue;
        const chain = [];
        let p = el;
        while (p && p !== main && chain.length < 4) { chain.unshift(label(p)); p = p.parentElement; }
        const key = chain.join(' > ');
        seen[key] = (seen[key] || 0) + 1;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const st = {};
        for (const k of PROPS) st[k] = cs.getPropertyValue(k);
        res.push({ key: key + ' #' + seen[key], st, rect: [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)] });
      }
      return res;
    }, PROPS);
    fs.writeFileSync(`${out}/${slug}-${env}-${vpName}.json`, JSON.stringify(data));
    await page.locator('main').screenshot({ path: `${out}/${slug}-${env}-${vpName}.png` });
    console.log(env, vpName, data.length, 'elementos');
    await page.close();
  }
}
await browser.close();
