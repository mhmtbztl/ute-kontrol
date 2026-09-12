const assert = require('assert');
const { evaluateListingChange } = require('./marketing_impact_service');

let total = 0;
let passed = 0;
function test(name, fn) {
  total += 1;
  try { fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

const base = {
  changeDate: '2026-08-15',
  asOfDate: '2026-09-01',
  metric: 'SEARCH_TO_VIEW_CTR_PERCENT',
  before: { startDate: '2026-08-01', endDateExclusive: '2026-08-15', impressions: 1000, listingViews: 50, averageDisplayedPrice: 5000 },
  after: { startDate: '2026-08-15', endDateExclusive: '2026-08-29', impressions: 1000, listingViews: 90, averageDisplayedPrice: 5100 }
};

test('Strong CTR uplift is reported as an association, never a causal claim', () => {
  const result = evaluateListingChange(base);
  assert.strictEqual(result.verdict, 'POSITIVE_ASSOCIATION');
  assert.strictEqual(result.causalClaim, false);
  assert.strictEqual(result.comparison.relativeDeltaPercent, 80);
});

test('Strong CTR deterioration is detected', () => {
  const result = evaluateListingChange({ ...base, before: { ...base.before, listingViews: 100 }, after: { ...base.after, listingViews: 50 } });
  assert.strictEqual(result.verdict, 'NEGATIVE_ASSOCIATION');
});

test('Small samples remain insufficient even with a large percentage change', () => {
  const result = evaluateListingChange({ ...base, before: { ...base.before, impressions: 299, listingViews: 10 } });
  assert.strictEqual(result.verdict, 'INSUFFICIENT_DATA');
  assert(result.insufficiencies.includes('BEFORE_SAMPLE_TOO_SMALL'));
});

test('Both windows must contain at least fourteen days', () => {
  const result = evaluateListingChange({ ...base, after: { ...base.after, endDateExclusive: '2026-08-20' } });
  assert.strictEqual(result.verdict, 'INSUFFICIENT_DATA');
  assert(result.insufficiencies.includes('MINIMUM_WINDOW_NOT_REACHED'));
});

test('The after window must be complete as of the evaluation date', () => {
  const result = evaluateListingChange({ ...base, asOfDate: '2026-08-20' });
  assert.strictEqual(result.verdict, 'INSUFFICIENT_DATA');
  assert(result.insufficiencies.includes('AFTER_WINDOW_NOT_COMPLETE'));
});

test('Calendar-invalid dates are rejected instead of normalized', () => {
  assert.throws(() => evaluateListingChange({ ...base, changeDate: '2026-02-30' }), /INVALID_IMPACT_WINDOW/);
});

test('A price movement above fifteen percent marks the result confounded', () => {
  const result = evaluateListingChange({ ...base, after: { ...base.after, averageDisplayedPrice: 6000 } });
  assert.strictEqual(result.verdict, 'CONFOUNDED');
  assert(result.confounders.includes('PRICE_DRIFT_EXCEEDS_LIMIT'));
});

test('Explicit seasonal or campaign changes remain visible as confounders', () => {
  const result = evaluateListingChange({ ...base, confounders: ['SEASON_TRANSITION'] });
  assert.strictEqual(result.verdict, 'CONFOUNDED');
  assert.deepStrictEqual(result.confounders, ['SEASON_TRANSITION']);
});

test('No statistical evidence is not presented as neutral proof', () => {
  const result = evaluateListingChange({ ...base, after: { ...base.after, listingViews: 52 } });
  assert.strictEqual(result.verdict, 'NO_CLEAR_CHANGE');
  assert.strictEqual(result.confidenceTier, 'LOW');
});

test('A zero baseline produces no invented relative delta', () => {
  const result = evaluateListingChange({ ...base, before: { ...base.before, listingViews: 0 }, after: { ...base.after, listingViews: 20 } });
  assert.strictEqual(result.comparison.relativeDeltaPercent, null);
  assert.strictEqual(result.verdict, 'NO_CLEAR_CHANGE');
});

test('Invalid funnel ordering is rejected as insufficient evidence', () => {
  const result = evaluateListingChange({ ...base, before: { ...base.before, listingViews: 1001 } });
  assert.strictEqual(result.verdict, 'INSUFFICIENT_DATA');
  assert(result.insufficiencies.includes('BEFORE_FUNNEL_ORDER_INVALID'));
});

test('Null counters remain missing instead of becoming numeric zero', () => {
  const result = evaluateListingChange({ ...base, before: { ...base.before, impressions: null } });
  assert.strictEqual(result.verdict, 'INSUFFICIENT_DATA');
  assert(result.insufficiencies.includes('COUNTERS_MISSING_OR_INVALID'));
});

test('Windows may not cross the recorded change date', () => {
  assert.throws(() => evaluateListingChange({ ...base, before: { ...base.before, endDateExclusive: '2026-08-16' } }), /OVERLAP_CHANGE/);
});

test('Conversion evaluation uses listing views as its sample denominator', () => {
  const result = evaluateListingChange({
    ...base,
    metric: 'VIEW_TO_BOOKING_CONVERSION_PERCENT',
    before: { ...base.before, listingViews: 500, platformReportedBookings: 10 },
    after: { ...base.after, listingViews: 500, platformReportedBookings: 30 }
  });
  assert.strictEqual(result.verdict, 'POSITIVE_ASSOCIATION');
  assert.strictEqual(result.comparison.beforePercent, 2);
  assert.strictEqual(result.comparison.afterPercent, 6);
});

console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
if (passed !== total) process.exit(1);
