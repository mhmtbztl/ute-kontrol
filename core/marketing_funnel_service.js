// =============================================================================
// LEXBNB PHASE 17 — MARKETING FUNNEL SERVICE
// Raw counter validation, derived rates and non-causal diagnostic observations.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarketingFunnelService = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_THRESHOLDS = Object.freeze({
    clickRatioWarning: 0.80,
    conversionRatioWarning: 0.70,
    minClickImpressions: 500,
    highConfidenceClickImpressions: 2000,
    minConversionViews: 50,
    highConfidenceConversionViews: 200,
    minVisibilityDays: 14,
    highConfidenceVisibilityDays: 28,
    visibilityRatioWarning: 0.75
  });

  const COUNTER_FIELDS = Object.freeze([
    'impressions',
    'listingViews',
    'bookingAttempts',
    'platformReportedBookings',
    'wishlistSaves'
  ]);

  function firstDefined(source, keys, fallback = null) {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
    }
    return fallback;
  }

  function readCounters(snapshot = {}) {
    return {
      impressions: firstDefined(snapshot, ['impressions']),
      listingViews: firstDefined(snapshot, ['listingViews', 'listing_views']),
      bookingAttempts: firstDefined(snapshot, ['bookingAttempts', 'booking_attempts']),
      platformReportedBookings: firstDefined(snapshot, ['platformReportedBookings', 'platform_reported_bookings']),
      wishlistSaves: firstDefined(snapshot, ['wishlistSaves', 'wishlist_saves'])
    };
  }

  function roundRate(value) {
    return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
  }

  function percentage(numerator, denominator) {
    if (numerator === null || denominator === null || denominator <= 0) return null;
    return roundRate((numerator / denominator) * 100);
  }

  function validateSnapshot(snapshot = {}) {
    const counters = readCounters(snapshot);
    const errors = [];
    const warnings = [];

    for (const [field, value] of Object.entries(counters)) {
      if (value === null) continue;
      if (!Number.isInteger(Number(value)) || Number(value) < 0) {
        errors.push({ code: 'INVALID_COUNTER', field, value });
      } else {
        counters[field] = Number(value);
      }
    }

    if (errors.length === 0) {
      if (counters.impressions !== null && counters.listingViews !== null && counters.listingViews > counters.impressions) {
        errors.push({ code: 'VIEWS_EXCEED_IMPRESSIONS', field: 'listingViews' });
      }
      if (counters.listingViews !== null && counters.bookingAttempts !== null && counters.bookingAttempts > counters.listingViews) {
        errors.push({ code: 'ATTEMPTS_EXCEED_VIEWS', field: 'bookingAttempts' });
      }
      const bookingParent = counters.bookingAttempts !== null ? counters.bookingAttempts : counters.listingViews;
      if (bookingParent !== null && counters.platformReportedBookings !== null && counters.platformReportedBookings > bookingParent) {
        errors.push({ code: 'BOOKINGS_EXCEED_PARENT_FUNNEL_STEP', field: 'platformReportedBookings' });
      }
      if (counters.listingViews !== null && counters.wishlistSaves !== null && counters.wishlistSaves > counters.listingViews) {
        errors.push({ code: 'WISHLISTS_EXCEED_VIEWS', field: 'wishlistSaves' });
      }
    }

    const presentCount = COUNTER_FIELDS.filter(field => counters[field] !== null).length;
    if (presentCount < COUNTER_FIELDS.length) {
      warnings.push({ code: 'PARTIAL_FUNNEL', presentFields: presentCount, totalFields: COUNTER_FIELDS.length });
    }

    return {
      valid: errors.length === 0,
      status: errors.length > 0 ? 'INVALID' : warnings.length > 0 ? 'PARTIAL' : 'VALID',
      counters,
      errors,
      warnings,
      coveragePercent: roundRate((presentCount / COUNTER_FIELDS.length) * 100)
    };
  }

  function deriveFunnelMetrics(snapshot = {}) {
    const validation = validateSnapshot(snapshot);
    if (!validation.valid) {
      return { validation, rates: null };
    }
    const c = validation.counters;
    return {
      validation,
      rates: {
        searchToViewCtrPercent: percentage(c.listingViews, c.impressions),
        viewToAttemptConversionPercent: percentage(c.bookingAttempts, c.listingViews),
        viewToBookingConversionPercent: percentage(c.platformReportedBookings, c.listingViews),
        attemptToBookingConversionPercent: percentage(c.platformReportedBookings, c.bookingAttempts),
        searchToBookingConversionPercent: percentage(c.platformReportedBookings, c.impressions),
        viewToWishlistSavePercent: percentage(c.wishlistSaves, c.listingViews)
      }
    };
  }

  function confidenceTier(sampleSize, minimum, high) {
    if (!Number.isFinite(sampleSize) || sampleSize < minimum) return 'INSUFFICIENT';
    if (sampleSize >= high) return 'HIGH';
    return 'MEDIUM';
  }

  function relativeDeltaPercent(value, reference) {
    if (!Number.isFinite(value) || !Number.isFinite(reference) || reference <= 0) return null;
    return roundRate(((value - reference) / reference) * 100);
  }

  function makeObservation({ code, metric, observed, reference, sampleSize, confidence, hypotheses, recommendedChecks }) {
    return {
      type: 'OBSERVATION',
      code,
      metric,
      observed,
      reference,
      relativeDeltaPercent: relativeDeltaPercent(observed, reference),
      sampleSize,
      confidenceTier: confidence,
      causalClaim: false,
      hypotheses,
      recommendedChecks
    };
  }

  function diagnoseFunnel(params = {}) {
    const {
      snapshot = {},
      benchmark = {},
      normalizedVisibility = null,
      thresholds = {}
    } = params;
    const config = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const derived = deriveFunnelMetrics(snapshot);

    if (!derived.validation.valid) {
      return {
        status: 'INVALID_INPUT',
        observations: [],
        insufficientSignals: [],
        validation: derived.validation
      };
    }

    const c = derived.validation.counters;
    const rates = derived.rates;
    const observations = [];
    const insufficientSignals = [];

    if (normalizedVisibility) {
      const value = Number(normalizedVisibility.value);
      const reference = Number(normalizedVisibility.reference);
      const sampleDays = Number(normalizedVisibility.sampleDays);
      const confidence = confidenceTier(sampleDays, config.minVisibilityDays, config.highConfidenceVisibilityDays);
      if (confidence === 'INSUFFICIENT') {
        insufficientSignals.push({ code: 'VISIBILITY_SAMPLE_TOO_SMALL', sampleSize: sampleDays, required: config.minVisibilityDays });
      } else if (reference > 0 && value / reference < config.visibilityRatioWarning) {
        observations.push(makeObservation({
          code: 'VISIBILITY_BELOW_REFERENCE', metric: normalizedVisibility.metric || 'NORMALIZED_IMPRESSIONS',
          observed: value, reference, sampleSize: sampleDays, confidence,
          hypotheses: ['Availability restrictions', 'Minimum-stay rules', 'Relative price position', 'Platform ranking changes'],
          recommendedChecks: ['Compare open inventory', 'Review minimum-stay rules', 'Compare price index', 'Check platform listing status']
        }));
      }
    } else {
      insufficientSignals.push({ code: 'NORMALIZED_VISIBILITY_NOT_PROVIDED' });
    }

    const clickReference = Number(benchmark.searchToViewCtrPercent);
    const clickConfidence = confidenceTier(c.impressions, config.minClickImpressions, config.highConfidenceClickImpressions);
    if (rates.searchToViewCtrPercent === null || !(clickReference > 0)) {
      insufficientSignals.push({ code: 'CLICK_REFERENCE_OR_RATE_MISSING' });
    } else if (clickConfidence === 'INSUFFICIENT') {
      insufficientSignals.push({ code: 'CLICK_SAMPLE_TOO_SMALL', sampleSize: c.impressions, required: config.minClickImpressions });
    } else if (rates.searchToViewCtrPercent / clickReference < config.clickRatioWarning) {
      observations.push(makeObservation({
        code: 'CLICK_RATE_BELOW_REFERENCE', metric: 'SEARCH_TO_VIEW_CTR_PERCENT',
        observed: rates.searchToViewCtrPercent, reference: clickReference,
        sampleSize: c.impressions, confidence: clickConfidence,
        hypotheses: ['Cover image', 'Displayed price', 'Listing title', 'Search-audience mismatch'],
        recommendedChecks: ['Review mobile thumbnail', 'Compare displayed total price', 'Review title and primary USP', 'Segment by search dates']
      }));
    }

    const conversionReference = Number(benchmark.viewToBookingConversionPercent);
    const conversionConfidence = confidenceTier(c.listingViews, config.minConversionViews, config.highConfidenceConversionViews);
    if (rates.viewToBookingConversionPercent === null || !(conversionReference > 0)) {
      insufficientSignals.push({ code: 'CONVERSION_REFERENCE_OR_RATE_MISSING' });
    } else if (conversionConfidence === 'INSUFFICIENT') {
      insufficientSignals.push({ code: 'CONVERSION_SAMPLE_TOO_SMALL', sampleSize: c.listingViews, required: config.minConversionViews });
    } else if (rates.viewToBookingConversionPercent / conversionReference < config.conversionRatioWarning) {
      observations.push(makeObservation({
        code: 'CONVERSION_RATE_BELOW_REFERENCE', metric: 'VIEW_TO_BOOKING_CONVERSION_PERCENT',
        observed: rates.viewToBookingConversionPercent, reference: conversionReference,
        sampleSize: c.listingViews, confidence: conversionConfidence,
        hypotheses: ['Total checkout price', 'Availability or stay rules', 'Gallery coverage', 'Reviews or cancellation terms'],
        recommendedChecks: ['Inspect checkout price', 'Review calendar restrictions', 'Audit gallery coverage', 'Review recent ratings and policies']
      }));
    }

    return {
      status: observations.length > 0 ? 'OBSERVATIONS_FOUND' : insufficientSignals.length > 0 ? 'LIMITED_DATA' : 'NO_NEGATIVE_SIGNAL',
      observations,
      insufficientSignals,
      metrics: rates,
      validation: derived.validation
    };
  }

  return { DEFAULT_THRESHOLDS, validateSnapshot, deriveFunnelMetrics, diagnoseFunnel };
}));

