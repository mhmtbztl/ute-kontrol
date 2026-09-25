'use strict';

const { Client } = require('pg');
const testEnv = require('../core/test_env.js');
const { assertSafeBootstrapTarget } = require('./bootstrap_test_project.js');

async function main() {
  const env = { ...testEnv.readEnvFileUnguarded('.env.test'), ...process.env };
  const { databaseUrl, projectRef } = assertSafeBootstrapTarget(env);
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, application_name: 'lexbnb-phase42-lead-test' });
  await client.connect();
  console.log(`Phase42 davranış hedefi: ${projectRef} (sonunda ROLLBACK)`);
  try {
    await client.query('BEGIN');
    const tenant = (await client.query("INSERT INTO public.tenants(name, slug) VALUES ('Phase42 test', 'phase42-' || substr(md5(random()::text),1,12)) RETURNING id")).rows[0];
    await client.query("INSERT INTO public.leads(tenant_id, guest_name, guest_phone) VALUES ($1, NULL, '+905551112233')", [tenant.id]);
    console.log('[PASS] boş ad + geçerli telefon kabul edildi');
    let rejected = false;
    try {
      await client.query('SAVEPOINT empty_identity');
      await client.query('INSERT INTO public.leads(tenant_id, guest_name, guest_phone) VALUES ($1, NULL, NULL)', [tenant.id]);
    } catch (error) {
      rejected = error.code === '23514';
      await client.query('ROLLBACK TO SAVEPOINT empty_identity');
    }
    if (!rejected) throw new Error('PHASE42_EMPTY_IDENTITY_WAS_ACCEPTED');
    console.log('[PASS] ad ve telefon birlikte boşken kayıt reddedildi');
  } finally {
    try { await client.query('ROLLBACK'); } finally { await client.end(); }
  }
}

main().catch(error => { console.error(`[FAIL] ${error.message}`); process.exit(1); });
