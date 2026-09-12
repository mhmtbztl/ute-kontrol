const assert = require('assert');
const service = require('./marketing_health_worker_service');

let total = 0;
let passed = 0;
async function test(name, fn) { total += 1; try { await fn(); passed += 1; console.log(`[PASS] ${name}`); } catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); } }

const scope = { tenantId: 'T1', propertyId: 'P1' };
function input(id, component, kind, observed, reference, sample, min, confidence = 1) {
  return { id, component_key: component, measurement_kind: kind, status: 'AVAILABLE', observed_value: observed,
    reference_value: reference, sample_size: sample, min_sample_size: min, confidence,
    source_kind: 'TEST', as_of: '2026-09-01T00:00:00Z', evidence: {} };
}
const inputs = [
  input('I1', 'PHOTO_QUALITY', 'DIRECT_SCORE', 80, null, 1, null, 0.9),
  input('I2', 'CLICK_PERFORMANCE', 'RATIO', 4, 5, 1000, 500),
  input('I3', 'CONVERSION_POWER', 'RATIO', 3, 4, 100, 50),
  input('I4', 'NET_ECONOMICS', 'NET_ECONOMICS', 8200, 10000, 3, null)
];
function repository(overrides = {}) {
  const persisted = [];
  return {
    persisted,
    async loadCandidateProperties() { return [scope]; },
    async loadCurrentInputs() { return inputs; },
    async persistSnapshot(value) { persisted.push(value); return 'S1'; },
    ...overrides
  };
}

(async () => {
  await test('Enough trusted component weight creates an immutable reportable snapshot', async () => {
    const repo = repository();
    const result = await service.evaluateProperty(repo, scope, { asOf: '2026-09-20T00:00:00Z' });
    assert.strictEqual(result.status, 'PERSISTED');
    assert.strictEqual(result.healthStatus, 'REPORTABLE');
    assert.strictEqual(repo.persisted[0].sourceInputIds.length, 4);
    assert.match(repo.persisted[0].inputFingerprint, /^[0-9a-f]{64}$/);
    assert.strictEqual(repo.persisted[0].result.missingDataImputed, false);
  });
  await test('The same source set produces the same idempotency fingerprint', async () => {
    const first = repository(); const second = repository();
    await service.evaluateProperty(first, scope, { asOf: '2026-09-20T00:00:00Z' });
    await service.evaluateProperty(second, scope, { asOf: '2026-09-21T00:00:00Z' });
    assert.strictEqual(first.persisted[0].inputFingerprint, second.persisted[0].inputFingerprint);
  });
  await test('No current input skips snapshot creation', async () => {
    const repo = repository({ async loadCurrentInputs() { return []; } });
    const result = await service.evaluateProperty(repo, scope, { asOf: '2026-09-20T00:00:00Z' });
    assert.strictEqual(result.status, 'SKIPPED');
    assert.strictEqual(repo.persisted.length, 0);
  });
  await test('One property failure does not abort the batch', async () => {
    const repo = repository({
      async loadCandidateProperties() { return [scope, { tenantId: 'T1', propertyId: 'P2' }]; },
      async loadCurrentInputs(tenantId, propertyId) { if (propertyId === 'P2') throw new Error('read failed'); return inputs; }
    });
    const result = await service.runHealthSnapshots(repo, { asOf: '2026-09-20T00:00:00Z' });
    assert.strictEqual(result.status, 'PARTIAL');
    assert.strictEqual(result.persisted, 1);
    assert.strictEqual(result.errors.length, 1);
  });
  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  if (passed !== total) process.exit(1);
})();
