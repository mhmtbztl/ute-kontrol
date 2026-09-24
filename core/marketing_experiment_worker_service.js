// LEXBNB PHASE 17 — PROVIDER-FREE OBSERVATIONAL EXPERIMENT WORKER
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./marketing_impact_service'), require('./business_date'));
  else root.MarketingExperimentWorkerService = factory(root.MarketingImpactService, root.LexbnbBusinessDate);
}(typeof self !== 'undefined' ? self : this, function (ImpactService, BusinessDate) {
  'use strict';

  function field(source, camel, snake) {
    return source && (source[camel] !== undefined ? source[camel] : source[snake]);
  }

  function errorCode(error) {
    return String(error && (error.code || error.message) || 'EXPERIMENT_EVALUATION_FAILED')
      .toUpperCase().replace(/[^A-Z0-9_]+/g, '_').slice(0, 100);
  }

  function toWindow(experiment, snapshot, role) {
    const prefix = role === 'BEFORE' ? 'before' : 'after';
    return {
      startDate: field(experiment, `${prefix}StartDate`, `${prefix}_start_date`),
      endDateExclusive: field(experiment, `${prefix}EndExclusive`, `${prefix}_end_exclusive`),
      impressions: snapshot ? snapshot.impressions : null,
      listingViews: snapshot ? field(snapshot, 'listingViews', 'listing_views') : null,
      bookingAttempts: snapshot ? field(snapshot, 'bookingAttempts', 'booking_attempts') : null,
      platformReportedBookings: snapshot ? field(snapshot, 'platformReportedBookings', 'platform_reported_bookings') : null
    };
  }

  async function runNextEvaluation(repository, options = {}) {
    ['claimExperiment', 'loadWindowSnapshot', 'completeExperiment', 'failExperiment'].forEach(name => {
      if (!repository || typeof repository[name] !== 'function') throw new Error(`REPOSITORY_${name.toUpperCase()}_REQUIRED`);
    });
    const experiment = await repository.claimExperiment(options.experimentId || null);
    if (!experiment) return { status: 'IDLE', experimentId: null };
    const leaseToken = field(experiment, 'leaseToken', 'lease_token');
    try {
      if (!leaseToken) throw new Error('EXPERIMENT_LEASE_TOKEN_REQUIRED');
      const tenantId = field(experiment, 'tenantId', 'tenant_id');
      const listingId = field(experiment, 'channelListingId', 'channel_listing_id');
      const before = await repository.loadWindowSnapshot({
        tenantId, listingId,
        startDate: field(experiment, 'beforeStartDate', 'before_start_date'),
        endDateExclusive: field(experiment, 'beforeEndExclusive', 'before_end_exclusive')
      });
      const after = await repository.loadWindowSnapshot({
        tenantId, listingId,
        startDate: field(experiment, 'afterStartDate', 'after_start_date'),
        endDateExclusive: field(experiment, 'afterEndExclusive', 'after_end_exclusive')
      });
      const asOfDate = String(options.asOfDate || BusinessDate.getBusinessDate());
      const result = ImpactService.evaluateListingChange({
        changeDate: field(experiment, 'changeDate', 'change_date'),
        asOfDate,
        metric: field(experiment, 'primaryMetric', 'primary_metric'),
        before: toWindow(experiment, before, 'BEFORE'),
        after: toWindow(experiment, after, 'AFTER'),
        confounders: []
      }, {
        minDaysPerWindow: Number(field(experiment, 'minimumDaysPerWindow', 'minimum_days_per_window')),
        minSamplePerWindow: Number(field(experiment, 'minimumSamplePerWindow', 'minimum_sample_per_window')),
        maxPriceDriftPercent: Number(field(experiment, 'maxPriceDriftPercent', 'max_price_drift_percent'))
      });
      const payload = { ...result, experimentId: experiment.id, tenantId, propertyId: field(experiment, 'propertyId', 'property_id'), channelListingId: listingId };
      const completion = await repository.completeExperiment({
        experimentId: experiment.id, leaseToken,
        beforeSnapshotId: before && before.id || null,
        afterSnapshotId: after && after.id || null,
        resultPayload: payload
      });
      return { status: 'EVALUATED', experimentId: experiment.id, verdict: result.verdict, completion };
    } catch (error) {
      try {
        await repository.failExperiment(experiment.id, leaseToken, errorCode(error), String(error && error.message || error).slice(0, 2000));
        return { status: 'FAILED', experimentId: experiment.id, errorCode: errorCode(error) };
      } catch (failureError) {
        return { status: 'FAILED_UNRECORDED', experimentId: experiment.id, errorCode: errorCode(error), failureRecordError: errorCode(failureError) };
      }
    }
  }

  return { errorCode, toWindow, runNextEvaluation };
}));
