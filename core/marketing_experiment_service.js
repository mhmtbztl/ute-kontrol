// LEXBNB PHASE 17 — OBSERVATIONAL LISTING CHANGE REQUEST CLIENT
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarketingExperimentService = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const CHANGE_TYPES = Object.freeze(['COVER_MEDIA', 'GALLERY_ORDER', 'LISTING_CONTENT', 'PRICE', 'POLICY']);
  const METRICS = Object.freeze(['SEARCH_TO_VIEW_CTR_PERCENT', 'VIEW_TO_BOOKING_CONVERSION_PERCENT']);

  function dateMs(value, name) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new Error(`VALID_${name}_REQUIRED`);
    const parsed = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) throw new Error(`VALID_${name}_REQUIRED`);
    return parsed;
  }

  function validateRequest(input = {}) {
    ['tenantId', 'propertyId', 'channelListingId'].forEach(name => {
      if (!UUID_RE.test(String(input[name] || ''))) throw new Error(`VALID_${name.replace(/[A-Z]/g, x => `_${x}`).toUpperCase()}_REQUIRED`);
    });
    const changeType = String(input.changeType || '').trim().toUpperCase();
    const primaryMetric = String(input.primaryMetric || 'SEARCH_TO_VIEW_CTR_PERCENT').trim().toUpperCase();
    if (!CHANGE_TYPES.includes(changeType)) throw new Error('INVALID_CHANGE_TYPE');
    if (!METRICS.includes(primaryMetric)) throw new Error('INVALID_PRIMARY_METRIC');
    const change = dateMs(input.changeDate, 'CHANGE_DATE');
    const beforeStart = dateMs(input.beforeStartDate, 'BEFORE_START_DATE');
    const beforeEnd = dateMs(input.beforeEndExclusive, 'BEFORE_END_EXCLUSIVE');
    const afterStart = dateMs(input.afterStartDate, 'AFTER_START_DATE');
    const afterEnd = dateMs(input.afterEndExclusive, 'AFTER_END_EXCLUSIVE');
    if (beforeEnd <= beforeStart || afterEnd <= afterStart) throw new Error('INVALID_EXPERIMENT_WINDOW');
    if ((beforeEnd - beforeStart) / 86400000 < 14 || (afterEnd - afterStart) / 86400000 < 14) throw new Error('MINIMUM_14_DAY_WINDOW_REQUIRED');
    if (beforeEnd > change || afterStart < change) throw new Error('EXPERIMENT_WINDOWS_OVERLAP_CHANGE');
    const oldMediaId = input.oldMediaId || null;
    const newMediaId = input.newMediaId || null;
    if (oldMediaId && !UUID_RE.test(String(oldMediaId))) throw new Error('INVALID_OLD_MEDIA_ID');
    if (newMediaId && !UUID_RE.test(String(newMediaId))) throw new Error('INVALID_NEW_MEDIA_ID');
    if (changeType === 'COVER_MEDIA' && (!oldMediaId || !newMediaId || oldMediaId === newMediaId)) throw new Error('DISTINCT_COVER_MEDIA_REQUIRED');
    return { ...input, changeType, primaryMetric, oldMediaId, newMediaId };
  }

  async function requestEvaluation(client, input = {}) {
    if (!client || typeof client.rpc !== 'function') throw new Error('SUPABASE_CLIENT_REQUIRED');
    const valid = validateRequest(input);
    const response = await client.rpc('request_listing_change_evaluation', {
      p_tenant_id: valid.tenantId,
      p_property_id: valid.propertyId,
      p_channel_listing_id: valid.channelListingId,
      p_change_type: valid.changeType,
      p_change_date: valid.changeDate,
      p_before_start_date: valid.beforeStartDate,
      p_before_end_exclusive: valid.beforeEndExclusive,
      p_after_start_date: valid.afterStartDate,
      p_after_end_exclusive: valid.afterEndExclusive,
      p_primary_metric: valid.primaryMetric,
      p_old_media_id: valid.oldMediaId,
      p_new_media_id: valid.newMediaId
    });
    if (response && response.error) throw response.error;
    if (!UUID_RE.test(String(response && response.data || ''))) throw new Error('INVALID_EXPERIMENT_ID');
    return { experimentId: response.data, method: 'BEFORE_AFTER_OBSERVATIONAL', causalClaim: false };
  }

  return { CHANGE_TYPES, METRICS, validateRequest, requestEvaluation };
}));
