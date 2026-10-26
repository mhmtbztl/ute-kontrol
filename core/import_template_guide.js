/**
 * LEXBNB — SABLON REHBERI VE GECERLI DEGERLER (L-194, kullanici M24)
 *
 * Sablonlardaki "Villa", "Kanal", "Kategori" elle yaziliyor; yanlis yazilan
 * satir reddediliyor ama dogru degerleri dosyanin hicbir yerinde gormek
 * mumkun degildi. Bu modul iki seyi uretir:
 *
 *   * NASIL DOLDURULUR — adim adim talimat,
 *   * GECERLI DEGERLER — bu isletmenin mulk kodlari, kanallari, gider
 *     kategorileri ve izinli durum/tur degerleri.
 *
 * Uygulama ici sablon (app.js downloadSampleTemplate) isletmenin kendi
 * degerleriyle, yayinlanan statik sablon (scripts/build_sample_templates.js)
 * genel degerlerle ayni metni uretir. Saf modul: DOM ve ag yok.
 */
(function (kok, fabrika) {
  const modul = fabrika();
  if (typeof module === 'object' && module.exports) module.exports = modul;
  else kok.ImportTemplateGuide = modul;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Sistem kanallari (app.js DEFAULT_BOOKING_CHANNELS ile ayni kodlar;
  // g9_feedback_tests L-194 ikisini karsilastirir). Statik sablon isletmenin
  // kendi kanallarini bilemez, bunlari ornek olarak listeler.
  const SISTEM_KANALLARI = [
    { code: 'WHATSAPP', displayName: 'WhatsApp' },
    { code: 'AIRBNB', displayName: 'Airbnb' },
    { code: 'BOOKING', displayName: 'Booking.com' },
    { code: 'INSTAGRAM', displayName: 'Instagram' },
    { code: 'WEBSITE', displayName: 'Website' },
    { code: 'REPEAT', displayName: 'Tekrar Misafir' },
    { code: 'PHONE', displayName: 'Telefon' }
  ];

  const DURUMLAR = [
    ['CONFIRMED', 'Onaylı (henüz giriş yapmadı)'],
    ['CHECKED_IN', 'Konaklıyor'],
    ['CHECKED_OUT', 'Çıkış yaptı (tamamlandı)'],
    ['CANCELLED', 'İptal (ciroya girmez)']
  ];

  const TURLER = [
    ['OPEX', 'İşletme gideri (boşsa bu sayılır)'],
    ['CAPEX', 'Yatırım / demirbaş']
  ];

  const YER_TUTUCU_NOTU = 'Yer tutucu — kendi mülk kodunuzu yazın. Kodlarınız hazır yazılı şablon için: uygulamada Veri ve yardım › Excel / CSV yükle › "Kendi mülk kodlarınızla hazır şablon".';

  function mulkSatirlari(mulkler) {
    if (!mulkler || !mulkler.length) {
      return [['MULK_KODU_1', YER_TUTUCU_NOTU], ['MULK_KODU_2', YER_TUTUCU_NOTU]];
    }
    return mulkler.map(m => [m.code, m.name || '']);
  }

  // Uygulama ici sablonun veri sayfasi yalniz basliktir (L-278); yayinlanan
  // sablonda yer tutuculu ornek satirlar vardir.
  function adim1(yalnizBaslik, ek) {
    return yalnizBaslik
      ? 'ADIM 1 — İlk sayfada yalnız başlık satırı var; kayıtlarınızı başlığın altına, her kayıt bir satır olacak şekilde yazın. ' + ek + ' Örnek bir satır bu sayfanın sonunda.'
      : 'ADIM 1 — İlk sayfadaki örnek satırları silin ya da üzerine yazın. ' + ek;
  }

  function rezervasyonAdimlari(genel, yalnizBaslik) {
    return [
      'LEXBNB — REZERVASYON DEFTERİ ŞABLONU · NASIL DOLDURULUR',
      '',
      adim1(yalnizBaslik, 'Başlık satırına dokunmayın: DOSYANIN İLK SATIRI olmalı, üstüne başlık eklemeyin.'),
      'ADIM 2 — Her rezervasyon bir satırdır. ZORUNLU: Villa, Misafir Adı, Giriş Tarihi, Çıkış Tarihi, Brüt Tutar. Diğer sütunları boş bırakabilir ya da silebilirsiniz.',
      genel
        ? 'ADIM 3 — "Villa": kendi mülk kodunuzu yazın. MULK_KODU_1 / MULK_KODU_2 yalnız yer tutucudur; değiştirmezseniz o satırlar kaydedilmez (bilerek: yanlış mülke kayıt girmesin).'
        : 'ADIM 3 — "Villa": GEÇERLİ DEĞERLER sayfasındaki mülk KODUNU ya da ADINI aynen yazın. Listede olmayan mülkün satırı kaydedilmez.',
      'ADIM 4 — "Kanal": GEÇERLİ DEĞERLER sayfasındaki kanal kodu ya da adı (büyük/küçük harf önemsiz: airbnb = AIRBNB). Boşsa doğrudan satış sayılır. Listede olmayan kanalın satırı kaydedilmez ve nedeni yazılır.',
      'ADIM 5 — Tarih: 2026-07-15 ya da 15.07.2026. Tutar: 72500 ya da 72.500,50. Gece sayısı tarihlerden hesaplanır.',
      'ADIM 6 — "Brüt Tutar" misafirin ödediği toplamdır. "Misafirden Temizlik Ücreti" bunun İÇİNDEDİR ve ayrı gelir olarak raporlanır. Personele ödenen temizlik MALİYETİ bu dosyaya yazılmaz; geçmiş temizlik maliyetleri için Geçmiş Temizlik şablonunu kullanın.',
      'ADIM 7 — "OTA Komisyonu" gider olarak yazılır, ciroyu düşürmez. "Oda İndirimi" yalnız oda gelirinden düşer.',
      'ADIM 8 — "Durum": GEÇERLİ DEĞERLER sayfasındaki değerlerden biri; boşsa CONFIRMED.',
      'ADIM 9 — Kaydedip Veri ve yardım › Excel / CSV yükle ekranına bırakın. Önizlemede her hatalı satırı ve nedenini görürsünüz; onaylamadan hiçbir şey kaydedilmez.',
      '',
      'Elinizde başka biçimde bir tablo mu var? Aynı ekrandaki "Tablomu şablona çevir (ChatGPT)" düğmesi, tablonuzu bu sütunlara çevirecek hazır bir istem kopyalar.'
    ];
  }

  function giderAdimlari(genel, yalnizBaslik) {
    return [
      'LEXBNB — GİDER DEFTERİ ŞABLONU · NASIL DOLDURULUR',
      '',
      adim1(yalnizBaslik, 'Başlık satırı DOSYANIN İLK SATIRI olmalı.'),
      'ADIM 2 — Her gider bir satırdır. ZORUNLU: Tarih, Kategori, Tutar.',
      'ADIM 3 — "Kategori": GEÇERLİ DEĞERLER sayfasındaki kategorilerden birini yazın (büyük/küçük harf önemsiz). Listede olmayan kategorinin satırı kaydedilmez ve nedeni yazılır — "Diğer"e sessizce düşmez.',
      genel
        ? 'ADIM 4 — "Villa": boş ya da ALL ise gider tüm portföye yazılır. Tek mülke yazmak için kendi mülk kodunuzu girin; MULK_KODU_1 / MULK_KODU_2 yer tutucudur, değiştirmezseniz o satır kaydedilmez.'
        : 'ADIM 4 — "Villa": boş ya da ALL ise gider tüm portföye yazılır. Tek mülke yazmak için GEÇERLİ DEĞERLER sayfasındaki mülk kodunu ya da adını yazın.',
      'ADIM 5 — "Tür": OPEX (işletme gideri) ya da CAPEX (yatırım). Boşsa OPEX.',
      'ADIM 6 — Tarih: 2026-07-03 ya da 03.07.2026. Tutar: 18000 ya da 18.000,50.',
      'ADIM 7 — Temizlik personeline ödenen tutar buraya GİRİLMEZ: yeni temizlikler görevden gider yazılır, GEÇMİŞ temizlikler için Geçmiş Temizlik şablonunu kullanın. Reklam harcamasını Kanallar ve Pazarlama ekranından girin; burada da girilirse iki kez sayılır.',
      'ADIM 8 — Kaydedip Veri ve yardım › Excel / CSV yükle ekranına bırakın. Önizlemede hatalı satırları ve nedenini görürsünüz; onaylamadan hiçbir şey kaydedilmez.'
    ];
  }

  function temizlikAdimlari(genel, yalnizBaslik) {
    return [
      'LEXBNB — GEÇMİŞ TEMİZLİK ŞABLONU · NASIL DOLDURULUR',
      '',
      'Ne için: Lexbnb\'ye geçmeden önceki temizliklerin MALİYETİNİ girmek için. Rezervasyonu girilmiş ama temizlik görevi olmayan aylarda temizlik maliyeti 0 görünür ve kâr olduğundan yüksek çıkar.',
      '',
      adim1(yalnizBaslik, 'Başlık satırı DOSYANIN İLK SATIRI olmalı.'),
      'ADIM 2 — Her yapılmış temizlik bir satırdır. ZORUNLU: Tarih, Villa, Tutar.',
      'ADIM 3 — "Tutar": personele ödenen (ya da ödenecek) temizlik MALİYETİ. Misafirden alınan temizlik ücreti DEĞİL; o rezervasyon defterine yazılır.',
      genel
        ? 'ADIM 4 — "Villa": kendi mülk kodunuzu yazın. MULK_KODU_1 / MULK_KODU_2 yer tutucudur; değiştirmezseniz o satırlar kaydedilmez.'
        : 'ADIM 4 — "Villa": GEÇERLİ DEĞERLER sayfasındaki mülk KODUNU ya da ADINI aynen yazın.',
      'ADIM 5 — "Tarih": temizliğin yapıldığı gün; yalnız bugün ve öncesi. Maliyet bu günün ayına yazılır. Kapatılmış aya yazılamaz.',
      'ADIM 6 — "Ödendi": EVET ya da HAYIR; boşsa EVET. HAYIR yazarsanız temizlik yapılmış ama ödenmemiş sayılır ve personel borcu olarak görünür.',
      'ADIM 7 — Aynı mülkte aynı gün zaten bir temizlik görevi varsa o satır kaydedilmez (maliyet iki kez sayılmasın); var olanı Operasyon › Temizlik\'ten "yapıldı" işaretleyin.',
      'ADIM 8 — "Temizlikçi" ve "Açıklama" isteğe bağlı.',
      'ADIM 9 — Veri ve yardım › Excel / CSV yükle ekranına bırakın, türü "Geçmiş temizlik" seçin. Önizlemede hatalı satırları ve nedenini görürsünüz. Yanlış dosya yüklediyseniz aynı ekrandan tek tuşla geri alabilirsiniz.'
    ];
  }

  /**
   * mode: 'BOOKINGS' | 'EXPENSES' | 'CLEANING'
   * veri: { properties: [{code, name}], channels: [{code, displayName, isActive}],
   *         categories: [{name, label}] }  — properties bossa genel (statik) sablon.
   * Donus: { steps: [satir], validValues: [[hucre]] }
   */
  function buildGuide(mode, veri) {
    const v = veri || {};
    const genel = !(v.properties && v.properties.length);
    const satirlar = [];
    if (mode === 'BOOKINGS') {
      satirlar.push(['MÜLKLER — "Villa" sütununa KODU ya da ADI yazın'], ['Kod', 'Ad']);
      mulkSatirlari(v.properties).forEach(r => satirlar.push(r));
      const kanallar = (v.channels && v.channels.length ? v.channels : SISTEM_KANALLARI).filter(c => c && c.isActive !== false);
      satirlar.push([], [genel ? 'KANALLAR — "Kanal" sütununa KODU ya da ADI yazın (sistem kanalları; kendi eklediğiniz kanallar uygulama içi şablonda görünür)' : 'KANALLAR — "Kanal" sütununa KODU ya da ADI yazın'], ['Kod', 'Ad']);
      kanallar.forEach(c => satirlar.push([c.code, c.displayName || c.code]));
      satirlar.push([], ['DURUM — "Durum" sütunu'], ['Değer', 'Anlamı']);
      DURUMLAR.forEach(r => satirlar.push(r));
      return { steps: rezervasyonAdimlari(genel, v.headerOnly === true), validValues: satirlar };
    }
    if (mode === 'CLEANING') {
      satirlar.push(['MÜLKLER — "Villa" sütununa KODU ya da ADI yazın'], ['Kod', 'Ad']);
      mulkSatirlari(v.properties).forEach(r => satirlar.push(r));
      satirlar.push([], ['ÖDENDİ — "Ödendi" sütunu'], ['Değer', 'Anlamı'], ['EVET', 'Ödendi (boş da EVET sayılır)'], ['HAYIR', 'Yapıldı ama ödenmedi — personel borcu']);
      return { steps: temizlikAdimlari(genel, v.headerOnly === true), validValues: satirlar };
    }
    satirlar.push(['KATEGORİLER — "Kategori" sütununa KATEGORİ adını yazın'], ['Kategori', 'Neleri kapsar']);
    (v.categories || []).forEach(c => satirlar.push([c.name, c.label || c.name]));
    satirlar.push([], ['MÜLKLER — "Villa" sütunu (boş ya da ALL = tüm portföy)'], ['Kod', 'Ad'], ['ALL', 'Tüm portföy']);
    mulkSatirlari(v.properties).forEach(r => satirlar.push(r));
    satirlar.push([], ['TÜR — "Tür" sütunu'], ['Değer', 'Anlamı']);
    TURLER.forEach(r => satirlar.push(r));
    return { steps: giderAdimlari(genel, v.headerOnly === true), validValues: satirlar };
  }

  return { buildGuide, SISTEM_KANALLARI, DURUMLAR, TURLER };
});
