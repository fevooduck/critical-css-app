// De/para em lote das component pages: tema novo (cookit-2, new_cookit) x tema velho (cookit-3, cookit).
// Para cada página e viewport: screenshot do <main>, estilos computados (mesmo formato do compare-lp.mjs),
// sinais de risco no HTML e % de pixels diferentes. Retomável: páginas já processadas na pasta são puladas.
//
// Uso:
//   node scripts/theme-compare/compare-lp-batch.mjs --label=antes [--pages=data/component-pages/pages.json] [--only=/molico,/nestle-aveia]
//     [--concurrency=3] [--novo=https://cookit-2.lndo.site] [--velho=https://cookit-3.lndo.site]
//     [--prod=https://www.receitasnestle.com.br] [--no-prod] [--force]
//
// Fallback: se o velho não responde 200 com <main>, usa o --prod (GET, uma página por vez, 3s de intervalo).
// Saída: data/component-pages/<label>/<slug>-{novo|velho}-{desktop|mobile}.{png,json} e results.json.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return def;
  return a.includes('=') ? a.split('=').slice(1).join('=') : true;
};
const LABEL = opt('label', 'antes');
const PAGES = opt('pages', 'data/component-pages/pages.json');
const ONLY = opt('only', '') ? String(opt('only')).split(',') : null;
const CONC = Number(opt('concurrency', 3));
const NOVO = opt('novo', 'https://cookit-2.lndo.site');
const VELHO = opt('velho', 'https://cookit-3.lndo.site');
const PROD = opt('no-prod', false) ? null : opt('prod', 'https://www.receitasnestle.com.br');
const FORCE = opt('force', false);
const OUT = path.join('data/component-pages', LABEL);
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 393, height: 852 } };
const PROPS = ['display', 'position', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'text-transform', 'text-align', 'color', 'background-color', 'background-image', 'margin-top', 'margin-bottom',
  'margin-left', 'margin-right', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'border-radius',
  'border-top-width', 'max-width', 'width', 'height', 'gap', 'flex-direction', 'grid-template-columns', 'box-sizing',
  'list-style-type', 'filter'];

const resultsFile = path.join(OUT, 'results.json');
const results = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile)) : {};
const save = () => fs.writeFileSync(resultsFile, JSON.stringify(results, null, 1));

let pages = JSON.parse(fs.readFileSync(PAGES));
if (ONLY) pages = ONLY.map((p) => pages.find((x) => x.path === p) || { nid: null, path: p, title: p });
const slugOf = (p) => p.replace(/^\/|\/$/g, '').replace(/\//g, '_') || 'home';

// Fila serial para produção.
let prodChain = Promise.resolve();
const prodSerial = (fn) => {
  const run = prodChain.then(fn, fn);
  prodChain = run.then(() => new Promise((r) => setTimeout(r, 3000)), () => new Promise((r) => setTimeout(r, 3000)));
  return run;
};

async function capture(browser, host, pathname, vpName) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vpName], ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const failed = [];
  const consoleErrors = [];
  page.on('response', (r) => { if (r.status() >= 400 && /\.(css|js)(\?|$)/.test(r.url())) failed.push(`${r.status()} ${r.url().replace(host, '')}`); });
  page.on('pageerror', (e) => consoleErrors.push(String(e.message).slice(0, 200)));
  try {
    const resp = await page.goto(host + pathname, { waitUntil: 'load', timeout: 180000 });
    const status = resp ? resp.status() : 0;
    const hasMain = await page.locator('main').count();
    if (status !== 200 || !hasMain) return { status, hasMain: !!hasMain };
    await page.waitForTimeout(2000);
    // Injeção direta: o addStyleTag do Playwright falha quando um script de terceiro viola a CSP da página.
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = '#onetrust-consent-sdk,#onetrust-banner-sdk{display:none!important}';
      document.head.appendChild(s);
    });
    await page.evaluate(async () => {
      // Rolagem lenta: com 600px/60ms o lazyload não acompanhava as páginas mais altas (cards em branco no print).
      for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2500);
    const data = await page.evaluate((PROPS) => {
      const main = document.querySelector('main');
      const seen = {};
      const styles = [];
      const label = (el) => el.tagName.toLowerCase() + (el.classList.length ? '.' + [...el.classList].filter((c) => !/^paragraph--\d+|^glide__slide--|^js-|is-/.test(c)).join('.') : '');
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
        styles.push({ key: key + ' #' + seen[key], st, rect: [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)] });
      }
      const q = (s) => main.querySelectorAll(s).length;
      const glides = [...main.querySelectorAll('.glide')];
      const handGlides = glides.filter((g) => !g.closest('[data-slider]'));
      const html = main.innerHTML;
      const signals = {
        h1: (document.querySelector('h1')?.textContent || '').trim().slice(0, 80),
        handGlide: handGlides.length,
        handGlideMounted: handGlides.filter((g) => /glide--(slider|carousel)/.test(g.className)).length,
        sdcSlider: q('[data-slider]'),
        cta: q('.cta'),
        spacing: q('[class*=" mb-"],[class^="mb-"],[class*=" mt-"],[class^="mt-"],[class*=" pb-"],[class^="pb-"],[class*=" pt-"],[class^="pt-"],[class*=" my-"],[class*=" py-"]'),
        hl: q('[class*="hl-"]'),
        cardSdc: q('.card-article,.card-ebook,.card-recipe'),
        htmlWidget: q('.paragraph--type--html-widget,[class*="html-widget"]'),
        legacyThemeUrl: (html.match(/\/themes\/custom\/cookit\//g) || []).length,
        lpCss: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.href).filter((h) => /\/lps\//.test(h)).map((h) => h.replace(/^.*\/lps\//, 'lps/').replace(/\?.*$/, '')),
        mainHeight: Math.round(main.getBoundingClientRect().height),
      };
      return { styles, signals };
    }, PROPS);
    const png = await page.locator('main').screenshot({ timeout: 120000 });
    return { status, hasMain: true, ...data, png, failed: [...new Set(failed)].slice(0, 20), consoleErrors: consoleErrors.slice(0, 10) };
  } catch (e) {
    return { status: -1, error: String(e.message).slice(0, 200) };
  } finally {
    await ctx.close();
  }
}

// % de pixels diferentes (limiar por canal 24) na área comum + diferença de altura.
async function pixelDiff(browser, pngA, pngB) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    return await page.evaluate(async ([a, b]) => {
      const load = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = Math.min(ia.width, ib.width);
      const h = Math.min(ia.height, ib.height);
      const read = (img) => { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
      const da = read(ia), db = read(ib);
      let diff = 0;
      for (let i = 0; i < da.length; i += 16) { // amostra 1 de cada 4 pixels
        if (Math.abs(da[i] - db[i]) > 24 || Math.abs(da[i + 1] - db[i + 1]) > 24 || Math.abs(da[i + 2] - db[i + 2]) > 24) diff++;
      }
      return { pct: +(100 * diff / (da.length / 16)).toFixed(1), hA: ia.height, hB: ib.height };
    }, [`data:image/png;base64,${pngA.toString('base64')}`, `data:image/png;base64,${pngB.toString('base64')}`]);
  } finally {
    await ctx.close();
  }
}

// Resumo do diff de estilo por família de propriedade (mesma lógica do compare-lp-diff.mjs).
function styleDiff(novo, velho) {
  const mN = new Map(novo.map((e) => [e.key, e]));
  const fam = { espacamento: 0, tipografia: 0, cor: 0, raio: 0, layout: 0, filtro: 0, box: 0 };
  let n = 0;
  const examples = [];
  for (const v of velho) {
    const a = mN.get(v.key);
    if (!a) continue;
    const props = [];
    for (const p in v.st) {
      if (p === 'width' || p === 'height' || v.st[p] === a.st[p]) continue;
      props.push(p);
      if (/^(margin|padding|gap)/.test(p)) fam.espacamento++;
      else if (/^(font|line-height|letter|text-)/.test(p)) fam.tipografia++;
      else if (/color|background/.test(p)) fam.cor++;
      else if (p === 'border-radius') fam.raio++;
      else if (p === 'filter') fam.filtro++;
      else fam.layout++;
    }
    const [, , w0, h0] = v.rect, [, , w1, h1] = a.rect;
    if (Math.abs(w0 - w1) > 2 || Math.abs(h0 - h1) > 2) { fam.box++; props.push('box'); }
    if (props.length) { n++; if (examples.length < 8) examples.push(`${v.key}: ${props.join(', ')}`); }
  }
  const onlyOld = velho.filter((e) => !mN.has(e.key)).length;
  const onlyNew = novo.length - (velho.length - onlyOld);
  return { elementos: n, onlyOld, onlyNew, fam, examples };
}

async function processPage(browser, pg) {
  const slug = slugOf(pg.path);
  if (results[slug]?.done && !FORCE) return;
  const rec = { nid: pg.nid, title: pg.title, path: pg.path, changed: pg.changed, vp: {} };
  for (const vpName of Object.keys(VIEWPORTS)) {
    const novo = await capture(browser, NOVO, pg.path, vpName);
    let ref = 'cookit-3';
    let velho = await capture(browser, VELHO, pg.path, vpName);
    if ((velho.status !== 200 || !velho.hasMain) && PROD) {
      ref = 'prod';
      velho = await prodSerial(() => capture(browser, PROD, pg.path, vpName));
    }
    const r = { ref, statusNovo: novo.status, statusVelho: velho.status };
    if (novo.error) r.errorNovo = novo.error;
    if (velho.error) r.errorVelho = velho.error;
    for (const [env, d] of [['novo', novo], ['velho', velho]]) {
      if (!d.png) continue;
      fs.writeFileSync(path.join(OUT, `${slug}-${env}-${vpName}.png`), d.png);
      fs.writeFileSync(path.join(OUT, `${slug}-${env}-${vpName}.json`), JSON.stringify(d.styles));
      r[`signals_${env}`] = d.signals;
      if (d.failed?.length) r[`failed_${env}`] = d.failed;
      if (d.consoleErrors?.length) r[`jsErrors_${env}`] = d.consoleErrors;
    }
    if (novo.png && velho.png) {
      r.pixels = await pixelDiff(browser, novo.png, velho.png);
      r.style = styleDiff(novo.styles, velho.styles);
      r.sameContent = novo.signals.h1 === velho.signals.h1;
    }
    rec.vp[vpName] = r;
  }
  rec.done = true;
  results[slug] = rec;
  save();
  const d = rec.vp.desktop;
  console.log(`${slug} | ${d.ref} ${d.statusNovo}/${d.statusVelho} | px ${d.pixels?.pct ?? '-'}% | estilo ${d.style?.elementos ?? '-'}`);
}

const browser = await chromium.launch();
const queue = [...pages];
let done = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (queue.length) {
    const pg = queue.shift();
    try { await processPage(browser, pg); } catch (e) { console.error(pg.path, e.message); }
    done++;
    if (done % 10 === 0) console.log(`-- ${done}/${pages.length}`);
  }
}));
await browser.close();
console.log(`fim: ${Object.keys(results).length} páginas em ${OUT}/results.json`);
