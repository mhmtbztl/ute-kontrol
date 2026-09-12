const assert = require('assert');
const service = require('./marketing_experiment_worker_service');

let total = 0;
let passed = 0;
async function test(name, fn) {
  total += 1;
  try { await fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

const experiment = {
  id: '33333333-3333-4333-8333-333333333333', tenant_id: '11111111-1111-4111-8111-111111111111',
  property_id: '22222222-2222-4222-8222-222222222222', channel_listing_id: '44444444-4444-4444-8444-444444444444',
  lease_token: '55555555-5555-4555-8555-555555555555', change_date: '2026-08-15',
  before_start_date: '2026-08-01', before_end_exclusive: '2026-08-15',
  after_start_date: '2026-08-15', after_end_exclusive: '2026-08-29',
  primary_metric: 'SEARCH_TO_VIEW_CTR_PERCENT', minimum_days_per_window: 14,
  minimum_sample_per_window: 300, max_price_drift_percent: 15
};
const snapshots = {
  '2026-08-01': { id: '66666666-6666-4666-8666-666666666666', impressions: 1000, listing_views: 50 },
  '2026-08-15': { id: '77777777-7777-4777-8777-777777777777', impressions: 1000, listing_views: 90 }
};

function repository(overrides = {}) {
  const calls = [];
  return {
    calls,
    async claimExperiment() { return experiment; },
    async loadWindowSnapshot(input) { calls.push(['load', input]); return snapshots[input.startDate] || null; },
    async completeExperiment(input) { calls.push(['complete', input]); return { status: 'EVALUATED' }; },
    async failExperiment(...args) { calls.push(['fail', ...args]); return { status: 'FAILED' }; },
    ...overrides
  };
}

(async () => {
  await test('A completed pair is evaluated as observational evidence', async () => {
    const repo = repository();
    const result = await service.runNextEvaluation(repo, { asOfDate: '2026-09-01' });
    assert.strictEqual(result.status, 'EVALUATED');
    assert.strictEqual(result.verdict, 'POSITIVE_ASSOCIATION');
    const completion = repo.calls.find(call => call[0] === 'complete')[1];
    assert.strictEqual(completion.resultPayload.causalClaim, false);
    assert.strictEqual(completion.beforeSnapshotId, snapshots['2026-08-01'].id);
    assert.strictEqual(completion.afterSnapshotId, snapshots['2026-08-15'].id);
  });

  await test('Missing exact snapshots produce explicit insufficient evidence, not zero counters', async () => {
    const repo = repository({ async loadWindowSnapshot() { return null; } });
    const result = await service.runNextEvaluation(repo, { asOfDate: '2026-09-01' });
    assert.strictEqual(result.status, 'EVALUATED');
    assert.strictEqual(result.verdict, 'INSUFFICIENT_DATA');
  });

  await test('An idle queue performs no writes', async () => {
    const repo = repository({ async claimExperiment() { return null; } });
    assert.deepStrictEqual(await service.runNextEvaluation(repo), { status: 'IDLE', experimentId: null });
    assert.deepStrictEqual(repo.calls, []);
  });

  await test('Evaluation failures are recorded against the lease', async () => {
    const repo = repository({ async loadWindowSnapshot() { throw new Error('database unavailable'); } });
    const result = await service.runNextEvaluation(repo, { asOfDate: '2026-09-01' });
    assert.strictEqual(result.status, 'FAILED');
    assert.match(result.errorCode, /DATABASE_UNAVAILABLE/);
    assert.strictEqual(repo.calls.find(call => call[0] === 'fail')[2], experiment.lease_token);
  });

  await test('A stale lease failure cannot hide the original failure', async () => {
    const repo = repository({
      async loadWindowSnapshot() { throw new Error('source failed'); },
      async failExperiment() { throw new Error('lease lost'); }
    });
    const result = await service.runNextEvaluation(repo, { asOfDate: '2026-09-01' });
    assert.strictEqual(result.status, 'FAILED_UNRECORDED');
    assert.match(result.failureRecordError, /LEASE_LOST/);
  });

  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  if (passed !== total) process.exit(1);
})();
