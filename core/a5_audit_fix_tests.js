/**
 * A5 DENETIM DUZELTMELERI (Claude, 03.10.2026) — L-142, L-143, L-144, L-146,
 * L-147, L-148. Ayrinti: ortak-denetim/DENETIM_A5_Claude.md.
 *
 * Her blok a1d279a'ya karsi kirmizidir:
 *  A  ChatGPT'ye "kar olculemedi" doneminin net kari gidiyordu (L-142).
 *  B  Rapor dosyasinda ic alan adlari, [object Object], yuvarlanmamis para (L-146).
 *  C  Yazdir/PDF window.open(..., 'noopener') ile hic acilmiyordu (L-143).
 *  D  Fiyat basamaklari hicbir ekrandan girilemiyordu (L-144).
 *  E  Kontrol listesi maddeleri/onemli/alt isaret girilemiyordu (L-148b),
 *     guncellemeler 0 satiri "basarili" sayiyordu (L-148c).
 *  F  Hizli rezervasyon kanal listesi sabitti (L-147a), logo koyu zeminde
 *     okunmuyordu (L-148e), imzali logo URL'si yenilenmiyordu (L-148a).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ReportEngine = require('./report_engine');
const ChatGptPromptEngine = require('./chatgpt_prompt_engine');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const actions = fs.readFileSync(path.join(ROOT, 'core', 'action_dispatch.js'), 'utf8');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (error) { failed++; console.error(`[FAIL] ${name}\n  ${error.message}`); }
}

function fnSource(name) {
  const start = app.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert(start >= 0, `${name} app.js icinde yok`);
  let depth = 0;
  for (let i = app.indexOf('{', start); i < app.length; i++) {
    if (app[i] === '{') depth++;
    else if (app[i] === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`${name} kapanmiyor`);
}

const ledger = { netRoomRevenue: 40000, cleaningRevenue: 0, totalRevenue: 40000, totalOpex: 0, capex: 0, operatingProfit: 40000, netProfit: 40000, soldNights: 8, adr: 5000 };

try {
  // ---------------------------------------------------------------- A (L-142)
  test('A1. Kar olculemezken ChatGPT ozetinde net kar yok (app.js FINANCE cagrisi)', () => {
    const src = fnSource('buildCurrentPageReport');
    const finance = src.slice(src.indexOf("page === 'FINANCE'"), src.indexOf("page === 'PROPERTY'"));
    assert(!/summary\s*:\s*\{\s*\.\.\.ledger/.test(finance), 'FINANCE raporu ham defteri summary olarak veriyor');
    const report = ReportEngine.buildReport({ page: 'FINANCE', period: { start: '2026-09-01', end: '2026-09-30' }, data: { ledger, summary: { ...ledger }, isProfitUnmeasured: true } });
    assert.strictEqual(report.chatGptContext.summary.netProfit, undefined);
    const prompt = ChatGptPromptEngine.buildPrompt({ kind: 'PAGE_REPORT', today: '2026-10-03', question: 'Yorumla', context: { report: report.chatGptContext } }).prompt;
    assert(!prompt.includes('netProfit'), 'prompt net kar tasiyor');
    assert(prompt.includes('"netRoomRevenue":40000'), 'olculmus ciro prompta girmeli');
  });
  test('A2. Olculmus kar ChatGPT ozetinde kalir', () => {
    const report = ReportEngine.buildReport({ page: 'FINANCE', period: {}, data: { ledger: { ...ledger, totalOpex: 1200, netProfit: 38800 }, isProfitUnmeasured: false } });
    assert.strictEqual(report.chatGptContext.summary.netProfit, 38800);
  });
  test('A3. Mulk raporu kar olculebilirligini uygular ve "Tum zamanlar" der', () => {
    const src = fnSource('buildCurrentPageReport');
    const property = src.slice(src.indexOf("page === 'PROPERTY'"), src.indexOf("page === 'BOOKINGS'"));
    assert(/isProfitUnmeasured\(/.test(property), 'PROPERTY raporu isProfitUnmeasured gecmiyor');
    assert(property.includes("label: 'Tüm zamanlar'"), 'Mulk raporu basligi filtre donemini yaziyor');
    const report = ReportEngine.buildReport({ page: 'PROPERTY', period: { label: 'Tüm zamanlar' }, filters: { label: 'Villa A' }, data: { ledger, isProfitUnmeasured: true } });
    assert.strictEqual(report.subtitle, 'Tüm zamanlar · Villa A');
    assert.strictEqual(report.sections[0].items.find(x => x.id === 'netProfit').value, null);
  });

  // ---------------------------------------------------------------- B (L-146)
  test('B1. Rapor CSV basliklari Turkce, ic nesne dokulmez, para yuvarlanir, olculemeyen "—"', () => {
    const report = ReportEngine.buildReport({ page: 'BOOKINGS', period: {}, data: {
      summary: { soldNights: 3, netRoomRevenue: 14000.456, collections: 3000 },
      rows: [{ guest: 'Ali', meta: { k: 1 }, gross: 4666.666666 }]
    } });
    const csv = ReportEngine.toCSV(report);
    assert(!csv.includes('[object Object]'), 'ic nesne dokuluyor');
    assert(csv.includes('Satılan gece;3') && csv.includes('Net konaklama geliri;14000,46'), csv);
    assert(!/(^|\n)soldNights;/.test(csv), 'ic alan adi basliga cikti');
    assert(csv.includes('4666,67'), 'para iki haneye yuvarlanmadi');
    const fin = ReportEngine.toCSV(ReportEngine.buildReport({ page: 'FINANCE', period: {}, data: { ledger, isProfitUnmeasured: true } }));
    assert(fin.includes('Net kâr;—'), 'olculemeyen kar CSVde — degil');
  });
  test('B2. Finans Excel donem ozeti sayfasi tasir; defter sayfalari onde', () => {
    const report = ReportEngine.buildReport({ page: 'FINANCE', period: {}, data: { ledger: { ...ledger, totalOpex: 100, netProfit: 39900 }, bookings: [], expenses: [] } });
    assert.deepStrictEqual(report.excel.sheets.map(s => s.name), ['Rezervasyonlar', 'Giderler', 'Dönem özeti']);
    const rows = report.excel.sheets[2].rows;
    assert(rows.some(r => r.metric === 'Net kâr' && r.value === 39900));
  });
  test('B3. Rezervasyon/Operasyon/Satis/Kanal raporlari acik etiketli sutunla kurulur; Operasyon donem filtresine uyar', () => {
    const src = fnSource('buildCurrentPageReport');
    assert(!src.includes('rows: filteredRows.map(item => item.booking)'), 'Rezervasyon raporu ham nesne dokuyor');
    assert(/inScope\(row\.date/.test(src) && /isDateInFilter\(/.test(src), 'Operasyon raporu donemi yok sayiyor');
    assert(src.includes('cleaningTasks.filter(isCleaningDebt)'), 'Borc tek tanimdan (isCleaningDebt) hesaplanmali');
    assert(!src.includes('model.economics.totals }'), 'Kanal raporu ic tanilama alanlarini tasiyor');
  });

  // ---------------------------------------------------------------- C (L-143)
  test('C1. Yazdirma penceresi noopener ozelligiyle acilmaz, opener elle kesilir', () => {
    const src = fnSource('printCurrentReport');
    assert(!/window\.open\([^)]*noopener/.test(src), 'noopener ile window.open her zaman null doner');
    assert(src.includes('popup.opener = null'));
  });
  test('C2. Varsayilan Lexbnb logosu rapora girer (ekranda koyu, baskida acik surum)', () => {
    const ctx = { window: { location: { href: 'https://lexbnb.space/' } }, URL };
    vm.runInNewContext(fnSource('reportLogoSrc'), ctx);
    assert.strictEqual(ctx.reportLogoSrc('assets/brand/lexbnb-logo.svg', 'print'), 'https://lexbnb.space/assets/brand/lexbnb-logo.svg');
    assert.strictEqual(ctx.reportLogoSrc('assets/brand/lexbnb-logo.svg', 'screen'), 'https://lexbnb.space/assets/brand/lexbnb-logo-dark.svg');
    assert.strictEqual(ctx.reportLogoSrc('javascript:alert(1)'), '');
    assert.strictEqual(ctx.reportLogoSrc('https://x.supabase.co/storage/v1/object/sign/a.png?token=1'), 'https://x.supabase.co/storage/v1/object/sign/a.png?token=1');
  });

  // ---------------------------------------------------------------- D (L-144)
  test('D1. Fiyat basamaklari mulk profilinde duzenlenir; bos alan null yazilir', () => {
    assert(actions.includes("'savePropertyPricingLadder'"), 'EYLEMLER eksik');
    const render = fnSource('renderPropertyProfile');
    assert(render.includes('propertyPricingLadderFormHtml(villaKey, property)'), 'Fiyatlar sekmesinde form yok');
    const save = fnSource('savePropertyPricingLadder');
    assert(save.includes('cloudSavePricingLadder(villaKey, values)'));
    assert(/raw === ''\) \{ values\[key\] = null/.test(save), 'bos basamak null yazilmali (3.6)');
    assert(!/\|\|\s*[1-9]\d*/.test(save), 'sifir olmayan varsayilan yasak');
    assert(fnSource('propertyPricingLadderFormHtml').includes('canManageTenantRole'), 'form yalniz yonetim rollerine');
  });

  // ---------------------------------------------------------------- E (L-148)
  test('E1. Kontrol listesi metni bolum, onemli ve alt isaretle gidip doner', () => {
    const ctx = {};
    vm.runInNewContext(fnSource('checklistItemsToText') + '\n' + fnSource('checklistTextToItems'), ctx);
    const text = '# Mutfak\n!Ocak temiz > Izgara; Fırın\nBuzdolabı boş\n# Banyo\nHavlu';
    const items = ctx.checklistTextToItems(text, [{ item: 'Sabun' }]);
    assert.strictEqual(JSON.stringify(items), JSON.stringify({ sections: [
      { title: 'Mutfak', items: [{ text: 'Ocak temiz', important: true, subChecks: ['Izgara', 'Fırın'] }, { text: 'Buzdolabı boş', important: false, subChecks: [] }] },
      { title: 'Banyo', items: [{ text: 'Havlu', important: false, subChecks: [] }] }
    ], supplies: [{ item: 'Sabun' }] }));
    assert.strictEqual(ctx.checklistItemsToText(items), text);
    assert(fnSource('editSettingsTemplate').includes("kind === 'checklist'"), 'maddeler duzenlenemiyor');
  });
  test('E2. Ayarlar guncellemeleri 0 satiri basari saymaz', () => {
    assert(fnSource('updateSettingsRow').includes(".select('id')"));
    for (const name of ['editSettingsTemplate', 'archiveSettingsTemplate', 'toggleSettingsLeadSource']) {
      const src = fnSource(name);
      assert(src.includes('updateSettingsRow(') && !/\.update\(/.test(src), `${name} sonucu dogrulamiyor`);
    }
  });

  // ---------------------------------------------------------------- F (L-147, L-148)
  test('F1. Hizli rezervasyon kanallari isletmenin aktif kanal katalogundan', () => {
    const src = fnSource('openQuickBookingModal');
    assert(src.includes('getBookingChannelCatalog().filter(channel => channel.isActive)'));
  });
  test('F2. Koyu zeminde acik logo; imzali logo URLsi suresi dolmadan tazelenir', () => {
    assert(html.includes('id="headerBusinessLogo" src="assets/brand/lexbnb-logo-dark.svg"'));
    assert(html.includes('id="loginBusinessLogo" src="assets/brand/lexbnb-logo-dark.svg"'));
    const svg = fs.readFileSync(path.join(ROOT, 'assets', 'brand', 'lexbnb-logo-dark.svg'), 'utf8');
    assert(!svg.includes('#17324D'), 'koyu surumde lacivert kaldi');
    assert(!/<script|on[a-z]+=/i.test(svg), 'SVG betik tasimamali');
    const refresh = fnSource('refreshBusinessLogoUrl');
    assert(refresh.includes('BUSINESS_LOGO_URL_TTL_MS') && refresh.includes('setTimeout'));
  });

  // ---------------------------------------------------------------- G (L-145)
  test('G1. Uctan uca tur 8 akisi test projesinde yazarak yurutur ve kendini temizler', () => {
    const tour = fs.readFileSync(path.join(ROOT, 'scripts', 'a5_e2e_flow_tour.js'), 'utf8');
    assert(tour.includes("require('../core/test_env.js')") && tour.includes('loadTestEnv()'), 'tur merkezi test kapisindan gecmeli');
    for (const step of ['1. Rezervasyon', '2b. Temizlik', '3. Gider', '4. Finans', '5. Ay kapanışı', '6. Talep', '7. Arıza', '8. Rol sınırları']) {
      assert(tour.includes(`flow('${step}`), `${step} akisi yok`);
    }
    for (const call of ['saveBookingPayment(', 'signStaffCleaningDone(', 'inspectCleaningExecution(', 'submitMonthClose(', 'convertLeadAction(', 'resolveMaintenanceFromOperations(']) {
      assert(tour.includes(call), `${call} dugmenin cagirdigi fonksiyon turda yok`);
    }
    assert(/finally \{[\s\S]*cleanupFixture\(\)/.test(tour), 'fikstur finally icinde silinmeli');
    assert(require('../package.json').scripts['test:e2e:live'] === 'node scripts/a5_e2e_flow_tour.js');
  });
  test('G2. Tarayici kapisi etiketleri olctugu seyi soyler; toplam esitligi ekrandan okunur', () => {
    const gate = fs.readFileSync(path.join(ROOT, 'scripts', 'browser_quality_gate.js'), 'utf8');
    assert(!gate.includes("'4. ay kapanışı yüzeyi'") && !gate.includes("'5. talep → teklif → rezervasyon'"), 'gorunurluk kontrolu akis gibi etiketleniyor');
    assert(gate.includes("getElementById('finActualRevenue')") && gate.includes("getElementById('rezTableSummaryPill')"), 'rapor toplami ekrandaki metinle karsilastirilmali');
    assert(gate.includes("waitForEvent('popup'"), 'yazdirma penceresi olculmeli');
  });
} finally {
  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed) process.exit(1);
}
