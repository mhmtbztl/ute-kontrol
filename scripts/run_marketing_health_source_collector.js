'use strict';
const { createClient } = require('@supabase/supabase-js');
const { createRepository } = require('../core/marketing_health_source_repository');
const { runCollector } = require('../core/marketing_health_source_collector');
function required(name) { const value = String(process.env[name] || '').trim(); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
async function main() {
  const client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const result = await runCollector(createRepository(client), { tenantId: process.env.MARKETING_TENANT_ID || null, limit: Number(process.env.MARKETING_SOURCE_LIMIT || 100), asOf: new Date().toISOString() });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!['COMPLETED', 'PARTIAL'].includes(result.status)) process.exitCode = 1;
}
main().catch(error => { process.stderr.write(`${JSON.stringify({ status: 'WORKER_CRASHED', errorCode: String(error.code || error.message || 'UNKNOWN').slice(0, 100) })}\n`); process.exitCode = 1; });
