/**
 * LEXBNB BILDIRIM MERKEZI BAGLANTI DENETIMI
 *
 * 17 Eylul 2026 incelemesi: bildirim merkezi HER IKI UCTAN DA BAGLI DEGILDI.
 *
 *   • `appData.userNotifications` hicbir yerde ATANMIYORDU. Zil rozeti ve
 *     cekmece yalnizca bu diziyi okuyor; yani musteride bildirim merkezi
 *     HER ZAMAN bostu. `loadUserNotifications()` tanimliydi ama uygulamanin
 *     hicbir yerinden cagrilmiyordu — yalnizca module.exports'ta duruyordu.
 *
 *   • "Tumunu Okundu Say" yalnizca bellekteki nesneleri degistiriyordu.
 *     Postgres'e hicbir sey yazilmiyordu; sayfa yenilenince butun bildirimler
 *     geri geliyordu. `saveAppData()` de bir sey kaydetmiyor: govdesi yalnizca
 *     eski localStorage anahtarlarini siliyor. (1. bolum: kaydedilmeyen seye
 *     "kaydedildi" denmez.)
 *
 *   • Cekmecedeki dugme `acknowledgeUserNotification(id); render();` seklinde
 *     yaziliydi: async cagri BEKLENMIYOR, yerel durum guncellenmiyor ve hata
 *     firlarsa yakalanmayan promise reddi olarak sessizce yutuluyordu.
 *
 * Bu denetim kaynak taramasidir; davranis tarafini `notification_authz_tests`
 * (canli) olcer.
 */

const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');

/**
 * Yalnizca CALISAN kodu birak. Bu denetim "eskiden soyle yaziyordu" diyen
 * aciklamalari ihlal sayarsa, hatanin NEDEN duzeltildigini yazan yorumu
 * silmek zorunda kalirsiniz — yani denetim, kendi belgesini yok eder.
 * (demo_residue_tests ayni sebeple ayni seyi yapiyor.)
 */
function kodu(kaynak) {
  return kaynak.split(/\r?\n/)
    .filter(l => {
      const t = l.trim();
      return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB BILDIRIM MERKEZI BAGLANTI DENETIMI');
  console.log('=============================================================================\n');

  // --- 1. Yukleme ucu --------------------------------------------------------
  check(/userNotifications:\s*userNotifications\s*\|\|\s*\[\]/.test(APP),
    '1. appData.userNotifications bulut yuklemesinde ATANIYOR',
    'Atama yok. Zil rozeti ve cekmece yalnizca bu diziyi okuyor; ' +
    'atanmazsa bildirim merkezi musteride her zaman bos gorunur.');

  check(/from\('user_notifications'\)[\s\S]{0,200}?\.eq\('tenant_id'/.test(APP),
    '2. Bildirimler kiraci suzgeciyle Postgres\'ten okunuyor',
    'user_notifications sorgusu yok ya da tenant_id suzgeci yok.');

  // --- 2. Okundu isaretleme kalici mi ----------------------------------------
  const markBas = APP.indexOf('async function markAllNotificationsAsRead');
  const markVar = markBas !== -1;
  check(markVar,
    '3. markAllNotificationsAsRead async (Postgres yazmasini bekliyor)',
    'Fonksiyon senkron: bir yazmayi bekleyemez, yani yalnizca bellegi ' +
    'degistiriyor olabilir.');

  const markGovde = markVar ? APP.slice(markBas, APP.indexOf('\nfunction ', markBas + 10)) : '';
  check(/await\s+markUserNotificationsRead\(/.test(markGovde),
    '4. "Tümünü Okundu Say" Postgres\'e yazar',
    'Gövdede kalıcı bir yazma yok. Rozet siliniyor ama kayıt UNREAD kalıyorsa ' +
    'kullanıcıya yalan söylenmiş olur (1. bölüm).');

  check(/catch\s*\(/.test(markGovde),
    '5. Okundu isaretleme hatasi yutulmaz',
    'Yazma basarisiz olursa kullanici bunu ogrenmeli; sessiz basarisizlik ' +
    'en kotusudur.');

  // --- 3. Onaylama yolu ------------------------------------------------------
  const confBas = APP.indexOf('async function confirmUserNotification');
  check(confBas !== -1,
    '6. Cekmecedeki onay dugmesi async bir sarmalayicidan gecer',
    'Dugme dogrudan async RPC cagiriyor olabilir; o zaman yeniden cizim ' +
    'RPC donmeden calisir.');

  const confGovde = confBas === -1 ? '' : APP.slice(confBas, APP.indexOf('\n/**', confBas + 10));
  check(/await\s+acknowledgeUserNotification\(/.test(confGovde) && /catch\s*\(/.test(confGovde),
    '7. Onay cagrisi BEKLENIR ve hatasi yakalanir',
    'await ya da catch eksik. Beklenmezse ekran eski durumu gosterir; ' +
    'yakalanmazsa hata yakalanmayan promise reddi olarak yutulur.');

  check(!/onclick="acknowledgeUserNotification\([^)]*\);\s*render/.test(kodu(APP)),
    '8. Dugme "async cagir, hemen yeniden ciz" kalibini kullanmiyor',
    'onclick hala `acknowledgeUserNotification(id); render()` seklinde. ' +
    'Bu kalip RPC\'yi beklemez.');

  // --- 4. saveAppData yanilticiligi ------------------------------------------
  // Bu fonksiyon HICBIR SEY kaydetmez; adi kaydediyormus gibi durur. Bildirim
  // yolunda kullanilmamali ki "kaydedildi" yanilgisi tekrarlanmasin.
  const saveBas = APP.indexOf('function saveAppData()');
  const saveGovde = saveBas === -1 ? '' : APP.slice(saveBas, APP.indexOf('\n}', saveBas) + 2);
  check(saveBas !== -1 && !/supabaseClient|localStorage\.setItem/.test(saveGovde),
    '9. saveAppData() gercekten hicbir sey kaydetmiyor (bilinen durum)',
    'saveAppData davranisi degismis; bu denetimin dayandigi varsayim gecersiz.');

  check(!markGovde.includes('saveAppData()') && !confGovde.includes('saveAppData()'),
    '10. Bildirim yolu kalicilik icin saveAppData()\'ya güvenmiyor',
    'saveAppData() hiçbir şey kaydetmez; kalıcılık sanılan yer burasıysa ' +
    'kayıt sessizce kaybolur.');

  // --- 5. Sunucunun "olmadi" demesi OKUNUYOR mu (phase39) --------------------
  //
  // phase39 ile iki RPC artik 0 satir etkiledigini `success: false` ile
  // soyluyor. Istemci bunu okumazsa ekranda "onaylandi" yazar, kayit ise
  // yoktur — yani istemci, sunucunun duzelttigi yalani kendi tekrarlar.
  check(/sonuc\s*&&\s*sonuc\.success === false/.test(confGovde),
    '11. Onay yolu sunucunun `success: false` cevabini OKUYOR',
    'Donen deger kontrol edilmiyor: silinmis bir bildirim ekranda ' +
    '"onaylandi" gorunur.');

  // --- 6. Uyari cozme cagrisi (phase39) --------------------------------------
  //
  // Bu cagri BIR ZAMANLAR HER ZAMAN DUSUYORDU: `p_resolved_by` tipi UUID'dir
  // ve oraya bir CUMLE gidiyordu. Test projesinde olculdu:
  //   22P02 invalid input syntax for type uuid: "İncelendi ve çözüldü."
  // Cagri `await` edilmedigi ve `catch`lenmedigi icin reddedilen promise
  // sessizce yutuluyor, hemen altindaki `alert` ise KOSULSUZ
  // "✅ Bildirim kapatıldı." diyordu. Uyari acik kaliyordu.
  const ham = kodu(APP);
  check(!/resolveExecutiveAlert\(\s*entityId\s*,\s*'[^']*[a-zçğıöşü][^']*'\s*\)/i.test(ham),
    '12. resolveExecutiveAlert ikinci argumanina CUMLE gonderilmiyor',
    'p_resolved_by UUID bekler; cumle gidince cagri 22P02 ile duser.');

  const alertBas = ham.indexOf("actionType === 'RESOLVE_ALERT'");
  const alertGovde = alertBas === -1 ? '' : ham.slice(alertBas, alertBas + 1400);
  check(alertBas !== -1 && /\.catch\(|catch\s*\(/.test(alertGovde),
    '13. Uyari cozme cagrisinin hatasi yakalaniyor',
    'Yakalanmazsa reddedilen promise sessizce yutulur.');
  check(!/alert\('✅ Bildirim kapatıldı\.'\)/.test(alertGovde),
    '14. "Bildirim kapatildi" KOSULSUZ soylenmiyor',
    'Cagri dusse de kullaniciya basarili denirdi — bu depoda kabul edilmeyen ' +
    'kalip tam olarak budur (1. bolum).');
  check(/success === false/.test(alertGovde),
    '15. Uyari cozmede de `success: false` okunuyor (phase39)',
    'Sunucu "uyari artik yok" diyor, istemci "kapatildi" diyor.');

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

run();
