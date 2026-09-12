const assert = require('assert');
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
    start: '2026-12-01', endExclusive: '2027-01-01', label: '2026-12'
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

runTest('Unknown channels remain visible in the rendered economics table', () => {
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: 'ALL', villa: 'ALL' },
    bookings: [{ id: 'U1', channel: 'Agency X', checkIn: '2026-09-01', checkOut: '2026-09-02', grossAmount: 1000 }]
  });
  const html = MarketingUI.renderWorkspaceHtml(model, 'economics');
  assert.match(html, /Bilinmeyen/);
  assert.match(html, /Agency X/);
  assert.match(html, /Eşleme gerekli/);
});

runTest('Missing funnel and gallery inputs render explicit empty states', () => {
  const model = MarketingUI.buildWorkspaceModel({ filter: { period: 'ALL', villa: 'ALL' }, bookings: [] });
  assert.match(MarketingUI.renderWorkspaceHtml(model, 'funnel'), /Huni verisi henüz yok/);
  assert.match(MarketingUI.renderWorkspaceHtml(model, 'gallery'), /Galeri analizi henüz yok/);
  assert.doesNotMatch(MarketingUI.renderWorkspaceHtml(model, 'gallery'), /70/);
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

runTest('Index integrates one independent marketing entry without app.js edits', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.strictEqual((index.match(/id="tab-marketing"/g) || []).length, 1);
  assert.strictEqual((index.match(/src="core\/marketing_ui\.js(?:\?v=[a-f0-9]{8})?"/g) || []).length, 1);
  assert.match(index, /id="tab-marketing-legacy"[^>]*hidden[^>]*aria-hidden="true"/);
  assert.match(index, /onclick="switchTab\('marketing'\)"[^>]*>📈 Gelir & Dağıtım/);
});

console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
if (passedTests !== totalTests) process.exit(1);
