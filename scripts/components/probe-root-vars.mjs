// Valores computados de custom properties do :root em 3 larguras. Uso: node scripts/components/probe-root-vars.mjs <url> <out.json> --vars=a,b
import fs from 'node:fs';
import { chromium } from 'playwright';
const [url, out] = process.argv.slice(2);
const vars = (process.argv.find((a) => a.startsWith('--vars=')) ?? '').slice(7).split(',');
const browser = await chromium.launch();
const res = {};
for (const w of [390, 1000, 1440]) {
  const p = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: w, height: 900 } });
  await p.goto(url, { waitUntil: 'load', timeout: 120000 });
  res[w] = await p.evaluate((vs) => Object.fromEntries(vs.map((v) => [v, getComputedStyle(document.documentElement).getPropertyValue(v).trim()])), vars);
  res[w].mainTop = await p.evaluate(() => Math.round(document.querySelector('main')?.getBoundingClientRect().top ?? -1));
  await p.close();
}
await browser.close();
fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res));
