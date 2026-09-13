const assert = require('assert');
const collector = require('./marketing_health_source_collector');
let total = 0; let passed = 0;
async function test(name, fn) { total += 1; try { await fn(); passed += 1; console.log(`[PASS] ${name}`); } catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); } }
const scope = { tenantId: '11111111-1111-4111-8111-111111111111', propertyId: '22222222-2222-4222-8222-222222222222' };
const media = [{ id: '44444444-4444-4444-8444-444444444444', property_id: scope.propertyId, media_status: 'ACTIVE' }];
const run = { id: '33333333-3333-4333-8333-333333333333', property_id: scope.propertyId, status: 'SUCCEEDED', completed_at: '2026-09-19T00:00:00Z', result_schema_validated_at: '2026-09-19T00:00:00Z', result_payload: {
  schemaVersion: 'photo-analysis-v1', runId: '33333333-3333-4333-8333-333333333333', propertyId: scope.propertyId, overallGalleryScore: 84, confidence: 0.9,
  coverAnalysis: { currentCoverMediaId: null, currentCoverScore: null, bestCoverCandidates: [] },
  photoEvaluations: [{ mediaId: media[0].id, technicalScore: 80, commercialScore: 82, improvementType: 'NONE' }],
  missingCoverage: [], recommendedStoryOrder: [], trustAssessment: { fabricationSuggested: false, uncertainClaims: [] }
} };
const benchmark = { search_to_view_ctr_percent: 5, view_to_booking_conversion_percent: 4, normalized_impressions_per_listing_day: 30, recommended_active_media_count: 20, confidence: 0.8 };
const snapshots = [{ id: 'S1', channel_listing_id: 'L1', period_start: '2026-09-01', period_end_exclusive: '2026-09-15', impressions: 1000, listing_views: 50, platform_reported_bookings: 2, validation_status: 'VALID' }];
const bookings = [{ id: 'B1', property_id: scope.propertyId, channel: 'AIRBNB', check_in: '2026-09-01', check_out: '2026-09-03', gross_amount: 10000, ota_commission: 1000, cleaning_fee: 1000, discount: 0, status: 'CHECKED_OUT' }, { id: 'B2', property_id: scope.propertyId, channel: 'DIRECT', check_in: '2026-09-10', check_out: '2026-09-12', gross_amount: 8000, ota_commission: 0, cleaning_fee: 1000, discount: 0, status: 'CHECKED_OUT' }];
(async () => {
  await test('Available native sources produce six evidence-backed component drafts', () => {
    const drafts = collector.buildDrafts({ scope, benchmark, media, photoRuns: [run], snapshots, bookings, asOf: '2026-09-20T00:00:00Z', periodStart: '2026-06-22' });
    assert.deepStrictEqual(drafts.map(d => d.componentKey), ['PHOTO_QUALITY', 'CLICK_PERFORMANCE', 'CONVERSION_POWER', 'VISIBILITY_STRENGTH', 'LISTING_DEPTH', 'NET_ECONOMICS']);
    assert.strictEqual(drafts.find(d => d.componentKey === 'CLICK_PERFORMANCE').observedValue, 5);
    assert.strictEqual(drafts.find(d => d.componentKey === 'NET_ECONOMICS').referenceValue, 16000);
  });
  await test('Missing benchmark suppresses benchmark-dependent components without fabricated values', () => {
    const drafts = collector.buildDrafts({ scope, benchmark: null, media, photoRuns: [run], snapshots, bookings: [], asOf: '2026-09-20T00:00:00Z', periodStart: '2026-06-22' });
    assert.deepStrictEqual(drafts.map(d => d.componentKey), ['PHOTO_QUALITY']);
  });
  await test('Newest snapshot per listing is selected deterministically', () => {
    const selected = collector.latestByListing([{ ...snapshots[0], id: 'old', created_at: '2026-09-15T01:00:00Z' }, { ...snapshots[0], id: 'new', created_at: '2026-09-15T02:00:00Z' }]);
    assert.strictEqual(selected[0].id, 'new');
  });
  await test('Collector fingerprints are stable within one UTC collection day', async () => {
    const recorded = []; const repo = {
      async loadBenchmark() { return benchmark; }, async loadActiveMedia() { return media; }, async loadPhotoRuns() { return [run]; },
      async loadChannelSnapshots() { return snapshots; }, async loadBookings() { return bookings; },
      async recordInput(draft) { recorded.push(draft); return `I${recorded.length}`; }
    };
    await collector.collectProperty(repo, scope, { asOf: '2026-09-20T01:00:00Z' }); const first = recorded.map(d => d.inputFingerprint);
    recorded.length = 0; await collector.collectProperty(repo, scope, { asOf: '2026-09-20T20:00:00Z' });
    assert.deepStrictEqual(recorded.map(d => d.inputFingerprint), first);
  });
  await test('One failed property does not abort other collection scopes', async () => {
    const repo = {
      async loadPropertyScopes() { return [scope, { ...scope, propertyId: 'bad' }]; },
      async loadBenchmark(t, p) { if (p === 'bad') throw new Error('read failed'); return benchmark; },
      async loadActiveMedia() { return media; }, async loadPhotoRuns() { return [run]; }, async loadChannelSnapshots() { return snapshots; }, async loadBookings() { return bookings; }, async recordInput() { return 'I'; }
    };
    const result = await collector.runCollector(repo, { asOf: '2026-09-20T00:00:00Z' });
    assert.strictEqual(result.status, 'PARTIAL'); assert.strictEqual(result.errors.length, 1); assert.strictEqual(result.recorded, 6);
  });
  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`); if (passed !== total) process.exit(1);
})();
