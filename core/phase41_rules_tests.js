/**
 * LEXBNB PHASE 41 — GOC KURALLARI (CEVRIMDISI, KAYNAK TARAMASI)
 *
 * Canli davranisi core/phase41_authz_live_tests.js olcer. Bu suit iki seyi
 * CI'da, veritabani olmadan tutar:
 *
 *   A. phase41'in kaynak sozlesmesi: yetki kalıplari dosyada duruyor mu.
 *   B. ILERIYE DONUK KURAL: phase41'den sonra manifest'e giren her goc,
 *      tenant_id sutunu olan bir tablo aciyorsa
 *        - trg_tenant_id_immutable tetikleyicisini kurmali,
 *        - anon yetkisini geri almali,
 *      ve her goc kendini schema_migrations defterine yazmali.
 *
 * B'nin sebebi: phase24 tetikleyiciyi yalniz o an var olan tablolara kurdu;
 * sonraki on iki tablo ciplak kaldi ve kimse fark etmedi. Kural bir belgede
 * durdugu surece ayni sey tekrar olur. Burada durdugu surece olmaz.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SUPABASE = path.join(ROOT, 'supabase');
const PHASE41 = 'migration_phase41_role_authz_hardening.sql';

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

const read = f => fs.readFileSync(path.join(SUPABASE, f), 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const stripComments = sql => sql.replace(/--[^\n]*/g, '');

function manifestFiles() {
  return read('migration_manifest.txt').split('\n')
    .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => l.split(/\s+/)[0]);
}

/** tenant_id sutunu olan CREATE TABLE ifadelerinin tablo adlari. */
function tenantTablesCreated(sql) {
  const code = stripComments(sql);
  const names = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)\s*\(/gi;
  let m;
  while ((m = re.exec(code))) {
    // Govde: acilan parantezin kapandigi yere kadar.
    let depth = 1, i = re.lastIndex;
    for (; i < code.length && depth > 0; i++) {
      if (code[i] === '(') depth++;
      else if (code[i] === ')') depth--;
    }
    const body = code.slice(re.lastIndex, i);
    if (/(^|[\s,(])tenant_id\s+UUID/i.test(body)) names.push(m[1].replace(/"/g, ''));
  }
  return names;
}

/** Ileriye donuk kural: bir goc metnindeki ihlaller. */
function forwardRuleViolations(file, sql) {
  const out = [];
  const code = stripComments(sql);
  const tables = tenantTablesCreated(sql);
  if (tables.length) {
    if (!/trg_tenant_id_immutable/.test(code)) {
      out.push(`${file}: tenant_id tablosu aciyor (${tables.join(', ')}) ama trg_tenant_id_immutable kurmuyor`);
    }
    if (!/REVOKE[^;]*FROM[^;]*\banon\b/i.test(code)) {
      out.push(`${file}: tablo aciyor ama anon yetkisini geri almiyor`);
    }
  }
  if (!/INSERT\s+INTO\s+public\.schema_migrations/i.test(code)) {
    out.push(`${file}: kendini schema_migrations defterine yazmiyor`);
  }
  return out;
}

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 41 — GOC KURALLARI (CEVRIMDISI)');
  console.log('=============================================================================\n');

  const files = manifestFiles();
  const i41 = files.indexOf(PHASE41);
  check(i41 !== -1, '1. phase41 manifest\'te kayitli', 'migration_manifest.txt icinde yok');
  check(i41 > files.indexOf('migration_phase39_notification_rowcount.sql'),
    '2. phase41 phase39\'dan SONRA uygulanir (bildirim RPC\'lerini yeniden tanimliyor)', `sira: ${i41}`);
  if (i41 === -1) return finish();

  const sql = read(PHASE41);
  const code = stripComments(sql);

  console.log('\n--- A. phase41 kaynak sozlesmesi ---');
  for (const fn of ['claim_scheduled_messages_atomic', 'record_message_delivery_result_atomic']) {
    const body = code.slice(code.indexOf(`FUNCTION public.${fn}(`));
    check(body.indexOf('SERVICE_ROLE_REQUIRED') !== -1 && body.indexOf('SERVICE_ROLE_REQUIRED') < body.indexOf('$$;'),
      `A1. ${fn} govdesi service_role kapisiyla basliyor`, 'SERVICE_ROLE_REQUIRED yok');
    check(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM authenticated`).test(code),
      `A2. ${fn} authenticated rolunden geri alindi`, 'REVOKE ... FROM authenticated yok');
  }

  const fnCount = (code.match(/CREATE OR REPLACE FUNCTION public\.(\w+)/g) || []).map(s => s.split('.')[1]);
  const missingAnon = fnCount.filter(fn => !new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM anon`).test(code));
  check(fnCount.length >= 7 && missingAnon.length === 0,
    `A3. Yeniden tanimlanan ${fnCount.length} fonksiyonun hepsinde anon ayrica geri aliniyor (CLAUDE.md 7)`,
    'eksik: ' + missingAnon.join(', '));

  // NULL NOT IN korumayi sessizce atlar (CLAUDE.md 7).
  const ciplak = code.match(/(?<!COALESCE\()public\.get_tenant_role\([^)]*\)\s+NOT\s+IN/gi) || [];
  check(ciplak.length === 0, 'A4. get_tenant_role(...) NOT IN kalibi COALESCE olmadan kullanilmiyor', ciplak.join(' | '));

  const accept = code.slice(code.indexOf('FUNCTION public.accept_extension_offer_atomic('));
  check(accept.indexOf('UNAUTHORIZED_EXTENSION_ACCEPT') !== -1 &&
        accept.indexOf('UNAUTHORIZED_EXTENSION_ACCEPT') < accept.indexOf('FOR UPDATE'),
    'A5. Teklif kabulunde yetki, satir kilidinden ONCE', 'sira bozuk');

  check(!/FOR\s+ALL/i.test(code), 'A6. phase41 hicbir FOR ALL politikasi acmiyor', 'FOR ALL bulundu');
  check(/REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon/.test(code) &&
        /ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon/.test(code),
    'A7. anon tablo yetkisi hem mevcut hem gelecek tablolar icin geri aliniyor', 'REVOKE / DEFAULT PRIVILEGES eksik');
  check(/ALTER TABLE public\.schema_migrations ENABLE ROW LEVEL SECURITY/.test(code),
    'A8. schema_migrations RLS aciliyor', 'yok');

  const ct = code.slice(code.indexOf('FUNCTION public.create_tenant_and_owner('));
  check(ct.indexOf('MEMBERSHIP_EXISTS') !== -1 && ct.indexOf('MEMBERSHIP_EXISTS') < ct.indexOf('INSERT INTO public.tenants'),
    'A9. Ikinci isletme kapisi tenant INSERT\'inden ONCE', 'sira bozuk');
  check(/RAISE EXCEPTION 'PHASE41_TENANT_ID_TRIGGER_MISSING/.test(code),
    'A10. Dogrulama blogu eksik tetikleyicide duruyor', 'yok');
  check(forwardRuleViolations(PHASE41, sql).length === 0, 'A11. phase41 kendi kuralina uyuyor',
    forwardRuleViolations(PHASE41, sql).join(' | '));

  console.log('\n--- B. Ileriye donuk kural (phase41 sonrasi gocler) ---');
  // Kuralin kendisi calisiyor mu: bilinen iyi ve kotu ornekler.
  const kotu = 'CREATE TABLE IF NOT EXISTS public.x (\n  id UUID,\n  tenant_id UUID NOT NULL REFERENCES public.tenants(id)\n);';
  const iyi = kotu + '\nREVOKE ALL ON public.x FROM anon;\nCREATE TRIGGER trg_tenant_id_immutable BEFORE UPDATE OF tenant_id ON public.x FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable();\nINSERT INTO public.schema_migrations(version, name) VALUES (99, \'x\');';
  const yorumdaKalan = kotu + '\n-- trg_tenant_id_immutable sonra kurulacak\n-- REVOKE ALL ON public.x FROM anon;\nINSERT INTO public.schema_migrations(version, name) VALUES (99, \'x\');';
  check(forwardRuleViolations('kotu.sql', kotu).length === 3, 'B1. Kural tetikleyicisiz/revoke\'suz/defteri yazmayan gocu yakaliyor',
    JSON.stringify(forwardRuleViolations('kotu.sql', kotu)));
  check(forwardRuleViolations('iyi.sql', iyi).length === 0, 'B2. Kural uyan gocu gecirir', JSON.stringify(forwardRuleViolations('iyi.sql', iyi)));
  check(forwardRuleViolations('yorum.sql', yorumdaKalan).length === 2, 'B3. Yorum satirindaki tetikleyici sayilmaz',
    JSON.stringify(forwardRuleViolations('yorum.sql', yorumdaKalan)));

  const sonraki = files.slice(i41 + 1);
  const ihlal = sonraki.flatMap(f => forwardRuleViolations(f, read(f)));
  check(ihlal.length === 0, `B4. phase41 sonrasi ${sonraki.length} goc kurala uyuyor`, ihlal.join('\n       '));

  finish();
}

function finish() {
  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

module.exports = { tenantTablesCreated, forwardRuleViolations };

if (require.main === module) run();
