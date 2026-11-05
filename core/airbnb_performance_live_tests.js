'use strict';
const assert = require('assert');
const { randomUUID } = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const env = require('./test_env.js').loadTestEnv();
const S = require('./airbnb_performance_service');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
const fresh = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, options);
const users = [], tenants = [];
function checked(result) { if (result.error) throw new Error(result.error.message); return result.data; }
async function owner(label) {
  const email = `airbnb-${label}-${randomUUID()}@lexbnb-e2e.test`, password = randomUUID() + 'Aa!';
  const u = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user;
  users.push(u.id);
  const client = fresh(); checked(await client.auth.signInWithPassword({ email, password }));
  const t = checked(await client.rpc('create_tenant_and_owner', { p_company_name: 'Airbnb test ' + label, p_full_name: 'Test' }));
  tenants.push(t.tenant_id);
  const p = checked(await client.from('properties').insert({ tenant_id: t.tenant_id, name: 'Test villa', slug: randomUUID(), base_price: 1000 }).select().single());
  const l = checked(await client.rpc('save_property_channel_listing', { p_tenant_id: t.tenant_id, p_property_id: p.id, p_channel_code: 'AIRBNB', p_external_listing_id: randomUUID(), p_display_name: 'Test Airbnb', p_payout_currency: 'TRY' }));
  return { client, tenant: t.tenant_id, listing: l.listingId, user: u.id };
}
(async () => {
  try {
    const a = await owner('a'), b = await owner('b');
    console.log('[PASS] Isolated tenant fixtures created');
    const input = { listingId: a.listing, start: '2026-10-04', end: '2026-11-03', metrics: { views: 436, bookingConversion: '0,16' } };
    const first = await S.save(a.client, a.tenant, input);
    assert.equal(first.metrics.bookingConversion, 0.16);
    assert.equal((await S.save(a.client, a.tenant, input)).id, first.id);
    console.log('[PASS] Save and idempotent replay');
    await assert.rejects(S.save(a.client, a.tenant, { ...input, metrics: { views: 440 } }), e => { assert.match(String(e.message), /AIRBNB_RECORD_CHANGED/); return true; });
    const revised = await S.save(a.client, a.tenant, { ...input, metrics: { views: 440 } }, first.id);
    assert.equal(revised.supersedes_id, first.id);
    const data = await S.load(a.client, a.tenant);
    assert.equal(data.records.length, 2);
    assert.equal(data.records.filter(r => r.is_current).length, 1);
    assert.equal(S.compare(data.records, a.listing, {}).current.metrics.views, 440);
    await assert.rejects(S.save(b.client, a.tenant, input), e => { assert.match(String(e.message), /AIRBNB_ACCESS_DENIED/); return true; });
    await assert.rejects(S.save(a.client, a.tenant, { ...input, listingId: b.listing }), e => { assert.match(String(e.message), /AIRBNB_LISTING_REQUIRED/); return true; });
    assert.equal((await S.load(b.client, a.tenant)).records.length, 0);
    assert((await a.client.from('airbnb_performance_records').update({ notes: 'bypass' }).eq('id', first.id)).error);
    assert((await fresh().from('airbnb_performance_records').select('*')).error);
    const invalid = await a.client.rpc('record_airbnb_performance', { p_tenant_id: a.tenant, p_listing_id: a.listing, p_start: input.start, p_end: input.end, p_metrics: { bookingConversion: 101 } });
    assert(invalid.error);
    const change = { listingId: a.listing, date: '2026-11-05', kind: 'TITLE', notes: 'Test title', requestId: randomUUID() };
    const savedChange = await S.saveChange(a.client, a.tenant, change);
    assert.equal((await S.saveChange(a.client, a.tenant, change)).id, savedChange.id);
    await assert.rejects(S.saveChange(b.client, a.tenant, change), e => { assert.match(String(e.message), /AIRBNB_ACCESS_DENIED/); return true; });
    // Concurrent correction: only one writer may replace the expected revision.
    const concurrent = await Promise.allSettled([441,442].map(views => S.save(a.client,a.tenant,{ ...input, metrics:{ views } },revised.id)));
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length,1);
    checked(await admin.from('tenant_members').insert({ tenant_id:a.tenant,user_id:b.user,role:'viewer' }));
    assert((await S.load(b.client,a.tenant)).records.length > 0);
    await assert.rejects(S.save(b.client,a.tenant,input), e => { assert.match(e.message,/AIRBNB_ACCESS_DENIED/); return true; });
    checked(await admin.from('tenant_members').update({role:'staff'}).eq('tenant_id',a.tenant).eq('user_id',b.user));
    assert.equal((await S.load(b.client,a.tenant)).records.length,0);
    const immutable = await admin.from('airbnb_performance_records').update({tenant_id:b.tenant}).eq('id',first.id);
    assert(immutable.error, 'tenant_id must remain immutable');
    console.log('PASS: Airbnb persistence, history, duplicate replay, concurrency, cross-tenant and anonymous access, server validation, change tracking.');
    console.log('TEST SUMMARY: 1 / 1 TESTS PASSED');
  } finally {
    for (const id of tenants) checked(await admin.from('tenants').delete().eq('id', id));
    for (const id of users) checked(await admin.auth.admin.deleteUser(id));
  }
})().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
