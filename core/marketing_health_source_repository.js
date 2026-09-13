// LEXBNB PHASE 17 — SERVICE-ROLE HEALTH SOURCE REPOSITORY
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarketingHealthSourceRepository = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function data(result) { if (result && result.error) throw result.error; return result && result.data; }
  function rows(result) { const value = data(result); return Array.isArray(value) ? value : []; }
  function createRepository(client) {
    if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') throw new Error('SUPABASE_SERVICE_CLIENT_REQUIRED');
    return {
      async loadPropertyScopes(tenantId, limit) {
        let query = client.from('properties').select('id,tenant_id');
        if (tenantId) query = query.eq('tenant_id', tenantId);
        return rows(await query.order('created_at', { ascending: true }).limit(limit)).map(row => ({ tenantId: row.tenant_id, propertyId: row.id }));
      },
      async loadBenchmark(tenantId, propertyId, date) {
        const result = await client.from('property_marketing_benchmarks').select('*')
          .eq('tenant_id', tenantId).eq('property_id', propertyId).lte('effective_from', date)
          .or(`effective_to_exclusive.is.null,effective_to_exclusive.gt.${date}`)
          .order('effective_from', { ascending: false }).limit(1).maybeSingle();
        return data(result) || null;
      },
      async loadActiveMedia(tenantId, propertyId) {
        return rows(await client.from('property_media').select('id,property_id,media_status')
          .eq('tenant_id', tenantId).eq('property_id', propertyId).eq('media_status', 'ACTIVE'));
      },
      async loadPhotoRuns(tenantId, propertyId) {
        return rows(await client.from('photo_analysis_runs').select('id,tenant_id,property_id,status,result_payload,result_schema_validated_at,completed_at')
          .eq('tenant_id', tenantId).eq('property_id', propertyId).eq('status', 'SUCCEEDED')
          .not('result_schema_validated_at', 'is', null).order('completed_at', { ascending: false }).limit(5));
      },
      async loadChannelSnapshots(tenantId, propertyId, start, end) {
        const listings = rows(await client.from('property_channel_listings').select('id')
          .eq('tenant_id', tenantId).eq('property_id', propertyId).eq('status', 'ACTIVE'));
        if (!listings.length) return [];
        return rows(await client.from('channel_performance_snapshots').select('*')
          .eq('tenant_id', tenantId).in('channel_listing_id', listings.map(row => row.id))
          .gte('period_start', start).lte('period_end_exclusive', end)
          .order('period_end_exclusive', { ascending: false }).limit(100));
      },
      async loadBookings(tenantId, propertyId, start, end) {
        return rows(await client.from('bookings')
          .select('id,property_id,channel,check_in,check_out,gross_amount,ota_commission,cleaning_fee,discount,net_room_revenue,status')
          .eq('tenant_id', tenantId).eq('property_id', propertyId)
          .lt('check_in', end).gt('check_out', start).limit(1000));
      },
      async recordInput(input) {
        return data(await client.rpc('record_property_marketing_health_input', {
          p_tenant_id: input.tenantId, p_property_id: input.propertyId,
          p_component_key: input.componentKey, p_measurement_kind: input.measurementKind,
          p_status: input.status, p_observed_value: input.observedValue,
          p_reference_value: input.referenceValue, p_sample_size: input.sampleSize,
          p_min_sample_size: input.minSampleSize, p_confidence: input.confidence,
          p_reason: input.reason, p_source_kind: input.sourceKind,
          p_source_record_id: input.sourceRecordId, p_evidence: input.evidence,
          p_input_fingerprint: input.inputFingerprint, p_as_of: input.asOf,
          p_expires_at: input.expiresAt
        }));
      }
    };
  }
  return { createRepository };
}));
