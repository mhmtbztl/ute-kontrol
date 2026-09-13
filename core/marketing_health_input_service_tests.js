const assert = require('assert');
const service = require('./marketing_health_input_service');

let total = 0;
let passed = 0;
function test(name, fn) { total += 1; try { fn(); passed += 1; console.log(`[PASS] ${name}`); } catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); } }

const base = {
  id: 'input-1', component_key: 'CLICK_PERFORMANCE', measurement_kind: 'RATIO',
  status: 'AVAILABLE', observed_value: 4, reference_value: 5, sample_size: 1000,
  min_sample_size: 500, confidence: null, source_kind: 'CHANNEL_SNAPSHOT',
  as_of: '2026-09-10T00:00:00Z', expires_at: '2026-10-10T00:00:00Z', evidence: { listingId: 'L1' }
};

test('Ratio inputs are recomputed by the health engine', () => {
  const result = service.componentFromInput(base);
  assert.strictEqual(result.status, 'AVAILABLE');
  assert.strictEqual(result.score, 80);
  assert.strictEqual(result.confidence, 0.5);
  assert.strictEqual(result.evidence.provenance.inputId, 'input-1');
});
test('Direct photo scores and net economics use dedicated contracts', () => {
  assert.strictEqual(service.componentFromInput({ ...base, component_key: 'PHOTO_QUALITY', measurement_kind: 'DIRECT_SCORE', observed_value: 88, confidence: 0.9 }).score, 88);
  assert.strictEqual(service.componentFromInput({ ...base, component_key: 'NET_ECONOMICS', measurement_kind: 'NET_ECONOMICS', observed_value: 8200, reference_value: 10000, sample_size: 3 }).score, 82);
});
test('A component cannot masquerade as another measurement kind', () => {
  assert.throws(() => service.componentFromInput({ ...base, component_key: 'PHOTO_QUALITY' }), /KIND_MISMATCH/);
});
test('Unavailable source input remains explicitly unavailable', () => {
  const result = service.componentFromInput({ ...base, status: 'UNAVAILABLE', reason: 'BENCHMARK_MISSING' });
  assert.strictEqual(result.status, 'UNAVAILABLE');
  assert.strictEqual(result.score, null);
});
test('Newest non-expired input wins and future or expired values are ignored', () => {
  const selected = service.latestInputsByComponent([
    base,
    { ...base, id: 'future', as_of: '2026-10-01T00:00:00Z' },
    { ...base, id: 'expired', as_of: '2026-09-11T00:00:00Z', expires_at: '2026-09-12T00:00:00Z' }
  ], '2026-09-20T00:00:00Z');
  assert.strictEqual(selected.get('CLICK_PERFORMANCE').id, 'input-1');
});
test('Missing components are never imputed', () => {
  const result = service.buildComponents([base], '2026-09-20T00:00:00Z');
  assert.strictEqual(result.components.CLICK_PERFORMANCE.status, 'AVAILABLE');
  assert.strictEqual(result.components.REVIEW_STRENGTH.status, 'UNAVAILABLE');
  assert.strictEqual(result.components.REVIEW_STRENGTH.score, null);
  assert.deepStrictEqual(result.sourceInputIds, ['input-1']);
});

console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
if (passed !== total) process.exit(1);
