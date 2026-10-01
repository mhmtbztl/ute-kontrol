# Reklam verisi içe aktarma rehberi

Lexbnb reklam verisini kampanya ve en fazla 31 günlük dönem düzeyinde alır. Uzun toplamlar aylara güvenilir biçimde dağıtılamadığı için kabul edilmez. Tercih edilen aralık haftalık (Pazartesi–Pazar) veya tek aydır.

## Meta Ads

1. Meta Ads Manager’da **Kampanyalar** tablosunu açın ve tarih aralığını en fazla 31 gün seçin.
2. Sütunlarda kampanya adı, sonuçlar, sonuç göstergesi, erişim, harcanan tutar, gösterim ve bağlantı tıklamalarını bulundurun.
3. Tabloyu CSV olarak dışa aktarın. Lexbnb Türkçe Meta dışa aktarımındaki şu başlıkları doğrular: `Rapor Başlangıcı`, `Rapor Sonu`, `Kampanya Adı`, `Sonuçlar`, `Sonuç Göstergesi`, `Erişim`, `Harcanan Tutar (TRY)`, `Gösterim`, `Bağlantı Tıklamaları`.
4. Dosyayı önce önizleyin. `Sonuç Göstergesi` mesajlaşma başlatmayı gösteriyorsa sonuç mesaj, `click_to_call` gösteriyorsa arama sayılır; diğer sonuçlar mesaj/arama diye yorumlanmaz.

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
