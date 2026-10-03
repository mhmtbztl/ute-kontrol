// Yasal metin iskeleti ve kayit onayi agi (A6-G1, L-82, K-05; 03.10.2026).
//
// Kullanici karari: sayfalar ve onay kutusu simdi kurulur, hukuk metni
// kullanicidan gelir. Uydurma hukuk metni yazilmaz (CLAUDE.md §3.6): sayfa
// metnin hazirlandigini acikca soyler.
const fs = require('fs');
const path = require('path');
const { isAllowed } = require('../server.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let passed = 0;
let failed = 0;
function check(cond, name, detail) {
  if (cond) { passed++; console.log(`[PASS] ${name}`); }
  else { failed++; console.error(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

const PAGES = [
  ['yasal/kullanim-sartlari.html', 'Kullanım Şartları'],
  ['yasal/gizlilik.html', 'Gizlilik Politikası'],
  ['yasal/kvkk.html', 'KVKK Aydınlatma Metni']
];

try {
  for (const [rel, title] of PAGES) {
    const file = path.join(root, rel);
    const exists = fs.existsSync(file);
    check(exists, `Y1. ${rel} var`);
    if (!exists) continue;
    const page = fs.readFileSync(file, 'utf8');
    check(/^<!doctype html>/i.test(page.trim()) && page.includes('<meta charset="utf-8">'), `Y2. ${rel} tam HTML belgesi`);
    check(page.includes(`<h1>${title}</h1>`), `Y3. ${rel} başlığı "${title}"`);
    check(/hazırlanıyor/.test(page), `Y4. ${rel} metnin hazırlandığını açıkça söylüyor`);
    check(!/<script/i.test(page), `Y5. ${rel} betik içermiyor`);
    check(page.includes('Content-Security-Policy'), `Y6. ${rel} kendi CSP'sini taşıyor`);
    check(isAllowed(rel), `Y7. Yerel sunucu ${rel} sayfasını veriyor`);
    check(html.includes(`href="${rel}"`), `Y8. Kayıt formu ${rel} bağlantısını gösteriyor`);
  }
  check(!isAllowed('yasal/../.env') && !isAllowed('yasal/notlar.md'), 'Y9. Yasal klasörü yalnız .html verir');

  const formStart = html.indexOf('id="saasRegisterForm"');
  const form = formStart >= 0 ? html.slice(formStart, html.indexOf('</form>', formStart)) : '';
  check(/<input type="checkbox" id="saasRegLegalConsent"[^>]*required/.test(form), 'Y10. Kayıt formunda zorunlu onay kutusu var');
  check(form.indexOf('saasRegLegalConsent') < form.indexOf('saasRegSubmitBtn'), 'Y11. Onay kutusu gönder düğmesinden önce');
  check((form.match(/target="_blank" rel="noopener noreferrer"/g) || []).length >= 3, 'Y12. Yasal bağlantılar yeni sekmede, opener bağı olmadan açılır');

  const reg = app.slice(app.indexOf('async function handleSaaSRegister'), app.indexOf('auth.signUp(', app.indexOf('async function handleSaaSRegister')) + 400);
  check(reg.includes("getElementById('saasRegLegalConsent')") && reg.indexOf('saasRegLegalConsent') < reg.indexOf('auth.signUp('),
    'Y13. Kayıt, onay kutusunu signUp çağrısından önce denetler');
  check(/legal_consent_at:\s*new Date\(\)\.toISOString\(\)/.test(reg) && /legal_text_version:\s*LEGAL_TEXT_VERSION/.test(reg),
    'Y14. Onay zamanı ve metin sürümü hesap kaydına yazılır');
  check(/const LEGAL_TEXT_VERSION = '[^']+';/.test(app), 'Y15. Metin sürümü tek sabitte');
} catch (error) {
  failed++;
  console.error('[FAIL] beklenmeyen hata — ' + (error && error.stack || error));
} finally {
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed) process.exit(1);
}
