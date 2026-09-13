(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./marketing_finding_orchestrator'));
  else root.MarketingEconomicsWorkerRepository = factory(root.MarketingFindingOrchestrator);
}(typeof self !== 'undefined' ? self : this, function (Orchestrator) {
  'use strict';
  const data = result => { if (result && result.error) throw result.error; return result && result.data; };
  const rows = result => { const value = data(result); return Array.isArray(value) ? value : []; };
  function createRepository(client) {
    if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') throw new Error('SUPABASE_SERVICE_CLIENT_REQUIRED');
    return {
      async loadPropertyScopes(tenantId, limit) { let query = client.from('properties').select('id,tenant_id'); if (tenantId) query = query.eq('tenant_id', tenantId); return rows(await query.order('created_at', { ascending: true }).limit(limit)); },
      async loadBenchmark(tenantId, propertyId, date) { return data(await client.from('property_marketing_benchmarks').select('*').eq('tenant_id', tenantId).eq('property_id', propertyId).lte('effective_from', date).or(`effective_to_exclusive.is.null,effective_to_exclusive.gt.${date}`).order('effective_from', { ascending: false }).limit(1).maybeSingle()) || null; },
      async loadBookings(tenantId, propertyId, start, end) { return rows(await client.from('bookings').select('id,property_id,channel,check_in,check_out,gross_amount,ota_commission,cleaning_fee,discount,net_room_revenue,status').eq('tenant_id', tenantId).eq('property_id', propertyId).lt('check_in', end).gt('check_out', start).limit(1000)); },
      async persistFinding(draft) { return data(await client.rpc('upsert_marketing_finding', Orchestrator.rpcArgs(draft))); }
    };
  }
  return { createRepository };
}));
