// Compara screenshots de duas rodadas do audit-headings.js (ou qualquer par de pastas com PNGs de mesmo nome)
// e gera, por página, um recorte lado a lado (antes | depois) só das faixas verticais que mudaram.
//
// Uso:
//   node compare-shots.js data/headings-audit/new_cookit-antes-shots data/headings-audit/new_cookit-depois
//   node compare-shots.js <dirA> <dirB> --out=data/headings-audit/diff --pad=40
//
// Saída: <out>/<nome>.png e resumo no console (faixas alteradas e diferença de altura).
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const opt = (name, def) => (args.find((a) => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=') || def;
const [DIR_A, DIR_B] = args.filter((a) => !a.startsWith('--'));
const OUT = opt('out', 'data/headings-audit/diff');
const PAD = Number(opt('pad', '40'));

if (!DIR_A || !DIR_B) {
  console.error('Uso: node compare-shots.js <dirAntes> <dirDepois> [--out=dir] [--pad=40]');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

for (const file of fs.readdirSync(DIR_A).filter((f) => f.endsWith('.png'))) {
  const fileB = path.join(DIR_B, file);
  if (!fs.existsSync(fileB)) continue;
  const a = `data:image/png;base64,${fs.readFileSync(path.join(DIR_A, file)).toString('base64')}`;
  const b = `data:image/png;base64,${fs.readFileSync(fileB).toString('base64')}`;

  const result = await page.evaluate(async (a, b, pad) => {
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = Math.max(ia.width, ib.width);
    const h = Math.max(ia.height, ib.height);
    const read = (img) => {
      const c = new OffscreenCanvas(w, h);
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      return x.getImageData(0, 0, w, h).data;
    };
    const da = read(ia);
    const db = read(ib);
    // Linhas diferentes (amostra a cada 2px na horizontal)
    const rows = [];
    for (let y = 0; y < h; y++) {
      let diff = 0;
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 30) diff++;
      }
      rows.push(diff > 0);
    }
    // Agrupa em faixas (só a primeira faixa importa quando a altura muda: o resto apenas desloca)
    const bands = [];
    for (let y = 0; y < h; y++) {
      if (!rows[y]) continue;
      const last = bands[bands.length - 1];
      if (last && y - last[1] <= pad) last[1] = y;
      else bands.push([y, y]);
    }
    const crop = bands.slice(0, 3).map(([s, e]) => [Math.max(0, s - pad), Math.min(h, e + pad)]).map(([s, e]) => [s, Math.min(e, s + 700)]);
    if (!crop.length) return { bands: 0, hA: ia.height, hB: ib.height, png: null };
    const total = crop.reduce((n, [s, e]) => n + (e - s) + 10, 0);
    const out = new OffscreenCanvas(w * 2 + 10, total);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, out.width, out.height);
    let oy = 0;
    for (const [s, e] of crop) {
      ctx.drawImage(ia, 0, s, w, e - s, 0, oy, w, e - s);
      ctx.drawImage(ib, 0, s, w, e - s, w + 10, oy, w, e - s);
      oy += e - s + 10;
    }
    const blob = await out.convertToBlob({ type: 'image/png' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { bands: bands.length, first: bands[0], hA: ia.height, hB: ib.height, png: btoa(bin) };
  }, a, b, PAD);

  const name = file.replace(/\.png$/, '');
  if (result.png) fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(result.png, 'base64'));
  const dh = result.hB - result.hA;
  console.log(`${result.bands ? 'mudou' : 'igual'}  ${name.padEnd(55)} altura ${dh >= 0 ? '+' : ''}${dh}px${result.first ? `  1ª faixa y=${result.first[0]}-${result.first[1]}` : ''}`);
}

await browser.close();
