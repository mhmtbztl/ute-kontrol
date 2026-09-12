// LEXBNB PHASE 17 — IDEMPOTENT PHOTO ANALYSIS REQUEST CLIENT
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('crypto'));
  else root.MarketingPhotoAnalysisService = factory(root.crypto);
}(typeof self !== 'undefined' ? self : this, function (CryptoProvider) {
  'use strict';

  const PROMPT_VERSION = 'lexbnb-photo-commercial-v1';
  const SCHEMA_VERSION = 'photo-analysis-v1';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const HASH_RE = /^[0-9a-f]{64}$/;

  function activeMedia(media, propertyId) {
    if (!Array.isArray(media)) throw new Error('MEDIA_ARRAY_REQUIRED');
    const seen = new Set();
    return media.filter(item => (item.propertyId || item.property_id) === propertyId
      && String(item.mediaStatus || item.media_status || '').toUpperCase() === 'ACTIVE')
      .map(item => {
        const id = item.id;
        const contentSha256 = item.contentSha256 || item.content_sha256;
        if (!UUID_RE.test(String(id || ''))) throw new Error('VALID_MEDIA_ID_REQUIRED');
        if (!HASH_RE.test(String(contentSha256 || ''))) throw new Error('VALID_MEDIA_CONTENT_HASH_REQUIRED');
        if (seen.has(id)) throw new Error('DUPLICATE_MEDIA_ID');
        seen.add(id);
        return {
          id,
          contentSha256,
          roomCategory: String(item.roomCategory || item.room_category || 'OTHER').toUpperCase()
        };
      }).sort((a, b) => a.id.localeCompare(b.id));
  }

  async function sha256(text) {
    if (CryptoProvider && typeof CryptoProvider.createHash === 'function') {
      return CryptoProvider.createHash('sha256').update(text, 'utf8').digest('hex');
    }
    if (CryptoProvider && CryptoProvider.subtle) {
      const digest = await CryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('SHA256_UNAVAILABLE');
  }

  async function buildPropertyContext(input = {}) {
    if (!UUID_RE.test(String(input.propertyId || ''))) throw new Error('VALID_PROPERTY_ID_REQUIRED');
    const normalizedMedia = activeMedia(input.media, input.propertyId);
    if (!normalizedMedia.length) throw new Error('ACTIVE_PROPERTY_MEDIA_REQUIRED');
    const context = { propertyId: input.propertyId, media: normalizedMedia };
    return { context, propertyContextHash: await sha256(JSON.stringify(context)) };
  }

  async function requestPhotoAnalysis(client, input = {}) {
    if (!client || typeof client.rpc !== 'function') throw new Error('SUPABASE_CLIENT_REQUIRED');
    if (!UUID_RE.test(String(input.tenantId || ''))) throw new Error('VALID_TENANT_ID_REQUIRED');
    const built = await buildPropertyContext(input);
    const response = await client.rpc('request_photo_analysis', {
      p_tenant_id: input.tenantId,
      p_property_id: input.propertyId,
      p_prompt_version: PROMPT_VERSION,
      p_schema_version: SCHEMA_VERSION,
      p_property_context_hash: built.propertyContextHash
    });
    if (response && response.error) throw response.error;
    const runId = response && response.data;
    if (!UUID_RE.test(String(runId || ''))) throw new Error('INVALID_ANALYSIS_RUN_ID');
    return {
      runId,
      propertyContextHash: built.propertyContextHash,
      mediaCount: built.context.media.length,
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION
    };
  }

  return { PROMPT_VERSION, SCHEMA_VERSION, activeMedia, buildPropertyContext, requestPhotoAnalysis };
}));
