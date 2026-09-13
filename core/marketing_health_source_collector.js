// LEXBNB PHASE 17 — EVIDENCE-BACKED HEALTH SOURCE COLLECTOR
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./marketing_engine'), require('./marketing_photo_results_service'), require('crypto'));
  else root.MarketingHealthSourceCollector = factory(root.MarketingEngine, root.MarketingPhotoResultsService, root.crypto);
}(typeof self !== 'undefined' ? self : this, function (MarketingEngine, PhotoResults, CryptoProvider) {
  'use strict';
  const DAY = 86400000;
  const field = (o, c, s) => o && (o[c] !== undefined ? o[c] : o[s]);
  const value = (o, c, s) => { const n = Number(field(o, c, s)); return Number.isFinite(n) && n > 0 ? n : null; };
  const round = n => Math.round((n + Number.EPSILON) * 1000) / 1000;
  async function hash(text) {
    if (CryptoProvider.createHash) return CryptoProvider.createHash('sha256').update(text).digest('hex');
    const digest = await CryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function latestByListing(snapshots) {
    const map = new Map();
    snapshots.slice().sort((a, b) => {
      const periodOrder = String(field(b, 'periodEndExclusive', 'period_end_exclusive') || '')
        .localeCompare(String(field(a, 'periodEndExclusive', 'period_end_exclusive') || ''));
      return periodOrder || String(field(b, 'createdAt', 'created_at') || '')
        .localeCompare(String(field(a, 'createdAt', 'created_at') || ''));
    }).forEach(row => {
      const id = field(row, 'channelListingId', 'channel_listing_id'); if (id && !map.has(id)) map.set(id, row);
    });
    return [...map.values()];
  }
  function confidence(sample, minimum, maximum, benchmarkConfidence) {
    return Math.min(Number(benchmarkConfidence), Math.max(0.5, Math.min(1, sample / maximum)), sample >= minimum ? 1 : 0);
  }
  function base(scope, key, kind, source, sourceId, evidence, asOf, expiresAt) {
    return { tenantId: scope.tenantId, propertyId: scope.propertyId, componentKey: key, measurementKind: kind,
      status: 'AVAILABLE', reason: null, sourceKind: source, sourceRecordId: sourceId, evidence, asOf, expiresAt };
  }
  function buildDrafts(input) {
    const { scope, benchmark, media = [], photoRuns = [], snapshots = [], bookings = [], asOf, periodStart } = input;
    const expiresAt = new Date(Date.parse(asOf) + 7 * DAY).toISOString();
    const drafts = [];
    const photo = PhotoResults.buildPhotoResultView({ runs: photoRuns, propertyId: scope.propertyId, media });
    if (photo.available) drafts.push({ ...base(scope, 'PHOTO_QUALITY', 'DIRECT_SCORE', 'PHOTO_ANALYSIS', photo.runId, { runId: photo.runId }, asOf, expiresAt), observedValue: photo.galleryScore, referenceValue: null, sampleSize: media.length, minSampleSize: null, confidence: photo.confidencePercent / 100 });
    const current = latestByListing(snapshots).filter(row => String(row.validation_status || 'VALID') !== 'NEEDS_REVIEW');
    const clickRows = current.filter(row => row.impressions !== null && row.impressions !== undefined && field(row, 'listingViews', 'listing_views') !== null && field(row, 'listingViews', 'listing_views') !== undefined);
    const impressions = clickRows.reduce((sum, row) => sum + Number(row.impressions), 0);
    const views = clickRows.reduce((sum, row) => sum + Number(field(row, 'listingViews', 'listing_views')), 0);
    const benchmarkConfidence = Number(benchmark && benchmark.confidence);
    const clickRef = value(benchmark, 'searchToViewCtrPercent', 'search_to_view_ctr_percent');
    if (clickRef && impressions >= 500) drafts.push({ ...base(scope, 'CLICK_PERFORMANCE', 'RATIO', 'CHANNEL_SNAPSHOTS', clickRows.map(r => r.id).join(','), { snapshotIds: clickRows.map(r => r.id) }, asOf, expiresAt), observedValue: round(views / impressions * 100), referenceValue: clickRef, sampleSize: impressions, minSampleSize: 500, confidence: confidence(impressions, 500, 2000, benchmarkConfidence) });
    const conversionRows = current.filter(row => field(row, 'listingViews', 'listing_views') != null && field(row, 'platformReportedBookings', 'platform_reported_bookings') != null);
    const convViews = conversionRows.reduce((sum, row) => sum + Number(field(row, 'listingViews', 'listing_views')), 0);
    const platformBookings = conversionRows.reduce((sum, row) => sum + Number(field(row, 'platformReportedBookings', 'platform_reported_bookings')), 0);
    const convRef = value(benchmark, 'viewToBookingConversionPercent', 'view_to_booking_conversion_percent');
    if (convRef && convViews >= 50) drafts.push({ ...base(scope, 'CONVERSION_POWER', 'RATIO', 'CHANNEL_SNAPSHOTS', conversionRows.map(r => r.id).join(','), { snapshotIds: conversionRows.map(r => r.id) }, asOf, expiresAt), observedValue: round(platformBookings / convViews * 100), referenceValue: convRef, sampleSize: convViews, minSampleSize: 50, confidence: confidence(convViews, 50, 200, benchmarkConfidence) });
    const visibleRows = current.filter(row => row.impressions !== null && row.impressions !== undefined
      && Number.isFinite(Number(row.impressions))
      && Date.parse(field(row, 'periodStart', 'period_start')) < Date.parse(field(row, 'periodEndExclusive', 'period_end_exclusive')));
    const listingDays = visibleRows.reduce((sum, row) => sum + (Date.parse(field(row, 'periodEndExclusive', 'period_end_exclusive')) - Date.parse(field(row, 'periodStart', 'period_start'))) / DAY, 0);
    const visibilityRef = value(benchmark, 'normalizedImpressionsPerListingDay', 'normalized_impressions_per_listing_day');
    if (visibilityRef && listingDays >= 14) drafts.push({ ...base(scope, 'VISIBILITY_STRENGTH', 'RATIO', 'CHANNEL_SNAPSHOTS', visibleRows.map(r => r.id).join(','), { snapshotIds: visibleRows.map(r => r.id), listingDays }, asOf, expiresAt), observedValue: round(visibleRows.reduce((s, r) => s + Number(r.impressions), 0) / listingDays), referenceValue: visibilityRef, sampleSize: listingDays, minSampleSize: 14, confidence: confidence(listingDays, 14, 56, benchmarkConfidence) });
    const mediaRef = value(benchmark, 'recommendedActiveMediaCount', 'recommended_active_media_count');
    if (mediaRef && media.length) drafts.push({ ...base(scope, 'LISTING_DEPTH', 'RATIO', 'ACTIVE_MEDIA', media.map(m => m.id).sort().join(','), { activeMediaIds: media.map(m => m.id).sort() }, asOf, expiresAt), observedValue: media.length, referenceValue: mediaRef, sampleSize: media.length, minSampleSize: 1, confidence: benchmarkConfidence });
    const economics = MarketingEngine.computeChannelEconomics({ bookings, propertyId: scope.propertyId, periodStart, periodEndExclusive: asOf.slice(0, 10), baseCurrency: 'TRY' });
    if (economics.totals.reservationCount >= 2 && economics.totals.roomRevenueBeforeDistribution > 0) drafts.push({ ...base(scope, 'NET_ECONOMICS', 'NET_ECONOMICS', 'BOOKINGS', `${periodStart}:${asOf.slice(0, 10)}`, { periodStart, periodEndExclusive: asOf.slice(0, 10), bookingCount: economics.totals.reservationCount }, asOf, expiresAt), observedValue: economics.totals.roomRevenueAfterDistribution, referenceValue: economics.totals.roomRevenueBeforeDistribution, sampleSize: economics.totals.reservationCount, minSampleSize: 2, confidence: 1 });
    return drafts;
  }
  async function collectProperty(repository, scope, options) {
    const asOf = options.asOf; const periodStart = new Date(Date.parse(asOf) - 90 * DAY).toISOString().slice(0, 10);
    const [benchmark, media, photoRuns, snapshots, bookings] = await Promise.all([
      repository.loadBenchmark(scope.tenantId, scope.propertyId, asOf.slice(0, 10)), repository.loadActiveMedia(scope.tenantId, scope.propertyId),
      repository.loadPhotoRuns(scope.tenantId, scope.propertyId), repository.loadChannelSnapshots(scope.tenantId, scope.propertyId, periodStart, asOf.slice(0, 10)),
      repository.loadBookings(scope.tenantId, scope.propertyId, periodStart, asOf.slice(0, 10))
    ]);
    const drafts = buildDrafts({ scope, benchmark, media, photoRuns, snapshots, bookings, asOf, periodStart });
    const ids = [];
    for (const draft of drafts) {
      draft.inputFingerprint = await hash(JSON.stringify({
        collectionDate: asOf.slice(0, 10), tenantId: draft.tenantId, propertyId: draft.propertyId,
        componentKey: draft.componentKey, measurementKind: draft.measurementKind,
        observedValue: draft.observedValue, referenceValue: draft.referenceValue,
        sampleSize: draft.sampleSize, minSampleSize: draft.minSampleSize,
        confidence: draft.confidence, sourceKind: draft.sourceKind,
        sourceRecordId: draft.sourceRecordId, evidence: draft.evidence
      }));
      ids.push(await repository.recordInput(draft));
    }
    return { propertyId: scope.propertyId, recorded: ids.length, components: drafts.map(d => d.componentKey) };
  }
  async function runCollector(repository, options = {}) {
    const required = ['loadPropertyScopes', 'loadBenchmark', 'loadActiveMedia', 'loadPhotoRuns', 'loadChannelSnapshots', 'loadBookings', 'recordInput'];
    required.forEach(name => { if (!repository || typeof repository[name] !== 'function') throw new Error(`REPOSITORY_${name.toUpperCase()}_REQUIRED`); });
    const asOf = options.asOf || new Date().toISOString();
    if (!Number.isFinite(Date.parse(asOf))) throw new Error('VALID_COLLECTOR_AS_OF_REQUIRED');
    const scopes = await repository.loadPropertyScopes(options.tenantId || null, options.limit || 100);
    const summary = { status: 'COMPLETED', examined: 0, recorded: 0, results: [], errors: [] };
    for (const scope of scopes) {
      summary.examined += 1;
      try {
        const result = await collectProperty(repository, scope, { asOf });
        summary.results.push(result); summary.recorded += result.recorded;
      } catch (error) {
        summary.errors.push({ propertyId: scope.propertyId, code: String(error.code || error.message || 'HEALTH_SOURCE_COLLECTION_FAILED').slice(0, 100) });
      }
    }
    if (summary.errors.length) summary.status = summary.recorded ? 'PARTIAL' : 'FAILED';
    return summary;
  }
  return { latestByListing, buildDrafts, collectProperty, runCollector };
}));
