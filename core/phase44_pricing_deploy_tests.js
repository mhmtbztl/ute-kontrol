'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase44_pricing_late_deploy_hardening.sql'), 'utf8').replace(/^\uFEFF/, '');
for (const table of ['pricing_profiles', 'pricing_rules', 'pricing_events', 'pricing_overrides', 'daily_rates', 'rate_change_logs', 'booking_quotes']) {
  assert(sql.includes(`'${table}'`), `${table} yok`);
}
assert.match(sql, /trg_tenant_id_immutable/);
assert.match(sql, /trg_pricing_write_authz/);
assert.match(sql, /v_role IS NULL OR v_role NOT IN/);
assert.match(sql, /REVOKE[\s\S]*FROM\s+PUBLIC, anon/i);
assert.match(sql, /save_manual_pricing_override_atomic/);
assert.match(sql, /accept_booking_quote_atomic/);
assert.match(sql, /VALUES\s*\(44,/i);
console.log('[PASS] phase44 geç phase11 tablolarını phase41 güvenlik sözleşmesine taşır');
console.log('TEST SUMMARY: 1 / 1 TESTS PASSED (0 FAILED)');
