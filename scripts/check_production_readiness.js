'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function readEnvironment() {
  const values = {};
  const envPath = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return { ...values, ...process.env };
}

async function main() {
  const env = readEnvironment();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_READ_CREDENTIALS_REQUIRED');
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const tables = {
    ledger: 'financial_transactions',
    invitationOutbox: 'invitation_delivery_outbox'
  };
  const checks = {};
  const migrationResult = await client.from('schema_migrations').select('version,name,applied_at').order('version', { ascending: true });
  checks.migrations = {
    ok: !migrationResult.error,
    code: migrationResult.error ? migrationResult.error.code : null,
    versions: (migrationResult.data || []).map(row => row.version)
  };
  for (const [name, table] of Object.entries(tables)) {
    const result = await client.from(table).select('*', { head: true, count: 'exact' });
    checks[name] = { ok: !result.error, code: result.error ? result.error.code : null, count: result.count };
  }
  for (const [name, table, columns] of [
    ['propertyLifecycle', 'properties', 'is_active,activated_on,deactivated_on,archived_at'],
    ['maintenanceDowntime', 'maintenance_tickets', 'blocks_availability,downtime_start,downtime_end'],
    ['canonicalBookingMoney', 'bookings', 'gross_amount,cleaning_fee,discount,ota_commission,net_room_revenue']
  ]) {
    const result = await client.from(table).select(columns).limit(1);
    checks[name] = { ok: !result.error, code: result.error ? result.error.code : null };
  }
  process.stdout.write(`${JSON.stringify(checks)}\n`);
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ error: String(error.message || error), code: error.code || null })}\n`);
  process.exitCode = 1;
});
