# Sürüm ve yayın süreci

## Kanonik sürüm kimliği

Tek kaynak `package.json` içindeki `version` alanıdır. Varlık sorgu hash'leri yalnız önbellek kırar; ürün sürümü değildir. Sürüm değişikliği, `package.json` ve `CHANGELOG.md` aynı committe güncellenmeden tamamlanmış sayılmaz.

SemVer kullanılır:

- MAJOR: geri uyumsuz veri/arayüz sözleşmesi;
- MINOR: geriye uyumlu özellik;
- PATCH: geriye uyumlu hata veya güvenlik düzeltmesi.

Tag biçimi `v<package.json version>` olmalıdır. Tag ve GitHub release ancak tüm kapılar yeşilken ve kullanıcı açıkça onayladıktan sonra oluşturulur.

## Bugünkü doğrulanmış yayın durumu

- GitHub release: yok.
- Git tag: yok.
- GitHub Pages: legacy build, `master` kökü, özel alan adı `lexbnb.space`.
- Son başarılı Pages build commit'i: `ca6fbb9f291f112cd8bb4626d585c9ba0f73d748` (25 Eylül 2026).
- Bu committen önceki doğrudan rollback adayı: `a06e435`. Rollback öncesi ilgili Pages build'in başarılı olduğu ayrıca doğrulanır.

## Yayın doğrulaması

```bash
npm test
npm run verify:migrations
npm run templates:check
node stamp_assets.js --check
git diff --check
git log --oneline origin/master..HEAD
```

Pages'in gerçekten hangi commit'i yayımladığını okuyun:

```bash
gh api repos/mhmtbztl/ute-kontrol/pages/builds/latest \
  --jq '{status:.status,commit:.commit,created_at:.created_at,updated_at:.updated_at,error:.error.message}'
```

`status=built`, `error=null` ve `commit` hedef commit olmadan yayın tamamlanmış sayılmaz.

## Geri alma

1. Son başarılı Pages build commitini kaydedin.
2. Bozuk değişikliği `git revert <commit>` ile yeni bir commit olarak geri alın; geçmişi yeniden yazmayın ve force push yapmayın.
3. Normal `PUSH` kapısından geçin.
4. Pages build API'sinde revert commitinin `built` olduğunu doğrulayın.
5. Migration yayımlandıysa SQL dosyasını geri almayın; ileri yönlü düzeltme migration'ı hazırlayın.

## Önerilen ilk tag

Mevcut kanonik sürüm `1.0.0`; önerilen tag `v1.0.0`dır. Hedef, Dalga 2 commitleri master'a girdikten ve üretim Phase11/42/44 readiness kapısı yeşil olduktan sonraki doğrulanmış master commitidir. Hedef hash bugün henüz oluşmadığı için uydurulmaz. Açık kullanıcı onayı olmadan tag oluşturulmaz veya remote'a gönderilmez.
