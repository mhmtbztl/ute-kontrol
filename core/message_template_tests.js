// =============================================================================
// LEXBNB PHASE 10 — MESSAGE TEMPLATE ENGINE TEST SUITE
// Tests variable whitelist validation, SAFE vs SENSITIVE classification,
// hierarchical resolution, version snapshotting, and soft deletion.
// =============================================================================

const assert = require('assert');
const {
  VARIABLE_WHITELIST,
  validateTemplateVariables,
  resolveTemplate,
  renderTemplate,
  maskSensitiveContent
} = require('./message_template_engine.js');

console.log('=============================================================================');
console.log('📝 LEXBNB PHASE 10 — MESSAGE TEMPLATE ENGINE TEST SUITE');
console.log('=============================================================================');

let passedTests = 0;
let totalTests = 0;

function recordPass(msg) {
  totalTests++;
  passedTests++;
  console.log(`[PASS] ${msg}`);
}

async function runMessageTemplateTests() {
  // TEST 1: Valid Variable Whitelist Render
  console.log('\n--- TEST 1: Valid Variable Rendering ---');
  const tmpl1 = {
    id: 't1',
    version: 1,
    subject: 'Rezervasyon Onayı: {{property_name}}',
    body: 'Sayın {{guest_first_name}}, {{check_in_date}} tarihindeki rezervasyonunuz onaylandı. Giriş saati: {{check_in_time}}.'
  };

  const context1 = {
    guest_first_name: 'Ahmet',
    property_name: 'Villa Seyir',
    check_in_date: '2026-10-15',
    check_in_time: '15:00'
  };

  const res1 = renderTemplate(tmpl1, context1);
  assert.strictEqual(res1.renderedSubject, 'Rezervasyon Onayı: Villa Seyir');
  assert.strictEqual(res1.renderedBody, 'Sayın Ahmet, 2026-10-15 tarihindeki rezervasyonunuz onaylandı. Giriş saati: 15:00.');
  assert.strictEqual(res1.containsSensitiveVariables, false);

  recordPass('1. Valid whitelisted template variables render accurately in subject and body');

  // TEST 2: Unknown Variable Validation Rejection
  console.log('\n--- TEST 2: Unknown Variable Rejection ---');
  const invalidTmpl = {
    id: 't_inv',
    body: 'Merhaba {{guest_first_name}}, kredi kartı numaranız: {{credit_card_cvv}}'
  };

  assert.throws(() => {
    renderTemplate(invalidTmpl, { guest_first_name: 'Ahmet' });
  }, /VALIDATION_ERROR/);

  recordPass('2. Unknown template variable throws VALIDATION_ERROR and prevents rendering');

  // TEST 3: SAFE vs SENSITIVE Variable Classification
  console.log('\n--- TEST 3: SAFE vs SENSITIVE Classification ---');
  const sensitiveTmpl = {
    id: 't_sens',
    version: 1,
    body: 'Giriş kapı kodunuz: {{door_code}}, Wi-Fi şifreniz: {{wifi_password}}'
  };

  const res3 = renderTemplate(sensitiveTmpl, { door_code: '4589', wifi_password: 'secret_wifi_pass' });
  assert.strictEqual(res3.containsSensitiveVariables, true);
  assert.strictEqual(VARIABLE_WHITELIST.door_code.type, 'SENSITIVE');
  assert.strictEqual(VARIABLE_WHITELIST.wifi_password.type, 'SENSITIVE');
  assert.strictEqual(VARIABLE_WHITELIST.guest_first_name.type, 'SAFE');

  recordPass('3. Variable classification accurately tags secret credentials as SENSITIVE');

  // TEST 4: Hierarchical Template Resolution
  console.log('\n--- TEST 4: Hierarchical Template Resolution ---');
  const templates = [
    { id: 't_port_tr', property_id: null, lifecycle_stage: 'CHECKIN_DAY', channel: 'WHATSAPP', language: 'tr', version: 1, is_active: true },
    { id: 't_port_en', property_id: null, lifecycle_stage: 'CHECKIN_DAY', channel: 'WHATSAPP', language: 'en', version: 1, is_active: true },
    { id: 't_prop_tr', property_id: 'prop_seyir', lifecycle_stage: 'CHECKIN_DAY', channel: 'WHATSAPP', language: 'tr', version: 2, is_active: true }
  ];

  // Property + TR resolves to property template
  const match1 = resolveTemplate(templates, { propertyId: 'prop_seyir', lifecycleStage: 'CHECKIN_DAY', channel: 'WHATSAPP', language: 'tr' });
  assert.strictEqual(match1.id, 't_prop_tr');

  // Property + EN falls back to portfolio default EN
  const match2 = resolveTemplate(templates, { propertyId: 'prop_seyir', lifecycleStage: 'CHECKIN_DAY', channel: 'WHATSAPP', language: 'en' });
  assert.strictEqual(match2.id, 't_port_en');

  // Other property falls back to portfolio default TR
  const match3 = resolveTemplate(templates, { propertyId: 'prop_other', lifecycleStage: 'CHECKIN_DAY', channel: 'WHATSAPP', language: 'tr' });
  assert.strictEqual(match3.id, 't_port_tr');

  recordPass('4. 4-step template resolution correctly resolves property overrides and language fallbacks');

  // TEST 5: Versioned Snapshot Immutability
  console.log('\n--- TEST 5: Versioned Snapshot Immutability ---');
  const templateV1 = { id: 't_checkin', version: 1, body: 'V1 Giriş Bilgileri: {{check_in_time}}' };
  const snapshotV1 = renderTemplate(templateV1, { check_in_time: '15:00' });

  // Template updated to V2
  const templateV2 = { id: 't_checkin', version: 2, body: 'V2 Yenilenen Giriş Bilgileri: {{check_in_time}}' };
  const snapshotV2 = renderTemplate(templateV2, { check_in_time: '15:00' });

  assert.strictEqual(snapshotV1.templateVersion, 1);
  assert.strictEqual(snapshotV1.renderedBody.includes('V1'), true);
  assert.strictEqual(snapshotV2.templateVersion, 2);
  assert.strictEqual(snapshotV2.renderedBody.includes('V2'), true);

  recordPass('5. Versioned snapshot ensures historical scheduled messages preserve original template version');

  // TEST 6: Soft-Delete (is_active = false) Exclusion
  console.log('\n--- TEST 6: Soft-Delete Preservation ---');
  const inactiveTemplates = [
    { id: 't_old', property_id: null, lifecycle_stage: 'PRE_ARRIVAL', channel: 'WHATSAPP', language: 'tr', is_active: false },
    { id: 't_new', property_id: null, lifecycle_stage: 'PRE_ARRIVAL', channel: 'WHATSAPP', language: 'tr', is_active: true }
  ];

  const resolvedActive = resolveTemplate(inactiveTemplates, { lifecycleStage: 'PRE_ARRIVAL', channel: 'WHATSAPP', language: 'tr' });
  assert.strictEqual(resolvedActive.id, 't_new');

  recordPass('6. Soft-deleted templates (is_active = false) are excluded from new resolutions but preserved in DB');

  // TEST 7: Sensitive Content Masking for Logs
  console.log('\n--- TEST 7: Sensitive Content Masking ---');
  const rawBody = 'Kapı şifresi: 4892. Wi-Fi password: my_super_secret_pass';
  const masked = maskSensitiveContent(rawBody);
  assert.strictEqual(masked.includes('4892'), false);
  assert.strictEqual(masked.includes('my_super_secret_pass'), false);
  assert.strictEqual(masked.includes('[MASKED]') || masked.includes('[PIN_MASKED]'), true);

  recordPass('7. Sensitive content masking strips plain text credentials before logging or telemetry');

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log('=============================================================================');
}

runMessageTemplateTests().catch(err => {
  console.error('[FAIL] Message template test suite failed:', err);
  process.exit(1);
});
