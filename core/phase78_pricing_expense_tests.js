/** LEXBNB PHASE 78 — P61 kaynak sozlesmesi. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migration_phase78_pricing_research_expense_templates.sql'), 'utf8');
const phase80 = fs.readFileSync(path.join(root, 'supabase', 'migration_phase80_research_business_date.sql'), 'utf8');
const restore = fs.readFileSync(path.join(__dirname, 'restore_engine.js'), 'utf8');

function test(name, fn) {
  try { fn(); console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.message}`); throw error; }
}

test('1. Mesaj asamalari mevcut CHECK sozlesmesini genisletir', () => {
  assert.match(migration, /LEAD_QUOTE_FOLLOW_UP/);
  assert.match(migration, /LEAD_REENGAGEMENT/);
  assert.doesNotMatch(migration, /DROP CONSTRAINT IF EXISTS message_templates_message_type_check/);
  assert.doesNotMatch(migration, /ALTER COLUMN message_type/);
});

test('2. P61 dort yan tabloyu acar; properties ve expenses sutunlarini degistirmez', () => {
  for (const table of ['property_pricing_rule_settings', 'competitor_price_research', 'expense_templates', 'expense_template_occurrences']) {
    assert.match(migration, new RegExp(`CREATE TABLE public\\.${table} \\(`));
  }
  assert.doesNotMatch(migration, /ALTER TABLE public\.(properties|expenses)\b/i);
});

test('3. Her yeni tabloda RLS, tenant kilidi ve anon reddi vardir', () => {
  assert.match(migration, /trg_tenant_id_immutable/);
  assert.match(migration, /ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.%I FROM anon/);
  for (const table of ['property_pricing_rule_settings', 'competitor_price_research', 'expense_templates', 'expense_template_occurrences']) {
    const policies = [...migration.matchAll(new RegExp(`CREATE POLICY ${table}_(?:select|insert|update|delete)`, 'g'))];
    assert.strictEqual(policies.length, 4, `${table}: dort politika olmali`);
  }
});

test('4. Roller merkezi yardimcilardan gelir', () => {
  assert.match(migration, /property_pricing_rule_settings[\s\S]*?can_read_sales\(tenant_id\)/);
  assert.match(migration, /competitor_price_research[\s\S]*?can_read_sales\(tenant_id\)/);
  assert.match(migration, /expense_templates[\s\S]*?can_read_ledger\(tenant_id\)/);
  assert.match(migration, /expense_template_occurrences[\s\S]*?can_read_ledger\(tenant_id\)/);
  assert.doesNotMatch(migration, /get_tenant_role\([^)]*\)\s+(?:IN|NOT IN)/);
});

test('5. Tabloya gore dallanan tetikleyici kisa devre AND kullanmaz', () => {
  const body = migration.slice(migration.indexOf('FUNCTION public.guard_phase78_links()'), migration.indexOf('REVOKE ALL ON FUNCTION public.guard_phase78_links()'));
  assert.doesNotMatch(body, /TG_TABLE_NAME\s*=\s*'[^']+'\s+AND/i);
  assert.match(body, /IF TG_TABLE_NAME = 'property_pricing_rule_settings' THEN/);
  assert.match(body, /ELSIF TG_TABLE_NAME = 'expense_template_occurrences' THEN/);
});

test('6. Sifirlama yeni dort tabloyu acik sirada temizler', () => {
  const reset = migration.slice(migration.indexOf('FUNCTION public.reset_tenant_data('));
  for (const table of ['property_pricing_rule_settings', 'competitor_price_research', 'expense_templates', 'expense_template_occurrences']) {
    assert.match(reset, new RegExp(`'${table}'`));
  }
  assert(reset.indexOf("'expense_template_occurrences'") < reset.indexOf("'expenses'"));
  assert(reset.indexOf("'property_pricing_rule_settings'") < reset.indexOf("'properties'"));
});

test('7. Yeni view veya tetikleyici yan-etki tablosu olmadigi belgelenir', () => {
  assert.doesNotMatch(migration, /CREATE\s+(?:OR REPLACE\s+)?VIEW/i);
  assert.match(migration, /yeni VIEW ve baska tabloya yazan tetikleyici yoktur/i);
  assert.match(restore, /const VIEWS = \['channel_performance_rates', 'booking_payment_balances'\]/);
  for (const table of ['tenant_booking_channels', 'guest_consent_events', 'invitation_delivery_outbox', 'lead_source_catalog', 'ad_metric_period_days']) {
    assert.match(restore, new RegExp(`SIDE_EFFECTS[^;]+${table}`));
  }
});

test('8. Arastirma tarihi UTC degil Istanbul is gunu ile sinirlanir', () => {
  assert.match(phase80, /AT TIME ZONE 'Europe\/Istanbul'/);
  assert.match(phase80, /PHASE80_REQUIRES_PHASE78/);
  assert.doesNotMatch(phase80, /ALTER TABLE public\.(properties|expenses)\b/i);
});

console.log('TEST SUMMARY: 8 / 8 TESTS PASSED');
