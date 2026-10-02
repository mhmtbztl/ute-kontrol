const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const fixture = fs.readFileSync(path.join(root, 'scripts', 'a4_browser_fixture.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'scripts', 'prepare_a4_browser_runtime.js'), 'utf8');

assert.match(fixture, /require\('\.\.\/core\/test_env\.js'\)/, 'fixture merkezi canlı test kapısını kullanmalı');
assert.match(runtime, /require\('\.\.\/core\/test_env\.js'\)/, 'runtime merkezi canlı test kapısını kullanmalı');
assert.doesNotMatch(fixture + runtime, /dotenv|SUPABASE_SERVICE_ROLE_KEY\s*=/, 'scriptler .env dosyasını kendileri okumamalı veya anahtar gömmemeli');
assert.match(fixture, /path\.join\(os\.tmpdir\(\), 'lexbnb-a4-browser-fixture\.json'\)/, 'fixture kimlikleri repo dışında tutulmalı');
assert.match(fixture, /\['owner', 'sales', 'staff', 'viewer', 'outsider'\]/, 'gerekli beş güvenlik aktörü kurulmalı');
assert.match(fixture, /guest_private_classifications/, 'yöneticiye özel sınıflandırma tarayıcıda sınanmalı');
assert.match(fixture, /cleanupManifest/, 'geçici tenant ve kullanıcılar temizlenebilmeli');
assert.match(runtime, /DEFAULT_SUPABASE_URL/, 'geçici kopya test URL sabitini değiştirmeli');
assert.match(runtime, /DEFAULT_SUPABASE_KEY/, 'geçici kopya yalnız publishable anahtarı kullanmalı');
assert.doesNotMatch(runtime, /SERVICE_ROLE/, 'service role tarayıcı runtime kopyasına yazılmamalı');

console.log('[PASS] A4 tarayıcı fixture ve geçici runtime güvenlik sözleşmesi');
