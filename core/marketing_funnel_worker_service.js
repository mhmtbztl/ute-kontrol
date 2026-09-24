// LEXBNB PHASE 17 — SCHEDULED, IDEMPOTENT FUNNEL FINDINGS
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./marketing_funnel_service'), require('./marketing_finding_orchestrator'), require('./business_date'));
  else root.MarketingFunnelWorkerService = factory(root.MarketingFunnelService, root.MarketingFindingOrchestrator, root.LexbnbBusinessDate);
}(typeof self !== 'undefined' ? self : this, function (FunnelService, Orchestrator, BusinessDate) {
  'use strict';
  const DAY = 86400000;
  const field = (o, c, s) => o && (o[c] !== undefined ? o[c] : o[s]);
  function visibility(snapshot, benchmark) {
    const start = Date.parse(field(snapshot, 'periodStart', 'period_start'));
    const end = Date.parse(field(snapshot, 'periodEndExclusive', 'period_end_exclusive'));
    const days = (end - start) / DAY;
    const impressions = Number(snapshot && snapshot.impressions);
    const reference = Number(field(benchmark, 'normalizedImpressionsPerListingDay', 'normalized_impressions_per_listing_day'));
    if (!(days > 0) || !Number.isFinite(impressions) || impressions < 0 || !(reference > 0)) return null;
    return { value: impressions / days, reference, sampleDays: days, metric: 'IMPRESSIONS_PER_LISTING_DAY' };
  }
  async function runFunnelFindings(repository, options = {}) {
    ['loadActiveListings', 'loadLatestSnapshot', 'loadBenchmark', 'persistFinding'].forEach(name => { if (!repository || typeof repository[name] !== 'function') throw new Error(`REPOSITORY_${name.toUpperCase()}_REQUIRED`); });
    const asOfDate = options.asOfDate || BusinessDate.getBusinessDate();
    const listings = await repository.loadActiveListings(options.tenantId || null, options.limit || 200);
    const summary = { status: 'COMPLETED', examined: 0, persisted: 0, skipped: [], errors: [] };
    for (const listing of listings) {
      summary.examined += 1;
      const tenantId = field(listing, 'tenantId', 'tenant_id'); const propertyId = field(listing, 'propertyId', 'property_id');
      try {
        const [snapshot, benchmark] = await Promise.all([repository.loadLatestSnapshot(tenantId, listing.id), repository.loadBenchmark(tenantId, propertyId, asOfDate)]);
        if (!snapshot) { summary.skipped.push({ listingId: listing.id, reason: 'NO_SNAPSHOT' }); continue; }
        const diagnosis = FunnelService.diagnoseFunnel({ snapshot, benchmark: {
          searchToViewCtrPercent: field(benchmark, 'searchToViewCtrPercent', 'search_to_view_ctr_percent'),
          viewToBookingConversionPercent: field(benchmark, 'viewToBookingConversionPercent', 'view_to_booking_conversion_percent')
        }, normalizedVisibility: visibility(snapshot, benchmark) });
        for (const observation of diagnosis.observations) {
          const draft = await Orchestrator.buildFunnelFindingDraft({ tenantId, propertyId, channelListingId: listing.id, observation,
            periodStart: field(snapshot, 'periodStart', 'period_start'), periodEndExclusive: field(snapshot, 'periodEndExclusive', 'period_end_exclusive'),
            expiresAt: new Date(Date.parse(`${asOfDate}T00:00:00Z`) + 14 * DAY).toISOString(), currency: field(listing, 'payoutCurrency', 'payout_currency') || 'TRY' });
          await repository.persistFinding(draft); summary.persisted += 1;
        }
        if (!diagnosis.observations.length) summary.skipped.push({ listingId: listing.id, reason: diagnosis.status });
      } catch (error) { summary.errors.push({ listingId: listing.id, code: String(error.code || error.message || 'FUNNEL_WORKER_FAILED').slice(0, 100) }); }
    }
    if (summary.errors.length) summary.status = summary.persisted ? 'PARTIAL' : 'FAILED';
    return summary;
  }
  return { visibility, runFunnelFindings };
}));
