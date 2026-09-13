const assert = require('assert');
const service = require('./marketing_finding_orchestrator');

let total = 0;
let passed = 0;
async function test(name, fn) {
  total += 1;
  try { await fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

const scope = { tenantId: 'T1', propertyId: 'P1', channelListingId: 'L1', periodStart: '2026-08-01', periodEndExclusive: '2026-09-01' };
const click = {
  type: 'OBSERVATION', code: 'CLICK_RATE_BELOW_REFERENCE', metric: 'SEARCH_TO_VIEW_CTR_PERCENT',
  observed: 4, reference: 8, relativeDeltaPercent: -50, sampleSize: 1000,
  confidenceTier: 'MEDIUM', causalClaim: false,
  hypotheses: ['Cover image'], recommendedChecks: ['Review mobile thumbnail']
};

(async () => {
  await test('Repeated observations keep one stable active finding identity', async () => {
    const first = await service.buildFunnelFindingDraft({ ...scope, observation: click });
    const later = await service.buildFunnelFindingDraft({ ...scope, periodStart: '2026-09-01', periodEndExclusive: '2026-10-01', observation: { ...click, observed: 3 } });
    assert.strictEqual(first.findingFingerprint, later.findingFingerprint);
    assert.notStrictEqual(first.evidenceText, later.evidenceText);
  });

  await test('Finding evidence states that the observation is not causal', async () => {
    const draft = await service.buildFunnelFindingDraft({ ...scope, observation: click });
    assert.strictEqual(draft.observation.causalClaim, false);
    assert.match(draft.evidenceText, /neden kanıtı değildir/);
    assert.strictEqual(draft.actionKind, 'CONTENT_UPDATE');
  });

  await test('Only known diagnostic observations can create findings', async () => {
    await assert.rejects(() => service.buildFunnelFindingDraft({ ...scope, observation: { ...click, code: 'UNKNOWN' } }), /UNSUPPORTED_FUNNEL_OBSERVATION/);
  });

  await test('Persistence uses only the guarded upsert RPC', async () => {
    const draft = await service.buildFunnelFindingDraft({ ...scope, observation: click });
    const calls = [];
    const id = await service.persistFinding({ rpc: async (name, args) => { calls.push({ name, args }); return { data: 'F1' }; } }, draft);
    assert.strictEqual(id, 'F1');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].name, 'upsert_marketing_finding');
    assert.strictEqual(calls[0].args.p_finding_fingerprint, draft.findingFingerprint);
  });

  await test('Insufficient funnel evidence persists no finding', async () => {
    const calls = [];
    const result = await service.diagnoseAndPersist({ rpc: async (...args) => { calls.push(args); return { data: 'F1' }; } }, {
      ...scope, snapshot: { impressions: 100, listing_views: 4 },
      benchmark: { searchToViewCtrPercent: 8 }
    });
    assert.strictEqual(result.diagnosis.status, 'LIMITED_DATA');
    assert.deepStrictEqual(result.findings, []);
    assert.strictEqual(calls.length, 0);
  });

  await test('Eligible funnel observations are persisted and RPC errors stop the run', async () => {
    const input = {
      ...scope, snapshot: { impressions: 1000, listing_views: 40 },
      benchmark: { searchToViewCtrPercent: 8 }
    };
    const ok = await service.diagnoseAndPersist({ rpc: async () => ({ data: 'F1' }) }, input);
    assert.strictEqual(ok.findings.length, 1);
    assert.strictEqual(ok.findings[0].draft.findingCode, 'CLICK_RATE_BELOW_REFERENCE');
    await assert.rejects(() => service.diagnoseAndPersist({ rpc: async () => ({ error: new Error('write failed') }) }, input), /write failed/);
  });

  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  if (passed !== total) process.exit(1);
})();
