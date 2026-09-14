# Phase 24 — RGVQI denetim düzeltmeleri

Phase 24, denetimdeki kritik bulguları tek bir finans ve güvenlik sözleşmesinde toplar:

- Çalıştırılabilir HTML enjeksiyonu merkezi olarak filtrelenir; kullanıcı değerleri temel render akışlarında kaçışlanır ve komut paleti inline JavaScript kullanmaz.
- `tenant_id`, üye kimliği, `created_by` ve `updated_at` veritabanı tetikleyicileriyle korunur; audit RPC'si yalnızca servis rolüne açıktır.
- Mülk silme arşivlemeye dönüştürülür; tarihsel gelir ve doluluk geçmişi korunur.
- Gelir `gross - discount`, oda geliri `gross - cleaning_fee - discount`, OTA komisyonu OPEX olarak tanımlanır. Temizlik bedeli gelir kalemidir; gerçek temizlikçi ödemesi expense tablosundan gelir.
- Müsait gece aktif yaşam döngüsü ve açık bakım tarih aralıklarından hesaplanır; bakım günleri mülk/gün bazında tekilleştirilir.
- Ödeme, iade, vergi, chargeback ve payout olayları için `financial_transactions` defteri eklenir.
- Tenant davetleri outbox ve servis-rolü worker ile gerçek e-postaya dönüştürülür.
- Liste okumaları sayfalanır, bağımsız kaynaklar paralel yüklenir ve ağ hatasında doğrulanmış son ekran korunur.
- Varsayılan test komutu harici sisteme yazmaz. Canlı testler yalnızca açık test-projesi onayıyla çalışır.

Göç henüz bir ortama uygulanmadıysa uygulama kodunu o ortama yayımlamayın. Ayrıntılı sıra ve geri kazanım adımları `docs/PRODUCTION_RUNBOOK.md` içindedir.
