// LEXBNB PHASE 17 — SERVICE-ROLE SEASONAL REVIEW REPOSITORY
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./marketing_finding_orchestrator'));
  else root.SeasonalMarketingWorkerRepository = factory(root.MarketingFindingOrchestrator);
}(typeof self !== 'undefined' ? self : this, function (FindingOrchestrator) {
  'use strict';
  function data(result) { if (result && result.error) throw result.error; return result && result.data; }
  function rows(result) { const value = data(result); return Array.isArray(value) ? value : []; }

  function createRepository(client) {
    if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') throw new Error('SUPABASE_SERVICE_CLIENT_REQUIRED');
    return {
      async loadLatestAnalysisRuns(tenantId, limit) {
        let query = client.from('photo_analysis_runs')
          .select('id,tenant_id,property_id,status,result_payload,result_schema_validated_at,completed_at')
          .eq('status', 'SUCCEEDED').not('result_schema_validated_at', 'is', null);
        if (tenantId) query = query.eq('tenant_id', tenantId);
        return rows(await query.order('completed_at', { ascending: false }).limit(limit));
      },
      async loadActiveMedia(tenantId, propertyId) {
        return rows(await client.from('property_media')
          .select('id,tenant_id,property_id,media_status,season_tags')
          .eq('tenant_id', tenantId).eq('property_id', propertyId).eq('media_status', 'ACTIVE'));
      },
      async loadActiveListings(tenantId, propertyId) {
        return rows(await client.from('property_channel_listings')
          .select('id,tenant_id,property_id,status,payout_currency')
          .eq('tenant_id', tenantId).eq('property_id', propertyId).eq('status', 'ACTIVE'));
      },
      async persistFinding(draft) {
        return data(await client.rpc('upsert_marketing_finding', FindingOrchestrator.rpcArgs(draft)));
      }
    };
  }
  return { createRepository };
}));
