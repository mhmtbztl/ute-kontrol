// =============================================================================
// LEXBNB — EXCEL ICE AKTARMA AYRISTIRICISI (L-162)
// SheetJS ayristirmasi ana is parcaciginda calisiyordu: hazirlanmis sikistirilmis
// bir dosya sekmeyi dondurabiliyordu. Bu dosya iki yerde calisir:
//   - Web Worker olarak (app.js buildImportSourceAsync): ayristirma arka planda,
//     sure asilirsa worker sonlandirilir ve sekme donmaz.
//   - Modul olarak (Worker yoksa ana sayfa, Node testleri): ayni parse().
// Tek kaynak: app.js'in senkron yolu da bu fonksiyonu cagirir.
// =============================================================================
(function (root) {
  'use strict';

  // Yalniz ilk sayfa ve siniri bir satir asacak kadar okunur: SheetJS'in
  // butun dosyayi bellege acmasina izin verilmez.
  function parse(XLSX, bytes, maxRows) {
    const wb = XLSX.read(bytes, { type: 'array', cellDates: true, sheets: 0, sheetRows: maxRows + 2 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = ws ? XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }) : [];
    const sheetNames = (wb.SheetNames || []).slice();
    if (rows.length > maxRows) return { rowCount: rows.length, sheetNames, headers: [], rows: [] };
    // Basliklar ilk satirdan okunur (L-278): yalniz baslik satiri olan dosyada
    // satir yok, Object.keys bos donuyordu.
    const ilkSatir = ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })[0] || []) : [];
    const basliklar = ilkSatir.map(h => String(h == null ? '' : h).trim()).filter(Boolean);
    return {
      rowCount: rows.length,
      sheetNames,
      headers: basliklar.length ? basliklar : (rows.length ? Object.keys(rows[0]) : []),
      rows
    };
  }

  const api = { parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.LexbnbXlsxImport = api;

  const isWorker = typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope;
  if (isWorker) {
    root.onmessage = event => {
      const { xlsxUrl, bytes, maxRows } = event.data || {};
      try {
        if (typeof root.XLSX === 'undefined') root.importScripts(xlsxUrl);
        root.postMessage({ ok: true, ...parse(root.XLSX, bytes, maxRows) });
      } catch (err) {
        root.postMessage({ ok: false, message: (err && err.message) || 'Excel dosyası okunamadı.' });
      }
    };
  }
})(typeof self !== 'undefined' ? self : globalThis);
