// LEXBNB PHASE 17 — SUPABASE SERVICE-ROLE PHOTO WORKER REPOSITORY
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./marketing_finding_orchestrator'));
  else root.PhotoAnalysisSupabaseRepository = factory(root.MarketingFindingOrchestrator);
}(typeof self !== 'undefined' ? self : this, function (FindingOrchestrator) {
  'use strict';

  function assertClient(client) {
    if (!client || typeof client.rpc !== 'function' || typeof client.from !== 'function') throw new Error('SUPABASE_SERVICE_CLIENT_REQUIRED');
  }

  function throwError(result) {
    if (result && result.error) throw result.error;
    return result && result.data;
  }

  function createRepository(client, options = {}) {
    assertClient(client);
    const cacheTtlDays = options.cacheTtlDays === undefined ? 30 : Number(options.cacheTtlDays);
    if (!Number.isFinite(cacheTtlDays) || cacheTtlDays < 0) throw new Error('INVALID_CACHE_TTL');

    return {
      async claimRun(runId) {
        return throwError(await client.rpc('claim_photo_analysis_run', { p_run_id: runId || null })) || null;
      },

      async loadProperty(tenantId, propertyId) {
        const result = await client.from('properties').select('id,tenant_id,name,capacity,amenities')
          .eq('tenant_id', tenantId).eq('id', propertyId).maybeSingle();
        return throwError(result) || null;
      },

      async loadActiveMedia(tenantId, propertyId) {
        const result = await client.from('property_media')
          .select('id,tenant_id,property_id,media_status,room_category,content_sha256,original_storage_path,mime_type,width_px,height_px')
          .eq('tenant_id', tenantId).eq('property_id', propertyId).eq('media_status', 'ACTIVE')
          .order('created_at', { ascending: true });
        const rows = throwError(result);
        return Array.isArray(rows) ? rows : [];
      },

      async loadAnalysisImage(media) {
        if (!media || !media.original_storage_path) throw new Error('MEDIA_STORAGE_PATH_REQUIRED');
        if (!client.storage || typeof client.storage.from !== 'function') throw new Error('SUPABASE_STORAGE_REQUIRED');
        const result = await client.storage.from('property-media').download(media.original_storage_path, {
          transform: { width: 1024, height: 1024, resize: 'contain', quality: 82 }
        });
        const blob = throwError(result);
        if (!blob || typeof blob.arrayBuffer !== 'function') throw new Error('TRANSFORMED_IMAGE_REQUIRED');
        return { bytes: await blob.arrayBuffer(), mimeType: blob.type || 'image/webp' };
      },

      async loadCachedItems(tenantId, cacheKeys, now) {
        if (!Array.isArray(cacheKeys) || !cacheKeys.length) return [];
        const cutoff = new Date(Date.parse(now) - cacheTtlDays * 86400000).toISOString();
        const result = await client.from('photo_analysis_items')
          .select('id,cache_key,status,result_payload,created_at')
          .eq('tenant_id', tenantId).in('cache_key', cacheKeys)
          .in('status', ['CACHED', 'SUCCEEDED']).gte('created_at', cutoff)
          .order('created_at', { ascending: false });
        const rows = throwError(result);
        const latest = new Map();
        (Array.isArray(rows) ? rows : []).forEach(row => {
          if (!latest.has(row.cache_key)) latest.set(row.cache_key, row);
        });
        return [...latest.values()];
      },

      async findAggregateCache(input) {
        const cutoff = new Date(Date.parse(input.now) - cacheTtlDays * 86400000).toISOString();
        const result = await client.from('photo_analysis_runs')
          .select('id,provider,model_version,result_payload,completed_at')
          .eq('tenant_id', input.tenantId).eq('property_id', input.propertyId)
          .eq('property_context_hash', input.propertyContextHash)
          .eq('prompt_version', input.promptVersion).eq('schema_version', input.schemaVersion)
          .eq('status', 'SUCCEEDED').gte('completed_at', cutoff)
          .order('completed_at', { ascending: false }).limit(1).maybeSingle();
        const row = throwError(result);
        return row ? { ...row, resultPayload: row.result_payload } : null;
      },

      async completeRun(input) {
        return throwError(await client.rpc('complete_photo_analysis_run', {
          p_run_id: input.runId,
          p_lease_token: input.leaseToken,
          p_provider: input.provider,
          p_model_version: input.modelVersion,
          p_provider_request_id: input.providerRequestId,
          p_usage_metadata: input.usageMetadata,
          p_result_payload: input.resultPayload,
          p_items: input.items
        }));
      },

      async failRun(runId, leaseToken, code, detail) {
        return throwError(await client.rpc('fail_photo_analysis_run', {
          p_run_id: runId, p_lease_token: leaseToken, p_error_code: code, p_error_detail: detail || null
        }));
      },

      async persistFinding(draft) {
        if (!FindingOrchestrator || typeof FindingOrchestrator.rpcArgs !== 'function') throw new Error('FINDING_ORCHESTRATOR_REQUIRED');
        return throwError(await client.rpc('upsert_marketing_finding', FindingOrchestrator.rpcArgs(draft)));
      }
    };
  }

  return { createRepository };
}));
