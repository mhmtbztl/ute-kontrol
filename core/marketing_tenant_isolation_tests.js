/**
 * PAZARLAMA — CAPRAZ KIRACI IZOLASYONU (URETIME KARSI DAVRANIS TESTI)
 *
 * 2026-09-14'te uretimde bulunan acigin regresyon agi.
 *
 * Phase 17 fonksiyonlarinin yetki kontrolu soyleydi:
 *     IF auth.uid() IS NULL
 *        OR public.get_tenant_role(p_tenant_id) NOT IN ('owner','admin','manager') THEN
 *
 * Cagiran kisi HEDEF kiracinin uyesi degilse get_tenant_role NULL doner ve
 * SQL uc degerli mantiginda NULL NOT IN (...) sonucu NULL olur — TRUE degil.
 * Yani IF hic calismaz ve koruma tam da korumasi gereken anda atlanir.
 *
 * Kanit: B kiracisinin sahibi, save_property_channel_listing ile A kiracisinin
 * mulkune ilan yazdi (tenant_id = A, created_by = B).
 *
 * Kaynak taramasi (marketing_anon_grant_tests) kalibi yakalar; bu suit
 * davranisi olcer. Duzeltme: supabase/migration_phase23_marketing_tenant_guard.sql
 * Goc uygulanana kadar bu suit KIRMIZI kalir — beklenen durumdur.
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
});

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const newClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let passed = 0, failed = 0;
const users = [], tenants = [];
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d || 'kosul saglanmadi');

const stamp = Date.now().toString(36);

async function makeOwner(label) {
  const email = `iso_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'Iso!' + stamp + 'Aa';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`${label} kullanici: ${error.message}`);
  users.push(data.user.id);
  const client = newClient();
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`${label} giris: ${e2.message}`);
  const { data: t, error: e3 } = await client.rpc('create_tenant_and_owner', {
    p_company_name: `Izolasyon ${label} ${stamp}`, p_full_name: 'ISO'
  });
  if (e3) throw new Error(`${label} tenant: ${e3.message}`);
  tenants.push(t.tenant_id);
  const { data: p, error: e4 } = await client.from('properties')
    .insert({ tenant_id: t.tenant_id, name: 'Villa ' + label, slug: `iso${label}${stamp}`, base_price: 12000 })
    .select().single();
  if (e4) throw new Error(`${label} mulk: ${e4.message}`);
  return { client, tenantId: t.tenant_id, propertyId: p.id, userId: data.user.id };
}

async function run() {
  const A = await makeOwner('a');
  const B = await makeOwner('b');

  // --- Kontrol grubu: A kendi kiracisinda yazabilmeli --------------------
  const { data: own, error: oe } = await A.client.rpc('save_property_channel_listing', {
    p_tenant_id: A.tenantId, p_property_id: A.propertyId,
    p_channel_code: 'AIRBNB', p_external_listing_id: 'ISO-OWN-' + stamp,
    p_display_name: 'Kendi ilani', p_external_url: 'https://example.com/iso', p_payout_currency: 'TRY'
  });
  check(!oe && own && own.listingId,
    '1. Sahip kendi kiracisinda kanal ilani kaydedebiliyor', oe && oe.message);
  const listingId = own && own.listingId;

  // --- Asil aciklik: B, A'nin kiracisina yazmaya calisiyor ---------------
  const { error: xe } = await B.client.rpc('save_property_channel_listing', {
    p_tenant_id: A.tenantId, p_property_id: A.propertyId,
    p_channel_code: 'VRBO', p_external_listing_id: 'ISO-HACK-' + stamp
  });
  check(!!xe && /UNAUTHORIZED/i.test(xe.message || ''),
    '2. Yabanci kiraci ilan yazamiyor (RPC reddediyor)',
    xe ? xe.message : 'RPC hata vermedi — koruma atlandi');

  const { data: written } = await admin.from('property_channel_listings')
    .select('id').eq('tenant_id', A.tenantId).eq('external_listing_id', 'ISO-HACK-' + stamp);
  check((written || []).length === 0,
    '3. Yabanci kiracinin yazmasi veritabanina ULASMIYOR',
    `A kiracisinda yabanci satir: ${(written || []).length}`);

  // --- Snapshot RPC'si ayni korumayi kullaniyor --------------------------
  if (listingId) {
    const { error: se } = await B.client.rpc('record_manual_channel_snapshot', {
      p_tenant_id: A.tenantId, p_channel_listing_id: listingId,
      p_period_start: '2026-08-01', p_period_end_exclusive: '2026-09-01',
      p_idempotency_key: 'iso-hack-' + stamp, p_impressions: 999, p_listing_views: 99,
      p_booking_attempts: 9, p_platform_reported_bookings: 1, p_wishlist_saves: 1, p_notes: 'hack'
    });
    check(!!se && /UNAUTHORIZED/i.test(se.message || ''),
      '4. Yabanci kiraci manuel snapshot kaydedemiyor',
      se ? se.message : 'RPC hata vermedi — koruma atlandi');

    const { data: snaps } = await admin.from('channel_performance_snapshots')
      .select('id').eq('tenant_id', A.tenantId);
    check((snaps || []).length === 0,
      '5. Yabanci snapshot veritabanina ULASMIYOR', `satir: ${(snaps || []).length}`);
  }

  // --- Benchmark RPC'si ayni korumayi kullaniyor -------------------------
  const { error: be } = await B.client.rpc('record_property_marketing_benchmark', {
    p_tenant_id: A.tenantId, p_property_id: A.propertyId,
    p_benchmark_fingerprint: crypto.createHash('sha256').update('iso-hack-' + stamp).digest('hex'), p_source_kind: 'MANUAL_RESEARCH',
    p_source_record_id: 'hack-' + stamp,
    p_effective_from: '2026-08-01', p_effective_to_exclusive: '2026-12-01',
    p_search_to_view_ctr_percent: 5, p_view_to_booking_conversion_percent: 5,
    p_normalized_impressions_per_listing_day: 10,
    p_recommended_active_media_count: 20, p_max_distribution_cost_percent: 18,
    p_minimum_direct_reservation_share_percent: 10, p_confidence: 0.9, p_evidence: {}
  });
  check(!!be && /UNAUTHORIZED/i.test(be.message || ''),
    '6. Yabanci kiraci referans (benchmark) yazamiyor',
    be ? be.message : 'RPC hata vermedi — koruma atlandi');

  const { data: bench } = await admin.from('property_marketing_benchmarks')
    .select('id').eq('tenant_id', A.tenantId);
  check((bench || []).length === 0,
    '6b. Yabanci referans veritabanina ULASMIYOR', `satir: ${(bench || []).length}`);

  // --- Okuma tarafi (RLS) zaten dogru olmali ----------------------------
  const { data: xread } = await B.client.from('property_channel_listings')
    .select('id').eq('tenant_id', A.tenantId);
  check((xread || []).length === 0,
    '7. Yabanci kiraci ilanlari okuyamiyor (RLS)', `okunan: ${(xread || []).length}`);
}

async function cleanup() {
  for (const t of tenants) await admin.from('tenants').delete().eq('id', t);
  for (const u of users) await admin.auth.admin.deleteUser(u);
}

(async () => {
  try {
    await run();
  } catch (e) {
    failed++;
    console.error('[FAIL] calisma hatasi\n       ' + e.message);
  } finally {
    try { await cleanup(); } catch (e) { console.error('temizlik hatasi: ' + e.message); }
    console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED`);
    process.exit(failed ? 1 : 0);
  }
})();
