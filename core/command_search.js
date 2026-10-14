/**
 * LEXBNB — ARA / KOMUT (Ctrl+K) ARAMA DIZINI (L-191, kullanici M21)
 *
 * Eski arama yalniz yedi sabit komutu, mulkleri ve appData.bookings.slice(0, 30)
 * — yani ILK 30 rezervasyonu — tariyordu. Misafir defteri, talepler, ekranlar
 * ve kanallar hic aranmiyordu: "Onur" yazinca kayitli misafir, yeni eklenen
 * talep, "airbnb" yazinca kanal ekrani cikmiyordu.
 *
 * Bu modul saf veridir (DOM yok): buildEntries() aranabilir kayitlari, search()
 * eslesmeleri gruplu dondurur. Hedef bir EYLEM degil, TARIFTIR
 * ({ kind: 'tab', tab: 'operations', opsView: 'maintenance' } gibi); app.js
 * tarifi calistirir. Boylece Node'da test edilir.
 *
 * Rol siniri tek sozlesmeden gelir (CLAUDE.md 3.3.1): satis verisi (misafir,
 * talep, rezervasyon) yalniz can_read_sales rollerine, finans ekranlari
 * can_read_ledger, ayarlar can_manage_tenant rollerine aranir. staff yalniz
 * kendi saha ekranini bulur.
 */
(function (kok, fabrika) {
  const modul = fabrika();
  if (typeof module === 'object' && module.exports) module.exports = modul;
  else kok.CommandSearch = modul;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ROLLER = {
    manage: ['owner', 'admin', 'manager'],
    ledger: ['owner', 'admin', 'manager', 'viewer'],
    sales: ['owner', 'admin', 'manager', 'sales', 'viewer'],
    writeSales: ['owner', 'admin', 'manager', 'sales']
  };

  function rolIzinli(rol, gerek) {
    if (!gerek) return rol !== 'staff';
    return (ROLLER[gerek] || []).includes(rol);
  }

  // Turkce harfleri ASCII'ye katlar: "İlter", "ilter", "ILTER" ve "Ilter" ayni
  // anahtara duser. toLocaleLowerCase('tr') KULLANILMAZ: "I"yi "ı"ya cevirip
  // "Airbnb" / "ID" gibi Ingilizce adlari bozar (CLAUDE.md, phase33 notu).
  function katla(metin) {
    return String(metin == null ? '' : metin)
      .replace(/[İIı]/g, 'i')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ç/g, 'c')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Ekranlar: kullanicinin aklindaki kelimeyle bulunur. "ota", "airbnb",
  // "booking" kanal ekranina; "temizlik" Operasyon > Temizlik'e gider.
  const EKRANLAR = [
    { icon: '📍', title: 'Bugün (ana sayfa)', words: 'bugun ana sayfa panel ozet kokpit dashboard', target: { kind: 'tab', tab: 'executive' } },
    { icon: '📅', title: 'Rezervasyonlar ve takvim', words: 'rezervasyon takvim doluluk booking konaklama', target: { kind: 'tab', tab: 'reservations' }, need: 'sales' },
    { icon: '🏡', title: 'Mülkler', words: 'mulk villa ev ilan portfoy', target: { kind: 'tab', tab: 'properties' } },
    { icon: '🧹', title: 'Operasyon › Temizlik', words: 'operasyon temizlik housekeeping turnover', target: { kind: 'tab', tab: 'operations', opsView: 'cleaning' } },
    { icon: '🛠️', title: 'Operasyon › Arıza ve bakım', words: 'ariza bakim tamir usta servis', target: { kind: 'tab', tab: 'operations', opsView: 'maintenance' } },
    { icon: '✅', title: 'Operasyon › Görevler', words: 'gorev is yapilacak', target: { kind: 'tab', tab: 'operations', opsView: 'tasks' } },
    { icon: '👷', title: 'Operasyon › Saha ekibi', words: 'saha ekibi personel temizlikci usta calisan', target: { kind: 'tab', tab: 'operations', opsView: 'people' }, need: 'manage' },
    { icon: '🎯', title: 'Talepler', words: 'talep satis lead musteri adayi teklif yeni musteri', target: { kind: 'tab', tab: 'leads' }, need: 'sales' },
    { icon: '👥', title: 'Misafirler', words: 'misafir musteri crm rehber kisi', target: { kind: 'tab', tab: 'guests' }, need: 'sales' },
    { icon: '🏷️', title: 'Fiyatlandırma', words: 'fiyat fiyatlandirma adr gecelik indirim bosluk gecesi', target: { kind: 'tab', tab: 'pricing' } },
    { icon: '💰', title: 'Finans', words: 'finans gelir ciro kar zarar net kar ay kapanisi defter', target: { kind: 'tab', tab: 'finance' }, need: 'ledger' },
    { icon: '💸', title: 'Giderler', words: 'gider harcama masraf opex capex fatura', target: { kind: 'tab', tab: 'expenses' }, need: 'ledger' },
    { icon: '📈', title: 'Kanallar ve Pazarlama', words: 'kanal pazarlama ota airbnb booking.com booking reklam kampanya instagram meta google', target: { kind: 'tab', tab: 'marketing' } },
    { icon: '⚙️', title: 'Ayarlar › İşletme', words: 'ayar ayarlar isletme logo', target: { kind: 'settings', section: 'business' }, need: 'manage' },
    { icon: '👤', title: 'Ayarlar › Ekip ve davet', words: 'ekip kullanici davet rol yetki', target: { kind: 'settings', section: 'team' }, need: 'manage' },
    { icon: '🔗', title: 'Ayarlar › Rezervasyon kanalları', words: 'kanal komisyon ota airbnb booking.com', target: { kind: 'settings', section: 'channels' }, need: 'manage' },
    { icon: '📋', title: 'Ayarlar › Şablonlar', words: 'sablon kontrol listesi checklist', target: { kind: 'settings', section: 'templates' }, need: 'manage' },
    { icon: '📣', title: 'Ayarlar › Talep kaynakları', words: 'talep kaynagi kaynak', target: { kind: 'settings', section: 'lead-sources' }, need: 'manage' }
  ];

  const KOMUTLAR = [
    { icon: '📅', title: 'Yeni rezervasyon girişi', words: 'yeni rezervasyon ekle', target: { kind: 'command', name: 'newBooking' }, need: 'writeSales' },
    { icon: '🎯', title: 'Yeni talep (hızlı kayıt)', words: 'yeni talep musteri ekle lead', target: { kind: 'command', name: 'newLead' }, need: 'writeSales' },
    { icon: '🧹', title: 'Temizlik görevi ekle', words: 'temizlik gorevi ekle', target: { kind: 'command', name: 'newCleaning' }, need: 'manage' },
    { icon: '🛠️', title: 'Arıza / bakım bildir', words: 'ariza bakim bildir', target: { kind: 'command', name: 'newMaintenance' } },
    { icon: '💸', title: 'Yeni gider / harcama ekle', words: 'yeni gider harcama ekle', target: { kind: 'command', name: 'newExpense' }, need: 'manage' },
    { icon: '🎯', title: 'Aylık hedef belirle', words: 'hedef aylik ciro', target: { kind: 'command', name: 'goals' }, need: 'manage' },
    { icon: '💬', title: 'WhatsApp mesajı ayrıştır', words: 'whatsapp mesaj ayristir', target: { kind: 'command', name: 'whatsapp' }, need: 'writeSales' }
  ];

  const GRUPLAR = ['Ekranlar', 'Komutlar', 'Misafirler', 'Talepler', 'Rezervasyonlar', 'Mülkler', 'Kanallar'];

  function kayit(group, icon, title, subtitle, aranan, target) {
    return { group, icon, title, subtitle: subtitle || '', key: katla(title), hay: katla(aranan.filter(Boolean).join(' ')), target };
  }

  function rakamlar(metin) { return String(metin || '').replace(/\D/g, ''); }

  /**
   * veri: { role, villas: {anahtar: mulk}, bookings, guests, leads, channels }
   * Butun rezervasyonlar dizine girer — sinir yok (eski slice(0, 30) hatasi).
   */
  function buildEntries(veri) {
    const v = veri || {};
    const rol = v.role || '';
    const liste = [];

    if (rol === 'staff') {
      liste.push(kayit('Ekranlar', '🧹', 'Saha işlerim', '', ['saha islerim temizlik gorev'], { kind: 'tab', tab: 'staff-field' }));
      return liste;
    }

    KOMUTLAR.filter(k => rolIzinli(rol, k.need)).forEach(k => liste.push(kayit('Komutlar', k.icon, k.title, '', [k.title, k.words], k.target)));
    EKRANLAR.filter(e => rolIzinli(rol, e.need)).forEach(e => liste.push(kayit('Ekranlar', e.icon, e.title, '', [e.title, e.words], e.target)));

    const mulkAdi = {};
    Object.keys(v.villas || {}).forEach(anahtar => {
      const m = v.villas[anahtar] || {};
      const ad = m.name || anahtar;
      mulkAdi[anahtar] = ad;
      if (m.id) mulkAdi[m.id] = ad;
      liste.push(kayit('Mülkler', '🏡', ad, m.capacity ? `${m.capacity} kişi` : '', [ad, anahtar, m.slug, m.city, m.district], { kind: 'villa', key: anahtar }));
    });

    if (rolIzinli(rol, 'sales')) {
      (v.guests || []).forEach(g => {
        if (!g || !g.id) return;
        const ad = [g.firstName, g.lastName].filter(Boolean).join(' ').trim() || 'Ad girilmedi';
        liste.push(kayit('Misafirler', '👤', ad, [g.phone, g.email].filter(Boolean).join(' · '),
          [ad, g.phone, rakamlar(g.phone), g.email, (g.tags || []).join(' ')], { kind: 'guest', id: g.id }));
      });

      (v.leads || []).forEach(l => {
        if (!l || !l.id) return;
        const ad = l.guestName || 'Ad girilmedi';
        const tarih = l.checkIn ? `${l.checkIn}${l.checkOut ? ' → ' + l.checkOut : ''}` : '';
        liste.push(kayit('Talepler', '🎯', ad, [l.phone, tarih, mulkAdi[l.propertyId] || ''].filter(Boolean).join(' · '),
          [ad, l.phone, rakamlar(l.phone), l.email, l.channel, mulkAdi[l.propertyId]], { kind: 'lead', id: l.id }));
      });

      (v.bookings || []).forEach(b => {
        if (!b || !b.id) return;
        const mulk = mulkAdi[b.villa] || mulkAdi[b.propertyId] || '';
        liste.push(kayit('Rezervasyonlar', '📅', b.guest || 'Ad girilmedi',
          [`${b.checkIn || '?'} → ${b.checkOut || '?'}`, mulk, b.channel].filter(Boolean).join(' · '),
          [b.guest, b.code, b.phone, rakamlar(b.phone), mulk, b.channel], { kind: 'booking', id: b.id }));
      });
    }

    if (rolIzinli(rol, 'manage')) {
      (v.channels || []).forEach(c => {
        const ad = c && (c.displayName || c.code);
        if (!ad) return;
        liste.push(kayit('Kanallar', '🔗', ad, c.isActive === false ? 'pasif' : `komisyon %${Number(c.defaultCommissionRate) || 0}`,
          [ad, c.code, c.channelType === 'OTA' ? 'ota' : 'direkt'], { kind: 'settings', section: 'channels' }));
      });
    }
    return liste;
  }

  // Puan: baslik sorguyla basliyorsa 3, baslikta bir kelime sorguyla
  // basliyorsa 2, yalniz aranan metinde geciyorsa 1. Butun kelimeler eslesmeli.
  function puanla(k, kelimeler, butun) {
    if (!kelimeler.every(w => k.hay.includes(w) || k.key.includes(w))) return 0;
    if (k.key.startsWith(butun)) return 3;
    if (k.key.split(' ').some(p => p.startsWith(kelimeler[0]))) return 2;
    return 1;
  }

  /**
   * Sonuc: [{ group, items: [kayit], more: n }] — grup sirasi sabit, her grupta
   * en cok `limit` kayit; kalan sayi `more` ile soylenir (gizlice kesilmez).
   */
  function search(liste, sorgu, secenek) {
    const limit = (secenek && secenek.limit) || 5;
    const butun = katla(sorgu);
    const gruplar = {};
    if (!butun) {
      (liste || []).filter(k => k.group === 'Komutlar').forEach(k => { (gruplar.Komutlar = gruplar.Komutlar || []).push({ k, p: 1 }); });
    } else {
      const kelimeler = butun.split(' ');
      // Telefonla aramada "0532 123" gibi bosluklu yazim rakamlara katlanir.
      const rakamSorgu = rakamlar(sorgu);
      (liste || []).forEach(k => {
        let p = puanla(k, kelimeler, butun);
        if (!p && rakamSorgu.length >= 4 && k.hay.includes(rakamSorgu)) p = 1;
        if (p) (gruplar[k.group] = gruplar[k.group] || []).push({ k, p });
      });
    }
    return GRUPLAR.filter(g => gruplar[g]).map(g => {
      const sirali = gruplar[g].sort((a, b) => b.p - a.p);
      return { group: g, items: sirali.slice(0, limit).map(x => x.k), more: Math.max(0, sirali.length - limit) };
    });
  }

  return { buildEntries, search, katla, EKRANLAR, KOMUTLAR, GRUPLAR };
});
