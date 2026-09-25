'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const testEnv = require('../core/test_env.js');
const { assertSafeBootstrapTarget, executableSql } = require('./bootstrap_test_project.js');

const ROOT = path.join(__dirname, '..');
const PHASE11 = executableSql(fs.readFileSync(path.join(ROOT, 'supabase', 'migration_phase11_pricing.sql'), 'utf8'));
const TABLES = ['pricing_profiles', 'pricing_rules', 'pricing_events', 'pricing_overrides', 'daily_rates', 'rate_change_logs', 'booking_quotes'];

async function scalar(client, sql) { return (await client.query(sql)).rows[0]; }

async function main() {
  const env = { ...testEnv.readEnvFileUnguarded('.env.test'), ...process.env };
  const { databaseUrl, projectRef } = assertSafeBootstrapTarget(env);
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, application_name: 'lexbnb-phase11-late-apply-test' });
  await client.connect();
  console.log(`Phase11 geç uygulama hedefi: ${projectRef} (yalnız transaction, sonunda ROLLBACK)`);
  try {
    await client.query('BEGIN');
    await client.query('DROP FUNCTION IF EXISTS public.save_manual_pricing_override_atomic(UUID, UUID, DATE, DATE, NUMERIC, TEXT, BOOLEAN, INT) CASCADE');
    await client.query('DROP FUNCTION IF EXISTS public.accept_booking_quote_atomic(UUID, UUID) CASCADE');
    for (const table of [...TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table} CASCADE`);
    await client.query('ALTER TABLE public.bookings DROP COLUMN IF EXISTS quote_snapshot, DROP COLUMN IF EXISTS pricing_source');

    await client.query('SAVEPOINT before_failed_apply');
    try {
      await client.query(PHASE11);
      await client.query("DO $$ BEGIN RAISE EXCEPTION 'EXPECTED_PHASE11_TEST_FAILURE'; END $$");
    } catch (error) {
      if (!String(error.message).includes('EXPECTED_PHASE11_TEST_FAILURE')) throw error;
      await client.query('ROLLBACK TO SAVEPOINT before_failed_apply');
    }
    const afterFailure = await scalar(client, "SELECT to_regclass('public.pricing_profiles') IS NULL AS table_absent, NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='quote_snapshot') AS column_absent");
    if (!afterFailure.table_absent || !afterFailure.column_absent) throw new Error('PHASE11_PARTIAL_SCHEMA_AFTER_FAILURE');
    console.log('[PASS] hata durumunda phase11 yarım şema bırakmıyor');

    await client.query(PHASE11);
    console.log('[PASS] phase11 güncel şemaya geç uygulanabiliyor');
    await client.query(PHASE11);
    console.log('[PASS] phase11 ikinci kez güvenle çalışıyor');

    const tables = await scalar(client, `SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname = ANY(ARRAY[${TABLES.map(t => `'${t}'`).join(',')}]) AND c.relkind='r'`);
    const columns = await scalar(client, "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name IN ('quote_snapshot','pricing_source')");
    const functions = await scalar(client, "SELECT count(*)::int AS count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('save_manual_pricing_override_atomic','accept_booking_quote_atomic')");
    if (tables.count !== 7 || columns.count !== 2 || functions.count !== 2) throw new Error(`PHASE11_CONTRACT_INCOMPLETE tables=${tables.count} columns=${columns.count} functions=${functions.count}`);
    console.log('[PASS] 7 tablo, 2 booking sütunu ve 2 RPC eksiksiz');
  } finally {
    try { await client.query('ROLLBACK'); } finally { await client.end(); }
  }
}

main().catch(error => { console.error(`[FAIL] ${error.message}`); process.exit(1); });
