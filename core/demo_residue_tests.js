/**
 * LEXBNB DEMO ARTIGI DENETIMI
 *
 * Bu proje demo veri artiklarindan defalarca zarar gordu. Demo portfoyu
 * 2026-09-13'te kaldirildi ama artiklari uygulamanin icine yayilmis halde
 * kaldi ve MUSTERIYE GOSTERILMEYE DEVAM ETTI:
 *
 *   • exportTrajectoryReport() indirilebilir bir yonetici raporu uretiyordu:
 *     "5.004.165,40 TL toplam ciro", "88/100 saglik skoru", bes hayali
 *     villanin ciro paylari. Hicbiri hesaplanmiyordu; bos hesapta bile ayni.
 *   • renderAIFinancialAnalyst() cirosu sifirdan buyuk HER musteriye
 *     "Villa Azure Bay liderligi" ve "OTA komisyonlari 75.519 TL" yaziyordu.
 *   • renderPropertyComparisonChart() bes uydurma villa anahtarini
 *     dolasiyordu; musteri kendi mulklerini hic gormuyordu.
 *   • detectGapNights() gercek bosluk 3'ten azsa UCUNU UYDURUYORDU.
 *   • renderSeasonalEventRadar() doluluk rozetlerini rezervasyonlara hic
 *     bakmadan "Villa Azure Bay DOLU, digerleri BOS" olarak yaziyordu.
 *   • index.html'de 12 acilir listede bes uydurma villa sabit duruyordu;
 *     ikisi (rezVillaFilter, waParsedVilla) JS tarafindan hic yenilenmiyordu.
 *   • "bugun" 20 ayri yerde '2026-09-07' olarak sabitti ve KAYITLARA da
 *     yaziliyordu: temizlik odemesi hangi gun isaretlenirse isaretlensin
 *     odeme tarihi 2026-09-07 kaydediliyordu.
 *   • Silinmis DEFAULT_* demo sabitlerine referanslar kalmisti; o kod
 *     yollari calistiginda ReferenceError firlatiyordu.
 *
 * Bu denetim kalibin tamamini kapatir. Yeni bir demo artigi eklenirse kirilir.
 */

const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

/**
 * Yalnizca CALISAN kodu denetle: tam satir aciklamalarini at, satir sonundaki
 * aciklamalari da kes. (Kaba ama bu denetim icin yeterli: amac aciklamalarda
 * gecen tarihsel isimleri ihlal saymamak.)
 */
function kodSatirlari(kaynak) {
  return kaynak.split(/\r?\n/).map((l, i) => ({ n: i + 1, l }))
    .filter(({ l }) => {
      const t = l.trim();
      return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('<!--');
    })
    .map(({ n, l }) => {
      // Satir sonu aciklamasini kes; tirnak icindeki '//' (http://) korunur.
      let tirnak = null, kacis = false;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (kacis) { kacis = false; continue; }
        if (c === '\\') { kacis = true; continue; }
        if (tirnak) { if (c === tirnak) tirnak = null; continue; }
        if (c === '"' || c === "'" || c === '`') { tirnak = c; continue; }
        if (c === '/' && l[i + 1] === '/') return { n, l: l.slice(0, i) };
      }
      return { n, l };
    });
}

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB DEMO ARTIGI DENETIMI');
  console.log('=============================================================================\n');

  // --- 1. Uydurma villa adlari ----------------------------------------------
  const HAYALI = ['Bella Vista', 'Azure Bay', 'Sunset Horizon', 'Olive Garden', 'Palm Breeze',
                  'VILLA_BELLA', 'VILLA_AZURE', 'VILLA_OLIVE', 'VILLA_SUNSET', 'VILLA_PALM'];
  const villaIhlal = [];
  for (const [ad, kaynak] of [['app.js', APP], ['index.html', HTML]]) {
    kodSatirlari(kaynak).forEach(({ n, l }) => {
      HAYALI.forEach(h => { if (l.includes(h)) villaIhlal.push(`${ad}:${n} — ${h}`); });
    });
  }
  check(villaIhlal.length === 0,
    '1. İlk müşterinin villa adları koda gömülü değil',
    villaIhlal.length + ' yer:\n         ' + villaIhlal.slice(0, 10).join('\n         ') +
    '\n       Bu isimler tek bir müşteriye aitti. Portföy appData.villas\'tan gelmelidir.');

  // --- 2. Sabit "bugün" ------------------------------------------------------
  // Tarih sabitleri yalnizca gercekten sabit olan yerlerde mesru: '2099-12-31'
  // gibi sinir degerleri, sablon ornek satirlari.
  const TARIH_ISTISNA = new Set([
    "'2099-12-31'",   // ust sinir sentineli
    "'2025-07-01'",   // alt sinir sentineli (ozel aralik varsayilani)
    "'2026-10-10'",   // Excel sablonundaki ornek satir
    "'2026-10-14'"    // Excel sablonundaki ornek satir
  ]);
  const tarihIhlal = [];
  kodSatirlari(APP).forEach(({ n, l }) => {
    const m = l.match(/'[12][0-9]{3}-[0-9]{2}-[0-9]{2}'/g) || [];
    m.forEach(t => { if (!TARIH_ISTISNA.has(t)) tarihIhlal.push(`app.js:${n} — ${t}`); });
  });
  check(tarihIhlal.length === 0,
    '2. Kodda sabit tarih yok ("bugün" getTodayStr() ile gelir)',
    tarihIhlal.length + ' yer:\n         ' + tarihIhlal.slice(0, 12).join('\n         ') +
    '\n       Sabit "bugün" yalnızca ekranı değil KAYITLARI da bozar.');

  check(/function getTodayStr\(\)/.test(APP),
    '3. getTodayStr() tanımlı', 'tek "bugün" kaynağı yok');

  // --- 3. Silinmis demo sabitlerine referans ---------------------------------
  const SILINEN = ['DEFAULT_AIRBNB_PROPERTIES', 'DEFAULT_INFLUENCER_COLLABS',
                   'DEFAULT_MARKETING_CAMPAIGNS', 'DEFAULT_MAINT', 'DEFAULT_LEADS',
                   'DEFAULT_BOOKINGS', 'DEFAULT_VILLAS', 'DEFAULT_EXPENSES',
                   'DEFAULT_TARGETS_BY_MONTH', 'COMPANY_EXCEL_DATABASE', 'SYNTHETIC_DEMO_DATABASE'];
  const oluRef = [];
  kodSatirlari(APP).forEach(({ n, l }) => {
    SILINEN.forEach(s => { if (l.includes(s)) oluRef.push(`app.js:${n} — ${s}`); });
  });
  check(oluRef.length === 0,
    '4. Silinmiş demo sabitlerine referans kalmamış',
    oluRef.join('\n         ') + '\n       Bu kod yolları çalıştığında ReferenceError fırlatır.');

  // --- 4. Acilir listelerde sabit mulk ---------------------------------------
  // Her villa secicisi updateAllVillaDropdowns() tarafindan yenilenmelidir.
  const kapsamBas = APP.indexOf('const dropdownIds = [');
  const kapsam = kapsamBas === -1 ? '' : APP.slice(kapsamBas, APP.indexOf('];', kapsamBas));
  const secicilerRe = /<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g;
  const yenilenmeyen = [];
  let m;
  while ((m = secicilerRe.exec(HTML))) {
    const id = m[1];
    if (!/[Vv]illa/.test(id)) continue;
    if (!kapsam.includes("'" + id + "'")) yenilenmeyen.push(id);
  }
  check(yenilenmeyen.length === 0,
    '5. Villa seçicilerinin tamamı updateAllVillaDropdowns kapsamında',
    'kapsam dışı: ' + yenilenmeyen.join(', ') +
    '\n       Kapsam dışı seçici markup\'taki sabit listeyi kalıcı olarak gösterir.');

  // --- 5. Donem secicilerinde sabit ay listesi -------------------------------
  const ayOption = (HTML.match(/<option value="[12][0-9]{3}-[0-9]{2}"/g) || []).length;
  check(ayOption === 0,
    '6. Dönem seçicileri markup\'ta sabit ay listesi taşımıyor',
    ayOption + ' sabit ay <option> var. Liste müşterinin veri aralığından ' +
    'üretilmelidir (refreshPeriodSelectors); aksi halde 2024 verisi olan müşteri ' +
    'o ayları hiç seçemez.');

  // --- 6. Uydurulmus rakamlar -------------------------------------------------
  const RAKAM = ['5.004.165', '1.420.000', '88/100', '75.519', '2.826', '138.190', '457 Gece'];
  const rakamIhlal = [];
  for (const [ad, kaynak] of [['app.js', APP], ['index.html', HTML]]) {
    kodSatirlari(kaynak).forEach(({ n, l }) => {
      RAKAM.forEach(r => { if (l.includes(r)) rakamIhlal.push(`${ad}:${n} — ${r}`); });
    });
  }
  check(rakamIhlal.length === 0,
    '7. İlk müşterinin rakamları metinlere gömülü değil',
    rakamIhlal.join('\n         ') +
    '\n       Bu rakamlar hesaplanmıyordu; boş bir hesapta bile görünüyorlardı.');

  // --- 7. "Yoksa uydur" kalibi ------------------------------------------------
  check(!/gaps\.length\s*<\s*3\)\s*\{[\s\S]{0,80}gaps\.push\(/.test(APP),
    '8. Gerçek boşluk gecesi yoksa uydurulmuyor',
    'detectGapNights() hâlâ eksik kayıt yerine sahte kayıt üretiyor olabilir.');

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

run();
