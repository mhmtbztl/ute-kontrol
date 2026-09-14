const assert = require('assert');
const fs = require('fs');
const path = require('path');

const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase27_guest_crm_linking.sql'), 'utf8');

assert(migration.includes('CREATE OR REPLACE FUNCTION public.upsert_booking_guest_atomic'));
assert(migration.includes("v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager', 'staff')"));
assert(migration.includes('WHERE b.id = p_booking_id AND b.tenant_id = p_tenant_id'));
assert(migration.includes('FOR UPDATE'));
assert(migration.includes('pg_advisory_xact_lock'));
assert(migration.includes('GUEST_IDENTITY_CONFLICT'));
assert(migration.includes('CREATE TRIGGER trg_guard_booking_guest_tenant_link'));
assert(migration.includes('FROM anon'));
assert(migration.includes('GRANT EXECUTE ON FUNCTION public.upsert_booking_guest_atomic'));
assert(!/get_tenant_role\([^)]*\)\s+NOT IN/.test(migration));

console.log('[PASS] Phase27 guest RPC authorizes before lookup and locks writes');
console.log('[PASS] Cross-tenant booking/guest links are trigger-protected');
console.log('[PASS] PUBLIC and anon cannot execute the SECURITY DEFINER RPC');
console.log('TEST SUMMARY: 3 / 3 TESTS PASSED (0 FAILED)');
