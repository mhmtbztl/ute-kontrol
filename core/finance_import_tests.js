// =============================================================================
// LEXBNB PHASE 8 — FINANCE IMPORT TESTS (CSV / EXCEL PIPELINE)
// =============================================================================

const assert = require('assert');
const {
  computeHash,
  parseCSV,
  autoDetectColumnMap,
  validateImportRows
} = require('./finance_import_engine');

console.log('=============================================================================');
console.log('📥 LEXBNB PHASE 8 — FINANCE IMPORT PIPELINE TEST SUITE');
console.log('=============================================================================');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}\n`);
    throw err;
  }
}

// -------------------------------------------------------------
// TEST 1: CSV Parsing with Comma and Semicolon Delimiters
// -------------------------------------------------------------
runTest('1. CSV Parsing: Parses comma and semicolon delimited text accurately', () => {
  const csvComma = `Tarih,Kategori,Tutar,Açıklama,Ev\n2026-08-01,Elektrik,3500,"Ağustos faturası",Villa Bella Vista`;
  const parsed1 = parseCSV(csvComma);
  assert.strictEqual(parsed1.headers.length, 5);
  assert.strictEqual(parsed1.rows.length, 1);
  assert.strictEqual(parsed1.rows[0]['Tarih'], '2026-08-01');
  assert.strictEqual(parsed1.rows[0]['Tutar'], '3500');

  const csvSemi = `Tarih;Kategori;Tutar;Açıklama\n2026-08-05;İnternet;850;Aylık fiber`;
  const parsed2 = parseCSV(csvSemi);
  assert.strictEqual(parsed2.headers.length, 4);
  assert.strictEqual(parsed2.rows.length, 1);
  assert.strictEqual(parsed2.rows[0]['Kategori'], 'İnternet');
  assert.strictEqual(parsed2.rows[0]['Tutar'], '850');
});

// -------------------------------------------------------------
// TEST 2: Header Auto-Detection
// -------------------------------------------------------------
runTest('2. Header Auto-Detection: Maps Turkish and English headers to standard fields', () => {
  const headers = ['Tarih', 'Gider Kategorisi', 'Tutar', 'Açıklama', 'Villa', 'Gider Tipi'];
  const map = autoDetectColumnMap(headers);
  assert.strictEqual(map.date, 'Tarih');
  assert.strictEqual(map.category, 'Gider Kategorisi');
  assert.strictEqual(map.amount, 'Tutar');
  assert.strictEqual(map.description, 'Açıklama');
  assert.strictEqual(map.property, 'Villa');
  assert.strictEqual(map.expenseType, 'Gider Tipi');
});

// -------------------------------------------------------------
// TEST 3: Validation of Valid and Malformed Rows
// -------------------------------------------------------------
runTest('3. Row Validation: Separates valid rows from malformed dates, amounts, and categories', () => {
  const rows = [
    { date: '2026-08-10', category: 'Temizlik', amount: '1500', desc: 'Genel temizlik', property: 'Villa Bella Vista' },
    { date: 'gecersiz-tarih', category: 'Elektrik', amount: '2000', desc: 'Hatalı', property: 'Villa Bella Vista' }, // Invalid date
    { date: '2026-08-12', category: 'Su', amount: '-500', desc: 'Negatif tutar', property: 'Villa Bella Vista' },     // Invalid amount
    { date: '2026-08-14', category: '', amount: '800', desc: 'Kategori boş', property: 'Villa Bella Vista' }          // Empty category
  ];

  const columnMap = {
    date: 'date',
    category: 'category',
    amount: 'amount',
    description: 'desc',
    property: 'property'
  };

  const context = {
    properties: [{ id: 'PROP-BELLA', slug: 'bella', name: 'Villa Bella Vista' }]
  };

  const report = validateImportRows(rows, columnMap, context);
  assert.strictEqual(report.totalRows, 4);
  assert.strictEqual(report.validCount, 1, 'Only 1 row must be valid');
  assert.strictEqual(report.invalidCount, 3, '3 rows must be invalid');
  assert.strictEqual(report.totalAmount, 1500);
});

// -------------------------------------------------------------
// TEST 4: Foreign Tenant Property Mapping Rejection
// -------------------------------------------------------------
runTest('4. Foreign Property Rejection: Row referencing unowned property is rejected in validation', () => {
  const rows = [
    { date: '2026-08-10', category: 'Bakım', amount: '2500', property: 'Yabancı Villa' }
  ];

  const columnMap = {
    date: 'date', category: 'category', amount: 'amount', property: 'property'
  };

  const context = {
    properties: [{ id: 'PROP-OWNED', slug: 'kendi-villam', name: 'Kendi Villam' }]
  };

  const report = validateImportRows(rows, columnMap, context);
  assert.strictEqual(report.validCount, 0);
  assert.strictEqual(report.invalidCount, 1);
  assert(report.errors[0].errors.some(e => e.includes('Mülk bulunamadı')));
});

// -------------------------------------------------------------
// TEST 5: File-Level Hash Calculation and Batch Idempotency
// -------------------------------------------------------------
runTest('5. File Hash & Idempotency: Generates consistent sha256 hash for duplicate batch detection', () => {
  const fileContent = 'Tarih,Tutar,Kategori\n2026-08-01,1000,Yemek';
  const hash1 = computeHash(fileContent);
  const hash2 = computeHash(fileContent);
  assert.strictEqual(hash1, hash2, 'Hash must be strictly deterministic');
  assert(hash1.length >= 32, 'Hash must have valid length');

  const differentContent = 'Tarih,Tutar,Kategori\n2026-08-01,1000,Ulaşım';
  const hash3 = computeHash(differentContent);
  assert.notStrictEqual(hash1, hash3, 'Different file contents must produce different hashes');
});

// -------------------------------------------------------------
// TEST 6: Legitimate Separate Records vs File Duplicate
// -------------------------------------------------------------
runTest('6. Duplicate Rows vs Re-upload: Allows legitimate separate transactions of same amount on same day', () => {
  // Two distinct taxi/meal expenses of ₺250 on the same date with different descriptions
  const rows = [
    { date: '2026-08-15', category: 'Ulaşım', amount: '250', desc: 'Sabah Taksi' },
    { date: '2026-08-15', category: 'Ulaşım', amount: '250', desc: 'Akşam Taksi' },
    // Exact duplicate row
    { date: '2026-08-15', category: 'Ulaşım', amount: '250', desc: 'Sabah Taksi' }
  ];

  const columnMap = { date: 'date', category: 'category', amount: 'amount', description: 'desc' };
  const report = validateImportRows(rows, columnMap, {});

  assert.strictEqual(report.validCount, 3, 'All 3 rows have valid data');
  assert.strictEqual(report.duplicateCount, 1, 'Exactly 1 row is flagged as potential duplicate');
});

console.log(`\n=============================================================================`);
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
console.log(`=============================================================================\n`);
