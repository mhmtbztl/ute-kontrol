// LEXBNB PHASE 17 — IDEMPOTENT SEASONAL FINDING SCHEDULER
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./seasonal_marketing_service'), require('./marketing_photo_results_service'));
  } else root.SeasonalMarketingWorkerService = factory(root.SeasonalMarketingService, root.MarketingPhotoResultsService);
}(typeof self !== 'undefined' ? self : this, function (SeasonalService, PhotoResultsService) {
  'use strict';

  function field(source, camel, snake) {
    return source && (source[camel] !== undefined ? source[camel] : source[snake]);
  }

  function candidateInputs(view, media) {
    const byId = new Map(media.map(item => [item.id, item]));
    const candidates = view.coverCandidates.map(item => ({
      mediaId: item.mediaId,
      coverScore: item.score,
      confidence: view.confidencePercent / 100,
      seasonTags: field(byId.get(item.mediaId), 'seasonTags', 'season_tags') || []
    }));
    if (view.currentCover && !candidates.some(item => item.mediaId === view.currentCover.mediaId)) {
      const source = byId.get(view.currentCover.mediaId);
      candidates.push({
        mediaId: view.currentCover.mediaId, coverScore: view.currentCover.score,
        confidence: view.confidencePercent / 100, seasonTags: field(source, 'seasonTags', 'season_tags') || []
      });
    }
    return candidates;
  }

  async function runSeasonalReview(repository, options = {}) {
    ['loadLatestAnalysisRuns', 'loadActiveMedia', 'loadActiveListings', 'persistFinding'].forEach(name => {
      if (!repository || typeof repository[name] !== 'function') throw new Error(`REPOSITORY_${name.toUpperCase()}_REQUIRED`);
    });
    const asOfDate = String(options.asOfDate || new Date().toISOString().slice(0, 10));
    SeasonalService.seasonForDate(asOfDate);
    const runs = await repository.loadLatestAnalysisRuns(options.tenantId || null, options.limit || 100);
    const newestByProperty = new Map();
    runs.forEach(run => {
      const key = `${field(run, 'tenantId', 'tenant_id')}:${field(run, 'propertyId', 'property_id')}`;
      if (!newestByProperty.has(key)) newestByProperty.set(key, run);
    });
    const summary = { status: 'COMPLETED', examinedProperties: 0, eligibleListings: 0, findingsPersisted: 0, skipped: [], errors: [] };
    for (const run of newestByProperty.values()) {
      const tenantId = field(run, 'tenantId', 'tenant_id');
      const propertyId = field(run, 'propertyId', 'property_id');
      summary.examinedProperties += 1;
      try {
        const [media, listings] = await Promise.all([
          repository.loadActiveMedia(tenantId, propertyId), repository.loadActiveListings(tenantId, propertyId)
        ]);
        const view = PhotoResultsService.buildPhotoResultView({ runs: [run], propertyId, media });
        if (!view.available) { summary.skipped.push({ propertyId, reason: view.reason }); continue; }
        const candidates = candidateInputs(view, media);
        for (const listing of listings) {
          summary.eligibleListings += 1;
          const draft = await SeasonalService.buildSeasonalFinding({
            tenantId, propertyId, channelListingId: listing.id, asOfDate,
            currentCoverMediaId: view.currentCover && view.currentCover.mediaId || null,
            candidates, currency: field(listing, 'payoutCurrency', 'payout_currency') || 'TRY'
          });
          if (draft) { await repository.persistFinding(draft); summary.findingsPersisted += 1; }
        }
      } catch (error) {
        summary.errors.push({ propertyId, code: String(error.code || error.message || 'SEASONAL_REVIEW_FAILED').slice(0, 100) });
      }
    }
    if (summary.errors.length) summary.status = summary.findingsPersisted ? 'PARTIAL' : 'FAILED';
    return summary;
  }

  return { candidateInputs, runSeasonalReview };
}));
