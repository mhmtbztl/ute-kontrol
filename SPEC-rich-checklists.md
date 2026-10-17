# Zengin Operasyon Kontrol Listeleri — Spesifikasyon

Durum: Kullanıcı tarafından onaylandı ve uygulandı (2026-10-16)

Yetenek: CAP-G9-01

Kaynak geri bildirim: L-207 / M36

## 1. Amaç

Operasyon yöneticileri, teknik bir metin sözdizimi öğrenmeden bölümlü kontrol
listeleri hazırlayabilmelidir. Temizleyici veya personel yalnızca kendisine
atanmış işi mobil ekranda uygulayabilmeli; temizlik ve misafir öncesi son
kontrol görevleri gerçek Supabase verisiyle kaydedilmelidir.

İlk teslim, var olan zengin temizlik yürütme altyapısını görünür ve
kullanılabilir hâle getirir; aynı yapı `CHECKIN_PREP` görevlerine bağlanır.

## 2. Kapsam

### 2.1 Şablon yönetimi

Yetkili yönetim rolleri şu alanlarla şablon oluşturabilir ve düzenleyebilir:

- ad
- tür: `CLEANING` veya `CHECKIN_PREP`
- kapsam: portföy geneli veya tek mülk
- sıralanabilir bölümler
- her bölümde sıralanabilir ana maddeler
- her ana maddede sıralanabilir alt kontroller
- ana madde için `important` işareti
- yalnız temizlik türünde alan ve malzeme/sarf satırları
- aktif/pasif durumu

Düzenleyici görsel alanlar ve ekle/sil/sırala eylemleri kullanır. Mevcut
`# bölüm`, `! önemli`, `> alt madde` metin sözdizimi kullanıcıdan beklenmez.

### 2.2 Şablon birleştirme ve anlık görüntü

- Portföy geneli aktif şablon temel listeyi sağlar.
- Mülke özel aktif şablon varsa onun bölümleri ve malzemeleri temel listenin
  ardından eklenir.
- Görev atandığı/oluşturulduğu anda birleşik şablon göreve anlık görüntü
  olarak kopyalanır.
- Sonraki şablon değişiklikleri geçmiş veya başlamış görevi değiştirmez.
- Her tür ve kapsam için tek etkin şablon bulunur. Aynı tür/kapsamda yeni bir
  etkin şablon oluşturmak yerine mevcut kayıt düzenlenir veya önce arşivlenir.
- Görev oluşturulurken en yüksek sürümlü portföy ve mülk şablonu seçilir;
  arayüz birleşme sırasını açıkça gösterir.

### 2.3 Temizlik uygulaması

- Yönetici temizliği aktif ve bağlantılı bir temizleyici/personele atar.
- Atanan kişi ana maddeleri ve alt kontrolleri işaretler, malzeme durumunu
  seçer ve not ekleyebilir.
- Ara kayıt desteklenir.
- Var olan Z imza, yönetici M kontrol/yeniden açma/onay ve masraf oluşturma
  akışı korunur.
- Yönetici onayı öncesinde finansal kayıt oluşmaz.

### 2.4 Misafir öncesi son kontrol

- Onaylanmış rezervasyon için oluşturulan `CHECKIN_PREP` operasyon görevi,
  portföy ve mülke uygun zengin şablonun anlık görüntüsünü taşır.
- Görev aktif ve bağlantılı bir personele atanabilir.
- Atanan personel bölümleri, ana maddeleri ve alt kontrolleri mobil çalışma
  ekranında görür; ilerlemeyi kaydedip görevi tamamlar.
- Eski dizi biçimli `CHECKIN_PREP` listeleri aynı ekranda çalışmaya devam
  eder.

### 2.5 Kapsam dışı

- JPG, fotoğraf veya ekran görüntüsünden liste çıkarma
- Excel/CSV içe aktarma veya dışa aktarma
- ChatGPT/AI ile otomatik şablon oluşturma
- yeni bir genel amaçlı form oluşturucu
- ayrıntılı yetki matrisi (CAP-G9-02)
- uygulama geneli görsel yeniden tasarım (CAP-G9-03)

## 3. Roller ve güvenlik sınırları

- Şablon yazma ve görev atama yalnız mevcut yönetim yetkisi olan rollere
  açıktır; karar yalnız arayüz gizlemelerine bırakılmaz.
- Personel yalnız kendi kullanıcı kimliğine atanmış operasyon görevlerini
  okuyabilir ve güncelleyebilir.
- Personel başka kişinin görevini, şablonu veya finansal alanları değiştiremez.
- Yetki kontrolleri mevcut rol yardımcıları ve dar kapsamlı Supabase RPC/RLS
  sözleşmeleri üzerinden uygulanır; istemciden gelen rol beyanına güvenilmez.
- Kullanıcı girdileri mevcut HTML kaçış ve eylem izin listesi kurallarına
  uyar.
- Uydurma varsayılan veri, `localStorage` kalıcılığı veya sessiz başarılı
  görünüm kullanılmaz.

## 4. Veri sözleşmesi ve geriye uyumluluk

Tercih edilen şablon biçimi mevcut zengin JSON sözleşmesidir:

```json
{
  "sections": [
    {
      "title": "Mutfak",
      "items": [
        {
          "text": "Tezgâhı kontrol et",
          "important": true,
          "subChecks": ["Ocak", "Eviye"]
        }
      ]
    }
  ],
  "supplies": [
    { "area": "Mutfak", "item": "Çay" }
  ]
}
```

Kurallar:

- Var olan `property_checklist_templates.items` sözleşmesi yeniden kullanılır.
- `CLEANING` için `sections` ve isteğe bağlı `supplies` desteklenir.
- `CHECKIN_PREP` için `sections` kullanılır; malzeme listesi gösterilmez.
- Eski dizi biçimli maddeler okunur, görüntülenir ve veri kaybı olmadan
  düzenleme biçimine dönüştürülebilir.
- Bilinmeyen veya bozuk JSON sessizce boş listeye çevrilmez; kullanıcıya
  dürüst bir hata gösterilir ve ham kayıt üzerine yazılmaz.
- Operasyon görevinin şablon anlık görüntüsü, şablon kimliği/sürümü ve görev
  ilerlemesi birbirinden ayrılır.

Veritabanı değişikliği yalnız atanan personelin `CHECKIN_PREP` ilerlemesini
güvenli biçimde kaydetmek için mevcut RPC/RLS sözleşmesi yeterli değilse
yapılır. Gerekirse yeni ve değişmez bir Codex çift numaralı migration eklenir;
üretime uygulanması bu işin veya push izninin parçası değildir ve ayrıca açık
onay gerektirir.

## 5. Teknik sınırlar ve beklenen çalışma alanı

Mevcut yığın korunur: statik HTML/CSS/JavaScript, Node.js testleri ve
Supabase/PostgreSQL.

Beklenen değişiklik alanları:

- `app.js`: görsel şablon düzenleyici, normalleştirme, görev görünümü ve
  istemci çağrıları
- `index.html` ve/veya mevcut stil dosyaları: erişilebilir düzenleyici ve
  mobil personel görünümü
- `core/operations_engine.js`: zengin ve eski biçimden doğru görev anlık
  görüntüsü oluşturma
- `core/*_tests.js`: dönüştürme, seçim, güvenlik ve geriye uyumluluk testleri
- gerekirse yeni `supabase/migration_phase<N>_*.sql` ve manifest girdisi

Yeni çalışma zamanı bağımlılığı eklenmez. Uygulanan kod mevcut modül ve
yardımcı desenlerini izler; büyük dosyada mümkün olduğunca küçük, isimli ve
test edilebilir saf dönüştürme işlevleri kullanılır.

Örnek dönüşüm sınırı:

```js
normalizeChecklistTemplate(rawItems) -> {
  sections: [...],
  supplies: [...],
  sourceFormat: 'rich' | 'legacy'
}
```

Bu işlev bozuk veriyi gizlemez; doğrulama hatasını çağırana taşır.

## 6. Erişilebilirlik ve mobil davranış

- Tüm ekle, sil, sırala ve işaretleme eylemleri klavyeyle kullanılabilir.
- Her girişin görünür etiketi; her hata mesajının ilgili alanla bağlantısı
  vardır.
- Yalnız renkle anlam aktarılmaz; önemli maddeler metin/ikon açıklaması taşır.
- Odak sırası bölüm → ana madde → alt kontroller şeklinde öngörülebilirdir.
- 390 px genişlikte yatay kaydırma olmadan düzenleme ve uygulama yapılabilir.
- Kaydediliyor, kaydedildi ve başarısız durumları görünürdür; çift gönderim
  engellenir.

## 7. Test stratejisi

Uygulama test-kırmızı → düzeltme → sadeleştirme sırasıyla ilerler.

Odak testleri:

- zengin JSON normalleştirme ve doğrulama
- eski dizi biçimiyle geriye uyumluluk
- portföy + mülk şablonlarının deterministik birleşmesi
- şablon değişince görev anlık görüntüsünün değişmemesi
- `CLEANING` ve `CHECKIN_PREP` tür ayrımı
- bölüm, ana madde, alt kontrol ve malzeme ilerleme serileştirmesi
- atanmamış kullanıcının görevi güncelleyememesi
- finansal alanların personel yanıtına sızmaması
- bozuk kaydın sessizce üzerine yazılmaması
- 390 px personel ve yönetici akışı

Teslim kapıları:

```text
npm test
npm run verify:migrations
node stamp_assets.js --check
```

Veritabanı/RPC değişirse ayrıca ayrılmış Supabase test projesinde:

```text
npm run test:bootstrap
npm run test:live
```

Canlı testler üretime karşı çalıştırılmaz. Gerçek tarayıcı kapısı yönetici
şablon oluşturma ve atanmış personel uygulama akışını mobil genişlikte kapsar.

## 8. Başarı ölçütleri

1. Yetkili kullanıcı, metin sözdizimi kullanmadan `CLEANING` veya
   `CHECKIN_PREP` şablonu oluşturup düzenleyebilir.
2. Şablon portföy geneline veya bir mülke bağlanabilir; birleşme sonucu görev
   oluşturulmadan önce görülebilir.
3. Bölümler, maddeler, alt kontroller, önemli işareti ve temizlik malzemeleri
   veri kaybı olmadan kaydedilir.
4. Temizlik ataması mevcut zengin yürütme ve Z/M onay akışıyla çalışır.
5. Misafir öncesi görev zengin anlık görüntüyü taşır; atanan personel mobil
   ekranda ilerleme kaydedip tamamlayabilir.
6. Eski dizi biçimli şablon ve görevler çalışmayı sürdürür.
7. Yetkisiz veya atanmamış kişi sunucu üzerinden de değişiklik yapamaz.
8. Boş, eksik veya bozuk veri uydurulmaz; kullanıcıya anlaşılır durum
   gösterilir.
9. Odak testleri, tam test paketi, migration doğrulaması ve varlık damgası
   kontrolü yeşildir.
10. Varsa yeni migration yalnız dosya/manifest olarak teslim edilir; üretime
    kendiliğinden uygulanmaz.

## 9. Uygulama dilimleri

Bu başlık plan değildir; onaylanacak ürün sınırlarını gösterir.

- RC-01: Ortak zengin/legacy veri normalleştirme ve test sözleşmesi
- RC-02: Görsel şablon düzenleyici ve kapsam/tür yönetimi
- RC-03: Temizlik atama ve mevcut Z/M akışının uçtan uca doğrulanması
- RC-04: `CHECKIN_PREP` anlık görüntü seçimi, personel uygulaması ve gerekirse
  dar kapsamlı güvenli RPC
- RC-05: mobil/erişilebilirlik doğrulaması ve tam teslim kapıları

## 10. Açık ürün kararı

Görevin “tamamlandı” durumuna geçebilmesi için checkbox zorunluluğu
netleştirilmelidir:

- A: bütün ana ve alt maddeler tamamlanmadan bitirilemez
- B: yalnız `important` ana maddeler ve onların alt kontrolleri zorunludur
- C: hiçbir madde teknik olarak zorunlu değildir; eksikler görünür kalır

Önerilen varsayılan B'dir. Böylece kritik misafir/temizlik kontrolleri garanti
edilirken bağlama göre isteğe bağlı maddeler işi gereksiz yere kilitlemez.

Karar: Kullanıcı onayıyla B uygulandı. `important` ana maddeler ve bunların
alt kontrolleri tamamlanmadan Z imzası veya operasyon görevi `DONE` geçişi hem
istemcide hem sunucuda engellenir.
