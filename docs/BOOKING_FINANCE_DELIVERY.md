# Rezervasyon finansı — geliştirme teslim notu

Tarih: 14 Ekim 2026. Dal: `codex/booking-finance`.
İlk teslimde üretim migration, deploy, push ve master merge yapılmamıştı.

## Yayın hazırlığı güncellemesi

Kullanıcının rebase/commit/push/yayın isteği üzerine dal `ba2bafd` master
tabanına rebase edildi. Kapora kaydı ve phase91 korunarak dört dosyadaki
çakışma çözüldü; varlık damgaları yeniden üretildi.

- Rebase sonrası güvenli test: 207/207 süit, 2.194 doğrulama.
- Tarayıcı: 17 akış, 4 rol; mobil taşma ve konsol kapısı başarılı.
- Göç zinciri: schema + 79 göç; şablonlar ve damgalar güncel.
- Üretime salt-okunur sorguda phase92/94 bulunmadı;
  `bookings.financial_details` sütunu da henüz yok.
- Geliştirme dalı/PR hazırlanabilir; üretim SQL'leri ayrı açık onay veya
  kullanıcı uygulaması bekler. SQL doğrulanmadan otomatik merge açılmamalı.

## Değişiklikler

- ADR/RevPAR tabanı: vergi ve temizlik geliri hariç, indirim sonrası oda geliri.
  OTA/POS komisyonları bu tabandan düşülmez; gider olarak izlenir.
- İsteğe bağlı dahil/hariç/manuel vergi hesabı; tarih, matrah, temizlik ve
  diğer verginin matraha etkisi işletme profillerinde açıkça seçilir.
- Tahsilat ile ödeme yükümlülüğü ayrı saklanır. Vergi toplamı tahmini
  kalandan bir kez ayrılır; tahsilat verginin ödendiği anlamına gelmez.
- Beş aşamalı özet ve belirgin “Tüm Kesintiler Sonrası Kalan”; tahmini
  nitelik, bilinmeyen temizlik maliyeti ve negatif sonuç açıklanır.
- Profil kopyası rezervasyona kaydedilir; ayar değişiklikleri geçmişe işlemez.
- Yeni atomik RPC rezervasyon, POS ve finans ayrıntılarını birlikte yazar.
  Ek giderler açık aktarım ile deftere geçer; tekrar aktarım çoğaltmaz.
- Finans raporları vergiyi oda/temizlik gelirinden ayırır. Eski vergisiz
  kayıtlar için veri dönüşümü veya otomatik yeniden hesaplama yapılmaz.
- Excel/CSV turu ek finans JSON sütununu korur ve tutarlılığı denetler.

## Değişen dosyalar

| Alan | Dosyalar |
|---|---|
| Form ve entegrasyon | `app.js`, `index.html`, `style.css`, `core/action_dispatch.js`, `core/booking_finance_ui.js` |
| Hesap ve raporlar | `core/booking_finance.js`, `core/ledger_contract.js`, `core/financial_metrics_service.js`, `core/executive_dashboard_service.js` |
| Veri turu | `core/finance_export_engine.js`, `core/finance_import_engine.js` |
| Testler | `core/booking_finance_tests.js`, `core/booking_finance_live_tests.js`, `core/booking_form_economics_tests.js`, `scripts/browser_quality_gate.js`, `run_all_tests.js` |
| Şema | `supabase/migration_phase92_booking_finance.sql`, `supabase/migration_phase94_booking_tax_reserve.sql`, `supabase/migration_manifest.txt` |
| Dokümantasyon | `docs/BOOKING_FINANCE_PLAN.md`, bu dosya |

Önceden bulunan ilgisiz takipsiz dosyalar korunmuştur.

## Doğrulama

- `npm test`: 205/205 süit, 2.072 doğrulama; sıfır hata.
- Yeni hesap motoru: 17/17; vergi yöntemleri, tahsilat/yükümlülük ayrımı,
  sıfır komisyon, negatif sonuç, bilinmeyen maliyet, profil tarihi,
  indirim, ay sınırı ve CSV kayıt turu dahil.
- Yeni canlı finans süiti: 10/10; gerçek test Supabase kaydı/POS, profil
  snapshot'ı, SQL raporları, mükerrer gider, eski istemci tutarsızlık koruması,
  tenant/yetki ve kapalı dönem dahil.
- `npm run test:browser`: 16 akış, 4 rol; masaüstü ve 390 px mobil,
  yatay taşma ve konsol kapısı başarılı. Finans formu tarayıcı testi yerel
  fixture kullanır; Supabase doğrulaması ayrı canlı süitte yapılır.
- `npm run verify:migrations`: schema + 78 göç; hash ve sıralama başarılı.
- `npm run templates:check`: dört şablon güncel.
- `node stamp_assets.js --check`: 44 HTML + 15 çalışma zamanı damgası güncel.
- `git diff --check`: başarılı.
- phase92 ve phase94 yalnız `pdeiorpgxetksyogrmbi` test projesine uygulandı.
- `npm run test:live`: 251/251 süit, 2.917 doğrulama; sıfır hata ve
  sıfır uyarı. Test hesabı sızıntı denetimi temiz; komut çıkış kodu 0.

İlk ağsız koşudaki EACCES/ERR_NETWORK_ACCESS_DENIED ortam kısıtıydı;
ağ erişimiyle tekrarlandı. İlk genişletilmiş rol testinin kurulumu son owner
rolünü düşürmeye çalıştığı için reddedildi; ayrı viewer hesabıyla düzeltildi.
Ürün koruması gevşetilmedi. Eski phase92 dosyası değiştirilmeden vergi rezervi
uç durumu phase94 ile düzeltildi.

## Kalan sınırlar ve riskler

- Vergi oranları veya mevzuat varsayılanları eklenmedi. Profil, matrah,
  tarih ve sorumluluk seçimleri işletmenin doğruladığı kurallarla girilmelidir.
- Sonuç banka tahsilatı veya muhasebesel net kâr değildir. İndirilecek KDV,
  mahsuplar ve gerçek ödeme/mutabakat hesabı bu özelliğin kapsamı dışındadır.
- Temizlik görev kaydı mevcut ayrı yazma akışındadır; başarısızlık açık
  uyarıyla bildirilir. Gerçek temizlik gideri görev defterinden gelir.
- CSV/XLSX tam işletme yedeği değildir. Ek JSON sütunu silinmemelidir;
  gerçekleşmiş giderlerin rezervasyon bağlantılarını korumak için tam yedek
  kullanılmalıdır. Yeniden içe aktarılan tahmini giderler otomatik deftere geçmez.
- Göçler eklemelidir; eski kayıtlara backfill yoktur. Yeni finanslı kayıtlar
  eski istemciyle tutarsız biçimde değiştirilemez. Eski koda dönmek tam geri
  alma değildir; veri silen down migration test edilmedi. İleri düzeltme
  tercih edilmeli, geri alma gerekiyorsa ayrıca planlanmalıdır.

## Kullanıcının yapacağı işlemler

1. Yerel ekranı ve bu notu inceleyin; vergi profillerini işletmenizin
   doğruladığı kurallarla hazırlayın.
2. Yayına alma kararı verirseniz üretim göçü için ayrıca açık onay verin.
   Önce yedek alın; manifest sırasıyla phase92, ardından phase94 uygulanmalı.
3. Kodun PR/CI üzerinden master'a alınması ve yayın için ayrıca onay gerekir.
   Bu çalışmada bu işlemlerin hiçbiri yapılmadı.
