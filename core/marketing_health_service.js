// =============================================================================
// LEXBNB PHASE 17 — EVIDENCE-WEIGHTED MARKETING HEALTH
// Missing components stay unavailable; they are never replaced with fake 70s.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarketingHealthService = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COMPONENT_WEIGHTS = Object.freeze({
    PHOTO_QUALITY: 20,
    CLICK_PERFORMANCE: 15,
    CONVERSION_POWER: 15,
    VISIBILITY_STRENGTH: 15,
    NET_ECONOMICS: 10,
    REVIEW_STRENGTH: 10,
    AVAILABILITY_FLEX: 10,
    LISTING_DEPTH: 5
  });

  function round(value, digits = 2) {
    const scale = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
  }

  function bounded(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
  }

  function unavailable(reason, evidence = {}) {
    if (!reason) throw new Error('UNAVAILABLE_REASON_REQUIRED');
    return { status: 'UNAVAILABLE', score: null, confidence: 0, reason: String(reason), evidence };
  }

  function available(score, confidence, evidence = {}) {
    if (!Number.isFinite(Number(score)) || Number(score) < 0 || Number(score) > 100) throw new Error('HEALTH_SCORE_OUT_OF_RANGE');
    if (!Number.isFinite(Number(confidence)) || Number(confidence) < 0 || Number(confidence) > 1) throw new Error('HEALTH_CONFIDENCE_OUT_OF_RANGE');
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('HEALTH_EVIDENCE_OBJECT_REQUIRED');
    return { status: 'AVAILABLE', score: round(score), confidence: round(confidence, 3), reason: null, evidence };
  }

  function ratioComponent(input = {}) {
    const value = Number(input.value);
    const reference = Number(input.reference);
    const sampleSize = Number(input.sampleSize);
    const minSampleSize = Number(input.minSampleSize);
    if (!(reference > 0)) return unavailable('REFERENCE_MISSING', { value: input.value, reference: input.reference });
    if (!Number.isFinite(value) || value < 0) return unavailable('VALUE_MISSING', { value: input.value });
    if (!Number.isFinite(sampleSize) || !Number.isFinite(minSampleSize) || sampleSize < minSampleSize) {
      return unavailable('SAMPLE_TOO_SMALL', { sampleSize, minSampleSize });
    }
    const confidence = input.confidence === undefined || input.confidence === null || input.confidence === ''
      ? bounded(sampleSize / Math.max(minSampleSize * 4, 1), 0.5, 1)
      : Number(input.confidence);
    return available(bounded((value / reference) * 100, 0, 100), confidence, {
      value, reference, sampleSize, minSampleSize, provenance: input.provenance || null
    });
  }

  function netEconomicsComponent(input = {}) {
    const roomRevenue = Number(input.roomRevenueBeforeDistribution);
    const netRoomRevenue = Number(input.roomRevenueAfterDistribution);
    const completedBookings = Number(input.completedBookings);
    if (!Number.isFinite(completedBookings) || completedBookings < 2) return unavailable('BOOKING_SAMPLE_TOO_SMALL', { completedBookings });
    if (!(roomRevenue > 0) || !Number.isFinite(netRoomRevenue)) return unavailable('ROOM_REVENUE_MISSING');
    return available(bounded((netRoomRevenue / roomRevenue) * 100, 0, 100), 1, {
      roomRevenueBeforeDistribution: roomRevenue,
      roomRevenueAfterDistribution: netRoomRevenue,
      completedBookings,
      metricDefinition: 'ROOM_REVENUE_AFTER_DISTRIBUTION_RETENTION'
    });
  }

  function evaluateMarketingHealth(components = {}, options = {}) {
    const minimumCoverage = options.minimumCoverage === undefined ? 0.5 : Number(options.minimumCoverage);
    if (!Number.isFinite(minimumCoverage) || minimumCoverage < 0 || minimumCoverage > 1) throw new Error('INVALID_MINIMUM_COVERAGE');
    const rows = [];
    let availableWeight = 0;
    let weightedScore = 0;
    let totalConfidenceContribution = 0;

    for (const [key, weight] of Object.entries(COMPONENT_WEIGHTS)) {
      const component = components[key];
      if (!component || component.status === 'UNAVAILABLE') {
        rows.push({ key, weight, ...(component || unavailable('NOT_PROVIDED')) });
        continue;
      }
      if (component.status !== 'AVAILABLE') throw new Error(`INVALID_COMPONENT_STATUS: ${key}`);
      const checked = available(component.score, component.confidence, component.evidence || {});
      availableWeight += weight;
      weightedScore += checked.score * weight;
      totalConfidenceContribution += checked.confidence * weight;
      rows.push({ key, weight, ...checked });
    }

    const coverage = availableWeight / 100;
    const confidenceIndex = round(totalConfidenceContribution / 100, 3);
    const enoughCoverage = coverage >= minimumCoverage;
    const computedScore = enoughCoverage && availableWeight > 0 ? round(weightedScore / availableWeight) : null;
    const confidenceTier = confidenceIndex >= 0.8 ? 'HIGH'
      : confidenceIndex >= 0.5 ? 'MEDIUM' : 'INSUFFICIENT';
    const reportable = enoughCoverage && confidenceTier !== 'INSUFFICIENT';

    return {
      status: reportable ? 'REPORTABLE' : 'INSUFFICIENT_DATA',
      score: reportable ? computedScore : null,
      coveragePercent: round(coverage * 100),
      confidenceIndex,
      confidenceTier,
      availableWeight,
      missingComponents: rows.filter(row => row.status === 'UNAVAILABLE').map(row => ({ key: row.key, reason: row.reason })),
      components: rows,
      scoringMethod: 'RENORMALIZED_AVAILABLE_COMPONENTS',
      missingDataImputed: false
    };
  }

  return {
    COMPONENT_WEIGHTS,
    unavailable,
    available,
    ratioComponent,
    netEconomicsComponent,
    evaluateMarketingHealth
  };
}));
