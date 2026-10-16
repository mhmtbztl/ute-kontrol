# Zengin Operasyon Kontrol Listeleri — Uygulama Planı

Spesifikasyon: `SPEC-rich-checklists.md`

Durum: Tamamlandı; phase96 yalnız test projesine uygulandı, üretim onayı bekliyor.

## RC-01 — Ortak veri sözleşmesi

1. Zengin ve eski dizi biçimli kontrol listelerini tek bir kanonik yapıya
   dönüştüren saf yardımcıları ekle.
2. Bozuk veriyi sessizce boş listeye çevirmeyen doğrulama sonucu üret.
3. `important` maddeler ve alt kontroller için tamamlanabilirlik kuralını
   testlerle sabitle.
4. `operations_engine` anlık görüntü seçimini zengin biçimi koruyacak şekilde
   düzelt; eski biçimi desteklemeyi sürdür.

Doğrulama: odak birim testleri.

## RC-02 — Görsel şablon düzenleyici

1. Mevcut metin alanını ad, tür, mülk kapsamı, bölüm, madde, alt kontrol,
   önemli işareti ve malzeme satırları olan erişilebilir düzenleyiciyle değiştir.
2. Oluşturma/düzenleme/aktiflik akışlarını aynı kanonik sözleşmeye bağla.
3. Eski kayıtları kayıpsız aç; doğrulanamayan kaydı salt okunur hata durumunda
   tut.

Doğrulama: ayar ekranı statik/birim testleri ve 390 px tarayıcı akışı.

## RC-03 — Temizlik yürütme doğrulaması

1. Genel + mülk şablonu birleşimini arayüzde önizle.
2. Atama, ara kayıt, malzeme durumu, Z imza ve M onay/yeniden açma akışlarını
   yeni düzenleyici verisiyle doğrula.
3. Kritik eksiklerin Z imzayı engellemesini istemci ve sunucu sınırlarında
   uygula.

Doğrulama: temizlik workflow testleri; veritabanı değişirse test projesi canlı
testleri.

## RC-04 — Misafir öncesi son kontrol

1. Rezervasyon operasyon motorunda `CHECKIN_PREP` için zengin anlık görüntü
   oluştur.
2. Atanan personelin genel görev kartında bölümleri/alt kontrolleri görmesini,
   ara kaydetmesini ve kritik maddeler tamamlanınca bitirmesini sağla.
3. Mevcut dar RPC yeterli değilse, yalnız atanan kullanıcıya açık yeni bir RPC
   için yeni çift numaralı migration ekle ve manifesti güncelle.

Doğrulama: motor, güvenlik, personel UI ve gerekiyorsa test-projesi canlı
testleri.

## RC-05 — Teslim kapıları

1. Klavye, etiket, odak, hata ve 390 px davranışını doğrula.
2. `npm test`, `npm run verify:migrations`, `node stamp_assets.js --check`
   çalıştır.
3. Yalnız bu işe ait dosyaları adıyla stage edip commit/push için raporla.
