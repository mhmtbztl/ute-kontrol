/**
 * LEXBNB PHASE 57 — REZERVASYON ODEME DEFTERI (CEVRIMDISI, KAYNAK TARAMASI)
 *
 * Canli davranisi core/phase57_booking_payments_live_tests.js olcer. Bu suit
 * sozlesmeyi veritabani olmadan tutar ve ILERIYE DONUKTUR:
 *
 *   A. Odeme ciroya girmez: manifest sirasinda ciroyu hesaplayan sunucu
 *      fonksiyonlarinin SON tanimi booking_payments'i okumaz. Gelecekteki bir
 *      goc tahsilati ciroya karistirirsa (tahakkuk yerine nakit) burada kirilir.
 *   B. Kalan saklanmaz: bookings'e sutun yok, kalan yalniz gorunumde.
 *   C. Kapanmis donem odeme tarihine gore; sifirlama/isletme silme istisnasi;
 *      odemesi olan rezervasyon silinmez; silme yalniz yonetim.
 */

const fs = require('fs');
const path = require('path');

const SUPABASE = path.join(__dirname, '..', 'supabase');
let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);
const read = f => fs.readFileSync(path.join(SUPABASE, f), 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const manifest = () => read('migration_manifest.txt').split('\n').map(l => l.trim())
  .filter(l => l && !l.startsWith('#')).map(l => l.split(/\s+/)[0]);

function lastBody(name) {
  let body = null, from = null;
  for (const f of ['schema.sql', ...manifest()]) {
    if (!fs.existsSync(path.join(SUPABASE, f))) continue;
    const sql = read(f);
    const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${name}\\s*\\(`, 'gi');
    let m;
    while ((m = re.exec(sql))) {
      const rest = sql.slice(m.index);
      const as = rest.match(/\bAS\s+(\$[A-Za-z_]*\$)/);
      if (!as) continue;
      const start = as.index + as[0].length, end = rest.indexOf(as[1], start);
      if (end > 0) { body = rest.slice(start, end); from = f; }
    }
  }
  return { body, from };
}

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 57 — REZERVASYON ODEME DEFTERI (KAYNAK)');
  console.log('=============================================================================\n');
  const files = manifest();
  check(files.indexOf('migration_phase57_booking_payments.sql') > files.indexOf('migration_phase53_staff_data_boundary.sql')
    && files.indexOf('migration_phase53_staff_data_boundary.sql') >= 0, '0. phase57 manifestte phase53\'ten sonra', 'sira yanlis');
  const sql = read('migration_phase57_booking_payments.sql');

  console.log('\n--- A. ODEME CIROYA GIRMEZ (ileriye donuk) ---');
  for (const fn of ['compute_month_close_snapshot', 'get_executive_dashboard_snapshot', 'close_monthly_period_atomic']) {
    const { body, from } = lastBody(fn);
    check(!!body && !/booking_payments/.test(body), `A. ${fn} (${from}) odeme defterini okumaz`, body ? 'booking_payments okuyor' : 'govde yok');
  }

  console.log('\n--- B. KALAN SAKLANMAZ ---');
  check(!/ALTER TABLE public\.bookings/i.test(sql), 'B1. bookings tablosuna sutun eklenmedi (§3.4)', 'ALTER TABLE bookings var');
  check(/CREATE VIEW public\.booking_payment_balances\s+WITH \(security_invoker = true\)/.test(sql)
    && /\(b\.gross_amount - b\.discount\) - COALESCE\(p\.paid_total, 0\) AS remaining/.test(sql),
    'B2. Kalan = (brut - indirim) - odemeler, cagiranin RLS\'iyle hesaplanan gorunum', 'gorunum yok');
  check(/amount\s+NUMERIC\(12,2\) NOT NULL CHECK \(amount > 0\)/.test(sql) && /kind IN \('DEPOSIT', 'INTERIM', 'BALANCE'\)/.test(sql),
    'B3. Tutar > 0; tur kapora / ara / kalan', 'kisit yok');

  console.log('\n--- C. KORUMALAR ---');
  const guard = (sql.match(/FUNCTION public\.guard_booking_payment\(\)[\s\S]*?\$\$;/) || [''])[0];
  check(/fn_range_touches_closed_period\(OLD\.tenant_id, OLD\.paid_on, OLD\.paid_on\)/.test(guard)
    && /fn_range_touches_closed_period\(NEW\.tenant_id, NEW\.paid_on, NEW\.paid_on\)/.test(guard),
    'C1. Kapanmis donem odeme tarihine (paid_on) gore, eski ve yeni satir', 'paid_on korumasi yok');
  check(/fn_tenant_reset_in_progress\(\)/.test(guard) && /fn_tenant_is_being_deleted\(OLD\.tenant_id\)/.test(guard),
    'C2. Sifirlama ve isletme silme istisnasi (CLAUDE.md 3.7)', 'istisna yok');
  const del = (sql.match(/FUNCTION public\.guard_booking_delete_with_payments\(\)[\s\S]*?\$\$;/) || [''])[0];
  check(/BOOKING_HAS_PAYMENTS/.test(del) && /fn_tenant_reset_in_progress\(\) OR public\.fn_tenant_is_being_deleted/.test(del)
    && /BEFORE DELETE ON public\.bookings/.test(sql), 'C3. Odemesi olan rezervasyon silinmez; sifirlama/isletme silme haric', 'tetikleyici yok');
  check(/booking_payments_delete ON public\.booking_payments FOR DELETE TO authenticated\s+USING \(public\.can_manage_tenant\(tenant_id\)\)/.test(sql)
    && /booking_payments_select[^;]*can_read_sales/.test(sql), 'C4. Okuma satis rolleri, silme yalniz yonetim', 'politika yok');

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

run();
