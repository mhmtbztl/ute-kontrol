const assert = require('assert');
const RequestService = require('./marketing_photo_analysis_service');
const Worker = require('./photo_analysis_worker_service');

const TENANT = '11111111-1111-4111-8111-111111111111';
const PROPERTY = '22222222-2222-4222-8222-222222222222';
const RUN = '33333333-3333-4333-8333-333333333333';
const MEDIA_A = '44444444-4444-4444-8444-444444444444';
const MEDIA_B = '55555555-5555-4555-8555-555555555555';
const media = [
  { id: MEDIA_A, property_id: PROPERTY, media_status: 'ACTIVE', content_sha256: 'a'.repeat(64), room_category: 'POOL' },
  { id: MEDIA_B, property_id: PROPERTY, media_status: 'ACTIVE', content_sha256: 'b'.repeat(64), room_category: 'EXTERIOR' }
];
let total = 0;
let passed = 0;
async function test(name, fn) {
  total += 1;
  try { await fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

function payload(runId = RUN) {
  return {
    schemaVersion: 'photo-analysis-v1', runId, propertyId: PROPERTY,
    overallGalleryScore: 82, confidence: 0.9,
    coverAnalysis: {
      currentCoverMediaId: MEDIA_A, currentCoverScore: 78,
      bestCoverCandidates: [{ mediaId: MEDIA_B, score: 90, uspMatch: 'POOL', reason: 'Dış mekânı açıkça gösteriyor' }]
    },
    photoEvaluations: [
      { mediaId: MEDIA_A, roomCategory: 'POOL', technicalScore: 80, commercialScore: 76, improvementType: 'NONE', issuesDetected: [], actionableRecommendations: [], editOperations: [], observedFeatures: ['POOL'] },
      { mediaId: MEDIA_B, roomCategory: 'EXTERIOR', technicalScore: 88, commercialScore: 91, improvementType: 'EDITABLE', issuesDetected: ['CROP'], actionableRecommendations: ['Kadrajı sıkılaştırın'], editOperations: ['CROP'], observedFeatures: [] }
    ],
    missingCoverage: [],
    recommendedStoryOrder: [
      { suggestedIndex: 1, mediaId: MEDIA_B, roleInStory: 'HERO' },
      { suggestedIndex: 2, mediaId: MEDIA_A, roleInStory: 'AMENITY' }
    ],
    trustAssessment: { fabricationSuggested: false, uncertainClaims: [] }
  };
}

async function setup(overrides = {}) {
  const property = { id: PROPERTY, tenant_id: TENANT, capacity: 4, amenities: ['pool'] };
  const context = await RequestService.buildPropertyContext({ propertyId: PROPERTY, property, media });
  const calls = { complete: [], fail: [], findings: [] };
  const repository = {
    claimRun: async () => ({ id: RUN, tenant_id: TENANT, property_id: PROPERTY, status: 'PROCESSING', lease_token: 'LEASE1', prompt_version: 'lexbnb-photo-commercial-v1', schema_version: 'photo-analysis-v1', property_context_hash: context.propertyContextHash }),
    loadProperty: async () => property,
    loadActiveMedia: async () => media,
    loadAnalysisImage: async item => ({ bytes: Buffer.from(item.id), mimeType: 'image/webp' }),
    loadCachedItems: async () => [],
    findAggregateCache: async () => null,
    completeRun: async input => { calls.complete.push(input); return { status: 'SUCCEEDED' }; },
    failRun: async (...args) => { calls.fail.push(args); return { status: 'FAILED' }; },
    persistFinding: async draft => { calls.findings.push(draft); return `F${calls.findings.length}`; },
    ...overrides
  };
  return { repository, calls, context };
}

(async () => {
  await test('An empty queue is a successful idle cycle', async () => {
    const { repository } = await setup({ claimRun: async () => null });
    const result = await Worker.runNextAnalysis(repository, { analyze: async () => { throw new Error('must not run'); } });
    assert.deepStrictEqual(result, { status: 'IDLE', runId: null });
  });

  await test('Fresh media is provider-analyzed, validated and atomically completed', async () => {
    const { repository, calls } = await setup();
    let providerInput;
    const result = await Worker.runNextAnalysis(repository, { analyze: async input => {
      providerInput = input;
      return { payload: payload(), provider: 'TEST', modelVersion: 'vision-v1', requestId: 'REQ1', usageMetadata: { inputTokens: 10 } };
    } }, { now: '2026-09-12T10:00:00Z' });
    assert.strictEqual(result.status, 'SUCCEEDED');
    assert.strictEqual(providerInput.freshMedia.length, 2);
    assert(Buffer.isBuffer(providerInput.freshMedia[0].bytes));
    assert.strictEqual(calls.complete.length, 1);
    assert.strictEqual(calls.complete[0].leaseToken, 'LEASE1');
    assert.strictEqual(calls.complete[0].items.every(item => item.status === 'SUCCEEDED'), true);
    assert.strictEqual(calls.fail.length, 0);
    assert.strictEqual(calls.findings.length, 1);
  });

  await test('A valid aggregate cache avoids a provider request and marks every item cached', async () => {
    const prior = payload('66666666-6666-4666-8666-666666666666');
    const { repository, calls } = await setup({
      findAggregateCache: async () => ({ id: 'OLD', provider: 'TEST', model_version: 'vision-v1', resultPayload: prior })
    });
    let providerCalls = 0;
    const result = await Worker.runNextAnalysis(repository, { analyze: async () => { providerCalls += 1; } }, { now: '2026-09-12T10:00:00Z' });
    assert.strictEqual(result.aggregateCacheHit, true);
    assert.strictEqual(providerCalls, 0);
    assert.strictEqual(calls.complete[0].resultPayload.runId, RUN);
    assert.strictEqual(calls.complete[0].items.every(item => item.status === 'CACHED'), true);
  });

  await test('Changed property context fails before provider dispatch', async () => {
    const { repository, calls } = await setup({
      claimRun: async () => ({ id: RUN, tenant_id: TENANT, property_id: PROPERTY, lease_token: 'LEASE1', prompt_version: 'p1', schema_version: 'photo-analysis-v1', property_context_hash: 'f'.repeat(64) })
    });
    let providerCalls = 0;
    const result = await Worker.runNextAnalysis(repository, { analyze: async () => { providerCalls += 1; } });
    assert.strictEqual(result.status, 'FAILED');
    assert.strictEqual(result.errorCode, 'PROPERTY_CONTEXT_CHANGED');
    assert.strictEqual(providerCalls, 0);
    assert.strictEqual(calls.fail.length, 1);
    assert.strictEqual(calls.fail[0][1], 'LEASE1');
  });

  await test('Invalid provider output is never persisted and records a terminal failure', async () => {
    const { repository, calls } = await setup();
    const result = await Worker.runNextAnalysis(repository, { analyze: async () => ({ payload: { invented: true }, provider: 'TEST', modelVersion: 'v1' }) });
    assert.strictEqual(result.status, 'FAILED');
    assert.match(result.errorCode, /^INVALID_PROVIDER_RESULT/);
    assert.strictEqual(calls.complete.length, 0);
    assert.strictEqual(calls.fail.length, 1);
  });

  await test('Finding write failures do not corrupt an already completed analysis', async () => {
    const { repository, calls } = await setup({ persistFinding: async () => { throw new Error('finding unavailable'); } });
    const result = await Worker.runNextAnalysis(repository, { analyze: async () => ({ payload: payload(), provider: 'TEST', modelVersion: 'v1' }) });
    assert.strictEqual(result.status, 'SUCCEEDED');
    assert.strictEqual(result.findings.errors.length, 1);
    assert.strictEqual(calls.complete.length, 1);
    assert.strictEqual(calls.fail.length, 0);
  });

  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  if (passed !== total) process.exit(1);
})();
