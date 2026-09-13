// LEXBNB PHASE 17 — PRIVATE, HASHED PROPERTY MEDIA UPLOAD ORCHESTRATOR
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('crypto'));
  else root.MarketingMediaUploadService = factory(root.crypto);
}(typeof self !== 'undefined' ? self : this, function (CryptoProvider) {
  'use strict';

  const BUCKET = 'property-media';
  const MAX_BYTES = 26214400;
  const MIME_EXTENSIONS = Object.freeze({
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic'
  });
  const ROOM_CATEGORIES = Object.freeze([
    'EXTERIOR', 'LIVING_ROOM', 'BEDROOM', 'BATHROOM', 'KITCHEN', 'DINING',
    'POOL', 'SPA', 'VIEW_TERRACE', 'AMENITY', 'OTHER'
  ]);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function validateUpload(input = {}) {
    if (!UUID_RE.test(String(input.tenantId || ''))) throw new Error('VALID_TENANT_ID_REQUIRED');
    if (!UUID_RE.test(String(input.propertyId || ''))) throw new Error('VALID_PROPERTY_ID_REQUIRED');
    const file = input.file;
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('IMAGE_FILE_REQUIRED');
    if (!MIME_EXTENSIONS[file.type]) throw new Error('UNSUPPORTED_IMAGE_MIME_TYPE');
    if (!Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_BYTES) throw new Error('INVALID_IMAGE_BYTE_SIZE');
    const roomCategory = String(input.roomCategory || 'OTHER').trim().toUpperCase();
    if (!ROOM_CATEGORIES.includes(roomCategory)) throw new Error('INVALID_ROOM_CATEGORY');
    return { tenantId: input.tenantId, propertyId: input.propertyId, file, roomCategory };
  }

  async function sha256File(file) {
    const bytes = await file.arrayBuffer();
    if (CryptoProvider && typeof CryptoProvider.createHash === 'function') {
      return CryptoProvider.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
    }
    if (CryptoProvider && CryptoProvider.subtle) {
      const digest = await CryptoProvider.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('SHA256_UNAVAILABLE');
  }

  function newUuid() {
    if (CryptoProvider && typeof CryptoProvider.randomUUID === 'function') return CryptoProvider.randomUUID();
    throw new Error('RANDOM_UUID_UNAVAILABLE');
  }

  function storagePath(valid, mediaId) {
    return `${valid.tenantId}/${valid.propertyId}/${mediaId}/original.${MIME_EXTENSIONS[valid.file.type]}`;
  }

  async function findExisting(client, valid, hash) {
    const { data, error } = await client.from('property_media').select('id,media_status,original_storage_path')
      .eq('tenant_id', valid.tenantId).eq('property_id', valid.propertyId).eq('content_sha256', hash).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function markFailed(client, valid, mediaId) {
    try {
      await client.from('property_media').update({ media_status: 'FAILED' })
        .eq('tenant_id', valid.tenantId).eq('property_id', valid.propertyId).eq('id', mediaId);
    } catch (_) { /* Preserve the original upload failure. */ }
  }

  async function uploadPropertyMedia(client, input = {}) {
    if (!client || typeof client.from !== 'function' || !client.storage || typeof client.storage.from !== 'function') {
      throw new Error('SUPABASE_CLIENT_REQUIRED');
    }
    const valid = validateUpload(input);
    const hash = await sha256File(valid.file);
    const existing = await findExisting(client, valid, hash);
    if (existing && existing.media_status !== 'FAILED') return { mediaId: existing.id, reused: true, storagePath: existing.original_storage_path };
    if (existing) throw new Error('FAILED_MEDIA_RECORD_REQUIRES_CLEANUP');

    const mediaId = newUuid();
    const path = storagePath(valid, mediaId);
    const insert = await client.from('property_media').insert({
      id: mediaId, tenant_id: valid.tenantId, property_id: valid.propertyId,
      original_storage_path: path, original_file_name: String(valid.file.name || '').slice(0, 255) || null,
      mime_type: valid.file.type, content_sha256: hash, byte_size: valid.file.size,
      media_status: 'UPLOADING', room_category: valid.roomCategory
    }).select('id').single();
    if (insert.error) {
      if (insert.error.code === '23505') {
        const raced = await findExisting(client, valid, hash);
        if (raced && raced.media_status !== 'FAILED') return { mediaId: raced.id, reused: true, storagePath: raced.original_storage_path };
      }
      throw insert.error;
    }

    try {
      const uploaded = await client.storage.from(BUCKET).upload(path, valid.file, {
        contentType: valid.file.type, upsert: false, cacheControl: '31536000'
      });
      if (uploaded.error) throw uploaded.error;
      const version = await client.from('property_media_versions').insert({
        tenant_id: valid.tenantId, property_id: valid.propertyId, media_id: mediaId,
        version_type: 'ORIGINAL', storage_path: path, content_sha256: hash,
        operations: [], is_current_display: true
      });
      if (version.error) throw version.error;
      const activated = await client.from('property_media').update({ media_status: 'ACTIVE' })
        .eq('tenant_id', valid.tenantId).eq('property_id', valid.propertyId).eq('id', mediaId);
      if (activated.error) throw activated.error;
      return { mediaId, reused: false, storagePath: path, contentSha256: hash };
    } catch (error) {
      await markFailed(client, valid, mediaId);
      throw error;
    }
  }

  return { BUCKET, MAX_BYTES, MIME_EXTENSIONS, ROOM_CATEGORIES, validateUpload, sha256File, storagePath, uploadPropertyMedia };
}));
