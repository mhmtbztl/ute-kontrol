/**
 * LEXBNB TEAM INVITATION & ROLE MANAGEMENT TEST SUITE (PHASE 16)
 *
 * Ekip daveti ve rol yonetimini, tarayicinin gordugu dunyadan (anon key) test eder.
 * service_role yalnizca temizlik ve e-posta onayi simulasyonu icin kullanilir.
 *
 * Bu suit ozellikle YETKI YUKSELTME yollarini kovalar: bir admin kendini ya da
 * kontrol ettigi bir hesabi owner yapabiliyorsa, coklu kiracili bir SaaS'ta
 * bu isletmenin devralinmasi demektir.
 *
 * Kapsam:
 *  1. Owner davet olusturabilir
 *  2. Davet edilen kullanici giris yapinca uyelige donusur
 *  3. Kabul edilen davet PENDING listesinden dusen
 *  4. Ekip listesi yeni uyeyi dogru rolle gosterir
 *  5. Uye, isletme verisini gorebilir (RLS okuma)
 *  6. Viewer rolu veri YAZAMAZ
 *  7. Owner uye rolunu degistirebilir
 *  8. Rol degisikligi aninda yetkiye yansir
 *  9. Uye olmayan ekip listesini goremez
 * 10. Uye olmayan davet olusturamaz
 * 11. Admin 'owner' rolunde davet gonderemez (yetki yukseltme)
 * 12. Admin 'admin' rolunde davet gonderemez (yetki yukseltme)
 * 13. Admin dogrudan tenant_members'a owner satiri EKLEYEMEZ (RLS sertlestirmesi)
 * 14. Viewer davet olusturamaz
 * 15. Zaten uye olan e-posta tekrar davet edilemez
 * 16. Owner daveti iptal edebilir
 * 17. Iptal edilen davet giriste uyelige donusmez
 * 18. Son owner'in rolu dusurulemez
 * 19. Owner uyeyi cikarabilir
 * 20. Cikarilan uye artik veriyi goremez
 * 21. Test verileri eksiksiz temizlenir
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const env = {};
fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function newClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

let testsPassed = 0;
let testsFailed = 0;
const createdUserIds = [];
let tenantId = null;

function recordPass(name) { testsPassed++; console.log(`[PASS] ${name}`); }
function recordFail(name, detail) { testsFailed++; console.error(`[FAIL] ${name}\n       ${detail}`); }
function check(cond, name, detail) { if (cond) recordPass(name); else recordFail(name, detail || 'beklenen kosul saglanmadi'); }

// Dogrulanmis bir kullanici olustur ve oturum acmis bir istemci dondur.
async function makeUser(label, stamp) {
  const email = `team_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'Team!' + stamp;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: 'Team ' + label }
  });
  if (error) throw new Error(`${label} kullanicisi olusturulamadi: ${error.message}`);
  createdUserIds.push(data.user.id);

  const client = newClient();
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`${label} giris yapamadi: ${signInErr.message}`);
  return { email, password, client, id: data.user.id };
}

async function runTeamManagementTests() {
  console.log('=============================================================================');
  console.log('LEXBNB TEAM INVITATION & ROLE MANAGEMENT TESTS');
  console.log('=============================================================================\n');

  const stamp = Date.now();
  let owner, invitee, adminUser, outsider;

  try {
    // -------------------------------------------------------------------
    console.log('--- KURULUM ---');
    owner = await makeUser('owner', stamp);
    const { data: rpcRes, error: rpcErr } = await owner.client.rpc('create_tenant_and_owner', {
      p_company_name: 'Ekip Testi Isletmesi', p_full_name: 'Ekip Sahibi'
    });
    if (rpcErr) throw new Error('tenant kurulamadi: ' + rpcErr.message);
    tenantId = rpcRes.tenant_id;
    console.log('    tenant:', tenantId);

    invitee  = await makeUser('invitee', stamp);
    outsider = await makeUser('outsider', stamp);

    // -------------------------------------------------------------------
    console.log('\n--- 1. DAVET OLUŞTURMA ---');
    const { data: inv, error: invErr } = await owner.client.rpc('create_tenant_invitation', {
      p_tenant_id: tenantId, p_email: invitee.email, p_role: 'manager'
    });
    check(!invErr && inv && inv.invitation_id, '1. Owner davet oluşturabilir', invErr && invErr.message);

    const { data: pending } = await owner.client.rpc('get_tenant_invitations', { p_tenant_id: tenantId });
    check(
      (pending || []).some(p => p.email === invitee.email && p.role === 'manager'),
      '1b. Davet bekleyenler listesinde görünür',
      JSON.stringify(pending)
    );

    // -------------------------------------------------------------------
    console.log('\n--- 2. DAVETİ KABUL ETME ---');
    const { data: acc, error: accErr } = await invitee.client.rpc('accept_pending_invitations');
    check(!accErr && acc && acc.joined === 1, '2. Davet edilen kullanıcı üyeliğe dönüşür',
      accErr ? accErr.message : `joined=${acc && acc.joined}`);

    const { data: pending2, error: pending2Err } = await owner.client.rpc('get_tenant_invitations', { p_tenant_id: tenantId });
    check(
      !pending2Err && Array.isArray(pending2) && !pending2.some(p => p.email === invitee.email),
      '3. Kabul edilen davet PENDING listesinden düşer',
      pending2Err ? pending2Err.message : JSON.stringify(pending2)
    );

    const { data: members } = await owner.client.rpc('get_tenant_members', { p_tenant_id: tenantId });
    const inviteeRow = (members || []).find(m => m.email === invitee.email);
    check(inviteeRow && inviteeRow.role === 'manager',
      '4. Ekip listesi yeni üyeyi doğru rolle gösterir',
      JSON.stringify(members));

    // -------------------------------------------------------------------
    console.log('\n--- 3. ROLE GÖRE ERİŞİM ---');
    const { data: prop } = await owner.client.from('properties')
      .insert({ tenant_id: tenantId, name: 'Ekip Villa', slug: 'EKIP_VILLA', base_price: 3000 })
      .select().single();

    const { data: seen } = await invitee.client.from('properties').select('id').eq('tenant_id', tenantId);
    check((seen || []).length === 1, '5. Üye işletme verisini görebilir', `${(seen || []).length} kayit gorundu`);

    // manager -> viewer'a dusur, yazma yetkisi kalkmali
    const { error: roleErr } = await owner.client.from('tenant_members')
      .update({ role: 'viewer' }).eq('tenant_id', tenantId).eq('user_id', invitee.id);
    check(!roleErr, '7. Owner üye rolünü değiştirebilir', roleErr && roleErr.message);

    const { error: viewerWriteErr } = await invitee.client.from('properties')
      .insert({ tenant_id: tenantId, name: 'Viewer Villa', slug: 'VIEWER_VILLA', base_price: 100 });
    check(!!viewerWriteErr, '6. Viewer rolü veri YAZAMAZ', 'viewer yazma yapabildi!');
    check(!!viewerWriteErr, '8. Rol değişikliği anında yetkiye yansır', 'eski yetki devam ediyor');

    // -------------------------------------------------------------------
    console.log('\n--- 4. YETKİSİZ ERİŞİM ---');
    const { error: outsiderListErr } = await outsider.client.rpc('get_tenant_members', { p_tenant_id: tenantId });
    check(!!outsiderListErr, '9. Üye olmayan ekip listesini göremez', 'yabanci ekip listesini gordu!');

    const { error: outsiderInvErr } = await outsider.client.rpc('create_tenant_invitation', {
      p_tenant_id: tenantId, p_email: 'sizinti@lexbnb-e2e.test', p_role: 'viewer'
    });
    check(!!outsiderInvErr, '10. Üye olmayan davet oluşturamaz', 'yabanci davet olusturabildi!');

    // -------------------------------------------------------------------
    console.log('\n--- 5. YETKİ YÜKSELTME SAVUNMASI ---');
    adminUser = await makeUser('admin', stamp);
    await owner.client.rpc('create_tenant_invitation', {
      p_tenant_id: tenantId, p_email: adminUser.email, p_role: 'admin'
    });
    await adminUser.client.rpc('accept_pending_invitations');

    const { error: escalate1 } = await adminUser.client.rpc('create_tenant_invitation', {
      p_tenant_id: tenantId, p_email: 'ele_gecir@lexbnb-e2e.test', p_role: 'owner'
    });
    check(!!escalate1, "11. Admin 'owner' rolünde davet gönderemez", 'admin owner daveti gonderebildi!');

    const { error: escalate2 } = await adminUser.client.rpc('create_tenant_invitation', {
      p_tenant_id: tenantId, p_email: 'ele_gecir2@lexbnb-e2e.test', p_role: 'admin'
    });
    check(!!escalate2, "12. Admin 'admin' rolünde davet gönderemez", 'admin admin daveti gonderebildi!');

    // Dogrudan tablo yazmasi: RLS sertlestirmesi
    const { error: escalate3 } = await adminUser.client.from('tenant_members')
      .insert({ tenant_id: tenantId, user_id: outsider.id, role: 'owner' });
    check(!!escalate3, '13. Admin doğrudan owner satırı EKLEYEMEZ', 'admin owner satiri ekleyebildi!');

    // Viewer (artik invitee) davet olusturamaz
    const { error: viewerInvErr } = await invitee.client.rpc('create_tenant_invitation', {
      p_tenant_id: tenantId, p_email: 'viewer_davet@lexbnb-e2e.test', p_role: 'staff'
    });
    check(!!viewerInvErr, '14. Viewer davet oluşturamaz', 'viewer davet olusturabildi!');

    // -------------------------------------------------------------------
    console.log('\n--- 6. DAVET YAŞAM DÖNGÜSÜ ---');
    const { error: dupInvErr } = await owner.client.rpc('create_tenant_invitation', {
      p_tenant_id: tenantId, p_email: invitee.email, p_role: 'staff'
    });
    check(!!dupInvErr, '15. Zaten üye olan e-posta tekrar davet edilemez', 'mevcut uye tekrar davet edilebildi');

    const revokeTarget = `team_revoked_${stamp}@lexbnb-e2e.test`;
    const { data: revInv } = await owner.client.rpc('create_tenant_invitation', {
      p_tenant_id: tenantId, p_email: revokeTarget, p_role: 'staff'
    });
    const { error: revErr } = await owner.client.rpc('revoke_tenant_invitation', {
      p_invitation_id: revInv.invitation_id
    });
    check(!revErr, '16. Owner daveti iptal edebilir', revErr && revErr.message);

    // Iptal edilen davetin sahibi giris yapinca uye OLMAMALI.
    // makeUser kendi adresini uretir; burada tam olarak davet edilen adresle
    // bir kullanici acmamiz gerekiyor.
    const { data: ru } = await admin.auth.admin.createUser({
      email: revokeTarget, password: 'Rev!' + stamp, email_confirm: true
    });
    if (ru && ru.user) createdUserIds.push(ru.user.id);
    const revokedClient = newClient();
    await revokedClient.auth.signInWithPassword({ email: revokeTarget, password: 'Rev!' + stamp });
    const { data: revAcc } = await revokedClient.rpc('accept_pending_invitations');
    check(revAcc && revAcc.joined === 0, '17. İptal edilen davet üyeliğe dönüşmez',
      `joined=${revAcc && revAcc.joined}`);
    await revokedClient.auth.signOut();

    // -------------------------------------------------------------------
    console.log('\n--- 7. SON OWNER KORUMASI ---');
    const { error: demoteErr } = await owner.client.from('tenant_members')
      .update({ role: 'viewer' }).eq('tenant_id', tenantId).eq('user_id', owner.id);
    check(!!demoteErr, '18. Son owner rolü düşürülemez', 'son owner viewer yapilabildi!');

    // -------------------------------------------------------------------
    console.log('\n--- 8. ÜYE ÇIKARMA ---');
    const { error: removeErr } = await owner.client.from('tenant_members')
      .delete().eq('tenant_id', tenantId).eq('user_id', invitee.id);
    check(!removeErr, '19. Owner üyeyi çıkarabilir', removeErr && removeErr.message);

    const { data: afterRemoval } = await invitee.client.from('properties').select('id').eq('tenant_id', tenantId);
    check((afterRemoval || []).length === 0, '20. Çıkarılan üye artık veriyi göremez',
      `${(afterRemoval || []).length} kayit hala gorunuyor!`);

    if (prop) { /* prop tenant ile birlikte cascade silinecek */ }

  } catch (err) {
    recordFail('Suit beklenmedik hata ile durdu', err && err.message ? err.message : String(err));
  } finally {
    // -------------------------------------------------------------------
    console.log('\n--- TEMİZLİK ---');
    let cleanupFailed = false;

    for (const c of [owner, invitee, adminUser, outsider]) {
      if (c && c.client) { try { await c.client.auth.signOut(); } catch (e) {} }
    }

    if (tenantId) {
      const { error } = await admin.from('tenants').delete().eq('id', tenantId);
      if (error) { cleanupFailed = true; console.error(`[FAIL] Tenant silinemedi: ${error.message}`); }
    }

    for (const uid of createdUserIds) {
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (error) { cleanupFailed = true; console.error(`[FAIL] Kullanici silinemedi (${uid}): ${error.message}`); }
    }

    if (cleanupFailed) testsFailed++;
    else recordPass('21. Test verileri eksiksiz temizlendi');
  }

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${testsPassed} / ${testsPassed + testsFailed} TESTS PASSED (${testsFailed} FAILED)`);
  console.log('=============================================================================\n');

  if (testsFailed > 0) process.exit(1);
}

runTeamManagementTests();
