const assert = require('assert');
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'supabase', 'migration_phase86_expense_template_authz.sql');
assert.ok(fs.existsSync(file), 'phase86 güvenlik düzeltmesi bulunmalı');
const sql = fs.readFileSync(file, 'utf8');

assert.match(sql, /PHASE86_REQUIRES_PHASE84/);
assert.match(sql, /generate_expense_from_template\(\s*p_tenant_id UUID,/);
assert.match(sql, /can_manage_tenant\(p_tenant_id\)[\s\S]*?SELECT \* INTO v_template[\s\S]*?FOR UPDATE/);
assert.match(sql, /tenant_id = p_tenant_id/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.generate_expense_from_template\(UUID, DATE\) FROM authenticated/);
assert.match(sql, /VALUES \(86, 'phase86_expense_template_authz'\)/);

console.log('[PASS] Phase86 gider şablonu varlık oracle kapısını tenant yetkisiyle kapatır');
