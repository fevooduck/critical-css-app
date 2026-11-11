// Compara duas rodadas do audit-single-image.mjs (ex.: antes x depois) de um mesmo host.
// Uso: node compare-single-image.mjs data/single-image/<host>/antes.json data/single-image/<host>/depois.json [tolerancia-px]
//
// Relata:
//  - REGRESSÃO: caixa final (section/picture/img) que mudou mais que a tolerância (o visual carregado não deveria mudar);
//  - reserva: altura da seção com imagem pendente x altura final (quanto do espaço já fica reservado antes da imagem);
//  - CLS por página/viewport.
import fs from 'node:fs';

const [fa, fb, tolArg = '2'] = process.argv.slice(2);
const tol = Number(tolArg);
const A = JSON.parse(fs.readFileSync(fa, 'utf8'));
const B = new Map(JSON.parse(fs.readFileSync(fb, 'utf8')).map(e => [e.path, e]));

const diffBox = (a, b) => !a || !b ? (a || b ? 999 : 0) : Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const reserve = (pend, fin) => {
  // fração da altura final que já existe com a imagem pendente (1 = reservado por completo)
  if (!fin || !fin.section || !fin.section[1]) return null;
  if (!pend || !pend.section) return 0;
  return Math.min(1, pend.section[1] / fin.section[1]);
};

const regress = [], clsRows = [], resRows = [];
let totals = { pares: 0, regress: 0, resAntes: 0, resDepois: 0, nRes: 0 };

for (const a of A) {
  const b = B.get(a.path);
  if (!b) { console.log(`! sem par no depois: ${a.path}`); continue; }
  for (const vp of Object.keys(a.vp)) {
    const va = a.vp[vp], vb = b.vp[vp];
    if (!va || !vb || va.error || vb.error) { console.log(`! erro ${a.path} ${vp}: ${va?.error || ''} ${vb?.error || ''}`); continue; }
    clsRows.push({ path: a.path, vp, antes: va.cls, depois: vb.cls });
    const n = Math.max(va.final.length, vb.final.length);
    for (let i = 0; i < n; i++) {
      const fa_ = va.final[i], fb_ = vb.final[i];
      totals.pares++;
      const d = Math.max(diffBox(fa_?.section, fb_?.section), diffBox(fa_?.img, fb_?.img));
      if (d > tol) {
        totals.regress++;
        regress.push({ path: a.path, vp, i, cls: (fb_ || fa_)?.cls, antes: { section: fa_?.section, img: fa_?.img }, depois: { section: fb_?.section, img: fb_?.img }, natural: (fb_ || fa_)?.natural, attrs: (fb_ || fa_)?.attrs });
      }
      // só seções visíveis (altura final > 0)
      if (fb_ && fb_.section && fb_.section[1] > 0) {
        const ra = reserve(va.pending?.[i], fa_), rb = reserve(vb.pending?.[i], fb_);
        if (ra !== null && rb !== null) { totals.resAntes += ra; totals.resDepois += rb; totals.nRes++; resRows.push({ path: a.path, vp, i, antes: ra, depois: rb }); }
      }
    }
  }
}

console.log(`\n=== Caixas finais (tolerância ${tol}px): ${totals.regress} de ${totals.pares} single-images mudaram`);
for (const r of regress) console.log(`REGRESSÃO? ${r.path} [${r.vp}] #${r.i} (${r.cls}) section ${JSON.stringify(r.antes.section)}→${JSON.stringify(r.depois.section)} img ${JSON.stringify(r.antes.img)}→${JSON.stringify(r.depois.img)} natural=${JSON.stringify(r.natural)} attrs=${JSON.stringify(r.attrs)}`);

const pct = x => (100 * x).toFixed(0) + '%';
console.log(`\n=== Reserva de espaço com imagem pendente (média): antes ${pct(totals.resAntes / totals.nRes)} → depois ${pct(totals.resDepois / totals.nRes)} (${totals.nRes} seções)`);
const piores = resRows.filter(r => r.depois < 0.95).sort((x, y) => x.depois - y.depois);
console.log(`Seções ainda sem reserva completa depois (<95%): ${piores.length}`);
for (const r of piores.slice(0, 25)) console.log(`  ${r.path} [${r.vp}] #${r.i}: antes ${pct(r.antes)} → depois ${pct(r.depois)}`);

const sum = (rows, k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
for (const vp of ['mobile', 'tablet', 'desktop']) {
  const rows = clsRows.filter(r => r.vp === vp);
  if (!rows.length) continue;
  const pior = rows.filter(r => r.depois > r.antes + 0.05);
  const melhor = rows.filter(r => r.depois < r.antes - 0.05);
  console.log(`\n=== CLS ${vp}: média antes ${(sum(rows, 'antes') / rows.length).toFixed(3)} → depois ${(sum(rows, 'depois') / rows.length).toFixed(3)} | melhorou >0.05: ${melhor.length} | piorou >0.05: ${pior.length}`);
  for (const r of pior) console.log(`  PIOROU ${r.path}: ${r.antes} → ${r.depois}`);
}
