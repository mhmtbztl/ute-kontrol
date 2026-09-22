/**
 * LEXBNB ICE AKTARIM GERI ALMA DENETIMI (phase35) — cevrimdisi
 *
 * NEDEN VAR:
 *
 * Ice aktarma tek seferde yuzlerce kayit yazabiliyor. Bicim kontrolleri
 * (zorunlu sutun, mulk eslesmesi, tarih cakismasi) bozuk BICIMI yakalar ama
 * "yanlis dosyayi yukledim" hicbir kapiya takilmaz: dosya gecerlidir, veri
 * yanlistir. O ana kadar tek cikis yolu 300 kaydi tek tek silmekti.
 *
 * `finance_import_batches` her aktarimi zaten kaydediyordu (dosya parmak izi,
 * satir sayisi, tutar) ama aktarim ile YAZDIGI KAYITLAR arasinda bag yoktu —
 * yani "bu aktarim neyi yazdi" sorusunun cevabi hicbir yerde durmuyordu.
 *
 * Uc katman olculur:
 *   A) DAVRANIS — sahte istemciyle bag gercekten yaziliyor mu, eksik sema
 *                 yutuluyor mu
 *   B) KAYNAK   — app.js kimlikleri topluyor ve partiye bagliyor mu
 *   C) GOC      — phase35 tabloyu, kisiti, RLS'i ve yetkiyi kapsiyor mu
 *
 * Eski gövdeye karsi kirilir (CLAUDE.md 5.5).
 * Kaynak + saf mantik olcumudur; dis sisteme baglanmaz.
 */

const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const APP_KAYNAK = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
const GOC_YOL = path.join(KOK, 'supabase', 'migration_phase35_import_undo.sql');
const GOC = fs.existsSync(GOC_YOL) ? fs.readFileSync(GOC_YOL, 'utf8') : '';

function kodu(kaynak) {
  return kaynak.split(/\r?\n/)
    .filter(l => {
      const t = l.trim();
      return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}
const APP = kodu(APP_KAYNAK);

function govde(kaynak, ad) {
  const satirlar = kaynak.split(/\r?\n/);
  const i = satirlar.findIndex(l => {
    const t = l.trim();
    return t.startsWith('function ' + ad + '(') || t.startsWith('async function ' + ad + '(');
  });
  if (i < 0) return null;
  let d = 0;
  for (let j = i; j < satirlar.length; j++) {
    for (const c of satirlar[j]) {
      if (c === '{') d++;
      else if (c === '}') d--;
    }
    if (d === 0 && j > i) return satirlar.slice(i, j + 1).join('\n');
  }
  return null;
}

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

const TENANT = '11111111-2222-4333-8444-555555555555';
const PARTI = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

/**
 * Supabase JS hata FIRLATMAZ, `{ error }` dondurur (CLAUDE.md 5.1).
 * Sahte istemci de ayni sozlesmeyi tasimali.
 */
function sahteIstemci(hata) {
  const kayit = { inserts: [] };
  return {
    kayit,
    istemci: {
      from: (tablo) => ({
        insert: (satirlar) => {
          kayit.inserts.push({ tablo, satirlar });
          const sonuc = { data: satirlar, error: hata || null };
          return {
            select: () => ({ single: async () => sonuc }),
            then: (res, rej) => Promise.resolve(sonuc).then(res, rej)
          };
        }
      })
    }
  };
}

// =============================================================================
// A) DAVRANIS
// =============================================================================
async function davranisTestleri(app) {
  console.log('\n--- A) DAVRANIS ---');

  if (typeof app.cloudLinkImportBatchRows !== 'function') {
    no('A1. cloudLinkImportBatchRows disa aktariliyor',
      'Bag kuran fonksiyon yok: aktarim ile yazdigi kayitlar arasinda hicbir ' +
      'iliski tutulmuyor ve geri alma imkansiz.');
    return;
  }

  // --- Rezervasyon bagi ---
  const a = sahteIstemci(null);
  app.setSupabaseClient(a.istemci);
  const sonuc = await app.cloudLinkImportBatchRows(TENANT, PARTI, true, [
    { rowNum: 2, id: 'b1' }, { rowNum: 3, id: 'b2' }
  ]);
  check(sonuc === true, 'A1. Bag kurulunca true donuyor', 'Donen: ' + sonuc);
  check(a.kayit.inserts.length === 1 && a.kayit.inserts[0].tablo === 'finance_import_batch_rows',
    'A2. Bag dogru tabloya yaziliyor', JSON.stringify(a.kayit.inserts.map(i => i.tablo)));

  const satir = a.kayit.inserts[0].satirlar[0];
  check(satir.tenant_id === TENANT && satir.batch_id === PARTI &&
        satir.booking_id === 'b1' && satir.expense_id === null,
    'A3. Rezervasyon bagi booking_id tasiyor, expense_id bos',
    JSON.stringify(satir));
  check(satir.source_row_num === 2,
    'A4. Kaynak satir numarasi saklaniyor (hangi satirdan geldigi)',
    JSON.stringify(satir));

  // --- Gider bagi ---
  const b = sahteIstemci(null);
  app.setSupabaseClient(b.istemci);
  await app.cloudLinkImportBatchRows(TENANT, PARTI, false, [{ rowNum: 5, id: 'e1' }]);
  const gSatir = b.kayit.inserts[0].satirlar[0];
  check(gSatir.expense_id === 'e1' && gSatir.booking_id === null,
    'A5. Gider bagi expense_id tasiyor, booking_id bos', JSON.stringify(gSatir));

  // --- Eksik sema YUTULUR (goc henuz uygulanmamis olabilir) ---
  const c = sahteIstemci({ code: 'PGRST205', message: 'Could not find the table' });
  app.setSupabaseClient(c.istemci);
  let firlatti = false, cSonuc = null;
  try { cSonuc = await app.cloudLinkImportBatchRows(TENANT, PARTI, true, [{ rowNum: 2, id: 'b1' }]); }
  catch (e) { firlatti = true; }
  check(!firlatti && cSonuc === false,
    'A6. Goc uygulanmamissa bag kurulamaz ama ICE AKTARMA COKMEZ',
    'Dagitim sirasi tuzagi: GitHub Pages push ile aninda yayina alir, gocler ' +
    'elle uygulanir. Eksik sema burada firlatilirsa, gocten onceki pencerede ' +
    'TUM ice aktarma kirilir. firlatti=' + firlatti + ' sonuc=' + cSonuc);

  // --- Gercek hata YUTULMAZ ---
  const d = sahteIstemci({ code: '42501', message: 'permission denied' });
  app.setSupabaseClient(d.istemci);
  let yetkiFirlatti = false;
  try { await app.cloudLinkImportBatchRows(TENANT, PARTI, true, [{ rowNum: 2, id: 'b1' }]); }
  catch (e) { yetkiFirlatti = true; }
  check(yetkiFirlatti,
    'A7. Yetki hatasi YUTULMUYOR',
    'Eksik sema disindaki her hata yuzeye cikmali; yoksa bag sessizce ' +
    'kurulmadan "kuruldu" sanilir.');

  // --- Bos liste ---
  const e = sahteIstemci(null);
  app.setSupabaseClient(e.istemci);
  check((await app.cloudLinkImportBatchRows(TENANT, PARTI, true, [])) === false &&
        e.kayit.inserts.length === 0,
    'A8. Bos kayit listesinde bos istek atilmiyor', 'Gereksiz istek gidiyor.');

  app.setSupabaseClient(null);
}

// =============================================================================
// B) KAYNAK
// =============================================================================
function kaynakTestleri(app) {
  console.log('\n--- B) KAYNAK ---');

  const uygula = govde(APP, 'applyImportedData') || '';
  check(uygula.includes('yeniKayitlar'),
    'B1. Ice aktarma yazdigi kayitlarin kimliklerini TOPLUYOR',
    'Kimlik toplanmazsa "bu aktarim neyi yazdi" sorusunun cevabi yok ve ' +
    'geri alma kurulamaz.');
  check(/const olusan = await createBooking/.test(uygula) &&
        /const olusan = await createExpense/.test(uygula),
    'B2. Her iki defterde de olusan kayit yakalaniyor',
    'createBooking/createExpense donusu kullanilmiyor.');
  check(uygula.includes('cloudLinkImportBatchRows'),
    'B3. Toplanan kimlikler partiye baglaniyor', 'Bag hic kurulmuyor.');
  check(uygula.includes(".select('id')") && uygula.includes('bagKuruldu'),
    'B4. Parti kimligi geri okunuyor ve bag sonucu izleniyor',
    'insert sonrasi id alinmadan bag kurulamaz.');
  check(uygula.includes('tek tuşla geri alınamayacak'),
    'B5. Bag kurulamadiysa kullaniciya SOYLENIYOR',
    'Sessiz gecmek, olmayan bir guvenlik agi vaat etmek olurdu.');

  check(typeof app.undoImportBatch === 'function' && typeof app.loadImportBatches === 'function',
    'B6. Geri alma ve gecmis okuma disa aktariliyor', 'Fonksiyonlar yok.');

  const geri = govde(APP, 'undoImportBatch') || '';
  check(geri.includes('undo_finance_import'),
    'B7. Geri alma RPC uzerinden yapiliyor',
    'Istemcide tek tek silmek, kapanmis donem korumasina yarida takilip ' +
    'yarim silinmis bir defter birakirdi (phase19 dersi).');
  check(geri.includes('AKTARIMI GERI AL'),
    'B8. Yazili onay sabiti gonderiliyor', 'RPC onaysiz cagriliyor.');
  check(geri.includes('requireCloudForWrite'),
    'B9. Bulut yoksa geri alma durduruluyor (3.3)', 'Koruma yok.');
  check(geri.includes('CLOSED_PERIOD_BLOCK'),
    'B10. Kapanmis donem reddi kullaniciya AYRI mesajla anlatiliyor',
    'Genel hata metni kullaniciyi ne yapacagini bilmeden birakir.');
  check(geri.includes('skipped_modified'),
    'B11. Atlanan (sonradan duzenlenmis) kayitlar raporlaniyor',
    'Kullanici 300 kayit silinmesini bekleyip 297 silindigini fark etmezse ' +
    'defterinde ne oldugunu bilemez.');
  check(geri.includes('loadTenantAppData'),
    'B12. Geri almadan sonra ekran gercege cekiliyor',
    'Bellekteki kayitlar silinmis gibi gorunmeye devam eder.');

  const gecmis = govde(APP, 'refreshImportHistory') || '';
  check(gecmis.includes('escapeHtml'),
    'B13. Gecmis listesinde dosya adi kaciriliyor',
    'Dosya adi kullanicidan gelir; kacirilmazsa HTML enjeksiyonu olur.');
  check(gecmis.includes('linkedCount > 0'),
    'B14. Bagi olmayan aktarim "geri alinamaz" gosteriliyor',
    'Gocten once yapilan aktarimlar icin calismayan bir dugme sunulurdu.');
  check((govde(APP, 'openImportModal') || '').includes('refreshImportHistory'),
    'B15. Gecmis modal acilinca yukleniyor', 'Liste hic dolmuyor.');
  check(/id="importHistoryBox"/.test(HTML) && /id="importHistoryList"/.test(HTML),
    'B16. Gecmis kutusu arayuzde var', 'HTML kabi yok.');
}

// =============================================================================
// C) GOC
// =============================================================================
function gocTestleri() {
  console.log('\n--- C) GOC ---');

  if (!GOC) {
    no('C1. migration_phase35_import_undo.sql var', 'Goc dosyasi yok.');
    return;
  }
  ok('C1. migration_phase35_import_undo.sql var');

  check(/CREATE TABLE IF NOT EXISTS public\.finance_import_batch_rows/.test(GOC),
    'C2. Bag tablosu olusturuluyor', 'Tablo yok.');

  // `bookings`/`expenses`'e SUTUN EKLENMEMELI: goc uygulanana kadar o
  // defterlere yazmayi tamamen kirar (CLAUDE.md 3.4).
  check(!/ALTER TABLE public\.(bookings|expenses)\s+ADD COLUMN/i.test(GOC),
    'C3. bookings/expenses tablolarina SUTUN EKLENMIYOR',
    'Mulk/rezervasyon CRUD\'una yeni sutun sokmak, goc uygulanana kadar o ' +
    'defterde kayit yazmayi TAMAMEN kirar — bookings\'te bir kez yasandi.');

  check(/booking_id UUID REFERENCES public\.bookings\(id\) ON DELETE CASCADE/.test(GOC) &&
        /expense_id UUID REFERENCES public\.expenses\(id\) ON DELETE CASCADE/.test(GOC),
    'C4. Iki hedef de ON DELETE CASCADE',
    'Kayit baska yoldan silindiginde bag SARKIK kalir ve geri alma var ' +
    'olmayan kayitlara yonelir.');

  check(/chk_batch_row_single_target/.test(GOC),
    'C5. Tam bir hedef dolu kisiti var', 'Ikisi birden dolu/bos olabilir.');

  check(/ENABLE ROW LEVEL SECURITY/.test(GOC),
    'C6. Bag tablosunda RLS acik', 'Cok kiracili bir SaaS\'ta zorunlu.');

  check(/REVOKE ALL ON TABLE public\.finance_import_batch_rows FROM anon/.test(GOC),
    'C7. anon tablo yetkisi ayrica geri aliniyor',
    'Supabase yeni `public` tablosuna varsayilan anon yetkisi verir ve ' +
    '`FROM PUBLIC` bunu KALDIRMAZ (CLAUDE.md 7).');
  check(/REVOKE ALL ON FUNCTION public\.undo_finance_import\(UUID, UUID, TEXT\) FROM anon/.test(GOC),
    'C8. anon fonksiyon yetkisi ayrica geri aliniyor', 'Ikinci kat eksik.');
  check(/GRANT EXECUTE ON FUNCTION public\.undo_finance_import\(UUID, UUID, TEXT\) TO authenticated/.test(GOC),
    'C9. authenticated cagirabiliyor', 'Grant yok.');

  // Govdenin kendi yetki kontrolu (ikinci kat) — ve NULL tuzagi.
  check(/v_role IS NULL OR v_role NOT IN \('owner', 'admin', 'manager'\)/.test(GOC),
    'C10. Rol kontrolu `IS NULL` ayri yapiliyor',
    '`NULL NOT IN (...)` sonucu TRUE degil NULL\'dur; koruma TAM DA korumasi ' +
    'gereken anda (yabanci kiraci) sessizce atlanir (CLAUDE.md 7).');
  check(/auth\.uid\(\)/.test(GOC) && /UNAUTHENTICATED/.test(GOC),
    'C11. Govdede kendi kimlik kontrolu var', 'Iki katli kuralin ikinci kati eksik.');

  const yetkiYeri = GOC.indexOf('tenant_members');
  const kayitYeri = GOC.indexOf('FROM public.finance_import_batches');
  check(yetkiYeri > 0 && kayitYeri > 0 && yetkiYeri < kayitYeri,
    'C12. Yetki kontrolu KAYIT ARANMADAN once',
    'Once kayit aranirsa hata mesaji bir UUID\'nin var olup olmadigini ' +
    'sizdirir (varlik oracülü, CLAUDE.md 7).');

  check(/AKTARIMI GERI AL/.test(GOC) && /CONFIRMATION_REQUIRED/.test(GOC),
    'C13. Yazili onay zorunlu', 'Yanlislikla cagri toplu silme yapabilir.');

  check(/CLOSED_PERIOD_BLOCK/.test(GOC) && /monthly_financial_closes/.test(GOC),
    'C14. Kapanmis donem ONCEDEN taraniyor ve islem hic baslamiyor',
    'Tetikleyiciye carpmayi beklemek de calisirdi ama kullaniciya KAC ' +
    'kaydin engellendigi soylenemezdi.');

  check(/updated_at <= [be]\.created_at/.test(GOC),
    'C15. Sonradan DEGISTIRILMIS kayit silinmiyor',
    'Kullanici aktarimdan sonra bir kaydi elle duzelttiyse o artik ' +
    '"aktarilan veri" degil, onun emegidir.');

  check(/skipped_modified/.test(GOC) && /deleted_bookings/.test(GOC) && /deleted_expenses/.test(GOC),
    'C16. Sonuc neyin silindigini ve neyin atlandigini AYRI AYRI donuyor',
    'Tek bir sayi, kullaniciyi defterinde ne kaldigini bilmeden birakir.');

  check(/PHASE35_ANON_TABLE_GRANT_PRESENT/.test(GOC) &&
        /PHASE35_ANON_EXECUTE_PRESENT/.test(GOC) &&
        /PHASE35_CASCADE_MISSING/.test(GOC) &&
        /PHASE35_AUTHZ_ORDER/.test(GOC),
    'C17. Gocun kendi dogrulama blogu bu degismezleri olcuyor',
    'Dogrulama blogu olmazsa goc "calisti" der ama neyi kurdugu bilinmez.');

  // Dogrudan DELETE politikasi olmamali.
  check(!/CREATE POLICY[^;]*ON public\.finance_import_batch_rows[\s\S]{0,120}FOR DELETE/.test(GOC),
    'C18. Baga dogrudan DELETE politikasi verilmiyor',
    'Bag tek tek silinebilseydi geri alma sessizce etkisizlestirilebilirdi.');

  // Manifest
  const manifest = fs.readFileSync(path.join(KOK, 'supabase', 'migration_manifest.txt'), 'utf8');
  check(manifest.indexOf('migration_phase35_import_undo.sql') !== -1,
    'C19. Goc manifestte kayitli',
    'Manifestte olmayan goc sifirdan kurulan bir semada HIC uygulanmaz.');

  // -------------------------------------------------------------------------
  // phase37 — "degismis kayit" olcumunun DUZELTMESI
  //
  // phase35 olcutu `updated_at <= created_at + INTERVAL '2 seconds'` yazdi.
  // Pay gereksizdi (`set_updated_at` yalnizca BEFORE UPDATE calisir, yani
  // olusturma aninda updated_at'e dokunmaz) ve ZARARLIYDI: aktarimdan hemen
  // sonra — ki en olagan durum budur — yapilan duzenlemeyi "degismemis"
  // sayip kullanicinin emegini siliyordu. Canli suit yakaladi.
  //
  // Olculdu: INSERT -> created_at = updated_at birebir; UPDATE -> 82 ms ileri.
  // -------------------------------------------------------------------------
  const DUZELTME_YOL = path.join(KOK, 'supabase', 'migration_phase37_import_undo_exact_match.sql');
  if (!fs.existsSync(DUZELTME_YOL)) {
    no('C20. migration_phase37_import_undo_exact_match.sql var',
      'Duzeltme gocu yok: geri alma, aktarimdan hemen sonra yapilan ' +
      'duzenlemeleri sessizce siler.');
    return;
  }
  const DUZELTME = fs.readFileSync(DUZELTME_YOL, 'utf8');
  ok('C20. migration_phase37_import_undo_exact_match.sql var');

  check(/b\.updated_at <= b\.created_at\s*$/m.test(DUZELTME) &&
        /e\.updated_at <= e\.created_at\s*$/m.test(DUZELTME),
    'C21. Duzeltmede olcut TAM ESITLIK', 'Olcut hala paylı.');

  // Tarama CALISAN SQL'e daraltilir. Dosya eski (hatali) olcutu yorumunda
  // BILEREK gosteriyor — neyin duzeltildigini anlatmak icin — ve kendi
  // dogrulama blogunda payin geri gelmedigini olcuyor. Kaba bir "dosyada
  // gecmesin" taramasi bu ikisini ihlal sayardi.
  const sqlGovde = DUZELTME.split(/\r?\n/)
    .filter(l => !l.trim().startsWith('--')).join('\n');
  check(!/updated_at <= [be]\.created_at \+ INTERVAL/.test(sqlGovde),
    'C22. Karsilastirma OLCUTUNDE zaman payi kalmamis',
    'Pay birakmak, aktarimdan hemen sonra yapilan duzenlemeyi "degismemis" ' +
    'sayar ve kullanicinin emegini sessizce siler.');

  // phase35'in kazanimlari CREATE OR REPLACE ile kaybolmamali.
  const korunmasiGereken = ['CLOSED_PERIOD_BLOCK', 'AKTARIMI GERI AL',
    'skipped_modified', 'UNAUTHORIZED', 'tenant_members'];
  const kaybolan = korunmasiGereken.filter(k => DUZELTME.indexOf(k) === -1);
  check(kaybolan.length === 0,
    'C23. Duzeltme phase35\'in korumalarini KORUYOR',
    'CREATE OR REPLACE govdeyi butunuyle degistirir; eksik birakilan her ' +
    'koruma sessizce kaybolur. Kaybolan: ' + kaybolan.join(', '));

  check(/PHASE37_TOLERANCE_STILL_PRESENT/.test(DUZELTME) &&
        /PHASE37_CLOSED_PERIOD_LOST/.test(DUZELTME),
    'C24. Duzeltmenin kendi dogrulama blogu hem yeniyi hem eskiyi olcuyor',
    'Yalnizca yeni davranisi olcen bir dogrulama, kaybolan korumayi gormez.');

  check(manifest.indexOf('migration_phase37_import_undo_exact_match.sql') !== -1,
    'C25. Duzeltme gocu manifestte kayitli', 'Sifirdan kurulan semada uygulanmaz.');

  // Sira: duzeltme phase35'ten SONRA gelmeli.
  check(manifest.indexOf('migration_phase35_import_undo.sql') <
        manifest.indexOf('migration_phase37_import_undo_exact_match.sql'),
    'C26. Manifestte duzeltme phase35\'ten SONRA listeleniyor',
    'Manifest sirasi BAGIMLILIK sirasidir (CLAUDE.md 5.7); duzeltme once ' +
    'gelirse sifirdan kurulan semada phase35 onu geri alir.');
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB ICE AKTARIM GERI ALMA DENETIMI (phase35)');
  console.log('=============================================================================');

  const app = require(path.join(KOK, 'app.js'));
  await davranisTestleri(app);
  kaynakTestleri(app);
  gocTestleri();
}

run()
  .catch(e => no('KOSU', 'Denetim yarida kesildi: ' + (e && e.message ? e.message : e)))
  .finally(() => {
    console.log('\n-----------------------------------------------------------------------------');
    console.log(`TOPLAM: ${passed} gecti, ${failed} kaldi`);
    console.log('-----------------------------------------------------------------------------');
    if (failed > 0) process.exit(1);
  });
