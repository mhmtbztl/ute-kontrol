const assert = require('assert'); const { createRepository } = require('./marketing_economics_worker_repository');
let total = 0; let passed = 0; async function test(name, fn) { total += 1; try { await fn(); passed += 1; console.log(`[PASS] ${name}`); } catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); } }
function client() {
  const calls = [];
  return { calls, from(table) { const call = { table, filters: [] }; calls.push(call); const builder = {
    select(columns) { call.columns = columns; return builder; }, eq(column, value) { call.filters.push(['eq', column, value]); return builder; },
    lt(column, value) { call.filters.push(['lt', column, value]); return builder; }, gt(column, value) { call.filters.push(['gt', column, value]); return builder; },
    lte(column, value) { call.filters.push(['lte', column, value]); return builder; }, or(value) { call.or = value; return builder; },
    order(column, options) { call.order = [column, options]; return builder; }, maybeSingle() { return Promise.resolve({ data: null }); },
    limit(value) { call.limit = value; return Promise.resolve({ data: [] }); }
  }; return builder; }, async rpc(name, args) { calls.push({ rpc: name, args }); return { data: 'F1' }; } };
}
(async () => {
  await test('Property discovery applies an optional tenant boundary', async () => { const db = client(); await createRepository(db).loadPropertyScopes('T1', 25); assert.deepStrictEqual(db.calls[0].filters, [['eq', 'tenant_id', 'T1']]); assert.strictEqual(db.calls[0].limit, 25); });
  await test('Booking evidence is tenant, property and overlapping-window scoped', async () => { const db = client(); await createRepository(db).loadBookings('T1', 'P1', '2026-06-01', '2026-09-01'); assert.deepStrictEqual(db.calls[0].filters, [['eq', 'tenant_id', 'T1'], ['eq', 'property_id', 'P1'], ['lt', 'check_in', '2026-09-01'], ['gt', 'check_out', '2026-06-01']]); assert.match(db.calls[0].columns, /ota_commission/); });
  await test('Findings persist only through the guarded upsert RPC', async () => { const db = client(); await createRepository(db).persistFinding({ tenantId: 'T1', propertyId: 'P1', channelListingId: null, findingFingerprint: 'f', sourceDomain: 'CHANNEL_ECONOMICS', findingCode: 'C', metric: 'M', title: 'T', evidenceText: 'E', observation: {}, hypotheses: [], recommendedChecks: [], recommendedAction: 'R', actionKind: 'DIGITAL_REVIEW', confidenceTier: 'HIGH', impactScore: 1, urgencyScore: 1, revenueOpportunityAmount: null, currency: 'TRY', evidencePeriodStart: '2026-06-01', evidencePeriodEndExclusive: '2026-09-01', expiresAt: null }); assert.strictEqual(db.calls[0].rpc, 'upsert_marketing_finding'); assert.strictEqual(db.calls[0].args.p_source_domain, 'CHANNEL_ECONOMICS'); });
  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`); if (passed !== total) process.exit(1);
})();
