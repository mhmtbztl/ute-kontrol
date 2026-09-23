// LEXBNB PHASE 17 — CHANNEL LISTING SETUP CLIENT
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarketingChannelListingService = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const CHANNELS = Object.freeze(['AIRBNB', 'BOOKING_COM', 'VRBO', 'EXPEDIA', 'DIRECT', 'OTHER_OTA']);

  function optionalText(value) { return value === undefined || value === null ? null : String(value).trim() || null; }
  function validateInput(input = {}) {
    const channelCode = String(input.channelCode || '').trim().toUpperCase();
    const externalListingId = String(input.externalListingId || '').trim();
    const externalUrl = optionalText(input.externalUrl);
    const displayName = optionalText(input.displayName);
    const payoutCurrency = String(input.payoutCurrency || 'TRY').trim().toUpperCase();
    if (!UUID_RE.test(String(input.tenantId || ''))) throw new Error('VALID_TENANT_ID_REQUIRED');
    if (!UUID_RE.test(String(input.propertyId || ''))) throw new Error('VALID_PROPERTY_ID_REQUIRED');
    if (!CHANNELS.includes(channelCode)) throw new Error('INVALID_CHANNEL_CODE');
    if (!externalListingId || externalListingId.length > 200) throw new Error('CHANNEL_LISTING_REFERENCE_REQUIRED');
    if (channelCode === 'OTHER_OTA' && !displayName) throw new Error('CUSTOM_OTA_NAME_REQUIRED');
    if (!/^[A-Z]{3}$/.test(payoutCurrency)) throw new Error('INVALID_PAYOUT_CURRENCY');
    if (externalUrl) {
      let url;
      try { url = new URL(externalUrl); } catch (_) { throw new Error('HTTPS_CHANNEL_URL_REQUIRED'); }
      if (url.protocol !== 'https:') throw new Error('HTTPS_CHANNEL_URL_REQUIRED');
    }
    return {
      tenantId: input.tenantId, propertyId: input.propertyId, channelCode, externalListingId,
      displayName, externalUrl, payoutCurrency
    };
  }

  async function saveChannelListing(client, input = {}) {
    if (!client || typeof client.rpc !== 'function') throw new Error('SUPABASE_CLIENT_REQUIRED');
    const valid = validateInput(input);
    const { data, error } = await client.rpc('save_property_channel_listing', {
      p_tenant_id: valid.tenantId,
      p_property_id: valid.propertyId,
      p_channel_code: valid.channelCode,
      p_external_listing_id: valid.externalListingId,
      p_display_name: valid.displayName,
      p_external_url: valid.externalUrl,
      p_payout_currency: valid.payoutCurrency
    });
    if (error) throw error;
    return data;
  }

  return { CHANNELS, validateInput, saveChannelListing };
}));
