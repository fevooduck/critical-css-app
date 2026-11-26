// Estima o peso de uma imagem regravada em webp com outras qualidades/larguras (encoder do Chromium,
// próximo ao libwebp do GD). Serve para decidir jpeg_quality (GD usa o mesmo valor no webp) e larguras de srcset.
// Uso: node scripts/perf/estimate-webp-quality.mjs <url-da-imagem> [larguras=orig,1024,828] [qualidades=0.9,0.8,0.75,0.7]
import { chromium } from 'playwright';

const [src, widthsArg = 'orig,1024,828', qualArg = '0.9,0.8,0.75,0.7'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
const buf = await (await fetch(src)).arrayBuffer();
const b64 = Buffer.from(buf).toString('base64');
const res = await page.evaluate(async ({ b64, widths, quals }) => {
  const img = new Image();
  img.src = 'data:image/*;base64,' + b64;
  await img.decode();
  const out = [];
  for (const w of widths) {
    const width = w === 'orig' ? img.naturalWidth : Number(w);
    const height = Math.round(img.naturalHeight * width / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    c.getContext('2d').drawImage(img, 0, 0, width, height);
    for (const q of quals) {
      const blob = await new Promise((r) => c.toBlob(r, 'image/webp', q));
      out.push({ width, height, q, kb: Math.round(blob.size / 1024) });
    }
  }
  return { natural: [img.naturalWidth, img.naturalHeight], out };
}, { b64, widths: widthsArg.split(','), quals: qualArg.split(',').map(Number) });
await browser.close();
console.log(`${src.slice(-80)}\noriginal ${Math.round(buf.byteLength / 1024)}KB ${res.natural.join('x')}`);
for (const r of res.out) console.log(`  ${r.width}x${r.height} q${r.q}: ${r.kb}KB`);
