const assert = require('assert');
const service = require('./marketing_photo_results_service');

const PROPERTY = 'P1';
const MEDIA = [{ id: 'M1', property_id: PROPERTY, media_status: 'ACTIVE' }];
function run(overrides = {}) {
  return {
    id: 'R1', property_id: PROPERTY, status: 'SUCCEEDED',
    completed_at: '2026-09-13T10:00:00Z', result_schema_validated_at: '2026-09-13T10:00:00Z',
    result_payload: {
      schemaVersion: 'photo-analysis-v1', runId: 'R1', propertyId: PROPERTY,
      overallGalleryScore: 82, confidence: 0.9,
      coverAnalysis: { currentCoverMediaId: null, currentCoverScore: null, bestCoverCandidates: [{ mediaId: 'M1', score: 91, reason: 'Havuzu net gösteriyor' }] },
      photoEvaluations: [{ mediaId: 'M1', roomCategory: 'POOL', technicalScore: 80, commercialScore: 70, improvementType: 'EDITABLE', actionableRecommendations: ['Pozlamayı düzeltin'] }],
      missingCoverage: [], recommendedStoryOrder: [{ suggestedIndex: 1, mediaId: 'M1', roleInStory: 'HERO' }],
      trustAssessment: { fabricationSuggested: false, uncertainClaims: [] }
    },
    ...overrides
  };
}

let total = 0;
let passed = 0;
function test(name, fn) {
  total += 1;
  try { fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

test('Newest completed property run is selected by timestamp', () => {
  assert.strictEqual(service.latestSucceededRun([
    run({ id: 'OLD', completed_at: '2026-09-01T00:00:00Z' }), run({ id: 'NEW', completed_at: '2026-09-13T00:00:00Z' })
  ], PROPERTY).id, 'NEW');
});

test('Validated results expose only recorded scores and recommendations', () => {
  const view = service.buildPhotoResultView({ run: run(), propertyId: PROPERTY, media: MEDIA });
  assert.strictEqual(view.available, true);
  assert.strictEqual(view.galleryScore, 82);
  assert.strictEqual(view.confidencePercent, 90);
  assert.strictEqual(view.currentCover, null);
  assert.strictEqual(view.coverCandidates[0].mediaId, 'M1');
  assert.deepStrictEqual(view.recommendations[0].recommendations, ['Pozlamayı düzeltin']);
});

test('Unvalidated or fabrication-permitting payloads never render', () => {
  assert.strictEqual(service.buildPhotoResultView({ run: run({ result_schema_validated_at: null }), propertyId: PROPERTY, media: MEDIA }).available, false);
  const unsafe = run();
  unsafe.result_payload.trustAssessment.fabricationSuggested = true;
  assert.strictEqual(service.buildPhotoResultView({ run: unsafe, propertyId: PROPERTY, media: MEDIA }).reason, 'RESULT_TRUST_VALIDATION_FAILED');
});

test('Changed active media invalidates a previously completed view', () => {
  const changed = [...MEDIA, { id: 'M2', property_id: PROPERTY, media_status: 'ACTIVE' }];
  assert.strictEqual(service.buildPhotoResultView({ run: run(), propertyId: PROPERTY, media: changed }).reason, 'GALLERY_CHANGED_SINCE_ANALYSIS');
});

test('Out-of-scope cover candidates and story entries are discarded', () => {
  const value = run();
  value.result_payload.coverAnalysis.bestCoverCandidates.push({ mediaId: 'OTHER', score: 99, reason: 'bad' });
  value.result_payload.recommendedStoryOrder.push({ suggestedIndex: 2, mediaId: 'OTHER', roleInStory: 'BAD' });
  const view = service.buildPhotoResultView({ run: value, propertyId: PROPERTY, media: MEDIA });
  assert.deepStrictEqual(view.coverCandidates.map(item => item.mediaId), ['M1']);
  assert.deepStrictEqual(view.storyOrder.map(item => item.mediaId), ['M1']);
});

console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
if (passed !== total) process.exit(1);
