# Lexbnb üretim runbook'u

Bu belge Phase 24 denetim düzeltmelerinin güvenli dağıtım, gözlem ve geri kazanım prosedürüdür. Üretim şeması için tek geçerli kurulum sırası `supabase/schema.sql` ve ardından `supabase/migration_manifest.txt` içindeki göçlerin dosya sırasıdır. Bir göç dosyası yayımlandıktan sonra değiştirilmez; yeni düzeltme yeni bir göç olarak eklenir.

## Dağıtım öncesi kapılar

1. `npm ci --ignore-scripts --no-audit --no-fund`
2. `npm run verify:migrations`
3. `npm test` — ağ ve canlı veritabanı kullanmayan regresyon paketi
4. Ayrı bir Supabase test projesinde `TEST_SUPABASE_URL`, `SUPABASE_URL`, servis anahtarı ve `LEXBNB_ALLOW_DESTRUCTIVE_TESTS=1` ile `npm run test:live`. Üretim proje URL'si kullanılamaz.
5. Staging yedeği ve geri dönüş noktası doğrulanır; Phase 24 staging'e uygulanır; RLS, tenant değiştirme, mülk arşivleme, ay kapama ve davet teslimatı duman testleri yapılır.

## Üretim dağıtım sırası

1. Supabase otomatik yedek/PITR durumunu ve son başarılı yedeği doğrula.
2. `migration_phase24_audit_remediation.sql` ve ardından `migration_phase25_marketing_review_authz_order.sql` dosyasını ayrı, tekil işlemler olarak uygula.
3. `schema_migrations` tablosunda `24` ve `25` kayıtlarını ve beklenen nesneleri doğrula.
4. Uygulama kodunu yayımla. Şema, koddan önce gelmelidir; yeni uygulama `financial_transactions` tablosunu okur.
5. Worker secret'larını ayarla: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LEXBNB_PUBLIC_URL`. Fotoğraf analizi için ayrıca `GEMINI_API_KEY` ve açık onay olarak `AI_DATA_PROCESSING_APPROVED=1` gerekir.
6. Worker iş akışını elle bir kez çalıştır; davet outbox'ının `SENT`, AI kuyruğunun `SUCCEEDED/IDLE` durumuna geçtiğini doğrula.

## Doğrulama sorguları

```sql
select version, applied_at from public.schema_migrations order by version desc limit 5;
select status, count(*) from public.invitation_delivery_outbox group by status;
select count(*) from public.financial_transactions;
select count(*) from public.properties where archived_at is not null and is_active;
```

Arşivlenmiş bir mülk için son sorgu sıfır olmalıdır. İki test tenant'ı ile diğer tenant'ın UUID'sine SELECT/INSERT/UPDATE ve `tenant_id` değiştirme denemeleri `42501` ile reddedilmelidir. `log_audit_event` authenticated/anon çağrısı reddedilmelidir.

## Gözlem ve alarmlar

- 5 dakika içinde 5'ten fazla `42501`, göç hatası veya ay-kapatma mutabakat farkı: yüksek öncelikli alarm.
- `invitation_delivery_outbox` içinde 15 dakikadan eski `PENDING/PROCESSING` ya da 5 denemeye ulaşmış `FAILED`: operasyon alarmı.
- Fotoğraf analizinde art arda 3 worker hatası veya 30 dakikadan eski iş: operasyon alarmı.
- Uygulama `loadState.stale=true` raporluyorsa veri boşaltılmaz; Supabase erişimi ve RLS logları incelenir.
- Secret'lar loglanmaz; service-role anahtarı yalnızca CI/worker secret store'da tutulur ve en az 90 günde bir döndürülür.

## Geri alma ve olay yönetimi

Uygulama kodu önceki sürüme geri alınabilir. Veritabanında yayımlanmış göç geriye doğru silinmez; veri kaybı riskini önlemek için ileri yönlü düzeltme göçü hazırlanır. Kritik tenant sızıntısında yazma trafiği durdurulur, servis anahtarı döndürülür, audit kayıtları korunur ve etkilenen tenant/zaman aralığı belirlenir.

Hedefler: RPO en fazla 15 dakika, RTO en fazla 60 dakika. Üç ayda bir staging'e yedek geri yükleme tatbikatı yapılır; başlangıç/bitiş, veri sayımları ve sapmalar kaydedilir. Gerçek veri kaybında PITR ile ayrı projeye dönülür, tenant ve finans toplamları doğrulanmadan DNS/istemci geçişi yapılmaz.

## Saklama ve mahremiyet

Misafir PII'si tarayıcı kalıcı depolamasına yazılmaz. Hesap silme/KVKK akışı uygulama kayıtlarını siler; yedeklerdeki veriler yedek saklama süresi sonunda kaybolur. Finans ve audit kayıtları yasal saklama politikasına göre tutulur. AI işleme yalnızca belgelenmiş amaç, yetki ve `AI_DATA_PROCESSING_APPROVED=1` ile açılır; sağlayıcıya yalnızca gerekli görsel ve en az metadata gönderilir. Sağlayıcı saklama/eğitim ayarları sözleşme öncesi doğrulanır ve onay geri çekildiğinde worker secret'ı kaldırılır.
