/**
 * LEXBNB PHASE 59 — MULK, TALEP VE MISAFIR BAGLAMI (CANLI, YALNIZ TEST PROJESI)
 *
 *   A. Konum: koy/mahalle, koordinat ve yaricap; aralik kurallari; yalniz yonetim.
 *   B. Mulk sahibi: yonetim yazar, defter okuyuculari okur; sales/staff gormez.
 *   C. "Nereden geldi": her isletmede silinemez "Bilinmiyor"; isletme kendi
 *      kaynagini ekler.
 *   D. Hizli kayit: ayni telefon (farkli yazim) yeni talep ACMAZ, mevcut
 *      talebe eklenir; es zamanli iki kayit tek talep; kaynak zorunlu;
 *      tekrar gelen taninir; kapanmis talep yeniden acilmaz, yeni talep acilir.
 *   E. Kara/beyaz liste yalniz yonetimde; hizli kayit uyarisi yalniz yonetime.
 *   F. Ilgi sayaci, dogum gunu, takip ve atama.
 *   G. Sifirlama: talep/sayac/sahipler gider, kaynak katalogu (ayar) kalir.
 *
 * phase59 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
 */

const { createClient } = require('@supabase/supabase-js');

const env = require('./test_env.js').loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const newClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);

let passed = 0, failed = 0;
const createdUsers = [];
const createdTenants = [];
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);
const hataMetni = e => (e && (e.message || e.code)) ? `${e.code || ''} ${e.message || ''}`.trim() : '';
const yetkiHatasi = e => !!e && (String(e.code) === '42501' || /permission denied|FORBIDDEN|row-level security/i.test(String(e.message)));
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

async function makeUser(label, stamp) {
  const email = `p59_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P59!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, client };
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 59 — MULK, TALEP VE MISAFIR BAGLAMI (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const clients = [];
  try {
    const own = await makeUser('own', s), sls = await makeUser('sls', s), stf = await makeUser('stf', s),
      vw = await makeUser('vw', s), atk = await makeUser('atk', s);
    clients.push(own, sls, stf, vw, atk);
    const A = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P59 A ' + s, p_full_name: 'P59' }), 'isletme A').tenant_id;
    createdTenants.push(A);
    const B = must(await atk.client.rpc('create_tenant_and_owner', { p_company_name: 'P59 B ' + s, p_full_name: 'P59' }), 'isletme B').tenant_id;
    createdTenants.push(B);
    must(await admin.from('tenant_members').insert([
      { tenant_id: A, user_id: sls.id, role: 'sales' }, { tenant_id: A, user_id: stf.id, role: 'staff' },
      { tenant_id: A, user_id: vw.id, role: 'viewer' }]), 'uyeler');
    const p = must(await own.client.from('properties').insert({ tenant_id: A, name: 'Villa Kirazli', slug: 'p59' + s, base_price: 10000 }).select().single(), 'mulk');
    const pB = must(await atk.client.from('properties').insert({ tenant_id: B, name: 'B Villa', slug: 'p59b' + s, base_price: 10000 }).select().single(), 'mulk B');

    // -----------------------------------------------------------------------
    console.log('\n--- A. KONUM ---');
    let r = await own.client.rpc('save_property_location', { p_tenant_id: A, p_property_id: p.id, p_locality: 'Kirazli',
      p_latitude: 40.123456, p_longitude: 29.012345, p_research_radius_km: 10 });
    const ctx = must(await admin.from('property_analysis_context').select('locality, latitude, longitude, research_radius_km').eq('property_id', p.id).single(), 'konum');
    check(!r.error && ctx.locality === 'Kirazli' && Number(ctx.latitude) === 40.123456 && Number(ctx.research_radius_km) === 10,
      'A1. Koy, koordinat ve arastirma yaricapi kaydedilir', hataMetni(r.error) || JSON.stringify(ctx));
    r = await own.client.rpc('save_property_location', { p_tenant_id: A, p_property_id: p.id, p_locality: 'X', p_latitude: 95, p_longitude: 29, p_research_radius_km: 10 });
    check(!!r.error, 'A2. Gecersiz enlem (95) reddedilir', 'KAYDEDILDI');
    r = await own.client.rpc('save_property_location', { p_tenant_id: A, p_property_id: p.id, p_locality: 'X', p_latitude: 40, p_longitude: null, p_research_radius_km: 10 });
    check(!!r.error, 'A3. Enlem boylamsiz kaydedilmez', 'KAYDEDILDI');
    r = await sls.client.rpc('save_property_location', { p_tenant_id: A, p_property_id: p.id, p_locality: 'Y', p_latitude: null, p_longitude: null, p_research_radius_km: null });
    check(yetkiHatasi(r.error), 'A4. sales mulk konumunu degistiremez', hataMetni(r.error) || 'DEGISTI');
    r = await atk.client.rpc('save_property_location', { p_tenant_id: B, p_property_id: p.id, p_locality: 'Y', p_latitude: null, p_longitude: null, p_research_radius_km: null });
    check(yetkiHatasi(r.error), 'A5. yabanci kiraci A mulkune konum yazamaz', hataMetni(r.error) || 'YAZDI');

    // -----------------------------------------------------------------------
    console.log('\n--- B. MULK SAHIBI ---');
    const sahip = await own.client.from('property_owners').insert({ tenant_id: A, full_name: 'Ahmet Bey', phone: '05320000000', email: 'ahmet@example.com' }).select().single();
    r = sahip.error ? sahip : await own.client.from('property_owner_links').insert({ tenant_id: A, property_id: p.id, owner_id: sahip.data.id });
    check(!sahip.error && !r.error, 'B1. Mulk sahibi kaydedilir ve mulke baglanir', hataMetni(sahip.error || r.error));
    for (const [c, ad, beklenen] of [[sls, 'sales', 0], [stf, 'staff', 0], [vw, 'viewer', 1]]) {
      const g = await c.client.from('property_owners').select('id').eq('tenant_id', A);
      check((g.data || []).length === beklenen, `B2. ${ad} mulk sahibini ${beklenen ? 'gorur' : 'GOREMEZ'}`, `${(g.data || []).length} satir`);
    }
    r = await own.client.from('property_owner_links').insert({ tenant_id: A, property_id: pB.id, owner_id: sahip.data && sahip.data.id });
    check(!!r.error, 'B3. Baska isletmenin mulkune sahip baglanamaz', 'BAGLANDI');

    // -----------------------------------------------------------------------
    console.log('\n--- C. NEREDEN GELDI ---');
    const bilinmiyor = must(await admin.from('lead_source_catalog').select('*').eq('tenant_id', A).eq('code', 'UNKNOWN').single(), 'UNKNOWN');
    check(bilinmiyor.is_system && bilinmiyor.label === 'Bilinmiyor', 'C1. Yeni isletmede "Bilinmiyor" sistem kaynagi kendiliginden acilir', JSON.stringify(bilinmiyor));
    r = await own.client.from('lead_source_catalog').delete().eq('id', bilinmiyor.id).select('id');
    check(!!r.error && /SYSTEM_SOURCE_LOCKED/.test(hataMetni(r.error)), 'C2. "Bilinmiyor" silinemez', hataMetni(r.error) || 'SILINDI');
    r = await own.client.from('lead_source_catalog').update({ is_active: false }).eq('id', bilinmiyor.id).select('id');
    check(!!r.error, 'C3. "Bilinmiyor" kapatilamaz', 'KAPANDI');
    const ig = await own.client.from('lead_source_catalog').insert({ tenant_id: A, code: 'INSTAGRAM_AD', label: 'Instagram reklami', sort_order: 1 }).select().single();
    check(!ig.error, 'C4. Isletme kendi kaynagini ekler', hataMetni(ig.error));
    r = await sls.client.from('lead_source_catalog').insert({ tenant_id: A, code: 'TIKTOK', label: 'TikTok' });
    check(!!r.error, 'C5. sales kaynak katalogunu duzenleyemez', 'EKLEDI');
    const gS = await sls.client.from('lead_source_catalog').select('code').eq('tenant_id', A);
    check((gS.data || []).length === 2, 'C6. sales kaynaklari gorur (secim icin)', `${(gS.data || []).length} satir`);

    // -----------------------------------------------------------------------
    console.log('\n--- D. HIZLI KAYIT ---');
    const cap = (c, phone, extra) => c.client.rpc('quick_capture_lead', Object.assign({ p_tenant_id: A, p_phone: phone,
      p_source_id: ig.data.id, p_channel: 'WhatsApp', p_check_in: null, p_check_out: null, p_pax: null, p_property_id: null,
      p_guest_name: null, p_note: null }, extra || {}));
    r = await cap(sls, '0532 111 22 33', { p_check_in: '2027-07-10', p_check_out: '2027-07-14', p_pax: 4 });
    const d1 = r.data || {};
    const acq = d1.lead_id ? must(await admin.from('lead_acquisition').select('source_id').eq('lead_id', d1.lead_id).single(), 'kaynak') : {};
    const wf = d1.lead_id ? must(await admin.from('lead_workflow').select('assigned_to').eq('lead_id', d1.lead_id).single(), 'akis') : {};
    check(!r.error && d1.created === true && d1.phone === '+905321112233' && acq.source_id === ig.data.id && wf.assigned_to === sls.id,
      'D1. Hizli kayit talep acar; kaynak ve atama birlikte yazilir', hataMetni(r.error) || JSON.stringify(d1));
    r = await cap(sls, '+90 (532) 111-2233', { p_pax: 5, p_note: 'fiyat sordu' });
    const lead1 = must(await admin.from('leads').select('pax, notes, requested_check_in').eq('id', d1.lead_id).single(), 'talep');
    const leadSay = must(await admin.from('leads').select('id').eq('tenant_id', A), 'talepler').length;
    check(!r.error && r.data.created === false && r.data.lead_id === d1.lead_id && leadSay === 1 && lead1.pax === 5
      && lead1.requested_check_in === '2027-07-10' && lead1.notes.split('\n').length === 2,
      'D2. Ayni telefon (farkli yazim) yeni talep ACMAZ; mevcut talebe eklenir', hataMetni(r.error) || JSON.stringify({ d: r.data, leadSay, lead1 }));
    r = await cap(sls, '05441234567', { p_source_id: null });
    check(!!r.error && /SOURCE_REQUIRED/.test(hataMetni(r.error)), 'D3. "Nereden geldi" secilmeden kayit olmaz', hataMetni(r.error) || 'KAYDETTI');
    r = await cap(stf, '05441234567');
    check(yetkiHatasi(r.error), 'D4. staff talep kaydedemez', hataMetni(r.error) || 'KAYDETTI');
    const [e1, e2] = await Promise.all([cap(sls, '0555 999 88 77'), cap(own, '5559998877')]);
    const esz = must(await admin.from('leads').select('id').eq('tenant_id', A), 'talepler').length;
    check(!e1.error && !e2.error && esz === 2 && e1.data.lead_id === e2.data.lead_id,
      'D5. Es zamanli iki kayit ayni telefonla TEK talep acar', `${hataMetni(e1.error)} ${hataMetni(e2.error)} talep=${esz}`);
    must(await admin.from('leads').update({ status: 'LOST' }).eq('id', d1.lead_id), 'kaybedildi');
    r = await cap(sls, '05321112233');
    check(!r.error && r.data.created === true && r.data.lead_id !== d1.lead_id && r.data.returning === true && r.data.previous_leads === 1,
      'D6. Kapanmis talebin sahibi yeniden yazinca yeni talep acilir ve tekrar gelen taninir', hataMetni(r.error) || JSON.stringify(r.data));

    // -----------------------------------------------------------------------
    console.log('\n--- E. KARA / BEYAZ LISTE ---');
    const misafir = must(await own.client.from('guests').insert({ tenant_id: A, first_name: 'Can', phone: '0 533 777 66 55' }).select().single(), 'misafir');
    r = await own.client.from('guest_private_classifications').insert({ tenant_id: A, guest_id: misafir.id, list_type: 'BLACK', reason: 'Hasar birakti, 2025-08', incident_on: '2025-08-12' });
    check(!r.error, 'E1. Yonetim kara liste kaydi olusturur (olgusal gerekce)', hataMetni(r.error));
    r = await own.client.from('guest_private_classifications').update({ reason: 'x' }).eq('guest_id', misafir.id).select('guest_id');
    check(!!r.error, 'E2. Gerekcesiz (3 harften kisa) siniflandirma olmaz', 'KAYDEDILDI');
    for (const [c, ad] of [[sls, 'sales'], [vw, 'viewer'], [stf, 'staff']]) {
      const g = await c.client.from('guest_private_classifications').select('guest_id').eq('tenant_id', A);
      check((g.data || []).length === 0, `E3. ${ad} kara/beyaz listeyi GOREMEZ`, `${(g.data || []).length} satir`);
    }
    r = await sls.client.from('guest_private_classifications').insert({ tenant_id: A, guest_id: misafir.id, list_type: 'WHITE', reason: 'Iyi misafir' });
    check(!!r.error, 'E4. sales siniflandirma yazamaz', 'YAZDI');
    const gB = await atk.client.from('guest_private_classifications').select('guest_id').eq('guest_id', misafir.id);
    check((gB.data || []).length === 0, 'E5. Baska isletme asla goremez', `${(gB.data || []).length} satir`);
    r = await cap(own, '+905337776655');
    check(!r.error && r.data.classification === 'BLACK' && r.data.returning === true && r.data.guest_id === misafir.id,
      'E6. Yonetim hizli kayitta kara liste uyarisini alir', hataMetni(r.error) || JSON.stringify(r.data));
    r = await cap(sls, '05337776655');
    check(!r.error && r.data.classification === null && r.data.returning === true, 'E7. sales ayni kayitta siniflandirmayi ALMAZ (tekrar geleni gorur)',
      hataMetni(r.error) || JSON.stringify(r.data));

    // -----------------------------------------------------------------------
    console.log('\n--- F. ILGI SAYACI, DOGUM GUNU, TAKIP ---');
    const bugun = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
    const bump = (c, delta, day) => c.client.rpc('bump_lead_interest', { p_tenant_id: A, p_day: day || bugun, p_source_id: ig.data.id, p_channel: 'Instagram DM', p_delta: delta });
    await bump(sls, 1); r = await bump(sls, 1);
    check(!r.error && r.data.count === 2, 'F1. Ilgi sayaci birer artar (kisisel veri yok)', hataMetni(r.error) || JSON.stringify(r.data));
    r = await bump(sls, -1);
    check(!r.error && r.data.count === 1, 'F2. Yanlis dokunus geri alinir', hataMetni(r.error) || JSON.stringify(r.data));
    await bump(sls, -1); r = await bump(sls, -1);
    check(!!r.error, 'F3. Sayac eksiye dusmez', 'DUSTU');
    r = await bump(sls, 5);
    check(!!r.error, 'F4. Toplu artis reddedilir', 'KABUL');
    r = await bump(sls, 1, '2099-01-01');
    check(!!r.error, 'F5. Gelecek gune ilgi yazilmaz', 'YAZDI');
    r = await bump(stf, 1);
    check(yetkiHatasi(r.error), 'F6. staff sayaca dokunamaz', hataMetni(r.error) || 'ARTTI');
    r = await own.client.from('guests').update({ birth_date: '1990-05-01' }).eq('id', misafir.id).select('birth_date').single();
    check(!r.error && r.data.birth_date === '1990-05-01', 'F7. Misafir dogum gunu kaydedilir', hataMetni(r.error));
    r = await own.client.from('guests').update({ birth_date: '1800-01-01' }).eq('id', misafir.id).select('id');
    check(!!r.error, 'F8. Anlamsiz dogum tarihi reddedilir', 'KAYDEDILDI');
    r = await sls.client.from('lead_workflow').update({ next_follow_up_at: '2027-07-01T09:00:00+03:00', assigned_to: own.id }).eq('lead_id', e1.data.lead_id).select('lead_id');
    check(!r.error && (r.data || []).length === 1, 'F9. sales takip tarihini ve atamayi gunceller', hataMetni(r.error));
    r = await sls.client.from('lead_workflow').update({ assigned_to: atk.id }).eq('lead_id', e1.data.lead_id).select('lead_id');
    check(!!r.error && /CROSS_TENANT_ASSIGNEE/.test(hataMetni(r.error)), 'F10. Talep isletme disindan birine atanamaz', hataMetni(r.error) || 'ATANDI');

    // -----------------------------------------------------------------------
    console.log('\n--- G. SIFIRLAMA ---');
    r = await own.client.rpc('reset_tenant_data', { p_tenant_id: A, p_confirm: 'VERILERI SIFIRLA' });
    const say = async t => {
      const q = await admin.from(t).select('*', { count: 'exact', head: true }).eq('tenant_id', A);
      if (q.error) throw new Error(`${t} sayim: ${q.error.message}`);
      return q.count;
    };
    const kalan = {};
    for (const t of ['leads', 'lead_acquisition', 'lead_workflow', 'lead_interest_daily', 'property_owners', 'guest_private_classifications', 'lead_source_catalog']) {
      kalan[t] = await say(t);
    }
    check(!r.error && kalan.leads === 0 && kalan.lead_acquisition === 0 && kalan.lead_workflow === 0 && kalan.lead_interest_daily === 0
      && kalan.property_owners === 0 && kalan.guest_private_classifications === 0 && kalan.lead_source_catalog === 2,
      'G1. Sifirlama talep/sayac/sahip/liste defterlerini siler; kaynak katalogu (ayar) kalir', hataMetni(r.error) || JSON.stringify(kalan));
  } catch (e) {
    no('Beklenmeyen hata', e.stack || e.message);
  } finally {
    console.log('\n--- TEMIZLIK ---');
    let hata = false;
    for (const c of clients) { try { await c.client.auth.signOut(); } catch (e) {} }
    for (const t of createdTenants) {
      const { error } = await admin.from('tenants').delete().eq('id', t);
      if (error) { hata = true; console.error('[FAIL] Tenant ' + t + ': ' + error.message); }
    }
    for (const u of createdUsers) {
      const { data } = await admin.auth.admin.getUserById(u);
      if (data && data.user) { const { error } = await admin.auth.admin.deleteUser(u); if (error) { hata = true; console.error('[FAIL] Kullanici ' + u + ': ' + error.message); } }
    }
    if (hata) failed++; else ok('Z. Test verileri eksiksiz temizlendi (sistem kaynagi dahil)');
    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
