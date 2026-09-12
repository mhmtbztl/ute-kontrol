// =============================================================================
// LEXBNB PHASE 17 — TENANT-SCOPED, READ-ONLY MARKETING DATA ADAPTER
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarketingDataService = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const DEFAULT_LIMITS = Object.freeze({ snapshots: 100, findings: 50, media: 200, analysisRuns: 30, experiments: 30, healthSnapshots: 30 });

  function assertScope(scope = {}) {
    if (!UUID_RE.test(String(scope.tenantId || ''))) throw new Error('VALID_TENANT_ID_REQUIRED');
    if (scope.propertyId && !UUID_RE.test(String(scope.propertyId))) throw new Error('INVALID_PROPERTY_ID');
    return { tenantId: scope.tenantId, propertyId: scope.propertyId || null };
  }

  function request(table, columns, orderColumn, limit, propertyId) {
    return { table, columns, orderColumn, ascending: false, limit, propertyId: propertyId || null };
  }

  function buildPropertyRequests(scope = {}, limits = {}) {
    const valid = assertScope(scope);
    const max = { ...DEFAULT_LIMITS, ...limits };
    return {
      listings: request('property_channel_listings', 'id,property_id,channel_code,display_name,status', 'created_at', 100, valid.propertyId),
      findings: request('marketing_findings', '*', 'last_seen_at', max.findings, valid.propertyId),
      media: request('property_media', 'id,property_id,media_status,room_category,content_sha256,width_px,height_px,created_at', 'created_at', max.media, valid.propertyId),
      analysisRuns: request('photo_analysis_runs', '*', 'requested_at', max.analysisRuns, valid.propertyId),
      experiments: request('listing_change_experiments', '*', 'created_at', max.experiments, valid.propertyId),
      healthSnapshots: request('property_marketing_health_snapshots', '*', 'as_of', max.healthSnapshots, valid.propertyId)
    };
  }

  async function executeRequest(client, tenantId, spec, extra = {}) {
    let query = client.from(spec.table).select(spec.columns).eq('tenant_id', tenantId);
    if (spec.propertyId) query = query.eq('property_id', spec.propertyId);
    if (extra.listingIds) query = query.in('channel_listing_id', extra.listingIds);
    query = query.order(spec.orderColumn, { ascending: spec.ascending }).limit(spec.limit);
    const result = await query;
    if (result && result.error) throw result.error;
    return Array.isArray(result && result.data) ? result.data : [];
  }

  function normalizeError(error) {
    return {
      code: String(error && (error.code || error.name) || 'READ_FAILED'),
      message: String(error && error.message || 'Marketing data could not be read')
    };
  }

  async function safelyLoad(name, loader) {
    try {
      return { name, data: await loader(), error: null };
    } catch (error) {
      return { name, data: [], error: normalizeError(error) };
    }
  }

  async function loadMarketingWorkspaceData(client, scope = {}, options = {}) {
    if (!client || typeof client.from !== 'function') throw new Error('SUPABASE_CLIENT_REQUIRED');
    const valid = assertScope(scope);
    const requests = buildPropertyRequests(valid, options.limits);
    const listingsResult = await safelyLoad('listings', () => executeRequest(client, valid.tenantId, requests.listings));
    const listingIds = listingsResult.data.map(row => row.id).filter(Boolean);
    const snapshotSpec = request(
      'channel_performance_snapshots', '*', 'period_end_exclusive',
      { ...DEFAULT_LIMITS, ...(options.limits || {}) }.snapshots, null
    );

    const loaders = [
      listingsResult,
      await safelyLoad('snapshots', () => listingIds.length
        ? executeRequest(client, valid.tenantId, snapshotSpec, { listingIds })
        : Promise.resolve([])),
      ...(await Promise.all(Object.entries(requests)
        .filter(([name]) => name !== 'listings')
        .map(([name, spec]) => safelyLoad(name, () => executeRequest(client, valid.tenantId, spec)))))
    ];

    const result = { listings: [], snapshots: [], findings: [], media: [], analysisRuns: [], experiments: [], healthSnapshots: [], errors: [] };
    loaders.forEach(item => {
      result[item.name] = item.data;
      if (item.error) result.errors.push({ dataset: item.name, ...item.error });
    });
    result.status = result.errors.length ? (result.errors.length === loaders.length ? 'UNAVAILABLE' : 'PARTIAL') : 'OK';
    result.scope = valid;
    return result;
  }

  return { UUID_RE, DEFAULT_LIMITS, assertScope, buildPropertyRequests, loadMarketingWorkspaceData };
}));
