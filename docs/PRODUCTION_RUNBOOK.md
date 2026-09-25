# Lexbnb üretim runbook'u

Üretim şemasının kanonik sırası `supabase/schema.sql` ve ardından `supabase/migration_manifest.txt` içindeki 52 değişmez migration'dır. Üretime migration yalnız Supabase SQL Editor'den, kullanıcı tarafından ve ayrı açık onayla uygulanır.

## Gerçek altyapı durumu — 25 Eylül 2026

- Ayrı Supabase test projesi var; bootstrap ve canlı regresyon burada çalışır.
- Üretim için otomatik staging ortamı yoktur.
- Supabase Free planda yönetilen PITR yoktur. `npm run backup` haftalık manuel geri yüklenebilir yedektir; ilk gerçek müşteriden önce Pro plana geçiş kararı vardır.
- Harici alarm/Sentry kurulmamıştır. Aşağıdaki kontroller operasyon kontrol listesidir, otomatik alarm değildir.
- `schema_migrations` üretimde yalnız 24, 25, 29, 39, 41 ve 43'ü kaydediyor; eski phase'ler için tek başına kanıt değildir.
- Phase40'ın `property_analysis_contexts` sözleşmesi üretim OpenAPI'sinde görüldü. Phase38 aynı RPC imzasını yeniden tanımladığı ve deftere yazmadığı için üretimdeki durumu dışarıdan bağımsız olarak ayırt edilemedi; test projesinde kuruludur.
- Phase11, Phase42 ve Phase44 üretimde bekliyor. `npm run production:readiness` bu nedenle kırmızıdır.
- Üretime özgü `rls_auto_enable` RPC'si Supabase'in RLS otomasyon yardımcısıdır;
  uygulama sözleşmesi değildir ve exact-name allowlist'tedir. Kaynağı
  anlaşılmadan silinmez. Teste özgü `lexbnb_bootstrap_log` da yalnız bootstrap
  defteri olarak allowlist'tedir; başka beklenmeyen nesneler hata kalır.

## Dağıtım öncesi kapılar

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run verify:migrations
npm run templates:check
node stamp_assets.js --check
```

Migration değişikliği varsa:

```powershell
$env:LEXBNB_ALLOW_DESTRUCTIVE_TESTS = '1'
$env:LEXBNB_CONFIRM_REMOTE_TEST_PROJECT = 'pdeiorpgxetksyogrmbi.supabase.co'
npm run test:bootstrap
npm run test:live
```

Canlı test üretimi hedefleyemez. Phase11/42 özel kanıtları `npm run test:phase11-late` ve `npm run test:phase42-live` komutlarıdır.

## Üretim dağıtımı

1. `npm run backup` ile repo dışına yedek alıp manifest hatası olmadığını doğrulayın.
2. İlgili deploy paketindeki ön kontrol sorgularını çalıştırın.
3. Migration dosyalarını paketteki sırayla SQL Editor'de çalıştırın. Uygulanmış dosyayı düzenlemeyin.
4. `notify pgrst, 'reload schema';` ile OpenAPI önbelleğini yenileyin.
5. Salt okunur readiness kapısını çalıştırın:

```powershell
$env:LEXBNB_CONFIRM_PRODUCTION_PROJECT = 'kirpcqklyjlrhvdbgdrq.supabase.co'
npm run production:readiness
```

6. Uygulama commitini master'a yalnız `AGENTS.md` içindeki `PUSH` kapısıyla gönderin.
7. Pages build commitini `docs/RELEASE_PROCESS.md` komutuyla doğrulayın.

Phase11 için tek kaynak: `docs/PHASE11_DEPLOY_PACKAGE.md`.

## Operasyon kontrolleri

Bunlar bugün otomatik alarm değildir; dağıtım sırasında elle kontrol edilir:

```sql
select status, count(*) from public.invitation_delivery_outbox group by status;
select count(*) from public.financial_transactions;
select count(*) from public.properties where archived_at is not null and is_active;
```

- Eski `PENDING/PROCESSING` davetler ve son denemeye ulaşmış `FAILED` kayıtlar incelenir.
- `loadState.stale=true` görülürse veri boşaltılmaz; Supabase erişimi ve RLS hataları incelenir.
- Secret'lar loglanmaz. Anahtar döndürme K-02 kapsamında son güvenlik adımını bekliyor; otomatik 90 gün rotasyonu kurulmuş değildir.

## Geri alma ve olay yönetimi

Uygulama kodu `git revert` ile yeni commit üzerinden geri alınır; force push yapılmaz. Son başarılı Pages commitini belirleme ve doğrulama adımları `docs/RELEASE_PROCESS.md` içindedir.

Uygulanmış migration silinmez veya geriye düzenlenmez. Kusur yeni çift phase migration ile ileri yönlü düzeltilir. Veri kaybı/tenant sızıntısında yazma akışı durdurulur, ilgili anahtar döndürülür, audit kayıtları korunur ve etkilenen tenant/zaman aralığı belirlenir.

RPO 15 dakika, RTO 60 dakika ve üç aylık staging geri yükleme tatbikatı bugün mevcut kabiliyet değil, gelecekteki Pro/staging hedefidir. Mevcut geri kazanım kanıtı `docs/BACKUP_RESTORE.md` içindeki manuel backup/restore turudur.

## Saklama ve mahremiyet

Misafir PII'si tarayıcı kalıcı depolamasına yazılmaz. Hesap silme/KVKK akışı uygulama kayıtlarını siler; yedek saklama ve silme politikası yasal metinlerle birlikte henüz kesinleştirilmelidir. Harici AI işleme yalnız belgelenmiş amaç, açık onay ve gerekli en az veriyle açılır.
