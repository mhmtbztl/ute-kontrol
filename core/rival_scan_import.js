/**
 * Rakip analizi taramasini (rakip-analizi skill'i, tarama_YYYY-MM-DD.json) Lexbnb'nin
 * kaynakli rakip fiyat defterine (competitor_price_research, phase78/115) cevirir.
 * Kullanici 25.11.2026: "/rakip-analizi skillini de buraya ekleyebilsek harika olur".
 *
 * Saf modul (Node + tarayici). Kurallar:
 *  - Bizim evler (tarama "bizim") isletmenin mulkleriyle ADINDAN eslesir; eslesmeyen ev
 *    aktarilmaz ve adiyla soylenir (tahminle baska eve yazilmaz).
 *  - Her eve kapasitesi en yakin en fazla 5 Airbnb rakibi baglanir (rakip ortalamasi zaten
 *    en fazla 5 rakip kullanir). Otel fiyatlari aktarilmaz: farkli urun (oda), ev degil.
 *  - Fiyat gece basinadir: taramadaki 2 gecelik toplam / gece. Gun turu taramanin etiketinden:
 *    "Hafta ici" -> WEEKDAY, "Hafta sonu" -> WEEKEND, digerleri (bayram, yilbasi...) -> SPECIAL;
 *    ayni turdeki tarihlerin ortalamasi. Fiyati olmayan tur yazilmaz (0 uydurulmaz).
 *  - Kisi sayisi: evin kapasitesi 8+ ise 8 kisilik fiyat (varsa), degilse 4 kisilik.
 *  - Kaynak baglantisi ayarlar.json'daki ilan numarasindan; yoksa Airbnb arama sayfasi.
 *  - Ayni ev + rakip + arastirma tarihi zaten kayitliysa atlanir (iki kez aktarmak cift yazmaz).
 */
(function (root) {
  'use strict';

  const MAX_RIVALS = 5;
  const FALLBACK_URL = 'https://www.airbnb.com.tr/s/Uluda%C4%9F/homes';

  function nameKey(value) {
    return String(value || '')
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/ı/g, 'i')
      .replace(/\bvilla\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function isScan(json) {
    return !!json && typeof json === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(String(json.tarama_tarihi || ''))
      && json.tarihler && typeof json.tarihler === 'object' && Array.isArray(json.airbnb) && Array.isArray(json.bizim);
  }

  function isSettings(json) {
    return !!json && typeof json === 'object' && json.airbnb_rakipler && typeof json.airbnb_rakipler === 'object';
  }

  function dayType(label) {
    const t = nameKey(label);
    if (t === 'hafta ici') return 'WEEKDAY';
    if (t === 'hafta sonu') return 'WEEKEND';
    return 'SPECIAL';
  }

  function nightsOf(info, fallback) {
    const a = Date.parse(String(info?.giris || '') + 'T00:00:00Z');
    const b = Date.parse(String(info?.cikis || '') + 'T00:00:00Z');
    const n = Math.round((b - a) / 86400000);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  // Bir rakibin gun turune gore gece basi ortalama fiyati.
  function rivalPrices(rival, scan, persons) {
    const byPersons = rival && rival.fiyat ? (rival.fiyat[String(persons)] || null) : null;
    if (!byPersons) return null;
    const sums = {};
    Object.entries(byPersons).forEach(([key, total]) => {
      const info = scan.tarihler[key];
      const amount = Number(total);
      if (!info || !Number.isFinite(amount) || amount <= 0) return;
      const perNight = amount / nightsOf(info, Number(scan.gece) || 2);
      const type = dayType(info.gun_tipi);
      sums[type] = sums[type] || { total: 0, count: 0 };
      sums[type].total += perNight; sums[type].count += 1;
    });
    const out = {};
    Object.entries(sums).forEach(([type, s]) => { out[type] = Math.round(s.total / s.count / 50) * 50; });
    return Object.keys(out).length ? out : null;
  }

  /**
   * plan({ scan, settings, properties: [{ id, name, capacity? }], existing: [research rows], today })
   * -> { researchedOn, rows: [{ propertyId, propertyName, villaName, competitorName, persons, values, sourceUrl, rawNote }],
   *      unmatched: [villa adlari], skipped: n, error: null|string }
   */
  function plan({ scan, settings = null, properties = [], existing = [], today = null } = {}) {
    if (!isScan(scan)) return { rows: [], unmatched: [], skipped: 0, error: 'Bu dosya rakip analizi taraması değil (tarama_YYYY-AA-GG.json bekleniyor).' };
    const researchedOn = scan.tarama_tarihi;
    if (today && researchedOn > today) return { rows: [], unmatched: [], skipped: 0, error: 'Tarama tarihi gelecekte; aktarılamaz.' };
    const ids = (settings && settings.airbnb_rakipler) || {};
    const propByKey = new Map((properties || []).map(p => [nameKey(p.name), p]));
    const seen = new Set((existing || []).map(r => `${r.property_id}|${nameKey(r.competitor_name)}|${String(r.researched_on).slice(0, 10)}`));
    const rows = []; const unmatched = []; let skipped = 0;
    scan.bizim.forEach(villa => {
      const prop = propByKey.get(nameKey(villa.ad));
      if (!prop) { unmatched.push(String(villa.ad || '—')); return; }
      const capacity = Number(villa.maks) || Number(prop.capacity) || 0;
      const persons = capacity >= 8 ? 8 : 4;
      const candidates = scan.airbnb.map(rival => {
        const values = rivalPrices(rival, scan, persons) || (persons === 8 ? rivalPrices(rival, scan, 4) : null);
        return values ? { rival, values, usedPersons: rivalPrices(rival, scan, persons) ? persons : 4 } : null;
      }).filter(Boolean)
        .sort((a, b) => Math.abs((Number(a.rival.maks) || 0) - capacity) - Math.abs((Number(b.rival.maks) || 0) - capacity)
          || String(a.rival.ad).localeCompare(String(b.rival.ad), 'tr'))
        .slice(0, MAX_RIVALS);
      candidates.forEach(({ rival, values, usedPersons }) => {
        const key = `${prop.id}|${nameKey(rival.ad)}|${researchedOn}`;
        if (seen.has(key)) { skipped += 1; return; }
        seen.add(key);
        const id = String(ids[rival.ad] || '').trim();
        rows.push({
          propertyId: prop.id, propertyName: prop.name, villaName: villa.ad,
          competitorName: String(rival.ad).slice(0, 120), persons: usedPersons, values,
          sourceUrl: /^\d+$/.test(id) ? `https://www.airbnb.com.tr/rooms/${id}` : FALLBACK_URL,
          rawNote: `Rakip analizi taraması ${researchedOn} · Airbnb · ${usedPersons} kişi · ${rival.maks ? `kapasite ${rival.maks} · ` : ''}2 gecelik toplamların gece başı ortalaması`
        });
      });
    });
    return { researchedOn, rows, unmatched, skipped, error: rows.length || skipped ? null : (unmatched.length === scan.bizim.length ? 'Taramadaki evler işletmenizdeki mülklerle eşleşmedi (ad farklı).' : 'Aktarılacak Airbnb fiyatı bulunamadı.') };
  }

  const api = { plan, isScan, isSettings, nameKey, rivalPrices, MAX_RIVALS, FALLBACK_URL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RivalScanImport = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
