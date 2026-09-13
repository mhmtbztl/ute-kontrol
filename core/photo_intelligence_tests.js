const assert = require('assert');
const service = require('./photo_intelligence_service');
const schema = require('./photo_analysis_schema.json');

let total = 0;
let passed = 0;
async function test(name, fn) {
  total += 1;
  try { await fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const contextHash = 'c'.repeat(64);

function validPayload(overrides = {}) {
  return {
    schemaVersion: service.ANALYSIS_SCHEMA_VERSION,
    runId: 'run-1',
    propertyId: 'property-1',
    overallGalleryScore: 78,
    confidence: 0.82,
    coverAnalysis: {
      currentCoverMediaId: 'media-1',
      currentCoverScore: 72,
      bestCoverCandidates: [{ mediaId: 'media-1', score: 88, reason: 'Ana deneyimi görünür kılıyor.' }]
    },
    photoEvaluations: [{
      mediaId: 'media-1', roomCategory: 'SPA', technicalScore: 80,
      commercialScore: 90, improvementType: 'EDITABLE',
      issuesDetected: ['LOW_EXPOSURE'], actionableRecommendations: ['Pozlamayı ölçülü artırın.'],
      editOperations: ['EXPOSURE'], observedFeatures: ['JACUZZI']
    }],
    missingCoverage: [],
    recommendedStoryOrder: [{ suggestedIndex: 1, mediaId: 'media-1', roleInStory: 'HERO' }],
    trustAssessment: { fabricationSuggested: false, uncertainClaims: [] },
    ...overrides
  };
}

(async () => {
  await test('Cache keys are deterministic and include every version boundary', async () => {
    const base = { contentSha256: hashA, propertyContextHash: contextHash, promptVersion: 'p1', schemaVersion: 's1' };
    const first = await service.buildAnalysisCacheKey(base);
    const second = await service.buildAnalysisCacheKey({ schemaVersion: 's1', promptVersion: 'p1', propertyContextHash: contextHash, contentSha256: hashA });
    const changed = await service.buildAnalysisCacheKey({ ...base, promptVersion: 'p2' });
    assert.strictEqual(first, second);
    assert.notStrictEqual(first, changed);
  });

  await test('Provider schema and runtime validator share the same version and safety enums', () => {
    assert.strictEqual(schema.properties.schemaVersion.const, service.ANALYSIS_SCHEMA_VERSION);
    assert.deepStrictEqual(schema.properties.photoEvaluations.items.properties.improvementType.enum, service.IMPROVEMENT_TYPES);
    assert.deepStrictEqual(schema.properties.photoEvaluations.items.properties.editOperations.items.enum, service.SAFE_EDIT_OPERATIONS);
    assert.strictEqual(schema.properties.trustAssessment.properties.fabricationSuggested.const, false);
  });

  await test('Invalid hashes cannot enter the cache identity', async () => {
    await assert.rejects(() => service.buildAnalysisCacheKey({ contentSha256: 'bad', propertyContextHash: contextHash, promptVersion: 'p1', schemaVersion: 's1' }), /INVALID_CONTENT/);
  });

  await test('Fresh cache hits avoid provider work', async () => {
    const cacheKey = await service.buildAnalysisCacheKey({ contentSha256: hashA, propertyContextHash: contextHash, promptVersion: 'p1', schemaVersion: 's1' });
    const plan = await service.planIncrementalAnalysis({
      media: [{ id: 'media-1', contentSha256: hashA }],
      cachedItems: [{ id: 'cached-1', cacheKey, status: 'SUCCEEDED', resultPayload: { score: 80 }, createdAt: '2026-09-01T00:00:00Z' }],
      propertyContextHash: contextHash, promptVersion: 'p1', schemaVersion: 's1', now: '2026-09-12T00:00:00Z'
    });
    assert.strictEqual(plan.cachedCount, 1);
    assert.strictEqual(plan.freshCount, 0);
    assert.strictEqual(plan.allCached, true);
  });

  await test('Expired cache entries are reanalyzed', async () => {
    const cacheKey = await service.buildAnalysisCacheKey({ contentSha256: hashA, propertyContextHash: contextHash, promptVersion: 'p1', schemaVersion: 's1' });
    const plan = await service.planIncrementalAnalysis({
      media: [{ id: 'media-1', contentSha256: hashA }],
      cachedItems: [{ cacheKey, status: 'SUCCEEDED', resultPayload: { score: 80 }, createdAt: '2026-07-01T00:00:00Z' }],
      propertyContextHash: contextHash, promptVersion: 'p1', schemaVersion: 's1', now: '2026-09-12T00:00:00Z'
    });
    assert.strictEqual(plan.freshCount, 1);
  });

  await test('A cache record without a result payload is never reused', async () => {
    const cacheKey = await service.buildAnalysisCacheKey({ contentSha256: hashA, propertyContextHash: contextHash, promptVersion: 'p1', schemaVersion: 's1' });
    const plan = await service.planIncrementalAnalysis({
      media: [{ id: 'media-1', contentSha256: hashA }],
      cachedItems: [{ cacheKey, status: 'SUCCEEDED', createdAt: '2026-09-10T00:00:00Z' }],
      propertyContextHash: contextHash, promptVersion: 'p1', schemaVersion: 's1', now: '2026-09-12T00:00:00Z'
    });
    assert.strictEqual(plan.freshCount, 1);
  });

  await test('Duplicate media IDs are rejected before provider dispatch', async () => {
    await assert.rejects(() => service.planIncrementalAnalysis({
      media: [{ id: 'media-1', contentSha256: hashA }, { id: 'media-1', contentSha256: hashB }],
      propertyContextHash: contextHash, promptVersion: 'p1', schemaVersion: 's1', now: '2026-09-12T00:00:00Z'
    }), /DUPLICATE_MEDIA_ID/);
  });

  await test('A complete structured result is accepted', () => {
    const result = service.validateAnalysisResult(validPayload(), { runId: 'run-1', propertyId: 'property-1', expectedMediaIds: ['media-1'] });
    assert.deepStrictEqual(result, { valid: true, errors: [] });
  });

  await test('Unknown property-level cover remains explicit instead of being invented', () => {
    const payload = validPayload({
      coverAnalysis: { currentCoverMediaId: null, currentCoverScore: null, bestCoverCandidates: [] }
    });
    assert.strictEqual(service.validateAnalysisResult(payload, {
      runId: 'run-1', propertyId: 'property-1', expectedMediaIds: ['media-1']
    }).valid, true);
    payload.coverAnalysis.currentCoverScore = 70;
    assert(service.validateAnalysisResult(payload, {
      runId: 'run-1', propertyId: 'property-1', expectedMediaIds: ['media-1']
    }).errors.some(error => error.includes('MUST_BE_NULL')));
  });

  await test('Run, property and analyzed media scope cannot be spoofed', () => {
    const result = service.validateAnalysisResult(validPayload({ runId: 'wrong' }), { runId: 'run-1', propertyId: 'property-1', expectedMediaIds: ['media-1', 'media-2'] });
    assert.strictEqual(result.valid, false);
    assert(result.errors.includes('runId:MISMATCH_OR_MISSING'));
    assert(result.errors.includes('photoEvaluations:MEDIA_SET_MISMATCH'));
  });

  await test('Cover candidates and story order cannot reference unsubmitted media', () => {
    const payload = validPayload();
    payload.coverAnalysis.bestCoverCandidates[0].mediaId = 'invented-media';
    payload.recommendedStoryOrder[0].mediaId = 'invented-media';
    const result = service.validateAnalysisResult(payload, { expectedMediaIds: ['media-1'] });
    assert.strictEqual(result.valid, false);
    assert(result.errors.some(error => error.includes('bestCoverCandidates[0].mediaId:OUT_OF_SCOPE')));
    assert(result.errors.some(error => error.includes('recommendedStoryOrder[0].mediaId:OUT_OF_SCOPE')));
  });

  await test('Story order cannot duplicate a photo or position', () => {
    const payload = validPayload();
    payload.recommendedStoryOrder.push({ suggestedIndex: 1, mediaId: 'media-1', roleInStory: 'DETAIL' });
    const result = service.validateAnalysisResult(payload);
    assert.strictEqual(result.valid, false);
    assert(result.errors.some(error => error.includes('recommendedStoryOrder[1]:DUPLICATE')));
  });

  await test('Out-of-range scores are rejected', () => {
    const result = service.validateAnalysisResult(validPayload({ overallGalleryScore: 101 }));
    assert.strictEqual(result.valid, false);
    assert(result.errors.includes('overallGalleryScore:OUT_OF_RANGE'));
  });

  await test('Unsafe or invented edit operations are rejected', () => {
    const payload = validPayload();
    payload.photoEvaluations[0].editOperations = ['ADD_SWIMMING_POOL'];
    const result = service.validateAnalysisResult(payload);
    assert.strictEqual(result.valid, false);
    assert(result.errors.some(error => error.includes('UNSAFE_OR_INVALID')));
  });

  await test('The trust contract must explicitly deny fabrication', () => {
    const payload = validPayload();
    payload.trustAssessment.fabricationSuggested = true;
    const result = service.validateAnalysisResult(payload);
    assert.strictEqual(result.valid, false);
    assert(result.errors.includes('trustAssessment:FABRICATION_MUST_BE_FALSE'));
  });

  await test('Declared amenities missing from observed gallery become low-confidence checks', () => {
    const gaps = service.detectCoverageGaps({ amenities: ['sauna', 'pool'] }, [{ roomCategory: 'POOL', observedFeatures: ['POOL'] }]);
    assert.strictEqual(gaps.length, 1);
    assert.strictEqual(gaps[0].coverageKey, 'SAUNA');
    assert.strictEqual(gaps[0].confidenceTier, 'LOW');
    assert.strictEqual(gaps[0].causalClaim, false);
  });

  await test('Amenity coverage may be established by an explicit observed feature', () => {
    const gaps = service.detectCoverageGaps({ amenities: { jacuzzi: true } }, [{ roomCategory: 'OTHER', observedFeatures: ['JACUZZI'] }]);
    assert.strictEqual(gaps.length, 0);
  });

  await test('Reshoot analysis becomes a physical finding while editable work stays digital', async () => {
    const analysis = validPayload();
    analysis.photoEvaluations.push({
      mediaId: 'media-2', roomCategory: 'BEDROOM', technicalScore: 55,
      commercialScore: 50, improvementType: 'RESHOOT', issuesDetected: ['POOR_COMPOSITION'],
      actionableRecommendations: ['Doğal ışıkta yeniden çekin.'], editOperations: [], observedFeatures: []
    });
    analysis.recommendedStoryOrder.push({ suggestedIndex: 2, mediaId: 'media-2', roleInStory: 'ROOM' });
    const drafts = await service.buildPhotoFindingDrafts({
      tenantId: 'tenant-1', propertyId: 'property-1', runId: 'run-1',
      expectedMediaIds: ['media-1', 'media-2'], analysis
    });
    assert(drafts.some(item => item.actionKind === 'CONTENT_UPDATE'));
    assert(drafts.some(item => item.actionKind === 'RESHOOT'));
    assert(drafts.every(item => /^[0-9a-f]{64}$/.test(item.findingFingerprint)));
  });

  await test('Missing amenity coverage remains a digital human-review finding', async () => {
    const analysis = validPayload();
    analysis.photoEvaluations[0].roomCategory = 'LIVING_ROOM';
    analysis.photoEvaluations[0].observedFeatures = [];
    const drafts = await service.buildPhotoFindingDrafts({
      tenantId: 'tenant-1', propertyId: 'property-1', runId: 'run-1',
      property: { amenities: ['sauna'] }, analysis
    });
    const coverage = drafts.find(item => item.findingCode === 'GALLERY_COVERAGE_CHECK');
    assert(coverage);
    assert.strictEqual(coverage.actionKind, 'DIGITAL_REVIEW');
    assert.strictEqual(coverage.confidenceTier, 'LOW');
  });

  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  if (passed !== total) process.exit(1);
})();
