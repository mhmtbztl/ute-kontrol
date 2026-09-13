/**
 * PAZARLAMA FONKSIYONLARI — anon YETKI AGI
 *
 * Supabase, public semasindaki her yeni fonksiyona varsayilan olarak `anon`
 * rolune EXECUTE verir ve `REVOKE ALL ... FROM PUBLIC` bunu KALDIRMAZ
 * (CLAUDE.md bolum 7). Phase 17 goclerinin 15'i de anon'u revoke etmeyi
 * atladi; uretimde kimligi dogrulanmamis bir cagri review_marketing_finding
 * govdesine kadar girebiliyordu.
 *
 * Bu suit iki kati birden olcer:
 *   1. anon hicbir pazarlama fonksiyonunu calistiramamali (phase22 goctu),
 *   2. her SECURITY DEFINER fonksiyonun govdesinde kendi yetki kontrolu olmali
 *      (derinlemesine savunma — birinci kat bir gun yine unutulursa).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SUPABASE_DIR = path.join(__dirname, '..', 'supabase');
const PHASE22 = path.join(SUPABASE_DIR, 'migration_phase22_marketing_anon_revoke.sql');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    console.error(`  ${error.message}`);
  }
}

function phase17Files() {
  return fs.readdirSync(SUPABASE_DIR)
    .filter(file => /^migration_phase17_.*\.sql$/.test(file))
    .sort();
}

/** Phase 17 goclerinde tanimlanan her fonksiyonu adi + SECURITY DEFINER bilgisiyle dondurur. */
function phase17Functions() {
  const found = new Map();
  for (const file of phase17Files()) {
    const source = fs.readFileSync(path.join(SUPABASE_DIR, file), 'utf8');
    const re = /CREATE OR REPLACE FUNCTION\s+public\.([a-z0-9_]+)\s*\(/gi;
    let match;
    while ((match = re.exec(source))) {
      const name = match[1];
      const bodyStart = source.indexOf('AS $$', match.index);
      if (bodyStart < 0) continue;
      const bodyEnd = source.indexOf('$$;', bodyStart + 5);
      const body = source.slice(bodyStart, bodyEnd < 0 ? source.length : bodyEnd);
      const header = source.slice(match.index, bodyStart);
      const previous = found.get(name);
      found.set(name, {
        name,
        file: previous ? previous.file : file,
        securityDefiner: /SECURITY\s+DEFINER/i.test(header),
        returnsTrigger: /RETURNS\s+TRIGGER/i.test(header),
        body: previous ? previous.body + body : body
      });
    }
  }
  return [...found.values()];
}

runTest('Phase 22 anon revoke migration exists', () => {
  assert.ok(fs.existsSync(PHASE22), 'supabase/migration_phase22_marketing_anon_revoke.sql bulunamadi');
});

runTest('Every phase 17 function is revoked from anon by name', () => {
  const sql = fs.readFileSync(PHASE22, 'utf8');
  const functions = phase17Functions();
  assert.ok(functions.length >= 15, `Phase 17 fonksiyonlari bulunamadi (${functions.length})`);
  const missing = functions.filter(fn => !sql.includes(`public.${fn.name}(`)).map(fn => fn.name);
  assert.deepStrictEqual(missing, [], `phase22'de eksik fonksiyonlar: ${missing.join(', ')}`);
});

runTest('Revoke targets anon explicitly, not only PUBLIC', () => {
  const sql = fs.readFileSync(PHASE22, 'utf8');
  assert.match(sql, /REVOKE ALL ON FUNCTION %s FROM anon/i,
    'anon acikca revoke edilmeli — FROM PUBLIC tek basina yetmez');
  assert.match(sql, /REVOKE ALL ON FUNCTION %s FROM PUBLIC/i,
    'PUBLIC revoke da korunmali');
});

runTest('Migration verifies anon lost execute and authenticated kept it', () => {
  const sql = fs.readFileSync(PHASE22, 'utf8');
  assert.match(sql, /has_function_privilege\('anon'/,
    'Dogrulama blogu anon yetkisini olcmeli');
  assert.match(sql, /has_function_privilege\('authenticated'/,
    'Dogrulama blogu authenticated erisiminin korundugunu olcmeli');
  assert.match(sql, /RAISE EXCEPTION 'PHASE22_ANON_STILL_EXECUTABLE/,
    'anon hala calistirabiliyorsa goc durmali');
  assert.match(sql, /RAISE EXCEPTION 'PHASE22_AUTHENTICATED_ACCESS_LOST/,
    'Kullanici erisimi kaybolduysa goc durmali');
});

runTest('User-facing marketing RPCs keep an explicit authenticated grant', () => {
  const sql = fs.readFileSync(PHASE22, 'utf8');
  ['review_marketing_finding', 'save_property_channel_listing', 'request_photo_analysis',
   'record_manual_channel_snapshot', 'record_property_marketing_benchmark',
   'change_channel_cover_and_measure'].forEach(name => {
    const re = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\(`);
    assert.match(sql, re, `${name} icin authenticated grant yeniden verilmeli`);
  });
});

runTest('Worker-only RPCs are not granted to authenticated', () => {
  const sql = fs.readFileSync(PHASE22, 'utf8');
  ['claim_photo_analysis_run', 'complete_photo_analysis_run', 'fail_photo_analysis_run',
   'claim_listing_change_experiment', 'complete_listing_change_experiment',
   'fail_listing_change_experiment', 'upsert_marketing_finding',
   'persist_property_marketing_health_snapshot'].forEach(name => {
    const re = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\(`);
    assert.ok(!re.test(sql), `${name} worker fonksiyonu; authenticated'a acilmamali`);
  });
});

runTest('Every SECURITY DEFINER marketing function guards itself', () => {
  const unguarded = phase17Functions()
    .filter(fn => fn.securityDefiner && !fn.returnsTrigger)
    .filter(fn => !/auth\.uid\(\)|get_tenant_role|is_tenant_member|SERVICE_ROLE_REQUIRED/i.test(fn.body))
    .map(fn => `${fn.name} (${fn.file})`);
  assert.deepStrictEqual(unguarded, [],
    `Govdesinde yetki kontrolu olmayan SECURITY DEFINER fonksiyon: ${unguarded.join(', ')}`);
});

runTest('Marketing RPCs never publish to an OTA automatically', () => {
  const offenders = [];
  for (const file of phase17Files()) {
    const source = fs.readFileSync(path.join(SUPABASE_DIR, file), 'utf8');
    if (/\bhttp_post\b|\bnet\.http_|\bpg_net\b/i.test(source)) offenders.push(file);
  }
  assert.deepStrictEqual(offenders, [],
    `Goc dosyasi dis servise cagri yapiyor: ${offenders.join(', ')}`);
});

console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
if (passedTests !== totalTests) process.exit(1);
