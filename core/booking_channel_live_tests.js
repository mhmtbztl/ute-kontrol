/**
 * PHASE 30 — CANLI DAVRANIS TESTI
 * Yalniz ayri Supabase test projesinde calisir; hedef korumasi test_env.js'dedir.
 */
const { createClient } = require('@supabase/supabase-js');
const { loadTestEnv } = require('./test_env.js');

const env = loadTestEnv();
const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, authOptions);
const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, authOptions);

let passed = 0;
let failed = 0;
function check(condition, name, detail = '') {
  if (condition) { passed++; console.log('[PASS] ' + name); }
  else { failed++; console.error('[FAIL] ' + name + (detail ? ` — ${detail}` : '')); }
}

async function createSignedInUser(label, stamp) {
  const email = `channel-${label}-${stamp}@lexbnbtest.com`;
  const password = 'SecurePass123!';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data?.user?.id) {
    throw new Error(`${label} kullanicisi olusturulamadi: ${created.error?.message || 'bos kullanici'}`);
  }
  const login = await anon.auth.signInWithPassword({ email, password });
  if (login.error || !login.data?.session?.access_token) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    throw new Error(`${label} kullanicisi giris yapamadi: ${login.error?.message || 'bos oturum'}`);
  }
  return {
    id: created.data.user.id,
    email,
    client: createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${login.data.session.access_token}` } },
      auth: authOptions.auth
    })
  };
}

async function run() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const users = [];
  const tenantIds = [];
  try {
    const owner = await createSignedInUser('owner', stamp);
    const manager = await createSignedInUser('manager', stamp);
    const viewer = await createSignedInUser('viewer', stamp);
    const outsider = await createSignedInUser('outsider', stamp);
    users.push(owner, manager, viewer, outsider);
    check(true, 'Dört rol senaryosu için test kullanıcıları oluşturuldu');

    const tenant = await owner.client.rpc('create_tenant_and_owner', {
      p_company_name: `Channel Test ${stamp}`,
      p_full_name: 'Channel Test Owner'
    });
    const tenantId = tenant.data?.tenant_id || null;
    check(!tenant.error && !!tenantId, 'Test tenantı oluşturuldu', tenant.error?.message);
    if (!tenantId) return;
    tenantIds.push(tenantId);

    const outsiderTenant = await outsider.client.rpc('create_tenant_and_owner', {
      p_company_name: `Channel Outsider ${stamp}`,
      p_full_name: 'Channel Test Outsider'
    });
    const outsiderTenantId = outsiderTenant.data?.tenant_id || null;
    check(!outsiderTenant.error && !!outsiderTenantId, 'Çapraz tenant senaryosu oluşturuldu', outsiderTenant.error?.message);
    if (outsiderTenantId) tenantIds.push(outsiderTenantId);

    const memberInsert = await admin.from('tenant_members').insert([
      { tenant_id: tenantId, user_id: manager.id, role: 'manager' },
      { tenant_id: tenantId, user_id: viewer.id, role: 'viewer' }
    ]);
    check(!memberInsert.error, 'Manager ve viewer rolleri test tenantına eklendi', memberInsert.error?.message);

    const defaults = await owner.client.from('tenant_booking_channels')
      .select('id,code,channel_type,default_commission_rate,is_active')
      .eq('tenant_id', tenantId);
    const airbnb = (defaults.data || []).find(row => row.code === 'AIRBNB');
    const booking = (defaults.data || []).find(row => row.code === 'BOOKING');
    check(!defaults.error && defaults.data?.length === 7, 'Yeni tenant için 7 varsayılan kanal otomatik kuruldu', defaults.error?.message);
    check(Number(airbnb?.default_commission_rate) === 15 && Number(booking?.default_commission_rate) === 18,
      'Mevcut Airbnb ve Booking varsayılanları korundu');

    const createdChannel = await owner.client.rpc('save_tenant_booking_channel', {
      p_tenant_id: tenantId,
      p_channel_id: null,
      p_display_name: 'Test OTA',
      p_channel_type: 'OTA',
      p_default_commission_rate: 12.5,
      p_is_active: true
    });
    const channelId = createdChannel.data?.id || null;
    check(!createdChannel.error && !!channelId && createdChannel.data?.code?.startsWith('CUSTOM_'),
      'Owner özel OTA kanalı oluşturabildi', createdChannel.error?.message);

    const property = await owner.client.from('properties').insert({
      tenant_id: tenantId,
      slug: `CHANNEL_${stamp.replace(/[^a-z0-9]/gi, '').slice(-16).toUpperCase()}`,
      name: 'Kanal Test Mülkü',
      capacity: '4 Kişilik',
      base_price: 10000,
      clean_cost: 1000
    }).select('id').single();
    check(!property.error && !!property.data?.id, 'Özel kanal rezervasyonu için test mülkü oluşturuldu', property.error?.message);

    const customBooking = await owner.client.from('bookings').insert({
      tenant_id: tenantId,
      property_id: property.data?.id,
      booking_code: `CH-${stamp}`.slice(0, 50),
      guest_name: 'Kanal Test Misafiri',
      channel: createdChannel.data?.code,
      check_in: '2026-11-10',
      check_out: '2026-11-12',
      gross_amount: 20000,
      ota_commission: 2500,
      cleaning_fee: 1000,
      discount: 0,
      net_room_revenue: 16500,
      status: 'CONFIRMED'
    }).select('id,channel').single();
    check(!customBooking.error && customBooking.data?.channel === createdChannel.data?.code,
      'Özel kanal kodu gerçek rezervasyonda kaydedilebildi', customBooking.error?.message);

    const managed = await manager.client.rpc('save_tenant_booking_channel', {
      p_tenant_id: tenantId,
      p_channel_id: channelId,
      p_display_name: 'Manager OTA',
      p_channel_type: 'OTA',
      p_default_commission_rate: 13.25,
      p_is_active: false
    });
    check(!managed.error && managed.data?.is_active === false && Number(managed.data?.default_commission_rate) === 13.25,
      'Manager oranı güncelledi ve kanalı geçmişi silmeden pasifleştirdi', managed.error?.message);

    const inactiveRead = await owner.client.from('tenant_booking_channels')
      .select('id,is_active').eq('tenant_id', tenantId).eq('id', channelId).maybeSingle();
    check(!inactiveRead.error && inactiveRead.data?.is_active === false,
      'Pasif kanal fiziksel olarak silinmedi ve geçmiş için okunabilir kaldı', inactiveRead.error?.message);

    const historicalBooking = await owner.client.from('bookings')
      .select('channel').eq('id', customBooking.data?.id).single();
    check(!historicalBooking.error && historicalBooking.data?.channel === createdChannel.data?.code,
      'Kanal pasifleştirilince geçmiş rezervasyonun kanal kodu değişmedi', historicalBooking.error?.message);

    const viewerWrite = await viewer.client.rpc('save_tenant_booking_channel', {
      p_tenant_id: tenantId,
      p_channel_id: channelId,
      p_display_name: 'Viewer Degisikligi',
      p_channel_type: 'OTA',
      p_default_commission_rate: 20,
      p_is_active: true
    });
    check(viewerWrite.error?.code === '42501' && /FORBIDDEN_ROLE/.test(viewerWrite.error?.message || ''),
      'Viewer kanal ayarını değiştiremedi', viewerWrite.error?.message);

    const outsiderWrite = await outsider.client.rpc('save_tenant_booking_channel', {
      p_tenant_id: tenantId,
      p_channel_id: channelId,
      p_display_name: 'Outsider Degisikligi',
      p_channel_type: 'OTA',
      p_default_commission_rate: 20,
      p_is_active: true
    });
    check(outsiderWrite.error?.code === '42501' && /FORBIDDEN_ROLE/.test(outsiderWrite.error?.message || '')
      && !/CHANNEL_NOT_FOUND/.test(outsiderWrite.error?.message || ''),
    'Çapraz tenant çağrısı kayıt varlığını sızdırmadan reddedildi', outsiderWrite.error?.message);

    const outsiderRead = await outsider.client.from('tenant_booking_channels')
      .select('id').eq('tenant_id', tenantId);
    check(!outsiderRead.error && outsiderRead.data?.length === 0,
      'RLS başka tenantın kanal kataloğunu gizledi', outsiderRead.error?.message);

    const directInsert = await owner.client.from('tenant_booking_channels').insert({
      tenant_id: tenantId,
      code: 'BYPASS',
      display_name: 'Bypass',
      channel_type: 'OTA',
      default_commission_rate: 10
    });
    check(directInsert.error?.code === '42501', 'Authenticated istemcinin doğrudan tablo yazması reddedildi', directInsert.error?.message);

    const invalidDirect = await owner.client.rpc('save_tenant_booking_channel', {
      p_tenant_id: tenantId,
      p_channel_id: null,
      p_display_name: 'Hatalı Direkt',
      p_channel_type: 'DIRECT',
      p_default_commission_rate: 5,
      p_is_active: true
    });
    check(invalidDirect.error?.code === '22023', 'Direkt kanala komisyon yazılması sunucuda reddedildi', invalidDirect.error?.message);

    const systemTypeChange = await owner.client.rpc('save_tenant_booking_channel', {
      p_tenant_id: tenantId,
      p_channel_id: airbnb?.id,
      p_display_name: 'Airbnb',
      p_channel_type: 'DIRECT',
      p_default_commission_rate: 0,
      p_is_active: true
    });
    check(!systemTypeChange.error && systemTypeChange.data?.channel_type === 'OTA',
      'Sistem kanalının türü RPC doğrudan çağrılsa bile değiştirilemedi', systemTypeChange.error?.message);

    const duplicateName = await owner.client.rpc('save_tenant_booking_channel', {
      p_tenant_id: tenantId,
      p_channel_id: null,
      p_display_name: 'airbnb',
      p_channel_type: 'OTA',
      p_default_commission_rate: 10,
      p_is_active: true
    });
    check(duplicateName.error?.code === '23505', 'Aynı tenantta büyük-küçük harf farkıyla yinelenen kanal adı reddedildi', duplicateName.error?.message);

    const anonymousWrite = await anon.rpc('save_tenant_booking_channel', {
      p_tenant_id: tenantId,
      p_channel_id: null,
      p_display_name: 'Yetkisiz OTA',
      p_channel_type: 'OTA',
      p_default_commission_rate: 10,
      p_is_active: true
    });
    check(anonymousWrite.error?.code === '42501', 'Anonim kanal RPC çağrısı yetki katmanında reddedildi', anonymousWrite.error?.message);
  } finally {
    for (const tenantId of tenantIds.reverse()) {
      const removed = await admin.from('tenants').delete().eq('id', tenantId);
      check(!removed.error, `Test tenantı temizlendi (${tenantId.slice(0, 8)})`, removed.error?.message);
    }
    for (const user of users.reverse()) {
      const removed = await admin.auth.admin.deleteUser(user.id);
      check(!removed.error, `Test kullanıcısı temizlendi (${user.email})`, removed.error?.message);
    }
  }
}

run().catch(error => {
  failed++;
  console.error('[FAIL] Beklenmeyen hata — ' + (error.message || error));
}).finally(() => {
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed) process.exitCode = 1;
});
