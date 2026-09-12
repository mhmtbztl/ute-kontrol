'use strict';

const { createClient } = require('@supabase/supabase-js');
const { createRepository } = require('../core/seasonal_marketing_worker_repository');
const { runSeasonalReview } = require('../core/seasonal_marketing_worker_service');

function requiredEnvironment(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function main() {
  const client = createClient(requiredEnvironment('SUPABASE_URL'), requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const result = await runSeasonalReview(createRepository(client), {
    tenantId: process.env.MARKETING_TENANT_ID || null,
    asOfDate: new Date().toISOString().slice(0, 10),
    limit: Number(process.env.SEASONAL_REVIEW_LIMIT || 100)
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!['COMPLETED', 'PARTIAL'].includes(result.status)) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ status: 'WORKER_CRASHED', errorCode: String(error.code || error.message || 'UNKNOWN').slice(0, 100) })}\n`);
  process.exitCode = 1;
});
