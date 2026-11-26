// Gera o bloco "CSS Critical" (mobile + desktop) de uma URL pela API do servidor local,
// com os mesmos presets e opções padrão da interface, e grava o HTML pronto para colar.
// Uso: node scripts/templates/generate-block.mjs <url> <saida.html> [--check=.seletor1,.seletor2]
// --check conta quantas vezes cada seletor aparece em cada parte (mobile/desktop).
// Precisa do servidor rodando (npm run server, porta 9001 ou PORT).
import fs from 'node:fs';

const [url, out, ...rest] = process.argv.slice(2);
const check = (rest.find((a) => a.startsWith('--check=')) || '').slice(8).split(',').filter(Boolean);
const base = `http://localhost:${process.env.PORT || 9001}`;
const configs = [
  { width: 1920, height: 1080, device: 'desktop', name: 'Desktop 1920x1080' },
  { width: 393, height: 852, device: 'mobile', name: 'iPhone 16 (393x852)' },
];
const batchId = `cli_${Date.now()}`;

const start = await fetch(`${base}/api/critical/batch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ urls: [url], configs, batchId, async: true }),
}).then((r) => r.json());
const jobId = start.jobId || batchId;

let job;
for (;;) {
  await new Promise((ok) => setTimeout(ok, 3000));
  job = await fetch(`${base}/api/critical/batch/${jobId}`).then((r) => r.json());
  if (['completed', 'failed', 'error'].includes(job.status)) break;
}
const result = (job.results || [])[0];
if (!result) { console.error('Sem resultado:', JSON.stringify(job).slice(0, 500)); process.exit(1); }
const mobile = result.configs.find((c) => c.success && c.config?.device === 'mobile');
const desktop = result.configs.find((c) => c.success && c.config?.device === 'desktop');
if (!mobile || !desktop) { console.error('Faltou viewport:', result.configs.map((c) => `${c.config?.device}:${c.success}:${c.error || ''}`)); process.exit(1); }

const html = `<style media="(max-width: 991.98px)">\n${mobile.css}\n</style>\n\n<style media="(min-width: 992px)">\n${desktop.css}\n</style>`;
fs.writeFileSync(out, html);
console.log(`${out}: mobile ${mobile.css.length} chars (${mobile.gzipSize} gzip), desktop ${desktop.css.length} chars (${desktop.gzipSize} gzip)`);
for (const sel of check) console.log(`  ${sel.padEnd(28)} mobile=${mobile.css.split(sel).length - 1} desktop=${desktop.css.split(sel).length - 1}`);
