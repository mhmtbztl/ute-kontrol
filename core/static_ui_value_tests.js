/**
 * LEXBNB STATİK ARAYÜZ DEĞERİ DENETİMİ
 *
 * 2026-09-12 oturumunda bulunan hatalarin BUYUK COGUNLUGU tek bir kaliptandi:
 * index.html'de veri gibi duran, ama hicbir kodun yazmadigi sabit degerler.
 * Musteri onlari olculmus gercek sanip is karari veriyordu.
 *
 * Yakalananlardan bazilari:
 *   pricingAdrVal      "₺16.500"   her musteriye ayni ADR
 *   opsReadyPropsVal   "5 / 5"     eski 5 villalik demo portfoy
 *   opsSlaVal          "%100"      her zaman mukemmel SLA
 *   finRevMoM          "↑ %12"     olculmemis "gecen aya gore" trendi
 *   onboardProgressPct "%100"      sifir mulklu hesapta "kurulum tamam"
 *   brOpMargin         "%30,3"     bir alt satiri kendini yalanliyordu
 *
 * Bu denetim kalibin tamamini kapatir: icinde SAYI gecen ve id'si olan her
 * eleman ya JS tarafindan yazilmali, ya da notr bir yer tutucu olmalidir
 * ("—", "0", bos). Yeni bir sabit deger eklenirse bu test kirilir.
 *
 * ISTISNALAR: yalnizca gercekten sabit olan metinler (surum numarasi, klavye
 * kisayolu, mevzuat metni gibi) ALLOWLIST'e eklenmelidir - ve eklerken neden
 * sabit oldugu yazilmalidir.
 */

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// Sabit kalmasi MESRU olan id'ler. Her biri gerekcesiyle birlikte.
const ALLOWLIST = {};

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };

// JS bu id'ye dokunuyor mu?
function jsWritesId(id) {
  return APP.includes("'" + id + "'") || APP.includes('"' + id + '"') || APP.includes('`' + id + '`');
}

// Notr yer tutucu mu? (veri iddiasi tasimayan)
function isNeutral(text) {
  const t = text.trim();
  if (!t) return true;
  if (/^[—\-–…\s]+$/.test(t)) return true;
  if (/^[₺%]?\s*0([.,]0+)?\s*[A-Za-zÇĞİÖŞÜçğıöşü%]*$/.test(t)) return true;  // 0, ₺0, %0, "0 Gece"
  if (/^0\s*\/\s*0$/.test(t)) return true;
  return false;
}

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB STATİK ARAYÜZ DEĞERİ DENETİMİ');
  console.log('=============================================================================\n');

  // KURAL: HTML'deki baslangic degeri, kullanicinin JS calisana kadar -ve o
  // render yolu hic calismazsa kalici olarak- gordugu seydir. Bu yuzden id'si
  // olan ve sayi iceren HER eleman notr baslamalidir; JS'in onu sonradan
  // yazmasi yeterli DEGILDIR. onboardProgressPct tam boyleydi: HTML'de "%100"
  // yaziyordu, JS de yaziyordu ama "undefined" yaziyordu.
  const yazilmayan = [];
  const bayatBaslangic = [];
  const izinli = [];

  for (const m of HTML.matchAll(/<(span|strong|div|td|h[1-6]|p|b)\b[^>]*\sid="([^"]+)"[^>]*>([^<]{1,80})</g)) {
    const id = m[2];
    const metin = m[3].trim();

    if (!metin || !/[0-9]/.test(metin)) continue;   // sayi yoksa veri iddiasi degil
    if (isNeutral(metin)) continue;                 // notr yer tutucu, sorun yok

    if (ALLOWLIST[id]) { izinli.push(`${id} (${ALLOWLIST[id]})`); continue; }

    if (jsWritesId(id)) bayatBaslangic.push({ id, metin: metin.slice(0, 55) });
    else yazilmayan.push({ id, metin: metin.slice(0, 55) });
  }

  const dok = list => list.map(v => `         ${v.id.padEnd(26)} = "${v.metin}"`).join('\n');

  if (yazilmayan.length === 0) {
    ok('1. Sayı içeren her id JS tarafından yazılıyor');
  } else {
    no('1. Sayı içeren her id JS tarafından yazılıyor',
      yazilmayan.length + ' id hiç yazılmıyor:\n' + dok(yazilmayan) +
      '\n       Bir render fonksiyonuna baglayin, notr yer tutucu yapin ("—"),' +
      '\n       ya da gercekten sabitse gerekcesiyle ALLOWLIST\'e ekleyin.');
  }

  if (bayatBaslangic.length === 0) {
    ok('2. JS ile yazılan hiçbir alan bayat bir başlangıç değeriyle başlamıyor');
  } else {
    no('2. JS ile yazılan hiçbir alan bayat bir başlangıç değeriyle başlamıyor',
      bayatBaslangic.length + ' id sahte bir baslangic degeri tasiyor:\n' + dok(bayatBaslangic) +
      '\n       JS bunlari sonradan yaziyor olabilir, ama kullanici o ana kadar' +
      '\n       -ve render hic calismazsa kalici olarak- bu uydurma degeri gorur.' +
      '\n       HTML\'deki baslangici "—" veya 0 yapin.');
  }

  // Allowlist'in cürümesini engelle: artik var olmayan id'ler listede kalmasin
  const olu = Object.keys(ALLOWLIST).filter(id => !HTML.includes('id="' + id + '"'));
  if (olu.length === 0) ok('3. İstisna listesinde ölü kayıt yok');
  else no('3. İstisna listesinde ölü kayıt yok', 'artik HTML\'de olmayan: ' + olu.join(', '));

  // L-68: Onceki tarama yalnizca `id` tasiyan elemanlari goruyordu. Boylece
  // `<div class="kpi-value">9.3</div>` veya id'siz "%60,8 marj rekoru"
  // metinleri denetimden tamamen kaciyordu. Script/style/yorumlari attiktan
  // sonra gorunur HTML'nin TAMAMINI tara. Bu liste urun verisi gibi gorunen,
  // fakat herhangi bir kayda dayanmayan eski demo iddialarini temsil eder.
  const gorunurHtml = HTML
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ');
  const idlessDemoPatterns = [
    ['kanal puanı', /\b9[,.]3\s*\/\s*10\b/],
    ['kanal iptal oranı', /İptal:\s*%12\b/i],
    ['Google puanı', /\b4[,.]9\s*★/],
    ['Google yorum/arama sayısı', /\b124\s+Yorum\b|\b1[.]800\s+Arama\b/i],
    ['Airbnb portföy puanı', /\b4[,.]97\s+Portföy Puanı\b/i],
    ['yıllık hedef ciro', /₺\s*4[.]800[.]000\b/],
    ['uzatma dönüşümü', /UZATMA DÖNÜŞÜMÜ\s*%45\b/i],
    ['uydurma marj rekoru', /%60[,.]8\s+operasyonel marj rekoru/i],
    ['ürün dışı SaaS iş planı', /SaaS Olarak Kiralama|Aylık Pasif Gelir Potansiyeli/i],
    ['sabit OTA komisyon etiketi', /OTA\s*-\s*%1[58]\b/i]
  ];
  const idlessBulunan = idlessDemoPatterns.filter(([, desen]) => desen.test(gorunurHtml));
  if (idlessBulunan.length === 0) {
    ok('4. Kimliksiz görünür metinlerde demo rakamı veya iş planı yok');
  } else {
    no('4. Kimliksiz görünür metinlerde demo rakamı veya iş planı yok',
      idlessBulunan.map(([ad]) => ad).join(', ') +
      '\n       Bu denetim id taşımayan görünür metinleri de kapsar.');
  }

  const channelTruthful = /if\s*\(tabId\s*===\s*['"]channels['"]\)\s*renderOtaRadar\(\)/.test(APP)
    && !/savedComm\s*\+=|gross\)\s*\|\|\s*0\)\s*\*\s*0[.]15/.test(APP);
  if (channelTruthful) {
    ok('5. Kanal ekranı açılışta render ediliyor ve varsayımsal %15 tasarruf üretmiyor');
  } else {
    no('5. Kanal ekranı açılışta render ediliyor ve varsayımsal %15 tasarruf üretmiyor',
      'channels sekmesi renderOtaRadar yoluna bağlı olmalı; doğrudan cirodan sabit oranlı tasarruf türetilmemeli.');
  }

  // Bilgi amacli
  if (izinli.length) {
    console.log('\n  İstisna tutulanlar:');
    izinli.forEach(x => console.log('    - ' + x));
  }

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

run();
