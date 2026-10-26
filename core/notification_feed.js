/**
 * LEXBNB — BILDIRIM MERKEZI KAYNAGI (L-192, kullanici M22)
 *
 * user_notifications'i okuyan ve "okundu" yazan kod vardi; satir URETEN kod
 * yoktu, merkez her hesapta tasarim geregi bostu. Bildirimler burada,
 * kullanicinin zaten okuyabildigi gercek veriden turetilir; kullanici karari
 * 14.10.2026: ekibe katilan uye, M kontrolu bekleyen temizlik, yeni acik
 * ariza, kapanmamis gecen ay, takip tarihi gelen talep ve kazanc firsati.
 *
 * Saf modul (DOM yok, ag yok). Turetilen olaylar phase93
 * `sync_my_notifications` ile yalniz cagiranin KENDI satirlarina yazilir;
 * olay bitince (temizlik onaylandi, ay kapandi) satir RESOLVED olur.
 *
 * Kurallar:
 *   - Uydurma yok (CLAUDE.md 3.6): kazanc firsati gercek bosluk gecesidir;
 *     liste fiyati yoksa tutar yazilmaz, "liste fiyati girilmemis" denir.
 *   - Rol siniri tek sozlesmeden (3.3.1). Ariza ve temizlik tanimlari
 *     app.js'teki tek kaynaktan enjekte edilir (isMaintenanceTicketOpen,
 *     attachExecutions -> workflowState), burada yeniden yazilmaz.
 *   - event_key olayi tanimlar: ayni olay ayni kisiye bir kez yazilir.
 */
(function (kok, fabrika) {
  const modul = fabrika();
  if (typeof module === 'object' && module.exports) module.exports = modul;
  else kok.NotificationFeed = modul;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ROLLER = {
    manage: ['owner', 'admin', 'manager'],
    member: ['owner', 'admin', 'manager', 'sales', 'viewer'],
    readSales: ['owner', 'admin', 'manager', 'sales', 'viewer'],
    writeSales: ['owner', 'admin', 'manager', 'sales']
  };

  // Bos merkezde ve aciklamada gosterilen katalog: hangi olay, kime, neden.
  const TURLER = [
    { type: 'member_joined', need: 'manage', label: 'Ekibe yeni üye katıldı', detail: 'Davet kabul edilip hesap ekibe katıldığında (son 14 gün).' },
    { type: 'cleaning_inspection', need: 'manage', label: 'Temizlik onayınızı bekliyor', detail: 'Temizlikçi işi tamamladı (Z), yönetici kontrolü (M) yapılmadı. Onaylanmadan gider ve borç doğmaz.' },
    { type: 'maintenance_open', need: 'member', label: 'Yeni açık arıza', detail: 'Son 7 günde açılan ve kapanmamış arıza kaydı.' },
    { type: 'period_unclosed', need: 'manage', label: 'Geçen ay kapatılmadı', detail: 'Biten ayda kayıt var ama ay kapanışı yapılmadı.' },
    { type: 'collection_due', need: 'readSales', label: 'Tahsilat bekliyor', detail: 'Kanalın tahsilat günü geldi ya da geçti (doğrudan kanalda çıkış günü; Booking, Etstur gibi kanallarda Ayarlar → Kanallar → Tahsilat günü) ve ödeme kayıtları tutarı karşılamıyor. Platformun komisyonu açık sayılmaz. Ödeme girilince kendiliğinden kapanır.' },
    { type: 'lead_followup', need: 'readSales', label: 'Talebin takip zamanı geldi', detail: 'Takip tarihi bugün ya da geçmiş, açık talepler. Satış rolü yalnız kendisine atanan ve atanmamış talepleri görür.' },
    { type: 'revenue_opportunity', need: 'writeSales', label: 'Kazanç fırsatı: boş gece', detail: 'Önümüzdeki 30 gün içinde fiyat takviminin "boş gece" saydığı, iki rezervasyon arasında kalan kısa boşluk (minimum gece kuralına takılanlar hariç).' },
    { type: 'stay_arrival', need: 'member', label: 'Bugün giriş', detail: 'Bugün girişi olan ve henüz "içeride" işaretlenmemiş rezervasyon. Giriş yapılınca kapanır.' },
    { type: 'stay_departure', need: 'member', label: 'Bugün çıkış', detail: 'Bugün çıkışı olan ve henüz "çıkış yaptı" işaretlenmemiş rezervasyon. Çıkış yapılınca kapanır.' },
    { type: 'task_overdue', need: 'manage', label: 'Geciken görev', detail: 'Bitiş zamanı geçmiş, tamamlanmamış ve iptal edilmemiş genel görev.' }
  ];

  function izinli(rol, gerek) { return (ROLLER[gerek] || []).includes(rol); }

  function gunEkle(gun, n) {
    const d = new Date(gun + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function oncekiAy(gun) {
    const y = Number(gun.slice(0, 4));
    const m = Number(gun.slice(5, 7));
    return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
  }

  const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  function trTarih(gun) {
    const s = String(gun || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
    return `${Number(s.slice(8, 10))} ${AYLAR[Number(s.slice(5, 7)) - 1]}`;
  }

  function tl(n) { return '₺' + Math.round(n).toLocaleString('tr-TR'); }

  // Olay anahtarinin degisken kismi yalniz guvenli karakter tasir (phase93 kalibi).
  function anahtar(tur, ...parcalar) {
    return `${tur}:${parcalar.map(p => String(p == null ? '' : p).replace(/[^A-Za-z0-9_.-]/g, '-')).join(':')}`.slice(0, 200);
  }

  /**
   * girdi: {
   *   role, today (YYYY-MM-DD, Europe/Istanbul), currentUserId,
   *   villas: {anahtar: mulk}, members: [{user_id, full_name, email, role, joined_at, is_self}],
   *   cleaningTasks: workflowState eklenmis gorevler, maintenance: arizalar,
   *   isTicketOpen: fn, closedPeriods: [{year, month, status}],
   *   previousMonthHasRecords: bool, followUps: [{id, guestName, guest, nextFollowUpAt, assignedTo}],
   *   followUpDate: fn(ts) -> YYYY-MM-DD, gapNights: [{villaKey, villaName, checkIn, checkOut, nights, regularPrice}],
   *   unpaidBookings: [{id, guest, villa, checkOut, amountDue, remaining}] (yalniz OTA disi kanal)
   * }
   */
  function deriveNotifications(girdi) {
    const g = girdi || {};
    const rol = g.role || '';
    const bugun = String(g.today || '').slice(0, 10);
    if (!bugun || rol === 'staff' || !izinli(rol, 'member')) return [];
    const mulkAdi = key => (g.villas && g.villas[key] && g.villas[key].name) || key || '—';
    const olaylar = [];

    if (izinli(rol, 'manage')) {
      const sinir = gunEkle(bugun, -14);
      (g.members || []).forEach(m => {
        const gun = String(m.joined_at || '').slice(0, 10);
        if (!m.user_id || m.is_self || !gun || gun < sinir) return;
        olaylar.push({
          event_key: anahtar('member_joined', m.user_id), domain: 'TEAM', severity: 'INFO',
          title: `Ekibe katıldı: ${m.full_name || m.email || 'yeni üye'}`,
          message: `${m.email || ''}${m.email ? ' · ' : ''}${m.role || ''} rolüyle ${trTarih(gun)} tarihinde katıldı.`,
          deep_link: 'settings:team', at: gun
        });
      });

      (g.cleaningTasks || []).forEach(t => {
        if (t.workflowState !== 'AWAITING_INSPECTION' || !t.id) return;
        olaylar.push({
          event_key: anahtar('cleaning_inspection', t.id), domain: 'OPERATIONS', severity: 'WARNING',
          title: `Temizlik onayınızı bekliyor: ${t.propertyName || mulkAdi(t.villa)}`,
          message: `${trTarih(t.date)} temizliği tamamlandı olarak imzalandı. Kontrol edip onaylayın; onaylanmadan gider ve personel borcu doğmaz.`,
          deep_link: 'operations:cleaning', at: t.date || bugun
        });
      });

      const onceki = oncekiAy(bugun);
      const kapali = (g.closedPeriods || []).some(cp => Number(cp.year) === onceki.year && Number(cp.month) === onceki.month && cp.status === 'CLOSED');
      if (!kapali && g.previousMonthHasRecords) {
        const ayAnahtari = `${onceki.year}-${String(onceki.month).padStart(2, '0')}`;
        olaylar.push({
          event_key: anahtar('period_unclosed', ayAnahtari), domain: 'FINANCE', severity: 'WARNING',
          title: `${AYLAR[onceki.month - 1]} ${onceki.year} henüz kapatılmadı`,
          message: 'Ay bitti ve kayıt var. Kontrol edip kapattığınızda rakamlar mühürlenir; kapanmayan ayda kayıtlar değişebilir.',
          deep_link: 'finance', at: bugun
        });
      }
    }

    const arizaSiniri = gunEkle(bugun, -7);
    const acikMi = typeof g.isTicketOpen === 'function' ? g.isTicketOpen : () => false;
    (g.maintenance || []).forEach(t => {
      const gun = String(t.created_at || t.createdAt || '').slice(0, 10);
      if (!t.id || !gun || gun < arizaSiniri || !acikMi(t)) return;
      // "Satisa kapatiyor" yalniz bugunu kapatan ariza icindir (L-276); gelecek
      // tarihli planli bakim bugun kritik degildir.
      const bugunKapali = typeof g.isTicketBlockingToday === 'function' ? g.isTicketBlockingToday(t) : t.blocks_availability === true;
      const kritik = t.priority === 'P1' || bugunKapali;
      olaylar.push({
        event_key: anahtar('maintenance_open', t.id), domain: 'OPERATIONS', severity: kritik ? 'CRITICAL' : 'WARNING',
        title: `Açık arıza: ${t.title || 'başlıksız'} (${mulkAdi(t.villa)})`,
        message: `${trTarih(gun)} tarihinde açıldı${bugunKapali ? '; mülkü bugün satışa kapatıyor' : ''}.`,
        deep_link: 'operations:maintenance', at: gun
      });
    });

    // Tahsilat (M69, 9.6.7): son tahsil gunu cikis gunudur (kullanici onerisi:
    // OTA disi kanalda "en gec cikis"). Bakiye phase57 gorunumunden gelir;
    // satiri yuklenmemis rezervasyon icin bildirim uydurulmaz (3.6).
    if (izinli(rol, 'readSales')) {
      (g.unpaidBookings || []).forEach(b => {
        // Vade kanal kuralindan (L-245): cikis gunu ya da platformun odeme gunu.
        const vade = String(b.dueDate || b.checkOut || '').slice(0, 10);
        const kalan = Number(b.remaining);
        if (!b.id || !vade || vade > bugun || !(kalan >= 1)) return;
        const gecikme = Math.round((Date.parse(bugun + 'T00:00:00Z') - Date.parse(vade + 'T00:00:00Z')) / 86400000);
        const platform = b.channelName || 'Platform';
        const vadeYazi = b.platform
          ? (gecikme === 0 ? `${platform} ödemesi bugün bekleniyor` : `${platform} ödemesi ${trTarih(vade)} bekleniyordu (${gecikme} gün geçti)`)
          : (gecikme === 0 ? 'Çıkış bugün' : `Çıkış ${trTarih(vade)} idi (${gecikme} gün geçti)`);
        olaylar.push({
          event_key: anahtar('collection_due', b.id), domain: 'FINANCE', severity: gecikme > 7 ? 'CRITICAL' : 'WARNING',
          title: `Tahsilat bekliyor: ${b.guest || 'Misafir adı yok'} (${mulkAdi(b.villa)})`,
          message: `${vadeYazi}; ${tl(kalan)} tahsil edilmedi${Number(b.amountDue) > 0 ? ` (tutar ${tl(b.amountDue)})` : ''}. Ödeme kaydı girildiğinde bildirim kapanır.`,
          deep_link: `booking:${String(b.id).replace(/[^A-Za-z0-9_.-]/g, '-')}`, at: vade
        });
      });
    }

    // Bugunun girisi ve cikisi (L-311): durum ilerleyince olay biter, satir RESOLVED olur.
    if (izinli(rol, 'member')) {
      (g.bookings || []).forEach(b => {
        const durum = String(b.status || '').toUpperCase();
        // Toplu aktarim ozeti gercek konaklama degildir; tanim app.js'ten (guest_crm_engine).
        if (!b.id || durum === 'CANCELLED' || (typeof g.isBulkSummary === 'function' && g.isBulkSummary(b))) return;
        if (b.checkIn === bugun && durum === 'CONFIRMED') {
          olaylar.push({
            event_key: anahtar('stay_arrival', b.id), domain: 'OPERATIONS', severity: 'INFO',
            title: `Bugün giriş: ${b.guest || 'Misafir adı yok'} (${mulkAdi(b.villa)})`,
            message: 'Misafir gelince rezervasyonu "İçeride" olarak işaretleyin.',
            deep_link: `booking:${String(b.id).replace(/[^A-Za-z0-9_.-]/g, '-')}`, at: bugun
          });
        }
        if (b.checkOut === bugun && durum !== 'CHECKED_OUT') {
          olaylar.push({
            event_key: anahtar('stay_departure', b.id), domain: 'OPERATIONS', severity: 'INFO',
            title: `Bugün çıkış: ${b.guest || 'Misafir adı yok'} (${mulkAdi(b.villa)})`,
            message: 'Çıkıştan sonra rezervasyonu "Çıkış yaptı" olarak işaretleyin; çıkış temizliği planlıdır.',
            deep_link: `booking:${String(b.id).replace(/[^A-Za-z0-9_.-]/g, '-')}`, at: bugun
          });
        }
      });
    }

    // Geciken genel gorev (L-311).
    if (izinli(rol, 'manage') && g.now) {
      (g.operationalTasks || []).forEach(t => {
        const durum = String(t.status || '').toUpperCase();
        if (!t.id || !t.due_at || durum === 'DONE' || durum === 'CANCELLED' || !(String(t.due_at) < String(g.now))) return;
        const gun = String(t.due_at).slice(0, 10);
        olaylar.push({
          event_key: anahtar('task_overdue', t.id), domain: 'OPERATIONS', severity: 'WARNING',
          title: `Geciken görev: ${t.title || 'başlıksız'}`,
          message: `Bitiş ${trTarih(gun)} idi; görev tamamlanmadı.`,
          deep_link: 'operations:tasks', at: gun
        });
      });
    }

    if (izinli(rol, 'readSales')) {
      const gunu = typeof g.followUpDate === 'function' ? g.followUpDate : ts => String(ts || '').slice(0, 10);
      (g.followUps || []).forEach(l => {
        if (!l.id || !l.nextFollowUpAt) return;
        if (rol === 'sales' && l.assignedTo && l.assignedTo !== g.currentUserId) return;
        const gun = gunu(l.nextFollowUpAt);
        // Bugunun takip saati gectiyse uyaridir (L-311): "bugun" INFO yaziyordu.
        const saatGecti = gun === bugun && g.now && Date.parse(l.nextFollowUpAt) < Date.parse(g.now);
        const saat = typeof g.followUpTime === 'function' ? g.followUpTime(l.nextFollowUpAt) : '';
        olaylar.push({
          event_key: anahtar('lead_followup', l.id, gun), domain: 'SALES', severity: gun < bugun || saatGecti ? 'WARNING' : 'INFO',
          title: `Takip zamanı: ${l.guestName || l.guest || 'Ad girilmedi'}`,
          message: gun < bugun ? `Takip tarihi ${trTarih(gun)} idi; geçti.` : saatGecti ? `Takip saati${saat ? ' ' + saat : ''} geçti.` : 'Takip tarihi bugün.',
          deep_link: `lead:${String(l.id).replace(/[^A-Za-z0-9_.-]/g, '-')}`, at: gun
        });
      });
    }

    if (izinli(rol, 'writeSales')) {
      const ufuk = gunEkle(bugun, 30);
      (g.gapNights || []).forEach(gap => {
        if (!gap.checkIn || gap.checkIn > ufuk || !(gap.nights > 0)) return;
        const tutar = Number(gap.regularPrice) > 0 ? `Liste fiyatıyla ${tl(gap.regularPrice)} gelir.` : 'Liste fiyatı girilmemiş; tutar hesaplanamadı.';
        olaylar.push({
          event_key: anahtar('revenue_opportunity', gap.villaKey, gap.checkIn, gap.checkOut), domain: 'PRICING', severity: 'INFO',
          title: `Kazanç fırsatı: ${gap.villaName || mulkAdi(gap.villaKey)} ${gap.nights} gece boş`,
          message: `${trTarih(gap.checkIn)} – ${trTarih(gap.checkOut)} arası iki rezervasyon arasında boş. ${tutar}`,
          deep_link: 'pricing', at: gap.checkIn
        });
      });
    }

    const sira = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    return olaylar
      .sort((a, b) => (sira[a.severity] - sira[b.severity]) || String(b.at).localeCompare(String(a.at)))
      .slice(0, 100);
  }

  function typesForRole(rol) {
    if (rol === 'staff') return [];
    return TURLER.filter(t => izinli(rol, t.need));
  }

  return { deriveNotifications, typesForRole, TURLER };
});
