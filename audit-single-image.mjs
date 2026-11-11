// Auditoria do paragraph section_single_image (hero/banners) em component pages.
// Mede, por página e viewport:
//  - CLS do carregamento (sem interação);
//  - caixa final de cada .single-image (section, picture, img) depois de rolar a página (força o lazy);
//  - altura de cada .single-image com as imagens bloqueadas (mostra se o espaço fica reservado antes da imagem chegar);
//  - recorte em PNG de cada .single-image, para comparar antes x depois.
//
// Uso: node audit-single-image.mjs <fase> <host> <arquivo-paginas.tsv> [saida-dir]
//   fase: rótulo livre (ex.: antes, depois)
//   tsv: nid \t bundle \t qtd \t path (saída da query de páginas com single-image)
// Saída: data/single-image/<host>/<fase>.json e data/single-image/<host>/<fase>/<slug>-<vp>-<i>.png
import { chromium } from 'playwright';
import fs from 'node:fs';

const [phase, host, pagesFile, outBase = 'data/single-image'] = process.argv.slice(2);
if (!phase || !host || !pagesFile) {
  console.error('Uso: node audit-single-image.mjs <fase> <host> <paginas.tsv> [saida-dir]');
  process.exit(1);
}
const hostName = new URL(host).hostname.split('.')[0];
const outDir = `${outBase}/${hostName}`;
const shotDir = `${outDir}/${phase}`;
fs.mkdirSync(shotDir, { recursive: true });

const pages = fs.readFileSync(pagesFile, 'utf8').trim().split('\n').map(l => l.split('\t')).map(([nid, bundle, qtd, path]) => ({ nid, path }));
const VIEWPORTS = { mobile: { width: 393, height: 852 }, tablet: { width: 820, height: 1180 }, desktop: { width: 1440, height: 900 } };

const clsInit = () => {
  window.__cls = 0; window.__shifts = [];
  new PerformanceObserver(l => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__cls += e.value;
      if (e.value > 0.01) window.__shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), src: (e.sources || []).map(s => s.node && s.node.className ? s.node.className.toString().split(' ').slice(0, 2).join('.') : (s.node ? s.node.nodeName : '?')).slice(0, 4) });
    }
  }).observe({ type: 'layout-shift', buffered: true });
};

const measure = () => [...document.querySelectorAll('.single-image')].map((sec, i) => {
  const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
  const img = sec.querySelector('picture img, img');
  const sources = [...sec.querySelectorAll('picture source')];
  return {
    i,
    cls: [...sec.classList].filter(c => !/^paragraph--/.test(c)).join(' '),
    section: box(sec), picture: box(sec.querySelector('picture')), img: box(img),
    natural: img ? [img.naturalWidth, img.naturalHeight] : null,
    attrs: img ? [img.getAttribute('width'), img.getAttribute('height')] : null,
    sourceDims: sources.map(s => [s.getAttribute('width'), s.getAttribute('height')]).filter(d => d[0]).length,
    loading: img && img.loading, complete: img && img.complete,
  };
});

const scrollAll = async page => {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);
};

const browser = await chromium.launch();
const results = [];
for (const p of pages) {
  const slug = p.path.replace(/^\/|\/$/g, '').replace(/\//g, '_') || 'home';
  const entry = { nid: p.nid, path: p.path, vp: {} };
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const r = {};
    try {
      // 1) carregamento normal: CLS + caixas finais + recortes
      const ctx = await browser.newContext({ viewport: vp, ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      await page.addInitScript(clsInit);
      const resp = await page.goto(host + p.path, { waitUntil: 'load', timeout: 120000 });
      r.status = resp && resp.status();
      await page.waitForTimeout(2000);
      r.cls = await page.evaluate(() => +window.__cls.toFixed(4));
      r.shifts = await page.evaluate(() => window.__shifts);
      await page.addStyleTag({ content: '#onetrust-consent-sdk{display:none!important}' });
      await scrollAll(page);
      r.final = await page.evaluate(measure);
      const secs = await page.locator('.single-image').all();
      for (let i = 0; i < secs.length; i++) {
        try { if (await secs[i].isVisible()) await secs[i].screenshot({ path: `${shotDir}/${slug}-${vpName}-${i}.png`, timeout: 15000 }); } catch (e) { /* seção oculta/fora do layout */ }
      }
      await ctx.close();

      // 2) imagens bloqueadas: altura reservada antes da imagem chegar
      const ctx2 = await browser.newContext({ viewport: vp, ignoreHTTPSErrors: true });
      const page2 = await ctx2.newPage();
      await page2.route(/\.(webp|jpe?g|png|gif|avif)(\?|$)/i, route => route.request().resourceType() === 'image' ? new Promise(() => {}) : route.continue());
      await page2.goto(host + p.path, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page2.waitForTimeout(1500);
      r.pending = await page2.evaluate(measure);
      await ctx2.close();
    } catch (e) {
      r.error = String(e.message || e).split('\n')[0];
    }
    entry.vp[vpName] = r;
  }
  results.push(entry);
  const m = entry.vp.mobile || {};
  console.log(`${phase} ${hostName} ${p.path} status=${m.status} cls(m/t/d)=${['mobile', 'tablet', 'desktop'].map(v => entry.vp[v].cls ?? 'err').join('/')} single-images=${(m.final || []).length}`);
  fs.writeFileSync(`${outDir}/${phase}.json`, JSON.stringify(results, null, 1));
}
await browser.close();
