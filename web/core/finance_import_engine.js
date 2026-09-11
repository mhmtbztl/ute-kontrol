// =============================================================================
// LEXBNB PHASE 8 — FINANCE IMPORT ENGINE (CSV & EXCEL)
// Multi-step pipeline: Parse -> Preview -> Map -> Validate -> Idempotency Check -> Commit
// =============================================================================

const crypto = typeof require !== 'undefined' ? require('crypto') : null;

function computeHash(content) {
  if (crypto) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
  // Browser fallback simple djb2 / sha representation
  let hash = 0;
  const str = String(content);
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'hash_' + Math.abs(hash).toString(16);
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detect delimiter (, or ;)
  const firstLine = lines[0];
  const delimiter = firstLine.includes(';') ? ';' : ',';

  function parseLine(line) {
    const values = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === delimiter && !inQuotes) {
        values.push(cur.trim().replace(/^"|"$/g, ''));
        cur = '';
      } else {
        cur += c;
      }
    }
    values.push(cur.trim().replace(/^"|"$/g, ''));
    return values;
  }

  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    if (vals.length === 0 || (vals.length === 1 && !vals[0])) continue;
    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = vals[idx] || '';
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

/**
 * Auto-detect column mapping based on standard Turkish/English headers
 */
function autoDetectColumnMap(headers = []) {
  const map = {
    date: null,
    category: null,
    amount: null,
    description: null,
    property: null,
    expenseType: null
  };

  headers.forEach(h => {
    const norm = h.toLowerCase().trim();
    if (['tarih', 'date', 'gider tarihi', 'odeme tarihi'].includes(norm)) map.date = h;
    else if (['kategori', 'ktgr', 'category', 'gider kategorisi', 'tur'].includes(norm) && !map.category) map.category = h;
    else if (['tutar', 'amount', 'fiyat', 'bedel', 'harcama'].includes(norm)) map.amount = h;
    else if (['aciklama', 'açıklama', 'description', 'detay', 'not'].includes(norm)) map.description = h;
    else if (['ev', 'villa', 'mulk', 'mülk', 'property'].includes(norm)) map.property = h;
    else if (['gider tipi', 'tip', 'type', 'expense_type'].includes(norm)) map.expenseType = h;
  });

  return map;
}

/**
 * Validate parsed rows against active tenant properties and categories
 */
function validateImportRows(rawRows = [], columnMap = {}, context = {}) {
  const activeProperties = context.properties || [];
  const validPropertyMap = {};
  activeProperties.forEach(p => {
    if (p.id) validPropertyMap[p.id.toLowerCase()] = p.id;
    if (p.slug) validPropertyMap[p.slug.toLowerCase()] = p.id;
    if (p.name) validPropertyMap[p.name.toLowerCase()] = p.id;
  });

  const validatedRows = [];
  const errors = [];
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  let totalAmount = 0;

  const seenFingerprints = new Set();

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 2; // header is row 1
    const dateRaw = (raw[columnMap.date] || '').trim();
    const catRaw = (raw[columnMap.category] || '').trim();
    const amtRaw = (raw[columnMap.amount] || '').toString().trim().replace(/\./g, '').replace(',', '.');
    const descRaw = (raw[columnMap.description] || '').trim();
    const propRaw = (raw[columnMap.property] || '').trim();
    const typeRaw = (raw[columnMap.expenseType] || 'OPEX').toUpperCase().trim();

    const rowErrors = [];

    // 1. Date Validation
    let formattedDate = null;
    if (!dateRaw) {
      rowErrors.push('Tarih boş olamaz.');
    } else {
      // support YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY
      if (/^\d{4}-\d{2}-\d{2}/.test(dateRaw)) {
        formattedDate = dateRaw.substring(0, 10);
      } else if (/^(\d{1,2})[./](\d{1,2})[./](\d{4})/.test(dateRaw)) {
        const m = dateRaw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
        formattedDate = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      } else {
        rowErrors.push(`Geçersiz tarih formatı: "${dateRaw}"`);
      }
    }

    // 2. Amount Validation
    const amount = Number(amtRaw);
    if (isNaN(amount) || amount <= 0) {
      rowErrors.push(`Tutar 0 veya negatif olamaz: "${amtRaw}"`);
    }

    // 3. Category Validation
    if (!catRaw) {
      rowErrors.push('Kategori boş olamaz.');
    }

    // 4. Property Mapping (Optional, but if given, must belong to active tenant)
    let resolvedPropId = null;
    if (propRaw && propRaw !== 'ALL' && propRaw !== 'Genel' && propRaw !== 'Portföy') {
      const matched = validPropertyMap[propRaw.toLowerCase()];
      if (!matched) {
        rowErrors.push(`Mülk bulunamadı veya aktif işletmenize ait değil: "${propRaw}"`);
      } else {
        resolvedPropId = matched;
      }
    }

    // 5. Expense Type
    const expenseType = (typeRaw === 'CAPEX') ? 'CAPEX' : 'OPEX';

    // 6. Row Fingerprint (Internal duplicate check)
    const fp = `${formattedDate}|${amount}|${catRaw.toLowerCase()}|${descRaw.toLowerCase()}|${resolvedPropId || 'portfolio'}`;
    let isPotentialDuplicate = false;
    if (seenFingerprints.has(fp)) {
      isPotentialDuplicate = true;
      duplicateCount++;
    } else {
      seenFingerprints.add(fp);
    }

    const isValid = rowErrors.length === 0;
    if (isValid) {
      validCount++;
      totalAmount += amount;
      validatedRows.push({
        rowNum,
        date: formattedDate,
        category: catRaw,
        amount,
        description: descRaw,
        propertyId: resolvedPropId,
        expenseType,
        isPotentialDuplicate,
        raw
      });
    } else {
      invalidCount++;
      errors.push({
        rowNum,
        errors: rowErrors,
        raw
      });
    }
  });

  return {
    totalRows: rawRows.length,
    validCount,
    invalidCount,
    duplicateCount,
    totalAmount: Math.round(totalAmount * 100) / 100,
    validatedRows,
    errors
  };
}

const FinanceImportEngine = {
  computeHash,
  parseCSV,
  autoDetectColumnMap,
  validateImportRows
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FinanceImportEngine;
}
if (typeof window !== 'undefined') {
  window.FinanceImportEngine = FinanceImportEngine;
}
