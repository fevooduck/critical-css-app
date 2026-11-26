// Testa a aba de ofertas do perfil logado e o FAQ de receita. Uso: node scripts/components/probe-offers.mjs <uli-url> <path-ofertas> <recipe-path> <outdir>
import { chromium } from 'playwright';
const [uli, offersPath, recipePath, out] = process.argv.slice(2);
const base = new URL(uli).origin;
const browser = await chromium.launch();
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
const errs = [], fails = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400 && !/placeholder|\/files\//.test(r.url())) fails.push(r.status() + ' ' + r.url().replace(base, '')); });
await page.goto(uli, { waitUntil: 'load', timeout: 120000 });
await page.goto(base + offersPath, { waitUntil: 'load', timeout: 120000 }); await page.waitForTimeout(2000);
const o = await page.evaluate(() => {
  const sec = document.querySelector('.offer-sections');
  const card = document.querySelector('.offer-sections [class*="card"]');
  const css = [...document.querySelectorAll('link[rel=stylesheet],link[rel=preload]')].map((l) => l.href).filter((h) => /offers|lists-recipes-3/.test(h)).map((h) => h.split('/themes/')[1]?.split('?')[0]);
  const js = [...document.scripts].map((s) => s.src).filter((s) => /offer-/.test(s)).map((s) => s.split('/themes/')[1]?.split('?')[0]);
  return { url: location.pathname, hasSections: !!sec, cards: document.querySelectorAll('.offer-sections article, .offer-sections li').length, cardBg: card ? getComputedStyle(card).backgroundColor + ' / radius ' + getComputedStyle(card).borderRadius : null, copyBtns: document.querySelectorAll('[class*="copy"]').length, css, js };
});
console.log('OFERTAS', JSON.stringify(o));
await page.screenshot({ path: out + '/offers-tab.png', fullPage: false });
const opener = await page.$('.offer-sections :is(a,button):has-text("Saiba mais")') ?? await page.$('.offer-sections [aria-haspopup="dialog"]');
if (opener) { await opener.click().catch(() => {}); await page.waitForTimeout(800); console.log('modal aberto:', await page.evaluate(() => !!document.querySelector('dialog[open]'))); await page.screenshot({ path: out + '/offers-modal.png' }); }
await page.goto(base + recipePath, { waitUntil: 'load', timeout: 120000 }); await page.waitForTimeout(1500);
const faq = await page.evaluate(() => { const h = document.querySelector('.accordion .accordion__header'); if (!h) return 'sem .accordion na página'; h.click(); return 'accordion ativo após clique: ' + h.closest('.accordion').classList.contains('active'); });
console.log('FAQ', faq);
console.log('pageerrors', errs, '\n4xx', [...new Set(fails)]);
await browser.close();
