const assert = require('assert');
const Service = require('./marketing_snapshot_service');

let totalTests = 0;
let passedTests = 0;
async function runTest(name, fn) {
  totalTests += 1;
  try { await fn(); passedTests += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}`); console.error(`       ${error.stack || error.message}`); }
}
const TENANT = '11111111-1111-4111-8111-111111111111';
const LISTING = '22222222-2222-4222-8222-222222222222';
const base = { tenantId: TENANT, channelListingId: LISTING, periodStart: '2026-09-01', periodEndExclusive: '2026-10-01' };

(async () => {
  await runTest('Blank optional counters remain null rather than zero', () => {
    const result = Service.validateInput({ ...base, impressions: 1000, listingViews: '' });
    assert.strictEqual(result.counters.impressions, 1000);
    assert.strictEqual(result.counters.listingViews, null);
    assert.strictEqual(result.validation.status, 'PARTIAL');
  });
  await runTest('Calendar-invalid dates and empty snapshots are rejected', () => {
    assert.throws(() => Service.validateInput({ ...base, periodStart: '2026-02-30', impressions: 1 }), /INVALID_SNAPSHOT_PERIOD/);
    assert.throws(() => Service.validateInput(base), /AT_LEAST_ONE/);
  });
  await runTest('Impossible funnel ordering is rejected before RPC', () => {
    assert.throws(() => Service.validateInput({ ...base, impressions: 10, listingViews: 11 }), /INVALID_FUNNEL_ORDER/);
  });
  await runTest('Idempotency key is deterministic and changes with payload', async () => {
    const a = Service.validateInput({ ...base, impressions: 100 });
    const b = Service.validateInput({ ...base, impressions: 101 });
    assert.strictEqual(await Service.buildIdempotencyKey(a), await Service.buildIdempotencyKey(a));
    assert.notStrictEqual(await Service.buildIdempotencyKey(a), await Service.buildIdempotencyKey(b));
  });
  await runTest('The client sends one RPC with explicit nulls and exclusive end date', async () => {
    const calls = [];
    const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { reused: false }, error: null }; } };
    await Service.recordManualSnapshot(client, { ...base, impressions: '1000', listingViews: '75', wishlistSaves: '' });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].name, 'record_manual_channel_snapshot');
    assert.strictEqual(calls[0].args.p_period_end_exclusive, '2026-10-01');
    assert.strictEqual(calls[0].args.p_booking_attempts, null);
    assert.match(calls[0].args.p_idempotency_key, /^manual-v1:[0-9a-f]{64}$/);
  });
  await runTest('Backend errors are preserved for UI handling', async () => {
    const error = Object.assign(new Error('UNAUTHORIZED_MARKETING_SNAPSHOT'), { code: '42501' });
    await assert.rejects(() => Service.recordManualSnapshot({ rpc: async () => ({ error }) }, { ...base, impressions: 1 }), value => value === error);
  });

  console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  if (passedTests !== totalTests) process.exit(1);
})();
