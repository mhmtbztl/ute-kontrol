/**
 * LEXBNB MENU AGI — CEVRIMDISI (A1-G1, 30 Eylul 2026)
 *
 * Kullanici arayuzu "asiri karisik" buldu ve sayfa sayfa sadelestirme
 * kararlari verdi (ortak-denetim ENVANTER, 27-30.09.2026). Menu 12 kalemden
 * 9'a iner:
 *
 *   Bugun · Rezervasyonlar · Mulkler · Operasyon · Misafirler ve Satis ·
 *   Fiyatlandirma · Finans · Kanallar ve Pazarlama · Ayarlar
 *
 * - Raporlar ayri sekme degil: defter disa aktarimi Finans basligina tasindi.
 * - Analiz Merkezi ust cubuktaki "ChatGPT'ye sor" dugmesiyle acilir.
 * - Misafirler ile Satis tek menu kalemi; sayfa icinde Talepler | Misafirler.
 * - Menude kendi kalemi olmayan sayfa, ait oldugu kalemi secili gosterir.
 *   Eskiden `data-onclick*="${tabId}"` alt dize eslesmesiyle aranıyordu;
 *   kalemi olmayan sayfada menude hic secim kalmiyordu.
 *
 * Eski koda karsi: LEXBNB_NAV_TEST_ROOT=<eski agac> ile kosulur ve kirilir.
 */
const fs = require('fs');
const path = require('path');

const KOK = process.env.LEXBNB_NAV_TEST_ROOT || path.join(__dirname, '..');
let passed = 0, failed = 0;
const check = (c, n, d) => { if (c) { passed++; console.log(`[PASS] ${n}`); } else { failed++; console.error(`[FAIL] ${n}\n       ${d}`); } };

try {
  const INDEX = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
  const APP = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');

  // --- A. Menu ---------------------------------------------------------------
  const navMatch = INDEX.match(/<nav class="nav-tabs">([\s\S]*?)<\/nav>/);
  const nav = navMatch ? navMatch[1] : '';
  const kalemler = [...nav.matchAll(/<button class="tab-btn[^"]*" data-onclick="switchTab\('([a-z]+)'\)">([^<]*)/g)]
    .map(m => ({ tab: m[1], etiket: m[2].replace(/\s*\($/, '').trim() }));

  check(kalemler.length === 9, 'A1. Menüde 9 kalem var', `${kalemler.length}: ${kalemler.map(k => k.tab).join(', ')}`);
  const beklenen = ['executive', 'reservations', 'properties', 'operations', 'leads', 'pricing', 'finance', 'marketing', 'settings'];
  check(JSON.stringify(kalemler.map(k => k.tab)) === JSON.stringify(beklenen),
    'A2. Menü sırası kullanıcı kararıyla aynı', kalemler.map(k => k.tab).join(', '));
  const etiket = t => (kalemler.find(k => k.tab === t) || {}).etiket || '';
  check(/Bugün$/.test(etiket('executive')), 'A3. Ana sayfanın adı "Bugün"', etiket('executive'));
  check(/Misafirler ve Satış$/.test(etiket('leads')), 'A4. Satış kalemi "Misafirler ve Satış"', etiket('leads'));
  check(/Kanallar ve Pazarlama$/.test(etiket('marketing')), 'A5. Pazarlama kalemi "Kanallar ve Pazarlama"', etiket('marketing'));
  check(!/switchTab\('(reports|analysis|guests)'\)/.test(nav),
    'A6. Raporlar, Analiz Merkezi ve ayrı Misafirler menüde yok', nav.match(/switchTab\('(reports|analysis|guests)'\)/g));

  // --- B. Tasinan yuzeyler ---------------------------------------------------
  check(/id="askChatGptBtn"[^>]*data-onclick="switchTab\('analysis'\)"/.test(INDEX),
    'B1. Üst çubukta "ChatGPT\'ye sor" düğmesi Analiz Merkezi\'ni açar', 'askChatGptBtn yok');
  const finansBas = INDEX.indexOf('id="tab-finance"');
  const finansSon = INDEX.indexOf('class="tab-content', finansBas + 20);
  const finans = finansBas >= 0 ? INDEX.slice(finansBas, finansSon > 0 ? finansSon : undefined) : '';
  check(/id="ledgerExportMenu"/.test(finans), 'B2. Defter dışa aktarımı Finans sayfasında', 'Finans içinde ledgerExportMenu yok');
  check((INDEX.match(/id="ledgerExportMenu"/g) || []).length === 1, 'B3. Dışa aktarım menüsü tek (id benzersiz)',
    `${(INDEX.match(/id="ledgerExportMenu"/g) || []).length} adet`);
  check((INDEX.match(/data-onclick="openImportModal\(\)/g) || []).length === 1,
    'B4. "İçe aktar" iki menüde tekrar etmiyor', `${(INDEX.match(/data-onclick="openImportModal\(\)/g) || []).length} adet`);
  const araclar = (INDEX.match(/id="toolsMenu">([\s\S]*?)<!-- Dropdown 3/) || ['', ''])[1];
  check(!/switchTab\('housekeeping'\)/.test(araclar), 'B5. Araçlar menüsünde temizlik defteri kısayolu yok (Operasyon\'da)',
    'Araçlar hâlâ housekeeping açıyor');

  // --- C. Talepler | Misafirler -----------------------------------------------
  const sekme = id => {
    const b = INDEX.indexOf(`id="tab-${id}"`);
    return b >= 0 ? INDEX.slice(b, b + 1200) : '';
  };
  ['leads', 'guests'].forEach(id => {
    const bas = sekme(id);
    check(/class="subpage-switch"/.test(bas) && /switchTab\('leads'\)/.test(bas) && /switchTab\('guests'\)/.test(bas),
      `C. ${id} sayfasının başında Talepler | Misafirler geçişi var`, bas.slice(0, 300));
  });
  check((INDEX.match(/id="guestCountBadge"/g) || []).length === 1, 'C3. Misafir sayacı tek ve sayfada duruyor',
    `${(INDEX.match(/id="guestCountBadge"/g) || []).length} adet`);

  // --- D. Menu secimi --------------------------------------------------------
  let app = null;
  try { app = require(path.join(KOK, 'app.js')); } catch (e) { app = null; }
  const esle = app && typeof app.getMenuTabFor === 'function' ? app.getMenuTabFor : null;
  check(!!esle, 'D1. Menü eşlemesi dışa aktarılmış', 'getMenuTabFor yok');
  if (esle) {
    const menudekiler = new Set(kalemler.map(k => k.tab));
    const sayfalar = [...INDEX.matchAll(/id="tab-([a-z]+)"/g)].map(m => m[1])
      .filter(t => !['dashboard', 'analysis'].includes(t));
    const sahipsiz = sayfalar.filter(t => !menudekiler.has(esle(t)));
    check(sahipsiz.length === 0, 'D2. Menüde kalemi olmayan her sayfa bir menü kalemine bağlı', sahipsiz.join(', '));
    check(esle('guests') === 'leads' && esle('housekeeping') === 'operations' && esle('maintenance') === 'operations',
      'D3. Misafirler → Misafirler ve Satış, temizlik ve arıza defteri → Operasyon',
      `${esle('guests')} ${esle('housekeeping')} ${esle('maintenance')}`);
    check(esle('finance') === 'finance', 'D4. Menüdeki sayfa kendini gösterir', esle('finance'));
  }
  check(/\.tab-btn\[data-onclick="switchTab\('\$\{menuTab\}'\)"\]/.test(APP),
    'D5. Menü düğmesi tam eşleşmeyle bulunur (alt dize değil)', 'switchTab hâlâ *= ile arıyor');
} catch (e) {
  failed++;
  console.error(`[FAIL] Beklenmeyen hata\n       ${e && e.stack}`);
} finally {
  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================');
  if (failed > 0) process.exit(1);
}
