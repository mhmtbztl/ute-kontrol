# LEXBNB MASTER DOSYA DERİN DENETİMİ — RGVQI AUDIT RAPORU

> **TARİHSEL DENETİM KAYDI:** Bu rapor 14 Eylül 2026 tarihindeki kaynak, şema ve
> üretim durumunu belgeler. Aşağıdaki `NO-GO` kararı ve bulgu durumları güncel
> sürüm kararı olarak okunmamalıdır. Her bulgu kullanılmadan önce mevcut kaynak ve
> üretim kanıtıyla yeniden doğrulanmalıdır.

## 2026-09-26 durum eki

- Doğrulanmış sürüm `v1.0.0`, commit `ae1d4ea` üzerinde etiketlenip origin'e gönderildi.
- Production readiness kapısı kanonik tablo, sütun, nullability, RPC ve anon tablo yetkileri için yeşil.
- Test ve production OpenAPI şemaları arasındaki drift kapısı yeşil.
- Phase 11, 42 ve 44 üretimde; test projesinde `schema.sql + 54` immutable migration için eksik dosya yok.
- Güvenli regresyon koşusu `149/149` suite ve `1487` assertion ile geçti; migration zinciri, şablonlar ve asset damgaları doğrulandı.
- Üretim readiness kontrolü veri yazabilecek RPC'lere probe göndermez; yalnızca salt-okunur OpenAPI, tablo yetki probları ve migration ledger kanıtı kullanır.
- Bu ek, aşağıdaki bulguları topluca "kapalı" ilan etmez. Rapor gelecekteki denetimlerde kanıt haritası ve regresyon kontrol listesi olarak kullanılmalıdır.

**Orijinal denetim tarihi:** 2026-09-14  
**Esas alınan master dosya:** `CLAUDE.md`  
**Yöntem:** Master dosyanın iki tam okuma turu + iddiaların kaynak kodu, şema, migration ve test tanımları üzerinden salt-okunur çapraz doğrulaması.  
**Değişiklik kapsamı:** Uygulama kodu, master dosya, migration ve veritabanında hiçbir değişiklik yapılmadı. Testler üretim Supabase'ini değiştirdiği için çalıştırılmadı.

## Denetim sınırı ve kanıt dili

- `CLAUDE.md`, kendisini proje için “tek referans noktası” ilan ettiği için MASTER DOSYA kabul edilmiştir.
- Bir bulgunun kaynakta doğrudan karşılığı varsa **DOĞRULANDI**; yalnız master dosyada eksikse **DOSYADA AÇIK DEĞİL**; çalışma zamanı/üretim ayarı görülmeden kesinleştirilemiyorsa **DOĞRULANMALI** etiketi kullanılmıştır.
- Bu rapor çözüm uygulamaz. “Önerilen çözüm yönü” yalnız karar ve düzeltme yönünü tarif eder.
- Üretim veritabanının gerçek migration seviyesi okunmadı. `CLAUDE.md` içindeki “uygulandı/bekliyor” beyanları üretim durumu için esas alındı; repo içindeki `schema.sql` ile migration farkları ayrıca risk olarak değerlendirildi.

# 1. EXECUTIVE SUMMARY

1. **Karar: NO-GO.** Mevcut haliyle gerçek kullanıcı ve gerçek finansal kararlar için güvenli bir production sürümü değildir.
2. En büyük risk, kullanıcı tarafından girilen rezervasyon, gider, misafir ve operasyon alanlarının çok sayıda yerde HTML'e kaçışlanmadan basılmasıdır; bu, kalıcı XSS ve hesap/tenant oturumunun ele geçirilmesi sonucunu doğurabilir.
3. Finansal “tek kaynak” iddiası sağlanmıyor. Tarayıcı finans ekranı, `financial_metrics_service.js` ve ay kapanış SQL'i indirim, OTA komisyonu ve temizlik kalemlerini farklı ele alıyor.
4. “Uydurma veri yok” temel ürün ilkesi kaynakta hâlâ ihlal ediliyor: sabit hedefler, sabit tahmin çarpanı, temizlikçi adı/tutarı, misafir telefonu, mesaj durumu ve fiyat varsayımları kullanıcıya gerçekmiş gibi yansıyabiliyor.
5. Migration'lar elle production'a uygulanıyor; staging, otomatik migration ledger'ı, uygulanma sırası, drift kontrolü ve rollback süreci master dosyada tanımlı değil. `schema.sql`, son migration davranışını her yerde taşımıyor.
6. Bekleyen Phase 22 nedeniyle pazarlama fonksiyonlarında `anon` EXECUTE yüzeyi production'da açık. İç gövde kontrolleri veri sızıntısını azaltıyor fakat gereksiz saldırı/DoS ve hata-oracle yüzeyi bırakıyor.
7. `log_audit_event` SECURITY DEFINER fonksiyonu authenticated kullanıcılara açık ve tenant üyeliğini doğrulamadan istenen tenant adına kayıt yazabiliyor; denetim izi sahteciliğe açık.
8. Çok tenant'a üye bir kullanıcı bazı UPDATE politikalarında `tenant_id`yi başka bir üye olduğu tenant'a taşıyabilir. Özellikle `properties` için eş-tenant koruma trigger'ı yok; bağlı kayıtların tenant kimlikleri ayrışabilir.
9. Ana yükleme yolu rezervasyon, gider, lead, temizlik, hedef ve kapanış tablolarının tüm satırlarını sayfalamasız çekiyor; 10.000+ rezervasyonda açılış süresi, bellek ve Supabase response limitleri kırılacaktır.
10. Üretim testleri gerçek production Supabase'e service-role ile yazıyor. Test rate-limit'leri üretim auth kapasitesini tüketiyor ve temizlik hataları gerçek kullanıcı verisine yakın tam yetkili bir yüzeyde çalışıyor.
11. PII ve finansal state, Postgres tek kaynak olmasına rağmen `localStorage`da tam `appData` olarak tutuluyor. Ortak cihaz, XSS veya tarayıcı profili erişiminde misafir adı/telefonu ve finansal kayıtlar açığa çıkabilir.
12. Mülk silme; rezervasyonları, fiyatlama ve diğer alt kayıtları cascade ile kalıcı silebiliyor. Arşivleme/deaktivasyon ve tarihsel rapor koruması tanımlı değil.
13. Finans domaini gerçek muhasebe için eksik: ödeme/tahsilat, para birimi, vergi, iade, kısmi iade, iptal bedeli, owner payout, ödeme tarihi ve cash/accrual uzlaştırması yok.
14. Kullanılabilir gece paydası tutarlı değil: server snapshot tüm mevcut mülkleri geçmiş aylar için de aktif sayıyor; frontend servis activation/maintenance varsayıyor; ana loader ise maintenance'ı boş dizi yapıyor.
15. Çoklu tenant desteklenirken executive RPC aktif tenant parametresi almıyor ve kullanıcının ilk üyeliğini `LIMIT 1` ile seçiyor; dashboard yanlış işletmenin sonuçlarını döndürebilir.
16. Mimari küçük ölçekte anlaşılır olsa da `app.js` (~592 KB) ve `index.html` (~263 KB) içinde UI, iş kuralı, veri erişimi ve demo kalıntıları iç içe. Ana risk bakım maliyetinden çok, aynı formülün birden fazla yerde ayrışmasıdır.
17. Güçlü alanlar: booking overlap için veritabanı exclusion constraint'i, yaygın RLS kullanımı, tenant FK çapraz-kontrol trigger'ları, atomik kritik RPC'ler, ay kapanışı iyileştirmeleri ve geniş regresyon test envanteri.
18. En problemli alan **finans/KPI doğruluğu ile frontend güvenliğinin kesişimi**; en güçlü alan ise **veritabanı seviyesinde tenant izolasyonu ve atomik işlem niyetinin açık olmasıdır**.
19. Production'a geçmeden önce tüm P0'lar ve güvenlik/finans/migration/PII eksenindeki P1'ler kapatılmalı; canlı veriyle bağımsız doğrulama ve geri dönüş tatbikatı yapılmalıdır.

# 2. KRİTİK BULGULAR

## [SEC-001] Kullanıcı girdilerinde kalıcı XSS yüzeyi

**Seviye:** Critical  
**Kategori:** Security / Frontend  
**Durum:** DOĞRULANDI  
**Master dosyada ilgili bölüm:** §1 tenant izolasyonu, §7 Güvenlik notları; ancak XSS tanımlı değil.  
**Problem:** `app.js` kullanıcı kontrollü gider açıklaması/kategorisi, misafir adı, mülk adı, temizlik notu/çalışanı, influencer alanları ve arama sorgusu gibi değerleri birçok yerde kaçışlamadan `innerHTML` içine yerleştiriyor. Örnekler: 4362–4373, 5644–5661, 7699–7714, 10312–10327, 10565–10583, 13531–13542, 13714–13733.  
**Neden problem:** Supabase'de kalıcı olan zararlı HTML/JS, aynı tenant içindeki owner/admin dahil başka kullanıcıların tarayıcısında çalışabilir. Supabase session token'ı doğrudan okunamasa bile kurban oturumuyla yetkili API çağrıları, veri değiştirme, sahte UI ve PII çıkarımı yapılabilir.  
**Hangi durumda ortaya çıkar:** Saldırgan veya kötü niyetli/stolen bir staff hesabı ilgili metin alanına payload kaydeder ve yetkili kullanıcı liste/dashboard ekranını açar.  
**Potansiyel etkisi:** Hesap ele geçirme etkisi, tenant içi veri tahrifi, finansal manipülasyon, zincirleme stored-XSS.  
**Önerilen çözüm yönü:** Tüm render noktalarını güvenli text-node/attribute API'lerine geçirmek; zorunlu HTML için tek merkezi escaping/sanitization katmanı; inline event handler'ları kaldırmak; CSP eklemek; stored-XSS regresyon testleri.

## [FIN-001] Üç ayrı finans motoru aynı kayıt için farklı sonuç üretiyor

**Seviye:** Critical  
**Kategori:** Financial Logic / KPI / Single Source of Truth  
**Durum:** DOĞRULANDI  
**Master dosyada ilgili bölüm:** §3.4 ve §3.4.1.  
**Problem:** Master `CİRO = brütTutar` diyor. Frontend `renderFinanceModule` brütü indirim düşmeden gelir sayıyor ve OTA + rezervasyondaki `cleaningFee`yi OPEX'e ekliyor. `financial_metrics_service` geliri `gross - discount` sayıyor fakat otomatik OTA/temizlik tutarlarını `operatingExpenses`e eklemiyor. `compute_month_close_snapshot` geliri `gross - discount`, OPEX'i manuel OPEX + OTA + `cleaning_fee` olarak hesaplıyor.  
**Neden problem:** Dashboard, finans ekranı, AI payload ve mühürlü ay kapanışı aynı ay için farklı ciro, kâr ve marj üretir.  
**Hangi durumda ortaya çıkar:** İndirimli, OTA komisyonlu veya temizlik ücretli herhangi bir rezervasyon.  
**Potansiyel etkisi:** Yanlış kâr, yanlış vergi/işletme kararı, kapanış sonrası uzlaştırma farkı, müşteri güven kaybı.  
**Önerilen çözüm yönü:** `gross_amount`, discount, guest cleaning charge ve actual cleaning cost semantiğini karar altına almak; tek kanonik finans sözleşmesini server-side fonksiyonda tanımlamak; tüm ekran/AI/export/kapanışı aynı çıktıyla beslemek.

## [PROD-001] “Uydurma veri yok” kuralı çalışan kaynakta sistematik olarak ihlal ediliyor

**Seviye:** Critical  
**Kategori:** Product Logic / Financial Accuracy / UX  
**Durum:** DOĞRULANDI  
**Master dosyada ilgili bölüm:** §1, §3.5, §3.6.  
**Problem:** Kullanıcı verisi yokken veya alan boşken kaynak gerçekmiş gibi sayısal/operasyonel varsayımlar üretiyor: aylık hedef `350000/1200000`, tahmin `revenue × 1.018`, varsayılan fiyat/temizlik `20000/1500`, temizlikçi “Fatma Hanım”, eksik telefon `+90 532 000 00 00`, “2 Mesaj Planlandı”, “Teklif Uygun”, geçmişteki belirli 2026 dönem koşulları ve benzeri sabitler.  
**Neden problem:** Master'ın en temel ürün garantisini doğrudan bozar ve finansal/operasyonel kararları sahte veriye dayandırır.  
**Hangi durumda ortaya çıkar:** Yeni tenant, eksik alan, hedef girilmemiş dönem, misafir telefonu olmayan rezervasyon, mesaj/teklif entegrasyonu olmayan ekran.  
**Potansiyel etkisi:** Yanlış hedef performansı, sahte iletişim durumu, yanlış fiyat/maliyet, müşteri ve hukuki güven kaybı.  
**Önerilen çözüm yönü:** Gerçek data provenance zorunluluğu; fallback'lerin nötr `—/belirtilmedi` olması; tüm sayı ve durumların kaynak etiketi; “data-like literals” için genişletilmiş statik ve render testleri.

## [REL-001] Migration ve production şeması için güvenilir tek kaynak yok

**Seviye:** Critical  
**Kategori:** Deployment / Database / Recovery  
**Durum:** DOĞRULANDI; production'daki tam drift DOĞRULANMALI.  
**Master dosyada ilgili bölüm:** §2, §4.2, §6.  
**Problem:** Migration'lar SQL Editor'den elle çalıştırılıyor. `schema.sql` içindeki kapanış trigger'ı yalnız check-in ayını kontrol ederken Phase 20 migration tüm gece aralığını ve OLD/NEW satırı kontrol ediyor. Master Phase 20'nin uygulandığını söylüyor; temiz kurulumda hangi dosya kombinasyonunun kanonik olduğu ve sıra garanti edilmiyor. Phase 22 hâlen bekliyor.  
**Neden problem:** Yeni ortam, felaket kurtarma veya yeni geliştirici kurulumu production ile farklı iş kuralları ve izinler oluşturabilir. Manuel uygulama atlama/kısmi uygulama riski taşır.  
**Hangi durumda ortaya çıkar:** Yeni Supabase projesi, rollback, recovery, migration'ın yanlış sırada/yarım uygulanması.  
**Potansiyel etkisi:** Kapalı dönemin değiştirilebilmesi, yetki açığı, veri drift'i, geri yüklenemeyen deployment.  
**Önerilen çözüm yönü:** Tek sıralı ve immutable migration zinciri; schema snapshot'ın otomatik üretilmesi; migration ledger/drift check; staging dry-run; transaction ve forward-fix/rollback runbook'u.

## [SEC-002] Audit log, yetkili istemci tarafından sahte kayıtla doldurulabilir

**Seviye:** High  
**Kategori:** Security / Auditability  
**Durum:** DOĞRULANDI  
**Master dosyada ilgili bölüm:** §7; §2 şema.  
**Problem:** `log_audit_event` SECURITY DEFINER olarak çalışıyor, authenticated rolüne verilmiş ve `p_tenant_id` üyeliğini/rolünü doğrulamadan `audit_logs`a yazıyor. RLS'de client INSERT policy olmaması bu RPC üzerinden aşılabiliyor.  
**Neden problem:** Denetim izi güvenilir delil olmaktan çıkar; kullanıcı başka tenant UUID'si adına sahte olay yazabilir.  
**Hangi durumda ortaya çıkar:** Authenticated kullanıcı fonksiyonu doğrudan PostgREST RPC üzerinden çağırır.  
**Potansiyel etkisi:** Olay müdahalesinin yanıltılması, sahtecilik, log şişirme/DoS, uyum kayıtlarının geçersizliği.  
**Önerilen çözüm yönü:** İstemci EXECUTE yetkisini kaldırmak veya gövdede üyelik/izin + olay allowlist doğrulamak; kritik kayıtları yalnız trigger/kapalı server yolu ile üretmek; append-only ve bütünlük kontrolleri.

## [TEN-001] Çoklu tenant üyeliğinde kayıt tenant'ı UPDATE ile taşınabilir

**Seviye:** High  
**Kategori:** Multi-tenant / Data Integrity / Authorization  
**Durum:** DOĞRULANDI  
**Master dosyada ilgili bölüm:** §3.2, §7.  
**Problem:** Bazı UPDATE RLS politikaları eski satırda rolü kontrol ederken yeni satır için yalnız `is_tenant_member(tenant_id)` kontrol ediyor. İki tenant'a üye bir manager, örneğin `properties.tenant_id`yi A'dan B'ye taşıyabilir; properties üzerinde tenant_id immutability trigger'ı yok. Bağlı bookings/expenses kendi tenant_id değerlerinde kalır.  
**Neden problem:** Tenant sınırı bir iş kuralı değil sadece üyelik çifti olarak ele alınmış; ilişkisel model çapraz-tenant tutarsızlığa düşebilir.  
**Hangi durumda ortaya çıkar:** Kullanıcı her iki tenant'ta üyedir ve API'yi doğrudan çağırır veya istemci hatalı payload yollar.  
**Potansiyel etkisi:** Mülkün yanlış tenant'ta görünmesi, bağlı kayıtların kaybolmuş görünmesi, cascade ve raporlama bozulması; yanlış tenant operasyonu.  
**Önerilen çözüm yönü:** Tenant kimliğini update edilemez yapmak; kompozit FK/tenant eşleşmesi; tüm WITH CHECK koşullarında yeni rol yetkisini de doğrulamak; iki tenant üyeliği saldırı testleri.

## [DATA-001] Mülk silme tarihsel ve finansal kayıtları cascade ile yok edebilir

**Seviye:** High  
**Kategori:** Data Lifecycle / Database / Financial History  
**Durum:** DOĞRULANDI  
**Master dosyada ilgili bölüm:** Soft delete/archive davranışı tanımlı değil.  
**Problem:** `bookings.property_id`, cleaning, pricing ve çeşitli operasyon tabloları `ON DELETE CASCADE`; manager/owner/admin için properties DELETE policy mevcut. Uygulama mülk silme aksiyonu sunuyor.  
**Neden problem:** Bir mülkün operasyon dışına alınması ile muhasebe geçmişinin imhası aynı işlem haline geliyor. Kapalı dönem yoksa tüm rezervasyon geçmişi kaybedilebilir.  
**Hangi durumda ortaya çıkar:** Kullanıcı mülkü portföyden kaldırmak ister veya yanlışlıkla siler.  
**Potansiyel etkisi:** Gelir/KPI tarihçesi ve audit bağlamı kaybı, geri döndürülemez veri silme, raporların geriye dönük değişmesi.  
**Önerilen çözüm yönü:** Mülk için archive/deactivation yaşam döngüsü; geçmiş finansal kayıtlar için RESTRICT/snapshot; silme etkisi ve recovery politikası; yalnız özel imha akışında fiziksel silme.

## [TEST-001] Testler production veritabanını service-role ile değiştiriyor

**Seviye:** High  
**Kategori:** Testing / Operations / Security  
**Durum:** DOĞRULANDI  
**Master dosyada ilgili bölüm:** §5 maddeler 4 ve 6.  
**Problem:** Tam test koşusu üretim Supabase'inde kullanıcı/tenant/veri oluşturuyor ve service-role ile temizliyor; geçmişte 525 artık hesap bırakmış. Koşu auth rate limit'ini tüketerek yaklaşık 10 suite'i sahte kırmızı yapabiliyor.  
**Neden problem:** Test izolasyonu yoktur; test hatası production state'ini kirletebilir ve rate-limit gerçek kullanıcı signup/login akışını etkileyebilir.  
**Hangi durumda ortaya çıkar:** Lokal veya CI'dan tam regresyon koşusu, yarıda kesilme, cleanup API hatası.  
**Potansiyel etkisi:** Production auth kesintisi, sahte/veri artık kayıtları, service-role kaynaklı geniş hasar.  
**Önerilen çözüm yönü:** Ayrı test Supabase projesi/ephemeral DB; production endpoint guard; namespace ve teardown garantisi; production'a karşı yalnız salt-okunur smoke test.

## [SEC-003] Production'da anonim fonksiyon yürütme katmanı bilerek açık bırakılmış

**Seviye:** High  
**Kategori:** Security / API  
**Durum:** Master beyanına göre DOĞRULANDI.  
**Master dosyada ilgili bölüm:** §4.2, §6, §7.  
**Problem:** Phase 22 uygulanmamış; Phase 17 fonksiyonlarının `anon` EXECUTE hakkı var. Bazı fonksiyonlar yetki kontrolünden önce satır arıyor/kilitliyor ve hata farkıyla UUID varlığı sızdırıyor.  
**Neden problem:** İç kontrol veri sızıntısını sınırlasa da gereksiz RPC yüzeyi, lock abuse, enumeration oracle ve gelecekte bir gövde kontrolü unutulursa doğrudan ihlal oluşturur.  
**Hangi durumda ortaya çıkar:** Anon anahtarı bilen herkes otomatik RPC çağrıları yapar. Anon key zaten public web uygulamasında bulunur.  
**Potansiyel etkisi:** DoS/lock contention, kayıt varlığı sızıntısı, savunma katmanı kaybı.  
**Önerilen çözüm yönü:** Phase 22'yi kontrollü deploy etmek; tüm fonksiyon yetkilerini canlı katalogdan denetlemek; authorization-first kuralı ve anon negatif testleri.

## [DATA-002] PII ve finansal veri kalıcı browser storage'da tutuluyor

**Seviye:** High  
**Kategori:** Privacy / Security / Data Lifecycle  
**Durum:** DOĞRULANDI  
**Master dosyada ilgili bölüm:** §1 ve §3.3.  
**Problem:** `saveAppData()` tam `appData`yı `LEXBNB_DATA_<user>` anahtarıyla localStorage'a yazar. Bu state misafir adları/telefonları, rezervasyonlar, giderler ve operasyon verileri içerir. Master yalnız “localStorage'a yazıp kaydedildi denmez” diyor; cache'in gizlilik ve yaşam döngüsü tanımlanmıyor.  
**Neden problem:** localStorage şifreli değildir, süre aşımı yoktur ve aynı origin'deki XSS tarafından okunabilir. Logout'a kadar ortak cihazda kalır; logout'ta `localStorage.clear()` ise uygulamayla ilgisiz origin verilerini de siler.  
**Hangi durumda ortaya çıkar:** Ortak cihaz, XSS, cihaz kaybı, logout edilmeden hesap değişimi.  
**Potansiyel etkisi:** KVKK/PII ihlali, tenant verisinin cihazda kalması, veri minimizasyonu ihlali.  
**Önerilen çözüm yönü:** Business/PII state'i localStorage'dan kaldırmak veya açık cache politikası, kısa TTL ve kullanıcı/tenant scoping; logout/tenant switch'te hedefli temizleme; threat model ve KVKK envanteri.

## [SCALE-001] Ana uygulama tüm temel tabloları sayfalamasız belleğe yüklüyor

**Seviye:** High  
**Kategori:** Performance / Scale / Frontend Architecture  
**Durum:** DOĞRULANDI  
**Master dosyada ilgili bölüm:** §2; performans ve ölçek davranışı tanımlı değil.  
**Problem:** `loadTenantAppData` properties, bookings, expenses, cleaning_tasks, leads, monthly closes ve targets için tam tenant verisini ayrı ayrı çeker. Tarih aralığı, limit, cursor ve sunucu aggregate'ı yoktur; çağrılar çoğunlukla sıralıdır.  
**Neden problem:** Supabase response satır limiti ve tarayıcı belleği nedeniyle eski kayıtlar eksik veya uygulama yavaş olabilir; dashboard hesapları eksik dataset üzerinde sessizce yanlış sonuç üretir.  
**Hangi durumda ortaya çıkar:** 10.000+ booking/expense, uzun süreli tenant, mobil/weak connection.  
**Potansiyel etkisi:** Uzun açılış, timeout, eksik rapor, yüksek egress, donan UI.  
**Önerilen çözüm yönü:** Dönem/scope bazlı server query, pagination, kanonik aggregate RPC/view, paralel ama sınırlı yükleme, cache invalidation ve büyük veri testleri.

## [FIN-002] Temizlik geliri ile gerçek temizlik maliyeti aynı alan gibi kullanılıyor

**Seviye:** High  
**Kategori:** Financial Logic / Domain Model  
**Durum:** DOĞRULANDI  
**Master dosyada ilgili bölüm:** §3.4.  
**Problem:** Booking `cleaning_fee` misafirden alınan ücret olarak gross içinde ve room revenue'dan ayrılan gelir bileşeni. Buna rağmen frontend ve month-close aynı `cleaning_fee`yi OPEX'e ekliyor. Gerçek çalışan maliyeti property `clean_cost`, cleaning task `amount` veya expense kaydıyla ayrı tutuluyor.  
**Neden problem:** Misafirden alınan temizlik bedeli gerçek maliyete eşit değilse kâr yanlış olur; gerçek maliyet expense'e girilirse double count oluşur.  
**Hangi durumda ortaya çıkar:** Guest cleaning charge ile cleaner payout farklı olduğunda veya temizlik gideri ayrıca kaydedildiğinde.  
**Potansiyel etkisi:** Sistematik kâr/marj sapması, yanlış fiyatlama.  
**Önerilen çözüm yönü:** Guest charge ve actual cost için farklı isim/alan/ledger; otomatik expense idempotency; uzlaştırma ve değişiklik/snapshot kuralı.

## [KPI-001] Kullanılabilir gece ve bakım paydası modüller arasında ayrışıyor

**Seviye:** High  
**Kategori:** KPI / Date / Cross-module  
**Durum:** DOĞRULANDI  
**Master dosyada ilgili bölüm:** §3.4 ve Phase 20 notları.  
**Problem:** Server month-close mevcut property sayısı × ay günü kullanıyor ve geçmiş aktivasyonu desteklemediğini açıkça belirtiyor. Core servis `created_at/activationDate/deactivationDate` ve maintenance downtime kullanıyor. Ana tenant loader ise `maintenance: []` atıyor ve properties şemasında açık active/deactivation alanı yok. Frontend `getPeriodDayCount` ALL için daima 365, bilinmeyen/custom için 30 döndürüyor.  
**Neden problem:** Occupancy ve RevPAR aynı veri için ekrana/kapanışa göre değişir; geçmişe sonradan eklenen mülk eski ayların doluluğunu düşürür.  
**Hangi durumda ortaya çıkar:** Ay ortası onboarding, bakım blokajı, çok yıllı ALL/custom filtre, sonradan eklenen mülk.  
**Potansiyel etkisi:** Yanlış KPI, yanlış pricing/performans kararı.  
**Önerilen çözüm yönü:** Property availability calendar veya activation intervals; owner-stay/maintenance/block kategorileri; tek server-side denominator sözleşmesi.

## [TEN-002] Executive RPC aktif tenant'ı deterministik seçmiyor

**Seviye:** High  
**Kategori:** Multi-tenant / KPI / Backend  
**Durum:** DOĞRULANDI  
**Master dosyada ilgili bölüm:** §6 fonksiyonun hatalı ve kullanılmadığı yazıyor.  
**Problem:** `get_executive_dashboard_snapshot` tenant parametresi almıyor; kullanıcının üyeliklerinden `LIMIT 1` ile sırasız seçim yapıyor. Aynı RPC rezervasyon adedini “booked_nights” adıyla döndürüyor ve yalnız check-in ayına göre tam brütü topluyor.  
**Neden problem:** Çok tenant üyesi kullanıcı seçili işletme yerine başka işletmenin KPI'sını görebilir; veri sızıntısı RLS/RPC davranışına bağlı olarak değil, fonksiyonun SECURITY DEFINER içindeki kendi seçimine dayanır.  
**Hangi durumda ortaya çıkar:** Kullanıcının birden fazla tenant üyeliği vardır ve RPC UI'ya bağlanır.  
**Potansiyel etkisi:** Yanlış işletme raporu ve cross-tenant bağlam karışması.  
**Önerilen çözüm yönü:** Fonksiyonu production yüzeyinden kaldırmak ya da açık `tenant_id` + üyelik kontrolü ve kanonik hesapla yeniden doğrulamak; kullanılmayan hatalı API'yi “ileride bağlanır” durumda bırakmamak.

## [OPS-001] Observability, backup ve felaket kurtarma production gereksinimleri tanımsız

**Seviye:** High  
**Kategori:** Observability / Backup / Recovery / Operations  
**Durum:** DOSYADA AÇIK DEĞİL  
**Master dosyada ilgili bölüm:** Yok.  
**Problem:** Merkezi error tracking, güvenli structured log, alerting, SLO, failed job dashboard, webhook/AI worker dead-letter, backup politikası, PITR, restore testi, RPO/RTO ve incident runbook belirtilmemiş.  
**Neden problem:** Veri kaybı veya hesaplama bozulması geç fark edilir; geri dönüş yeteneği kanıtlanamaz.  
**Hangi durumda ortaya çıkar:** Kısmi reset, worker failure, yanlış migration, Supabase kesintisi, kullanıcı hatası.  
**Potansiyel etkisi:** Uzun kesinti, kalıcı veri kaybı, sessiz yanlış rapor.  
**Önerilen çözüm yönü:** Üretim hazır olma kriteri olarak gözlemlenebilirlik ve recovery planı; restore tatbikatı; iş metriği reconciliation alarmı; PII-redaction.

# 3. EKSİKLER

| Eksik | Neden gerekli | Etkilenen modül | Öncelik |
|---|---|---|---|
| Payment/transaction ledger | Booking tutarı tahsilat değildir; kısmi ödeme, depozito, başarısız ödeme ve ödeme tarihi izlenemez | Finance, Booking, Cash Flow | P1 |
| Refund/partial refund/cancellation fee modeli | Cancelled booking'i tamamen dışlamak gerçek geliri/iade borcunu yanlış gösterir | Finance, KPI | P1 |
| Currency ve kur politikası | `NUMERIC` tutarlar implicit TL kabul ediliyor; para birimi kolon/snapshot yok | Tüm finans | P1 |
| Tax/VAT/withholding semantiği | Gross/net/vergi yükümlülüğü ayrışmıyor | Finance, Reporting | P1 |
| Owner payout ve işletme/owner ayrımı | Property management SaaS'ta işletme geliri ile sahibine borç aynı değildir | Finance | P2 |
| Property activation/deactivation/archive | Tarihsel available-night ve güvenli portföyden çıkarma için şart | Property, KPI | P1 |
| Blocked night / owner stay / out-of-order envanteri | Occupancy paydasının gerçek satılabilir envanteri bilinmiyor | Calendar, KPI | P1 |
| Booking değişiklik geçmişi ve cancellation metadata | Kim, ne zaman, neden tutar/tarih/status değiştirdi bilinmiyor | Booking, Audit, Finance | P1 |
| Veri saklama ve KVKK süreci | Guest PII retention, export, rectification, consent ve deletion kapsamı yok | Guest, Auth, Legal | P1 |
| Staging ve izole test ortamı | Migration/test güvenliği ve gerçek deploy provası yok | Deployment, QA | P1 |
| Migration registry/drift doğrulaması | Dosya–production farkını engellemek için | Database, Deployment | P0 |
| Rate limiting/abuse policy | Tenant creation, RPC, auth ve AI maliyet yüzeyi korunmuyor | Auth, API, AI | P2 |
| File upload threat model | MIME doğrulaması tek başına malware, içerik ve storage lifecycle çözmez | Marketing Media | P2 |
| AI privacy/DPA/retention açıklaması | Görseller ve tenant bağlamı Gemini'ye gönderiliyor | AI, Privacy | P1 |
| Prompt/model version rollout ve kill switch | AI çıktısı, maliyet ve hata geri dönüşü yönetilemiyor | AI | P2 |
| Accessibility kriterleri | Klavye, screen reader, contrast ve modal focus testleri tanımlı değil | UX | P2 |
| Offline/weak-network state machine | Yazma duruyor ancak form taslağı, retry/idempotency ve partial load davranışı yok | Frontend | P2 |
| Feature flag/release/rollback süreci | Root/master'dan canlı yayın riskini sınırlandırmak için | Deployment | P1 |
| Public API/webhook versioning | Gelecek OTA/channel manager entegrasyonları için sözleşme sınırı yok | Backend/Growth | P3 |
| Tenant ownership transfer akışı | Yeni owner ekleme mümkün olsa da resmi transfer/onay/geri alma tanımlı değil | Team/Auth | P2 |

# 4. ÇELİŞKİLER

## C-001 — Ciro ve indirim

**Bölüm A:** `CLAUDE.md` §3.4: ciro rezervasyon brüt tutarıdır.  
**Bölüm B:** `financial_metrics_service` ve Phase 20 snapshot: `gross - discount`; frontend: `gross`.  
**Çelişki:** Discount gross'a önceden dahil mi, ayrıca mı düşülür belli değil.  
**Hangisi muhtemelen doğru:** Domain kararı gerektirir; tek doğru veri sözleşmesi olmadan seçilemez.  
**Karar gerektiriyor mu?:** Evet, P0.

## C-002 — Temizlik ücreti ve temizlik maliyeti

**Bölüm A:** Room revenue hesabı cleaning fee'yi guest charge olarak ayırıyor.  
**Bölüm B:** Aynı booking cleaning fee OPEX kabul ediliyor; ayrıca clean_cost/task expense var.  
**Çelişki:** Gelir kalemi ile çalışan maliyeti aynı tutar varsayılmış.  
**Hangisi muhtemelen doğru:** Guest charge ve actual vendor cost ayrı olmalı.  
**Karar gerektiriyor mu?:** Evet, P0/P1.

## C-003 — Tek finans kaynağı

**Bölüm A:** Master, `getBookingFilterShare` ve `financial_metrics_service` için tek kaynak dili kullanıyor.  
**Bölüm B:** `renderFinanceModule` kendi hesaplarını yapıyor; month-close üçüncü implementasyon.  
**Çelişki:** Birden fazla kanonik kaynak var.  
**Hangisi muhtemelen doğru:** Yetkili server hesabı kanonik olmalı.  
**Karar gerektiriyor mu?:** Evet.

## C-004 — Demo/uydurma veri kaldırıldı iddiası

**Bölüm A:** Master §3.6 demo ve uydurma verinin tamamen kaldırıldığını söylüyor.  
**Bölüm B:** Kaynakta sabit temizlikçi, fiyat, maliyet, target, telefon ve durum fallback'leri mevcut. README hâlâ demo portföyü yayımlıyor.  
**Çelişki:** Politika ile çalışan UI davranışı uyuşmuyor.  
**Hangisi muhtemelen doğru:** Master politikası; uygulama uyumsuz.  
**Karar gerektiriyor mu?:** Hayır, uygulama yüzeyi temizlenmeli.

## C-005 — Ana veri kaynağı

**Bölüm A:** Postgres source of truth.  
**Bölüm B:** Tam `appData` localStorage'a yazılıyor; bazı fallback dalları ve ölü Excel yolu hâlâ var.  
**Çelişki:** Kalıcılık kaynağı ile istemci cache/alternatif yürütme yolu sınırı açıklanmıyor.  
**Hangisi muhtemelen doğru:** Postgres tek kalıcılık kaynağı; browser cache business truth olmamalı.  
**Karar gerektiriyor mu?:** Evet, cache politikası.

## C-006 — Şema kanonikliği

**Bölüm A:** Mimari `schema.sql + migration_phase*.sql` diyor.  
**Bölüm B:** `schema.sql` bazı eski fonksiyon gövdelerini içeriyor; daha yeni migration ayrı dosyada override ediyor.  
**Çelişki:** Yeni kurulum için hangi kombinasyon/sıra gerçek şema belli değil.  
**Hangisi muhtemelen doğru:** Sıralı migration zinciri + üretilmiş snapshot.  
**Karar gerektiriyor mu?:** Evet, P0.

## C-007 — Test sayısı ve çalıştırma girişi

**Bölüm A:** README 43 suite, master 112 suite diyor.  
**Bölüm B:** Runner listesinde 111 dosya girdisi var; `npm test` bilinçli olarak hata veriyor.  
**Çelişki:** Operasyon dokümanı ve standart komut güncel değil.  
**Hangisi muhtemelen doğru:** Runner'ın dinamik `testFiles.length` değeri.  
**Karar gerektiriyor mu?:** Düşük; fakat release kanıtını zayıflatıyor.

## C-008 — README mimarisi

**Bölüm A:** README `web/` ve `notification_service.js` tanımlar.  
**Bölüm B:** Repo envanterinde bu yol/dosya yok; master kökten GitHub Pages yayını diyor.  
**Çelişki:** Onboarding/operasyon dokümanı yanlış.  
**Hangisi muhtemelen doğru:** Mevcut repo ve master.  
**Karar gerektiriyor mu?:** Hayır.

# 5. SINGLE SOURCE OF TRUTH SORUNLARI

1. Finansal gelir/kâr: frontend render, core metrics service, executive RPC ve month-close SQL.
2. `gross`, `net_room_revenue`, `discount`, OTA ve cleaning değerleri: ham + türetilmiş alanlar aynı booking satırında; DB seviyesinde eşitlik constraint'i yok.
3. Property fiyatları: `base_price`, uygulamadaki `basePrice`, `adr`, `floor/base/target/premium/peak`, pricing profile/daily rates.
4. Temizlik maliyeti: property `clean_cost`, booking `cleaning_fee`, cleaning task `amount`, expense kaydı.
5. Tenant seçimi: `activeTenantId`, `activeTenant`, `appData.tenantId`, localStorage `LEXBNB_LAST_TENANT`; executive RPC ise bunları kullanmadan ilk membership'i seçiyor.
6. Dönem gün sayısı/available nights: `getPeriodDayCount`, `calculateAvailableNights`, month-close SQL ve Excel yolu.
7. User/guest identity: booking içindeki guest name/phone ile `guests` tablosu/primary_guest_id.
8. Operasyon görevleri: legacy `cleaning_tasks`, yeni `operational_tasks`, maintenance ve frontend `appData.cleaningTasks/maintenance`.
9. Schema durumu: `schema.sql`, bağımsız phase migration'ları ve production SQL Editor geçmişi.
10. Marketing gelir/ROAS: kullanıcı kampanya revenue alanı ile rezervasyon attribution verisi.
11. Tarih “bugün”: çoğu yerde `getTodayStr`, bazı yerlerde doğrudan `new Date().toISOString().slice(0,10)`.
12. Bildirim/mesaj durumu: DB scheduled messages ve UI'daki sabit “2 Mesaj Planlandı/Teklif Uygun”.

# 6. EDGE CASE LİSTESİ

## Rezervasyon ve takvim

- Check-out günü custom filtre başlangıcına eşitse liste eşleşiyor (`>=`) fakat döneme düşen gece sıfır.
- Booking tarihleri değişirken eski ve yeni ayların kapanış kontrolü production migration seviyesine bağlı.
- Aynı mülkte cancelled → confirmed eşzamanlı güncelleme yarışı.
- Property timezone ile kullanıcı/browser timezone farklıyken “bugün”, turnover ve mesaj zamanı.
- DST kullanan property timezone'larında local Date aritmetiği; İstanbul fallback'i yabancı portföyü yanlış zamanlar.
- Leap day, yıl sınırı ve çok yıllı custom/ALL filtrede payda.
- Owner stay, bakım, dış satış kanalı blokajı ve mülkün satışa kapalı günü.
- Erken çıkış, no-show, late checkout, complimentary stay, day-use, split stay, room move.
- Booking'in gross/discount/fee alanları sonradan değişince geçmiş rapor ve kabul edilmiş quote snapshot ilişkisi.
- Property capacity string olduğundan pax/capacity ihlali ve çocuk/bebek ayrımı.

## Finans

- Discount gross içine zaten dahilse ikinci kez düşülmesi; dahil değilse frontend'in hiç düşmemesi.
- Cleaning charge ile cleaner payout farklı veya payout booking başına değilse.
- OTA komisyonunun vergi dahil/haric, yüzde/sabit, sonradan kesilen gerçek tutar olması.
- Negatif booking tutarı, discount > gross, commission > gross, cleaning fee > gross; bookings tablosunda sınır constraint'i yok.
- Chargeback, kısmi ödeme, depozito, zarar bedeli, iade, iptal geliri.
- Expense'in booking/property bağı koparıldığında `SET NULL` sonrası rapor kapsamı.
- Portfolio genel giderinin property raporuna dağıtım yöntemi.
- Closed month yeniden açıldıktan sonra rapor snapshot/version karşılaştırması.
- Yuvarlama farkı: gece başına dağıtılmış kuruşların toplam booking tutarına eşitlenmesi.
- Vergi tarihi, hizmet/stay tarihi, booking tarihi ve ödeme tarihi ayrımı.

## Tenant/auth

- Kullanıcının iki tenant'ta farklı role sahip olması ve tenant switch sırasında bekleyen isteklerin geç dönmesi.
- Owner'ın kendi hesabını silmesi, son owner, sahiplik transferi ve davet aynı anda.
- Davet rolü süresi dolmadan değiştirildiğinde eski link/oturum.
- E-posta adresi değişikliği ile pending invitation eşleşmesi.
- Disabled/banned account session'ının token süresi dolana kadar davranışı.
- Tenant deletion/reset sırasında worker veya webhook'un yeni kayıt yazması.
- localStorage'da eski tenant PII'sinin logout edilmeden farklı kullanıcı tarafından görülmesi.

## API/async/error

- Kullanıcı çift tıklaması, timeout sonrası retry ve ilk isteğin aslında başarılı olması.
- Birden çok tablo sıralı yüklenirken ortada hata: tüm state boşaltılıyor; hangi kaynağın bozuk olduğu kullanıcıya görünmüyor.
- Worker claim sonrası crash, lease expiry, duplicate delivery ve poison job.
- AI provider timeout/invalid JSON/oversize photo/partial batch.
- Upload tamamlanıp DB insert başarısız olması veya tersi; orphan storage object.
- Supabase row limit nedeniyle sessiz truncated dataset.
- Browser cache'te eski JS ile yeni şema/API sürümünün birlikte çalışması.

# 7. GÜVENLİK BULGULARI

| ID | Bulgu | Severity | Not |
|---|---|---|---|
| SEC-001 | Stored XSS | Critical | Çok sayıda doğrulanmış sink |
| SEC-002 | Audit log spoofing RPC | High | SECURITY DEFINER + tenant check yok |
| SEC-003 | Phase 22 bekliyor, anon EXECUTE açık | High | Master üretim beyanı |
| TEN-001 | Tenant ID mutable/cross-tenant move | High | Çoklu üyelikte tetiklenir |
| DATA-002 | PII localStorage'da | High | KVKK ve XSS etkisini büyütür |
| SEC-004 | CSP ve browser hardening tanımsız | Medium | GitHub Pages header kontrolü sınırlı; meta CSP DOĞRULANMALI |
| SEC-005 | Rate-limit/abuse politikası eksik | Medium | Auth panel bağlantısı var ama değer/kanıt yok |
| SEC-006 | AI veri paylaşımı/retention ve prompt injection sözleşmesi eksik | High | Fotoğraf worker harici Gemini kullanıyor |
| SEC-007 | Upload malware/content/storage isolation yaşam döngüsü belirsiz | Medium | MIME allowlist tek başına yeterli değil |
| SEC-008 | Hata mesajları kayıt varlığı oracle'ı oluşturuyor | Medium | Master §7 kendisi doğruluyor |
| SEC-009 | Service-role lokal `.env`de ve test/script yüzeyinde geniş kullanılıyor | Medium | Commit edilmemiş olması doğrulandı; workstation/CI secret yönetimi eksik |

**Tenant verisinin başka tenant'a görünme yolu var mı?** Doğrudan SELECT RLS politikaları genel olarak membership ile sınırlandırılmış ve 36 tabloda RLS etkin görünüyor. Ancak “hiçbir yol yok” denemez: SECURITY DEFINER fonksiyonlar RLS'yi aşar; executive RPC tenant'ı yanlış seçer; audit RPC başka tenant adına yazabilir; mutable tenant_id ilişkisel sınırı bozabilir; stored-XSS aynı tenant içinden yetkili kullanıcının çoklu tenant oturumunu kötüye kullanabilir. Bu nedenle izolasyon iddiası **şartlı ve eksik doğrulanmış** durumdadır.

# 8. DATABASE BULGULARI

1. **DB-001 / High:** `bookings` parasal alanlarında non-negative ve çapraz alan CHECK'leri yok.
2. **DB-002 / High:** `net_room_revenue` türetilmiş fakat serbestçe yazılabilir; gross/fee/discount ile tutarlılık garantisi yok.
3. **DB-003 / High:** Tenant eşleşmesi kompozit foreign key ile modellenmemiş; her yeni tablo için trigger unutma riski var.
4. **DB-004 / High:** Property hard delete cascade tarihsel booking ve finans bağlamını yok eder.
5. **DB-005 / Medium:** `updated_at DEFAULT NOW()` var fakat genel update trigger'ı görünmüyor; direct updates timestamp'i bayat bırakabilir.
6. **DB-006 / Medium:** Guest phone/email normalizasyon ve tenant-scoped duplicate stratejisi tam değil; booking içi guest ile guests tablosu ayrışabilir.
7. **DB-007 / Medium:** Capacity serbest metin; pax ile enforce edilemez.
8. **DB-008 / High:** Şema snapshot ve phase migration drift'i var; temiz kurulum deterministik değil.
9. **DB-009 / Medium:** Soft-delete/archive ve retention modeli çoğu business tabloda yok.
10. **DB-010 / Medium:** `audit_logs` tenant cascade ile silinir; tenant silindiğinde denetim kanıtı da yok olur. Hukuki retention kararı tanımsız.
11. **DB-011 / Medium:** `created_by` çoğu tabloda nullable ve direct client write'ta DB tarafından `auth.uid()`ya sabitlenmiyor.
12. **DB-012 / Medium:** `tenant_members` update policy kolon bazlı değil; user_id/tenant_id de role ile birlikte değiştirilebilir.
13. **DB-013 / Medium:** Aynı bilgi çok sayıda JSON snapshot/quote/audit alanında tutuluyor; schema/version ve retention politikası belirtilmemiş.
14. **DB-014 / DOĞRULANMALI:** 36 tablo/36 RLS sayımı olumlu; ancak production katalogda migration sonrası yeni tablo ve FORCE RLS/owner bypass durumu ayrıca doğrulanmalı.

# 9. FİNANS / KPI BULGULARI

1. FIN-001: Ciro/indirim/OPEX formülü üç uygulamada farklı — Critical.
2. FIN-002: Guest cleaning revenue ile actual cost karıştırılıyor — High.
3. KPI-001: Available nights/maintenance/activation tutarsız — High.
4. TEN-002: Executive RPC yanlış tenant ve booking count'u booked nights sayıyor — High.
5. Finans ekranında `forecastEndMonth = revenue × 1.018`; veri veya zaman ilerleme modeli olmadan sahte tahmin — High.
6. Hedef girilmediğinde 350.000/1.200.000 TL fallback'i hedef performansı gibi gösteriliyor — Critical kapsamında PROD-001.
7. Core reconciliation `financialRevenue - roomRevenue` farkını doğal cleaning revenue olmasına rağmen `hasWarning: false` sabitliyor; reconciliation gerçek muhasebe kontrolü değil — Medium.
8. Portfolio → property genel gider dağıtımında bazı eski/Excel dalları gelir payı veya sabit %20 kullanıyor; gerçek allocation policy yok — High.
9. Cancellation tümüyle dışlanıyor; cancellation revenue/refund/fee/no-show yok — High.
10. Revenue recognition eşit gece dağıtımı, günlük fiyat/quote snapshot'ı varken gerçek nightly rate dağılımını yok sayabilir — Medium; iş kararı gerekli.
11. Cash flow ile accrual rapor ayrılmıyor — High.
12. Mülk sonradan eklenince server geçmiş ay available nights'ı artırıyor — High.
13. ALL/custom period için payda 365/30 fallback'i gerçek tarih aralığını yansıtmıyor — High.
14. Currency, vergi ve owner payout yok — High.
15. KPI “0” ile “hesaplanamaz” ayrımı her yerde korunmuyor; core birçok NaN/missing durumda 0 döndürüyor, master ise `—` ister — Medium.

# 10. UX / PRODUCT BULGULARI

1. Hata durumunda tüm tenant state boş gösteriliyor; kullanıcı boş işletme ile yükleme hatasını karıştırabilir. Toast var fakat ekran düzeyinde persistent retry/state yok.
2. `alert()` tabanlı kritik CRUD geri bildirimi, modal focus/erişilebilirlik ve tutarlı hata modeli zayıf.
3. Mülk silme aksiyonu ağır cascade etkisini kullanıcıya açıklamıyor; arşiv seçeneği yok.
4. Kapalı dönem kontrolü istemcide yüklü listeye bağlı; stale state nedeniyle kullanıcı formu doldurduktan sonra DB hatası alabilir.
5. Davet oluşturuluyor fakat e-posta gönderilmiyor; kullanıcı journey'si davet edilen kişiyi ürüne taşımıyor.
6. Onboarding boş değerleri gerçek fiyat/maliyet varsayımıyla dolduruyor; kullanıcı bunların kendi verisi olduğunu sanabilir.
7. “2 Mesaj Planlandı”, “Teklif Uygun” ve sahte telefon gibi UI durumları kullanıcıyı yanlış aksiyona yöneltir.
8. Mobile/keyboard/screen-reader/contrast/focus yönetimi için kanıt yok — DOĞRULANMALI.
9. Offline durumda yazma engelleniyor fakat form taslağı ve güvenli retry yok; veri kaybı algısı sürer.
10. Tek sayfada çok sayıda modül ve eager render, kullanıcıyı ana journey'den uzaklaştıran feature density oluşturuyor — Medium.
11. Ürün vizyonu “executive control center + revenue engine” iken CRM, guest messaging, marketing AI, pricing, operations, import/export ve team modülleri aynı anda olgunlaştırılıyor; core doğruluk tamamlanmadan feature creep riski yüksek.
12. Empty state bazı yerlerde mevcut; fakat veri yokluğu, permission denied, loading, truncated data ve feature unavailable durumları net ayrılmıyor.

# 11. PERFORMANS / SCALE BULGULARI

| Ölçek | Beklenen davranış / risk |
|---|---|
| 1 property | Çalışabilir; fakat finans ve uydurma fallback doğruluk riski ölçekten bağımsızdır |
| 10 properties | Çoklu render ve tekrarlı hesaplar hissedilir; yine de ana darboğaz network dataset büyüklüğüdür |
| 100 properties | Tüm dropdown/render/portfolio loop'ları ve bütün booking listesinin client hesapları pahalılaşır |
| 1.000 properties | Eager UI seçenekleri, property × period hesapları ve asset/marketing yükleri pratik olmaktan çıkar |
| 10.000+ bookings | Sayfalamasız fetch, olası Supabase row cap, JS gece başına loop ve tam rerender eksik/yanlış dashboard üretir |

Ek bulgular:

- `getBookingFilterShare` rezervasyonun her gecesi için loop yapıyor; uzun kalış ve tekrarlı dashboard render'larında gereksiz maliyet.
- Ana veri çağrıları ayrı ve büyük ölçüde sıralı; tek hata bütün state'i blank'e çeviriyor.
- `renderAll` çok sayıda modülü yeniden render ediyor; diff/incremental update sınırı yok.
- `app.js` ve `index.html` büyük monolitler; başlangıç parse/compile ve cache invalidation maliyeti yüksek.
- GitHub Pages HTML cache'i 10 dakika; yeni frontend ile eski API/schema kombinasyonu için compatibility planı yok.
- Dashboard aggregate'ları istemci tarafında full-scan; DB indexleri olsa bile network ve browser maliyetini çözmez.
- Realtime listener yaşam döngüsünün masterda iddiası/test simülasyonu var; gerçek uygulama subscription/backpressure davranışı ayrıca doğrulanmalı.
- Marketing modülünde limitler var; ana booking/finance loader'da yok.

# 12. TEST EKSİKLERİ

1. Gerçek browser E2E: signup → onboarding → booking → finance → close → reopen → tenant switch.
2. Stored-XSS payload matrisi: tüm text/URL/name/notes/search alanları ve attribute context.
3. Production endpoint guard: test runner production ref'i gördüğünde kesin fail.
4. Finans kontrat testi: aynı fixture frontend/core/server snapshot/export/AI arasında byte-level eşit sonuç.
5. Discount, cleaning revenue/cost, refund, cancellation fee, partial payment ve chargeback testleri.
6. Multi-tenant dual-membership ile tenant_id mutation ve SECURITY DEFINER RPC negatif testleri.
7. Audit log spoofing/append-only testleri.
8. Migration from-empty ve N-1 → N testleri; drift ve idempotency; rollback/forward-fix provası.
9. Backup restore ve PITR tatbikat testi.
10. 10k/100k booking performans, pagination ve Supabase row-limit testi.
11. Offline, timeout-after-commit, duplicate submit ve retry idempotency testleri.
12. Worker crash-after-claim, lease expiry, duplicate webhook/delivery ve poison job testleri.
13. Property archive/delete ve closed-period cascade etkisi testleri.
14. Property activation, maintenance, owner stay ve leap-year denominator testleri.
15. Multi-year ALL/custom period KPI testleri.
16. Accessibility otomasyonu + manuel keyboard/focus/screen-reader testi.
17. CSP/security header ve dependency vulnerability/SBOM taraması.
18. PII retention/export/delete ve local cache temizleme testleri.
19. Davet mail teslimi, expired invitation, email change ve disabled account testleri.
20. Testlerin çoğunda gerçek fonksiyon yerine simüle edilmiş lokal mantık kullanılmasını önleyen coverage/contract testleri; örneğin tenant switch testi gerçek uygulama fonksiyonunu değil küçük bir mock akışı test ediyor.
21. `npm test`in gerçek master runner'a bağlı olduğu standart CI girişi.
22. AI prompt injection, schema-invalid output, timeout, cost ceiling, tenant context ve human-approval testleri.

# 13. POTANSİYEL GELİŞTİRMELER

## A — Yakın zamanda gerekli

- Finansal event/ledger ve payment/refund modeli — **eksik feature**.
- Property archive + availability calendar — **mevcut property lifecycle'ın daha iyi yapılması**.
- Server-side kanonik reporting API — **mevcut feature'ın daha iyi yapılması**.
- Staging, migration automation, drift gate ve recovery runbook — **platform eksikliği**.
- Güvenli rendering/CSP ve privacy lifecycle — **mevcut feature'ın güvenli yapılması**.
- Davet e-postası teslimi — **mevcut eksik akışın tamamlanması**.

## B — Ürün büyüdüğünde gerekli

- OTA/channel manager adaptör katmanı ve versioned webhook inbox/outbox — **yeni feature + future-proof altyapı**.
- Daily-rate based revenue recognition ve reconciliation — **mevcut finansın daha doğru yapılması**.
- Portfolio allocation rules ve owner statements — **yeni finans feature'ı**.
- Queue/worker platformu, dead-letter ve job observability — **mevcut worker altyapısının büyütülmesi**.
- Read model/materialized aggregate ve incremental analytics — **ölçek iyileştirmesi**.
- Public API, idempotency keys ve tenant-scoped service accounts — **yeni feature**.

## C — Nice-to-have

- Native mobile/PWA offline read cache — **yeni feature**, core doğruluk ve privacy sonrasında.
- Dynamic pricing dış sağlayıcı karşılaştırma/sandbox — **mevcut pricing'in genişletilmesi**.
- AI model abstraction, prompt registry ve evaluation dashboard — **mevcut AI feature'larının iyileştirilmesi**.
- Kullanıcı tanımlı dashboard/widget ve rapor şablonları — **yeni feature**.

# 14. ÖNCELİKLENDİRİLMİŞ MASTER ISSUE LIST

| ID | Sorun | Alan | Severity | Etki | Olasılık | Öncelik | Çözüm Karmaşıklığı |
|---|---|---|---|---|---|---|---|
| SEC-001 | Stored XSS | Security | Critical | Çok yüksek | Yüksek | P0 | Orta-Yüksek |
| FIN-001 | Finans motorları çelişkili | Finance/KPI | Critical | Çok yüksek | Kesin | P0 | Yüksek |
| PROD-001 | Uydurma veri/status/fallback | Product/Finance | Critical | Çok yüksek | Yüksek | P0 | Orta-Yüksek |
| REL-001 | Migration/schema drift ve manuel production deploy | Deployment/DB | Critical | Çok yüksek | Yüksek | P0 | Yüksek |
| SEC-002 | Audit log spoofing RPC | Security | High | Yüksek | Yüksek | P1 | Düşük-Orta |
| TEN-001 | Mutable tenant_id ile cross-tenant taşıma | Multi-tenant | High | Çok yüksek | Orta | P1 | Orta |
| DATA-001 | Property delete cascade tarihçeyi siler | Data | High | Çok yüksek | Orta | P1 | Yüksek |
| TEST-001 | Testler production DB'ye yazar | QA/Ops | High | Çok yüksek | Yüksek | P1 | Orta |
| SEC-003 | Anon EXECUTE migration bekliyor | Security | High | Yüksek | Kesin | P1 | Düşük |
| DATA-002 | PII/finance localStorage'da | Privacy | High | Yüksek | Yüksek | P1 | Orta |
| SCALE-001 | Sayfalamasız tüm veri yükleme | Performance | High | Yüksek | Yüksek | P1 | Yüksek |
| FIN-002 | Cleaning revenue/cost karışık | Finance | High | Yüksek | Yüksek | P1 | Orta-Yüksek |
| KPI-001 | Available nights tutarsız | KPI | High | Yüksek | Yüksek | P1 | Yüksek |
| TEN-002 | Executive RPC yanlış tenant/formül | Backend/KPI | High | Yüksek | Orta | P1 | Orta |
| OPS-001 | Observability/backup/recovery yok | Operations | High | Çok yüksek | Orta | P1 | Yüksek |
| FIN-003 | Payment/refund/tax/currency ledger yok | Finance | High | Çok yüksek | Yüksek | P1 | Yüksek |
| DB-001 | Booking parasal constraint'leri eksik | Database | High | Yüksek | Orta | P1 | Orta |
| DB-002 | net_room_revenue serbest türetilmiş alan | Database/Finance | High | Yüksek | Yüksek | P1 | Orta |
| DEP-001 | Staging/CI/release/rollback gate yok | Deployment | High | Çok yüksek | Orta | P1 | Orta-Yüksek |
| AUTH-001 | Davet e-postası teslim edilmiyor | Auth/Product | Medium | Orta | Kesin | P2 | Orta |
| DATE-001 | Custom/ALL tarih paydaları hatalı | Date/KPI | High | Yüksek | Orta | P1 | Orta |
| DATE-002 | Istanbul/browser timezone fallback'leri | Date/Ops | Medium | Orta | Orta | P2 | Orta |
| DB-005 | updated_at otomatik ve tutarlı değil | Database | Medium | Orta | Yüksek | P2 | Düşük-Orta |
| UX-001 | Loading/error/empty ayrımı ve retry zayıf | UX | Medium | Orta | Yüksek | P2 | Orta |
| AI-001 | AI privacy/prompt/version/cost governance eksik | AI/Security | High | Yüksek | Orta | P1 | Orta-Yüksek |
| PERF-002 | Monolitik eager render ve nightly loops | Frontend | Medium | Orta-Yüksek | Yüksek | P2 | Yüksek |
| TEST-002 | Mock/source-regex testlerinde yanlış güven | QA | Medium | Yüksek | Yüksek | P2 | Orta |
| DOC-001 | README/master/repo envanteri drift'i | Documentation | Low | Düşük-Orta | Kesin | P3 | Düşük |
| GROW-001 | OTA/public API/webhook sözleşmesi yok | Future | Medium | Orta | Orta | P4 | Yüksek |

# 15. GO / NO-GO DEĞERLENDİRMESİ

## NO-GO

1. Stored-XSS yüzeyi tenant ve hesap güvenliğini production blocker seviyesinde tehdit ediyor.
2. Aynı finansal veri için farklı motorlar farklı ciro, OPEX ve kâr üretiyor.
3. Uydurma sayı ve operasyon durumları master'ın temel ürün garantisini ihlal ediyor.
4. Migration zinciri deterministik değil; production ile temiz kurulum arasında doğrulanmış drift var.
5. Bekleyen anon permission düzeltmesi ve audit-log spoofing API güvenlik yüzeyi bırakıyor.
6. Çoklu tenant UPDATE sınırları tenant ilişkisel bütünlüğünü garanti etmiyor.
7. Production üzerinde service-role testleri canlı sistem için kabul edilemez operasyonel risk.
8. Property hard-delete ve eksik recovery planı tarihsel/finansal veri kaybını geri döndürülemez yapabilir.
9. Payment/refund/tax/currency ve availability domainleri gerçek finans/KPI doğruluğu için yetersiz.
10. Büyük tenantlarda full-client load sessiz eksik rapor veya kullanılamayan UI üretebilir.

**Çıkış kriteri:** SEC-001, FIN-001, PROD-001 ve REL-001 tamamen kapatılmadan; SEC-002/003, TEN-001, DATA-001/002, TEST-001, FIN-002/003, KPI-001 ve OPS-001 için doğrulanmış P1 kabul kriterleri sağlanmadan GO verilmemelidir.

---

## İkinci tur çapraz-modül sonucu

İlk turdan sonra özellikle `Booking → Financial → KPI → Dashboard`, `User → Tenant → RPC`, `Property → Availability → Occupancy`, `Property delete → Booking history → Month close`, `Browser storage → XSS → PII` ve `Migration file → schema snapshot → production` zincirleri yeniden tarandı. İlk turda yalnız modül içi görünen sorunların çoğunun gerçek etkisi bu bağlantılarda büyüdü. Özellikle finans çelişkisi, temizlik ücreti semantiği, yanlış active tenant seçimi, maintenance'ın loader'da boşaltılması ve stored-XSS bu ikinci turda production blocker/P1 olarak doğrulandı.
