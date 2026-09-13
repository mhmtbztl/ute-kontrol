// =============================================================================
// LEXBNB PHASE 17 — IMMUTABLE PROPERTY MARKETING BENCHMARK CLIENT
// =============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('crypto'));
  else root.MarketingBenchmarkService = factory(root.crypto);
}(typeof self !== 'undefined' ? self : this, function (CryptoProvider) {
  'use strict';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const SOURCE_KINDS = Object.freeze(['PORTFOLIO_HISTORY', 'MARKET_PROVIDER', 'MANUAL_RESEARCH']);

  function date(value, name, optional = false) {
    if (optional && !value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new Error(`VALID_${name}_REQUIRED`);
    const parsed = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) throw new Error(`VALID_${name}_REQUIRED`);
    return value;
  }

  function optionalPositive(value, name, integer = false) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0 || (integer && !Number.isInteger(number))) throw new Error(`INVALID_${name}`);
    return number;
  }

  function validate(input = {}) {
    if (!UUID_RE.test(String(input.tenantId || ''))) throw new Error('VALID_TENANT_ID_REQUIRED');
    if (!UUID_RE.test(String(input.propertyId || ''))) throw new Error('VALID_PROPERTY_ID_REQUIRED');
    const sourceKind = String(input.sourceKind || '').trim().toUpperCase();
    if (!SOURCE_KINDS.includes(sourceKind)) throw new Error('INVALID_BENCHMARK_SOURCE_KIND');
    const effectiveFrom = date(input.effectiveFrom, 'EFFECTIVE_FROM');
    const effectiveToExclusive = date(input.effectiveToExclusive, 'EFFECTIVE_TO_EXCLUSIVE', true);
    if (effectiveToExclusive && effectiveToExclusive <= effectiveFrom) throw new Error('INVALID_BENCHMARK_WINDOW');
    const values = {
      searchToViewCtrPercent: optionalPositive(input.searchToViewCtrPercent, 'SEARCH_TO_VIEW_CTR_PERCENT'),
      viewToBookingConversionPercent: optionalPositive(input.viewToBookingConversionPercent, 'VIEW_TO_BOOKING_CONVERSION_PERCENT'),
      normalizedImpressionsPerListingDay: optionalPositive(input.normalizedImpressionsPerListingDay, 'NORMALIZED_IMPRESSIONS_PER_LISTING_DAY'),
      recommendedActiveMediaCount: optionalPositive(input.recommendedActiveMediaCount, 'RECOMMENDED_ACTIVE_MEDIA_COUNT', true)
    };
    if (!Object.values(values).some(value => value !== null)) throw new Error('AT_LEAST_ONE_BENCHMARK_REQUIRED');
    const confidence = Number(input.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('INVALID_BENCHMARK_CONFIDENCE');
    return {
      tenantId: input.tenantId, propertyId: input.propertyId, sourceKind,
      sourceRecordId: input.sourceRecordId ? String(input.sourceRecordId).slice(0, 300) : null,
      effectiveFrom, effectiveToExclusive, confidence,
      evidence: input.evidence && typeof input.evidence === 'object' && !Array.isArray(input.evidence) ? input.evidence : {},
      ...values
    };
  }

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((result, key) => { result[key] = stable(value[key]); return result; }, {});
  }

  async function sha256(text) {
    if (CryptoProvider && typeof CryptoProvider.createHash === 'function') return CryptoProvider.createHash('sha256').update(text).digest('hex');
    if (CryptoProvider && CryptoProvider.subtle) {
      const digest = await CryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('SHA256_UNAVAILABLE');
  }

  async function fingerprint(valid) {
    return sha256(JSON.stringify(stable(valid)));
  }

  async function recordBenchmark(client, input = {}) {
    if (!client || typeof client.rpc !== 'function') throw new Error('SUPABASE_CLIENT_REQUIRED');
    const valid = validate(input);
    const benchmarkFingerprint = await fingerprint(valid);
    const response = await client.rpc('record_property_marketing_benchmark', {
      p_tenant_id: valid.tenantId, p_property_id: valid.propertyId,
      p_benchmark_fingerprint: benchmarkFingerprint, p_source_kind: valid.sourceKind,
      p_source_record_id: valid.sourceRecordId, p_effective_from: valid.effectiveFrom,
      p_effective_to_exclusive: valid.effectiveToExclusive,
      p_search_to_view_ctr_percent: valid.searchToViewCtrPercent,
      p_view_to_booking_conversion_percent: valid.viewToBookingConversionPercent,
      p_normalized_impressions_per_listing_day: valid.normalizedImpressionsPerListingDay,
      p_recommended_active_media_count: valid.recommendedActiveMediaCount,
      p_confidence: valid.confidence, p_evidence: valid.evidence
    });
    if (response && response.error) throw response.error;
    if (!UUID_RE.test(String(response && response.data || ''))) throw new Error('INVALID_BENCHMARK_ID');
    return { benchmarkId: response.data, benchmarkFingerprint };
  }

  return { UUID_RE, SOURCE_KINDS, validate, fingerprint, recordBenchmark };
}));
