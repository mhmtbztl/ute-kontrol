/**
 * LEXBNB — EKIP GOREVLERI (Lex Tasarimi, kullanici karari 21.11.2026)
 *
 * Her ekranin altindaki "Ekip gorevleri" ve Bugun ekraninin tablosu bu tek
 * motordan gelir. Gorev YALNIZ gercek kayittan turer (CLAUDE.md 3.6): kayit
 * yoksa satir yoktur, tahmin uretilmez.
 *
 * Iki ayri kavram, bilerek ayri:
 *  - EKIP (team): gorevin kimin isi oldugu. Isletme Ayarlar > Ekip > Gorev
 *    dagitimi'nda degistirebilir (tenant_settings.team_task_routing).
 *  - KAPI (gate): gorevi kimin GOREBILECEGI. Rol/izin sozlesmesinden gelir
 *    (3.3.1) ve dagitimla degismez: temizlik borcu Pazarlama'ya tasinsa bile
 *    finans defterini okuyamayan kisi onu gormez.
 *
 * Saf modul: tarayicida ve Node'da calisir, DOM'a dokunmaz.
 */
(function (root) {
  'use strict';

  const TEAMS = [
    { key: 'SALES', label: 'Satış' },
    { key: 'MARKETING', label: 'Pazarlama' },
    { key: 'OPERATIONS', label: 'Operasyon' },
    { key: 'CLEANING', label: 'Temizlik' },
    { key: 'FINANCE', label: 'Finans' }
  ];
  const TEAM_KEYS = TEAMS.map(t => t.key);

  // Talimat etiketleri (kullanici karari): Acil kirmizi, Yap mavi, Tamam yesil.
  const TAGS = {
    URGENT: { label: 'Acil', tone: 'down' },
    DO: { label: 'Yap', tone: 'up' },
    DONE: { label: 'Tamam', tone: 'keep' }
  };
  const TAG_ORDER = { URGENT: 0, DO: 1, DONE: 2 };

  // gate: operations | sales | ledger | manage (3.3.1 fonksiyonlarinin karsiligi).
  // team: on tanimli ekip. Isletme ekibi degistirir, kapiyi degistiremez.
  const TASK_TYPES = {
    CLEANING_OVERDUE: { label: 'Tarihi geçmiş temizlik', team: 'CLEANING', gate: 'operations', target: 'housekeeping' },
    CLEANING_TODAY: { label: 'Bugünkü temizlik', team: 'CLEANING', gate: 'operations', target: 'housekeeping' },
    CLEANING_INSPECTION: { label: 'Kontrol bekleyen temizlik', team: 'CLEANING', gate: 'operations', target: 'housekeeping' },
    CLEANING_TOMORROW: { label: 'Yarınki temizlik', team: 'CLEANING', gate: 'operations', target: 'housekeeping' },
    ARRIVAL: { label: 'Giriş (karşılama)', team: 'OPERATIONS', gate: 'sales', target: 'reservations' },
    DEPARTURE: { label: 'Çıkış (teslim alma)', team: 'OPERATIONS', gate: 'sales', target: 'reservations' },
    MAINTENANCE_OPEN: { label: 'Açık arıza', team: 'OPERATIONS', gate: 'operations', target: 'maintenance' },
    LEAD_FOLLOW_UP: { label: 'Talep takibi', team: 'SALES', gate: 'sales', target: 'leads' },
    GAP_NIGHT: { label: 'Boş gece satışı', team: 'SALES', gate: 'sales', target: 'pricing' },
    PRICE_APPROVAL: { label: 'Onay bekleyen fiyat', team: 'SALES', gate: 'sales', target: 'pricing' },
    CAMPAIGN_ENDED: { label: 'Süresi biten kampanya', team: 'MARKETING', gate: 'manage', target: 'marketing' },
    CLEANING_DEBT: { label: 'Ödenmemiş temizlik borcu', team: 'FINANCE', gate: 'ledger', target: 'housekeeping' },
    MONTH_NOT_CLOSED: { label: 'Kapanmamış ay', team: 'FINANCE', gate: 'ledger', target: 'finance' },
    EXPENSES_MISSING: { label: 'Gider girilmemiş ay', team: 'FINANCE', gate: 'ledger', target: 'finance' },
    GOAL_MISSING: { label: 'Aylık hedef yok', team: 'FINANCE', gate: 'ledger', target: 'finance' }
  };
  const TASK_TYPE_KEYS = Object.keys(TASK_TYPES);

  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const AY_UZUN = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  function addDays(dateStr, count) {
    const d = new Date(`${dateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + count);
    return d.toISOString().slice(0, 10);
  }

  function shortDate(dateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
    return m ? `${Number(m[3])} ${AY[Number(m[2]) - 1]}` : '';
  }

  function monthName(ym) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
    return m ? `${AY_UZUN[Number(m[2]) - 1]} ${m[1]}` : String(ym || '');
  }

  function previousMonth(ym) {
    const [y, m] = String(ym).split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  }

  // Gece sayisi kayitta yoksa tarihlerden (cikis − giris).
  function nightsOf(b) {
    const n = Number(b && b.nights);
    if (n > 0) return n;
    const a = Date.parse(`${b && b.checkIn}T12:00:00Z`); const c = Date.parse(`${b && b.checkOut}T12:00:00Z`);
    return Number.isFinite(a) && Number.isFinite(c) && c > a ? Math.round((c - a) / 86400000) : null;
  }

  function money(n) {
    return `${Math.round(Number(n) || 0).toLocaleString('tr-TR')} TL`;
  }

  // Dagitim kaydi bozuksa (bilinmeyen tur ya da ekip) o satir yok sayilir.
  function normalizeRouting(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(type => {
      const team = String(raw[type] || '').toUpperCase();
      if (TASK_TYPES[type] && TEAM_KEYS.includes(team) && team !== TASK_TYPES[type].team) out[type] = team;
    });
    return out;
  }

  function teamOf(type, routing) {
    const r = normalizeRouting(routing);
    return r[type] || (TASK_TYPES[type] && TASK_TYPES[type].team) || null;
  }

  function canSee(type, can) {
    const def = TASK_TYPES[type];
    if (!def) return false;
    return !!(can && can[def.gate]);
  }

  /**
   * input:
   *  today          'YYYY-MM-DD' (Europe/Istanbul is gunu; getTodayStr)
   *  villas         { key: { name, id, isActive, archivedAt } }
   *  bookings       istemci rezervasyon modeli (villa, guest, checkIn, checkOut, status, nights)
   *  cleaningTasks  attachExecutions'tan gecmis normalize gorevler (workflowState dahil)
   *  tickets        appData.maintenance (mapMaintenanceTicketFromDb modeli)
   *  leads, gapNights, campaigns, dailyPrices
   *  finance        { cleaningDebts:[{cleaner,amount,count}], prevMonthNeedsClose, expensesMissing, goalMissing }
   *  helpers        { isTicketOpen, isTicketBlockingToday, isBulkSummary, leadStatusLabel }
   *  can            { operations, sales, ledger, manage }
   *  routing        tenant_settings.team_task_routing
   */
  function buildTeamTasks(input) {
    const i = input || {};
    const today = String(i.today || '');
    const tomorrow = addDays(today, 1);
    const villas = i.villas || {};
    const can = i.can || {};
    const h = i.helpers || {};
    const villaName = key => (villas[key] && villas[key].name) || key || '';
    const out = [];
    const push = (type, t) => {
      if (!canSee(type, can)) return;
      out.push(Object.assign({ type, team: teamOf(type, i.routing), target: TASK_TYPES[type].target, villa: null, date: today }, t));
    };

    // TEMIZLIK — Operasyon'un kendi gruplama kuralindan gecmis liste beklenir.
    (i.cleaningTasks || []).forEach(task => {
      const date = String(task.date || task.task_date || '').slice(0, 10);
      if (!date) return;
      const status = String(task.status || '').toUpperCase();
      if (['SKIPPED', 'CANCELLED'].includes(status)) return;
      const villa = task.villa || null;
      const yer = villaName(villa) || task.propertyName || 'Mülk belirtilmedi';
      const entity = task.id || task.dbId || null;
      const id = `cleaning:${entity || `${villa}:${date}`}`;
      if (task.workflowState === 'AWAITING_INSPECTION' && date <= today) {
        push('CLEANING_INSPECTION', { id, entity, villa, date, value: `${yer} temizliği`, tag: 'DO', reason: 'Temizlikçi bitirdi; yönetici kontrolü bekliyor' });
        return;
      }
      if (status === 'DONE') {
        if (date === today) push('CLEANING_TODAY', { id, entity, villa, date, value: `${yer} temizliği`, tag: 'DONE', reason: 'Yapıldı' });
        return;
      }
      if (date < today) push('CLEANING_OVERDUE', { id, entity, villa, date, value: `${yer} temizliği`, tag: 'URGENT', reason: `Tarihi geçti (${shortDate(date)}); yapıldı işaretlenmedi` });
      else if (date === today) push('CLEANING_TODAY', { id, entity, villa, date, value: `${yer} temizliği`, tag: 'DO', reason: task.cleaner ? `Temizlikçi: ${task.cleaner}` : 'Temizlikçi atanmadı' });
      else if (date === tomorrow) push('CLEANING_TOMORROW', { id, entity, villa, date, value: `${yer} temizliği`, tag: 'DO', reason: 'Yarın; temizlikçiyi teyit edin' });
    });

    // GIRIS / CIKIS — bugun ve yarin. Toplu aktarim ozeti gercek konaklama degildir (L-103).
    (i.bookings || []).forEach(b => {
      if (!b || String(b.status || '').toUpperCase() === 'CANCELLED') return;
      if (h.isBulkSummary && h.isBulkSummary(b)) return;
      const status = String(b.status || '').toUpperCase();
      const villa = b.villa || null;
      const misafir = b.guest || 'Misafir adı girilmedi';
      if (b.checkIn === today || b.checkIn === tomorrow) {
        const done = b.checkIn === today && ['CHECKED_IN', 'CHECKED_OUT'].includes(status);
        const ayniGunCikis = (i.bookings || []).some(o => o !== b && o.villa === villa && o.checkOut === b.checkIn
          && String(o.status || '').toUpperCase() !== 'CANCELLED');
        push('ARRIVAL', {
          id: `arrival:${b.id || `${villa}:${b.checkIn}`}`, entity: b.id || null, villa, date: b.checkIn,
          value: `${misafir} · ${villaName(villa)}`,
          tag: done ? 'DONE' : (ayniGunCikis ? 'URGENT' : 'DO'),
          reason: done ? 'Giriş yapıldı' : (ayniGunCikis ? 'Aynı gün çıkış var; temizlik girişten önce bitmeli' : `Giriş · ${nightsOf(b) || '—'} gece`)
        });
      }
      if (b.checkOut === today) {
        const done = status === 'CHECKED_OUT';
        push('DEPARTURE', {
          id: `departure:${b.id || `${villa}:${b.checkOut}`}`, entity: b.id || null, villa, date: b.checkOut,
          value: `${misafir} · ${villaName(villa)}`, tag: done ? 'DONE' : 'DO',
          reason: done ? 'Çıkış yapıldı' : 'Çıkış; evi teslim alın'
        });
      }
    });

    // ARIZA — acik ariza tek tanimdir (isMaintenanceTicketOpen).
    (i.tickets || []).forEach(t => {
      if (!(h.isTicketOpen ? h.isTicketOpen(t) : true)) return;
      const villa = t.villa || null;
      const kapatiyor = h.isTicketBlockingToday ? !!h.isTicketBlockingToday(t) : false;
      const p1 = String(t.priority || '').toUpperCase() === 'P1';
      push('MAINTENANCE_OPEN', {
        id: `ticket:${t.id}`, entity: t.id, villa, date: today,
        value: `${t.title || 'Başlık girilmemiş'}${villa ? ' · ' + villaName(villa) : ''}`,
        tag: kapatiyor || p1 ? 'URGENT' : 'DO',
        reason: kapatiyor ? 'Mülk bugün satışa kapalı' : (p1 ? 'Acil öncelikli arıza' : 'Açık arıza')
      });
    });

    // SATIS — takip ve teklif bekleyen talepler.
    (i.leads || []).forEach(l => {
      const s = String(l.status || '').toUpperCase();
      if (s !== 'FOLLOW_UP' && s !== 'QUOTE_SENT') return;
      const teklif = Number(l.quote) > 0 ? ` · teklif ${money(l.quote)}` : '';
      push('LEAD_FOLLOW_UP', {
        id: `lead:${l.id}`, entity: l.id, villa: l.villa && villas[l.villa] ? l.villa : null, date: today,
        value: l.guest || 'Ad belirtilmedi',
        tag: 'DO', reason: `${h.leadStatusLabel ? h.leadStatusLabel(s) : s}${teklif}`
      });
    });

    (i.gapNights || []).forEach(g => {
      if (!g || !g.checkIn) return;
      push('GAP_NIGHT', {
        id: `gap:${g.villaKey}:${g.checkIn}`, entity: `gap-${g.checkIn}-${g.villaKey}`, villa: g.villaKey || null, date: g.checkIn,
        value: `${shortDate(g.checkIn)}–${shortDate(g.checkOut)} · ${g.villaName || villaName(g.villaKey)}`,
        tag: 'DO', reason: 'İki rezervasyon arasında boş gece; satışa açın'
      });
    });

    // FIYAT — yalniz gunluk fiyat defterini kullanan isletmede (en az bir kayit).
    // Onumuzdeki 7 gecede dolu olmayan ve kayitli fiyati olmayan geceler.
    const prices = i.dailyPrices || [];
    if (prices.length > 0) {
      Object.keys(villas).forEach(key => {
        const v = villas[key];
        if (!v || v.isActive === false || v.archivedAt) return;
        const kayitli = new Set(prices.filter(p => p.property_id === v.id).map(p => String(p.price_date).slice(0, 10)));
        let eksik = 0;
        for (let d = 0; d < 7; d++) {
          const gun = addDays(today, d);
          const dolu = (i.bookings || []).some(b => b.villa === key && String(b.status || '').toUpperCase() !== 'CANCELLED'
            && b.checkIn <= gun && b.checkOut > gun);
          if (!dolu && !kayitli.has(gun)) eksik++;
        }
        if (eksik > 0) {
          push('PRICE_APPROVAL', {
            id: `price:${key}`, villa: key, date: today, value: `${eksik} gece · ${villaName(key)}`,
            tag: 'DO', reason: 'Önümüzdeki 7 boş gecede kayıtlı fiyat yok'
          });
        }
      });
    }

    // PAZARLAMA — bitis tarihi gecmis ama hala aktif kampanya.
    (i.campaigns || []).forEach(c => {
      if (String(c.status || '').toUpperCase() !== 'ACTIVE' || !c.endDate || !(c.endDate < today)) return;
      push('CAMPAIGN_ENDED', {
        id: `campaign:${c.id}`, entity: c.id, villa: c.villa && villas[c.villa] ? c.villa : null, date: today,
        value: c.name || 'Adsız kampanya', tag: 'DO', reason: `Bitiş ${shortDate(c.endDate)}; durumunu kapatın`
      });
    });

    // FINANS — portfoy geneli.
    const f = i.finance || {};
    const borc = (f.cleaningDebts || []).reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const borcAdet = (f.cleaningDebts || []).reduce((s, d) => s + (Number(d.count) || 0), 0);
    if (borcAdet > 0) {
      push('CLEANING_DEBT', { id: 'finance:cleaning-debt', value: `${money(borc)} temizlik borcu`, tag: 'DO', reason: `${borcAdet} yapılmış temizlik ödenmedi` });
    }
    const ay = today.slice(0, 7);
    if (f.prevMonthNeedsClose) {
      push('MONTH_NOT_CLOSED', { id: `finance:close:${previousMonth(ay)}`, value: `${monthName(previousMonth(ay))} kapanışı`, tag: 'DO', reason: 'Ay bitti; kapanış yapılmadı' });
    }
    if (f.expensesMissing) {
      push('EXPENSES_MISSING', { id: `finance:expenses:${ay}`, value: `${monthName(ay)} giderleri`, tag: 'DO', reason: 'Ciro var, gider kaydı yok; kâr ölçülemiyor' });
    }
    if (f.goalMissing) {
      push('GOAL_MISSING', { id: `finance:goal:${ay}`, value: `${monthName(ay)} ciro hedefi`, tag: 'DO', reason: 'Bu ay için ciro hedefi girilmedi' });
    }

    return out.sort((a, b) => TAG_ORDER[a.tag] - TAG_ORDER[b.tag]
      || String(a.date).localeCompare(String(b.date))
      || TEAM_KEYS.indexOf(a.team) - TEAM_KEYS.indexOf(b.team));
  }

  // Gorunen ekipler: kisi en az bir gorev turunu gorebiliyorsa ekip sekmesi cikar.
  function visibleTeams(can, routing) {
    const set = new Set(TASK_TYPE_KEYS.filter(t => canSee(t, can)).map(t => teamOf(t, routing)));
    return TEAMS.filter(t => set.has(t.key));
  }

  function filterTasks(tasks, { villa = 'ALL', team = 'ALL', teams = null } = {}) {
    return (tasks || []).filter(t => (villa === 'ALL' || t.villa === villa)
      && (team === 'ALL' || t.team === team)
      && (!teams || teams.includes(t.team)));
  }

  function countByTeam(tasks) {
    const out = {};
    (tasks || []).forEach(t => { if (t.tag !== 'DONE') out[t.team] = (out[t.team] || 0) + 1; });
    return out;
  }

  // Ozet cumlesi: "durum + ne yapmaliyim" (Lex sayfa duzeni 3). Parcalar
  // ayri doner ki ekran rakamlari orta kalinlikta yazabilsin.
  function summaryParts(tasks, { arrivals = 0, departures = 0, stays = true } = {}) {
    const acik = (tasks || []).filter(t => t.tag !== 'DONE');
    const acil = acik.filter(t => t.tag === 'URGENT');
    const ilk = acil[0] || acik[0] || null;
    const parts = [{ text: 'Bugün ' }];
    if (stays) {
      parts.push({ strong: `${arrivals} giriş` }, { text: ', ' }, { strong: `${departures} çıkış` }, { text: '; ' });
    }
    if (!acik.length) {
      parts.push({ text: 'açık iş yok.' });
      return parts;
    }
    parts.push({ strong: `${acik.length} iş` });
    parts.push({ text: acil.length ? ' bekliyor, ' : ' bekliyor' });
    if (acil.length) parts.push({ strong: `${acil.length} acil` });
    parts.push({ text: ` — önce ${ilk.value}.` });
    return parts;
  }

  const api = {
    TEAMS, TEAM_KEYS, TAGS, TASK_TYPES, TASK_TYPE_KEYS,
    buildTeamTasks, visibleTeams, filterTasks, countByTeam, summaryParts,
    normalizeRouting, teamOf, canSee, shortDate, addDays
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TeamTasks = api;
})(typeof window !== 'undefined' ? window : null);
