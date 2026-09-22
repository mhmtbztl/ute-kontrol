/**
 * LEXBNB EKIP DAVETI TESLIM DENETIMI
 *
 * 23 Eylul 2026 incelemesi. Worker uretimde her koşuda calisiyordu
 * ({"claimed":0}) ama davet akisinin iki ucu kopuktu:
 *
 *   • Davet edilen adresin Lexbnb hesabi ZATEN varsa `inviteUserByEmail`
 *     "already registered" ile reddeder. Worker bunu siradan bir hata sayip
 *     bes kez FAILED yaziyordu; o kisiye HICBIR e-posta gitmiyordu. Baska bir
 *     isletmede calisan birini ekibe katmak tam olarak bu durumdur.
 *
 *   • Davet linkiyle gelen hesabin sifresi yoktur. Uygulama yalnizca
 *     `#type=recovery` icin sifre formu aciyordu; `#type=invite` oturumu
 *     dogrudan iceri aliyordu. Giris yalnizca e-posta+sifre ile oldugu icin
 *     (CLAUDE.md 3.1) kisi ikinci girisinde iceri giremiyordu.
 *
 * Birinci bolum worker'i sahte istemciyle calistirir (ag yok). Ikinci bolum
 * app.js'teki yonlendirme tespitini sahte `window` ile calistirir.
 */

const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

function sahteIstemci({ inviteError = null, otpError = null } = {}) {
  const calls = { invite: [], otp: [] };
  return {
    calls,
    auth: {
      admin: {
        inviteUserByEmail: async (email, opts) => { calls.invite.push({ email, opts }); return { data: null, error: inviteError }; }
      },
      signInWithOtp: async (args) => { calls.otp.push(args); return { data: null, error: otpError }; }
    }
  };
}

// app.js'ten tek bir fonksiyon govdesini cikarir (sonraki ust duzey
// `function`a kadar) ve verilen window ile degerlendirir.
function yonlendirmeTespiti(app, win) {
  const parca = ad => {
    const bas = app.indexOf(`function ${ad}(`);
    if (bas === -1) return '';
    const son = app.indexOf('\n}', bas);
    return app.slice(bas, son + 2);
  };
  const kod = [parca('getPasswordSetupRedirectType'), parca('isPasswordRecoveryRedirect')].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function('window', 'URLSearchParams',
    `${kod}\nreturn { isPasswordRecoveryRedirect, getType: typeof getPasswordSetupRedirectType === 'function' ? getPasswordSetupRedirectType : null };`
  )(win, URLSearchParams);
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB EKIP DAVETI TESLIM DENETIMI');
  console.log('=============================================================================\n');

  let worker = null;
  try {
    worker = require(path.join(KOK, 'scripts', 'run_invitation_worker.js'));
  } catch (e) {
    no('0. Worker yuklenebiliyor', e.message);
  }
  const deliver = worker && worker.deliverInvitation;
  check(typeof deliver === 'function',
    '1. Worker teslim adimini disari aciyor (cevrimdisi olculebilir)',
    'deliverInvitation export edilmiyor; teslim mantigi yalnizca canli koşuda gorulebilir.');

  // Worker require edilince main() CALISMAMALI: aksi halde bu test uretim
  // kuyrugunu isleyebilirdi. process.exitCode'un bos kalmasi bunun kaniti.
  check(!process.exitCode,
    '2. Worker require edildiginde kuyrugu islemeye kalkmiyor',
    'main() modul yuklenirken calisti (require.main korumasi yok).');

  if (typeof deliver === 'function') {
    const job = { id: 'j1', email: 'yeni@ornek.com', attempts: 1 };
    const url = 'https://lexbnb.space';

    const c1 = sahteIstemci();
    const r1 = await deliver(c1, job, url);
    check(r1.ok && r1.channel === 'invite' && c1.calls.otp.length === 0,
      '3. Yeni adrese davet e-postasi gidiyor, giris linki gonderilmiyor',
      JSON.stringify(r1));
    check(c1.calls.invite[0] && c1.calls.invite[0].opts.redirectTo === url,
      '4. Davet linki LEXBNB_PUBLIC_URL\'e donuyor',
      JSON.stringify(c1.calls.invite));

    const kayitli = { message: 'A user with this email address has already been registered', status: 422, code: 'email_exists' };
    const c2 = sahteIstemci({ inviteError: kayitli });
    const r2 = await deliver(c2, job, url);
    check(r2.ok && r2.channel === 'magiclink',
      '5. Hesabi olan adrese e-posta YINE gidiyor (giris linki)',
      `Sonuc: ${JSON.stringify(r2)}. Eskiden bu is bes kez FAILED olup kayboluyordu.`);
    const otp = c2.calls.otp[0];
    check(otp && otp.email === job.email && otp.options && otp.options.shouldCreateUser === false,
      '6. Giris linki yeni hesap ACMIYOR (shouldCreateUser: false)',
      JSON.stringify(c2.calls.otp));
    check(otp && otp.options && otp.options.emailRedirectTo === url,
      '7. Giris linki de LEXBNB_PUBLIC_URL\'e donuyor',
      JSON.stringify(c2.calls.otp));

    const c3 = sahteIstemci({ inviteError: { message: 'Hesap bulundu: already registered' } });
    const r3 = await deliver(c3, job, url);
    check(r3.ok && r3.channel === 'magiclink',
      '8. "already registered" kodu olmadan da (yalnizca mesajla) taniniyor',
      JSON.stringify(r3));

    const baska = { message: 'Email rate limit exceeded', status: 429 };
    const c4 = sahteIstemci({ inviteError: baska });
    const r4 = await deliver(c4, job, url);
    check(!r4.ok && r4.error === baska && c4.calls.otp.length === 0,
      '9. Baska hatalar yeniden denenmek uzere FAILED kalir, giris linkine sapmaz',
      JSON.stringify(r4));

    const c5 = sahteIstemci({ inviteError: kayitli, otpError: { message: 'otp down' } });
    const r5 = await deliver(c5, job, url);
    check(!r5.ok && r5.error && r5.error.message === 'otp down',
      '10. Giris linki de duserse is SENT sayilmaz',
      `Sonuc: ${JSON.stringify(r5)}. Gitmeyen e-postaya "gonderildi" denmez.`);
  }

  // --- 2. Davet linkiyle gelen kisiye sifre belirletiliyor mu ---------------
  const APP = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');
  const win = hash => ({ location: { hash, search: '' } });
  let tespit = null;
  try {
    tespit = yonlendirmeTespiti(APP, win('#access_token=x&type=invite'));
  } catch (e) {
    no('11. Yonlendirme tespiti degerlendirilebiliyor', e.message);
  }
  if (tespit) {
    check(tespit.isPasswordRecoveryRedirect() === true,
      '11. #type=invite sifre belirleme formunu aciyor',
      'Davet linki oturumu dogrudan iceri aliyor; sifresi olmayan hesap ikinci ' +
      'girisinde iceri giremez.');
  }
  const t2 = yonlendirmeTespiti(APP, win('#access_token=x&type=recovery'));
  check(t2.isPasswordRecoveryRedirect() === true,
    '12. #type=recovery hala sifre formunu aciyor',
    'Sifremi unuttum akisi bozuldu.');
  const t3 = yonlendirmeTespiti(APP, win('#access_token=x&type=magiclink'));
  check(t3.isPasswordRecoveryRedirect() === false,
    '13. Giris linki (magiclink) sifre formunu ACMIYOR — hesabin sifresi zaten var',
    'Mevcut kullanici her davette sifresini yeniden belirlemek zorunda kalirdi.');

  const HTML = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
  check(HTML.includes('id="saasNewPassIntro"') && /Ekibe davet edildiniz/.test(APP),
    '14. Davetle gelen kisiye neden sifre istendigi soyleniyor',
    'Form "Yeni sifrenizi belirleyin" diyor; ilk kez gelen biri icin anlamsiz.');

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('[FAIL] beklenmeyen hata:', e); process.exit(1); });
