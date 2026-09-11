// UTE Kontrol Merkezi V5 - Excel & Google Sheets Workbook Generator
// Uses exceljs to build a fully styled, formula-driven spreadsheet
const ExcelJS = require('exceljs');
const path = require('path');

async function buildWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UTE Hospitality Systems';
  workbook.lastModifiedBy = 'UTE Kontrol Merkezi V5';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Color Palette (Luxury Slate & Pine Forest dağ teması)
  const COLORS = {
    headerDark: 'FF1E293B',    // Slate 800
    subHeader: 'FF334155',     // Slate 700
    accentEmerald: 'FF059669', // Emerald 600
    accentAmber: 'FFD97706',   // Amber 600
    accentRose: 'FFE11D48',    // Rose 600
    bgLight: 'FFF8FAFC',       // Slate 50
    zebraLight: 'FFF1F5F9',    // Slate 100
    cardBorder: 'FFE2E8F0',    // Slate 200
    textWhite: 'FFFFFFFF',
    textDark: 'FF0F172A'
  };

  const fontHeader = { name: 'Segoe UI', size: 11, bold: true, color: { argb: COLORS.textWhite } };
  const fontTitle = { name: 'Segoe UI', size: 16, bold: true, color: { argb: COLORS.textWhite } };
  const fontCardTitle = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF64748B' } };
  const fontCardVal = { name: 'Segoe UI', size: 18, bold: true, color: { argb: COLORS.textDark } };
  const fontNormal = { name: 'Segoe UI', size: 10, color: { argb: COLORS.textDark } };
  const fontBold = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.textDark } };

  // =========================================================================
  // 1. DASHBOARD SHEET (01_KONTROL_MERKEZI)
  // =========================================================================
  const wsDash = workbook.addWorksheet('01_KONTROL_MERKEZI', {
    views: [{ showGridLines: true }]
  });

  wsDash.columns = [
    { width: 4 },  // A (margin)
    { width: 18 }, // B
    { width: 22 }, // C
    { width: 18 }, // D
    { width: 18 }, // E
    { width: 18 }, // F
    { width: 18 }, // G
    { width: 18 }, // H
    { width: 24 }  // I
  ];

  // Header Banner
  wsDash.mergeCells('B2:I3');
  const titleCell = wsDash.getCell('B2');
  titleCell.value = '🌲 ULUDAĞ TATİL EVLERİ (UTE) — KONTROL MERKEZİ V5';
  titleCell.font = fontTitle;
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerDark } };

  // Subtitle / Filter Row
  wsDash.mergeCells('B4:D4');
  wsDash.getCell('B4').value = 'Dönem: EYLÜL 2026 | Portföy: 5 Villa';
  wsDash.getCell('B4').font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF475569' } };

  wsDash.mergeCells('G4:I4');
  wsDash.getCell('G4').value = 'Son Güncelleme: 06.09.2026 11:45';
  wsDash.getCell('G4').font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF94A3B8' } };
  wsDash.getCell('G4').alignment = { horizontal: 'right' };

  // -------------------------------------------------------------------------
  // SECTION 1: TODAY RADAR (BUGÜN NE YAPMALIYIM? - MAX 6 MADDE)
  // -------------------------------------------------------------------------
  wsDash.mergeCells('B6:I6');
  const radarHeader = wsDash.getCell('B6');
  radarHeader.value = '⚡ BUGÜN NE YAPMALIYIM? (GÜNLÜK AKSIYON RADARI)';
  radarHeader.font = fontHeader;
  radarHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subHeader } };

  const radarItems = [
    ['[P1 ACİL]', 'Doğuş: Isı Pompası sensör hatası giderilmeli (Girişe 48 saat var).', 'Sorumlu: Ahmet Usta', 'Hemen Çöz'],
    ['[CHECK-IN]', 'Zirve: 9 kişilik misafir girişi var (Saat 15:00). Şömine ve jakuzi hazırlandı.', 'Sorumlu: Resepsiyon', 'Kontrol Et'],
    ['[SICAK LEAD]', 'Selin B. (Instagram): 24 saat dolmak üzere. Teklif: ₺45.000.', 'Sorumlu: Satış', 'Follow-up Yap'],
    ['[EK GECE]', 'Seyir: Yarın boş. İçerideki misafire ₺3.500 taban fiyatla uzatma teklif et.', 'Sorumlu: Satış', 'Teklif Gönder'],
    ['[OPERASYON]', 'Şirin: Çıkış sonrası detaylı kış bahçesi temizliği.', 'Sorumlu: Temizlik', 'Takip Et']
  ];

  radarItems.forEach((item, idx) => {
    const rIdx = 7 + idx;
    wsDash.getCell(`B${rIdx}`).value = item[0];
    wsDash.getCell(`B${rIdx}`).font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: item[0].includes('ACİL') ? COLORS.accentRose : (item[0].includes('EK GECE') ? COLORS.accentEmerald : COLORS.accentAmber) } };
    wsDash.getCell(`B${rIdx}`).alignment = { horizontal: 'center' };

    wsDash.mergeCells(`C${rIdx}:F${rIdx}`);
    wsDash.getCell(`C${rIdx}`).value = item[1];
    wsDash.getCell(`C${rIdx}`).font = fontNormal;

    wsDash.mergeCells(`G${rIdx}:H${rIdx}`);
    wsDash.getCell(`G${rIdx}`).value = item[2];
    wsDash.getCell(`G${rIdx}`).font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF64748B' } };

    wsDash.getCell(`I${rIdx}`).value = item[3];
    wsDash.getCell(`I${rIdx}`).font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: COLORS.textDark } };
    wsDash.getCell(`I${rIdx}`).alignment = { horizontal: 'center' };
  });

  // -------------------------------------------------------------------------
  // SECTION 2: BIG 4 KPI CARDS
  // -------------------------------------------------------------------------
  const kpiRow = 13;
  const cards = [
    { range: 'B13:C14', title: 'NET KONAKLAMA GELİRİ', val: '₺327.000', sub: 'Hedef: ₺400.000 (%81,8)' },
    { range: 'D13:E14', title: 'AYLIK DOLULUK ORANI', val: '%68,2', sub: 'Satılan: 101 / 148 Gece' },
    { range: 'F13:G14', title: 'ADR (ORTALAMA GÜNLÜK FİYAT)', val: '₺3.238', sub: 'Geçen Ay: ₺2.950 (+%9,8)' },
    { range: 'H13:I14', title: 'RevPAR (SATILABİLİR GELİR)', val: '₺2.209', sub: 'Net RevPAR: ₺1.745' }
  ];

  cards.forEach(c => {
    const [start, end] = c.range.split(':');
    wsDash.mergeCells(c.range);
    const cell = wsDash.getCell(start);
    cell.value = `${c.title}\n${c.val}\n${c.sub}`;
    cell.font = { name: 'Segoe UI', size: 10, bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.bgLight } };
  });

  // -------------------------------------------------------------------------
  // SECTION 3: VILLA PERFORMANCE SCORECARD
  // -------------------------------------------------------------------------
  wsDash.mergeCells('B16:I16');
  const scHeader = wsDash.getCell('B16');
  scHeader.value = '🏆 VİLLA BAZLI PERFORMANS SCORECARD (5 VİLLA KARŞILAŞTIRMA)';
  scHeader.font = fontHeader;
  scHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerDark } };

  const scCols = ['Villa Adı', 'Kapasite', 'Satılan Gece', 'Doluluk %', 'ADR (₺)', 'RevPAR (₺)', 'Net Ciro (₺)', 'Durum'];
  scCols.forEach((colName, cIdx) => {
    const colLetter = String.fromCharCode(66 + cIdx); // B to I
    const cell = wsDash.getCell(`${colLetter}17`);
    cell.value = colName;
    cell.font = fontHeader;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subHeader } };
    cell.alignment = { horizontal: 'center' };
  });

  const villaRows = [
    ['Seyir', '6+2 Kişi', 21, '70.0%', 4200, 2940, 88200, '🟢 Güçlü'],
    ['Doğuş', '11 Kişi', 18, '60.0%', 5500, 3300, 99000, '🟡 Takip (P1)'],
    ['Zirve (Jakuzi/Sauna)', '9 Kişi', 23, '76.7%', 7800, 5980, 179400, '🟢 Premium Star'],
    ['Şirin', '7 Kişi', 16, '53.3%', 3800, 2027, 60800, '🔴 Düşük ADR'],
    ['Nefes', '12 Kişi', 19, '63.3%', 5200, 3293, 98800, '🟢 Dengeli']
  ];

  villaRows.forEach((row, rIdx) => {
    const curR = 18 + rIdx;
    row.forEach((val, cIdx) => {
      const colLetter = String.fromCharCode(66 + cIdx);
      const cell = wsDash.getCell(`${colLetter}${curR}`);
      cell.value = val;
      cell.font = fontNormal;
      cell.alignment = { horizontal: cIdx === 0 ? 'left' : 'center' };
      if (curR % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
      }
    });
  });

  // -------------------------------------------------------------------------
  // SECTION 4: SALES FUNNEL & CHANNEL RATIO
  // -------------------------------------------------------------------------
  wsDash.mergeCells('B24:E24');
  const leadHeader = wsDash.getCell('B24');
  leadHeader.value = '🎯 SATIŞ VE LEAD HUNİSİ';
  leadHeader.font = fontHeader;
  leadHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subHeader } };

  const leadMetrics = [
    ['Toplam Talep (Lead)', '48 Adet'],
    ['Teklif Verilen', '34 Adet (%70,8)'],
    ['Kazanılan Rezervasyon', '14 Adet (%29,2)'],
    ['Kayıp Lead', '20 Adet'],
    ['Lead Başına Net Gelir (RPL)', '₺6.812']
  ];
  leadMetrics.forEach((lm, idx) => {
    wsDash.mergeCells(`B${25 + idx}:C${25 + idx}`);
    wsDash.mergeCells(`D${25 + idx}:E${25 + idx}`);
    wsDash.getCell(`B${25 + idx}`).value = lm[0];
    wsDash.getCell(`D${25 + idx}`).value = lm[1];
    wsDash.getCell(`B${25 + idx}`).font = fontNormal;
    wsDash.getCell(`D${25 + idx}`).font = fontBold;
  });

  wsDash.mergeCells('F24:I24');
  const chHeader = wsDash.getCell('F24');
  chHeader.value = '🌐 KANAL DAĞILIMI VE DİREKT SATIŞ PAYI';
  chHeader.font = fontHeader;
  chHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subHeader } };

  const channelMetrics = [
    ['WhatsApp (Direkt)', '₺142.000 (%43,4)'],
    ['Airbnb (OTA)', '₺118.000 (%36,1)'],
    ['Booking.com (OTA)', '₺45.000 (%13,8)'],
    ['Instagram / Web (Direkt)', '₺22.000 (%6,7)'],
    ['TOPLAM DİREKT ORANI', '%50,1 (Hedef: >%50) ✅']
  ];
  channelMetrics.forEach((cm, idx) => {
    wsDash.mergeCells(`F${25 + idx}:G${25 + idx}`);
    wsDash.mergeCells(`H${25 + idx}:I${25 + idx}`);
    wsDash.getCell(`F${25 + idx}`).value = cm[0];
    wsDash.getCell(`H${25 + idx}`).value = cm[1];
    wsDash.getCell(`F${25 + idx}`).font = fontNormal;
    wsDash.getCell(`H${25 + idx}`).font = fontBold;
  });

  // =========================================================================
  // 2. RESERVATIONS SHEET (02_REZERVASYONLAR)
  // =========================================================================
  const wsRes = workbook.addWorksheet('02_REZERVASYONLAR', { views: [{ showGridLines: true }] });
  wsRes.columns = [
    { header: 'Rez ID', key: 'id', width: 12 },
    { header: 'Villa', key: 'villa', width: 14 },
    { header: 'Misafir', key: 'guest', width: 18 },
    { header: 'Kanal', key: 'channel', width: 14 },
    { header: 'Giriş Tarihi', key: 'checkIn', width: 14 },
    { header: 'Çıkış Tarihi', key: 'checkOut', width: 14 },
    { header: 'Gece Sayısı', key: 'nights', width: 12 },
    { header: 'Kişi', key: 'pax', width: 8 },
    { header: 'Brüt Tutar (₺)', key: 'gross', width: 16 },
    { header: 'OTA Komisyon (₺)', key: 'comm', width: 16 },
    { header: 'Temizlik Ücreti (₺)', key: 'clean', width: 16 },
    { header: 'Net Oda Geliri (₺)', key: 'net', width: 18 },
    { header: 'Gecelik Net (₺)', key: 'nightNet', width: 16 },
    { header: 'Durum', key: 'status', width: 14 },
    { header: 'Not', key: 'notes', width: 22 }
  ];

  const resHeaderRow = wsRes.getRow(1);
  resHeaderRow.font = fontHeader;
  resHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerDark } };
  resHeaderRow.alignment = { horizontal: 'center' };

  const sampleBookings = [
    ['REZ-2026-001', 'Seyir', 'Hakan Demir', 'Airbnb', '2026-09-01', '2026-09-04', 3, 6, 28000, 4200, 1500, 22300, 7433, 'Tamamlandı', 'Memnun ayrıldı'],
    ['REZ-2026-002', 'Doğuş', 'Murat Kaya', 'WhatsApp', '2026-09-03', '2026-09-06', 3, 10, 36000, 0, 0, 36000, 12000, 'Tamamlandı', 'Şömine odunu ikramı'],
    ['REZ-2026-003', 'Zirve', 'Ahmet Yıldız', 'Airbnb', '2026-09-07', '2026-09-10', 3, 8, 48000, 7200, 2000, 38800, 12933, 'Tamamlandı', 'Sauna/Jakuzi aktif'],
    ['REZ-2026-004', 'Şirin', 'Emre Can', 'Booking', '2026-09-08', '2026-09-11', 3, 6, 21000, 3780, 1000, 16220, 5407, 'Tamamlandı', 'Geç check-out talep etti'],
    ['REZ-2026-005', 'Nefes', 'Ayşe Yılmaz', 'WhatsApp', '2026-09-12', '2026-09-15', 3, 12, 38000, 0, 0, 38000, 12667, 'Onaylandı', 'Voleybol filesi kurulacak'],
    ['REZ-2026-006', 'Seyir', 'Cemil Öz', 'Instagram', '2026-09-15', '2026-09-18', 3, 6, 24000, 0, 0, 24000, 8000, 'Onaylandı', 'Direkt rezervasyon'],
    ['REZ-2026-007', 'Zirve', 'Burak Tan', 'WhatsApp', '2026-09-18', '2026-09-21', 3, 8, 45000, 0, 0, 45000, 15000, 'Onaylandı', 'Peşin havale'],
    ['REZ-2026-008', 'Seyir', 'Ali Kemal', 'Airbnb', '2026-09-29', '2026-10-03', 4, 6, 40000, 6000, 2000, 32000, 8000, 'Onaylandı', 'Split Month (2 Eyl + 2 Eki)']
  ];

  sampleBookings.forEach((b, idx) => {
    const row = wsRes.addRow(b);
    row.font = fontNormal;
    if (idx % 2 === 1) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
    }
  });

  // =========================================================================
  // 3. LEAD CRM SHEET (03_LEAD_CRM)
  // =========================================================================
  const wsLeads = workbook.addWorksheet('03_LEAD_CRM', { views: [{ showGridLines: true }] });
  wsLeads.columns = [
    { header: 'Lead ID', key: 'id', width: 12 },
    { header: 'Tarih', key: 'date', width: 14 },
    { header: 'Misafir', key: 'guest', width: 18 },
    { header: 'İlgilenilen Villa', key: 'villa', width: 16 },
    { header: 'Kanal', key: 'channel', width: 14 },
    { header: 'Talep Tarihleri', key: 'dates', width: 22 },
    { header: 'Teklif Tutarı (₺)', key: 'quote', width: 16 },
    { header: 'Durum', key: 'status', width: 16 },
    { header: 'Kayıp Nedeni', key: 'lostReason', width: 20 },
    { header: 'Sonraki Aksiyon / Not', key: 'notes', width: 28 }
  ];

  const leadHeaderRow = wsLeads.getRow(1);
  leadHeaderRow.font = fontHeader;
  leadHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerDark } };

  const sampleLeads = [
    ['LEAD-001', '2026-09-01', 'Hakan Demir', 'Seyir', 'Airbnb', '01-04 Eylül', 28000, 'Rezervasyon', '-', 'Onaylandı (REZ-001)'],
    ['LEAD-002', '2026-09-02', 'Murat Kaya', 'Doğuş', 'WhatsApp', '03-06 Eylül', 36000, 'Rezervasyon', '-', 'Direkt kapatıldı'],
    ['LEAD-003', '2026-09-04', 'Selin B.', 'Zirve', 'Instagram', '25-28 Eylül', 45000, 'Follow-up', '-', 'Bütçe istişaresi yapıyor'],
    ['LEAD-004', '2026-09-05', 'Kemal V.', 'Şirin', 'WhatsApp', '18-20 Eylül', 18000, 'Kaybedildi', 'Fiyat Yüksek', 'Başka otele gitti'],
    ['LEAD-005', '2026-09-05', 'Derya S.', 'Nefes', 'Telefon', '02-04 Ekim', 35000, 'Teklif Verildi', '-', 'Tarih teyidi bekleniyor']
  ];

  sampleLeads.forEach((l, idx) => {
    const row = wsLeads.addRow(l);
    row.font = fontNormal;
    if (idx % 2 === 1) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
    }
  });

  // =========================================================================
  // 4. MAINTENANCE & INVESTMENTS SHEET (04_BAKIM_VE_YATIRIM)
  // =========================================================================
  const wsMaint = workbook.addWorksheet('04_BAKIM_VE_YATIRIM', { views: [{ showGridLines: true }] });
  wsMaint.columns = [
    { header: 'İş ID', key: 'id', width: 10 },
    { header: 'Villa', key: 'villa', width: 14 },
    { header: 'Yapılacak İş / Sorun', key: 'title', width: 28 },
    { header: 'İş Türü', key: 'type', width: 14 },
    { header: 'Öncelik', key: 'priority', width: 10 },
    { header: 'Durum', key: 'status', width: 14 },
    { header: 'Sorumlu', key: 'assignee', width: 16 },
    { header: 'Tahmini Maliyet (₺)', key: 'estCost', width: 18 },
    { header: 'Gerçek Maliyet (₺)', key: 'actCost', width: 18 },
    { header: 'Downtime (Gece)', key: 'downtime', width: 16 },
    { header: 'Öncelik Skoru', key: 'score', width: 14 },
    { header: 'Aksiyon Tavsiyesi', key: 'action', width: 18 }
  ];

  const maintHeaderRow = wsMaint.getRow(1);
  maintHeaderRow.font = fontHeader;
  maintHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerDark } };

  const sampleTasks = [
    ['TSK-001', 'Doğuş', 'Isı Pompası Sensör Değişimi', 'Isıtma', 'P1', 'Devam Ediyor', 'Ahmet Usta', 4500, 0, 1, 4.8, 'Hemen Yap'],
    ['TSK-002', 'Zirve', 'Jakuzi Filtre ve Ozon Bakımı', 'Tesisat', 'P2', 'Tamamlandı', 'Teknik Servis', 2800, 2800, 0, 3.6, 'Bu Ay Yap'],
    ['TSK-003', 'Seyir', 'Şömine Bacası Temizliği', 'Güvenlik', 'P2', 'Planlandı', 'Mehmet', 1500, 0, 0, 3.4, 'Bu Ay Yap'],
    ['TSK-004', 'Şirin', 'Teras Korkuluk Boyası', 'Dekorasyon', 'P3', 'Beklemede', 'İç Ekip', 8000, 0, 0, 1.6, 'Yapma / Beklet'],
    ['TSK-005', 'Nefes', 'Voleybol Sahası Tel Örgü', 'Bahçe', 'P3', 'Planlandı', 'Dış Usta', 12000, 0, 0, 2.1, 'Sonra Değerlendir']
  ];

  sampleTasks.forEach((t, idx) => {
    const row = wsMaint.addRow(t);
    row.font = fontNormal;
    if (idx % 2 === 1) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
    }
  });

  // =========================================================================
  // 5. GOALS & DECISIONS SHEET (05_KARARLAR_VE_HEDEFLER)
  // =========================================================================
  const wsGoals = workbook.addWorksheet('05_KARARLAR_VE_HEDEFLER', { views: [{ showGridLines: true }] });
  wsGoals.columns = [
    { header: 'No', key: 'id', width: 6 },
    { header: 'Toplantı Tarihi', key: 'date', width: 14 },
    { header: 'Alınan Karar / Proje', key: 'title', width: 34 },
    { header: 'Sorumlu', key: 'owner', width: 16 },
    { header: 'Termin', key: 'deadline', width: 14 },
    { header: 'Bütçe (₺)', key: 'budget', width: 14 },
    { header: 'Etkilenen KPI', key: 'kpi', width: 20 },
    { header: 'Durum', key: 'status', width: 14 },
    { header: 'Sonuç / Çıktı', key: 'result', width: 24 }
  ];

  const goalsHeaderRow = wsGoals.getRow(1);
  goalsHeaderRow.font = fontHeader;
  goalsHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerDark } };

  const sampleGoals = [
    [1, '2026-09-01', 'Direkt Rezervasyon Teşvik Kampanyası (WhatsApp karşılama hediyesi)', 'Satış Ekibi', '2026-09-20', 5000, 'Direct Booking %', 'Devam Ediyor', 'Direkt payı %43\'ten %50\'ye çıktı'],
    [2, '2026-09-01', 'Zirve Villası Gece Jakuzi Aydınlatma ve Fotoğraf Çekimi', 'Pazarlama', '2026-09-25', 12000, 'ADR / Premium Rate', 'Planlandı', 'Fotoğrafçı randevusu alındı'],
    [3, '2026-09-01', 'Şirin Villası İptal Oranını Düşürmek İçin Kural Esnetme', 'Operasyon', '2026-09-10', 0, 'Occupancy %', 'Tamamlandı', 'Esnek iptal açıldı']
  ];

  sampleGoals.forEach((g, idx) => {
    const row = wsGoals.addRow(g);
    row.font = fontNormal;
    if (idx % 2 === 1) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
    }
  });

  // =========================================================================
  // 6. MASTER PARAMETERS SHEET (_PARAMETRELER)
  // =========================================================================
  const wsParams = workbook.addWorksheet('_PARAMETRELER', { views: [{ showGridLines: true }] });
  wsParams.columns = [
    { header: 'Villa Kodu', key: 'code', width: 12 },
    { header: 'Villa Adı', key: 'name', width: 14 },
    { header: 'Kapasite', key: 'pax', width: 12 },
    { header: 'Pist Mesafe (Dk)', key: 'dist', width: 16 },
    { header: 'Floor Rate (₺)', key: 'floor', width: 14 },
    { header: 'Base Rate (₺)', key: 'base', width: 14 },
    { header: 'Target Rate (₺)', key: 'target', width: 14 },
    { header: 'Premium Rate (₺)', key: 'premium', width: 16 },
    { header: 'Peak Rate (₺)', key: 'peak', width: 14 },
    { header: 'Temizlik Maliyeti (₺)', key: 'cleanCost', width: 18 },
    { header: 'Günlük Isıtma (₺)', key: 'heatCost', width: 16 }
  ];

  const paramsHeaderRow = wsParams.getRow(1);
  paramsHeaderRow.font = fontHeader;
  paramsHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subHeader } };

  const paramRows = [
    ['SEYIR', 'Seyir', '6+2', 30, 3500, 4500, 6000, 8500, 12000, 800, 350],
    ['DOGUS', 'Doğuş', '11', 19, 5000, 6500, 9000, 13000, 18000, 1200, 500],
    ['ZIRVE', 'Zirve', '9', 15, 6500, 8500, 12000, 16500, 24000, 1500, 700],
    ['SIRIN', 'Şirin', '7', 34, 3000, 4000, 5500, 7500, 11000, 750, 300],
    ['NEFES', 'Nefes', '12', 34, 5500, 7000, 9500, 14000, 19000, 1400, 550]
  ];

  paramRows.forEach(p => {
    const row = wsParams.addRow(p);
    row.font = fontNormal;
  });

  // Save workbook
  const outputPath = path.join(__dirname, '..', 'Lexbnb_Portfoy_Raporu.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`[SUCCESS] Excel Workbook generated: ${outputPath}`);
}

buildWorkbook().catch(err => {
  console.error('[ERROR] Generating workbook:', err);
  process.exit(1);
});
