// =============================================================================
// LEXBNB PHASE 10 — MESSAGE TEMPLATE ENGINE
// Whitelist validation, SAFE vs SENSITIVE classification, Versioned Snapshots,
// and Hierarchical Template Resolution
// =============================================================================

const VARIABLE_WHITELIST = {
  // SAFE variables
  guest_first_name: { type: 'SAFE', description: 'Misafirin adı' },
  guest_last_name: { type: 'SAFE', description: 'Misafirin soyadı' },
  guest_full_name: { type: 'SAFE', description: 'Misafirin tam adı' },
  property_name: { type: 'SAFE', description: 'Mülk / Villa adı' },
  check_in_date: { type: 'SAFE', description: 'Giriş tarihi (YYYY-MM-DD)' },
  check_in_time: { type: 'SAFE', description: 'Giriş saati (Örn: 15:00)' },
  check_out_date: { type: 'SAFE', description: 'Çıkış tarihi (YYYY-MM-DD)' },
  check_out_time: { type: 'SAFE', description: 'Çıkış saati (Örn: 11:00)' },
  property_address: { type: 'SAFE', description: 'Mülkün açık adresi' },
  map_link: { type: 'SAFE', description: 'Google Haritalar konumu' },
  host_phone: { type: 'SAFE', description: 'İşletme iletişim numarası' },
  booking_total: { type: 'SAFE', description: 'Rezervasyon toplam tutarı' },
  remaining_balance: { type: 'SAFE', description: 'Kalan ödeme bakiyesi' },
  nights_count: { type: 'SAFE', description: 'Konaklama gece sayısı' },
  guest_count: { type: 'SAFE', description: 'Misafir sayısı' },
  extension_discount_percent: { type: 'SAFE', description: 'Uzatma teklifi indirim oranı (%)' },
  extension_night_rate: { type: 'SAFE', description: 'Uzatma teklifi indirimli gece ücreti' },

  // SENSITIVE variables (Secret Access Credentials)
  wifi_name: { type: 'SAFE', description: 'Wi-Fi ağ adı' },
  wifi_password: { type: 'SENSITIVE', description: 'Wi-Fi şifresi' },
  door_code: { type: 'SENSITIVE', description: 'Akıllı kapı giriş kodu' },
  lockbox_code: { type: 'SENSITIVE', description: 'Kilitli kutu / anahtar şifresi' },
  access_code: { type: 'SENSITIVE', description: 'Genel giriş erişim kodu' }
};

/**
 * Extracts all variable names like {{variable_name}} from a template string.
 * @param {string} text
 * @returns {Array<string>}
 */
function extractVariables(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/[\{\}]/g, '').trim()))];
}

/**
 * Validates that all variables in a template are within the whitelist.
 * Throws an error if unknown variables exist.
 * @param {string} text
 * @returns {{ valid: boolean, unknownVariables: Array<string>, sensitiveVariables: Array<string> }}
 */
function validateTemplateVariables(text) {
  const vars = extractVariables(text);
  const unknownVariables = [];
  const sensitiveVariables = [];

  for (const v of vars) {
    if (!VARIABLE_WHITELIST[v]) {
      unknownVariables.push(v);
    } else if (VARIABLE_WHITELIST[v].type === 'SENSITIVE') {
      sensitiveVariables.push(v);
    }
  }

  if (unknownVariables.length > 0) {
    const err = new Error(`VALIDATION_ERROR: Tanımlanamayan şablon değişkenleri bulundu: ${unknownVariables.join(', ')}`);
    err.unknownVariables = unknownVariables;
    throw err;
  }

  return {
    valid: true,
    unknownVariables: [],
    sensitiveVariables
  };
}

/**
 * Resolves template using standard 4-step hierarchy:
 * 1. Property + Requested Language
 * 2. Portfolio default + Requested Language
 * 3. Property + Default Language (tr)
 * 4. Portfolio default + Default Language (tr)
 * @param {Array<Object>} templates
 * @param {Object} query - { propertyId, lifecycleStage, channel, language, defaultLanguage }
 * @returns {Object} Selected template
 */
function resolveTemplate(templates, query) {
  const {
    propertyId,
    lifecycleStage,
    channel,
    language = 'tr',
    defaultLanguage = 'tr'
  } = query;

  const activeTemplates = (templates || []).filter(
    t => t.is_active !== false &&
         t.lifecycle_stage === lifecycleStage &&
         t.channel === channel
  );

  // 1. Property + Requested Language
  if (propertyId) {
    const propLang = activeTemplates.find(t => t.property_id === propertyId && t.language === language);
    if (propLang) return propLang;
  }

  // 2. Portfolio default + Requested Language
  const portLang = activeTemplates.find(t => !t.property_id && t.language === language);
  if (portLang) return portLang;

  // 3. Property + Default Language
  if (propertyId && language !== defaultLanguage) {
    const propDef = activeTemplates.find(t => t.property_id === propertyId && t.language === defaultLanguage);
    if (propDef) return propDef;
  }

  // 4. Portfolio default + Default Language
  const portDef = activeTemplates.find(t => !t.property_id && t.language === defaultLanguage);
  if (portDef) return portDef;

  const err = new Error(`TEMPLATE_NOT_FOUND: Stage [${lifecycleStage}] ve Kanal [${channel}] için şablon bulunamadı`);
  err.code = 'TEMPLATE_NOT_FOUND';
  throw err;
}

/**
 * Renders template body and subject with provided context.
 * @param {Object} template - { id, version, body, subject }
 * @param {Object} context - Key-value map of variable values
 * @returns {{ renderedBody: string, renderedSubject: string, templateVersion: number, templateId: string, containsSensitiveVariables: boolean }}
 */
function renderTemplate(template, context = {}) {
  if (!template || !template.body) {
    throw new Error('Geçersiz şablon tanımı');
  }

  validateTemplateVariables(template.body);
  if (template.subject) {
    validateTemplateVariables(template.subject);
  }

  const varsInBody = extractVariables(template.body);
  const varsInSubject = extractVariables(template.subject || '');
  const allVars = [...new Set([...varsInBody, ...varsInSubject])];

  const containsSensitiveVariables = allVars.some(
    v => VARIABLE_WHITELIST[v] && VARIABLE_WHITELIST[v].type === 'SENSITIVE'
  );

  let renderedBody = template.body;
  let renderedSubject = template.subject || '';

  for (const v of allVars) {
    const val = context[v] !== undefined && context[v] !== null ? String(context[v]) : '';
    const re = new RegExp(`\\{\\{${v}\\}\\}`, 'g');
    renderedBody = renderedBody.replace(re, val);
    if (renderedSubject) {
      renderedSubject = renderedSubject.replace(re, val);
    }
  }

  return {
    renderedBody,
    renderedSubject,
    templateVersion: template.version || 1,
    templateId: template.id,
    containsSensitiveVariables
  };
}

/**
 * Masks sensitive access codes from strings for logging/AI payload safety.
 * @param {string} text
 * @returns {string} Sanitized string
 */
function maskSensitiveContent(text) {
  if (!text || typeof text !== 'string') return '';
  // Mask potential Wi-Fi passwords, door codes, PINs, etc.
  return text
    .replace(/(şifre[a-z]*|parola|kod|password|pass|code|wi-?fi(?:\s+password|\s+şifresi)?|pin)[:=\s]+([^\s\n\r,.]+)/gi, (m, label) => `${label}: [MASKED]`)
    .replace(/\b\d{4,8}\b/g, '[PIN_MASKED]');
}

module.exports = {
  VARIABLE_WHITELIST,
  extractVariables,
  validateTemplateVariables,
  resolveTemplate,
  renderTemplate,
  maskSensitiveContent
};
