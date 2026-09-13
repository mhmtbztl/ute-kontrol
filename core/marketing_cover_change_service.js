// LEXBNB PHASE 17 — SAFE RECORDED COVER CHANGE CLIENT
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarketingCoverChangeService = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const METRICS = Object.freeze(['SEARCH_TO_VIEW_CTR_PERCENT', 'VIEW_TO_BOOKING_CONVERSION_PERCENT']);
  function validate(input = {}) {
    ['tenantId', 'propertyId', 'channelListingId', 'expectedOldMediaId', 'newMediaId'].forEach(name => {
      if (!UUID_RE.test(String(input[name] || ''))) throw new Error(`VALID_${name.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase()}_REQUIRED`);
    });
    if (input.expectedOldMediaId === input.newMediaId) throw new Error('DISTINCT_COVER_MEDIA_REQUIRED');
    const primaryMetric = String(input.primaryMetric || 'SEARCH_TO_VIEW_CTR_PERCENT').trim().toUpperCase();
    if (!METRICS.includes(primaryMetric)) throw new Error('INVALID_PRIMARY_METRIC');
    return { ...input, primaryMetric };
  }
  function currentCover(placements = [], listingId) {
    const matches = placements.filter(row => (row.channelListingId || row.channel_listing_id) === listingId
      && (row.isActive !== undefined ? row.isActive : row.is_active) !== false
      && (row.isCover !== undefined ? row.isCover : row.is_cover) === true);
    if (matches.length > 1) throw new Error('MULTIPLE_ACTIVE_COVERS');
    return matches[0] || null;
  }
  async function changeCoverAndMeasure(client, input = {}) {
    if (!client || typeof client.rpc !== 'function') throw new Error('SUPABASE_CLIENT_REQUIRED');
    const valid = validate(input);
    const response = await client.rpc('change_channel_cover_and_measure', {
      p_tenant_id: valid.tenantId, p_property_id: valid.propertyId,
      p_channel_listing_id: valid.channelListingId, p_expected_old_media_id: valid.expectedOldMediaId,
      p_new_media_id: valid.newMediaId, p_primary_metric: valid.primaryMetric
    });
    if (response && response.error) throw response.error;
    const result = response && response.data;
    if (!result || !UUID_RE.test(String(result.experimentId || '')) || !UUID_RE.test(String(result.oldMediaId || ''))
      || !UUID_RE.test(String(result.newMediaId || '')) || result.externalPublishStatus !== 'NOT_ATTEMPTED') throw new Error('INVALID_COVER_CHANGE_RESULT');
    return { ...result, method: 'BEFORE_AFTER_OBSERVATIONAL', causalClaim: false };
  }
  return { UUID_RE, METRICS, validate, currentCover, changeCoverAndMeasure };
}));
