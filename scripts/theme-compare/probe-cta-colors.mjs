// Cores dos botões do <main> (normal e hover) em dois ambientes, para achar LPs
// cuja troca de cor de botão não pega no new_cookit.
// Uso: node scripts/theme-compare/probe-cta-colors.mjs <path> [hostNovo] [hostRef]
//   hostRef padrão: produção. Saída: tabela no stdout, só as linhas que diferem
//   (use --all para ver todas).
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const all = args.includes('--all');
const [path, hostA = 'https://cookit-2.lndo.site', hostB = 'https://www.receitasnestle.com.br'] = args.filter(a => !a.startsWith('--'));

const SEL = 'main a.cta, main a.btn, main .cta, main .btn, main [class*="btnSolid"], main [class*="btnOutline"], main .cta-course';

// --swap=/themes/custom/cookit/=/themes/custom/new_cookit/ troca o caminho dos
// CSS de LP só no host novo, para testar antes de mudar o <link> no banco.
const swap = args.find(a => a.startsWith('--swap='))?.slice(7).split('=');

async function probe(host) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36' });
  if (swap && host === hostA) {
    await page.route(u => u.pathname.includes('/lps/') && u.pathname.endsWith('.css') && u.pathname.includes(swap[0]), r =>
      r.continue({ url: r.request().url().replace(swap[0], swap[1]) }));
  }
  await page.goto(host + path, { waitUntil: 'load', timeout: 300000 });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: '#onetrust-consent-sdk{display:none!important}' }).catch(() => {});
  const handles = await page.$$(SEL);
  const res = [];
  const seen = {};
  for (const h of handles) {
    const info = await h.evaluate(el => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const label = el.tagName.toLowerCase() + '.' + [...el.classList].join('.');
      const ctx = el.closest('section,[class*="paragraph--type"],[class*="tab"]');
      return {
        key: label + ' :: ' + (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30),
        ctx: ctx ? [...ctx.classList].slice(0, 2).join('.') : '',
        visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden',
        n: { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor, weight: cs.fontWeight },
      };
    });
    if (!info.visible) continue;
    seen[info.key] = (seen[info.key] || 0) + 1;
    info.key += ' #' + seen[info.key];
    try {
      await h.scrollIntoViewIfNeeded({ timeout: 2000 });
      await h.hover({ timeout: 2000, force: true });
      await page.waitForTimeout(400);
      info.h = await h.evaluate(el => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor }; });
    } catch { info.h = null; }
    res.push(info);
  }
  await browser.close();
  return res;
}

const [novo, ref] = await Promise.all([probe(hostA), probe(hostB)]);
const refMap = Object.fromEntries(ref.map(r => [r.key, r]));
const fmt = o => o ? `${o.bg} / ${o.color} / ${o.border}` : '-';
let diffs = 0;
for (const a of novo) {
  const b = refMap[a.key];
  const same = b && fmt(a.n) === fmt(b.n) && fmt(a.h) === fmt(b.h);
  if ((same || !b) && !all) continue; // sem par na ref: markup novo (cards SDC), vai no resumo
  if (!same) diffs++;
  console.log(`${same ? '  ' : '≠ '}${a.key}  [${a.ctx}]`);
  console.log(`    novo  normal ${fmt(a.n)} w${a.n.weight} | hover ${fmt(a.h)}`);
  console.log(`    ref   normal ${b ? fmt(b.n) + ' w' + b.n.weight : '(não existe)'} | hover ${b ? fmt(b.h) : '-'}`);
}
const missing = ref.filter(r => !novo.find(a => a.key === r.key));
const onlyNew = novo.filter(a => !refMap[a.key]);
console.log(`\n${novo.length} botões no novo, ${ref.length} na ref, ${diffs} pares com cor diferente, ${onlyNew.length} só no novo.`);
const group = list => Object.entries(list.reduce((acc, r) => { const k = r.key.replace(/ #\d+$/, '') + ` → ${fmt(r.n)} | hover ${fmt(r.h)}`; acc[k] = (acc[k] || 0) + 1; return acc; }, {})).map(([k, n]) => `   ${n}× ${k}`).join('\n');
if (missing.length) console.log('Só na ref:\n' + group(missing));
if (onlyNew.length && all) console.log('Só no novo:\n' + group(onlyNew));
