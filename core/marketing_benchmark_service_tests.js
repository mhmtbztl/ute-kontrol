const assert = require('assert');
const service = require('./marketing_benchmark_service');
const fs = require('fs');
const path = require('path');
let total = 0; let passed = 0;
async function test(name, fn) { total += 1; try { await fn(); passed += 1; console.log(`[PASS] ${name}`); } catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); } }
const valid = {
  tenantId: '11111111-1111-4111-8111-111111111111', propertyId: '22222222-2222-4222-8222-222222222222',
  sourceKind: 'MANUAL_RESEARCH', sourceRecordId: 'report-2026-09', effectiveFrom: '2026-09-01',
  effectiveToExclusive: '2026-10-01', searchToViewCtrPercent: 5.5,
  viewToBookingConversionPercent: 3, normalizedImpressionsPerListingDay: 120,
  recommendedActiveMediaCount: 24, maxDistributionCostPercent: 14,
  minimumDirectReservationSharePercent: 20, confidence: 0.8, evidence: { note: 'documented sample' }
};
(async () => {
  await test('A complete source-attributed benchmark validates without defaults', () => {
    assert.deepStrictEqual(service.validate(valid), valid);
  });
  await test('At least one positive benchmark value is required', () => {
    assert.throws(() => service.validate({ ...valid, searchToViewCtrPercent: null, viewToBookingConversionPercent: null, normalizedImpressionsPerListingDay: null, recommendedActiveMediaCount: null, maxDistributionCostPercent: null, minimumDirectReservationSharePercent: null }), /AT_LEAST_ONE/);
    assert.throws(() => service.validate({ ...valid, searchToViewCtrPercent: -1 }), /INVALID_SEARCH/);
    assert.throws(() => service.validate({ ...valid, maxDistributionCostPercent: 101 }), /INVALID_MAX_DISTRIBUTION/);
  });
  await test('Source, confidence and effective dates are constrained', () => {
    assert.throws(() => service.validate({ ...valid, sourceKind: 'GUESS' }), /SOURCE_KIND/);
    assert.throws(() => service.validate({ ...valid, confidence: 1.1 }), /CONFIDENCE/);
    assert.throws(() => service.validate({ ...valid, effectiveToExclusive: '2026-08-01' }), /WINDOW/);
  });
  await test('Equivalent benchmark content has a deterministic fingerprint', async () => {
    const normalized = service.validate(valid);
    assert.strictEqual(await service.fingerprint(normalized), await service.fingerprint({ ...normalized, evidence: { note: 'documented sample' } }));
    assert.match(await service.fingerprint(normalized), /^[0-9a-f]{64}$/);
  });
  await test('Recording uses only the guarded benchmark RPC', async () => {
    const calls = [];
    const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: '33333333-3333-4333-8333-333333333333' }; } };
    const result = await service.recordBenchmark(client, valid);
    assert.strictEqual(calls[0].name, 'record_property_marketing_benchmark');
    assert.strictEqual(calls[0].args.p_recommended_active_media_count, 24);
    assert.strictEqual(calls[0].args.p_max_distribution_cost_percent, 14);
    assert.strictEqual(calls[0].args.p_minimum_direct_reservation_share_percent, 20);
    assert.match(result.benchmarkFingerprint, /^[0-9a-f]{64}$/);
  });
  await test('Benchmark schema is immutable and manager-scoped', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase17_health_benchmarks.sql'), 'utf8');
    assert.match(sql, /COALESCE\(public\.get_tenant_role\(p_tenant_id\), ''\) NOT IN \('owner', 'admin', 'manager'\)/i);
    assert.match(sql, /pg_advisory_xact_lock/i);
    assert.match(sql, /max_distribution_cost_percent[\s\S]+minimum_direct_reservation_share_percent/i);
    assert.match(sql, /DROP FUNCTION IF EXISTS public\.record_property_marketing_benchmark/i);
    assert.match(sql, /Members view property marketing benchmarks[\s\S]*FOR SELECT/i);
    assert.doesNotMatch(sql, /CREATE POLICY[^;]+property_marketing_benchmarks[^;]+FOR (?:ALL|INSERT|UPDATE|DELETE)/is);
  });
  await test('RPC errors and malformed ids remain visible', async () => {
    await assert.rejects(() => service.recordBenchmark({ rpc: async () => ({ error: new Error('denied') }) }, valid), /denied/);
    await assert.rejects(() => service.recordBenchmark({ rpc: async () => ({ data: 'bad' }) }, valid), /INVALID_BENCHMARK_ID/);
  });
  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  if (passed !== total) process.exit(1);
})();
