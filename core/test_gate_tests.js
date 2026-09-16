/**
 * LEXBNB — CANLI TEST KAPISI DENETIMI
 *
 * Bu suit, veritabanina dokunan testlerin nereye yazdigini korur. Olctugu
 * seyler tercih degil, yasanmis hatalarin agi:
 *
 *  - 22 suit .env'i kendi basina, uc ayri bicimde okuyordu; hedefi degistirmenin
 *    tek yolu dosyayi elle takas etmekti. Yani varsayilan hedef URETIMDI ve
 *    CLAUDE.md 5.4'teki 525 artik test hesabi boyle birikti.
 *  - Kosucunun canli/cevrimdisi ayrimi kaba bir metin taramasiydi
 *    (source.includes('SUPABASE_SERVICE_ROLE_KEY')). Worker giris noktasi
 *    suitleri o dizgiyi kendi assert.match(...) iddialarinin ICINDE tasidigi
 *    icin, hicbir baglanti acmadiklari halde 8 cevrimdisi suit guvenli kosudan
 *    atiliyordu — CI'da sessizce kapsam disi kaliyorlardi.
 *  - Kara liste yoktu: SUPABASE_URL ile TEST_SUPABASE_URL'in ikisini birden
 *    uretim ref'iyle doldurmak mumkundu.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CORE = __dirname;
const testEnv = require('./test_env.js');

let passed = 0;
let failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d || 'kosul saglanmadi');

const GATE_REQUIRE = /require\((['"])\.\/test_env\.js\1\)/;
const CLIENT_REQUIRE = /require\((['"])@supabase\/supabase-js\1\)/;

/**
 * Yorum satirlarini atar. Bu dosyanin ve test_env.js'in kendi aciklamalari
 * yasakladiklari kalibi ORNEK OLARAK iceriyor; yorumlari taramak, dogru yazilmis
 * kodu kendi belgelendirmesi yuzunden kirmizi gosterirdi.
 */
function codeOnly(source) {
  return source.split(/\r?\n/)
    .filter(line => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
}

const readSuite = file => codeOnly(fs.readFileSync(path.join(CORE, file), 'utf8'));

function suiteFiles() {
  const runner = fs.readFileSync(path.join(ROOT, 'run_all_tests.js'), 'utf8');
  const block = runner.match(/const allTestFiles = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error('run_all_tests.js icindeki allTestFiles listesi okunamadi');
  return [...block[1].matchAll(/'([^']+\.js)'/g)].map(m => m[1]);
}

/** Kapiyi belirli bir ortamla cocuk surecte calistirir; hata mesajini dondurur. */
function runGate(envOverrides, envFileContent) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexbnb-gate-'));
  const envFile = path.join(dir, 'env.test');
  fs.writeFileSync(envFile, envFileContent || '', 'utf8');
  const childEnv = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    LEXBNB_ENV_FILE: envFile,
    ...envOverrides
  };
  try {
    const out = execFileSync(
      process.execPath,
      ['-e',
        // Kapinin DONDURDUGU degerleri bas: yalnizca "hata verdi mi" bakmak,
        // degeri temizleyen bir duzeltmeyi olcemez.
        "const e = require(process.argv[1]).loadTestEnv();" +
        "console.log('OK ' + JSON.stringify({ url: e.SUPABASE_URL, anon: e.SUPABASE_ANON_KEY || '' }));",
        path.join(CORE, 'test_env.js')],
      { env: childEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return { ok: true, output: out.trim() };
  } catch (err) {
    return { ok: false, output: String(err.stderr || err.stdout || err.message) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const FAKE_TEST_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const FAKE_TEST_HOST = 'abcdefghijklmnopqrst.supabase.co';
const PRODUCTION_URL = `https://${testEnv.PRODUCTION_PROJECT_REFS[0]}.supabase.co`;

console.log('=============================================================================');
console.log('🚪 LEXBNB — CANLI TEST KAPISI DENETIMI');
console.log('=============================================================================');

try {
  // ---------------------------------------------------------------------------
  // 1-3. Kaynak taramasi: kapiyi atlayan suit kalmamali.
  // ---------------------------------------------------------------------------
  const files = suiteFiles();
  const ungated = files.filter(f => {
    const s = readSuite(f);
    return CLIENT_REQUIRE.test(s) && !GATE_REQUIRE.test(s);
  });
  check(ungated.length === 0,
    'Supabase istemcisi yaratan her suit core/test_env.js kapisindan geciyor',
    `kapidan gecmeyenler: ${ungated.join(', ')}`);

  const directEnvReaders = fs.readdirSync(CORE)
    .filter(f => f.endsWith('.js') && f !== 'test_env.js')
    .filter(f => /readFileSync\(\s*(?:'\.env'|"\.env"|envPath|path\.(?:join|resolve)\([^)]*\.env)/.test(readSuite(f)));
  check(directEnvReaders.length === 0,
    'Hicbir suit .env dosyasini kendi basina okumuyor',
    `dogrudan okuyanlar: ${directEnvReaders.join(', ')}`);

  const cwdRelativeReaders = fs.readdirSync(CORE)
    .filter(f => f.endsWith('.js'))
    .filter(f => /readFileSync\(\s*['"]\.env['"]/.test(readSuite(f)));
  check(cwdRelativeReaders.length === 0,
    'Hicbir suit env dosyasini calisma dizinine gore okumuyor',
    `calisma dizinine bagimli: ${cwdRelativeReaders.join(', ')}`);

  // ---------------------------------------------------------------------------
  // 4. Kara liste, istemcinin gercekten kullandigi projeyle ayni olmali.
  //    Uretim baska bir projeye tasinirsa kara liste sessizce eskimemeli.
  // ---------------------------------------------------------------------------
  const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const defaultUrl = appSource.match(/const DEFAULT_SUPABASE_URL\s*=\s*'([^']+)'/);
  check(!!defaultUrl, 'app.js icinde DEFAULT_SUPABASE_URL bulundu', 'sabit bulunamadi');
  if (defaultUrl) {
    const appRef = testEnv.projectRefOf(new URL(defaultUrl[1]).hostname);
    check(testEnv.PRODUCTION_PROJECT_REFS.includes(appRef),
      'Kara liste, app.js icindeki uretim projesini kapsiyor',
      `app.js: ${appRef} / kara liste: ${testEnv.PRODUCTION_PROJECT_REFS.join(', ')}`);
  }

  // ---------------------------------------------------------------------------
  // 5. Kosucunun siniflandirmasi kaba metin taramasi olmamali.
  // ---------------------------------------------------------------------------
  const runnerSource = codeOnly(fs.readFileSync(path.join(ROOT, 'run_all_tests.js'), 'utf8'));
  check(!runnerSource.includes("source.includes('SUPABASE_SERVICE_ROLE_KEY')"),
    'Kosucu canli suitleri kaba dizgi taramasiyla secmiyor',
    'eski heuristik hala yerinde — worker giris noktasi suitleri yine atlanir');

  // Worker giris noktasi suitleri: hicbir baglanti acmazlar, guvenli kosudadir.
  const OFFLINE_SOURCE_SCANNERS = [
    'photo_analysis_worker_entrypoint_tests.js',
    'marketing_experiment_worker_entrypoint_tests.js',
    'seasonal_marketing_worker_entrypoint_tests.js',
    'marketing_health_worker_entrypoint_tests.js',
    'marketing_health_source_entrypoint_tests.js',
    'marketing_funnel_worker_entrypoint_tests.js',
    'marketing_economics_worker_entrypoint_tests.js',
    'marketing_scheduler_tests.js'
  ];
  const wronglyLive = OFFLINE_SOURCE_SCANNERS.filter(f => {
    const s = readSuite(f);
    return GATE_REQUIRE.test(s) || CLIENT_REQUIRE.test(s);
  });
  check(wronglyLive.length === 0,
    'Worker giris noktasi suitleri cevrimdisi kaliyor (kaynak tarayicilar)',
    `canli sayilanlar: ${wronglyLive.join(', ')}`);

  // Bu suitin kendisi cevrimdisi kalmali. Kapiyi require ediyor ama hicbir
  // baglanti acmiyor; canli sayilsaydi guvenli kosudan atlanir, yani kapinin
  // tek denetimi CI'da HIC calismazdi.
  check(!CLIENT_REQUIRE.test(readSuite('test_gate_tests.js')),
    'Kapi denetim suiti cevrimdisi kaliyor (guvenli kosuda ve CI\'da calisir)',
    'test_gate_tests.js Supabase istemcisini require ediyor — canli sayilir ve atlanir');

  check(files.includes('test_gate_tests.js'),
    'Kapi denetim suiti kosucunun listesine kayitli',
    'run_all_tests.js icindeki allTestFiles listesinde yok');

  // ---------------------------------------------------------------------------
  // 6-10. Kapinin davranisi.
  // ---------------------------------------------------------------------------
  const noFlag = runGate({}, `SUPABASE_URL=${FAKE_TEST_URL}\nTEST_SUPABASE_URL=${FAKE_TEST_URL}\n`);
  check(!noFlag.ok && /LEXBNB_ALLOW_DESTRUCTIVE_TESTS/.test(noFlag.output),
    'Kapi, yetki bayragi olmadan canli suiti calistirmiyor',
    noFlag.output.slice(0, 200));

  const mismatch = runGate(
    { LEXBNB_ALLOW_DESTRUCTIVE_TESTS: '1', LEXBNB_CONFIRM_REMOTE_TEST_PROJECT: FAKE_TEST_HOST },
    `SUPABASE_URL=${FAKE_TEST_URL}\nTEST_SUPABASE_URL=https://baska.supabase.co\n`);
  check(!mismatch.ok && /TEST_SUPABASE_URL/.test(mismatch.output),
    'Kapi, beyan edilmemis bir hedefi reddediyor',
    mismatch.output.slice(0, 200));

  // Kritik iddia: uretim reddi ONAY DEGISKENIYLE ASILAMAZ. Asilabilseydi
  // koruma, tam da korumasi gereken durumda (yanlis dosyayla kosma) ise yaramazdi.
  const productionHost = new URL(PRODUCTION_URL).hostname;
  const production = runGate(
    { LEXBNB_ALLOW_DESTRUCTIVE_TESTS: '1', LEXBNB_CONFIRM_REMOTE_TEST_PROJECT: productionHost },
    `SUPABASE_URL=${PRODUCTION_URL}\nTEST_SUPABASE_URL=${PRODUCTION_URL}\n`);
  check(!production.ok && /uretim projesi hedeflenemez/.test(production.output),
    'Kapi, tum degiskenler uretimi gosterse bile uretimi reddediyor',
    production.output.slice(0, 300));

  const unconfirmed = runGate(
    { LEXBNB_ALLOW_DESTRUCTIVE_TESTS: '1' },
    `SUPABASE_URL=${FAKE_TEST_URL}\nTEST_SUPABASE_URL=${FAKE_TEST_URL}\n`);
  check(!unconfirmed.ok && /LEXBNB_CONFIRM_REMOTE_TEST_PROJECT/.test(unconfirmed.output),
    'Kapi, uzak bir projenin hostname onayini zorunlu tutuyor',
    unconfirmed.output.slice(0, 200));

  // ---------------------------------------------------------------------------
  // CI secret'ina kacan satir sonu. 2026-09-16'da tam olarak bu oldu: anon
  // anahtarinin sonundaki '\n' apikey basligina girdi, fetch "invalid header
  // value" dedi, 20'ye yakin suit "Cannot read properties of null" ile dustu ve
  // yarim kalanlar temizlik yapamadan 4 hesap sizdirdi. Hicbir mesaj sorunun
  // anahtarda oldugunu soylemiyordu — GitHub degeri maskeledigi icin gormek de
  // mumkun degildi.
  // ---------------------------------------------------------------------------
  const trailingNewline = runGate(
    {
      LEXBNB_ALLOW_DESTRUCTIVE_TESTS: '1',
      LEXBNB_CONFIRM_REMOTE_TEST_PROJECT: FAKE_TEST_HOST,
      SUPABASE_ANON_KEY: 'anahtar-degeri\n'
    },
    `SUPABASE_URL=${FAKE_TEST_URL}\nTEST_SUPABASE_URL=${FAKE_TEST_URL}\n`);
  const trimmedAnon = trailingNewline.ok
    && JSON.parse(trailingNewline.output.replace(/^OK /, '')).anon === 'anahtar-degeri';
  check(trimmedAnon,
    'Kapi, anahtarin sonuna kacan satir sonunu KIRPARAK donduruyor',
    trailingNewline.output.slice(0, 250));

  const interiorNewline = runGate(
    {
      LEXBNB_ALLOW_DESTRUCTIVE_TESTS: '1',
      LEXBNB_CONFIRM_REMOTE_TEST_PROJECT: FAKE_TEST_HOST,
      SUPABASE_ANON_KEY: 'anahtarin\nortasinda-satir-sonu'
    },
    `SUPABASE_URL=${FAKE_TEST_URL}\nTEST_SUPABASE_URL=${FAKE_TEST_URL}\n`);
  check(!interiorNewline.ok && /SUPABASE_ANON_KEY icinde satir sonu/.test(interiorNewline.output),
    'Kapi, anahtarin ICINDE satir sonu varsa degiskeni adiyla soyleyerek duruyor',
    interiorNewline.output.slice(0, 250));

  const accepted = runGate(
    { LEXBNB_ALLOW_DESTRUCTIVE_TESTS: '1', LEXBNB_CONFIRM_REMOTE_TEST_PROJECT: FAKE_TEST_HOST },
    `SUPABASE_URL=${FAKE_TEST_URL}\nTEST_SUPABASE_URL=${FAKE_TEST_URL}\n`);
  check(accepted.ok && accepted.output.includes(FAKE_TEST_URL),
    'Kapi, acikca beyan edilmis ve onaylanmis test projesini kabul ediyor',
    accepted.output.slice(0, 300));

  // ---------------------------------------------------------------------------
  // 11-12. Bootstrap betigi uretim semasina dokunamaz.
  // ---------------------------------------------------------------------------
  const bootstrapPath = path.join(ROOT, 'scripts', 'bootstrap_test_project.js');
  check(fs.existsSync(bootstrapPath),
    'Test projesi bootstrap betigi mevcut', 'scripts/bootstrap_test_project.js yok');

  if (fs.existsSync(bootstrapPath)) {
    let bootstrapOutput = '';
    try {
      execFileSync(process.execPath, [bootstrapPath, '--check'], {
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          LEXBNB_ENV_FILE: 'nonexistent.env',
          TEST_SUPABASE_URL: PRODUCTION_URL,
          TEST_DATABASE_URL: `postgresql://postgres.${testEnv.PRODUCTION_PROJECT_REFS[0]}:x@aws-0-eu.pooler.supabase.com:5432/postgres`
        },
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
      });
      bootstrapOutput = 'BETIK HATA VERMEDI';
    } catch (err) {
      bootstrapOutput = String(err.stdout || '') + String(err.stderr || '');
    }
    check(/uretim projesi hedeflenemez/.test(bootstrapOutput),
      'Bootstrap betigi uretim projesine sema uygulamayi reddediyor',
      bootstrapOutput.slice(0, 300));

    // ---------------------------------------------------------------------------
    // 13-14. BOM tuzagi: schema.sql ve uc goc dosyasi UTF-8 BOM ile basliyor.
    // BOM oldugu gibi gonderilirse Postgres ilk ifadeyi sozdizimi hatasiyla
    // reddeder — yani test projesi HIC kurulamaz. Dosyalardan silinemez, cunku
    // manifest hash'leri BOM dahil metin uzerinden uretildi ve gocler degismez.
    // ---------------------------------------------------------------------------
    const bootstrap = require(bootstrapPath);
    const bomFiles = bootstrap.plannedFiles()
      .filter(entry => bootstrap.canonicalSql(entry.file).startsWith('﻿'))
      .map(entry => entry.file);
    check(bomFiles.length > 0,
      'BOM ile baslayan SQL dosyalari hala mevcut (tuzak gecerli)',
      'BOM kalmamis — bu iddia artik bir sey olcmuyor, kaldirilabilir');

    const stripped = bomFiles.every(f => !bootstrap.executableSql(bootstrap.canonicalSql(f)).startsWith('﻿'));
    check(stripped,
      'Bootstrap, calistirdigi SQL\'den BOM\'u ayikliyor',
      `BOM tasiyan dosyalar: ${bomFiles.join(', ')}`);

    // Hash hala BOM dahil metin uzerinden — manifest zinciri bozulmamali.
    const manifestOk = bootstrap.plannedFiles()
      .filter(e => e.sha256)
      .every(e => bootstrap.digestOf(bootstrap.canonicalSql(e.file)) === e.sha256);
    check(manifestOk,
      'Bootstrap hash\'leri manifest ile birebir tutuyor (BOM ayiklama hash\'i bozmuyor)',
      'bir gocun hash\'i manifestle uyusmuyor');
  }
} finally {
  // CLAUDE.md 5.2: ozet ve cikis kodu finally icinde olmali; try icindeki bir
  // return bu satirlari atlar ve suit hatali oldugu halde 0 ile cikar.
  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED`);
  console.log('=============================================================================');
  if (failed > 0) process.exit(1);
}
