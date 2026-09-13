const assert = require('assert');
const {
  validateSnapshot,
  deriveFunnelMetrics,
  diagnoseFunnel
} = require('./marketing_funnel_service');

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

runTest('Complete valid counters report full coverage', () => {
  const result = validateSnapshot({ impressions: 1000, listing_views: 100, booking_attempts: 20, platform_reported_bookings: 5, wishlist_saves: 10 });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.status, 'VALID');
  assert.strictEqual(result.coveragePercent, 100);
});

runTest('Missing counters produce partial coverage, not zero values', () => {
  const result = validateSnapshot({ impressions: 1000, listing_views: 100 });
  assert.strictEqual(result.status, 'PARTIAL');
  assert.strictEqual(result.counters.platformReportedBookings, null);
  assert.strictEqual(result.coveragePercent, 40);
});

runTest('Negative and fractional counters are rejected', () => {
  assert.strictEqual(validateSnapshot({ impressions: -1 }).valid, false);
  assert.strictEqual(validateSnapshot({ impressions: 2.5 }).valid, false);
});

runTest('Impossible funnel ordering is rejected', () => {
  const result = validateSnapshot({ impressions: 100, listing_views: 101 });
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.errors[0].code, 'VIEWS_EXCEED_IMPRESSIONS');
});

runTest('Derived rates preserve a legitimate zero numerator', () => {
  const result = deriveFunnelMetrics({ impressions: 1000, listing_views: 0, platform_reported_bookings: 0 });
  assert.strictEqual(result.rates.searchToViewCtrPercent, 0);
  assert.strictEqual(result.rates.viewToBookingConversionPercent, null);
  assert.strictEqual(result.rates.searchToBookingConversionPercent, 0);
});

runTest('Invalid snapshots do not produce rates', () => {
  const result = deriveFunnelMetrics({ impressions: 10, listing_views: 20 });
  assert.strictEqual(result.rates, null);
});

runTest('Low CTR creates a non-causal click observation with evidence', () => {
  const result = diagnoseFunnel({
    snapshot: { impressions: 2500, listing_views: 100, platform_reported_bookings: 5 },
    benchmark: { searchToViewCtrPercent: 8, viewToBookingConversionPercent: 5 }
  });
  const click = result.observations.find(item => item.code === 'CLICK_RATE_BELOW_REFERENCE');
  assert(click);
  assert.strictEqual(click.observed, 4);
  assert.strictEqual(click.confidenceTier, 'HIGH');
  assert.strictEqual(click.causalClaim, false);
  assert(click.hypotheses.includes('Cover image'));
});

runTest('Small click samples are insufficient rather than diagnosed', () => {
  const result = diagnoseFunnel({
    snapshot: { impressions: 100, listing_views: 1 },
    benchmark: { searchToViewCtrPercent: 8 }
  });
  assert.strictEqual(result.observations.some(item => item.code === 'CLICK_RATE_BELOW_REFERENCE'), false);
  assert(result.insufficientSignals.some(item => item.code === 'CLICK_SAMPLE_TOO_SMALL'));
});

runTest('Low conversion creates a separate observation', () => {
  const result = diagnoseFunnel({
    snapshot: { impressions: 5000, listing_views: 500, platform_reported_bookings: 5 },
    benchmark: { searchToViewCtrPercent: 10, viewToBookingConversionPercent: 4 }
  });
  const conversion = result.observations.find(item => item.code === 'CONVERSION_RATE_BELOW_REFERENCE');
  assert(conversion);
  assert.strictEqual(conversion.observed, 1);
  assert.strictEqual(conversion.relativeDeltaPercent, -75);
});

runTest('Raw impressions alone never trigger a visibility diagnosis', () => {
  const result = diagnoseFunnel({
    snapshot: { impressions: 5000, listing_views: 500, platform_reported_bookings: 20 },
    benchmark: { searchToViewCtrPercent: 10, viewToBookingConversionPercent: 4 }
  });
  assert.strictEqual(result.observations.some(item => item.code === 'VISIBILITY_BELOW_REFERENCE'), false);
  assert(result.insufficientSignals.some(item => item.code === 'NORMALIZED_VISIBILITY_NOT_PROVIDED'));
});

runTest('Normalized visibility can produce an observation after the minimum window', () => {
  const result = diagnoseFunnel({
    snapshot: { impressions: 2500, listing_views: 250, platform_reported_bookings: 10 },
    benchmark: { searchToViewCtrPercent: 10, viewToBookingConversionPercent: 4 },
    normalizedVisibility: { metric: 'IMPRESSIONS_PER_OPEN_NIGHT', value: 40, reference: 80, sampleDays: 28 }
  });
  const visibility = result.observations.find(item => item.code === 'VISIBILITY_BELOW_REFERENCE');
  assert(visibility);
  assert.strictEqual(visibility.confidenceTier, 'HIGH');
  assert.strictEqual(visibility.causalClaim, false);
});

runTest('Invalid input blocks diagnosis', () => {
  const result = diagnoseFunnel({ snapshot: { impressions: 10, listing_views: 20 } });
  assert.strictEqual(result.status, 'INVALID_INPUT');
  assert.deepStrictEqual(result.observations, []);
});

console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
if (passedTests !== totalTests) process.exit(1);

