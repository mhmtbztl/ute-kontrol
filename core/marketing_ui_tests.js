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

runTest('Physical findings expose explicit task opt-in while digital findings do not', () => {
  const physical = MarketingUI.renderFindingActions({ id: 'F1', status: 'OPEN', action_kind: 'RESHOOT' });
  const digital = MarketingUI.renderFindingActions({ id: 'F2', status: 'OPEN', action_kind: 'PRICE_REVIEW' });
  assert.match(physical, /data-marketing-action="ACCEPT_TASK"/);
  assert.doesNotMatch(digital, /data-marketing-action="ACCEPT_TASK"/);
  assert.match(digital, /data-marketing-action="ACKNOWLEDGE"/);
});

runTest('Terminal findings expose no lifecycle buttons', () => {
  assert.strictEqual(MarketingUI.renderFindingActions({ id: 'F1', status: 'RESOLVED', action_kind: 'RESHOOT' }), '');
  assert.strictEqual(MarketingUI.renderFindingActions({ id: 'F2', status: 'DISMISSED', action_kind: 'RESHOOT' }), '');
});

runTest('Manual snapshot form uses scoped listings and leaves unknown counters blank', () => {
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: '2026-09', villa: 'ALL' }, bookings: [],
    listings: [
      { id: 'L1', channel_code: 'AIRBNB', display_name: 'Airbnb Ana İlan', status: 'ACTIVE' },
      { id: 'L2', channel_code: 'VRBO', status: 'ARCHIVED' }
    ]
  });
  const html = MarketingUI.renderSnapshotForm(model);
  assert.match(html, /value="L1"/);
  assert.doesNotMatch(html, /value="L2"/);
  assert.match(html, /name="periodEndExclusive" value="2026-10-01"/);
  assert.match(html, /name="listingViews" placeholder="Bilinmiyorsa boş bırakın"/);
});

runTest('Funnel selects the newest snapshot regardless of query array order', () => {
  const latest = MarketingUI.selectLatestSnapshot([
    { id: 'new', period_end_exclusive: '2026-10-01' },
    { id: 'old', period_end_exclusive: '2026-09-01' }
  ]);
  assert.strictEqual(latest.id, 'new');
});

runTest('Index integrates one independent marketing entry without app.js edits', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.strictEqual((index.match(/id="tab-marketing"/g) || []).length, 1);
  assert.strictEqual((index.match(/src="core\/marketing_ui\.js(?:\?v=[a-f0-9]{8})?"/g) || []).length, 1);
  assert.match(index, /id="tab-marketing-legacy"[^>]*hidden[^>]*aria-hidden="true"/);
  assert.match(index, /onclick="switchTab\('marketing'\)"[^>]*>📈 Gelir & Dağıtım/);
});

runTest('Marketing bootstrap and lazy dependencies carry current content hashes', () => {
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const uiSource = fs.readFileSync(path.join(__dirname, 'marketing_ui.js'), 'utf8');
  const hash = file => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 8);
  assert.match(index, new RegExp(`core/marketing_ui\\.js\\?v=${hash(path.join(__dirname, 'marketing_ui.js'))}`));
  ['marketing_engine.js', 'marketing_funnel_service.js', 'marketing_priority_service.js', 'marketing_data_service.js', 'marketing_review_service.js', 'marketing_snapshot_service.js'].forEach(file => {
    assert.match(uiSource, new RegExp(`${file.replace('.', '\\.') }\\?v=${hash(path.join(__dirname, file))}`));
  });
});

console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
if (passedTests !== totalTests) process.exit(1);
