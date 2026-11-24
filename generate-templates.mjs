#!/usr/bin/env node
/**
 * Crítico por template do new_cookit (cookit), em lote.
 *
 * Para cada chave de templates.config.json:
 *   1. visita a URL de amostra (Puppeteer, sem os <style> inline do <head>,
 *      para não realimentar o crítico atual);
 *   2. gera o crítico combinado das viewports (critical, motor render);
 *   3. otimiza sem @layer (o shell inline do tema também não tem camada);
 *   4. subtrai as declarações que o tema já serve inline: shell.css e os
 *      componentes SDC da chave (manifest.nodes[chave]);
 *   5. grava o delta em <tema>/_src/critical/templates/<chave>.css.
 *
 * Rode `npx gulp criticalCss` no tema antes (para ler o shell atual) e
 * depois (para publicar os deltas no manifesto).
 *
 * Uso:
 *   node generate-templates.mjs [--config templates.config.json] [--only k1,k2] [--base URL] [--dry]
 *   CRITICAL_SESSION_COOKIE='SSESSxxxx=valor' para as chaves com logged=true.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { resolvePage } from './lib/page-resolver.js';
import { generateCriticalCss } from './lib/critical-generator.js';
import { optimizeCriticalCSS, getGzipSize } from './lib/css-optimizer.js';
import { getRealUserAgent, closeSharedBrowser } from './lib/browser-manager.js';
import { detectPageFixes, appendPageFixes } from './lib/page-fixes.js';
import { buildCssIgnoreRules, removeExcludedElements } from './lib/html-cleaner.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { config: path.join(here, 'templates.config.json'), only: null, base: null, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') args.config = path.resolve(argv[++i]);
    else if (a === '--only') args.only = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--base') args.base = argv[++i];
    else if (a === '--dry') args.dry = true;
  }
  return args;
}

const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Media query na forma que o navegador serializa: o CSSOM devolve
 * `(width>=1024px)` para o `(min-width: 1024px)` do fonte.
 */
const normMedia = (params) => norm(params)
  .replace(/\(\s*min-width\s*:\s*([^)]+?)\s*\)/g, '(width>=$1)')
  .replace(/\(\s*max-width\s*:\s*([^)]+?)\s*\)/g, '(width<=$1)')
  .replace(/\s+/g, '');

const normSelector = (selector) => norm(selector).replace(/\s*([>+~,])\s*/g, '$1');

/** Contexto de at-rules acima de um nó (ex.: "@media(width>=992px)"). */
function contextOf(node) {
  const parts = [];
  for (let p = node.parent; p && p.type !== 'root'; p = p.parent) {
    if (p.type === 'atrule') parts.unshift(`@${p.name}${p.name === 'media' ? normMedia(p.params) : norm(p.params)}`);
  }
  return parts.join('|');
}

/**
 * "contexto ␟ seletor ␟ propriedade" de toda declaração.
 *
 * A comparação é por propriedade, não por valor: o mesmo CSS chega do
 * build (cssnano) e do navegador (CSSOM) com valores serializados de jeitos
 * diferentes (`calc(clamp(1rem, …))`, cores, zeros).
 */
const declKey = (decl) => `${contextOf(decl.parent)}\u241f${normSelector(decl.parent.selector)}\u241f${norm(decl.prop)}`;

function declarationKeys(css) {
  const keys = new Set();
  postcss.parse(css).walkDecls((decl) => {
    if (decl.parent?.type === 'rule') keys.add(declKey(decl));
  });
  return keys;
}

/** Remove do crítico as declarações já servidas inline pelo tema. */
function subtract(css, served) {
  const root = postcss.parse(css);
  let removed = 0;
  root.walkDecls((decl) => {
    if (decl.parent?.type === 'rule' && served.has(declKey(decl))) {
      decl.remove();
      removed++;
    }
  });
  root.walkRules((rule) => { if (!rule.nodes?.length) rule.remove(); });
  root.walkAtRules((at) => { if (at.nodes && !at.nodes.length) at.remove(); });
  return { css: root.toString(), removed };
}

function readServed(theme, key) {
  const dir = path.join(theme, 'Content/css/critical');
  const manifestFile = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestFile)) {
    throw new Error(`Sem ${manifestFile}: rode \`npx gulp criticalCss\` no tema antes.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const files = ['shell.css', ...(manifest.nodes?.[key] ?? []).map((id) => `components/${id}.css`)];
  const css = files.map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  return { css, keys: declarationKeys(css) };
}

function sessionCookies(base) {
  const raw = process.env.CRITICAL_SESSION_COOKIE;
  if (!raw) return null;
  const [name, ...rest] = raw.split('=');
  const { hostname } = new URL(base);
  return [{ name: name.trim(), value: rest.join('=').trim(), domain: hostname, path: '/', httpOnly: true, secure: base.startsWith('https') }];
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = JSON.parse(fs.readFileSync(args.config, 'utf8'));
  const base = (args.base ?? config.base).replace(/\/$/, '');
  const theme = config.theme;
  const outDir = path.join(theme, '_src/critical/templates');
  const budget = (config.budgetKb ?? 20) * 1024;

  const entries = Object.entries(config.templates).filter(([key]) => !args.only || args.only.includes(key));
  if (!entries.length) throw new Error('Nenhuma chave para gerar (confira --only).');

  const userAgent = await getRealUserAgent();
  const report = [];

  for (const [key, entry] of entries) {
    const url = new URL(entry.url, base + '/').toString();
    console.log(`\n▶ ${key}  ${url}${entry.logged ? '  (logado)' : ''}`);
    try {
      let cookies = [];
      if (entry.logged) {
        cookies = sessionCookies(base);
        if (!cookies) throw new Error('logged=true exige CRITICAL_SESSION_COOKIE="SSESS…=valor"');
      }

      const { blockResult, html } = await resolvePage(url, {
        isolateFirstFold: true,
        ignoreHeadInlineStyles: true,
        freshContext: !entry.logged,
        cookies,
      });
      if (blockResult.blocked || !html) throw new Error(`bloqueado: ${blockResult.reason ?? 'sem HTML'}`);

      // OneTrust e tint já saem por padrão; `exclude` da config soma seletores.
      const exclude = config.exclude ?? [];
      const cleanHtml = exclude.length ? removeExcludedElements(html, exclude).html : html;
      const raw = await generateCriticalCss({
        html: cleanHtml,
        pageUrl: url,
        dimensions: config.dimensions,
        userAgent,
        ignoreRules: buildCssIgnoreRules(exclude),
      });
      const { css: optimized } = await optimizeCriticalCSS(appendPageFixes(raw, detectPageFixes(html)), {
        aggressivePruning: true,
        // Juntar seletores repetidos move declarações de lugar e quebra a
        // cascata (ex.: a regra base mobile indo parar depois do @media
        // desktop do mesmo seletor). O gzip já cobre a repetição.
        combineDuplicates: false,
        cascadeLayer: null,
      });
      if (!optimized.trim()) throw new Error('crítico vazio');

      const served = readServed(theme, key);
      const { css: delta, removed } = subtract(optimized, served.keys);
      const deltaGz = getGzipSize(delta);
      const totalGz = getGzipSize(served.css + delta);
      const over = totalGz > budget;

      const header = `/* Gerado por critical-css-app/generate-templates.mjs — ${entry.url} — ${new Date().toISOString().slice(0, 10)}. Não editar à mão. */\n`;
      if (!args.dry) {
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, `${key}.css`), header + delta + '\n');
      }
      console.log(`  ✅ delta ${kb(deltaGz)} gzip (−${removed} declarações já inline) · total ${kb(totalGz)}${over ? `  ⚠️ acima de ${kb(budget)}` : ''}`);
      report.push({ key, ok: true, deltaGz, totalGz, over });
    } catch (error) {
      console.error(`  ❌ ${error.message}`);
      report.push({ key, ok: false, error: error.message });
    }
  }

  console.log('\nResumo');
  console.table(report.map((r) => (r.ok
    ? { chave: r.key, delta: kb(r.deltaGz), total: kb(r.totalGz), orçamento: r.over ? 'ESTOUROU' : 'ok' }
    : { chave: r.key, delta: '-', total: '-', orçamento: `erro: ${r.error}` })));
  if (!args.dry) console.log(`\nDeltas em ${outDir}. Agora: npx gulp criticalCss && lando drush @cookit-2 cr`);

  await closeSharedBrowser();
  if (report.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  await closeSharedBrowser().catch(() => {});
  process.exit(1);
});
