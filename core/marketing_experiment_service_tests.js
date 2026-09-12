const assert = require('assert');
const fs = require('fs');
const path = require('path');
const service = require('./marketing_experiment_service');

const TENANT = '11111111-1111-4111-8111-111111111111';
const PROPERTY = '22222222-2222-4222-8222-222222222222';
const LISTING = '33333333-3333-4333-8333-333333333333';
const OLD_MEDIA = '44444444-4444-4444-8444-444444444444';
const NEW_MEDIA = '55555555-5555-4555-8555-555555555555';
let total = 0;
let passed = 0;

async function test(name, fn) {
  total += 1;
  try { await fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

const valid = {
  tenantId: TENANT, propertyId: PROPERTY, channelListingId: LISTING,
  changeType: 'COVER_MEDIA', changeDate: '2026-08-15',
  beforeStartDate: '2026-08-01', beforeEndExclusive: '2026-08-15',
  afterStartDate: '2026-08-15', afterEndExclusive: '2026-08-29',
  primaryMetric: 'SEARCH_TO_VIEW_CTR_PERCENT', oldMediaId: OLD_MEDIA, newMediaId: NEW_MEDIA
};

(async () => {
  await test('Valid requests preserve an explicitly observational contract', async () => {
    const calls = [];
    const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: LISTING }; } };
    const result = await service.requestEvaluation(client, valid);
    assert.strictEqual(calls[0].name, 'request_listing_change_evaluation');
    assert.strictEqual(calls[0].args.p_before_end_exclusive, '2026-08-15');
    assert.deepStrictEqual(result, { experimentId: LISTING, method: 'BEFORE_AFTER_OBSERVATIONAL', causalClaim: false });
  });

  await test('Both evidence windows must cover at least fourteen days', () => {
    assert.throws(() => service.validateRequest({ ...valid, beforeStartDate: '2026-08-02' }), /MINIMUM_14_DAY_WINDOW_REQUIRED/);
    assert.throws(() => service.validateRequest({ ...valid, afterEndExclusive: '2026-08-28' }), /MINIMUM_14_DAY_WINDOW_REQUIRED/);
  });

  await test('Evidence windows cannot cross the recorded change date', () => {
    assert.throws(() => service.validateRequest({ ...valid, beforeEndExclusive: '2026-08-16' }), /OVERLAP_CHANGE/);
    assert.throws(() => service.validateRequest({ ...valid, afterStartDate: '2026-08-14' }), /OVERLAP_CHANGE/);
  });

  await test('Cover changes require two distinct media records', () => {
    assert.throws(() => service.validateRequest({ ...valid, newMediaId: OLD_MEDIA }), /DISTINCT_COVER_MEDIA_REQUIRED/);
    assert.throws(() => service.validateRequest({ ...valid, newMediaId: null }), /DISTINCT_COVER_MEDIA_REQUIRED/);
  });

  await test('Unsupported change types and metrics never reach the RPC', () => {
    assert.throws(() => service.validateRequest({ ...valid, changeType: 'MAGIC' }), /INVALID_CHANGE_TYPE/);
    assert.throws(() => service.validateRequest({ ...valid, primaryMetric: 'REVENUE' }), /INVALID_PRIMARY_METRIC/);
  });

  await test('The replacement RPC serializes and reuses an identical active request', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase17_change_impact_idempotency.sql'), 'utf8');
    assert.match(sql, /pg_advisory_xact_lock/i);
    assert.match(sql, /old_media_id IS NOT DISTINCT FROM p_old_media_id/i);
    assert.match(sql, /status IN \('COLLECTING', 'READY', 'PROCESSING'\)/i);
    assert.match(sql, /IF v_experiment_id IS NOT NULL THEN RETURN v_experiment_id/i);
  });

  await test('RPC errors and malformed identifiers are surfaced', async () => {
    await assert.rejects(() => service.requestEvaluation({ rpc: async () => ({ error: new Error('denied') }) }, valid), /denied/);
    await assert.rejects(() => service.requestEvaluation({ rpc: async () => ({ data: 'bad' }) }, valid), /INVALID_EXPERIMENT_ID/);
  });

  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  if (passed !== total) process.exit(1);
})();
