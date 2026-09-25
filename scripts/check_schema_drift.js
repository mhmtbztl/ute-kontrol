'use strict';

const testEnv = require('../core/test_env.js');
const { fetchOpenApi, assertProductionTarget } = require('./check_production_readiness.js');
const { inspectOpenApi, compareContract, compareSchemas } = require('./schema_contract.js');

const TEST_REF = 'pdeiorpgxetksyogrmbi';

function assertTestTarget(rawUrl, confirmation) {
  const host = new URL(rawUrl).hostname.toLowerCase();
  if (testEnv.isProductionTarget(rawUrl)) throw new Error(`SCHEMA_DRIFT_TEST_TARGET_IS_PRODUCTION: ${host}`);
  if (!host.includes(TEST_REF)) throw new Error(`SCHEMA_DRIFT_UNKNOWN_TEST_TARGET: ${host}`);
  const accepted = new Set([TEST_REF, `${TEST_REF}.supabase.co`, host]);
  if (!accepted.has(String(confirmation || '').trim().toLowerCase())) {
    throw new Error(`SCHEMA_DRIFT_TEST_CONFIRMATION_REQUIRED: LEXBNB_CONFIRM_REMOTE_TEST_PROJECT=${host}`);
  }
  return host;
}

async function main() {
  const productionFile = testEnv.readEnvFileUnguarded('.env');
  const testFile = testEnv.readEnvFileUnguarded('.env.test');
  const productionUrl = process.env.PRODUCTION_SUPABASE_URL || productionFile.SUPABASE_URL;
  const productionKey = process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY || productionFile.SUPABASE_SERVICE_ROLE_KEY;
  const testUrl = process.env.TEST_SUPABASE_URL || testFile.TEST_SUPABASE_URL || testFile.SUPABASE_URL;
  const testKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || testFile.SUPABASE_SERVICE_ROLE_KEY;
  if (!productionUrl || !productionKey || !testUrl || !testKey) {
    throw new Error('SCHEMA_DRIFT_CREDENTIALS_REQUIRED: üretim ve test salt-okunur OpenAPI kimlikleri eksiksiz olmalı; kontrol atlanmış sayılmaz');
  }
  const productionHost = assertProductionTarget(productionUrl, process.env.LEXBNB_CONFIRM_PRODUCTION_PROJECT);
  const testHost = assertTestTarget(testUrl, process.env.LEXBNB_CONFIRM_REMOTE_TEST_PROJECT);
  console.log(`Şema drift hedefleri: test=${testHost} production=${productionHost}`);

  const [testSpec, productionSpec] = await Promise.all([
    fetchOpenApi(testUrl, testKey), fetchOpenApi(productionUrl, productionKey)
  ]);
  const testSchema = inspectOpenApi(testSpec);
  const productionSchema = inspectOpenApi(productionSpec);
  const errors = [
    ...compareContract(testSchema).errors.map(x => `test sözleşmesi: ${x}`),
    ...compareContract(productionSchema).errors.map(x => `production sözleşmesi: ${x}`),
    ...compareSchemas(testSchema, productionSchema).map(x => `test↔production: ${x}`)
  ];
  if (errors.length) {
    for (const error of errors) console.error(`[FAIL] ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('Şema drift kapısı: BAŞARILI');
}

if (require.main === module) main().catch(error => { console.error(`[FAIL] ${error.message}`); process.exit(1); });
module.exports = { assertTestTarget, main };
