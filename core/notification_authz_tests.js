/**
 * LEXBNB BILDIRIM / UYARI RPC YETKI TEST SUITE (PHASE 29)
 *
 * 17 Eylul 2026'da bildirim merkezi incelemesinde bulundu. phase25
 * `review_marketing_finding` icin ayni hatayi duzeltmisti; phase12'den gelen
 * bu iki fonksiyon ayni kalibi tasimaya devam ediyordu:
 *
 *     SELECT * INTO v_notif ... FOR UPDATE;   <- once satir bulunup KILITLENIYOR
 *     IF NOT FOUND THEN RETURN 'NOTIFICATION_NOT_FOUND';
 *     IF NOT EXISTS (tenant_members ...) THEN RAISE 'UNAUTHORIZED...';  <- SONRA
 *
 * Uretimde ve test projesinde olculen iki acik:
 *   1. `anon` her iki fonksiyonu da CALISTIRABILIYORDU. phase22 yalnizca
 *      pazarlama fonksiyonlarini kapatmisti.
 *   2. VARLIK ORACULU: giris yapmamis bir cagiran, var olmayan bir kimlik icin
 *      {"success": false, "error": "NOTIFICATION_NOT_FOUND"}, VAR OLAN bir
 *      kimlik icin "UNAUTHORIZED" aliyordu. Yani bir kimligin var olup
 *      olmadigini ogrenebiliyordu.
 *
 * Veri butunlugu bozulmamisti: govdedeki ikinci kat (tenant_members kontrolu)
 * calisiyordu ve kayit degismiyordu. Kirilan sey gizlilik ve kilit
 * disiplinidir. Bu suit ucunu de olcer.
 *
 * phase29 UYGULANMADAN kosulursa kirilir. Oyle olmali.
 */

const { createClient } = require('@supabase/supabase-js');

const env = require('./test_env.js').loadTestEnv();

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const newClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let passed = 0, failed = 0;
const createdUsers = [];
const createdTenants = [];
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

const YOK_UUID = '00000000-0000-0000-0000-000000000000';
const hataMetni = e => (e && (e.message || e.code)) ? String(e.message || e.code) : '';

async function makeUser(label, stamp) {
  const email = `nac_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'Nac!' + stamp;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`${label}: ${error.message}`);
  createdUsers.push(data.user.id);
  const client = newClient();
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`${label} giris: ${e2.message}`);
  return { email, client, id: data.user.id };
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB BILDIRIM / UYARI RPC YETKI TESTLERI');
  console.log('=============================================================================\n');

  const stamp = Date.now();
  let owner, yabanci;

  try {
    owner = await makeUser('own', stamp);
    const { data: t, error: te } = await owner.client.rpc('create_tenant_and_owner', {
      p_company_name: 'Bildirim Yetki ' + stamp, p_full_name: 'B'
    });
    if (te) throw new Error('tenant: ' + te.message);
    createdTenants.push(t.tenant_id);
    const TID = t.tenant_id;

    // Bildirim ve uyari kayitlari service_role ile kurulur: uygulamada bunlari
    // ureten bir yol henuz yok (bildirim merkezinin uretici ucu bagli degil).
    const { data: notif, error: nie } = await admin.from('user_notifications').insert({
      tenant_id: TID, event_key: `notif:${TID}:OPS:x:TEST`, domain: 'OPS',
      severity: 'CRITICAL', title: 'Kritik', message: 'Deneme', status: 'UNREAD'
    }).select().single();
    if (nie) throw new Error('bildirim: ' + nie.message);

    const { data: alert, error: aie } = await admin.from('executive_alerts').insert({
      tenant_id: TID, alert_code: 'TEST_ALERT', severity: 'CRITICAL', domain: 'OPERATIONS',
      title: 'Uyari', reason: 'Deneme', recommended_action: 'Bak', deep_link: '/ops', status: 'OPEN'
    }).select().single();
    if (aie) throw new Error('uyari: ' + aie.message);

    const durum = async (tablo, id) => {
      const { data, error } = await admin.from(tablo).select('status').eq('id', id).single();
      if (error) throw new Error(`${tablo} okunamadi: ${error.message}`);
      return data.status;
    };

    // -----------------------------------------------------------------------
    console.log('--- 1. anon ROLU (7. bolum: grant geri alinmali) ---');
    const anon = newClient();

    const { error: a1 } = await anon.rpc('acknowledge_notification_atomic', { p_notification_id: notif.id });
    check(/permission denied/i.test(hataMetni(a1)),
      '1. anon bildirim onaylama fonksiyonunu CALISTIRAMAZ',
      'hata: ' + (hataMetni(a1) || 'yok — anon fonksiyona girebildi'));
    check(await durum('user_notifications', notif.id) === 'UNREAD',
      '2. anon cagrisi bildirimi degistirmez', 'kayit degisti');

    const { error: a2 } = await anon.rpc('resolve_executive_alert_atomic', {
      p_alert_id: alert.id, p_resolved_by: null
    });
    check(/permission denied/i.test(hataMetni(a2)),
      '3. anon uyari cozme fonksiyonunu CALISTIRAMAZ',
      'hata: ' + (hataMetni(a2) || 'yok — anon fonksiyona girebildi'));
    check(await durum('executive_alerts', alert.id) === 'OPEN',
      '4. anon cagrisi uyariyi degistirmez', 'kayit degisti');

    // -----------------------------------------------------------------------
    console.log('\n--- 2. VARLIK ORACULU (phase25 ile ayni acik) ---');
    const { error: a3 } = await anon.rpc('acknowledge_notification_atomic', { p_notification_id: YOK_UUID });
    check(hataMetni(a3) === hataMetni(a1) && hataMetni(a1) !== '',
      '5. anon icin VAR OLAN ve VAR OLMAYAN kimlik ayni yaniti verir',
      'var olan: ' + JSON.stringify(hataMetni(a1)) +
      '\n       var olmayan: ' + JSON.stringify(hataMetni(a3)) +
      '\n       Fark varsa bir kimligin var olup olmadigi disariya sizar.');

    // -----------------------------------------------------------------------
    console.log('\n--- 3. YABANCI KIRACI ---');
    yabanci = await makeUser('yad', stamp);
    const { data: yt, error: yte } = await yabanci.client.rpc('create_tenant_and_owner', {
      p_company_name: 'Yabanci ' + stamp, p_full_name: 'Y'
    });
    if (yte) throw new Error('yabanci tenant: ' + yte.message);
    createdTenants.push(yt.tenant_id);

    const { error: y1 } = await yabanci.client.rpc('acknowledge_notification_atomic', { p_notification_id: notif.id });
    check(!!y1, '6. Yabanci kiraci baska isletmenin bildirimini onaylayamaz', 'IZIN VERILDI');
    check(await durum('user_notifications', notif.id) === 'UNREAD',
      '7. Yabanci cagri sonrasi bildirim hala UNREAD', 'kayit degisti');

    const { error: y2 } = await yabanci.client.rpc('acknowledge_notification_atomic', { p_notification_id: YOK_UUID });
    check(hataMetni(y2) === hataMetni(y1) && hataMetni(y1) !== '',
      '8. Giris yapmis yabanci icin de varlik oraculu kapali',
      'var olan: ' + JSON.stringify(hataMetni(y1)) +
      '\n       var olmayan: ' + JSON.stringify(hataMetni(y2)));

    const { error: y3 } = await yabanci.client.rpc('resolve_executive_alert_atomic', {
      p_alert_id: alert.id, p_resolved_by: yabanci.id
    });
    check(!!y3, '9. Yabanci kiraci baska isletmenin uyarisini cozemez', 'IZIN VERILDI');

    // RLS okuma tarafi
    const { data: y4 } = await yabanci.client.from('user_notifications').select('id').eq('id', notif.id);
    check((y4 || []).length === 0,
      '10. Yabanci kiraci bildirim satirini OKUYAMAZ (RLS)',
      'okuyabildi: ' + JSON.stringify(y4));

    // -----------------------------------------------------------------------
    console.log('\n--- 4. DOGRU SAHIP ---');
    const { data: o1, error: oe1 } = await owner.client.rpc('acknowledge_notification_atomic', {
      p_notification_id: notif.id
    });
    check(!oe1 && o1 && o1.success === true,
      '11. Isletmenin sahibi kendi bildirimini onaylayabilir',
      oe1 ? oe1.message : JSON.stringify(o1));
    check(await durum('user_notifications', notif.id) === 'ACKNOWLEDGED',
      '12. Onaylanan bildirim ACKNOWLEDGED olur', 'durum degismedi');

    const { data: o2, error: oe2 } = await owner.client.rpc('resolve_executive_alert_atomic', {
      p_alert_id: alert.id, p_resolved_by: null
    });
    check(!oe2 && o2 && o2.success === true,
      '13. Isletmenin sahibi kendi uyarisini cozebilir',
      oe2 ? oe2.message : JSON.stringify(o2));
    check(await durum('executive_alerts', alert.id) === 'RESOLVED',
      '14. Cozulen uyari RESOLVED olur', 'durum degismedi');

    // -----------------------------------------------------------------------
    console.log('\n--- 5. DENETIM IZI CAGIRANDAN GELMEZ ---');
    // p_resolved_by cagiranin gonderdigi bir degerdir: "kim cozdu" izini
    // cagiranin yazmasina izin verilirse denetim izi anlamini kaybeder.
    const { data: alert2, error: aie2 } = await admin.from('executive_alerts').insert({
      tenant_id: TID, alert_code: 'TEST_ALERT_2', severity: 'MEDIUM', domain: 'OPERATIONS',
      title: 'Uyari 2', reason: 'Deneme 2', recommended_action: 'Bak', deep_link: '/ops', status: 'OPEN'
    }).select().single();
    if (aie2) throw new Error('uyari 2: ' + aie2.message);

    await owner.client.rpc('resolve_executive_alert_atomic', {
      p_alert_id: alert2.id, p_resolved_by: yabanci.id
    });
    const { data: iz } = await admin.from('executive_alerts')
      .select('resolved_by').eq('id', alert2.id).single();
    check(iz && iz.resolved_by === owner.id,
      '15. "Cozen kisi" cagiranin gonderdigi deger degil, oturumun kendisidir',
      'resolved_by=' + (iz && iz.resolved_by) +
      '\n       beklenen (owner)=' + owner.id +
      '\n       cagirida gonderilen (yabanci)=' + yabanci.id);

  } catch (err) {
    no('Suit beklenmedik hata ile durdu', err && err.message ? err.message : String(err));
  } finally {
    console.log('\n--- TEMIZLIK ---');
    let hata = false;
    for (const c of [owner, yabanci]) {
      if (c && c.client) { try { await c.client.auth.signOut(); } catch (e) {} }
    }
    async function retry(l, fn) {
      for (let a = 1; a <= 3; a++) {
        const { error } = await fn();
        if (!error) return true;
        if (a === 3) { console.error(`[FAIL] ${l}: ${error.message}`); return false; }
        await new Promise(r => setTimeout(r, a * 400));
      }
      return false;
    }
    for (const t of createdTenants) if (!await retry('Tenant ' + t, () => admin.from('tenants').delete().eq('id', t))) hata = true;
    for (const u of createdUsers) if (!await retry('Kullanici ' + u, () => admin.auth.admin.deleteUser(u))) hata = true;

    const { data: after } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const kalan = (after ? after.users : []).filter(u => createdUsers.includes(u.id));
    if (kalan.length) { hata = true; console.error(`[FAIL] ${kalan.length} test hesabi duruyor`); }

    if (hata) failed++; else ok('16. Test verileri eksiksiz temizlendi');

    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
