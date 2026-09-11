/**
 * LEXBNB KONTROL MERKEZİ - GOOGLE APPS SCRIPT AUTOMATION ENGINE
 * Lexbnb Lüks Villa Portföyü
 * 
 * Instructions:
 * 1. Google Sheets dosyanızı açın (Extensions > Apps Script).
 * 2. Bu kodun tamamını kopyalayıp Code.gs içine yapıştırın.
 * 3. Kaydedip sayfayı yenileyin. Üst menüde "🌲 UTE Kontrol Merkezi" belirecektir.
 */

const UTE_CONFIG = {
  villas: {
    'Seyir': { floor: 3500, base: 4500, target: 6000, cleaning: 800, heating: 350 },
    'Doğuş': { floor: 5000, base: 6500, target: 9000, cleaning: 1200, heating: 500 },
    'Zirve': { floor: 6500, base: 8500, target: 12000, cleaning: 1500, heating: 700 },
    'Şirin': { floor: 3000, base: 4000, target: 5500, cleaning: 750, heating: 300 },
    'Nefes': { floor: 5500, base: 7000, target: 9500, cleaning: 1400, heating: 550 }
  },
  sheets: {
    dashboard: '01_KONTROL_MERKEZI',
    reservations: '02_REZERVASYONLAR',
    leads: '03_LEAD_CRM',
    maintenance: '04_BAKIM_VE_YATIRIM',
    goals: '05_KARARLAR_VE_HEDEFLER',
    params: '_PARAMETRELER'
  }
};

/**
 * Sayfa açıldığında özel UTE menüsünü ekler.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🌲 UTE Kontrol Merkezi')
    .addItem('⚡ Bugün Ne Yapmalıyım? (Radarı Çalıştır)', 'runTodayRadar')
    .addItem('🔍 Boşluk Geceleri (Gap Night) Tara', 'scanGapNights')
    .addSeparator()
    .addItem('🔄 Gece Defterini Yenile (Accrual Sync)', 'syncStayLedger')
    .addItem('➕ Seçili Lead\'i Rezervasyona Çevir', 'convertSelectedLeadToBooking')
    .addToUi();
}

/**
 * Custom Formula: Gecelik Net Gelir Dağıtımı
 * =UTE_NET_REVENUE(gross, otaComm, cleanFee, discount)
 */
function UTE_NET_REVENUE(gross, otaComm, cleanFee, discount) {
  const g = Number(gross) || 0;
  const c = Number(otaComm) || 0;
  const cl = Number(cleanFee) || 0;
  const d = Number(discount) || 0;
  return Math.max(0, g - c - cl - d);
}

/**
 * TODAY RADAR MOTORU
 * Dashboard'daki B7:I11 alanını güncel acil durumlarla doldurur.
 */
function runTodayRadar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const wsDash = ss.getSheetByName(UTE_CONFIG.sheets.dashboard);
  const wsRes = ss.getSheetByName(UTE_CONFIG.sheets.reservations);
  const wsLeads = ss.getSheetByName(UTE_CONFIG.sheets.leads);
  const wsMaint = ss.getSheetByName(UTE_CONFIG.sheets.maintenance);

  if (!wsDash) return;

  const today = new Date();
  const todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const critical = [];
  const operations = [];
  const revenue = [];

  // 1. P1 Bakım Kontrolü
  if (wsMaint) {
    const maintData = wsMaint.getDataRange().getValues();
    for (let i = 1; i < maintData.length; i++) {
      const [id, villa, title, type, priority, status, assignee, estCost, actCost, downtime] = maintData[i];
      if (priority === 'P1' && status !== 'Tamamlandı') {
        critical.push([
          '[P1 ACİL]',
          `${villa}: ${title} (Downtime: ${downtime || 1} gece)`,
          `Sorumlu: ${assignee || 'Atanmadı'}`,
          'Hemen Çöz'
        ]);
      }
    }
  }

  // 2. Bugün Giriş / Çıkış Kontrolü
  if (wsRes) {
    const resData = wsRes.getDataRange().getValues();
    for (let i = 1; i < resData.length; i++) {
      const [id, villa, guest, channel, checkIn, checkOut, nights, pax, gross, comm, clean, net, nightNet, status] = resData[i];
      if (status === 'İptal') continue;

      const inStr = checkIn instanceof Date ? Utilities.formatDate(checkIn, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(checkIn);
      const outStr = checkOut instanceof Date ? Utilities.formatDate(checkOut, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(checkOut);

      if (inStr === todayStr) {
        critical.push([
          '[CHECK-IN]',
          `${villa}: Bugün giriş var. Misafir: ${guest} (${pax} kişi).`,
          `Kanal: ${channel}`,
          'Kontrol Et'
        ]);
      }
      if (outStr === todayStr) {
        operations.push([
          '[CHECK-OUT]',
          `${villa}: Bugün çıkış var. Misafir: ${guest}. Temizlik başlatılmalı.`,
          `Sorumlu: Temizlik`,
          'Takip Et'
        ]);
      }
    }
  }

  // 3. Sıcak Lead Kontrolü
  if (wsLeads) {
    const leadData = wsLeads.getDataRange().getValues();
    for (let i = 1; i < leadData.length; i++) {
      const [id, date, guest, villa, channel, dates, quote, status, lostReason, notes] = leadData[i];
      if (status === 'Follow-up' || status === 'Teklif Verildi') {
        critical.push([
          '[SICAK LEAD]',
          `${guest} (${villa}): Teklif: ₺${quote}. Yanıt bekleniyor.`,
          `Kanal: ${channel}`,
          'Follow-up Yap'
        ]);
        if (critical.length >= 3) break;
      }
    }
  }

  // Varsayılan boşluk tamamlama
  while (critical.length < 3) {
    critical.push(['[GÜVENLİ]', 'Kritik açık P1 veya acil alarm bulunmuyor.', 'Sistem: Normal', 'Onayla']);
  }
  while (operations.length < 2) {
    operations.push(['[OPERASYON]', 'Tüm villalarda standart rutin temizlik ve odun takibi.', 'Ekip: Hazır', 'Rutin']);
  }

  // Radar alanına yaz (Satır 7 to 11)
  const finalRadar = [
    critical[0],
    critical[1],
    critical[2],
    operations[0],
    operations[1]
  ];

  for (let r = 0; r < 5; r++) {
    const item = finalRadar[r];
    const rIdx = 7 + r;
    wsDash.getRange(`B${rIdx}`).setValue(item[0]);
    wsDash.getRange(`C${rIdx}`).setValue(item[1]);
    wsDash.getRange(`G${rIdx}`).setValue(item[2]);
    wsDash.getRange(`I${rIdx}`).setValue(item[3]);
  }

  SpreadsheetApp.getActiveSpreadsheet().toast('Today Radar başarıyla güncellendi!', '⚡ UTE Kontrol', 3);
}

/**
 * BOŞLUK GECELERİ (GAP NIGHT) TARAMA MOTORU
 */
function scanGapNights() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const wsRes = ss.getSheetByName(UTE_CONFIG.sheets.reservations);
  if (!wsRes) return;

  const data = wsRes.getDataRange().getValues();
  const bookingsByVilla = {};

  for (let i = 1; i < data.length; i++) {
    const [id, villa, guest, channel, checkIn, checkOut, nights, pax, gross, comm, clean, net, nightNet, status] = data[i];
    if (status === 'İptal') continue;
    if (!bookingsByVilla[villa]) bookingsByVilla[villa] = [];

    const dIn = checkIn instanceof Date ? checkIn : new Date(checkIn);
    const dOut = checkOut instanceof Date ? checkOut : new Date(checkOut);

    bookingsByVilla[villa].push({ id, guest, dIn, dOut });
  }

  let report = '🔍 TESPİT EDİLEN BOŞLUK GECELERİ (GAP NIGHTS):\n\n';
  let foundCount = 0;

  Object.keys(bookingsByVilla).forEach(vName => {
    const list = bookingsByVilla[vName].sort((a, b) => a.dIn - b.dIn);
    for (let j = 0; j < list.length - 1; j++) {
      const cur = list[j];
      const next = list[j + 1];
      const diffDays = Math.round((next.dIn - cur.dOut) / (1000 * 60 * 60 * 24));

      if (diffDays === 1 || diffDays === 2) {
        foundCount++;
        const conf = UTE_CONFIG.villas[vName] || { floor: 4000, base: 5000, cleaning: 1000, heating: 400 };
        const floorGuard = conf.floor + conf.cleaning + conf.heating;
        const offerPrice = Math.max(Math.round(conf.base * 0.75), floorGuard);

        const outStr = Utilities.formatDate(cur.dOut, Session.getScriptTimeZone(), 'dd.MM.yyyy');
        const inStr = Utilities.formatDate(next.dIn, Session.getScriptTimeZone(), 'dd.MM.yyyy');

        report += `• ${vName}: ${outStr} - ${inStr} arasında ${diffDays} GECE BOŞLUK VAR.\n`;
        report += `  Önerilen İndirimli Fiyat: ₺${offerPrice} (Taban Koruma: ₺${floorGuard})\n\n`;
      }
    }
  });

  if (foundCount === 0) {
    report += 'Şu anda önümüzdeki rezervasyonlar arasında 1-2 gecelik kritik boşluk bulunamadı.';
  }

  SpreadsheetApp.getUi().alert('Ek Gece Fırsatları (Gap Night Engine)', report, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Seçili Lead Satırını Tek Tıkla Rezervasyona Çevirme
 */
function convertSelectedLeadToBooking() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const wsLeads = ss.getSheetByName(UTE_CONFIG.sheets.leads);
  const wsRes = ss.getSheetByName(UTE_CONFIG.sheets.reservations);

  if (!wsLeads || !wsRes) return;

  const row = wsLeads.getActiveCell().getRow();
  if (row <= 1) {
    SpreadsheetApp.getUi().alert('Lütfen dönüştürmek istediğiniz Lead satırına tıklayın.');
    return;
  }

  const lead = wsLeads.getRange(`A${row}:J${row}`).getValues()[0];
  const [leadId, date, guest, villa, channel, dates, quote, status, lostReason, notes] = lead;

  // Durumu Rezervasyon yap
  wsLeads.getRange(`H${row}`).setValue('Rezervasyon');
  wsLeads.getRange(`J${row}`).setValue(`Rezervasyona dönüştürüldü (${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy')})`);

  // Yeni Rezervasyon satırı ekle
  const newRezId = 'REZ-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
  wsRes.appendRow([
    newRezId,
    villa,
    guest,
    channel,
    '', // Giriş (kullanıcı dolduracak)
    '', // Çıkış
    2,  // Varsayılan 2 gece
    6,
    quote,
    0,
    0,
    quote,
    Math.round(quote / 2),
    'Onaylandı',
    `Lead ${leadId} üzerinden oluşturuldu`
  ]);

  SpreadsheetApp.getUi().alert(`Lead başarıyla "${newRezId}" olarak Rezervasyonlar sayfasına aktarıldı!`);
}
