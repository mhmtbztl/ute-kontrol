/**
 * LEXBNB PHASE 53 — PERSONEL VERI SINIRI (CEVRIMDISI, KAYNAK TARAMASI)
 *
 * Canli davranisi core/phase53_staff_boundary_live_tests.js olcer. Bu suit
 * veritabani olmadan uc seyi tutar:
 *
 *   A. Govde korunumu: phase53 on dort fonksiyonu CREATE OR REPLACE ile
 *      yeniden tanimliyor. Govdeler test projesindeki guncel tanimdan
 *      kopyalandi; bir govde ESKI bir surumden (ornegin phase45 yerine phase38)
 *      alinsaydi uretimde sessizce geri alinmis bir duzeltme olurdu. Her
 *      govde, manifest sirasinda kendisinden onceki SON tanimla satir satir
 *      karsilastirilir; fark yalniz izin verilen rol satirlari olabilir.
 *   B. Politika sozlesmesi: hicbir yeni politika staff'a yol acmaz; hassas
 *      tablolar rol yardimcisiyla okunur; yardimcilar NULL tuzagina dusmez.
 *   C. phase41 kurallari: anon revoke, dogrulama blogu, schema_migrations.
 */

const fs = require('fs');
const path = require('path');

const SUPABASE = path.join(__dirname, '..', 'supabase');
const P53 = 'migration_phase53_staff_data_boundary.sql';

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

const read = f => fs.readFileSync(path.join(SUPABASE, f), 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');

function manifestFiles() {
  return read('migration_manifest.txt').split('\n')
    .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => l.split(/\s+/)[0]);
}

/** Dosyadaki `name` fonksiyonunun SON tanim govdesi (dolar tirnaklari arasi), yoksa null. */
function lastBody(sql, name) {
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${name}\\s*\\(`, 'gi');
  let m, body = null;
  while ((m = re.exec(sql))) {
    const rest = sql.slice(m.index);
    const as = rest.match(/\bAS\s+(\$[A-Za-z_]*\$)/);
    if (!as) continue;
    const start = as.index + as[0].length;
    const end = rest.indexOf(as[1], start);
    if (end < 0) continue;
    body = rest.slice(start, end);
  }
  return body;
}

const lines = body => body.split('\n').map(l => l.trim()).filter(Boolean);
function multisetDiff(a, b) {
  const count = new Map();
  for (const l of b) count.set(l, (count.get(l) || 0) + 1);
  const out = [];
  for (const l of a) {
    const n = count.get(l) || 0;
    if (n > 0) count.set(l, n - 1); else out.push(l);
  }
  return out;
}

const FUNCTIONS = [
  'create_booking_atomic', 'update_booking_atomic', 'convert_lead_to_booking_atomic',
  'upsert_booking_guest_atomic', 'accept_extension_offer_atomic', 'resolve_maintenance_ticket_atomic',
  'record_manual_channel_snapshot', 'compute_month_close_snapshot', 'get_executive_dashboard_snapshot',
  'create_tenant_invitation', 'get_tenant_members', 'accept_booking_quote_atomic',
  'save_manual_pricing_override_atomic', 'guard_pricing_write_authorization'
];

// Eklenen satir yalniz bunlardan biri olabilir.
const ALLOWED_ADDED = [
  /'sales'/, /phase53/, /public\.can_(read_ledger|read_sales|write_sales|manage_tenant)\(p_tenant_id\)/,
  /^RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis\.' USING ERRCODE = '28000';$/,
  /^RAISE EXCEPTION 'FORBIDDEN_ROLE: /, /^IF auth\.uid\(\) IS NULL THEN$/, /^END IF;$/,
  /^-- /, /^IF v_user_role IS NULL OR v_user_role NOT IN \('owner', 'admin', 'manager'\) THEN$/,
  /NOT IN \('owner', 'admin', 'manager'\) THEN$/
];
// Silinen satir yalniz staff'li rol listesi, uyelik kapisi ya da eski yorum olabilir.
const ALLOWED_REMOVED = [/'staff'/, /is_tenant_member\(p_tenant_id\)/, /^-- Aligned with LexBnB RLS Policy/];

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 53 — PERSONEL VERI SINIRI (KAYNAK)');
  console.log('=============================================================================\n');

  const files = manifestFiles();
  const idx = files.indexOf(P53);
  check(idx > files.indexOf('migration_phase51_booking_delete_reopens_lead.sql') && idx > files.indexOf('migration_phase45_cleaning_cost_contract.sql')
    && idx > files.indexOf('migration_phase44_pricing_late_deploy_hardening.sql'),
    '0. phase53 manifestte phase44/45/51\'den sonra', `index=${idx}`);
  const sql = read(P53);

  console.log('\n--- A. GOVDE KORUNUMU ---');
  const prior = ['schema.sql', ...files.slice(0, idx)];
  for (const fn of FUNCTIONS) {
    let oldBody = null, from = null;
    for (const f of prior) {
      if (!fs.existsSync(path.join(SUPABASE, f))) continue;
      const b = lastBody(read(f), fn);
      if (b !== null) { oldBody = b; from = f; }
    }
    const newBody = lastBody(sql, fn);
    if (!oldBody || !newBody) { no(`A. ${fn} govdesi bulunamadi`, `eski=${!!oldBody} yeni=${!!newBody}`); continue; }
    const added = multisetDiff(lines(newBody), lines(oldBody)).filter(l => !ALLOWED_ADDED.some(r => r.test(l)));
    const removed = multisetDiff(lines(oldBody), lines(newBody)).filter(l => !ALLOWED_REMOVED.some(r => r.test(l)));
    check(added.length === 0 && removed.length === 0,
      `A. ${fn} son tanimla (${from}) birebir; yalniz rol satirlari degisti`,
      `izinsiz eklenen: ${JSON.stringify(added.slice(0, 3))} izinsiz silinen: ${JSON.stringify(removed.slice(0, 3))}`);
  }

  console.log('\n--- B. POLITIKA SOZLESMESI ---');
  const policies = [...sql.matchAll(/CREATE POLICY[\s\S]*?;/g)].map(m => m[0]);
  const staffPolicies = policies.filter(p => /'staff'/.test(p) && !/ON public\.tenant_members/.test(p));
  check(policies.length > 60 && staffPolicies.length === 0, 'B1. Hicbir yeni politika staff\'a yol acmiyor (ekip ekleme listesi haric)',
    `${policies.length} politika, staff: ${staffPolicies.map(p => p.split('\n')[0]).join(' | ')}`);
  const memberOnly = policies.filter(p => /USING \(public\.is_tenant_member\(tenant_id\)\)/.test(p));
  check(memberOnly.length === 0, 'B2. Hicbir yeni politika yalniz uyelikle okutmuyor', memberOnly.map(p => p.split('\n')[0]).join(' | '));
  for (const [table, fn] of [['bookings', 'can_read_sales'], ['leads', 'can_read_sales'], ['guests', 'can_read_sales'], ['properties', 'can_read_sales'],
    ['expenses', 'can_read_ledger'], ['cleaning_tasks', 'can_read_ledger'], ['monthly_targets', 'can_read_ledger'],
    ['financial_transactions', 'can_read_ledger'], ['monthly_financial_closes', 'can_read_ledger']]) {
    const sel = policies.find(p => new RegExp(`ON public\\.${table} FOR SELECT`).test(p));
    check(!!sel && sel.includes(`public.${fn}(tenant_id)`), `B3. ${table} okumasi ${fn}`, sel || 'SELECT politikasi yok');
  }
  check(/FROM public\.tenant_members tm[\s\S]{0,120}tm\.user_id = auth\.uid\(\)[\s\S]{0,40}\), FALSE\)/.test(sql)
    && /COALESCE\(\(/.test(sql), 'B4. fn_has_tenant_role uye olmayana FALSE doner (NULL NOT IN tuzagi yok)', 'COALESCE(..., FALSE) yok');
  check(!/DROP POLICY IF EXISTS "Staff manage targets"[\s\S]*CREATE POLICY monthly_targets_(insert|update|delete)[^;]*'staff'/.test(sql)
    && /CREATE POLICY monthly_targets_update[^;]*can_manage_tenant/.test(sql), 'B5. aylik hedef yazmasi yonetim rollerine (phase8 staff yazmasi kapandi)', 'monthly_targets_update yok');
  check(/CREATE POLICY cleaning_tasks_update[^;]*can_manage_tenant\(tenant_id\)\) WITH CHECK \(public\.can_manage_tenant/.test(sql),
    'B6. temizlik tutari/odendi yalniz yonetim tarafindan guncellenir', 'cleaning_tasks_update yok');
  check(/CHECK \(role IN \('owner', 'admin', 'manager', 'sales', 'staff', 'viewer'\)\)/.test(sql)
    && /CHECK \(role IN \('admin', 'manager', 'sales', 'staff', 'viewer'\)\)/.test(sql), 'B7. sales rolu uyelik ve davet kisitinda', 'CHECK yok');

  console.log('\n--- C. PHASE41 KURALLARI ---');
  const redefined = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map(m => m[1]);
  const notRevoked = redefined.filter(fn => !new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM (PUBLIC, )?anon`).test(sql));
  check(redefined.length >= 19 && notRevoked.length === 0, 'C1. Her (yeniden) tanimlanan fonksiyonda anon revoke', notRevoked.join(', '));
  const quoteAuth = sql.indexOf('can_write_sales(p_tenant_id)', sql.indexOf('FUNCTION public.accept_booking_quote_atomic'));
  const quoteLookup = sql.indexOf('FROM public.booking_quotes', sql.indexOf('FUNCTION public.accept_booking_quote_atomic'));
  check(quoteAuth > 0 && quoteAuth < quoteLookup, 'C2. teklif kabulunde yetki kayit aramadan ONCE', `${quoteAuth} / ${quoteLookup}`);
  check(/DO \$verify\$[\s\S]*RAISE EXCEPTION 'PHASE53_[\s\S]*PHASE 53 OK/.test(sql), 'C3. Kendi dogrulama blogu var', 'yok');
  check(/INSERT INTO public\.schema_migrations\(version, name\)\s*VALUES \(53, 'phase53_staff_data_boundary'\)/.test(sql)
    && /COMMIT;\s*$/.test(sql), 'C4. schema_migrations kaydi ve tek transaction', 'yok');

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

run();
