// =============================================================================
// LEXBNB PHASE 17 — LISTING CHANGE IMPACT EVALUATION
// Before/after observational comparison. This is deliberately not called A/B.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarketingImpactService = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const METRICS = Object.freeze({
    SEARCH_TO_VIEW_CTR_PERCENT: { numerator: 'listingViews', denominator: 'impressions', minSample: 300 },
    VIEW_TO_BOOKING_CONVERSION_PERCENT: { numerator: 'platformReportedBookings', denominator: 'listingViews', minSample: 50 }
  });

  const DEFAULTS = Object.freeze({
    minDaysPerWindow: 14,
    maxPriceDriftPercent: 15,
    minRelativeEffectPercent: 5,
    significanceAlpha: 0.05,
    highConfidenceSample: 1000
  });

  function round(value, digits = 3) {
    const scale = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
  }

  function dateMs(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed)) return null;
    return new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
  }

  function windowDays(window) {
    const start = dateMs(window && window.startDate);
    const end = dateMs(window && window.endDateExclusive);
    if (start === null || end === null || end <= start) return null;
    return (end - start) / 86400000;
  }

  function readCount(window, key) {
    const snake = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    const value = window[key] !== undefined ? window[key] : window[snake];
    if (!Number.isInteger(Number(value)) || Number(value) < 0) return null;
    return Number(value);
  }

  function normalCdf(value) {
    // Abramowitz-Stegun approximation; adequate for a two-proportion z-test.
    const sign = value < 0 ? -1 : 1;
    const x = Math.abs(value) / Math.sqrt(2);
    const t = 1 / (1 + 0.3275911 * x);
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * erf);
  }

  function compareProportions(beforeNumerator, beforeDenominator, afterNumerator, afterDenominator) {
    const beforeRate = beforeNumerator / beforeDenominator;
    const afterRate = afterNumerator / afterDenominator;
    const pooled = (beforeNumerator + afterNumerator) / (beforeDenominator + afterDenominator);
    const standardError = Math.sqrt(pooled * (1 - pooled) * ((1 / beforeDenominator) + (1 / afterDenominator)));
    const zScore = standardError === 0 ? 0 : (afterRate - beforeRate) / standardError;
    const pValue = standardError === 0 ? 1 : 2 * (1 - normalCdf(Math.abs(zScore)));
    return {
      beforePercent: round(beforeRate * 100),
      afterPercent: round(afterRate * 100),
      absoluteDeltaPoints: round((afterRate - beforeRate) * 100),
      relativeDeltaPercent: beforeRate === 0 ? null : round(((afterRate - beforeRate) / beforeRate) * 100),
      zScore: round(zScore, 4),
      pValue: round(Math.max(0, Math.min(1, pValue)), 5)
    };
  }

  function priceDriftPercent(before, after) {
    const beforePrice = Number(before.averageDisplayedPrice ?? before.average_displayed_price);
    const afterPrice = Number(after.averageDisplayedPrice ?? after.average_displayed_price);
    if (!(beforePrice > 0) || !(afterPrice >= 0)) return null;
    return round(((afterPrice - beforePrice) / beforePrice) * 100);
  }

  function evaluateListingChange(input = {}, options = {}) {
    const config = { ...DEFAULTS, ...options };
    const metricName = String(input.metric || 'SEARCH_TO_VIEW_CTR_PERCENT').toUpperCase();
    const metric = METRICS[metricName];
    if (!metric) throw new Error(`UNSUPPORTED_IMPACT_METRIC: ${metricName}`);

    const before = input.before || {};
    const after = input.after || {};
    const beforeDays = windowDays(before);
    const afterDays = windowDays(after);
    const changeDate = dateMs(input.changeDate);
    const asOfDate = dateMs(input.asOfDate);
    if (beforeDays === null || afterDays === null || changeDate === null || asOfDate === null) {
      throw new Error('INVALID_IMPACT_WINDOW');
    }
    if (dateMs(before.endDateExclusive) > changeDate || dateMs(after.startDate) < changeDate) {
      throw new Error('IMPACT_WINDOWS_OVERLAP_CHANGE');
    }

    const resultBase = {
      metric: metricName,
      method: 'BEFORE_AFTER_OBSERVATIONAL',
      causalClaim: false,
      asOfDate: input.asOfDate,
      beforeDays,
      afterDays,
      thresholds: {
        minDaysPerWindow: config.minDaysPerWindow,
        minSamplePerWindow: options.minSamplePerWindow || metric.minSample,
        maxPriceDriftPercent: config.maxPriceDriftPercent,
        minRelativeEffectPercent: config.minRelativeEffectPercent,
        significanceAlpha: config.significanceAlpha
      }
    };

    const beforeNumerator = readCount(before, metric.numerator);
    const beforeDenominator = readCount(before, metric.denominator);
    const afterNumerator = readCount(after, metric.numerator);
    const afterDenominator = readCount(after, metric.denominator);
    const minSample = resultBase.thresholds.minSamplePerWindow;
    const insufficiencies = [];
    if (dateMs(after.endDateExclusive) > asOfDate) insufficiencies.push('AFTER_WINDOW_NOT_COMPLETE');
    if (beforeDays < config.minDaysPerWindow || afterDays < config.minDaysPerWindow) insufficiencies.push('MINIMUM_WINDOW_NOT_REACHED');
    if (beforeNumerator === null || beforeDenominator === null || afterNumerator === null || afterDenominator === null) insufficiencies.push('COUNTERS_MISSING_OR_INVALID');
    if (beforeDenominator !== null && beforeNumerator !== null && beforeNumerator > beforeDenominator) insufficiencies.push('BEFORE_FUNNEL_ORDER_INVALID');
    if (afterDenominator !== null && afterNumerator !== null && afterNumerator > afterDenominator) insufficiencies.push('AFTER_FUNNEL_ORDER_INVALID');
    if (beforeDenominator !== null && beforeDenominator < minSample) insufficiencies.push('BEFORE_SAMPLE_TOO_SMALL');
    if (afterDenominator !== null && afterDenominator < minSample) insufficiencies.push('AFTER_SAMPLE_TOO_SMALL');
    if (insufficiencies.length > 0) {
      return { ...resultBase, verdict: 'INSUFFICIENT_DATA', confidenceTier: 'INSUFFICIENT', insufficiencies, comparison: null, confounders: [] };
    }

    const comparison = compareProportions(beforeNumerator, beforeDenominator, afterNumerator, afterDenominator);
    const confounders = Array.isArray(input.confounders) ? input.confounders.filter(Boolean).map(String) : [];
    const priceDrift = priceDriftPercent(before, after);
    if (priceDrift !== null && Math.abs(priceDrift) > config.maxPriceDriftPercent) confounders.push('PRICE_DRIFT_EXCEEDS_LIMIT');
    if (Math.abs(beforeDays - afterDays) > 2) confounders.push('WINDOW_LENGTHS_NOT_COMPARABLE');

    const meaningful = comparison.relativeDeltaPercent !== null
      && Math.abs(comparison.relativeDeltaPercent) >= config.minRelativeEffectPercent;
    const statisticallyClear = comparison.pValue < config.significanceAlpha;
    let verdict = 'NO_CLEAR_CHANGE';
    if (confounders.length > 0) verdict = 'CONFOUNDED';
    else if (meaningful && statisticallyClear) verdict = comparison.relativeDeltaPercent > 0 ? 'POSITIVE_ASSOCIATION' : 'NEGATIVE_ASSOCIATION';

    const smallestSample = Math.min(beforeDenominator, afterDenominator);
    const confidenceTier = verdict === 'CONFOUNDED' ? 'LOW'
      : statisticallyClear && smallestSample >= config.highConfidenceSample ? 'HIGH'
        : statisticallyClear ? 'MEDIUM' : 'LOW';

    return {
      ...resultBase,
      verdict,
      confidenceTier,
      insufficiencies: [],
      confounders: [...new Set(confounders)],
      priceDriftPercent: priceDrift,
      comparison
    };
  }

  return { METRICS, DEFAULTS, windowDays, compareProportions, evaluateListingChange };
}));
