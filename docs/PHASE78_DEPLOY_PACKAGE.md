# Phase 78 + 80 — P61 fiyat araştırması ve gider şablonu

Durum: Kod ve test projesi doğrulandı. Üretime uygulanmadı.

Bu paket iki değişmez göçten oluşur ve üretimde **bu sırayla, aynı bakım turunda** uygulanır:

1. `supabase/migration_phase78_pricing_research_expense_templates.sql`
2. `supabase/migration_phase80_research_business_date.sql`

Phase80 isteğe bağlı değildir. Phase78’deki `CURRENT_DATE`, Supabase oturumunda UTC günü kullandığı için İstanbul’da 00:00–02:59 arasında bugünün rakip araştırmasını gelecek tarih sanıyordu. Test projesindeki canlı tur bunu yakaladı; uygulanmış phase78 değiştirilmedi ve düzeltme yeni göçe kondu.

## Kapsam

- `message_templates.lifecycle_stage` artık `LEAD_QUOTE_FOLLOW_UP` ve `LEAD_REENGAGEMENT` değerlerini kabul eder; `message_type` işlemsel/pazarlama ayrımı değişmez.
- `property_pricing_rule_settings`: ev bazlı sade fiyat kuralları.
- `competitor_price_research`: tarihli, URL kaynaklı ve kullanıcı onaylı fiyat araştırması.
- `expense_templates` ve `expense_template_occurrences`: sabit gider şablonu ile önceki gider/kopyalanan gider bağı.
- `properties` ve `expenses` tablolarına sütun eklenmez.

Yeni tablolar RLS, `tenant_id` değişmezlik tetikleyicisi, merkezi rol yardımcıları ve çapraz kiracı bağ denetimi taşır. Fiyat ve araştırma verisini satış okuyucuları görebilir; yalnız yönetim yazar. Gider şablonlarını defter okuyucuları görür; yalnız yönetim yazar. Staff hiçbirini görmez. Anon yetkisi yoktur.

`reset_tenant_data` dört tabloyu da siler. Hesap kapatmada tenant FK’leri cascade’dir. Yeni görünüm veya başka tabloya satır üreten tetikleyici olmadığı için RestoreEngine `VIEWS` / `SIDE_EFFECTS` listelerine ek yapılmadı; backup tabloları OpenAPI’den otomatik keşfeder.

## Uygulama öncesi

1. Üretim yedeği alın: `npm run backup`.
2. `npm run verify:migrations` yeşil olmalı.
3. SQL Editor’da hedefin üretim proje ref’i `kirpcqklyjlrhvdbgdrq` olduğunu elle doğrulayın.
4. Phase78’i, ardından phase80’i eksiksiz çalıştırın. Yalnız bir bölümünü seçmeyin.

## Uygulama sonrası doğrulama

Anon anahtarla aşağıdaki nesnelere yapılan REST okumaları `401/42501 permission denied` vermelidir:

- `property_pricing_rule_settings`
- `competitor_price_research`
- `expense_templates`
- `expense_template_occurrences`

SQL Editor’da ayrıca:

```sql
select version, name
from public.schema_migrations
where version in (78, 80)
order by version;
```

iki satır dönmelidir. Phase80 doğrulama bloğu `Europe/Istanbul` içermeyen tarih kuralında işlemi zaten durdurur.

## Kanıt

- Göç öncesi canlı süit: mesaj aşaması `23514`, dört tablo `PGRST205` ile kırmızı.
- Phase78 sonrası ilk tur: 17/19; UTC/İstanbul iş tarihi kusuru yakalandı.
- Phase80 sonrası `core/phase78_pricing_expense_live_tests.js`: 19/19 yeşil.
- `npm run test:bootstrap`: test projesinde phase78 ve phase80 başarıyla uygulandı.
- `core/phase41_rules_tests.js`, `core/phase59_context_tests.js`, `core/phase78_pricing_expense_tests.js`: yeşil.

Canlı süitler üretime karşı çalıştırılmaz. Üretim uygulaması kullanıcıdan ayrı ve açık onay gerektirir.
