// =============================================================================
// LEXBNB PROPERTY ANALYSIS CONTEXT UI
// Accessible property-modal adapter for Phase 40 location and public profiles.
// =============================================================================

let propertyAnalysisContextDirty = false;
let propertyAnalysisContextLoading = false;
let propertyAnalysisContextPropertyId = null;

const PROPERTY_ANALYSIS_FIELDS = Object.freeze({
  countryCode: 'propAnalysisCountry', adminArea: 'propAnalysisAdminArea',
  city: 'propAnalysisCity', districtRegion: 'propAnalysisDistrictRegion'
});
const PROPERTY_SOCIAL_FIELDS = Object.freeze({
  website: 'propSocialWebsite', instagram: 'propSocialInstagram',
  facebook: 'propSocialFacebook', tiktok: 'propSocialTikTok',
  youtube: 'propSocialYouTube', googleBusiness: 'propSocialGoogleBusiness'
});

function setPropertyAnalysisContextStatus(message, tone = '') {
  const element = document.getElementById('propAnalysisContextStatus');
  if (!element) return;
  element.textContent = message || '';
  element.dataset.tone = tone;
}

function populatePropertyAnalysisCountries() {
  const select = document.getElementById(PROPERTY_ANALYSIS_FIELDS.countryCode);
  if (!select || select.options.length > 1 || typeof PropertyAnalysisContextService === 'undefined') return;
  PropertyAnalysisContextService.ISO_COUNTRY_CODES
    .map(code => ({ code, label: PropertyAnalysisContextService.countryName(code) || code }))
    .sort((left, right) => left.label.localeCompare(right.label, 'tr'))
    .forEach(({ code, label }) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = `${label} (${code})`;
      select.appendChild(option);
    });
}

function setPropertyAnalysisFieldValues(row = {}) {
  const locationValues = {
    countryCode: row.country_code || row.countryCode || '',
    adminArea: row.admin_area || row.adminArea || '',
    city: row.city || '',
    districtRegion: row.district_region || row.districtRegion || ''
  };
  const socialLinks = row.social_links || row.socialLinks || {};
  Object.entries(PROPERTY_ANALYSIS_FIELDS).forEach(([key, id]) => {
    const element = document.getElementById(id);
    if (element) element.value = locationValues[key] || '';
  });
  Object.entries(PROPERTY_SOCIAL_FIELDS).forEach(([key, id]) => {
    const element = document.getElementById(id);
    if (element) element.value = socialLinks[key] || '';
  });
}

function resetPropertyAnalysisContextForm() {
  populatePropertyAnalysisCountries();
  propertyAnalysisContextDirty = false;
  propertyAnalysisContextLoading = false;
  propertyAnalysisContextPropertyId = null;
  setPropertyAnalysisFieldValues();
  setPropertyAnalysisContextStatus('Konum ve sosyal profiller ChatGPT pazar analizine güvenli bağlantı olarak eklenir.');
}

async function loadPropertyAnalysisContextForm(propertyId) {
  resetPropertyAnalysisContextForm();
  propertyAnalysisContextPropertyId = propertyId || null;
  if (!propertyId || typeof isUUID !== 'function' || !isUUID(propertyId)) {
    setPropertyAnalysisContextStatus('Konum ve profilleri kaydetmek için önce mülkü kaydedin.');
    return;
  }
  if (typeof PropertyAnalysisContextService === 'undefined') {
    setPropertyAnalysisContextStatus('Pazar bağlamı servisi yüklenemedi.', 'error');
    return;
  }
  propertyAnalysisContextLoading = true;
  setPropertyAnalysisContextStatus('Konum ve sosyal profiller yükleniyor…');
  try {
    const bundle = await PropertyAnalysisContextService.loadAnalysisContext(supabaseClient, {
      tenantId: getActiveTenantId(), propertyIds: [propertyId]
    });
    if (propertyAnalysisContextPropertyId !== propertyId) return;
    setPropertyAnalysisFieldValues(bundle.contexts[0] || {});
    propertyAnalysisContextDirty = false;
    setPropertyAnalysisContextStatus(bundle.contextAvailable
      ? 'Konum ve sosyal profiller analize hazır.'
      : 'Phase 40 henüz uygulanmamış. Normal mülk kaydı çalışır; bu alanlar göçten sonra kaydedilebilir.',
    bundle.contextAvailable ? 'success' : 'warning');
  } catch (_) {
    if (propertyAnalysisContextPropertyId === propertyId) {
      setPropertyAnalysisContextStatus('Konum ve sosyal profiller yüklenemedi. Normal mülk kaydı etkilenmez.', 'error');
    }
  } finally {
    propertyAnalysisContextLoading = false;
  }
}

function getPropertyAnalysisContextDraft() {
  const value = id => document.getElementById(id)?.value || '';
  const socialLinks = {};
  Object.entries(PROPERTY_SOCIAL_FIELDS).forEach(([key, id]) => { socialLinks[key] = value(id); });
  return {
    countryCode: value(PROPERTY_ANALYSIS_FIELDS.countryCode),
    adminArea: value(PROPERTY_ANALYSIS_FIELDS.adminArea),
    city: value(PROPERTY_ANALYSIS_FIELDS.city),
    districtRegion: value(PROPERTY_ANALYSIS_FIELDS.districtRegion),
    socialLinks
  };
}

async function savePropertyAnalysisContextDraft(propertyId) {
  if (!propertyAnalysisContextDirty) return { skipped: true };
  if (propertyAnalysisContextLoading) throw new Error('ANALYSIS_CONTEXT_LOADING');
  const result = await PropertyAnalysisContextService.savePropertyAnalysisContext(supabaseClient, {
    tenantId: getActiveTenantId(), propertyId, ...getPropertyAnalysisContextDraft()
  });
  propertyAnalysisContextDirty = false;
  propertyAnalysisContextPropertyId = propertyId;
  setPropertyAnalysisContextStatus('Konum ve sosyal profiller kaydedildi.', 'success');
  return result;
}

function openPropertyOtaManager() {
  if (!propertyAnalysisContextPropertyId) {
    setPropertyAnalysisContextStatus('OTA bağlantısı eklemek için önce mülkü kaydedin.', 'warning');
    return;
  }
  closePropertyModal();
  if (typeof openMarketingListingManager === 'function') openMarketingListingManager(propertyAnalysisContextPropertyId);
  else if (typeof switchTab === 'function') switchTab('marketing');
}

function initializePropertyAnalysisContextUi() {
  populatePropertyAnalysisCountries();
  [...Object.values(PROPERTY_ANALYSIS_FIELDS), ...Object.values(PROPERTY_SOCIAL_FIELDS)].forEach(id => {
    const element = document.getElementById(id);
    if (!element || element.dataset.analysisContextBound) return;
    element.dataset.analysisContextBound = 'true';
    element.addEventListener('input', () => { propertyAnalysisContextDirty = true; });
    element.addEventListener('change', () => { propertyAnalysisContextDirty = true; });
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializePropertyAnalysisContextUi);
  else initializePropertyAnalysisContextUi();
}
