#!/usr/bin/env node
/**
 * Smoke + performance de laboratório do new_cookit.
 *
 * Para cada URL (mobile com throttling e desktop): status HTTP, erros JS
 * (pageerror + console.error), requests same-origin com 4xx/5xx, CLS e LCP
 * (PerformanceObserver), nº de requests, bytes de CSS/JS (descomprimidos), CSS bloqueante no
 * <head>, presença de <style data-critical> e de blocos "CSS Critical" manuais.
 *
 * Uso: node scripts/theme-compare/smoke-new-cookit.mjs --label=<nome> [--base=https://cookit-2.lndo.site] [--only=/a,/b]
 * Saída: data/smoke/<label>.json + tabela no terminal.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const base = (args.base ?? 'https://cookit-2.lndo.site').replace(/\/$/, '');
const label = args.label ?? 'smoke';

const URLS = [
  '/', '/node/1007381531',
  '/receitas/pudim-de-leite-moca', '/receitas/receita-frango-empanado-lemon-pepper', '/receitas/receita-bisque-lagostim',
  '/artigos/como-fazer-nhoque', '/artigos/sopas-e-caldos', '/videos/basico-do-basico/aveioca',
  '/aulas-on-line/modulo-1-massas/aula-1-pao-de-lo',
  '/nossas-receitas', '/nossas-receitas/bolos-e-tortas-doces', '/marcas/leite-moca-nestle/receitas/bebidas-e-cafes',
  '/marcas/maggi', '/marcas/maggi/receitas',
  '/busca/resultado?search=bolo', '/busca/ingredientes',
  '/livros-de-receitas', '/livros-de-receitas/todos-os-livros', '/videos', '/aulas-on-line', '/cardapio-semanal',
  '/entrar', '/cadastro', '/cupons-de-descontos',
  '/molico', '/dicas-de-molico', '/nestle-aveia', '/parcerias/rotulos-que-falam', '/criancas-mais-saudaveis',
  '/receitinhas-nestle-familynes', '/leite-moca-nestle', '/nescafegelado',
];
const only = args.only?.split(',');
const urls = only ? only : URLS;

const VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, throttle: true },
  desktop: { viewport: { width: 1440, height: 900 }, throttle: false },
};

const NOISE = /googletagmanager|google-analytics|doubleclick|facebook|hotjar|onetrust|cookielaw|clarity|tiktok|adsense|googlesyndication|amazon|typekit|chatnutri|youtube|instagram/i;

async function run(browser, url, vpName) {
  const vp = VIEWPORTS[vpName];
  const ctx = await browser.newContext({ ...vp, throttle: undefined, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  let reqs = 0, cssBytes = 0, jsBytes = 0;
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
  page.on('response', async (r) => {
    reqs++;
    const u = r.url();
    if (u.startsWith(base) && r.status() >= 400) failed.push(`${r.status()} ${u.replace(base, '')}`);
    const ct = r.headers()['content-type'] ?? '';
    if (!ct.includes('css') && !ct.includes('javascript')) return;
    const len = (await r.body().catch(() => Buffer.alloc(0))).length;
    if (ct.includes('css')) cssBytes += len; else jsBytes += len;
  });
  if (vp.throttle) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await page.addInitScript(() => {
    window.__cls = 0; window.__lcp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { const e = l.getEntries().at(-1); if (e) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  let status = 0;
  try {
    const resp = await page.goto(base + url, { waitUntil: 'load', timeout: 120000 });
    status = resp?.status() ?? 0;
    await page.waitForTimeout(3000);
    // rola até o fim e volta, para pegar erros de lazy/slider
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(800);
  } catch (e) {
    errors.push('goto: ' + e.message.split('\n')[0]);
  }
  const m = await page.evaluate(() => {
    const head = document.head;
    const blocking = [...head.querySelectorAll('link[rel=stylesheet]')].filter((l) => !l.media || l.media === 'all' || l.media === 'screen').length;
    const critStyles = [...head.querySelectorAll('style[data-critical]')].map((s) => s.dataset.critical);
    const inlineBytes = [...document.querySelectorAll('style')].reduce((a, s) => a + s.textContent.length, 0);
    const legacyCritical = [...document.querySelectorAll('style')].filter((s) => /\.btn\s*,\s*\.cta\s*\{/.test(s.textContent) && !s.dataset.critical).length;
    const unmountedGlide = [...document.querySelectorAll('.glide')].filter((g) => !g.classList.contains('glide--slider') && !g.classList.contains('glide--carousel') && g.querySelector('.glide__slides')).length;
    return { cls: +window.__cls.toFixed(3), lcp: Math.round(window.__lcp), blocking, critStyles, inlineKB: +(inlineBytes / 1024).toFixed(1), legacyCritical, unmountedGlide, height: document.body.scrollHeight };
  }).catch(() => ({}));
  await ctx.close();
  return { url, vp: vpName, status, reqs, cssKB: +(cssBytes / 1024).toFixed(0), jsKB: +(jsBytes / 1024).toFixed(0), ...m, errors: [...new Set(errors)], failed: [...new Set(failed)] };
}

const browser = await chromium.launch();
const out = [];
for (const url of urls) {
  for (const vp of Object.keys(VIEWPORTS)) {
    const r = await run(browser, url, vp);
    out.push(r);
    console.log(`${r.status} ${vp.padEnd(7)} ${url.padEnd(55)} cls=${r.cls} lcp=${r.lcp} req=${r.reqs} css=${r.cssKB}K js=${r.jsKB}K blk=${r.blocking} crit=[${r.critStyles ?? ''}] legacyCrit=${r.legacyCritical} glideOff=${r.unmountedGlide} err=${r.errors.length} 4xx=${r.failed.length}`);
  }
}
await browser.close();
fs.mkdirSync(path.join(here, '../..', 'data', 'smoke'), { recursive: true });
fs.writeFileSync(path.join(here, '../..', 'data', 'smoke', `${label}.json`), JSON.stringify(out, null, 2));
console.log(`→ data/smoke/${label}.json`);
