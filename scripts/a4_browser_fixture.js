/**
 * A4 rol tabanli tarayici denetimi icin gecici test verisi.
 *
 * Yalniz core/test_env.js kapisindan gecen Supabase test projesinde calisir.
 * Kurulum kimliklerini sistemin gecici klasorundeki manifestte tutar; cleanup
 * yalnizca o manifestteki tenant ve kullanicilari siler.
 *
 *   node scripts/a4_browser_fixture.js setup
 *   node scripts/a4_browser_fixture.js cleanup
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { loadTestEnv } = require('../core/test_env.js');

const env = loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const anon = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
const manifestPath = path.join(os.tmpdir(), 'lexbnb-a4-browser-fixture.json');

function must(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function createUser(role, stamp, password) {
  const email = `a4_browser_${role}_${stamp}@lexbnb-e2e.test`;
  const created = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `${role} kullanicisi`);
  const client = anon();
  must(await client.auth.signInWithPassword({ email, password }), `${role} girisi`);
  return { id: created.user.id, email, role, client };
}

async function cleanupManifest(manifest, removeFile = true) {
  const errors = [];
  for (const tenantId of manifest.tenantIds || []) {
    const { error } = await admin.from('tenants').delete().eq('id', tenantId);
    if (error) errors.push(`tenant ${tenantId}: ${error.message}`);
  }
  for (const user of manifest.users || []) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error && !/not found/i.test(error.message || '')) errors.push(`user ${user.id}: ${error.message}`);
  }
  if (removeFile && fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
  if (errors.length) throw new Error(`Fixture temizligi tamamlanamadi:\n${errors.join('\n')}`);
}

async function setup() {
  if (fs.existsSync(manifestPath)) {
    const stale = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    await cleanupManifest(stale);
  }

  const stamp = Date.now();
  const password = `A4!Browser${stamp}`;
  const roles = ['owner', 'sales', 'staff', 'viewer', 'outsider'];
  const users = [];
  const tenantIds = [];

  try {
    for (const role of roles) users.push(await createUser(role, stamp, password));
    const byRole = Object.fromEntries(users.map(user => [user.role, user]));

    const tenantA = must(await byRole.owner.client.rpc('create_tenant_and_owner', {
      p_company_name: `A4 Tarayici ${stamp}`,
      p_full_name: 'A4 Sahip'
    }), 'A4 isletmesi').tenant_id;
    tenantIds.push(tenantA);
    const tenantB = must(await byRole.outsider.client.rpc('create_tenant_and_owner', {
      p_company_name: `A4 Yabanci ${stamp}`,
      p_full_name: 'A4 Yabanci'
    }), 'yabanci isletme').tenant_id;
    tenantIds.push(tenantB);

    must(await admin.from('tenant_members').insert([
      { tenant_id: tenantA, user_id: byRole.sales.id, role: 'sales' },
      { tenant_id: tenantA, user_id: byRole.staff.id, role: 'staff' },
      { tenant_id: tenantA, user_id: byRole.viewer.id, role: 'viewer' }
    ]), 'rol uyelikleri');

    const property = must(await admin.from('properties').insert({
      tenant_id: tenantA,
      name: 'A4 Test Villasi',
      slug: `a4-browser-${stamp}`,
      base_price: 12500,
      clean_cost: 1750
    }).select().single(), 'mulk');
    must(await byRole.owner.client.rpc('save_property_location', {
      p_tenant_id: tenantA,
      p_property_id: property.id,
      p_locality: 'Kayakoy',
      p_latitude: 36.575,
      p_longitude: 29.087,
      p_research_radius_km: 8
    }), 'mulk analiz baglami');

    const guest = must(await admin.from('guests').insert({
      tenant_id: tenantA,
      first_name: 'Denetim',
      last_name: 'Misafiri',
      phone: '+905551112233',
      email: `a4_guest_${stamp}@lexbnb-e2e.test`,
      birth_date: '1990-04-15'
    }).select().single(), 'misafir');
    must(await admin.from('guest_private_classifications').insert({
      tenant_id: tenantA,
      guest_id: guest.id,
      list_type: 'BLACK',
      reason: 'Tarayici denetimi icin gecici olgusal kayit',
      incident_on: '2026-09-30'
    }), 'kara liste');
    must(await admin.from('leads').insert({
      tenant_id: tenantA,
      property_id: property.id,
      guest_name: 'Denetim Misafiri',
      guest_phone: '+905551112233',
      channel: 'WhatsApp',
      status: 'NEW'
    }), 'talep');

    const manifest = {
      createdAt: new Date().toISOString(),
      projectUrl: env.SUPABASE_URL,
      password,
      tenantIds,
      users: users.map(({ id, email, role }) => ({ id, email, role }))
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { encoding: 'utf8', mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ manifestPath, password, users: manifest.users.map(({ email, role }) => ({ email, role })) })}\n`);
  } catch (error) {
    await cleanupManifest({ tenantIds, users: users.map(({ id }) => ({ id })) }, false).catch(() => {});
    throw error;
  } finally {
    for (const user of users) await user.client.auth.signOut().catch(() => {});
  }
}

async function cleanup() {
  if (!fs.existsSync(manifestPath)) {
    console.log('A4 browser fixture manifesti yok; temizlenecek veri bulunmadi.');
    return;
  }
  await cleanupManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
  console.log('A4 browser fixture verileri temizlendi.');
}

async function setActiveRole(role) {
  if (!['sales', 'staff', 'viewer'].includes(role)) throw new Error('Rol sales, staff veya viewer olmali.');
  if (!fs.existsSync(manifestPath)) throw new Error('A4 browser fixture manifesti yok. Once setup calistirin.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const salesUser = (manifest.users || []).find(user => user.role === 'sales');
  const tenantId = (manifest.tenantIds || [])[0];
  if (!salesUser || !tenantId) throw new Error('Fixture icinde aktif uye veya tenant bulunamadi.');
  must(await admin.from('tenant_members').update({ role }).eq('tenant_id', tenantId).eq('user_id', salesUser.id).select('user_id').single(), 'aktif rol');
  console.log(`A4 browser aktif test uyesi rolu: ${role}`);
}

const command = process.argv[2];
if (!['setup', 'cleanup', 'set-role'].includes(command)) {
  console.error('Kullanim: node scripts/a4_browser_fixture.js <setup|cleanup|set-role ROLE>');
  process.exit(2);
}

(command === 'setup' ? setup() : command === 'cleanup' ? cleanup() : setActiveRole(process.argv[3])).catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
