// =============================================================================
// LEXBNB PHASE 17 — RAW MARKETING HEALTH COMPONENT INPUT CONTRACT
// Trusted importers provide measurements; the health worker owns final scoring.
// =============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./marketing_health_service'));
  else root.MarketingHealthInputService = factory(root.MarketingHealthService);
}(typeof self !== 'undefined' ? self : this, function (HealthService) {
  'use strict';

  const COMPONENT_KINDS = Object.freeze({
    PHOTO_QUALITY: 'DIRECT_SCORE',
    CLICK_PERFORMANCE: 'RATIO',
    CONVERSION_POWER: 'RATIO',
    VISIBILITY_STRENGTH: 'RATIO',
    NET_ECONOMICS: 'NET_ECONOMICS',
    REVIEW_STRENGTH: 'RATIO',
    AVAILABILITY_FLEX: 'RATIO',
    LISTING_DEPTH: 'RATIO'
  });

  function field(source, camel, snake) {
    return source && (source[camel] !== undefined ? source[camel] : source[snake]);
  }

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function componentFromInput(input = {}) {
    const key = String(field(input, 'componentKey', 'component_key') || '').toUpperCase();
    const kind = String(field(input, 'measurementKind', 'measurement_kind') || '').toUpperCase();
    if (!COMPONENT_KINDS[key] || COMPONENT_KINDS[key] !== kind) throw new Error('HEALTH_INPUT_KIND_MISMATCH');
    const source = String(field(input, 'sourceKind', 'source_kind') || '').trim();
    if (!source) throw new Error('HEALTH_INPUT_SOURCE_REQUIRED');
    const evidence = input.evidence && typeof input.evidence === 'object' && !Array.isArray(input.evidence)
      ? { ...input.evidence, sourceKind: source, inputId: input.id || null }
      : { sourceKind: source, inputId: input.id || null };
    if (String(input.status || 'AVAILABLE').toUpperCase() === 'UNAVAILABLE') {
      return HealthService.unavailable(String(input.reason || 'SOURCE_UNAVAILABLE'), evidence);
    }
    const observed = finite(field(input, 'observedValue', 'observed_value'));
    const reference = finite(field(input, 'referenceValue', 'reference_value'));
    const sampleSize = finite(field(input, 'sampleSize', 'sample_size'));
    const minSampleSize = finite(field(input, 'minSampleSize', 'min_sample_size'));
    const confidence = finite(input.confidence);
    if (kind === 'DIRECT_SCORE') {
      if (observed === null || confidence === null) return HealthService.unavailable('DIRECT_SCORE_MISSING', evidence);
      return HealthService.available(observed, confidence, evidence);
    }
    if (kind === 'NET_ECONOMICS') {
      return HealthService.netEconomicsComponent({
        roomRevenueAfterDistribution: observed,
        roomRevenueBeforeDistribution: reference,
        completedBookings: sampleSize,
        provenance: evidence
      });
    }
    return HealthService.ratioComponent({
      value: observed, reference, sampleSize, minSampleSize, confidence,
      provenance: evidence
    });
  }

  function latestInputsByComponent(inputs = [], asOf) {
    const boundary = Date.parse(asOf || '');
    if (!Number.isFinite(boundary)) throw new Error('VALID_HEALTH_AS_OF_REQUIRED');
    const latest = new Map();
    inputs.slice().sort((a, b) => String(field(b, 'asOf', 'as_of') || '').localeCompare(String(field(a, 'asOf', 'as_of') || '')))
      .forEach(input => {
        const key = String(field(input, 'componentKey', 'component_key') || '').toUpperCase();
        const observedAt = Date.parse(field(input, 'asOf', 'as_of') || '');
        const expiresAt = Date.parse(field(input, 'expiresAt', 'expires_at') || '');
        if (!COMPONENT_KINDS[key] || latest.has(key) || !Number.isFinite(observedAt) || observedAt > boundary) return;
        if (Number.isFinite(expiresAt) && expiresAt <= boundary) return;
        latest.set(key, input);
      });
    return latest;
  }

  function buildComponents(inputs, asOf) {
    const latest = latestInputsByComponent(inputs, asOf);
    const components = {};
    Object.keys(COMPONENT_KINDS).forEach(key => {
      components[key] = latest.has(key)
        ? componentFromInput(latest.get(key))
        : HealthService.unavailable('NO_CURRENT_SOURCE_INPUT');
    });
    return { components, sourceInputIds: [...latest.values()].map(input => input.id).filter(Boolean).sort() };
  }

  return { COMPONENT_KINDS, componentFromInput, latestInputsByComponent, buildComponents };
}));
