#!/usr/bin/env node
// Compara o CSS legado com a base nova do new_cookit e lista:
//  1. seletores que existem nos dois com declarações diferentes;
//  2. variáveis CSS com o mesmo nome e valor diferente;
//  3. regras do CSS legado (pasta inteira) que personalizam .cta por variável
//     que o .cta atual não lê mais.
//
// Uso:
//   node audit-class-collisions.mjs <tema>/Content/css [--out=data/class-audit]
// Lê <css>/main.css e <css>/new-theme-main.css.

import fs from "node:fs";
import path from "node:path";

const cssDir = process.argv[2];
if (!cssDir) {
  console.error("Uso: node audit-class-collisions.mjs <tema>/Content/css [--out=dir]");
  process.exit(1);
}
const outArg = process.argv.find((a) => a.startsWith("--out="));
const outDir = outArg ? outArg.slice(6) : "data/class-audit";

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function parseRules(css) {
  const rules = new Map();
  for (const m of strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    let sel = m[1].trim();
    if (sel.startsWith("@")) continue;
    sel = sel.replace(/^.*@media[^{]*/, "");
    const body = m[2].trim().replace(/\s+/g, " ");
    for (const s of sel.split(",")) {
      const k = s.trim().replace(/\s+/g, " ");
      if (!k) continue;
      if (!rules.has(k)) rules.set(k, []);
      rules.get(k).push(body);
    }
  }
  return rules;
}

function parseVars(css) {
  const vars = new Map();
  for (const m of strip(css).matchAll(/:root\s*\{([^{}]*)\}/g)) {
    for (const v of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      if (!vars.has(v[1])) vars.set(v[1], v[2].trim().replace(/\s+/g, " "));
    }
  }
  return vars;
}

const legacy = fs.readFileSync(path.join(cssDir, "main.css"), "utf8");
const fresh = fs.readFileSync(path.join(cssDir, "new-theme-main.css"), "utf8");

const oldRules = parseRules(legacy);
const newRules = parseRules(fresh);
const collisions = [];
for (const [sel, bodies] of newRules) {
  if (!oldRules.has(sel)) continue;
  const o = oldRules.get(sel).join(" | ");
  const n = bodies.join(" | ");
  if (o !== n) collisions.push({ selector: sel, legacy: o, new: n });
}

const oldVars = parseVars(legacy);
const newVars = parseVars(fresh);
const varCollisions = [];
for (const [k, v] of newVars) {
  if (oldVars.has(k) && oldVars.get(k) !== v) varCollisions.push({ name: k, legacy: oldVars.get(k), new: v });
}

// Regras que ainda personalizam .cta pela API antiga (--color-cta-*, --border-radius, --height).
const deadCta = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".css") && e.name !== "new-theme-main.css") {
      const css = strip(fs.readFileSync(p, "utf8"));
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sel = m[1].replace(/\s+/g, " ").trim();
        if (!/\.cta(?![\w-])/.test(sel)) continue;
        if (/--color-cta-(bg|text|border|filter-icon)|(^|[;\s])--border-radius\s*:|(^|[;\s])--height\s*:/.test(m[2])) {
          deadCta.push({ file: path.relative(cssDir, p), selector: sel.slice(0, 160) });
        }
      }
    }
  }
}
walk(cssDir);

const groups = {};
for (const c of collisions) {
  const g = /^(\[dir=rtl\] )?\.[mp][tblrxy]?-/.test(c.selector)
    ? "espaçamento"
    : /cta|btn/.test(c.selector)
      ? "botões"
      : /^(\*|html|body|h[1-6]|p|a|button|select|img|picture|svg|iframe|table|sup|:root)$/.test(c.selector)
        ? "reset/base"
        : "outros";
  groups[g] = (groups[g] || 0) + 1;
}

fs.mkdirSync(outDir, { recursive: true });
const report = { generatedAt: new Date().toISOString(), cssDir, groups, collisions, varCollisions, deadCta };
fs.writeFileSync(path.join(outDir, "collisions.json"), JSON.stringify(report, null, 1));

console.log(`seletores: novo ${newRules.size}, legado ${oldRules.size}, colisões com valor diferente ${collisions.length}`);
console.log("por grupo:", groups);
console.log(`variáveis com valor diferente: ${varCollisions.length}`);
for (const v of varCollisions) console.log(`  ${v.name}: legado ${v.legacy.slice(0, 50)} | novo ${v.new.slice(0, 50)}`);
const byFile = {};
for (const d of deadCta) byFile[d.file] = (byFile[d.file] || 0) + 1;
console.log(`regras .cta com API antiga (sem efeito): ${deadCta.length} em ${Object.keys(byFile).length} arquivos`);
for (const [f, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${f}`);
console.log(`detalhes: ${path.join(outDir, "collisions.json")}`);
