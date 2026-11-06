// Audita a hierarquia de headings visíveis: um heading só pode subir um nível em relação ao
// heading visível anterior (H1 -> H2 -> H3). Headings com display:none/visibility:hidden não contam.
// Com o twig debug ligado, mostra o template que gerou cada heading.
//
// Uso:
//   node audit-headings.js /receitas/lasanha-a-bolonhesa /artigos/beneficios-do-cafe
//   node audit-headings.js --base=https://cookit-3.lndo.site --label=antes --shots /receitas
//   node audit-headings.js --file=data/headings-audit/urls.txt --label=depois
//
// Relatório em data/headings-audit/<label>.json (e screenshots em data/headings-audit/<label>/ com --shots)
import puppeteer from 'puppeteer';
import fs from 'fs';

const args = process.argv.slice(2);
const opt = (name, def) => (args.find((a) => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=') || def;
const BASE = opt('base', 'https://cookit-2.lndo.site');
const LABEL = opt('label', 'run');
const FILE = opt('file', '');
const SHOTS = args.includes('--shots');
const PATHS = [
  ...args.filter((a) => !a.startsWith('--')),
  ...(FILE ? fs.readFileSync(FILE, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : []),
];
const OUT_DIR = new URL('./data/headings-audit/', import.meta.url);

if (!PATHS.length) {
  console.error('Informe ao menos um caminho. Ex.: node audit-headings.js /receitas/lasanha-a-bolonhesa');
  process.exit(1);
}

const collect = () => {
  const out = [];
  const stack = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT);
  for (let node = walker.currentNode; node; node = walker.nextNode()) {
    if (node.nodeType === Node.COMMENT_NODE) {
      const begin = node.data.match(/BEGIN (?:CUSTOM TEMPLATE )?OUTPUT from '([^']+)'/);
      const end = node.data.match(/END (?:CUSTOM TEMPLATE )?OUTPUT from '([^']+)'/);
      if (begin) stack.push(begin[1]);
      else if (end) stack.pop();
      continue;
    }
    if (!/^H[1-6]$/.test(node.tagName)) continue;
    const style = getComputedStyle(node);
    const visible = node.checkVisibility({ checkVisibilityCSS: true }) && style.visibility !== 'hidden';
    out.push({
      level: Number(node.tagName[1]),
      tag: node.tagName.toLowerCase(),
      cls: node.getAttribute('class') || '',
      text: node.textContent.replace(/\s+/g, ' ').trim().slice(0, 80),
      template: (stack[stack.length - 1] || '').replace(/^themes\/custom\//, '').replace(/^modules\/custom\//, 'M:'),
      visible,
    });
  }
  return out;
};

const browser = await puppeteer.launch({ headless: true, args: ['--ignore-certificate-errors'] });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
fs.mkdirSync(OUT_DIR, { recursive: true });
if (SHOTS) fs.mkdirSync(new URL(`./${LABEL}/`, OUT_DIR), { recursive: true });

const report = [];
for (const path of PATHS) {
  const url = new URL(path, BASE).href;
  const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 }).catch((e) => ({ status: () => e.message }));
  const status = res.status();
  const headings = status === 200 ? await page.evaluate(collect) : [];

  let prev = 0;
  const jumps = [];
  for (const h of headings.filter((x) => x.visible)) {
    if (h.level > prev + 1) jumps.push({ from: prev ? `h${prev}` : '(início)', ...h });
    prev = h.level;
  }
  const h1 = headings.filter((x) => x.visible && x.level === 1).length;

  if (SHOTS && status === 200) {
    const name = path.replace(/^\/|\/$/g, '').replace(/\//g, '_') || 'home';
    await page.screenshot({ path: new URL(`./${LABEL}/${name}.png`, OUT_DIR).pathname, fullPage: true });
  }

  report.push({ path, status, h1, jumps, headings });
  const flag = status !== 200 ? `HTTP ${status}` : jumps.length ? `${jumps.length} salto(s)` : 'ok';
  console.log(`\n${flag.padEnd(12)} ${path}${h1 > 1 ? `  [${h1} H1]` : ''}`);
  for (const j of jumps) console.log(`  ${j.from} -> ${j.tag}.${j.cls.split(' ')[0] || ''} "${j.text.slice(0, 50)}"  ${j.template}`);
}

await browser.close();
const outFile = new URL(`./${LABEL}.json`, OUT_DIR);
fs.writeFileSync(outFile, JSON.stringify({ base: BASE, label: LABEL, date: new Date().toISOString(), report }, null, 2));
const total = report.reduce((n, r) => n + r.jumps.length, 0);
console.log(`\n${total} salto(s) em ${report.length} URL(s). Relatório: ${outFile.pathname}`);
