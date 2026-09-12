const assert = require('assert');
const service = require('./seasonal_marketing_worker_service');

let total = 0;
let passed = 0;
async function test(name, fn) {
  total += 1;
  try { await fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

const TENANT = '11111111-1111-4111-8111-111111111111';
const PROPERTY = '22222222-2222-4222-8222-222222222222';
const RUN = '33333333-3333-4333-8333-333333333333';
const MEDIA = '44444444-4444-4444-8444-444444444444';
const LISTING = '55555555-5555-4555-8555-555555555555';
const run = {
  id: RUN, tenant_id: TENANT, property_id: PROPERTY, status: 'SUCCEEDED',
  completed_at: '2026-11-20T10:00:00Z', result_schema_validated_at: '2026-11-20T10:00:00Z',
  result_payload: {
    schemaVersion: 'photo-analysis-v1', runId: RUN, propertyId: PROPERTY,
    overallGalleryScore: 86, confidence: 0.84,
    coverAnalysis: { currentCoverMediaId: null, currentCoverScore: null, bestCoverCandidates: [{ mediaId: MEDIA, score: 91, reason: 'winter fit' }] },
    photoEvaluations: [{ mediaId: MEDIA, roomCategory: 'EXTERIOR', technicalScore: 88, commercialScore: 90, improvementType: 'NONE', actionableRecommendations: [] }],
    missingCoverage: [], recommendedStoryOrder: [{ suggestedIndex: 1, mediaId: MEDIA, roleInStory: 'HERO' }],
    trustAssessment: { fabricationSuggested: false, uncertainClaims: [] }
  }
};

function repository(overrides = {}) {
  const persisted = [];
  return {
    persisted,
    async loadLatestAnalysisRuns() { return [run]; },
    async loadActiveMedia() { return [{ id: MEDIA, tenant_id: TENANT, property_id: PROPERTY, media_status: 'ACTIVE', season_tags: ['WINTER'] }]; },
    async loadActiveListings() { return [{ id: LISTING, payout_currency: 'TRY' }]; },
    async persistFinding(draft) { persisted.push(draft); return 'F1'; },
    ...overrides
  };
}

(async () => {
  await test('Validated current-gallery analysis creates an idempotent review finding', async () => {
    const repo = repository();
    const first = await service.runSeasonalReview(repo, { asOfDate: '2026-12-01' });
    const second = await service.runSeasonalReview(repo, { asOfDate: '2026-12-02' });
    assert.strictEqual(first.findingsPersisted, 1);
    assert.strictEqual(first.status, 'COMPLETED');
    assert.strictEqual(repo.persisted[0].actionKind, 'DIGITAL_REVIEW');
    assert.strictEqual(repo.persisted[0].findingFingerprint, repo.persisted[1].findingFingerprint);
    assert.strictEqual(repo.persisted[0].observation.autoApply, undefined);
  });

  await test('A changed gallery is skipped rather than using stale scores', async () => {
    const repo = repository({
      async loadActiveMedia() { return [
        { id: MEDIA, property_id: PROPERTY, media_status: 'ACTIVE', season_tags: ['WINTER'] },
        { id: 'new-media', property_id: PROPERTY, media_status: 'ACTIVE', season_tags: ['WINTER'] }
      ]; }
    });
    const result = await service.runSeasonalReview(repo, { asOfDate: '2026-12-01' });
    assert.strictEqual(result.findingsPersisted, 0);
    assert.strictEqual(result.skipped[0].reason, 'GALLERY_CHANGED_SINCE_ANALYSIS');
  });

  await test('Newest run per tenant and property is processed only once', async () => {
    const repo = repository({ async loadLatestAnalysisRuns() { return [run, { ...run, id: 'older', completed_at: '2026-11-01T00:00:00Z' }]; } });
    const result = await service.runSeasonalReview(repo, { asOfDate: '2026-12-01' });
    assert.strictEqual(result.examinedProperties, 1);
  });

  await test('One property failure does not abort the full scheduler batch', async () => {
    const repo = repository({ async loadActiveMedia() { throw new Error('read failed'); } });
    const result = await service.runSeasonalReview(repo, { asOfDate: '2026-12-01' });
    assert.strictEqual(result.status, 'FAILED');
    assert.strictEqual(result.errors.length, 1);
  });

  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  if (passed !== total) process.exit(1);
})();
