// Miniatura lado a lado (velho | novo) dos screenshots do compare-lp-batch.mjs, para revisão rápida.
// Uso: node scripts/theme-compare/sbs-thumb.mjs <dir> <slug>[,<slug>...] [desktop|mobile] [--h=1800]
// Saída: <dir>/sbs/<slug>-<vp>.jpg
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const H = Number((args.find((a) => a.startsWith('--h=')) || '--h=1800').slice(4));
const [dir, slugs, vp = 'desktop'] = args.filter((a) => !a.startsWith('--'));
fs.mkdirSync(path.join(dir, 'sbs'), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const slug of slugs.split(',')) {
  const read = (env) => `data:image/png;base64,${fs.readFileSync(path.join(dir, `${slug}-${env}-${vp}.png`)).toString('base64')}`;
  const jpg = await page.evaluate(async ([a, b, H]) => {
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const s = H / Math.max(ia.height, ib.height);
    const wa = ia.width * s, wb = ib.width * s, gap = 16;
    const c = new OffscreenCanvas(Math.ceil(wa + wb + gap), H);
    const x = c.getContext('2d');
    x.fillStyle = '#f0f'; x.fillRect(0, 0, c.width, H);
    x.drawImage(ia, 0, 0, wa, ia.height * s);
    x.drawImage(ib, wa + gap, 0, wb, ib.height * s);
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (const n of buf) bin += String.fromCharCode(n);
    return btoa(bin);
  }, [read('velho'), read('novo'), H]);
  const out = path.join(dir, 'sbs', `${slug}-${vp}.jpg`);
  fs.writeFileSync(out, Buffer.from(jpg, 'base64'));
  console.log(out);
}
await browser.close();
