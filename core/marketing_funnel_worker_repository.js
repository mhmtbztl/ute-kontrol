(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./marketing_finding_orchestrator')); else root.MarketingFunnelWorkerRepository = factory(root.MarketingFindingOrchestrator); }(typeof self !== 'undefined' ? self : this, function (Orchestrator) {
  'use strict'; const data = r => { if (r && r.error) throw r.error; return r && r.data; }; const rows = r => { const value = data(r); return Array.isArray(value) ? value : []; };
  function createRepository(client) { if (!client || !client.from || !client.rpc) throw new Error('SUPABASE_SERVICE_CLIENT_REQUIRED'); return {
    async loadActiveListings(tenantId, limit) { let q = client.from('property_channel_listings').select('id,tenant_id,property_id,payout_currency').eq('status', 'ACTIVE'); if (tenantId) q = q.eq('tenant_id', tenantId); return rows(await q.order('created_at', { ascending: true }).limit(limit)); },
    async loadLatestSnapshot(tenantId, listingId) { return data(await client.from('channel_performance_snapshots').select('*').eq('tenant_id', tenantId).eq('channel_listing_id', listingId).in('validation_status', ['VALID', 'PARTIAL']).order('period_end_exclusive', { ascending: false }).limit(1).maybeSingle()) || null; },
    async loadBenchmark(tenantId, propertyId, date) { return data(await client.from('property_marketing_benchmarks').select('*').eq('tenant_id', tenantId).eq('property_id', propertyId).lte('effective_from', date).or(`effective_to_exclusive.is.null,effective_to_exclusive.gt.${date}`).order('effective_from', { ascending: false }).limit(1).maybeSingle()) || null; },
    async persistFinding(draft) { return data(await client.rpc('upsert_marketing_finding', Orchestrator.rpcArgs(draft))); }
  }; }
  return { createRepository };
}));
