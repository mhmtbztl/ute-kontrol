// LEXBNB PHASE 17 — SERVICE-ROLE MARKETING HEALTH WORKER REPOSITORY
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarketingHealthWorkerRepository = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function data(result) { if (result && result.error) throw result.error; return result && result.data; }
  function rows(result) { const value = data(result); return Array.isArray(value) ? value : []; }

  function createRepository(client) {
    if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') throw new Error('SUPABASE_SERVICE_CLIENT_REQUIRED');
    return {
      async loadCandidateProperties(tenantId, limit) {
        let query = client.from('property_marketing_health_inputs').select('tenant_id,property_id');
        if (tenantId) query = query.eq('tenant_id', tenantId);
        const source = rows(await query.order('as_of', { ascending: false }).limit(limit));
        const unique = new Map();
        source.forEach(row => {
          const key = `${row.tenant_id}:${row.property_id}`;
          if (!unique.has(key)) unique.set(key, { tenantId: row.tenant_id, propertyId: row.property_id });
        });
        return [...unique.values()];
      },
      async loadCurrentInputs(tenantId, propertyId, asOf) {
        return rows(await client.from('property_marketing_health_inputs').select('*')
          .eq('tenant_id', tenantId).eq('property_id', propertyId)
          .lte('as_of', asOf).or(`expires_at.is.null,expires_at.gt.${asOf}`)
          .order('as_of', { ascending: false }).limit(100));
      },
      async persistSnapshot(input) {
        return data(await client.rpc('persist_property_marketing_health_snapshot', {
          p_tenant_id: input.tenantId,
          p_property_id: input.propertyId,
          p_input_fingerprint: input.inputFingerprint,
          p_scoring_version: input.scoringVersion,
          p_as_of: input.asOf,
          p_result: input.result,
          p_source_input_ids: input.sourceInputIds
        }));
      }
    };
  }
  return { createRepository };
}));
