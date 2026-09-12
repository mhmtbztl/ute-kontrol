'use strict';

const { createClient } = require('@supabase/supabase-js');
const { createRepository } = require('../core/photo_analysis_supabase_repository');
const { createGeminiProvider } = require('../core/gemini_photo_analysis_provider');
const { runNextAnalysis } = require('../core/photo_analysis_worker_service');

function requiredEnvironment(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function main() {
  const supabaseUrl = requiredEnvironment('SUPABASE_URL');
  const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const geminiApiKey = requiredEnvironment('GEMINI_API_KEY');
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const repository = createRepository(client, { cacheTtlDays: 30 });
  const provider = createGeminiProvider({
    apiKey: geminiApiKey,
    model: process.env.GEMINI_PHOTO_MODEL || undefined
  });
  const result = await runNextAnalysis(repository, provider, {
    runId: process.env.PHOTO_ANALYSIS_RUN_ID || null,
    now: new Date().toISOString()
  });
  const summary = {
    status: result.status,
    runId: result.runId,
    aggregateCacheHit: result.aggregateCacheHit || false,
    freshCount: result.plan ? result.plan.freshCount : 0,
    cachedCount: result.plan ? result.plan.cachedCount : 0,
    findingCount: result.findings ? result.findings.persisted.length : 0,
    findingErrorCount: result.findings ? result.findings.errors.length : 0,
    errorCode: result.errorCode || null
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (!['IDLE', 'SUCCEEDED'].includes(result.status)) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ status: 'WORKER_CRASHED', errorCode: String(error.code || error.message || 'UNKNOWN').slice(0, 100) })}\n`);
  process.exitCode = 1;
});
