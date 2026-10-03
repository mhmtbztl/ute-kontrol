# A3/A4 ekran denetimi düzeltme raporu

Tarih: 3 Ekim 2026
Dal: `codex/a5`

## Kapatılan bulgular

- L-109: boş gece indirimi güncel boşluklardan hesaplanıyor; eski/geçersiz önbelleğe bağlı değil.
- L-130: geciken ve denetim bekleyen temizlikler operasyon ekranında; yeniden açılan geçmiş işler personel ekranında görünür.
- L-131: kampanya, hedef, dönem listeleme/silme, toplam ve eş dönem trendi Reklamlar ekranına eklendi.
- L-132: reklam harcaması seçili döneme gün bazında paylaştırılıyor.
- L-133: takip saati Europe/Istanbul sözleşmesiyle kayıpsız; geciken açık takipler “bugün” listesinde.
- L-134: satış rolüne net kâr gösterilmiyor; gider yoksa yönetimde kâr “ölçülemedi”.
- L-135: hedef, satılan ciro ve açık geceler aynı seçili ayı kullanıyor.
- L-136: biten işler aktif listeden çıkarıldı; genel görev başlat/tamamla, temizlik “yapılmadı”, yönetici kalem denetimi ve alt kontroller bağlandı.
- L-137: reklam döneminden türeyen gider Finans ekranında elle düzenlenip silinemiyor.
- L-138: reklam içe aktarımı phase82 ile tek transaction; dönem çakışması eşzamanlı yazmada da veritabanı tekilliğiyle engelleniyor.
- L-139: hızlı kayıtta kaynak boş ve zorunlu; WhatsApp kaydı da aynı atomik hızlı kayıt yolunu kullanıyor.
- L-140: Bugün ekranındaki “Bu ay” gerçek takvim ayından hesaplanıyor.
- L-141: A4 süitleri standart özet üretiyor; gider şablonları arayüze bağlandı; yedek/geri yükleme süreci özetten sonra açık kalmıyor; güncel test sayıları belgelendi.
- L-150: arıza çözme yazımından sonra çalışan ilgisiz mülk sahibi bloğu kaldırıldı; başarılı çözüm artık hata gibi gösterilmiyor ve liste yenileniyor.
- L-151: hızlı kayıt, düzenleme, yerel kayıt ve rapor görünümü aynı talep kanalı sözleşmesini kullanıyor; `Telefon`/`Phone` kayıtları `Phone` altında birleşiyor.
- L-152: personel RPC aralığı son 60 günle sınırlandı; sunucunun 62 günlük kapısı aşılmıyor ve INSPECTED kartı “Onaylandı” yazıyor.
- L-153: phase86, gider şablonu tenant yetkisini kayıt araması/kilidinden önce doğruluyor ve phase84'ün eski imzasını oturumlu role kapatıyor.
- L-154: phase82 için gerçek veritabanı atomiklik/eşzamanlılık/rol/sıfırlama süiti ve üretim öncesi salt-okunur çakışma sorgusu eklendi.
- L-155: gider şablonu yazmaları hata mesajı gösteriyor, silmede etkilenen satırı doğruluyor ve gider üretimi finans önbelleğini temizliyor.
- L-156: bugün tamamlanan temizlik, ödeme durumundan bağımsız olarak Operasyon › Bugün grubunda görünür kalıyor.

## Yeni göçler

- `migration_phase82_ads_atomic_import.sql`: atomik reklam dönemi içe aktarımı ve yarışa dayanıklı gün tekilliği.
- `migration_phase84_expense_template_generation.sql`: gider şablonundan seçili aya atomik gider ve occurrence üretimi.
- `migration_phase86_expense_template_authz.sql`: phase84 RPC'sinin tenant yetkisini kayıt kilidinden önce doğrulayan güvenlik düzeltmesi.
- `migration_phase88_ads_update_trigger_cleanup.sql`: phase82'nin UPDATE sırasında aynı gün satırlarını iki kez senkronlayan yinelenen tetikleyicisini kaldırır.

Phase82, phase84, phase86 ve phase88 ayrı Supabase test projesine uygulandı. Hiçbiri üretime uygulanmadı. Üretimde phase82 öncesi `preflight_phase82_ads_overlap.sql` sıfır satır dönmeli; phase84 ve phase86 aynı bakım adımında, ardından phase88 uygulanmalıdır.

## Doğrulama

- Çevrimdışı: 197/197 süit, 1893/1893 iddia.
- Canlı test projesi: phase88 öncesi tam paket 240/240 süit ve 2726/2726 iddia; phase88 sonrası etkilenen phase82 canlı süiti 7/7 geçti. Son tam tekrar Auth hız sınırına kadar 222 süit yeşildi; ürün iddiasına ulaşmadan girişte sınırlanan beş süit daha sonra tek tek yeniden çalıştırıldı: phase53 47/47, phase55 37/37, phase57 25/25, phase59 43/43 ve yedek/geri yükleme 11/11 geçti. Temizlik ve sızıntı denetimleri de temiz kaldı.
- Tarayıcı: 8 akış, 4 rol, 390 px ve konsol kapısı geçti.
- Göç zinciri: `schema.sql` + 74 göç, hash ve bağımlılık sırası geçti.
- Varlık damgaları güncel.
