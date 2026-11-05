# Reklam verisi içe aktarma rehberi

Lexbnb reklam verisini kampanya ve en fazla 31 günlük dönem düzeyinde alır. Uzun toplamlar aylara güvenilir biçimde dağıtılamadığı için kabul edilmez. Tercih edilen aralık haftalık (Pazartesi–Pazar) veya tek aydır.

## Meta Ads

1. Meta Ads Manager’da **Kampanyalar** tablosunu açın ve tarih aralığını en fazla 31 gün seçin.
   Grafiklerde günlük eğri için **Döküm → Zaman → Gün** seçin; o zaman aralık uzun olabilir, her satır bir gündür.
2. **Dışa aktar → CSV** (Excel'de açıp yeniden kaydetmeyin; kaydederseniz de okunur).
3. Zorunlu sütunlar: `Kampanya Adı`, `Harcanan Tutar (TRY)` ve ya `Rapor Başlangıcı` + `Rapor Sonu` ya da `Gün`.
   Okunan diğer sütunlar: `Sonuçlar`, `Sonuç Göstergesi`, `Gösterim`, `Erişim`, `Bağlantı Tıklamaları`,
   `Reklam Seti Bütçesi`, `Reklam Seti Bütçe Türü`, `Kampanya yayını`. İngilizce arayüzün karşılıkları
   (`Campaign name`, `Amount spent (TRY)`, `Reporting starts`, `Day` …) da kabul edilir.
   Dosyada olmayan sütun **ölçülmedi** sayılır, 0 yazılmaz. Meta'nın varsayılan Kampanyalar görünümünde
   `Bağlantı Tıklamaları` yoktur; tıklama ve CTR için Sütunlar → Özelleştir ile ekleyin.
4. Dosyayı önce önizleyin. `Sonuç Göstergesi` mesajlaşma başlatmayı gösteriyorsa sonuç mesaj, `click_to_call` gösteriyorsa arama sayılır; profil ziyareti, açılış sayfası görüntüleme gibi diğer sonuçlar adıyla gösterilir ama mesaj/arama diye yorumlanmaz.
5. Harcama TRY dışında bir para birimindeyse dosya reddedilir (gider deftere TL yazılır).
   Reklam seti düzeyi dosyada aynı kampanya ve dönemin satırları toplanır; erişim tekil kişi sayısı olduğu için toplanmaz.

Meta’nın işletme yardım sayfaları oturum isteyebilir. Uygulamadaki sütun eşlemesi, kullanıcının gerçek Meta CSV’siyle de doğrulanmıştır.

Resmî kaynak: [Meta Business Help Center — Ads reporting](https://www.facebook.com/business/help/158662536425974)

## Google Ads

1. Google Ads’te **Kampanyalar** sayfasını açın.
2. Tarih aralığını en fazla 31 gün seçin; istatistik tablosunu kampanya düzeyinde düzenleyin.
3. İndirme düğmesinden CSV seçin. Google, istatistik tablosunun sütun/filtre/tarih ayarlarının indirilen rapora taşındığını ve CSV dâhil çeşitli biçimleri desteklediğini belgeliyor.
4. Lexbnb’e henüz yalnız günlük grafik dışa aktarımı verilmiştir; bu dosyada kampanya, tıklama ve arama sonucu bulunmadığından içe aktarılamaz. Google Ads **Kampanyalar** raporu örneği doğrulanana kadar Google CSV ayrıştırması kapalıdır.

Resmî kaynaklar: [Kampanya performansını görüntüleme ve indirme](https://support.google.com/google-ads/answer/2404036?hl=tr), [İstatistik tablosundan rapor oluşturma](https://support.google.com/google-ads/answer/2404176?hl=tr)

## ChatGPT ekran görüntüsü yolu

ChatGPT’ye verilen ekran görüntüsü yalnız aşağıdaki biçime dönüştürülür; Lexbnb otomatik kaydetmez, önce önizleme ve kullanıcı onayı ister.

```text
LEXBNB_REKLAM_V2
platform;kampanya;baslangic;bitis;sonuc_turu;harcama;gosterim;tiklama;mesaj;arama
META;Kış Villa Reels;2026-10-05;2026-10-11;MESAJ;4250,50;38000;912;41;
```

Boş hücre “ölçülmedi”, `0` gerçek sıfırdır. Kampanya bazında rezervasyon, ciro veya ROAS üretilmez; böyle bir atıf bu veriyle ölçülemez.
