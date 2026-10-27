/**
 * LEXBNB — ANLIK GORUNTULERDE VERGI DUSUMU KURALI (CEVRIMDISI)
 *
 * phase92 ay kapanisi ve ana sayfa anlik goruntusunu vergiden arindirdi;
 * phase97 iki fonksiyonu eski govdeden yeniden tanimlayip bunu sessizce sildi
 * (phase109 geri getirdi). Bir fonksiyonu yeniden tanimlayan goc, onceki
 * goclerin o fonksiyona yaptigi yamayi tasimak zorundadir.
 *
 * Kural: bu iki fonksiyona dokunan SON goc (manifest sirasinda) vergi
 * izdusumunu (result,taxTotal) icerir.
 */
const fs = require('fs');
const path = require('path');

const SUP = path.join(__dirname, '..', 'supabase');
let passed = 0, failed = 0;
const check = (c, n, d) => { if (c) { passed++; console.log(`[PASS] ${n}`); } else { failed++; console.error(`[FAIL] ${n}\n       ${d || ''}`); } };

const dosyalar = fs.readFileSync(path.join(SUP, 'migration_manifest.txt'), 'utf8').split(/\r?\n/)
  .map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split(/\s+/)[0]);

['compute_month_close_snapshot', 'get_executive_dashboard_snapshot'].forEach(ad => {
  const dokunan = dosyalar.filter(f => {
    const sql = fs.readFileSync(path.join(SUP, f), 'utf8');
    return new RegExp(`FUNCTION\\s+public\\.${ad}\\s*\\(|'public\\.${ad}\\(`).test(sql);
  });
  const son = dokunan[dokunan.length - 1];
  const sql = son ? fs.readFileSync(path.join(SUP, son), 'utf8') : '';
  check(son && /result,taxTotal/.test(sql) && /result,cleaningTax/.test(sql),
    `${ad}: ona dokunan son goc (${son}) vergi dusumunu tasir`, `son: ${son}; dokunanlar: ${dokunan.join(', ')}`);
});

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed) process.exit(1);
