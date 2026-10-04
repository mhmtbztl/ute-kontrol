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

  // L-18: Cloudflare Web Analytics cerezsiz sayaci sayfaya kendisi ekler;
  // CSP izin vermezse betik engellenir ve konsolda hata kalir. Izin yalniz
  // bu iki adrese verilir, genel bir joker acilmaz.
  const csp = (read('index.html').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  const directive = name => (csp.match(new RegExp(name + '([^;]*)')) || [])[1] || '';
  check(/https:\/\/static\.cloudflareinsights\.com/.test(directive('script-src')), 'M10. CSP script-src Cloudflare Web Analytics betigine izin verir', directive('script-src'));
  check(/https:\/\/cloudflareinsights\.com/.test(directive('connect-src')), 'M11. CSP connect-src Cloudflare Web Analytics raporuna izin verir', directive('connect-src'));
  check(!/\*\.cloudflareinsights|https:\s|https:;/.test(directive('script-src') + ';'), 'M12. script-src joker icermez', directive('script-src'));

  // Klasik <script> dosyasinda ust duzey `const crypto` tum sayfa icin
  // tarayicinin crypto nesnesini golgeler: finance_import_engine.js onu null
  // yapiyordu ve Cloudflare'in betigi crypto.randomUUID'de dusuyordu.
  const tarayiciAdlari = 'crypto|location|navigator|fetch|performance|history|document|window|self|name|status|origin|top|parent|screen|localStorage|sessionStorage|caches|indexedDB';
  const golge = new RegExp('^(?:const|let|var|function|class)\\s+(' + tarayiciAdlari + ')\\b', 'm');
  const sayfaBetikleri = [...new Set((read('index.html').match(/src="core\/[^"?]+/g) || []).map(s => s.slice(5)))].concat('app.js');
  const golgeleyen = sayfaBetikleri.filter(f => golge.test(read(f))).map(f => f + ': ' + read(f).match(golge)[1]);
  check(sayfaBetikleri.length > 10 && golgeleyen.length === 0, 'M13. Sayfa betikleri tarayicinin yerlesik adlarini ust duzeyde golgelemez', golgeleyen.join(', '));

  // M1 (kullanici, 04.10): uygulama yalniz koyu temadir. Tarayici acilir
  // listeyi (option) acik temayla ciziyordu ve secim kutusunun acik renkli
  // yazisini miras alan secenekler beyaz zemin uzerinde gorunmuyordu (mulk
  // formunda ulke listesi). Kural tek bir kutuya degil tum sayfaya konur.
  const css = read('style.css');
  check(/:root\s*\{[^}]*color-scheme:\s*dark/.test(css), 'M14. Sayfa koyu renk semasini tarayiciya bildirir (:root color-scheme: dark)');
  const optKural = css.match(/^select option[^{]*\{([^}]*)\}/m);
  check(!!optKural && /background(?:-color)?:/.test(optKural[1]) && /color:/.test(optKural[1]), 'M15. Tum secim kutularinin secenekleri koyu zemin ve acik yazi alir', optKural ? optKural[0].trim() : 'kural yok');

  // Pazarlama sayfa cubugunda iki eylem ayni "ChatGPT'ye sor" etiketini
  // tasiyordu (kullanici ekran goruntusu, 04.10); huni testi kendi adini alir.
  const funnelLabel = (app.match(/id: 'funnel-test-question',\s*label: "([^"]+)"/) || [])[1] || '';
  check(!!funnelLabel && !/^(?:🧠 )?ChatGPT'ye sor$/.test(funnelLabel), 'M16. Huni testi eylemi genel ChatGPT dugmesinden ayirt edilir', funnelLabel);

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
