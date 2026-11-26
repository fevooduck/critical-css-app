// Qual arquivo do srcset cada aparelho escolhe (currentSrc) e quanto pesa.
// Uso: node scripts/perf/probe-srcset-pick.mjs <url> [seletor=img.banner-hero__image]
// Aparelhos: celular 390@2, Android 412@2.625, iPhone Pro Max 430@3, iPad 820@2,
// notebook 1366@1, notebook Windows 1280@1.5, desktop 1440@1, MacBook 1440@2.
import { chromium } from 'playwright';

const [url, selector = 'img.banner-hero__image'] = process.argv.slice(2);
const devices = [
  ['celular 390@2', 390, 844, 2, true],
  ['Android 412@2.625', 412, 915, 2.625, true],
  ['iPhone Pro Max 430@3', 430, 932, 3, true],
  ['iPad 820@2', 820, 1180, 2, true],
  ['notebook 1366@1', 1366, 768, 1, false],
  ['notebook 1280@1.5', 1280, 720, 1.5, false],
  ['desktop 1440@1', 1440, 900, 1, false],
  ['MacBook 1440@2', 1440, 900, 2, false],
];

const browser = await chromium.launch();
for (const [label, width, height, dpr, mobile] of devices) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  const info = await page.$eval(selector, (img) => {
    const entry = performance.getEntriesByName(img.currentSrc)[0];
    return { src: img.currentSrc, kb: entry ? Math.round((entry.encodedBodySize || entry.transferSize) / 1024) : null, css: Math.round(img.getBoundingClientRect().width) };
  });
  const style = (info.src.match(/styles\/([^/]+)\//) || [])[1] || info.src.slice(-40);
  console.log(`${label.padEnd(22)} precisa ~${String(Math.round(info.css * dpr)).padStart(4)}px → ${style.padEnd(28)} ${info.kb ?? '?'}KB`);
  await ctx.close();
}
await browser.close();
