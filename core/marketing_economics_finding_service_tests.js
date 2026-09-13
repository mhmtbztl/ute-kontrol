const assert = require('assert');
const service = require('./marketing_economics_finding_service');
let total = 0; let passed = 0;
async function test(name, fn) { total += 1; try { await fn(); passed += 1; console.log(`[PASS] ${name}`); } catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); } }
const report = {
  totals: { reservationCount: 10, roomRevenueBeforeDistribution: 100000, distributionCost: 20000 },
  mix: { directReservationSharePercent: 10 }, dataQuality: { status: 'OK' }
};
(async () => {
  await test('Explicit references produce two observational findings', () => {
    const result = service.diagnose({ report, benchmark: { max_distribution_cost_percent: 15, minimum_direct_reservation_share_percent: 20 } });
    assert.strictEqual(result.status, 'FINDINGS'); assert.strictEqual(result.observations.length, 2);
    assert.strictEqual(result.observations[0].revenueOpportunityAmount, 5000);
    assert.strictEqual(result.observations[1].revenueOpportunityAmount, null);
  });
  await test('No benchmark values means no fabricated recommendation', () => {
    assert.deepStrictEqual(service.diagnose({ report, benchmark: {} }), { status: 'NO_VARIANCE', observations: [] });
  });
  await test('Small samples are rejected before comparisons', () => {
    const result = service.diagnose({ report: { ...report, totals: { ...report.totals, reservationCount: 4 } }, benchmark: { maxDistributionCostPercent: 15 } });
    assert.strictEqual(result.status, 'INSUFFICIENT_SAMPLE'); assert.strictEqual(result.observations.length, 0);
  });
  await test('Unknown channel mappings suppress direct-share finding only', () => {
    const result = service.diagnose({ report: { ...report, dataQuality: { status: 'NEEDS_REVIEW' } }, benchmark: { maxDistributionCostPercent: 15, minimumDirectReservationSharePercent: 20 } });
    assert.deepStrictEqual(result.observations.map(row => row.code), ['DISTRIBUTION_COST_ABOVE_REFERENCE']);
  });
  await test('Finding draft is stable, non-causal and property-scoped', async () => {
    const observation = service.diagnose({ report, benchmark: { maxDistributionCostPercent: 15 } }).observations[0];
    const input = { tenantId: 'T1', propertyId: 'P1', observation, periodStart: '2026-06-01', periodEndExclusive: '2026-09-01' };
    const first = await service.buildFindingDraft(input); const second = await service.buildFindingDraft(input);
    assert.strictEqual(first.findingFingerprint, second.findingFingerprint); assert.strictEqual(first.sourceDomain, 'CHANNEL_ECONOMICS');
    assert.strictEqual(first.channelListingId, null); assert.strictEqual(first.observation.causalClaim, false); assert.strictEqual(first.actionKind, 'DIGITAL_REVIEW');
  });
  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`); if (passed !== total) process.exit(1);
})();
