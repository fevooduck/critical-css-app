// Mostra o que o gerador "vê": captura o snapshot (resolvePage, como o servidor faz),
// aplica o prepareSnapshot e renderiza sem JS no viewport pedido. Salva o PNG e lista
// a posição dos seletores pedidos (ajuda a entender por que uma regra ficou fora do crítico).
// Uso: node scripts/templates/shot-snapshot.mjs <url> <out.png> [largura=393] [altura=852] [--sel=.a,.b]
import fs from 'node:fs';
import { chromium } from 'playwright';
import { resolvePage } from '../../lib/page-resolver.js';
import { prepareSnapshot } from '../../lib/critical-generator.js';
import { resetCarouselState } from '../../lib/html-cleaner.js';

const args = process.argv.slice(2);
const [url, out, w = '393', h = '852'] = args.filter((a) => !a.startsWith('--'));
const sels = (args.find((a) => a.startsWith('--sel=')) || '--sel=').slice(6).split(',').filter(Boolean);

const page0 = await resolvePage(url, { isolateFirstFold: true, ignoreHeadInlineStyles: false });
const snap = prepareSnapshot(resetCarouselState(page0.html).html, url);
const html = snap.html.replace('</head>', `<style>${snap.css}</style></head>`);
fs.writeFileSync(out.replace(/\.png$/, '.html'), html);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, javaScriptEnabled: false });
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: 'load', timeout: 120000 });
await page.screenshot({ path: out });
for (const sel of sels) {
  const r = await page.$$eval(sel, (els) => els.slice(0, 3).map((e) => { const b = e.getBoundingClientRect(); return `y${Math.round(b.top)} h${Math.round(b.height)} w${Math.round(b.width)} ${getComputedStyle(e).display}`; }));
  console.log(sel.padEnd(28), r.join(' | ') || '(não encontrado)');
}
await browser.close();
