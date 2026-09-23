// =============================================================================
// LEXBNB PROPERTY ANALYSIS CONTEXT SERVICE
// Tenant-scoped market location, public profiles and OTA analysis-link adapter.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PropertyAnalysisContextService = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const SOCIAL_LINK_KEYS = Object.freeze([
    'website', 'instagram', 'facebook', 'tiktok', 'youtube', 'googleBusiness'
  ]);
  const ISO_COUNTRY_CODES = Object.freeze((
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
    'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
    'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO ' +
    'JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR ' +
    'MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO ' +
    'RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV ' +
    'TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
  ).split(/\s+/));
  const COUNTRY_SET = new Set(ISO_COUNTRY_CODES);
  const CHANNEL_LABELS = Object.freeze({
    AIRBNB: 'Airbnb', BOOKING_COM: 'Booking.com', VRBO: 'Vrbo', EXPEDIA: 'Expedia',
    DIRECT: 'Direkt', OTHER_OTA: 'Diğer OTA'
  });

  function optionalText(value, maxLength, code) {
    const text = value === undefined || value === null ? '' : String(value).trim();
    if (!text) return null;
    if (text.length > maxLength) throw new Error(code);
    return text;
  }

  function sanitizeHttpsUrl(value) {
    const text = optionalText(value, 2048, 'HTTPS_PUBLIC_URL_REQUIRED');
    if (!text) return null;
    let url;
    try { url = new URL(text); } catch (_) { throw new Error('HTTPS_PUBLIC_URL_REQUIRED'); }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('HTTPS_PUBLIC_URL_REQUIRED');
    }
    return url.href;
  }

  function sanitizeSocialLinks(input = {}, options = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_SOCIAL_LINKS');
    const result = {};
    Object.entries(input).forEach(([key, value]) => {
      const text = value === undefined || value === null ? '' : String(value).trim();
      if (!SOCIAL_LINK_KEYS.includes(key)) {
        if (text) throw new Error('UNSUPPORTED_SOCIAL_LINK');
        return;
      }
      if (!text) return;
      try { result[key] = sanitizeHttpsUrl(text); } catch (error) {
        if (!options.omitInvalid) throw error;
      }
    });
    if (JSON.stringify(result).length > 8192) throw new Error('SOCIAL_LINKS_TOO_LARGE');
    return result;
  }

  function countryName(countryCode, locale = 'tr') {
    const code = String(countryCode || '').trim().toUpperCase();
    if (!COUNTRY_SET.has(code)) return null;
    try {
      if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
        return new Intl.DisplayNames([locale], { type: 'region' }).of(code) || code;
      }
    } catch (_) { /* fall through to stable code */ }
    return code;
  }

  function validateContextInput(input = {}) {
    const tenantId = String(input.tenantId || '');
    const propertyId = String(input.propertyId || '');
    if (!UUID_RE.test(tenantId)) throw new Error('VALID_TENANT_ID_REQUIRED');
    if (!UUID_RE.test(propertyId)) throw new Error('VALID_PROPERTY_ID_REQUIRED');
    const countryCode = optionalText(input.countryCode, 2, 'INVALID_COUNTRY_CODE');
    const normalizedCountry = countryCode && countryCode.toUpperCase();
    if (normalizedCountry && !COUNTRY_SET.has(normalizedCountry)) throw new Error('INVALID_COUNTRY_CODE');
    return {
      tenantId,
      propertyId,
      countryCode: normalizedCountry || null,
      adminArea: optionalText(input.adminArea, 120, 'PROPERTY_ANALYSIS_LOCATION_TOO_LONG'),
      city: optionalText(input.city, 120, 'PROPERTY_ANALYSIS_LOCATION_TOO_LONG'),
      districtRegion: optionalText(input.districtRegion, 160, 'PROPERTY_ANALYSIS_LOCATION_TOO_LONG'),
      socialLinks: sanitizeSocialLinks(input.socialLinks || {})
    };
  }

  async function savePropertyAnalysisContext(client, input = {}) {
    if (!client || typeof client.rpc !== 'function') throw new Error('SUPABASE_CLIENT_REQUIRED');
    const valid = validateContextInput(input);
    const { data, error } = await client.rpc('save_property_analysis_context', {
      p_tenant_id: valid.tenantId,
      p_property_id: valid.propertyId,
      p_country_code: valid.countryCode,
      p_admin_area: valid.adminArea,
      p_city: valid.city,
      p_district_region: valid.districtRegion,
      p_social_links: valid.socialLinks
    });
    if (error) throw error;
    return data;
  }

  function validateScope(scope = {}) {
    const tenantId = String(scope.tenantId || '');
    if (!UUID_RE.test(tenantId)) throw new Error('VALID_TENANT_ID_REQUIRED');
    const propertyIds = Array.from(new Set(scope.propertyIds || []));
    if (!propertyIds.length || propertyIds.some(id => !UUID_RE.test(String(id)))) {
      throw new Error('VALID_PROPERTY_IDS_REQUIRED');
    }
    return { tenantId, propertyIds };
  }

  function isMissingSchemaError(error) {
    const code = String(error && error.code || '').toUpperCase();
    const message = String(error && error.message || '').toLowerCase();
    return ['PGRST202', 'PGRST205', '42P01'].includes(code) || message.includes('schema cache') || message.includes('does not exist');
  }

  async function execute(query) {
    const result = await query;
    if (result && result.error) throw result.error;
    return Array.isArray(result && result.data) ? result.data : [];
  }

  async function loadAnalysisContext(client, scope = {}) {
    if (!client || typeof client.from !== 'function') throw new Error('SUPABASE_CLIENT_REQUIRED');
    const valid = validateScope(scope);
    const contextPromise = execute(client.from('property_analysis_context')
      .select('property_id,country_code,admin_area,city,district_region,social_links')
      .eq('tenant_id', valid.tenantId)
      .in('property_id', valid.propertyIds));
    const listingPromise = execute(client.from('property_channel_listings')
      .select('property_id,channel_code,display_name,external_url,status')
      .eq('tenant_id', valid.tenantId)
      .in('property_id', valid.propertyIds)
      .eq('status', 'ACTIVE'));
    const [contextResult, listingResult] = await Promise.allSettled([contextPromise, listingPromise]);
    const warnings = [];
    let contexts = [];
    let channelListings = [];
    let contextAvailable = true;
    if (contextResult.status === 'fulfilled') contexts = contextResult.value;
    else if (isMissingSchemaError(contextResult.reason)) {
      contextAvailable = false;
      warnings.push('ANALYSIS_CONTEXT_SCHEMA_UNAVAILABLE');
    } else {
      warnings.push('ANALYSIS_CONTEXT_READ_FAILED');
    }
    if (listingResult.status === 'fulfilled') channelListings = listingResult.value;
    else warnings.push('ANALYSIS_OTA_LINKS_UNAVAILABLE');
    return { contexts, channelListings, contextAvailable, warnings };
  }

  function attachAnalysisContext(properties = [], bundle = {}) {
    const contexts = new Map((bundle.contexts || []).map(row => [row.property_id || row.propertyId, row]));
    const listingsByProperty = new Map();
    (bundle.channelListings || []).forEach(row => {
      const propertyId = row.property_id || row.propertyId;
      if (!listingsByProperty.has(propertyId)) listingsByProperty.set(propertyId, []);
      listingsByProperty.get(propertyId).push(row);
    });
    return properties.map(property => {
      const propertyId = property.id;
      const row = contexts.get(propertyId) || {};
      const countryCode = String(row.country_code || row.countryCode || '').toUpperCase() || null;
      const socialLinks = sanitizeSocialLinks(row.social_links || row.socialLinks || {}, { omitInvalid: true });
      const otaLinks = (listingsByProperty.get(propertyId) || []).reduce((result, listing) => {
        let url;
        try { url = sanitizeHttpsUrl(listing.external_url || listing.externalUrl); } catch (_) { return result; }
        if (!url) return result;
        const channel = String(listing.channel_code || listing.channelCode || 'OTHER_OTA').toUpperCase();
        result.push({
          channel,
          displayName: optionalText(listing.display_name || listing.displayName, 200, 'INVALID_DISPLAY_NAME') || CHANNEL_LABELS[channel] || 'Diğer OTA',
          url
        });
        return result;
      }, []);
      return {
        ...property,
        analysisContext: {
          location: {
            countryCode,
            countryName: countryName(countryCode),
            adminArea: optionalText(row.admin_area || row.adminArea, 120, 'PROPERTY_ANALYSIS_LOCATION_TOO_LONG'),
            city: optionalText(row.city, 120, 'PROPERTY_ANALYSIS_LOCATION_TOO_LONG'),
            districtRegion: optionalText(row.district_region || row.districtRegion, 160, 'PROPERTY_ANALYSIS_LOCATION_TOO_LONG')
          },
          socialLinks,
          otaLinks
        }
      };
    });
  }

  return {
    UUID_RE, SOCIAL_LINK_KEYS, ISO_COUNTRY_CODES,
    sanitizeHttpsUrl, sanitizeSocialLinks, countryName, validateContextInput,
    savePropertyAnalysisContext, isMissingSchemaError, loadAnalysisContext,
    attachAnalysisContext
  };
}));
