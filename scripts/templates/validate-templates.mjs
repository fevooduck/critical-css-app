#!/usr/bin/env node
/**
 * Valida o crítico por template do new_cookit (generate-templates.mjs).
 *
 * Para cada chave de templates.config.json, injeta shell.css + o delta da
 * chave (lidos do Content/css/critical do tema) no início do <head> — onde o
 * tema imprime o crítico — e roda o validateCriticalBlock:
 *   - Teste A: primeira pintura só com o crítico (FOUC/shift no topo);
 *   - Teste B: página completa + crítico (a cascata final não pode mudar).
 *
 * Rode com o `critical_css` DESLIGADO no site, para a página não trazer o
 * crítico duas vezes:
 *   lando drush @cookit-2 cset new_cookit.settings critical_css 0 -y && lando drush @cookit-2 cr
 *
 * Uso: node scripts/templates/validate-templates.mjs [--only k1,k2] [--base URL]
 *      CRITICAL_SESSION_COOKIE='SSESS…=valor' para as chaves logged=true.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCriticalBlock } from '../../lib/visual-validator.js';
import { getSharedBrowser, closeSharedBrowser } from '../../lib/browser-manager.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };

const config = JSON.parse(fs.readFileSync(arg('--config') ?? path.join(here, 'templates.config.json'), 'utf8'));
const base = (arg('--base') ?? config.base).replace(/\/$/, '');
const only = arg('--only')?.split(',').map((s) => s.trim());
const criticalDir = path.join(config.theme, 'Content/css/critical');
const outDir = path.join(here, '../..', 'data', 'templates-validation');

function blockFor(key) {
  const manifest = JSON.parse(fs.readFileSync(path.join(criticalDir, 'manifest.json'), 'utf8'));
  if (!manifest.templates?.includes(key)) return null;
  const files = ['shell.css', ...(manifest.nodes?.[key] ?? []).map((id) => `components/${id}.css`), `templates/${key}.css`];
  const themeBase = '/' + path.relative(path.resolve(config.theme, '../../../..'), config.theme).replace(/^docroot\//, '');
  return files
    .map((f) => fs.readFileSync(path.join(criticalDir, f), 'utf8').replaceAll('__NEW_COOKIT_THEME__', themeBase))
    .map((css) => `<style>${css}</style>`)
    .join('');
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const rows = [];
  const raw = process.env.CRITICAL_SESSION_COOKIE;
  let sessionCookie = null;

  for (const [key, entry] of Object.entries(config.templates)) {
    if (only && !only.includes(key)) continue;
    const blockHtml = blockFor(key);
    if (!blockHtml) { rows.push({ chave: key, viewport: '-', veredito: 'sem delta no manifesto' }); continue; }
    if (entry.logged) {
      if (!raw) { rows.push({ chave: key, viewport: '-', veredito: 'pulada: sem CRITICAL_SESSION_COOKIE' }); continue; }
      const [name, ...rest] = raw.split('=');
      sessionCookie = { name, value: rest.join('='), domain: new URL(base).hostname, path: '/', httpOnly: true, secure: true };
      await (await getSharedBrowser()).setCookie(sessionCookie);
    }

    const url = new URL(entry.url, base + '/').toString();
    console.log(`▶ ${key}  ${url}`);
    const { results } = await validateCriticalBlock({ url, blockHtml, position: 'head-start' });
    for (const r of results) {
      if (r.verdict === 'error') { rows.push({ chave: key, viewport: r.viewport.name, veredito: `erro: ${r.error}` }); continue; }
      const fp = r.firstPaint;
      const shot = (name, data) => data && fs.writeFileSync(path.join(outDir, `${key}--${r.viewport.name}--${name}.jpg`), Buffer.from(String(data).replace(/^data:image\/png;base64,/, ''), 'base64'));
      shot('full', r.screenshots?.original);
      shot('critical', r.screenshots?.firstPaint);
      shot('diff', r.screenshots?.diff);
      rows.push({
        chave: key,
        viewport: r.viewport.name,
        veredito: r.verdict,
        'cascata final (B)': r.finalCascade['head-start'].diffCount,
        'layout 1ª pintura': fp.counts.layout,
        'visual 1ª pintura': fp.counts.visual,
        movidos: fp.movedCount,
        'pixels ≠': fp.pixelDiff?.percent != null ? `${fp.pixelDiff.percent}%` : '-',
      });
      if (r.verdict !== 'ok') {
        for (const g of fp.groups.slice(0, 5)) console.log(`   · ${JSON.stringify(g).slice(0, 220)}`);
      }
    }
    if (sessionCookie) {
      await (await getSharedBrowser()).deleteCookie(sessionCookie);
      sessionCookie = null;
    }
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(rows, null, 2));
  }

  console.table(rows);
  console.log(`Screenshots em ${outDir}`);
  await closeSharedBrowser();
}

main().catch(async (e) => { console.error(e); await closeSharedBrowser().catch(() => {}); process.exit(1); });
