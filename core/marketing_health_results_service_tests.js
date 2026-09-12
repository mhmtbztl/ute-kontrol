const assert = require('assert');
const service = require('./marketing_health_results_service');

let total = 0;
let passed = 0;
function test(name, fn) {
  total += 1;
  try { fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

const PROPERTY = '22222222-2222-4222-8222-222222222222';
const valid = overrides => ({
  id: 'snapshot-new', property_id: PROPERTY, as_of: '2026-09-13T08:00:00Z',
  generated_at: '2026-09-13T08:01:00Z', scoring_version: 'health-v1',
  status: 'REPORTABLE', score: 82.5, coverage_percent: 75,
  confidence_index: 0.73, confidence_tier: 'MEDIUM', components: [],
  missing_components: [{ key: 'LISTING_DEPTH', reason: 'NOT_PROVIDED' }],
  scoring_method: 'RENORMALIZED_AVAILABLE_COMPONENTS', missing_data_imputed: false,
  ...overrides
});

test('Newest property snapshot is selected independently of input order', () => {
  const selected = service.latestForProperty([
    valid({ id: 'new' }), valid({ id: 'old', as_of: '2026-09-12T08:00:00Z' }),
    valid({ id: 'other', property_id: 'other-property', as_of: '2026-09-14T08:00:00Z' })
  ], PROPERTY);
  assert.strictEqual(selected.id, 'new');
});

test('A reportable immutable snapshot exposes its recorded score and provenance', () => {
  const view = service.buildHealthView({ propertyId: PROPERTY, snapshots: [valid()] });
  assert.strictEqual(view.available, true);
  assert.strictEqual(view.score, 82.5);
  assert.strictEqual(view.coveragePercent, 75);
  assert.strictEqual(view.scoringVersion, 'health-v1');
  assert.deepStrictEqual(view.missingComponents, [{ key: 'LISTING_DEPTH', reason: 'NOT_PROVIDED' }]);
});

test('Insufficient data stays scoreless and explains coverage', () => {
  const view = service.buildHealthView({ propertyId: PROPERTY, snapshots: [valid({
    status: 'INSUFFICIENT_DATA', score: null, coverage_percent: 35,
    confidence_index: 0.3, confidence_tier: 'INSUFFICIENT'
  })] });
  assert.strictEqual(view.available, false);
  assert.strictEqual(view.reason, 'INSUFFICIENT_DATA');
  assert.strictEqual(view.coveragePercent, 35);
});

test('Imputed data and inconsistent reportability are rejected', () => {
  assert.strictEqual(service.buildHealthView({ propertyId: PROPERTY, snapshots: [valid({ missing_data_imputed: true })] }).reason, 'INVALID_SNAPSHOT');
  assert.strictEqual(service.buildHealthView({ propertyId: PROPERTY, snapshots: [valid({ coverage_percent: 40 })] }).reason, 'INVALID_SNAPSHOT');
  assert.strictEqual(service.buildHealthView({ propertyId: PROPERTY, snapshots: [valid({ status: 'INSUFFICIENT_DATA', score: 70 })] }).reason, 'INVALID_SNAPSHOT');
});

test('Missing property scope or snapshot never creates a fallback score', () => {
  assert.deepStrictEqual(service.buildHealthView({ snapshots: [valid()] }), {
    available: false, reason: 'PROPERTY_REQUIRED', snapshotId: null, asOf: null
  });
  assert.strictEqual(service.buildHealthView({ propertyId: PROPERTY, snapshots: [] }).reason, 'NO_SNAPSHOT');
});

console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
if (passed !== total) process.exit(1);
