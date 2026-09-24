const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const MarketingUI = require('./marketing_ui');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests += 1;
  try {
    fn();
    passedTests += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    console.error(`       ${error.stack || error.message}`);
  }
}

runTest('Monthly filter uses an exclusive first day of next month', () => {
  assert.deepStrictEqual(MarketingUI.periodFromFilter({ period: '2026-12' }), {
    start: '2026-12-01', endExclusive: '2027-01-01', label: '2026-12'
  });
});

runTest('Custom inclusive UI end date is converted to exclusive engine boundary', () => {
  assert.deepStrictEqual(MarketingUI.periodFromFilter({
    period: 'CUSTOM', startDate: '2026-09-10', endDate: '2026-09-30'
  }), {
    start: '2026-09-10', endExclusive: '2026-10-01', label: '2026-09-10 – 2026-09-30'
  });
});

runTest('Property scope accepts both UI slug and persisted property id', () => {
  const scoped = MarketingUI.scopeBookings([
    { id: 'A', villa: 'AZURE' },
    { id: 'B', property_id: 'property-1' },
    { id: 'C', propertyId: 'property-2' }
  ], 'AZURE', { AZURE: { id: 'property-1' } });
  assert.deepStrictEqual(scoped.map(item => item.id), ['A', 'B']);
});

runTest('Workspace model exposes recorded commission without fallback estimates', () => {
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: '2026-09', villa: 'ALL' },
    bookings: [{
      id: 'B1', channel: 'AIRBNB', checkIn: '2026-09-01', checkOut: '2026-09-03',
      grossAmount: 20000, cleaningFee: 2000, status: 'CONFIRMED'
    }]
  });
  assert.strictEqual(model.economics.totals.roomRevenueBeforeDistribution, 18000);
  assert.strictEqual(model.economics.totals.distributionCost, 0);
  assert.strictEqual(model.economics.totals.roomRevenueAfterDistribution, 18000);
});

runTest('Unknown channels remain visible in the rendered economics table', () => {
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: 'ALL', villa: 'ALL' },
    bookings: [{ id: 'U1', channel: 'Agency X', checkIn: '2026-09-01', checkOut: '2026-09-02', grossAmount: 1000 }]
  });
  const html = MarketingUI.renderWorkspaceHtml(model, 'economics');
  assert.match(html, /Bilinmeyen/);
  assert.match(html, /Agency X/);
  assert.match(html, /Eşleme gerekli/);
});

runTest('Economics renders only a reportable backend health snapshot', () => {
  const propertyId = '22222222-2222-4222-8222-222222222222';
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: 'ALL', villa: 'AZURE' }, bookings: [],
    villas: { AZURE: { id: propertyId, name: 'Villa Azure' } },
    healthSnapshots: [{
      id: 'H1', property_id: propertyId, as_of: '2026-09-13T08:00:00Z',
      scoring_version: 'health-v1', status: 'REPORTABLE', score: 82.5,
      coverage_percent: 75, confidence_index: 0.73, confidence_tier: 'MEDIUM',
      components: [], missing_components: [],
      scoring_method: 'RENORMALIZED_AVAILABLE_COMPONENTS', missing_data_imputed: false
    }]
  });
  const html = MarketingUI.renderWorkspaceHtml(model, 'economics');
  assert.match(html, /Pazarlama sağlık skoru/);
  assert.match(html, /82,5\/100/);
  assert.match(html, /Eksik veri puanlanmadı/);
  assert.match(html, /health-v1/);
});

runTest('Economics exposes source-attributed benchmark history without invented defaults', () => {
  const propertyId = '22222222-2222-4222-8222-222222222222';
  const model = MarketingUI.buildWorkspaceModel({ filter: { period: 'ALL', villa: 'AZURE' }, bookings: [],
    villas: { AZURE: { id: propertyId, name: 'Villa Azure' } }, benchmarks: [{ property_id: propertyId,
      source_kind: 'MANUAL_RESEARCH', effective_from: '2026-09-01', confidence: 0.8,
      max_distribution_cost_percent: 15, minimum_direct_reservation_share_percent: 20 }] });
  const html = MarketingUI.renderWorkspaceHtml(model, 'economics');
  assert.match(html, /Geçerli pazarlama referansı/); assert.match(html, /MANUAL_RESEARCH/);
  assert.match(html, /Azami dağıtım maliyeti: 15%/); assert.match(html, /Asgari direkt pay: 20%/);
  assert.match(MarketingUI.renderBenchmarkForm(model), /Kaydedilen referans geçmişi değiştirilemez/);
});

runTest('Future and expired benchmarks are not presented as current', () => {
  const propertyId = 'P1'; const rows = [
    { property_id: propertyId, id: 'expired', effective_from: '2026-01-01', effective_to_exclusive: '2026-02-01' },
    { property_id: propertyId, id: 'current', effective_from: '2026-08-01', effective_to_exclusive: null },
    { property_id: propertyId, id: 'future', effective_from: '2026-10-01', effective_to_exclusive: null }
  ];
  assert.strictEqual(MarketingUI.selectCurrentBenchmark(rows, propertyId, '2026-09-13').id, 'current');
});

runTest('Insufficient health evidence remains scoreless in the UI', () => {
  const propertyId = '22222222-2222-4222-8222-222222222222';
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: 'ALL', villa: 'AZURE' }, bookings: [],
    villas: { AZURE: { id: propertyId, name: 'Villa Azure' } },
    healthSnapshots: [{
      id: 'H1', property_id: propertyId, as_of: '2026-09-13T08:00:00Z',
      status: 'INSUFFICIENT_DATA', score: null, coverage_percent: 35,
      confidence_index: 0.3, confidence_tier: 'INSUFFICIENT', components: [],
      missing_components: [{ key: 'PHOTO_QUALITY', reason: '<missing>' }],
      scoring_method: 'RENORMALIZED_AVAILABLE_COMPONENTS', missing_data_imputed: false
    }]
  });
  const html = MarketingUI.renderWorkspaceHtml(model, 'economics');
  assert.match(html, /Pazarlama sağlığı hesaplanamadı/);
  assert.match(html, /veri kapsamı yetersiz \(35%\)/);
  assert.doesNotMatch(html, />70</);
});

runTest('Missing funnel and gallery inputs render explicit empty states', () => {
  const model = MarketingUI.buildWorkspaceModel({ filter: { period: 'ALL', villa: 'ALL' }, bookings: [] });
  assert.match(MarketingUI.renderWorkspaceHtml(model, 'funnel'), /Huni verisi henüz yok/);
  assert.match(MarketingUI.renderWorkspaceHtml(model, 'gallery'), /Galeri analizi henüz yok/);
  assert.doesNotMatch(MarketingUI.renderWorkspaceHtml(model, 'gallery'), /70/);
});

runTest('Injected markup is escaped in finding output', () => {
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: 'ALL', villa: 'ALL' }, bookings: [],
    snapshots: [{ impressions: 100, listingViews: 20, bookingAttempts: 2, platformReportedBookings: 1, wishlistSaves: 3 }],
    findings: [{ id: 'F1', findingFingerprint: 'fp-1', status: 'OPEN', actionKind: 'DIGITAL_REVIEW', title: '<img src=x>', evidenceText: '<script>x</script>' }]
  });
  const html = MarketingUI.renderWorkspaceHtml(model, 'funnel');
  assert.doesNotMatch(html, /<img src=x>/);
  assert.doesNotMatch(html, /<script>x<\/script>/);
});

runTest('Physical findings expose explicit task opt-in while digital findings do not', () => {
  const physical = MarketingUI.renderFindingActions({ id: 'F1', status: 'OPEN', action_kind: 'RESHOOT' });
  const digital = MarketingUI.renderFindingActions({ id: 'F2', status: 'OPEN', action_kind: 'PRICE_REVIEW' });
  assert.match(physical, /data-marketing-action="ACCEPT_TASK"/);
  assert.doesNotMatch(digital, /data-marketing-action="ACCEPT_TASK"/);
  assert.match(digital, /data-marketing-action="ACKNOWLEDGE"/);
});

runTest('Terminal findings expose no lifecycle buttons', () => {
  assert.strictEqual(MarketingUI.renderFindingActions({ id: 'F1', status: 'RESOLVED', action_kind: 'RESHOOT' }), '');
  assert.strictEqual(MarketingUI.renderFindingActions({ id: 'F2', status: 'DISMISSED', action_kind: 'RESHOOT' }), '');
});

runTest('Manual snapshot form uses scoped listings and leaves unknown counters blank', () => {
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: '2026-09', villa: 'ALL' }, bookings: [],
    listings: [
      { id: 'L1', channel_code: 'AIRBNB', display_name: 'Airbnb Ana İlan', status: 'ACTIVE' },
      { id: 'L2', channel_code: 'VRBO', status: 'ARCHIVED' }
    ]
  });
  const html = MarketingUI.renderSnapshotForm(model);
  assert.match(html, /value="L1"/);
  assert.doesNotMatch(html, /value="L2"/);
  assert.match(html, /name="periodEndExclusive" value="2026-10-01"/);
  assert.match(html, /name="listingViews" placeholder="Bilinmiyorsa boş bırakın"/);
});

runTest('Funnel selects the newest snapshot regardless of query array order', () => {
  const latest = MarketingUI.selectLatestSnapshot([
    { id: 'new', period_end_exclusive: '2026-10-01' },
    { id: 'old', period_end_exclusive: '2026-09-01' }
  ]);
  assert.strictEqual(latest.id, 'new');
});

runTest('Channel listing form preserves property scope and constrained channel vocabulary', () => {
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: 'ALL', villa: 'AZURE' }, bookings: [],
    villas: { AZURE: { id: 'P1', name: 'Villa Azure' }, OLD: { id: 'P2', name: '<Eski>' } }
  });
  const html = MarketingUI.renderListingForm(model);
  assert.match(html, /value="P1" selected/);
  assert.match(html, /value="BOOKING_COM"/);
  assert.doesNotMatch(html, /INSTAGRAM/);
  assert.match(html, /&lt;Eski&gt;/);
});

runTest('Private media form scopes the property and constrains accepted image types', () => {
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: 'ALL', villa: 'AZURE' }, bookings: [],
    villas: { AZURE: { id: 'P1', name: 'Villa Azure' } }
  });
  const html = MarketingUI.renderMediaUploadForm(model);
  assert.match(html, /value="P1" selected/);
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp,image\/heic"/);
  assert.match(html, /en fazla 25 MiB/);
  assert.doesNotMatch(html, /image\/svg/);
});

runTest('Gallery enables analysis only for a selected property with active media', () => {
  const propertyId = '22222222-2222-4222-8222-222222222222';
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: 'ALL', villa: 'AZURE' }, bookings: [],
    villas: { AZURE: { id: propertyId, name: 'Villa Azure' } },
    media: [{ id: 'M1', property_id: propertyId, media_status: 'ACTIVE' }]
  });
  const html = MarketingUI.renderWorkspaceHtml(model, 'gallery');
  assert.match(html, /data-marketing-request-analysis>AI ile analiz et/);
  assert.doesNotMatch(html, /data-marketing-request-analysis disabled/);
});

runTest('Gallery reports an active analysis without presenting invented results', () => {
  const propertyId = '22222222-2222-4222-8222-222222222222';
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: 'ALL', villa: 'AZURE' }, bookings: [],
    villas: { AZURE: { id: propertyId, name: 'Villa Azure' } },
    media: [{ id: 'M1', property_id: propertyId, media_status: 'ACTIVE' }],
    analysisRuns: [{ property_id: propertyId, status: 'PROCESSING', requested_at: '2026-09-12T10:00:00Z' }]
  });
  const html = MarketingUI.renderWorkspaceHtml(model, 'gallery');
  assert.match(html, /data-marketing-request-analysis disabled>Analiz sürüyor/);
  assert.match(html, /İşleniyor/);
  assert.doesNotMatch(html, /Galeri puanı/);
});

runTest('Gallery renders only schema-validated analysis results for the current media set', () => {
  const propertyId = '22222222-2222-4222-8222-222222222222';
  const runId = '33333333-3333-4333-8333-333333333333';
  const mediaId = '44444444-4444-4444-8444-444444444444';
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: 'ALL', villa: 'AZURE' }, bookings: [],
    villas: { AZURE: { id: propertyId, name: 'Villa Azure' } },
    media: [{ id: mediaId, property_id: propertyId, media_status: 'ACTIVE' }],
    analysisRuns: [{
      id: runId, property_id: propertyId, status: 'SUCCEEDED', completed_at: '2026-09-13T10:00:00Z',
      result_schema_validated_at: '2026-09-13T10:00:00Z',
      result_payload: {
        schemaVersion: 'photo-analysis-v1', runId, propertyId, overallGalleryScore: 84, confidence: 0.88,
        coverAnalysis: { currentCoverMediaId: null, currentCoverScore: null, bestCoverCandidates: [{ mediaId, score: 91, reason: '<iyi aday>' }] },
        photoEvaluations: [{ mediaId, roomCategory: 'POOL', technicalScore: 80, commercialScore: 72, improvementType: 'EDITABLE', actionableRecommendations: ['Pozlamayı düzelt'] }],
        missingCoverage: [], recommendedStoryOrder: [{ suggestedIndex: 1, mediaId, roleInStory: 'HERO' }],
        trustAssessment: { fabricationSuggested: false, uncertainClaims: [] }
      }
    }]
  });
  const html = MarketingUI.renderWorkspaceHtml(model, 'gallery');
  assert.match(html, /Galeri sağlık skoru/);
  assert.match(html, /84\/100/);
  assert.match(html, /&lt;iyi aday&gt;/);
  assert.match(html, /Kanal bazlı mevcut kapak belirtilmedi/);
});

runTest('Cover-change form uses the recorded cover and creates fixed observational windows atomically', () => {
  const propertyId = '22222222-2222-4222-8222-222222222222';
  const model = MarketingUI.buildWorkspaceModel({
    filter: { period: 'ALL', villa: 'AZURE' }, bookings: [],
    villas: { AZURE: { id: propertyId, name: 'Villa Azure' } },
    listings: [{ id: 'L1', property_id: propertyId, channel_code: 'AIRBNB' }],
    media: [
      { id: 'M1', property_id: propertyId, media_status: 'ACTIVE', room_category: 'POOL' },
      { id: 'M2', property_id: propertyId, media_status: 'ACTIVE', room_category: 'EXTERIOR' }
    ],
    placements: [
      { channel_listing_id: 'L1', media_id: 'M1', is_active: true, is_cover: true },
      { channel_listing_id: 'L1', media_id: 'M2', is_active: true, is_cover: false }
    ]
  });
  const html = MarketingUI.renderExperimentForm(model);
  assert.match(html, /name="expectedOldMediaId" value="M1"/);
  assert.match(html, /name="newMediaId" required/);
  assert.match(html, /14\+14 gün/);
  assert.match(html, /OTA’ya yayın yapılmaz/);
});

runTest('Evaluated experiments retain the non-causal disclosure', () => {
  const html = MarketingUI.renderExperiments([{
    status: 'EVALUATED', verdict: 'POSITIVE_ASSOCIATION', change_date: '2026-08-15',
    primary_metric: 'SEARCH_TO_VIEW_CTR_PERCENT'
  }], null);
  assert.match(html, /Pozitif ilişki/);
  assert.match(html, /nedensellik kanıtı olarak sunulmaz/);
});

runTest('Experiment worker lifecycle states remain visible', () => {
  assert.match(MarketingUI.renderExperiments([{ status: 'PROCESSING' }], null), /Değerlendiriliyor/);
  assert.match(MarketingUI.renderExperiments([{ status: 'FAILED' }], null), /Değerlendirme başarısız/);
});

runTest('Index integrates one independent marketing entry without app.js edits', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.strictEqual((index.match(/id="tab-marketing"/g) || []).length, 1);
  assert.strictEqual((index.match(/src="core\/marketing_ui\.js(?:\?v=[a-f0-9]{8})?"/g) || []).length, 1);
  assert.doesNotMatch(index, /id="tab-marketing-legacy"/);
  assert.match(index, /onclick="switchTab\('marketing'\)"[^>]*>📈 Gelir & Dağıtım/);
});

runTest('Marketing bootstrap and lazy dependencies carry current content hashes', () => {
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const uiSource = fs.readFileSync(path.join(__dirname, 'marketing_ui.js'), 'utf8');
  const hash = file => crypto.createHash('sha1')
    .update(fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n'), 'utf8')
    .digest('hex').slice(0, 8);
  assert.match(index, new RegExp(`core/marketing_ui\\.js\\?v=${hash(path.join(__dirname, 'marketing_ui.js'))}`));
  ['marketing_engine.js', 'marketing_funnel_service.js', 'marketing_priority_service.js', 'marketing_benchmark_service.js', 'marketing_cover_change_service.js', 'marketing_data_service.js', 'marketing_review_service.js', 'marketing_snapshot_service.js', 'marketing_channel_listing_service.js', 'marketing_media_upload_service.js', 'marketing_photo_analysis_service.js', 'marketing_experiment_service.js', 'marketing_photo_results_service.js', 'marketing_health_results_service.js'].forEach(file => {
    assert.match(uiSource, new RegExp(`${file.replace('.', '\\.') }\\?v=${hash(path.join(__dirname, file))}`));
  });
});

console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
if (passedTests !== totalTests) process.exit(1);
