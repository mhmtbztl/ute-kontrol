// UTE Kontrol Merkezi V5 - Hospitality Business Logic & Calculation Engine
// Built for Uludağ Tatil Evleri (Seyir, Doğuş, Zirve, Şirin, Nefes)

const VILLAS = {
  SEYIR: {
    id: 'SEYIR',
    name: 'Seyir',
    capacity: 8, // 6+2
    bedrooms: 2,
    bathrooms: 1.5,
    distancePisteKm: 24,
    features: ['Isı Pompası', 'Şömine', 'Soba', 'Kış Bahçesi', '2-3 Araç Otopark'],
    rates: {
      floor: 3500,
      base: 4500,
      target: 6000,
      premium: 8500,
      peak: 12000
    },
    marginalCosts: {
      cleaning: 800,
      heatingDaily: 350,
      laundryPerGuest: 80
    }
  },
  DOGUS: {
    id: 'DOGUS',
    name: 'Doğuş',
    capacity: 11,
    bedrooms: 4,
    bathrooms: 2,
    distancePisteKm: 14,
    features: ['Isı Pompası', 'Şömine', 'Soba', 'Lüks Büyük Kış Bahçesi', '3-4 Araç'],
    rates: {
      floor: 5000,
      base: 6500,
      target: 9000,
      premium: 13000,
      peak: 18000
    },
    marginalCosts: {
      cleaning: 1200,
      heatingDaily: 500,
      laundryPerGuest: 90
    }
  },
  ZIRVE: {
    id: 'ZIRVE',
    name: 'Zirve',
    capacity: 9,
    bedrooms: 3,
    bathrooms: 2,
    distancePisteKm: 12,
    features: ['Isı Pompası', 'Şömine', 'Sauna', 'Isıtmalı Jakuzi', 'Isıtmalı Kapalı Çardak'],
    rates: {
      floor: 6500,
      base: 8500,
      target: 12000,
      premium: 16500,
      peak: 24000
    },
    marginalCosts: {
      cleaning: 1500,
      heatingDaily: 700, // jakuzi + sauna elektrik/ısıtma
      laundryPerGuest: 100
    }
  },
  SIRIN: {
    id: 'SIRIN',
    name: 'Şirin',
    capacity: 7,
    bedrooms: 2,
    bathrooms: 1,
    distancePisteKm: 21,
    features: ['Isı Pompası', 'Şömine', 'Üst Teras', 'Kapalı Veranda'],
    rates: {
      floor: 3000,
      base: 4000,
      target: 5500,
      premium: 7500,
      peak: 11000
    },
    marginalCosts: {
      cleaning: 750,
      heatingDaily: 300,
      laundryPerGuest: 75
    }
  },
  NEFES: {
    id: 'NEFES',
    name: 'Nefes',
    capacity: 12,
    bedrooms: 4,
    bathrooms: 3,
    distancePisteKm: 21,
    features: ['Isı Pompası', 'Şömine', 'Soba', 'Isıtmalı Kış Bahçesi', 'Voleybol Alanı', 'Mini Kale'],
    rates: {
      floor: 5500,
      base: 7000,
      target: 9500,
      premium: 14000,
      peak: 19000
    },
    marginalCosts: {
      cleaning: 1400,
      heatingDaily: 550,
      laundryPerGuest: 90
    }
  }
};

const CHANNELS = {
  AIRBNB: { name: 'Airbnb', isDirect: false, defaultCommissionRate: 0.15 },
  BOOKING: { name: 'Booking', isDirect: false, defaultCommissionRate: 0.18 },
  INSTAGRAM: { name: 'Instagram', isDirect: true, defaultCommissionRate: 0.00 },
  WEBSITE: { name: 'Website', isDirect: true, defaultCommissionRate: 0.00 },
  WHATSAPP: { name: 'WhatsApp', isDirect: true, defaultCommissionRate: 0.00 },
  PHONE: { name: 'Telefon', isDirect: true, defaultCommissionRate: 0.00 },
  REPEAT: { name: 'Tekrar Misafir', isDirect: true, defaultCommissionRate: 0.00 },
  OTHER: { name: 'Diğer', isDirect: false, defaultCommissionRate: 0.05 }
};

// Date helper: YYYY-MM-DD
function parseDate(dateStr) {
  if (dateStr instanceof Date) return new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate());
  const parts = dateStr.split('-');
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDaysDiff(d1, d2) {
  const dt1 = parseDate(d1);
  const dt2 = parseDate(d2);
  const diffTime = dt2.getTime() - dt1.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function getYearMonth(dateStr) {
  const d = parseDate(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// -------------------------------------------------------------
// PHASE 1: RESERVATION ENGINE & STAY-NIGHT SPLITTER
// -------------------------------------------------------------
function processReservation(raw) {
  const nights = getDaysDiff(raw.checkIn, raw.checkOut);
  if (nights <= 0) {
    throw new Error(`Invalid stay dates: ${raw.checkIn} to ${raw.checkOut}`);
  }

  const grossAmount = Number(raw.grossAmount) || 0;
  const otaCommission = Number(raw.otaCommission) || 0;
  const cleaningFee = Number(raw.cleaningFee) || 0;
  const discount = Number(raw.discount) || 0;

  // Pure Room Net Accommodation Revenue (USALI standard)
  const netRoomRevenue = Math.max(0, grossAmount - otaCommission - cleaningFee - discount);
  const revenuePerNight = netRoomRevenue / nights;

  // Split into nightly accrual records
  const stayNights = [];
  const curDate = parseDate(raw.checkIn);

  for (let i = 0; i < nights; i++) {
    const stayDateStr = formatDate(curDate);
    stayNights.push({
      bookingId: raw.id,
      propertyId: raw.propertyId,
      stayDate: stayDateStr,
      yearMonth: getYearMonth(stayDateStr),
      nightRevenue: revenuePerNight,
      channel: raw.channel,
      status: raw.status || 'CONFIRMED'
    });
    curDate.setDate(curDate.getDate() + 1);
  }

  const isDirect = CHANNELS[raw.channel] ? CHANNELS[raw.channel].isDirect : false;

  return {
    ...raw,
    nights,
    grossAmount,
    otaCommission,
    cleaningFee,
    discount,
    netRoomRevenue,
    revenuePerNight,
    isDirect,
    stayNights
  };
}

// -------------------------------------------------------------
// PHASE 5: OCCUPANCY & CALENDAR ENGINE
// -------------------------------------------------------------
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function calculateMonthlyPerformance({ year, month, propertyId, bookings = [], maintenances = [] }) {
  const daysInMonth = getDaysInMonth(year, month);
  const targetYearMonth = `${year}-${String(month).padStart(2, '0')}`;

  // Filter applicable properties
  const targetVillas = propertyId ? [propertyId] : Object.keys(VILLAS);

  let totalCalendarNights = daysInMonth * targetVillas.length;
  let totalDowntimeNights = 0;
  let totalMaintenanceCost = 0;

  // Process maintenance P1 downtime
  maintenances.forEach(m => {
    if (!targetVillas.includes(m.propertyId)) return;
    if (m.yearMonth === targetYearMonth) {
      totalMaintenanceCost += (Number(m.actualCost) || Number(m.estimatedCost) || 0);
      if (m.priority === 'P1' && m.status !== 'COMPLETED') {
        totalDowntimeNights += (Number(m.downtimeNights) || 0);
      }
    }
  });

  // Available Rentable Nights
  const availableNights = Math.max(1, totalCalendarNights - totalDowntimeNights);

  // Aggregate stay nights strictly within this month
  let paidNights = 0;
  let netRoomRevenue = 0;
  let grossBookingValue = 0;
  let directRevenue = 0;
  let otaRevenue = 0;
  let channelBreakdown = {};

  Object.keys(CHANNELS).forEach(ch => {
    channelBreakdown[ch] = { nights: 0, revenue: 0, count: 0 };
  });

  const processedBookings = bookings.map(b => b.stayNights ? b : processReservation(b));

  processedBookings.forEach(b => {
    if (b.status === 'CANCELLED' || b.status === 'LOST') return;
    if (!targetVillas.includes(b.propertyId)) return;

    b.stayNights.forEach(sn => {
      if (sn.yearMonth === targetYearMonth) {
        paidNights += 1;
        netRoomRevenue += sn.nightRevenue;

        if (channelBreakdown[sn.channel]) {
          channelBreakdown[sn.channel].nights += 1;
          channelBreakdown[sn.channel].revenue += sn.nightRevenue;
        }

        if (b.isDirect) {
          directRevenue += sn.nightRevenue;
        } else {
          otaRevenue += sn.nightRevenue;
        }
      }
    });

    // For GBV of bookings checking in this month
    if (getYearMonth(b.checkIn) === targetYearMonth) {
      grossBookingValue += b.grossAmount;
      if (channelBreakdown[b.channel]) {
        channelBreakdown[b.channel].count += 1;
      }
    }
  });

  // KPI Calculations (Phase 2 & 4)
  const occupancyRate = (paidNights / availableNights) * 100;
  const adr = paidNights > 0 ? (netRoomRevenue / paidNights) : 0;
  const revpar = netRoomRevenue / availableNights;

  // Estimated variable operational cost (heating + laundry + cleaning per stay)
  const estimatedVariableCost = paidNights * 750;
  const nrevpar = (netRoomRevenue - estimatedVariableCost - totalMaintenanceCost) / availableNights;

  const directBookingShare = netRoomRevenue > 0 ? (directRevenue / netRoomRevenue) * 100 : 0;

  return {
    yearMonth: targetYearMonth,
    propertyId: propertyId || 'ALL',
    totalCalendarNights,
    downtimeNights: totalDowntimeNights,
    availableNights,
    paidNights,
    grossBookingValue,
    netRoomRevenue,
    occupancyRate: Number(occupancyRate.toFixed(1)),
    adr: Math.round(adr),
    revpar: Math.round(revpar),
    nrevpar: Math.round(nrevpar),
    directRevenue: Math.round(directRevenue),
    otaRevenue: Math.round(otaRevenue),
    directBookingShare: Number(directBookingShare.toFixed(1)),
    totalMaintenanceCost,
    channelBreakdown
  };
}

// -------------------------------------------------------------
// PHASE 3: LEAD CRM ENGINE
// -------------------------------------------------------------
function calculateLeadFunnel(leads = [], bookings = []) {
  let totalLeads = leads.length;
  let quotesSent = 0;
  let wonReservations = 0;
  let lostLeads = 0;
  let followUpPending = 0;
  let channelStats = {};

  leads.forEach(l => {
    if (!channelStats[l.channel]) {
      channelStats[l.channel] = { total: 0, won: 0, lost: 0 };
    }
    channelStats[l.channel].total += 1;

    if (l.status === 'QUOTE_SENT') quotesSent += 1;
    if (l.status === 'FOLLOW_UP') followUpPending += 1;
    if (l.status === 'WON' || l.status === 'RESERVED') {
      wonReservations += 1;
      channelStats[l.channel].won += 1;
    }
    if (l.status === 'LOST') {
      lostLeads += 1;
      channelStats[l.channel].lost += 1;
    }
  });

  const conversionRate = totalLeads > 0 ? (wonReservations / totalLeads) * 100 : 0;
  const totalNetRevenue = bookings.reduce((sum, b) => sum + (b.netRoomRevenue || 0), 0);
  const revenuePerLead = totalLeads > 0 ? (totalNetRevenue / totalLeads) : 0;

  return {
    totalLeads,
    quotesSent,
    wonReservations,
    lostLeads,
    followUpPending,
    conversionRate: Number(conversionRate.toFixed(1)),
    revenuePerLead: Math.round(revenuePerLead),
    channelStats
  };
}

// -------------------------------------------------------------
// PHASE 6: MAINTENANCE & INVESTMENT PRIORITIZATION
// -------------------------------------------------------------
function calculateInvestmentPriority(task) {
  const guestImpact = task.guestImpact || 3;
  const revenueImpact = task.revenueImpact || 3;
  const urgency = task.priority === 'P1' ? 5 : (task.priority === 'P2' ? 3 : 1);
  const costFactor = task.cost > 20000 ? 5 : (task.cost > 10000 ? 4 : (task.cost > 3000 ? 3 : 1));
  const effortFactor = task.effortDays > 7 ? 5 : (task.effortDays > 3 ? 3 : 1);

  const impactScore = (guestImpact * 3) + (revenueImpact * 3) + (urgency * 2);
  const costEffortScore = costFactor + effortFactor;
  const ratio = impactScore / Math.max(1, costEffortScore);

  let recommendation = 'Sonra Değerlendir';
  if (task.priority === 'P1' || ratio >= 4.5) {
    recommendation = 'Hemen Yap';
  } else if (ratio >= 3.0) {
    recommendation = 'Bu Ay Yap';
  } else if (ratio < 1.8) {
    recommendation = 'Yapma / Beklet';
  }

  return {
    taskId: task.id,
    priority: task.priority,
    impactScore,
    costEffortScore,
    ratio: Number(ratio.toFixed(2)),
    recommendation
  };
}

// -------------------------------------------------------------
// PHASE 8: GAP NIGHT & STAY EXTENSION ENGINE
// -------------------------------------------------------------
function detectGapNights({ propertyId, bookings = [], todayStr }) {
  const villa = VILLAS[propertyId];
  if (!villa) return [];

  const propBookings = bookings
    .filter(b => b.propertyId === propertyId && b.status !== 'CANCELLED')
    .sort((a, b) => parseDate(a.checkIn) - parseDate(b.checkIn));

  const opportunities = [];

  for (let i = 0; i < propBookings.length; i++) {
    const current = propBookings[i];
    const next = propBookings[i + 1];

    if (next) {
      const gapDays = getDaysDiff(current.checkOut, next.checkIn);
      if (gapDays === 1 || gapDays === 2) {
        const floorWithMarginal = villa.rates.floor + villa.marginalCosts.cleaning + villa.marginalCosts.heatingDaily;
        const discountedBase = Math.round(villa.rates.base * 0.75); // 25% discount
        const recommendedOfferPrice = Math.max(discountedBase, floorWithMarginal);

        opportunities.push({
          type: 'ORPHAN_NIGHT',
          propertyId,
          propertyName: villa.name,
          startDate: current.checkOut,
          endDate: next.checkIn,
          gapDays,
          currentGuestName: current.guestName || 'Misafir',
          recommendedOfferPrice,
          floorGuardrail: floorWithMarginal,
          message: `${villa.name} villasında ${current.checkOut} ile ${next.checkIn} arasında ${gapDays} gecelik boşluk var. Önerilen indirimli fiyat: ₺${recommendedOfferPrice}`
        });
      }
    }

    if (todayStr && current.checkOut === todayStr && !next) {
      const extensionPrice = Math.max(Math.round(villa.rates.base * 0.70), villa.rates.floor);
      opportunities.push({
        type: 'STAY_EXTENSION',
        propertyId,
        propertyName: villa.name,
        date: todayStr,
        guestName: current.guestName,
        recommendedOfferPrice: extensionPrice,
        message: `${villa.name}: İçerideki misafire (${current.guestName}) bu gece için ₺${extensionPrice} uzatma teklif et.`
      });
    }
  }

  return opportunities;
}

// -------------------------------------------------------------
// PHASE 10: TODAY ENGINE (PRIORITIZATION RADAR)
// -------------------------------------------------------------
function generateTodayRadar({ todayStr, bookings = [], leads = [], maintenances = [] }) {
  const critical = [];   // Max 3
  const operations = []; // Max 2
  const revenue = [];    // Max 1

  // 1. Critical: Open P1 Maintenance
  maintenances
    .filter(m => m.priority === 'P1' && m.status !== 'COMPLETED')
    .forEach(m => {
      critical.push({
        category: 'P1_ARIZA',
        title: `ACİL: ${VILLAS[m.propertyId]?.name || m.propertyId} - ${m.title}`,
        detail: `Downtime Riski: ${m.downtimeNights || 1} gece. Sorumlu: ${m.assignee || 'Atanmadı'}`
      });
    });

  // 2. Critical / Ops: Check-ins & Check-outs today
  bookings.forEach(b => {
    if (b.status === 'CANCELLED') return;
    if (b.checkOut === todayStr) {
      operations.push({
        category: 'CHECK_OUT',
        title: `${VILLAS[b.propertyId]?.name}: Check-out (Misafir: ${b.guestName || 'Misafir'})`,
        detail: `Temizlik ve denetim başlatılmalı.`
      });
    }
    if (b.checkIn === todayStr) {
      critical.push({
        category: 'CHECK_IN',
        title: `${VILLAS[b.propertyId]?.name}: Bugün Giriş Var (Misafir: ${b.guestName || 'Misafir'})`,
        detail: `Şömine odunu, karşılama ve ısı pompası hazır olmalı.`
      });
    }
  });

  // 3. Critical: Hot Leads awaiting follow-up
  leads
    .filter(l => l.status === 'FOLLOW_UP' || l.status === 'QUOTE_SENT')
    .slice(0, 2)
    .forEach(l => {
      critical.push({
        category: 'LEAD_TAKIP',
        title: `Sıcak Fırsat: ${l.guestName} (${VILLAS[l.propertyId]?.name || 'Villa'})`,
        detail: `Teklif: ₺${l.quoteAmount}. Kanal: ${l.channel}. Yanıt bekleniyor.`
      });
    });

  // 4. Revenue Opportunity: Gap Nights
  Object.keys(VILLAS).forEach(pId => {
    if (revenue.length >= 1) return;
    const gaps = detectGapNights({ propertyId: pId, bookings, todayStr });
    if (gaps.length > 0) {
      revenue.push({
        category: 'EK_GECE_FIRSATI',
        title: gaps[0].message,
        detail: `Minimum taban fiyat koruması devrede (Floor: ₺${gaps[0].floorGuardrail || 'Aktif'})`
      });
    }
  });

  return {
    date: todayStr,
    summary: {
      criticalCount: critical.length,
      operationsCount: operations.length,
      revenueCount: revenue.length
    },
    actions: {
      critical: critical.slice(0, 3),
      operations: operations.slice(0, 2),
      revenue: revenue.slice(0, 1)
    }
  };
}

module.exports = {
  VILLAS,
  CHANNELS,
  parseDate,
  formatDate,
  getDaysDiff,
  getYearMonth,
  processReservation,
  calculateMonthlyPerformance,
  calculateLeadFunnel,
  calculateInvestmentPriority,
  detectGapNights,
  generateTodayRadar
};
