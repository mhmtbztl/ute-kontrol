/**
 * LEXBNB PHASE 55 (+63) — OPERASYON INSANLARI VE IKI IMZALI TEMIZLIK (CEVRIMDISI)
 *
 * Canli davranisi core/phase55_operations_execution_live_tests.js olcer. Bu
 * suit veritabani olmadan sozlesmeyi tutar:
 *
 *   A. Z/M ve gider: Z imzasi cleaning_tasks'a dokunmaz; gideri yalniz M onayi
 *      (DONE) dogurur ve tamamlanma ani Z imzasinin anidir; ay kapanisi
 *      denetim bekleyen temizlikte durur.
 *   B. Personele giden veri: saha gorunumu tutar, odeme, misafir adi secmez;
 *      icra tablosunda finansal sutun yoktur; giris bilgisi yardimcisi
 *      dogrudan cagrilamaz.
 *   C. Denetim izi: operations_audit_logs'a yazilan her eylem, tablonun CHECK
 *      listesinde olmali. phase55 bu kurali cigniyordu ('STATUS_CHANGE');
 *      canli suit yakaladi, phase63 duzeltti. Bu iddia ayni hatayi
 *      veritabani olmadan yakalar.
 */

const fs = require('fs');
const path = require('path');

const SUPABASE = path.join(__dirname, '..', 'supabase');
let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);
const read = f => fs.readFileSync(path.join(SUPABASE, f), 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');

function manifestFiles() {
  return read('migration_manifest.txt').split('\n').map(l => l.trim())
    .filter(l => l && !l.startsWith('#')).map(l => l.split(/\s+/)[0]);
}

/** Manifest sirasinda fonksiyonun SON tanim govdesi. */
function lastDefinition(name) {
  let body = null, from = null;
  for (const f of ['schema.sql', ...manifestFiles()]) {
    if (!fs.existsSync(path.join(SUPABASE, f))) continue;
    const sql = read(f);
    const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${name}\\s*\\(`, 'gi');
    let m;
    while ((m = re.exec(sql))) {
      const rest = sql.slice(m.index);
      const as = rest.match(/\bAS\s+(\$[A-Za-z_]*\$)/);
      if (!as) continue;
      const start = as.index + as[0].length;
      const end = rest.indexOf(as[1], start);
      if (end > 0) { body = rest.slice(start, end); from = f; }
    }
  }
  return { body, from };
}

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 55 — OPERASYON INSANLARI VE IKI IMZALI TEMIZLIK (KAYNAK)');
  console.log('=============================================================================\n');

  const files = manifestFiles();
  const i53 = files.indexOf('migration_phase53_staff_data_boundary.sql');
  const i55 = files.indexOf('migration_phase55_operations_people_execution.sql');
  const i63 = files.indexOf('migration_phase63_task_status_audit_action.sql');
  const i68 = files.indexOf('migration_phase68_cleaner_signature_boundary.sql');
  check(i53 >= 0 && i55 > i53 && i63 === i55 + 1, '0. Manifest: 53 -> 55 -> 63 (duzeltme hemen arkasinda)', `${i53} ${i55} ${i63}`);
  check(i68 > i63, '0b. Phase68 Z imzasi yetki duzeltmesi phase55/63 sonrasinda', `${i63} ${i68}`);
  const p55 = read('migration_phase55_operations_people_execution.sql');

  console.log('\n--- A. Z / M VE GIDER ---');
  const sign = lastDefinition('sign_cleaning_done').body || '';
  check(sign && !/cleaning_tasks/.test(sign), 'A1. Z imzasi (sign_cleaning_done) cleaning_tasks\'a dokunmaz — gider yok', sign.slice(0, 120));
  const inspect = lastDefinition('inspect_cleaning').body || '';
  check(/UPDATE public\.cleaning_tasks\s+SET status = 'DONE', completed_at = v_exec\.cleaner_signed_at/.test(inspect),
    'A2. M onayi temizligi DONE yapar, tamamlanma ani Z imzasi', 'UPDATE ... DONE bulunamadi');
  check(/IF v_actor\.tenant_id IS NULL OR NOT v_actor\.is_manager THEN/.test(inspect), 'A3. Denetim yalniz yonetim', 'is_manager kapisi yok');
  check(/CREATE TRIGGER trg_close_requires_inspected_cleaning\s+BEFORE INSERT OR UPDATE ON public\.monthly_financial_closes/.test(p55)
    && /e\.status = 'CLEANED'/.test(p55), 'A4. Denetim bekleyen temizlik varken ay kapanmaz', 'tetikleyici yok');
  check(/UPDATE public\.cleaning_tasks/.test(inspect) && !/SET status = 'DONE'[\s\S]*SET status = 'DONE'/.test(inspect),
    'A5. Gideri doguran tek yazma noktasi M onayi', 'birden fazla DONE yazmasi');
  check(/NOT v_actor\.is_assignee/.test(sign), 'A6. Z imzasi yalniz atanan temizlikciye ait', 'is_assignee kapisi yok');

  console.log('\n--- B. PERSONELE GIDEN VERI ---');
  const field = lastDefinition('get_my_field_work').body || '';
  check(field && !/\bamount\b|is_paid|guest_name|gross_amount|cleaner_name|base_price|clean_cost/.test(field),
    'B1. Saha gorunumu tutar, odeme, misafir adi, fiyat secmez', (field.match(/\bamount\b|is_paid|guest_name|gross_amount|cleaner_name|base_price|clean_cost/) || [])[0]);
  check(/op\.user_id = v_uid/.test(field) && /t\.assigned_to = v_uid/.test(field), 'B2. Yalniz cagiranin kendi isi', 'kisi filtresi yok');
  const exec = p55.match(/CREATE TABLE public\.cleaning_task_executions \(([\s\S]*?)\n\);/);
  check(!!exec && !/\bamount\b|is_paid|paid_at/.test(exec[1]), 'B3. Icra tablosunda finansal sutun yok', exec ? 'finansal sutun var' : 'tablo yok');
  check(/REVOKE ALL ON FUNCTION public\.fn_property_access_json\(UUID, UUID\) FROM authenticated;/.test(p55),
    'B4. Kapi kodu yardimcisi dogrudan cagrilamaz', 'authenticated revoke yok');
  const save = lastDefinition('save_cleaning_progress').body || '';
  check(/'m', COALESCE\(v_exec\.checklist_result -> v_key -> 'm'/.test(save), 'B5. Temizlikci M isaretini degistiremez (korunur)', 'M korunmuyor');
  check(/NOT v_actor\.is_assignee/.test(save), 'B6. Z ilerlemesini yalniz atanan temizlikci yazar', 'is_assignee kapisi yok');

  console.log('\n--- C. DENETIM IZI EYLEMLERI ---');
  const schema = read('schema.sql');
  const cm = schema.match(/CREATE TABLE IF NOT EXISTS public\.operations_audit_logs \(([\s\S]*?)\n\);/);
  const allowed = cm ? ((cm[1].match(/action[^\n]*CHECK \(action IN \(([^)]*)\)\)/) || [])[1] || '').match(/'([A-Z_]+)'/g) || [] : [];
  const allowedSet = new Set(allowed.map(a => a.replace(/'/g, '')));
  check(allowedSet.size >= 5, 'C0. schema.sql operations_audit_logs.action CHECK listesi okundu', JSON.stringify([...allowedSet]));
  const smts = lastDefinition('set_my_task_status');
  const ins = (smts.body || '').match(/INSERT INTO public\.operations_audit_logs[\s\S]*?;/);
  const literals = ins ? (ins[0].match(/'([A-Z_]{4,})'/g) || []).map(x => x.replace(/'/g, '')).filter(x => !['TODO', 'IN_PROGRESS', 'DONE'].includes(x)) : [];
  const bad = literals.filter(x => !allowedSet.has(x));
  check(!!ins && literals.length > 0 && bad.length === 0,
    `C1. set_my_task_status (${smts.from}) yalniz izinli eylem yazar`, `izinsiz: ${bad.join(', ') || '—'}`);

  console.log('\n--- D. ORNEK SABLON (kullanicinin PDF\'leri) ---');
  const sample = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'ornek_kontrol_listesi_seyir_zirve.json'), 'utf8'));
  const sorunlar = [];
  for (const t of sample.templates || []) {
    const it = t.items || {};
    if (Object.keys(it).some(k => !['sections', 'supplies'].includes(k))) sorunlar.push(`${t.template_name}: fazla anahtar`);
    for (const s of it.sections || []) {
      if (!String(s.title || '').trim() || !Array.isArray(s.items) || !s.items.length) sorunlar.push(`${t.template_name}: bos bolum`);
      for (const m of s.items || []) {
        if (!String(m.text || '').trim()) sorunlar.push(`${t.template_name}/${s.title}: bos madde`);
        if (Object.keys(m).some(k => !['text', 'important', 'subChecks'].includes(k))) sorunlar.push(`${m.text}: fazla anahtar`);
      }
    }
    for (const x of it.supplies || []) if (!String(x.item || '').trim()) sorunlar.push(`${t.template_name}: bos malzeme`);
  }
  const genel = (sample.templates || []).filter(t => t.property === null).length;
  const ozel = (sample.templates || []).filter(t => t.property).length;
  check(sorunlar.length === 0 && genel === 1 && ozel === 2, 'D1. Ornek sablon: 1 genel + 2 eve ozel, bicim phase55 ile uyumlu', sorunlar.slice(0, 3).join(' | ') || `${genel}/${ozel}`);
  const zirveOda = (sample.templates || []).find(t => t.property === 'Zirve');
  check(!!zirveOda && zirveOda.items.sections[0].items.some(m => (m.subChecks || []).join() === 'ODA 1,ODA 2,ODA 3'),
    'D2. Zirve yatak odalarinda ODA 1-3 alt isaretleri korunuyor (D-2)', 'subChecks yok');

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

run();
