const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const app = require(path.join(root, 'app.js'));

let passed = 0;
let failed = 0;

function check(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`[PASS] ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`[FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
}

function getFunctionSource(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  return start >= 0 ? source.slice(start, end >= 0 ? end : source.length) : '';
}

async function run() {
  check(typeof app.paginateRows === 'function', 'Büyük tablolar için kanonik sayfalama yardımcısı var');
  check(typeof app.getActiveRenderPlan === 'function', 'renderAll görünür sekmeye göre iş planı kuruyor');
  check(typeof app.insertImportedRowsInBatches === 'function', 'İçe aktarma için toplu yazma yardımcısı var');

  if (typeof app.paginateRows === 'function') {
    const rows = Array.from({ length: 10000 }, (_, i) => ({ id: i }));
    const samples = [];
    let page;
    for (let i = 0; i < 25; i += 1) {
      const started = process.hrtime.bigint();
      page = app.paginateRows(rows, 50, 100);
      samples.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
    samples.sort((a, b) => a - b);
    const medianMs = samples[Math.floor(samples.length / 2)];
    check(page.rows.length === 100, '10 bin kayıtta DOM adayı 100 satırla sınırlı', `${page.rows.length} satır`);
    check(page.totalPages === 100 && page.totalRows === 10000, 'Sayfalama toplam kayıt ve sayfa sayısını koruyor');
    check(medianMs < 10, '10 bin kayıt sayfalama medyanı ölçülebilir eşik altında', `${medianMs.toFixed(3)} ms`);
  }

  if (typeof app.getActiveRenderPlan === 'function') {
    const plan = app.getActiveRenderPlan('tab-reservations');
    check(plan.includes('renderManageBookingsTable'), 'Rezervasyon sekmesi kendi tablosunu yeniliyor');
    check(!plan.includes('renderFinanceModule') && !plan.includes('renderKPIsAndDashboard'),
      'Rezervasyon kaydı görünmeyen finans ve kokpit zincirini çalıştırmıyor');
  }

  if (typeof app.insertImportedRowsInBatches === 'function') {
    let requestCount = 0;
    const client = {
      from(table) {
        return {
          insert(rows) {
            return {
              async select() {
                requestCount += 1;
                return { data: rows.map(row => ({ ...row })), error: null, table };
              }
            };
          }
        };
      }
    };
    const rows = Array.from({ length: 300 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }));
    const result = await app.insertImportedRowsInBatches(client, 'bookings', rows, 100);
    check(requestCount === 3, '300 satır satır başına değil 100’lük toplu isteklerle yazılıyor', `${requestCount} istek`);
    check(result.rows.length === 300 && result.failures.length === 0, 'Toplu yazma başarılı satırların tamamını döndürüyor');
  }

  const importSource = getFunctionSource('applyImportedData', 'renderKPIsAndDashboard');
  check(!/await\s+createBooking\s*\(/.test(importSource) && !/await\s+createExpense\s*\(/.test(importSource),
    'İçe aktarma satır başına createBooking/createExpense çağırmıyor');
  check(/insertImportedRowsInBatches\s*\(/.test(importSource), 'İçe aktarma toplu yazma yardımcısını kullanıyor');

  console.log(`\n${passed} geçti, ${failed} başarısız`);
  if (failed > 0) process.exit(1);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
