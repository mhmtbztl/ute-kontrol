const assert = require('assert');
const fs = require('fs');
const path = require('path');
const MarketingUI = require('./marketing_ui');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const marketingSource = fs.readFileSync(path.join(__dirname, 'marketing_ui.js'), 'utf8');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`[PASS] ${name}`); } catch (e) { failed++; console.error(`[FAIL] ${name}\n       ${e.stack || e.message}`); } }

test('Kanallar ve Pazarlama A4 reklam çalışma alanıyla üç canlı alt sekme gösterir', () => {
  assert.match(html, /data-marketing-view="economics"[^>]*>[^<]*Kanallar/);
  assert.match(html, /data-marketing-view="funnel"[^>]*>[^<]*Huniler ve Testler/);
  assert.match(html, /data-marketing-view="ads"[^>]*>[^<]*Reklamlar/);
});

test('Kanal ekonomisi karar sütunlarını ve net payı gösterir', () => {
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: '2026-09', villa: 'ALL' },
    bookings: [{ id: 'b1', channel: 'AIRBNB', checkIn: '2026-09-01', checkOut: '2026-09-03', grossAmount: 22000, cleaningFee: 2000, otaCommission: 3000, status: 'CONFIRMED' }]
  });
  const output = MarketingUI.renderWorkspaceHtml(model, 'economics');
  assert.match(output, /Konaklama cirosu/);
  assert.match(output, /Size kalan net/);
  assert.match(output, /Pay/);
  assert.doesNotMatch(output, /Brüt toplam/);
  assert.match(output, /Size kalan net \(komisyon sonrası\)/);
  assert.doesNotMatch(output, />Net oda geliri</);
});

test('Huni eksik sayaçları sıfır diye uydurmaz ve kanalın kendi aşamalarını açıklar', () => {
  const model = MarketingUI.buildWorkspaceModel({ filter: { period: 'ALL', villa: 'ALL' }, bookings: [], listings: [{ id: 'l1', channel_code: 'BOOKING_COM' }] });
  const output = MarketingUI.renderWorkspaceHtml(model, 'funnel');
  assert.match(output, /ölçülmedi/i);
  assert.match(output, /Booking\.com Extranet/i);
});

test('Değişiklik ölçümü olası etki diye sunulur ve veri/karıştırıcı uyarılarını taşır', () => {
  const output = MarketingUI.renderExperiments([
    { id: 'e1', change_date: '2026-09-01', primary_metric: 'CTR', verdict: 'INSUFFICIENT_DATA', confounders: ['PRICE_CHANGE'] }
  ], null);
  assert.match(output, /gerçek A\/B değil/i);
  assert.match(output, /olası etki/i);
  assert.match(output, /karar için yetersiz/i);
  assert.match(output, /fiyat|sezon/i);
});

test('Galeri ve eski Raporlar yüzeyi geri gelmeyecek şekilde kaldırılır', () => {
  assert.doesNotMatch(marketingSource, /function renderGallery/);
  assert.doesNotMatch(marketingSource, /data-marketing-media-form|data-marketing-open-media/);
  assert.doesNotMatch(html, /id="tab-reports"/);
  assert.doesNotMatch(appSource, /function renderReportsTab/);
});

test('Huni sayfası FUNNEL_TEST_QUESTION eylemini sayfa çubuğuna kaydeder', () => {
  assert.match(appSource, /registerPageAction\(['"]marketing['"][\s\S]{0,500}FUNNEL_TEST_QUESTION/);
  assert.match(appSource, /function openFunnelTestQuestion\(\)/);
  assert.doesNotMatch(appSource, /title:\s*['"]FUNNEL_TEST_QUESTION/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
