/**
 * LEXBNB — GITHUB ACTIONS SABITLEME TESTI (CEVRIMDISI)
 *
 * L-23: Uretim secret'larini (service_role) alan is akislari eylemleri
 * `@v7` gibi hareketli etiketlerle cagiriyordu. Etiket baska bir commit'e
 * tasinirsa o kod bir sonraki koşuda secret'larla calisir. Her `uses:` tam
 * 40 karakterlik commit SHA'sina sabit olmali; surum yorumda yazar.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '.github', 'workflows');
let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

const files = fs.readdirSync(DIR).filter(f => /\.ya?ml$/.test(f));
check(files.length > 0, '1. Is akislari bulundu', DIR);
let toplam = 0;
for (const f of files) {
  const lines = fs.readFileSync(path.join(DIR, f), 'utf8').split(/\r?\n/);
  const uses = lines.map((l, i) => ({ l: l.trim(), i: i + 1 })).filter(x => /^-?\s*uses:/.test(x.l));
  toplam += uses.length;
  const kotu = uses.filter(x => !/uses:\s*[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}(\s+#\s*v[\d.]+)?\s*$/.test(x.l));
  check(kotu.length === 0, `2. ${f}: her eylem tam commit SHA'sina sabit`, kotu.map(x => `${x.i}: ${x.l}`).join(' | '));
}
check(toplam > 0, `3. ${toplam} eylem cagrisi denetlendi`, 'hic uses: yok');

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed > 0) process.exit(1);
