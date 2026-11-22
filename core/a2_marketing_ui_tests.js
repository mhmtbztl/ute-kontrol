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

// Sadelik (21.11.2026): "Kanallar" gorunumu kalkti; kanal cirosu Analiz'de
// (Kanal dagilimi), net kar Finans'ta. Pazarlama iki sekme: Reklamlar, Airbnb.
test('Pazarlama iki canlı alt sekme gösterir: Reklamlar ve Airbnb ilan performansı', () => {
  assert.doesNotMatch(html, /data-marketing-view="economics"/);
  // Sadelik (21.11.2026): tek sayfa, sekme yok.
  assert.doesNotMatch(html, /data-marketing-view=/);
  assert.match(html, /id="tab-marketing" class="tab-content lex-screen"/);
});

test('Ayrıntılı reklam araçları ayrı sayfa; ana sayfaya geri dönülür', () => {
  const model = MarketingUI.buildWorkspaceModel({ filter: { period: '2026-09', villa: 'ALL' }, bookings: [] });
  const detail = MarketingUI.renderWorkspaceHtml(model, 'ads');
  assert.match(detail, /data-marketing-home/);
  assert.doesNotMatch(detail, /ads-subnav/);
  assert.match(MarketingUI.renderWorkspaceHtml(model, 'home'), /data-ads-view="import"/);
});

test('Airbnb workspace replaces the generic funnel without mixing Booking data', () => {
  const model = MarketingUI.buildWorkspaceModel({ filter: { period: 'ALL', villa: 'ALL' }, bookings: [], listings: [{ id: 'l1', channel_code: 'BOOKING_COM' }] });
  const output = MarketingUI.renderWorkspaceHtml(model, 'home');
  assert.match(output, /Airbnb ilanınız/i);
  assert.doesNotMatch(output, /Booking\.com Extranet/i);
});


test('Galeri ve eski Raporlar yüzeyi geri gelmeyecek şekilde kaldırılır', () => {
  assert.doesNotMatch(marketingSource, /function renderGallery/);
  assert.doesNotMatch(marketingSource, /data-marketing-media-form|data-marketing-open-media/);
  assert.doesNotMatch(html, /id="tab-reports"/);
  assert.doesNotMatch(appSource, /function renderReportsTab/);
});

test('Sayfa çubuğunda eski kapak testi ve ikinci ChatGPT düğmesi yok (sadelik 21.11.2026)', () => {
  assert.doesNotMatch(appSource, /FUNNEL_TEST_QUESTION|id: 'page-chatgpt'/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
