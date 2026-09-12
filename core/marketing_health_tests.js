const assert = require('assert');
const service = require('./marketing_health_service');

let total = 0;
let passed = 0;
function test(name, fn) {
  total += 1;
  try { fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

test('Eight component weights are explicit and sum to one hundred', () => {
  assert.strictEqual(Object.keys(service.COMPONENT_WEIGHTS).length, 8);
  assert.strictEqual(Object.values(service.COMPONENT_WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test('Missing components remain unavailable and are never assigned neutral 70', () => {
  const result = service.evaluateMarketingHealth({
    PHOTO_QUALITY: service.available(80, 0.9),
    CLICK_PERFORMANCE: service.unavailable('SAMPLE_TOO_SMALL')
  });
  assert.strictEqual(result.status, 'INSUFFICIENT_DATA');
  assert.strictEqual(result.score, null);
  assert.strictEqual(result.missingDataImputed, false);
  assert.strictEqual(result.components.find(row => row.key === 'CLICK_PERFORMANCE').score, null);
});

test('Reportable scores renormalize only across available evidence', () => {
  const result = service.evaluateMarketingHealth({
    PHOTO_QUALITY: service.available(80, 1),
    CLICK_PERFORMANCE: service.available(60, 1),
    CONVERSION_POWER: service.available(70, 1),
    NET_ECONOMICS: service.available(90, 1)
  });
  assert.strictEqual(result.availableWeight, 60);
  assert.strictEqual(result.coveragePercent, 60);
  assert.strictEqual(result.score, 74.17);
  assert.strictEqual(result.status, 'REPORTABLE');
});

test('Coverage and confidence are separate gates', () => {
  const components = Object.fromEntries(Object.keys(service.COMPONENT_WEIGHTS).map(key => [key, service.available(80, 0.4)]));
  const result = service.evaluateMarketingHealth(components);
  assert.strictEqual(result.coveragePercent, 100);
  assert.strictEqual(result.confidenceTier, 'INSUFFICIENT');
  assert.strictEqual(result.status, 'INSUFFICIENT_DATA');
  assert.strictEqual(result.score, null);
});

test('Ratio components enforce their own sample threshold', () => {
  const weak = service.ratioComponent({ value: 4, reference: 5, sampleSize: 499, minSampleSize: 500 });
  const ready = service.ratioComponent({ value: 4, reference: 5, sampleSize: 500, minSampleSize: 500 });
  assert.strictEqual(weak.status, 'UNAVAILABLE');
  assert.strictEqual(ready.status, 'AVAILABLE');
  assert.strictEqual(ready.score, 80);
});

test('A missing benchmark cannot create a click or visibility score', () => {
  const component = service.ratioComponent({ value: 4, reference: null, sampleSize: 1000, minSampleSize: 500 });
  assert.strictEqual(component.status, 'UNAVAILABLE');
  assert.strictEqual(component.reason, 'REFERENCE_MISSING');
});

test('Ratio scores are capped rather than rewarding unbounded benchmark outperformance', () => {
  const component = service.ratioComponent({ value: 20, reference: 5, sampleSize: 2000, minSampleSize: 500 });
  assert.strictEqual(component.score, 100);
});

test('Net economics uses room revenue after recorded distribution cost', () => {
  const component = service.netEconomicsComponent({
    roomRevenueBeforeDistribution: 10000,
    roomRevenueAfterDistribution: 8200,
    completedBookings: 3
  });
  assert.strictEqual(component.score, 82);
  assert.strictEqual(component.evidence.metricDefinition, 'ROOM_REVENUE_AFTER_DISTRIBUTION_RETENTION');
});

test('Net economics is unavailable below the completed-booking threshold', () => {
  const component = service.netEconomicsComponent({ roomRevenueBeforeDistribution: 10000, roomRevenueAfterDistribution: 9000, completedBookings: 1 });
  assert.strictEqual(component.status, 'UNAVAILABLE');
});

test('Invalid component score and confidence ranges fail loudly', () => {
  assert.throws(() => service.available(101, 1), /SCORE_OUT_OF_RANGE/);
  assert.throws(() => service.available(80, 1.1), /CONFIDENCE_OUT_OF_RANGE/);
});

console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
if (passed !== total) process.exit(1);
