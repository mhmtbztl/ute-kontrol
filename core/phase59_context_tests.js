/**
 * LEXBNB PHASE 59 (+65, +67) — MULK, TALEP VE MISAFIR BAGLAMI (CEVRIMDISI)
 *
 * Canli davranisi core/phase59_context_live_tests.js olcer. Bu suit:
 *
 *   A. ILERIYE DONUK KURAL — PL/pgSQL AND kisa devre yapmaz. Tabloya gore
 *      dallanan tetikleyicide `TG_TABLE_NAME = 'x' AND NEW.alan ...` diger
 *      tablolarda olmayan alana erisip duser (42703). phase59 bu yuzden hizli
 *      kaydi tamamen kirdi; canli suit yakaladi, phase65 duzeltti. Manifest
 *      sirasinda HER fonksiyonun son govdesi taranir.
 *   B. Dagitim tuzagi: leads ve properties'e sutun yok; yeni alanlar yan
 *      tablolarda. Kara/beyaz liste yalniz yonetimde.
 *   C. Hizli kayit: yetki kayit aramadan once, kaynak zorunlu, telefon kilidi.
 *   D. Sifirlama: phase43 govdesi korunur, yalniz iki defter eklenir; kaynak
 *      katalogu (ayar) silinmez.
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

/** Manifest sirasinda her fonksiyonun son govdesi: { ad: { body, from } } */
function lastBodies(files) {
  const out = {};
  for (const f of files) {
    if (!fs.existsSync(path.join(SUPABASE, f))) continue;
    const sql = read(f);
    const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi;
    let m;
    while ((m = re.exec(sql))) {
      const rest = sql.slice(m.index);
      const as = rest.match(/\bAS\s+(\$[A-Za-z_]*\$)/);
      if (!as) continue;
      const start = as.index + as[0].length, end = rest.indexOf(as[1], start);
      if (end > 0) out[m[1].toLowerCase()] = { body: rest.slice(start, end), from: f };
    }
  }
  return out;
}

const ANTI = /TG_TABLE_NAME\s*(=\s*'[a-z_]+'|IN\s*\([^)]*\))\s+AND\b/i;

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 59 — MULK, TALEP VE MISAFIR BAGLAMI (KAYNAK)');
  console.log('=============================================================================\n');
  const files = manifest();
  const idx = n => files.indexOf(n);
  check(idx('migration_phase59_property_lead_guest_context.sql') > idx('migration_phase53_staff_data_boundary.sql')
    && idx('migration_phase65_phase59_link_guard_fix.sql') === idx('migration_phase59_property_lead_guest_context.sql') + 1
    && idx('migration_phase67_system_source_restore_exemption.sql') === idx('migration_phase65_phase59_link_guard_fix.sql') + 1,
    '0. Manifest: 53 ... 59 -> 65 -> 67 (duzeltmeler hemen arkasinda)', 'sira yanlis');

  console.log('\n--- A. PL/pgSQL KISA DEVRE ANTI-DESENI (tum goclerde) ---');
  const bodies = lastBodies(['schema.sql', ...files]);
  const kotu = Object.entries(bodies).filter(([, v]) => ANTI.test(v.body)).map(([k, v]) => `${k} (${v.from})`);
  check(Object.keys(bodies).length > 100 && kotu.length === 0,
    `A1. ${Object.keys(bodies).length} fonksiyonun son govdesinde "TG_TABLE_NAME = 'x' AND ..." yok`, kotu.join(', '));
  const oncekiP59 = lastBodies(['schema.sql', ...files.slice(0, idx('migration_phase65_phase59_link_guard_fix.sql'))]);
  check(ANTI.test((oncekiP59.guard_phase59_links || {}).body || ''), 'A2. Kural phase65 oncesi govdeyi yakaliyor (kirilma kaniti)', 'eski govde temiz gorundu');

  const p59 = read('migration_phase59_property_lead_guest_context.sql');
  console.log('\n--- B. DAGITIM TUZAGI VE GIZLILIK ---');
  check(!/ALTER TABLE public\.(leads|properties)\b/i.test(p59), 'B1. leads ve properties\'e sutun eklenmedi (yan tablolar)', 'ALTER TABLE var');
  check(/ALTER TABLE public\.property_analysis_context/.test(p59) && /ALTER TABLE public\.guests\s+ADD COLUMN birth_date/.test(p59),
    'B2. Konum phase40 yan tablosunda, dogum gunu guests\'te', 'yer yanlis');
  const cls = [...p59.matchAll(/CREATE POLICY guest_private_classifications_\w+[\s\S]*?;/g)].map(m => m[0]);
  check(cls.length === 4 && cls.every(p => /can_manage_tenant\(tenant_id\)/.test(p) && !/can_read_(ledger|sales)|can_write_sales/.test(p)),
    'B3. Kara/beyaz liste dort islemde de yalniz yonetim', cls.map(p => p.split('\n')[0]).join(' | '));
  check(/CONSTRAINT lead_source_catalog_unknown_is_system CHECK \(\(code = 'UNKNOWN'\) = is_system\)/.test(p59)
    && /SYSTEM_SOURCE_LOCKED/.test(p59), 'B4. "Bilinmiyor" sistem kaynagi ve kilidi', 'yok');
  check(!/channel/i.test((p59.match(/INSERT INTO public\.lead_source_catalog \(tenant_id, code, label, is_system, sort_order\)\s+SELECT[\s\S]*?;/) || [''])[0]),
    'B5. Eski talepler channel\'dan tahmin edilmez (geri doldurma yok)', 'channel kullaniliyor');

  console.log('\n--- C. HIZLI KAYIT ---');
  const qc = (bodies.quick_capture_lead || {}).body || '';
  const auth = qc.indexOf('can_write_sales(p_tenant_id)'), look = qc.indexOf('FROM public.leads');
  check(auth > 0 && auth < look, 'C1. Yetki kayit aramadan ONCE', `${auth} / ${look}`);
  check(/SOURCE_REQUIRED/.test(qc) && /pg_advisory_xact_lock/.test(qc) && /fn_normalize_phone\(guest_phone\) = v_phone/.test(qc),
    'C2. Kaynak zorunlu, telefon kilidi, normalize anahtar', 'eksik');
  check(/status IN \('NEW', 'CONTACTED', 'QUOTE_SENT', 'FOLLOW_UP'\)/.test(qc), 'C3. Yalniz ACIK talebe eklenir (kapanmis talep yeniden acilmaz)', 'durum filtresi yok');
  check(/IF v_guest_id IS NOT NULL AND public\.can_manage_tenant\(p_tenant_id\) THEN/.test(qc), 'C4. Siniflandirma yalniz yonetime dondurulur', 'kapi yok');

  console.log('\n--- D. SIFIRLAMA ---');
  const reset = (bodies.reset_tenant_data || {});
  check(reset.from === 'migration_phase59_property_lead_guest_context.sql' && /'lead_interest_daily'/.test(reset.body)
    && /'property_owners'/.test(reset.body) && !/'lead_source_catalog'/.test(reset.body),
    'D1. Son sifirlama tanimi iki defteri siler, kaynak katalogunu (ayar) korur', `${reset.from}`);
  const p43 = lastBodies(['schema.sql', ...files.slice(0, idx('migration_phase59_property_lead_guest_context.sql'))]).reset_tenant_data || {};
  const lines = b => b.split('\n').map(l => l.trim()).filter(Boolean);
  const eklenen = lines(reset.body || '').filter(l => !lines(p43.body || '').includes(l));
  const silinen = lines(p43.body || '').filter(l => !lines(reset.body || '').includes(l));
  check(p43.from === 'migration_phase43_period_reset_integrity.sql'
    && eklenen.every(l => /lead_interest_daily|property_owners|^-- phase59/.test(l))
    && silinen.every(l => /'property_operator_notes',$/.test(l)),
    'D2. Govde phase43 ile ayni; yalniz iki tablo eklendi', `eklenen ${JSON.stringify(eklenen)} silinen ${JSON.stringify(silinen)}`);

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

run();
