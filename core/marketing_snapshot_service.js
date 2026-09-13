// LEXBNB PHASE 17 — MANUAL FUNNEL SNAPSHOT CLIENT CONTRACT
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./marketing_funnel_service'), require('crypto'));
  } else {
    root.MarketingSnapshotService = factory(root.MarketingFunnelService, root.crypto);
  }
}(typeof self !== 'undefined' ? self : this, function (FunnelService, CryptoProvider) {
  'use strict';

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const COUNTERS = ['impressions', 'listingViews', 'bookingAttempts', 'platformReportedBookings', 'wishlistSaves'];

  function validDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
    return date.toISOString().slice(0, 10) === value;
  }

  function normalizeCounter(value) {
    if (value === '' || value === undefined || value === null) return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : NaN;
  }

  function validateInput(input = {}) {
    if (!UUID_RE.test(String(input.tenantId || ''))) throw new Error('VALID_TENANT_ID_REQUIRED');
    if (!UUID_RE.test(String(input.channelListingId || ''))) throw new Error('VALID_CHANNEL_LISTING_ID_REQUIRED');
    if (!validDate(input.periodStart) || !validDate(input.periodEndExclusive) || input.periodEndExclusive <= input.periodStart) {
      throw new Error('INVALID_SNAPSHOT_PERIOD');
    }
    const counters = Object.fromEntries(COUNTERS.map(key => [key, normalizeCounter(input[key])]));
    if (Object.values(counters).some(Number.isNaN)) throw new Error('INVALID_FUNNEL_COUNTER');
    if (Object.values(counters).every(value => value === null)) throw new Error('AT_LEAST_ONE_FUNNEL_COUNTER_REQUIRED');
    const validation = FunnelService.validateSnapshot(counters);
    if (!validation.valid) throw new Error(`INVALID_FUNNEL_ORDER: ${validation.errors[0].code}`);
    return {
      tenantId: input.tenantId,
      channelListingId: input.channelListingId,
      periodStart: input.periodStart,
      periodEndExclusive: input.periodEndExclusive,
      counters,
      notes: input.notes === undefined || input.notes === null ? null : String(input.notes).trim() || null,
      validation
    };
  }

  async function sha256(value) {
    if (CryptoProvider && typeof CryptoProvider.createHash === 'function') {
      return CryptoProvider.createHash('sha256').update(value, 'utf8').digest('hex');
    }
    if (CryptoProvider && CryptoProvider.subtle) {
      const digest = await CryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(value));
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('SHA256_UNAVAILABLE');
  }

  async function buildIdempotencyKey(validated) {
    const identity = JSON.stringify({
      tenantId: validated.tenantId, channelListingId: validated.channelListingId,
      periodStart: validated.periodStart, periodEndExclusive: validated.periodEndExclusive,
      ...validated.counters, notes: validated.notes
    });
    return `manual-v1:${await sha256(identity)}`;
  }

  async function recordManualSnapshot(client, input = {}) {
    if (!client || typeof client.rpc !== 'function') throw new Error('SUPABASE_CLIENT_REQUIRED');
    const valid = validateInput(input);
    const idempotencyKey = input.idempotencyKey || await buildIdempotencyKey(valid);
    const { data, error } = await client.rpc('record_manual_channel_snapshot', {
      p_tenant_id: valid.tenantId,
      p_channel_listing_id: valid.channelListingId,
      p_period_start: valid.periodStart,
      p_period_end_exclusive: valid.periodEndExclusive,
      p_idempotency_key: idempotencyKey,
      p_impressions: valid.counters.impressions,
      p_listing_views: valid.counters.listingViews,
      p_booking_attempts: valid.counters.bookingAttempts,
      p_platform_reported_bookings: valid.counters.platformReportedBookings,
      p_wishlist_saves: valid.counters.wishlistSaves,
      p_notes: valid.notes
    });
    if (error) throw error;
    return data;
  }

  return { COUNTERS, validateInput, buildIdempotencyKey, recordManualSnapshot };
}));
