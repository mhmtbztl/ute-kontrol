// LEXBNB PHASE 17 — CHANNEL LISTING SETUP CLIENT
// Kanal ilani: mulkun bir platformdaki (Airbnb, Booking.com ...) ilani.
// Mulk profili (Kanallar sekmesi) ve pazarlama hunisi ayni modulu kullanir;
// iki ekran ayri dogrulama yazsaydi "Pazarlama'da kaydedilen ilan Mulkler'de
// yok" ayrismasi geri gelirdi (L-214, kullanici M43).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarketingChannelListingService = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const CHANNELS = Object.freeze(['AIRBNB', 'BOOKING_COM', 'VRBO', 'EXPEDIA', 'DIRECT', 'OTHER_OTA']);
  const CHANNEL_LABELS = Object.freeze({
    AIRBNB: 'Airbnb', BOOKING_COM: 'Booking.com', VRBO: 'Vrbo', EXPEDIA: 'Expedia',
    DIRECT: 'Kendi web siteniz', OTHER_OTA: 'Diğer OTA'
  });
  // Platformun size odeme yaptigi para birimi. Booking.com cogu hesapta EUR
  // oder; "EUR" secmek yeterlidir, tutarlar bu alana gore cevrilmez.
  const CURRENCIES = Object.freeze(['TRY', 'EUR', 'USD', 'GBP']);
  // "Ilan ID" nedir — kullanici her kanal icin sordu (9.3.6).
  const LISTING_ID_HELP = Object.freeze({
    AIRBNB: 'İlan adresindeki /rooms/ sonrası sayı (airbnb.com.tr/rooms/12345678 → 12345678).',
    BOOKING_COM: 'Extranet’teki tesis numarası ya da ilan adresindeki ad (booking.com/hotel/tr/villa-deniz.html → villa-deniz).',
    VRBO: 'İlan adresindeki sayı (vrbo.com/1234567 → 1234567).',
    EXPEDIA: 'İlan adresindeki .h ile başlayan sayı (….h12345678.Hotel-Information → 12345678).',
    DIRECT: 'Gerekmez; web sitenizdeki sayfa adresi yeterli.',
    OTHER_OTA: 'Platformun size verdiği ilan/tesis numarası; yoksa ilan adresi yeterli.'
  });

  function optionalText(value) { return value === undefined || value === null ? null : String(value).trim() || null; }

  // Baglantidan ilan kimligini okur. Okunamazsa adresin kendisi (sorgu ve
  // capa olmadan) sabit referans olur: ayni adres tekrar kaydedilirse ayni
  // ilan guncellenir, ikinci kayit acilmaz. Uydurma kimlik uretilmez.
  function deriveListingId(channelCode, externalUrl) {
    const raw = optionalText(externalUrl);
    if (!raw) return null;
    let url;
    try { url = new URL(raw); } catch (_) { return null; }
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const pathName = url.pathname;
    const channel = String(channelCode || '').trim().toUpperCase();
    let match = null;
    if (channel === 'AIRBNB' && /airbnb\./.test(host)) match = pathName.match(/\/rooms\/(?:plus\/)?(\d+)/);
    else if (channel === 'BOOKING_COM' && /booking\.com$/.test(host)) match = pathName.match(/\/hotel\/[a-z]{2}\/([a-z0-9-]+?)(?:\.[a-z]{2}(?:-[a-z]{2})?)?\.html/i);
    else if (channel === 'VRBO' && /vrbo\.com$/.test(host)) match = pathName.match(/^\/(?:[a-z]{2}-[a-z]{2}\/)?(?:[a-z-]+\/)*(\d{4,})(?:ha)?\b/i);
    else if (channel === 'EXPEDIA' && /expedia\./.test(host)) match = pathName.match(/\.h(\d+)\./i);
    if (match) return match[1].toLowerCase();
    const plain = (host.replace(/^www\./, '') + pathName).replace(/\/+$/, '');
    return plain.length <= 200 ? plain : null;
  }

  function validateInput(input = {}) {
    const channelCode = String(input.channelCode || '').trim().toUpperCase();
    const externalUrl = optionalText(input.externalUrl);
    const displayName = optionalText(input.displayName);
    const payoutCurrency = String(input.payoutCurrency || 'TRY').trim().toUpperCase();
    if (!UUID_RE.test(String(input.tenantId || ''))) throw new Error('VALID_TENANT_ID_REQUIRED');
    if (!UUID_RE.test(String(input.propertyId || ''))) throw new Error('VALID_PROPERTY_ID_REQUIRED');
    if (!CHANNELS.includes(channelCode)) throw new Error('INVALID_CHANNEL_CODE');
    if (externalUrl) {
      let url;
      try { url = new URL(externalUrl); } catch (_) { throw new Error('HTTPS_CHANNEL_URL_REQUIRED'); }
      if (url.protocol !== 'https:') throw new Error('HTTPS_CHANNEL_URL_REQUIRED');
    }
    const externalListingId = String(input.externalListingId || '').trim() || deriveListingId(channelCode, externalUrl) || '';
    if (!externalListingId || externalListingId.length > 200) throw new Error('CHANNEL_LISTING_REFERENCE_REQUIRED');
    if (channelCode === 'OTHER_OTA' && !displayName) throw new Error('CUSTOM_OTA_NAME_REQUIRED');
    if (!/^[A-Z]{3}$/.test(payoutCurrency)) throw new Error('INVALID_PAYOUT_CURRENCY');
    return {
      tenantId: input.tenantId, propertyId: input.propertyId, channelCode, externalListingId,
      displayName, externalUrl, payoutCurrency
    };
  }

  const ERROR_MESSAGES = Object.freeze({
    CHANNEL_LISTING_REFERENCE_REQUIRED: 'İlan bağlantısını ya da ilan ID’sini girin.',
    HTTPS_CHANNEL_URL_REQUIRED: 'İlan bağlantısı https:// ile başlamalı.',
    CUSTOM_OTA_NAME_REQUIRED: '“Diğer OTA” için platform adını yazın (ör. ETS Tur).',
    INVALID_PAYOUT_CURRENCY: 'Ödeme para birimini seçin.',
    INVALID_CHANNEL_CODE: 'Kanal seçin.',
    CHANNEL_LISTING_REFERENCE_BELONGS_TO_ANOTHER_PROPERTY: 'Bu ilan başka bir mülke kayıtlı; önce oradan arşivleyin.',
    UNAUTHORIZED_CHANNEL_LISTING_WRITE: 'Kanal ilanını yalnız işletme sahibi ve yöneticiler kaydedebilir.',
    PROPERTY_NOT_FOUND_IN_TENANT: 'Mülk bulunamadı; sayfayı yenileyip yeniden deneyin.'
  });

  function errorMessage(error) {
    const text = String(error && error.message || error || '');
    const code = Object.keys(ERROR_MESSAGES).find(key => text.includes(key));
    return code ? ERROR_MESSAGES[code] : 'Kanal ilanı kaydedilemedi. Alanları kontrol edip yeniden deneyin.';
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

  // Arsiv silme degildir: anlik goruntuler ve deneyler ilana bagli kalir.
  // Ayni kanal + ID yeniden kaydedilirse RPC ilani yeniden ACTIVE yapar.
  async function archiveChannelListing(client, input = {}) {
    if (!client || typeof client.from !== 'function') throw new Error('SUPABASE_CLIENT_REQUIRED');
    if (!UUID_RE.test(String(input.tenantId || ''))) throw new Error('VALID_TENANT_ID_REQUIRED');
    if (!UUID_RE.test(String(input.listingId || ''))) throw new Error('VALID_LISTING_ID_REQUIRED');
    const { data, error } = await client.from('property_channel_listings')
      .update({ status: 'ARCHIVED' })
      .eq('tenant_id', input.tenantId).eq('id', input.listingId)
      .select('id');
    if (error) throw error;
    // RLS reddi hata degil 0 satir dondurur; "arsivlendi" demeden once olcülür.
    if (!Array.isArray(data) || data.length !== 1) throw new Error('UNAUTHORIZED_CHANNEL_LISTING_WRITE');
    return { listingId: data[0].id };
  }

  function field(row, snake, camel) { return row[snake] !== undefined ? row[snake] : row[camel]; }

  function listingsForProperty(listings = [], propertyId) {
    return (Array.isArray(listings) ? listings : [])
      .filter(row => row && field(row, 'property_id', 'propertyId') === propertyId
        && String(row.status || 'ACTIVE').toUpperCase() !== 'ARCHIVED')
      .sort((a, b) => CHANNELS.indexOf(String(field(a, 'channel_code', 'channelCode')).toUpperCase())
        - CHANNELS.indexOf(String(field(b, 'channel_code', 'channelCode')).toUpperCase()));
  }

  function channelName(row) {
    const code = String(field(row, 'channel_code', 'channelCode') || '').toUpperCase();
    const name = optionalText(field(row, 'display_name', 'displayName'));
    if (code === 'OTHER_OTA' && name) return name;
    return CHANNEL_LABELS[code] || code;
  }

  // ChatGPT'ye yapistirilacak duz liste: "Kanal — ilan adi: baglanti".
  function linkListText(propertyName, listings = []) {
    const lines = listings.map(row => {
      const code = String(field(row, 'channel_code', 'channelCode') || '').toUpperCase();
      const name = optionalText(field(row, 'display_name', 'displayName'));
      const url = optionalText(field(row, 'external_url', 'externalUrl'));
      const label = code === 'OTHER_OTA' ? channelName(row) : (CHANNEL_LABELS[code] || code) + (name ? ` — ${name}` : '');
      return `- ${label}: ${url || 'bağlantı girilmemiş'}`;
    });
    return [`${propertyName || 'Mülk'} — kanal ilanları`, ...lines].join('\n');
  }

  return {
    CHANNELS, CHANNEL_LABELS, CURRENCIES, LISTING_ID_HELP,
    deriveListingId, validateInput, errorMessage, saveChannelListing, archiveChannelListing,
    listingsForProperty, channelName, linkListText
  };
}));
