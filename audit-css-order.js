// Detecta declarações que dependem da ordem dos stylesheets (e que o CSS crítico pode quebrar):
// snapshot A (ordem real da página) x snapshot B (stylesheets que casam com --move movidos para o início do <head>).
//
// Uso:
//   node audit-css-order.js /marcas/carnation /marcas/maggi
//   node audit-css-order.js --base=https://cookit-3.lndo.site --move=brand-corner /marcas/carnation
//
// Relatório completo em data/css-order-audit/report.json
import puppeteer from 'puppeteer';
import fs from 'fs';

const args = process.argv.slice(2);
const opt = (name, def) => (args.find((a) => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=') || def;
const BASE = opt('base', 'https://cookit-3.lndo.site');
const MOVE = opt('move', 'brand-corner');
const PATHS = args.filter((a) => !a.startsWith('--'));
const OUT_DIR = new URL('./data/css-order-audit/', import.meta.url);

if (!PATHS.length) {
  console.error('Informe ao menos um caminho. Ex.: node audit-css-order.js /marcas/carnation');
  process.exit(1);
}

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 800 },
  { name: 'desktop', width: 1366, height: 900 },
];
const PROPS = [
  'background-color', 'background-image', 'color', 'filter', 'display', 'visibility',
  'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'font-size', 'font-weight', 'font-family', 'line-height', 'text-align', 'text-decoration-line',
  'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color',
  'border-top-width', 'border-bottom-width', 'border-radius',
  'width', 'max-width', 'height', 'min-height',
  'flex-direction', 'justify-content', 'align-items', 'gap', 'position', 'top', 'z-index',
  'fill', 'stroke', 'box-shadow', 'object-fit',
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function snapshot(page) {
  return page.evaluate((props) => {
    const out = [];
    document.querySelectorAll('body *').forEach((el, i) => {
      if (el.closest('#onetrust-consent-sdk, script, style, noscript, iframe, [data-aos]')) return;
      const cs = getComputedStyle(el);
      const r = {};
      for (const p of props) r[p] = cs.getPropertyValue(p);
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content && ps.content !== 'none') {
          for (const p of ['background-color', 'background-image', 'color', 'filter', 'display', 'width', 'height']) {
            r[pseudo + p] = ps.getPropertyValue(p);
          }
        }
      }
      const path = [];
      let n = el;
      while (n && n !== document.body && path.length < 4) {
        path.unshift(n.tagName.toLowerCase() + (n.classList.length ? '.' + [...n.classList].slice(0, 6).join('.') : ''));
        n = n.parentElement;
      }
      out.push({ i, path: path.join(' > '), r });
    });
    return out;
  }, PROPS);
}

async function moveSheetsFirst(page, match) {
  await page.evaluate(async (match) => {
    const links = [...document.querySelectorAll(`link[href*="${match}"]`)];
    const first = document.head.querySelector('link[rel="stylesheet"], style');
    await Promise.all(links.map((l) => {
      const clone = l.cloneNode();
      clone.rel = 'stylesheet';
      clone.removeAttribute('onload');
      const loaded = new Promise((res) => { clone.onload = res; clone.onerror = res; });
      document.head.insertBefore(clone, first);
      l.remove();
      return loaded;
    }));
  }, match);
  await wait(1500);
}

function diff(a, b) {
  const byI = new Map(b.map((x) => [x.i, x]));
  const res = [];
  for (const x of a) {
    const y = byI.get(x.i);
    if (!y || y.path !== x.path) continue;
    for (const k of Object.keys(x.r)) {
      if (x.r[k] !== y.r[k]) res.push({ path: x.path, prop: k, before: x.r[k], after: y.r[k] });
    }
  }
  return res;
}

function summarize(diffs) {
  const groups = new Map();
  for (const d of diffs) {
    const leaf = d.path.split(' > ').pop();
    const key = `${leaf} | ${d.prop} | ${d.before} -> ${d.after}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  return [...groups.entries()].sort((a, b) => b[1] - a[1]);
}

const browser = await puppeteer.launch({
  headless: true,
  acceptInsecureCerts: true,
  args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
const report = {};

for (const path of PATHS) {
  for (const vp of VIEWPORTS) {
    const label = `${path} [${vp.name}]`;
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height });
    try {
      await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 90000 });
    } catch (e) {
      console.warn(`⚠️  ${label}: ${e.message}`);
    }
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
    await wait(2000);

    if (!(await page.$(`link[href*="${MOVE}"]`))) {
      console.log(`⏭️  ${label}: nenhum stylesheet com "${MOVE}"`);
      await page.close();
      continue;
    }

    // Dois snapshots sem mexer em nada: o que mudar entre eles é ruído (carrossel, JS) e é descartado.
    const a1 = await snapshot(page);
    await wait(1500);
    const a2 = await snapshot(page);
    const noise = new Set(diff(a1, a2).map((d) => `${d.path}|${d.prop}`));

    await moveSheetsFirst(page, MOVE);
    const b = await snapshot(page);
    const diffs = diff(a2, b).filter((d) => !noise.has(`${d.path}|${d.prop}`));
    report[label] = diffs;

    console.log(`${diffs.length ? '❌' : '✅'} ${label}: ${diffs.length} diferenças (ruído descartado: ${noise.size})`);
    for (const [key, n] of summarize(diffs).slice(0, 10)) console.log(`     ${n}x ${key.slice(0, 200)}`);
    await page.close();
  }
}

await browser.close();
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(new URL('report.json', OUT_DIR), JSON.stringify(report, null, 2));
console.log(`\nRelatório: ${new URL('report.json', OUT_DIR).pathname}`);
