/**
 * LEXBNB PHASE 78 — A4 FIYAT ARASTIRMASI VE GIDER SABLONU (CANLI)
 *
 * Bu suit phase78 uygulanmadan kirilir. Yalniz ayri Supabase test projesinde
 * calisir; test_env.js uretimi kapatilamaz bicimde reddeder.
 */

const { createClient } = require('@supabase/supabase-js');
const env = require('./test_env.js').loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const newClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);

let passed = 0, failed = 0;
const users = [], tenants = [], clients = [];
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);
const errText = e => e ? `${e.code || ''} ${e.message || ''}`.trim() : '';
const denied = e => !!e && (String(e.code) === '42501' || /permission denied|row-level security/i.test(String(e.message)));
const must = (r, label) => { if (r.error) throw new Error(`${label}: ${errText(r.error)}`); return r.data; };

async function makeUser(label, stamp) {
  const email = `p78_${label}_${stamp}@lexbnb-e2e.test`;
  const password = `P78!${stamp}`;
  const result = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  users.push(result.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), `${label} giris`);
  const user = { id: result.user.id, client };
  clients.push(user);
  return user;
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 78 — FIYAT ARASTIRMASI VE GIDER SABLONU (CANLI)');
  console.log('=============================================================================\n');
  const stamp = Date.now();
  const todayInIstanbul = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  try {
    const owner = await makeUser('owner', stamp);
    const sales = await makeUser('sales', stamp);
    const staff = await makeUser('staff', stamp);
    const viewer = await makeUser('viewer', stamp);
    const outsider = await makeUser('outsider', stamp);
    const tenantA = must(await owner.client.rpc('create_tenant_and_owner', { p_company_name: `P78 A ${stamp}`, p_full_name: 'P78' }), 'tenant A').tenant_id;
    const tenantB = must(await outsider.client.rpc('create_tenant_and_owner', { p_company_name: `P78 B ${stamp}`, p_full_name: 'P78' }), 'tenant B').tenant_id;
    tenants.push(tenantA, tenantB);
    must(await admin.from('tenant_members').insert([
      { tenant_id: tenantA, user_id: sales.id, role: 'sales' },
      { tenant_id: tenantA, user_id: staff.id, role: 'staff' },
      { tenant_id: tenantA, user_id: viewer.id, role: 'viewer' }
    ]), 'roller');
    const propertyA = must(await owner.client.from('properties').insert({ tenant_id: tenantA, name: 'P78 Villa', slug: `p78-${stamp}`, base_price: 10000 }).select().single(), 'mulk A');
    const propertyB = must(await outsider.client.from('properties').insert({ tenant_id: tenantB, name: 'P78 B Villa', slug: `p78-b-${stamp}`, base_price: 9000 }).select().single(), 'mulk B');

    let r = await owner.client.from('message_templates').insert({ tenant_id: tenantA, name: 'Teklif takibi', channel: 'WHATSAPP', lifecycle_stage: 'LEAD_QUOTE_FOLLOW_UP', message_type: 'TRANSACTIONAL', body: 'Teklifiniz hazir.' }).select().single();
    check(!r.error && r.data.lifecycle_stage === 'LEAD_QUOTE_FOLLOW_UP', '1. Satis asamasi mesaj sablonu kaydedilir', errText(r.error));

    const rule = await owner.client.from('property_pricing_rule_settings').insert({ tenant_id: tenantA, property_id: propertyA.id, rule_key: 'weekend', enabled: true, pct: 20, parameters: { nights: [5, 6] } }).select().single();
    check(!rule.error, '2. Yonetim ev bazli fiyat kurali yazar', errText(rule.error));
    r = await sales.client.from('property_pricing_rule_settings').insert({ tenant_id: tenantA, property_id: propertyA.id, rule_key: 'demand', enabled: true, pct: 10 });
    check(denied(r.error), '3. Sales fiyat kurali yazamaz', errText(r.error) || 'YAZDI');
    for (const [actor, label, expected] of [[sales, 'sales', 1], [viewer, 'viewer', 1], [staff, 'staff', 0], [outsider, 'yabanci', 0]]) {
      const q = await actor.client.from('property_pricing_rule_settings').select('id').eq('tenant_id', tenantA);
      check((q.data || []).length === expected, `4. ${label} fiyat ayarinda ${expected ? 'izinli okuma yapar' : 'veri goremez'}`, errText(q.error) || `${(q.data || []).length} satir`);
    }
    r = await owner.client.from('property_pricing_rule_settings').insert({ tenant_id: tenantA, property_id: propertyB.id, rule_key: 'demand', enabled: true, pct: 10 });
    check(denied(r.error), '5. Baska kiracinin mulku A ayarina baglanamaz', errText(r.error) || 'BAGLANDI');

    const research = await owner.client.from('competitor_price_research').insert({ tenant_id: tenantA, property_id: propertyA.id, researched_on: todayInIstanbul, source_kind: 'OTA', source_url: 'https://example.com/listing', prices: [{ date: '2026-10-10', amount: 12000, currency: 'TRY' }], raw_note: 'Kullanici onayli dis kaynak notu' }).select().single();
    check(!research.error, '6. Tarihli ve linkli rakip arastirmasi kaydedilir', errText(research.error));
    r = await staff.client.from('competitor_price_research').select('id').eq('tenant_id', tenantA);
    check((r.data || []).length === 0, '7. Staff rakip arastirmasini goremez', errText(r.error) || `${(r.data || []).length} satir`);

    const template = await owner.client.from('expense_templates').insert({ tenant_id: tenantA, property_id: propertyA.id, name: 'Aylik internet', category: 'Internet', amount: 1500, expense_type: 'OPEX', description: 'Sabit gider' }).select().single();
    check(!template.error, '8. Yonetim gider sablonu olusturur', errText(template.error));
    for (const [actor, label, expected] of [[viewer, 'viewer', 1], [sales, 'sales', 0], [staff, 'staff', 0], [outsider, 'yabanci', 0]]) {
      const q = await actor.client.from('expense_templates').select('id').eq('tenant_id', tenantA);
      check((q.data || []).length === expected, `9. ${label} gider sablonunda ${expected ? 'defter okuma yetkisini kullanir' : 'veri goremez'}`, errText(q.error) || `${(q.data || []).length} satir`);
    }
    const sourceExpense = must(await owner.client.from('expenses').insert({ tenant_id: tenantA, property_id: propertyA.id, expense_date: '2026-09-01', category: 'Internet', amount: 1500, expense_type: 'OPEX' }).select().single(), 'kaynak gider');
    const generatedExpense = must(await owner.client.from('expenses').insert({ tenant_id: tenantA, property_id: propertyA.id, expense_date: '2026-10-01', category: 'Internet', amount: 1500, expense_type: 'OPEX' }).select().single(), 'uretilen gider');
    r = await owner.client.from('expense_template_occurrences').insert({ tenant_id: tenantA, template_id: template.data.id, source_expense_id: sourceExpense.id, generated_expense_id: generatedExpense.id, period_month: '2026-10-01' }).select().single();
    check(!r.error, '10. Kopyalanan gider kaynak sablon ve giderle izlenir', errText(r.error));
    r = await owner.client.from('expense_template_occurrences').insert({ tenant_id: tenantB, template_id: template.data.id, generated_expense_id: generatedExpense.id, period_month: '2026-11-01' });
    check(denied(r.error), '11. Gider kopya bagi kiracilar arasinda kurulamiyor', errText(r.error) || 'BAGLANDI');

    r = await owner.client.rpc('reset_tenant_data', { p_tenant_id: tenantA, p_confirm: 'VERILERI SIFIRLA' });
    const count = async table => {
      const result = await admin.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantA);
      if (result.error) throw new Error(`${table}: ${errText(result.error)}`);
      return result.count;
    };
    const [rulesLeft, researchLeft, templatesLeft, occurrencesLeft] = await Promise.all([
      count('property_pricing_rule_settings'), count('competitor_price_research'), count('expense_templates'), count('expense_template_occurrences')
    ]);
    check(!r.error && [rulesLeft, researchLeft, templatesLeft, occurrencesLeft].every(value => value === 0),
      '12. Isletme sifirlama A4 ayar, arastirma ve kopya baglarini temizler', errText(r.error) || JSON.stringify({ rulesLeft, researchLeft, templatesLeft, occurrencesLeft }));
  } catch (error) {
    no('Beklenmeyen hata', error.stack || error.message);
  } finally {
    for (const actor of clients) { try { await actor.client.auth.signOut(); } catch (_) {} }
    let cleanupFailed = false;
    for (const tenantId of tenants) {
      const { error } = await admin.from('tenants').delete().eq('id', tenantId);
      if (error) { cleanupFailed = true; console.error(`[FAIL] Tenant temizligi ${tenantId}: ${error.message}`); }
    }
    for (const userId of users) {
      const { data } = await admin.auth.admin.getUserById(userId);
      if (data?.user) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) { cleanupFailed = true; console.error(`[FAIL] Kullanici temizligi ${userId}: ${error.message}`); }
      }
    }
    if (cleanupFailed) failed++; else ok('Z. Test verileri temizlendi');
    console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    if (failed) process.exit(1);
  }
}

run();
