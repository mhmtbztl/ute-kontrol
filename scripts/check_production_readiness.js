'use strict';

const fs = require('fs');
const path = require('path');
const { inspectOpenApi, compareContract } = require('./schema_contract.js');

const PRODUCTION_REF = 'kirpcqklyjlrhvdbgdrq';
const TEST_REF = 'pdeiorpgxetksyogrmbi';
const PROTECTED_TABLES = [
  'pricing_profiles', 'pricing_rules', 'pricing_events', 'pricing_overrides',
  'daily_rates', 'rate_change_logs', 'booking_quotes'
];
const PROTECTED_RPCS = ['save_manual_pricing_override_atomic', 'accept_booking_quote_atomic'];

function readEnvironment() {
  const values = {};
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return { ...values, ...process.env };
}

function assertProductionTarget(rawUrl, confirmation) {
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();
  if (host.includes(TEST_REF)) throw new Error(`READINESS_TARGET_IS_TEST: ${host}`);
  if (!host.includes(PRODUCTION_REF)) throw new Error(`READINESS_UNKNOWN_PRODUCTION_TARGET: ${host}`);
  const accepted = new Set([PRODUCTION_REF, `${PRODUCTION_REF}.supabase.co`, host]);
  if (!accepted.has(String(confirmation || '').trim().toLowerCase())) {
    throw new Error(`READINESS_CONFIRMATION_REQUIRED: LEXBNB_CONFIRM_PRODUCTION_PROJECT=${host}`);
  }
  return host;
}

async function fetchOpenApi(url, key) {
  const headers = { apikey: key, Accept: 'application/openapi+json' };
  if (String(key).startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
    headers
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/[\r\n]+/g, ' ').slice(0, 240);
    throw new Error(`OPENAPI_READ_FAILED: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`);
  }
  return response.json();
}

function anonExposureErrors(inspection) {
  const errors = [];
  for (const table of PROTECTED_TABLES) if (inspection.tables[table]) errors.push(`anon tablo yetkisi açık: ${table}`);
  for (const rpc of PROTECTED_RPCS) if (inspection.rpcs[rpc]) errors.push(`anon RPC yetkisi açık: ${rpc}`);
  return errors;
}

async function probeAnonPrivileges(url, key) {
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (String(key).startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const probes = [];
  for (const table of PROTECTED_TABLES) {
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?select=id&limit=0`, { headers });
    const body = await response.text();
    probes.push({ object: `table:${table}`, denied: [401, 403].includes(response.status) && /42501|permission denied/i.test(body), status: response.status });
  }
  for (const rpc of PROTECTED_RPCS) {
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${rpc}`, { method: 'POST', headers, body: '{}' });
    const body = await response.text();
    probes.push({ object: `rpc:${rpc}`, denied: [401, 403].includes(response.status) && /42501|permission denied/i.test(body), status: response.status });
  }
  return probes;
}

async function fetchMigrationLedger(url, key) {
  const headers = { apikey: key, Accept: 'application/json' };
  if (String(key).startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/schema_migrations?select=version,name&order=version.asc`, { headers });
  if (!response.ok) throw new Error(`MIGRATION_LEDGER_READ_FAILED: HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const env = readEnvironment();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_READ_CREDENTIALS_REQUIRED: URL, service_role ve anon anahtarı gerekli');
  }
  const host = assertProductionTarget(env.SUPABASE_URL, env.LEXBNB_CONFIRM_PRODUCTION_PROJECT);
  process.stdout.write(`Production readiness hedefi: ${host}\n`);

  const [serviceSpec, anonProbes, ledger] = await Promise.all([
    fetchOpenApi(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    probeAnonPrivileges(env.SUPABASE_URL, env.SUPABASE_ANON_KEY),
    fetchMigrationLedger(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  ]);
  const ledgerVersions = ledger.map(row => Number(row.version)).filter(Number.isFinite);
  process.stdout.write(`schema_migrations (yardımcı kanıt): ${ledgerVersions.join(', ') || 'boş'}\n`);
  const serviceInspection = inspectOpenApi(serviceSpec);
  const contract = compareContract(serviceInspection);
  const objectExists = object => {
    const [kind, name] = object.split(':');
    return kind === 'table' ? Boolean(serviceInspection.tables[name]) : Boolean(serviceInspection.rpcs[name]);
  };
  const errors = [
    ...contract.errors,
    ...anonProbes.filter(probe => objectExists(probe.object) && !probe.denied)
      .map(probe => `anon yetki kapısı doğrulanamadı: ${probe.object} HTTP ${probe.status}`)
  ];
  if (errors.length) {
    for (const error of errors) process.stderr.write(`[FAIL] ${error}\n`);
    process.stderr.write(`Production readiness: BAŞARISIZ (${errors.length} sözleşme farkı)\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Production readiness: BAŞARILI — kanonik tablo/sütun/nullability/RPC ve anon kapıları uyumlu.\n');
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`${JSON.stringify({ error: String(error.message || error), code: error.code || null })}\n`);
  process.exitCode = 1;
});

module.exports = { assertProductionTarget, fetchOpenApi, anonExposureErrors, probeAnonPrivileges, fetchMigrationLedger, main };
