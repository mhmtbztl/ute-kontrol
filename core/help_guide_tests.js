// Baslangic Rehberi ve ana sayfa kurulum seridi agi (A6, 03.10.2026).
//
// Rehber eski uygulamayi anlatiyordu: olmayan "Kokpit" sekmesi, sabit
// "150 Kapasite", "kasaniza 4.000-5.000 TL girsin" gibi isletmenin verisinden
// gelmeyen vaatler (CLAUDE.md §3.6). Kurulum seridinin "Fiyatlandirma
// Profili" adimi hic doldurulmayan bir alana bakiyordu; serit %100'e
// ulasamiyordu, ekip adimi da kullanicinin KAC ISLETMEYE uye oldugunu
// sayiyordu.
const fs = require('fs');
const path = require('path');
const ExecutiveDashboardService = require('./executive_dashboard_service.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const dispatch = fs.readFileSync(path.join(__dirname, 'action_dispatch.js'), 'utf8');

let passed = 0;
let failed = 0;
function check(cond, name, detail) {
  if (cond) { passed++; console.log(`[PASS] ${name}`); }
  else { failed++; console.error(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

function helpBlock() {
  const start = html.indexOf('<div class="modal-backdrop" id="helpModal">');
  const end = html.indexOf('<div class="modal-backdrop" id="resetModal">');
  return start >= 0 && end > start ? html.slice(start, end) : '';
}
const visibleText = block => block.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');

try {
  const help = helpBlock();
  const text = visibleText(help);
  check(help.length > 0, 'H1. Rehber penceresi bulunuyor');

  // --- Eski ve uydurma icerik ---
  check(!/Kokpit/i.test(text), 'H2. Rehber olmayan "Kokpit" sekmesini anlatmiyor');
  check(!/150\s*Kapasite/i.test(text), 'H3. Doluluk formulunde sabit kapasite yok');
  check(!/\d[\d.,]*\s*(TL|₺)/.test(text), 'H4. Rehberde TL vaadi yok', (text.match(/.{0,30}\d[\d.,]*\s*(TL|₺).{0,10}/) || [''])[0]);
  check(!/%\s*\d+/.test(text) && !/\d+\s*%/.test(text), 'H5. Rehberde sabit yuzde taktigi yok', (text.match(/.{0,30}(%\s*\d+|\d+\s*%).{0,20}/) || [''])[0]);
  check(!/SaaS|Altın Kural|jakuzi|şömine/i.test(text), 'H6. Genel/uydurma tavsiye metni yok');
  check(!/Kokpit/.test(visibleText(html)), 'H7. Uygulamanin hicbir gorunur metni "Kokpit" demiyor');

  // --- Sekme yapisi tutarli ---
  const btnKeys = [...help.matchAll(/id="helpTabBtn-([a-z]+)"[^>]*data-onclick="switchHelpTab\('([a-z]+)'\)"/g)];
  const paneKeys = [...help.matchAll(/id="helpTab-([a-z]+)" class="help-tab-pane"/g)].map(m => m[1]);
  check(btnKeys.length >= 5 && btnKeys.every(m => m[1] === m[2] && paneKeys.includes(m[1])),
    'H8. Her rehber sekme dugmesinin kendi bolmesi var');
  check(paneKeys.every(key => btnKeys.some(m => m[1] === key)), 'H9. Dugmesiz rehber bolmesi yok');
  check(help.includes('id="helpTab-setup"') && /helpTab-setup" class="help-tab-pane">/.test(help),
    'H10. Rehber ilk kurulum bolmesiyle acilir');
  check(/function openHelpModal\(targetTab = 'setup'\)/.test(app), 'H11. openHelpModal varsayilani ilk kurulum');
  check(html.includes(`header-guide-btn" data-onclick="openHelpModal('setup')"`), 'H12. Ust menudeki rehber dugmesi ilk kurulumu acar');
  for (const m of html.matchAll(/openHelpModal\('([a-z]+)'\)/g)) {
    check(paneKeys.includes(m[1]), `H13. openHelpModal('${m[1]}') var olan bolmeyi acar`);
  }
  check(help.includes('id="helpGlossarySearch"') && help.includes('glossary-card-item'), 'H14. Terim aramasi korunuyor');

  // --- Rehberin andigi ekran adlari gercek ---
  const navLabels = ['📍 Bugün', '🏡 Mülkler', '🧹 Operasyon', '💰 Finans', '🤝 Misafirler ve Satış', '📈 Kanallar ve Pazarlama', '⚙️ Ayarlar'];
  const outside = html.replace(help, '');
  for (const label of navLabels) {
    if (text.includes(label)) check(outside.includes(label), `H15. Rehberdeki "${label}" gercek bir ekran adi`);
  }
  const uiLabels = ['Yaptım (Z)', 'M Onayla', 'Bu Ayı Kapat', 'Rapor al', 'Yazdır / PDF', 'Reklam dönemi ekle', 'Fiyat basamaklarını düzenle',
    'Hızlı rezervasyon', 'WhatsApp Ayrıştır', 'Takvimi kapatır', 'Bugünkü saha işlerim', 'Verileri eşitle'];
  const appSources = outside + app + fs.readFileSync(path.join(__dirname, 'marketing_ui.js'), 'utf8');
  for (const label of uiLabels) {
    if (text.includes(label)) check(appSources.includes(label), `H16. Rehberdeki "${label}" uygulamada gercekten var`);
  }

  // --- Kurulum seridi ---
  const empty = ExecutiveDashboardService.computeTenantOnboardingProgress({});
  check(empty.progressPercent === 0 && empty.completedCount === 0, 'O1. Bos hesapta serit %0');
  const keys = [...String(ExecutiveDashboardService.computeTenantOnboardingProgress).matchAll(/tenantData\.([a-zA-Z]+)/g)].map(m => m[1]);
  const full = {};
  for (const key of keys) full[key] = /Count$/.test(key) ? 2 : (key === 'tenantId' ? 't1' : true);
  const done = ExecutiveDashboardService.computeTenantOnboardingProgress(full);
  check(done.progressPercent === 100 && done.isFullyOnboarded, 'O2. Her adim tamamlanabilir; tam hesapta %100');
  check(done.steps.every(step => typeof step.action === 'string' && step.action), 'O3. Her adimin goturdugu bir ekran var');
  check(!done.steps.some(step => /fiyatlandırma profili|misafir iletişim/i.test(step.title)), 'O4. Olculemeyen adimlar yok');

  const callStart = app.indexOf('ExecutiveDashboardService.computeTenantOnboardingProgress({');
  const call = callStart >= 0 ? app.slice(callStart, app.indexOf('});', callStart)) : '';
  check(call.length > 0, 'O5. Ana sayfa seridi servisi cagiriyor');
  check(keys.every(key => new RegExp(`\\b${key}\\s*:`).test(call)), 'O6. Servisin okudugu her alan cagrida dolduruluyor',
    keys.filter(key => !new RegExp(`\\b${key}\\s*:`).test(call)).join(', '));
  for (const field of [...call.matchAll(/appData\.([a-zA-Z]+)/g)].map(m => m[1])) {
    check(new RegExp(`\\b${field}\\s*:|appData\\.${field}\\s*=`).test(app.replace(call, '')), `O7. Serit alani appData.${field} gercekten yukleniyor`);
  }
  check(!/userMemberships\.length/.test(call), 'O8. Ekip adimi kullanicinin uyelik sayisina bakmiyor');
  check(/function openOnboardingStep\(/.test(app) && /'openOnboardingStep'/.test(dispatch), 'O9. Serit adimlari izinli bir eylemle ekrana gotururor');
  check(/execOnboardingBanner[\s\S]{0,400}hidden/.test(app.slice(app.indexOf('// 2. Onboarding Progress'))),
    'O10. Kurulum tamamlaninca ya da yonetici degilse serit gizlenir');
  check(!/Kokpite Başla/.test(html), 'O11. Ilk mulk penceresi eski "Kokpit" adini kullanmiyor');
} catch (error) {
  failed++;
  console.error('[FAIL] beklenmeyen hata — ' + (error && error.stack || error));
} finally {
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed) process.exit(1);
}
