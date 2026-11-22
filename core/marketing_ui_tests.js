const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const MarketingUI = require('./marketing_ui');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests += 1;
  try {
    fn();
    passedTests += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    console.error(`       ${error.stack || error.message}`);
  }
}

runTest('Monthly filter uses an exclusive first day of next month', () => {
  assert.deepStrictEqual(MarketingUI.periodFromFilter({ period: '2026-12' }), {
    start: '2026-12-01', endExclusive: '2027-01-01', label: 'Aralık 2026'
  });
});

runTest('Custom inclusive UI end date is converted to exclusive engine boundary', () => {
  assert.deepStrictEqual(MarketingUI.periodFromFilter({
    period: 'CUSTOM', startDate: '2026-09-10', endDate: '2026-09-30'
  }), {
    start: '2026-09-10', endExclusive: '2026-10-01', label: '2026-09-10 – 2026-09-30'
  });
});

runTest('Property scope accepts both UI slug and persisted property id', () => {
  const scoped = MarketingUI.scopeBookings([
    { id: 'A', villa: 'AZURE' },
    { id: 'B', property_id: 'property-1' },
    { id: 'C', propertyId: 'property-2' }
  ], 'AZURE', { AZURE: { id: 'property-1' } });
  assert.deepStrictEqual(scoped.map(item => item.id), ['A', 'B']);
});

runTest('Workspace model exposes recorded commission without fallback estimates', () => {
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: '2026-09', villa: 'ALL' },
    bookings: [{
      id: 'B1', channel: 'AIRBNB', checkIn: '2026-09-01', checkOut: '2026-09-03',
      grossAmount: 20000, cleaningFee: 2000, status: 'CONFIRMED'
    }]
  });
  assert.strictEqual(model.economics.totals.roomRevenueBeforeDistribution, 18000);
  assert.strictEqual(model.economics.totals.distributionCost, 0);
  assert.strictEqual(model.economics.totals.roomRevenueAfterDistribution, 18000);
});

// Kanallar gorunumu (kanal tablosu, saglik skoru, referans) sadelikte kalkti (21.11.2026).


runTest('Pazarlama tek sayfa: özet, reklam tablosu ve Airbnb bölümü birlikte', () => {
  const model = MarketingUI.buildWorkspaceModel({ filter: { period: 'ALL', villa: 'ALL' }, bookings: [] });
  const html = MarketingUI.renderWorkspaceHtml(model, 'home');
  assert.match(html, /id="marketingSummary"/);
  assert.match(html, /Reklamlarınız/);
  assert.match(html, /Airbnb ilanınız/);
  assert.match(html, /id="airbnbPerformanceWorkspace"/);
  assert.doesNotMatch(html, /ads-subnav/);
});

runTest('Airbnb workspace loads every listing even when the global property filter selects one home', () => {
  const scope = MarketingUI.cloudScopeForView(
    '11111111-1111-4111-8111-111111111111',
    { villas: { DEMO: { id: '22222222-2222-4222-8222-222222222222' } } },
    { villa: 'DEMO' },
    'funnel'
  );
  assert.deepStrictEqual(scope, {
    tenantId: '11111111-1111-4111-8111-111111111111',
    propertyId: null
  });
});

runTest('Injected markup is escaped in finding output', () => {
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: 'ALL', villa: 'ALL' }, bookings: [],
    snapshots: [{ impressions: 100, listingViews: 20, bookingAttempts: 2, platformReportedBookings: 1, wishlistSaves: 3 }],
    findings: [{ id: 'F1', findingFingerprint: 'fp-1', status: 'OPEN', actionKind: 'DIGITAL_REVIEW', title: '<img src=x>', evidenceText: '<script>x</script>' }]
  });
  const html = MarketingUI.renderWorkspaceHtml(model, 'funnel');
  assert.doesNotMatch(html, /<img src=x>/);
  assert.doesNotMatch(html, /<script>x<\/script>/);
});





runTest('Channel listing form preserves property scope and constrained channel vocabulary', () => {
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: 'ALL', villa: 'AZURE' }, bookings: [],
    villas: { AZURE: { id: 'P1', name: 'Villa Azure' }, OLD: { id: 'P2', name: '<Eski>' } }
  });
  const html = MarketingUI.renderListingForm(model);
  assert.match(html, /value="P1" selected/);
  assert.match(html, /value="BOOKING_COM"/);
  assert.doesNotMatch(html, /INSTAGRAM/);
  assert.match(html, /&lt;Eski&gt;/);
});




runTest('Index integrates one independent marketing entry without app.js edits', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.strictEqual((index.match(/id="tab-marketing"/g) || []).length, 1);
  assert.strictEqual((index.match(/src="core\/marketing_ui\.js(?:\?v=[a-f0-9]{8})?"/g) || []).length, 1);
  assert.doesNotMatch(index, /id="tab-marketing-legacy"/);
  // Menu etiketi kullanici karariyla degisti (ENVANTER 30.09.2026).
  assert.match(index, /onclick="switchTab\('marketing'\)"[^>]*>Pazarlama</);
});

runTest('Marketing bootstrap and lazy dependencies carry current content hashes', () => {
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const uiSource = fs.readFileSync(path.join(__dirname, 'marketing_ui.js'), 'utf8');
  const hash = file => crypto.createHash('sha1')
    .update(fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n'), 'utf8')
    .digest('hex').slice(0, 8);
  assert.match(index, new RegExp(`core/marketing_ui\\.js\\?v=${hash(path.join(__dirname, 'marketing_ui.js'))}`));
  ['marketing_engine.js', 'marketing_data_service.js', 'marketing_channel_listing_service.js'].forEach(file => {
    assert.match(uiSource, new RegExp(`${file.replace('.', '\\.') }\\?v=${hash(path.join(__dirname, file))}`));
  });
});

console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
if (passedTests !== totalTests) process.exit(1);
