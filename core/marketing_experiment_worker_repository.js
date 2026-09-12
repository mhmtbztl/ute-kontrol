// LEXBNB PHASE 17 — SERVICE-ROLE EXPERIMENT WORKER REPOSITORY
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarketingExperimentWorkerRepository = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function data(result) {
    if (result && result.error) throw result.error;
    return result && result.data;
  }

  function createRepository(client) {
    if (!client || typeof client.rpc !== 'function' || typeof client.from !== 'function') throw new Error('SUPABASE_SERVICE_CLIENT_REQUIRED');
    return {
      async claimExperiment(experimentId) {
        return data(await client.rpc('claim_listing_change_experiment', { p_experiment_id: experimentId || null })) || null;
      },
      async loadWindowSnapshot(input) {
        const response = await client.from('channel_performance_snapshots')
          .select('id,tenant_id,channel_listing_id,period_start,period_end_exclusive,impressions,listing_views,booking_attempts,platform_reported_bookings,validation_status,created_at')
          .eq('tenant_id', input.tenantId).eq('channel_listing_id', input.listingId)
          .eq('period_start', input.startDate).eq('period_end_exclusive', input.endDateExclusive)
          .in('validation_status', ['VALID', 'PARTIAL'])
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        return data(response) || null;
      },
      async completeExperiment(input) {
        return data(await client.rpc('complete_listing_change_experiment', {
          p_experiment_id: input.experimentId, p_lease_token: input.leaseToken,
          p_before_snapshot_id: input.beforeSnapshotId, p_after_snapshot_id: input.afterSnapshotId,
          p_evaluation_payload: input.resultPayload
        }));
      },
      async failExperiment(experimentId, leaseToken, code, detail) {
        return data(await client.rpc('fail_listing_change_experiment', {
          p_experiment_id: experimentId, p_lease_token: leaseToken,
          p_error_code: code, p_error_detail: detail || null
        }));
      }
    };
  }

  return { createRepository };
}));
