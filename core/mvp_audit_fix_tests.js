// Codex MVP denetimi (03.10.2026) duzeltmeleri agi.
//
// 1. Kullanilmayan exceljs zinciri yuksek onemli bir bagimlilik acigi
//    tasiyordu (brace-expansion) ve CI audit'i kapali kurdugu icin gorulmedi.
// 2. WhatsApp'tan rezervasyon, ad bos birakilinca "WhatsApp Misafiri" adiyla
//    kaydediliyordu (CLAUDE.md §3.6: uydurma veri).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0;
let failed = 0;
function check(cond, name, detail) {
  if (cond) { passed++; console.log(`[PASS] ${name}`); }
  else { failed++; console.error(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

try {
  const pkg = JSON.parse(read('package.json'));
  const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
  check(!deps.exceljs, 'M1. Kullanilmayan exceljs bagimliligi yok');
  check(!fs.existsSync(path.join(root, 'core/excel_generator.js')), 'M2. Olu excel_generator.js kaldirildi');
  check(!/"node_modules\/exceljs"/.test(read('package-lock.json')), 'M3. Kilit dosyasinda exceljs yok');
  check(/run: npm audit --audit-level=high/.test(read('.github/workflows/ci.yml')), 'M4. CI yuksek onemli bagimlilik acigini durdurur');

  const app = read('app.js');
  check(!/WhatsApp Misafiri/.test(app), 'M5. Uydurma "WhatsApp Misafiri" adi yok');
  const start = app.indexOf('async function saveWaAsBooking');
  const body = start >= 0 ? app.slice(start, app.indexOf('createBooking(', start)) : '';
  check(/if \(!guest\) \{[\s\S]*?return;/.test(body), 'M6. WhatsApp rezervasyonu ad olmadan createBooking\'e gitmez');

  // K-02: site yeni tip publishable anahtari kullanir; eski JWT anahtarlar
  // ancak bu gecisten sonra panelden kapatilabilir.
  const siteKey = (app.match(/const DEFAULT_SUPABASE_KEY = '([^']+)'/) || [])[1] || '';
  check(/^sb_publishable_/.test(siteKey), 'M8. Site publishable anahtari kullanir (eski JWT degil)', siteKey.slice(0, 12));
  check(!/eyJhbGciOi/.test(app), 'M9. app.js icinde eski JWT anahtari kalmadi');

  // Yeni kayit Supabase'de kapaliyken (L-157) kullanici nedenini gorur.
  const App = require('../app.js');
  for (const raw of ['Signups not allowed for this instance', 'signup_disabled']) {
    const text = App.getFriendlyAuthErrorMessage({ message: raw });
    check(/geçici olarak kapalı/.test(text), `M7. "${raw}" anlaşılır mesaja çevrilir`, text);
  }
} catch (error) {
  failed++;
  console.error('[FAIL] beklenmeyen hata — ' + (error && error.stack || error));
} finally {
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed) process.exit(1);
}
