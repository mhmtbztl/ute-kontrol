// =============================================================================
// LEXBNB PHASE 17 — VERIFIED MARKETING HEALTH SNAPSHOT VIEW
// Renders only immutable backend snapshots; never computes or fills scores here.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarketingHealthResultsService = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COMPONENT_KEYS = Object.freeze([
    'PHOTO_QUALITY', 'CLICK_PERFORMANCE', 'CONVERSION_POWER', 'VISIBILITY_STRENGTH',
    'NET_ECONOMICS', 'REVIEW_STRENGTH', 'AVAILABILITY_FLEX', 'LISTING_DEPTH'
  ]);

  function value(row, camel, snake) {
    return row && row[camel] !== undefined ? row[camel] : row && row[snake];
  }

  function finiteInRange(input, min, max) {
    const number = Number(input);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  }

  function propertyOf(row) {
    return value(row, 'propertyId', 'property_id');
  }

  function latestForProperty(snapshots, propertyId) {
    return (Array.isArray(snapshots) ? snapshots : [])
      .filter(row => propertyOf(row) === propertyId)
      .sort((a, b) => String(value(b, 'asOf', 'as_of') || '').localeCompare(String(value(a, 'asOf', 'as_of') || '')))[0] || null;
  }

  function unavailable(reason, snapshot) {
    return {
      available: false,
      reason,
      snapshotId: snapshot && snapshot.id || null,
      asOf: snapshot ? value(snapshot, 'asOf', 'as_of') || null : null
    };
  }

  function buildHealthView(input = {}) {
    const propertyId = input.propertyId;
    if (!propertyId) return unavailable('PROPERTY_REQUIRED');
    const snapshot = latestForProperty(input.snapshots, propertyId);
    if (!snapshot) return unavailable('NO_SNAPSHOT');

    const status = String(snapshot.status || '').toUpperCase();
    const coveragePercent = finiteInRange(value(snapshot, 'coveragePercent', 'coverage_percent'), 0, 100);
    const confidenceIndex = finiteInRange(value(snapshot, 'confidenceIndex', 'confidence_index'), 0, 1);
    const confidenceTier = String(value(snapshot, 'confidenceTier', 'confidence_tier') || '').toUpperCase();
    const missingDataImputed = value(snapshot, 'missingDataImputed', 'missing_data_imputed');
    const scoringMethod = value(snapshot, 'scoringMethod', 'scoring_method');
    const components = Array.isArray(snapshot.components) ? snapshot.components : null;
    const missingComponents = Array.isArray(value(snapshot, 'missingComponents', 'missing_components'))
      ? value(snapshot, 'missingComponents', 'missing_components') : null;

    if (coveragePercent === null || confidenceIndex === null || !['INSUFFICIENT', 'MEDIUM', 'HIGH'].includes(confidenceTier)
      || missingDataImputed !== false || scoringMethod !== 'RENORMALIZED_AVAILABLE_COMPONENTS'
      || !components || !missingComponents) {
      return unavailable('INVALID_SNAPSHOT', snapshot);
    }

    const safeMissing = missingComponents
      .filter(item => item && COMPONENT_KEYS.includes(String(item.key || '').toUpperCase()))
      .map(item => ({ key: String(item.key).toUpperCase(), reason: String(item.reason || 'NOT_PROVIDED') }));

    if (status === 'INSUFFICIENT_DATA') {
      if (snapshot.score !== null && snapshot.score !== undefined) return unavailable('INVALID_SNAPSHOT', snapshot);
      return {
        ...unavailable('INSUFFICIENT_DATA', snapshot), coveragePercent, confidenceIndex,
        confidenceTier, missingComponents: safeMissing
      };
    }

    const score = finiteInRange(snapshot.score, 0, 100);
    if (status !== 'REPORTABLE' || score === null || coveragePercent < 50
      || !['MEDIUM', 'HIGH'].includes(confidenceTier)) {
      return unavailable('INVALID_SNAPSHOT', snapshot);
    }

    return {
      available: true,
      reason: null,
      snapshotId: snapshot.id || null,
      propertyId,
      asOf: value(snapshot, 'asOf', 'as_of') || null,
      generatedAt: value(snapshot, 'generatedAt', 'generated_at') || null,
      scoringVersion: value(snapshot, 'scoringVersion', 'scoring_version') || null,
      score,
      coveragePercent,
      confidenceIndex,
      confidenceTier,
      missingComponents: safeMissing
    };
  }

  return { COMPONENT_KEYS, latestForProperty, buildHealthView };
}));
