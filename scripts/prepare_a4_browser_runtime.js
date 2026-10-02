/**
 * Uretim sabitlerini degistirmeden, A4 tarayici denetimi icin test Supabase
 * projesine bagli gecici bir web kok dizini hazirlar.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadTestEnv } = require('../core/test_env.js');

const env = loadTestEnv();
const sourceRoot = path.resolve(__dirname, '..');
const destination = path.join(os.tmpdir(), 'lexbnb-a4-browser-runtime');
const rootFiles = ['index.html', 'style.css', 'app.js', 'xlsx.full.min.js', 'supabase.umd.js', 'robots.txt', 'favicon.ico', 'server.js'];

fs.mkdirSync(destination, { recursive: true });
for (const file of rootFiles) {
  const source = path.join(sourceRoot, file);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(destination, file));
}
for (const directory of ['core', 'sablonlar']) {
  const source = path.join(sourceRoot, directory);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(destination, directory), { recursive: true, force: true });
}

const appPath = path.join(destination, 'app.js');
let appSource = fs.readFileSync(appPath, 'utf8');
const productionUrlDeclaration = /const DEFAULT_SUPABASE_URL = '[^']+';/;
const productionKeyDeclaration = /const DEFAULT_SUPABASE_KEY = '[^']+';/;
if (!productionUrlDeclaration.test(appSource) || !productionKeyDeclaration.test(appSource)) {
  throw new Error('app.js Supabase sabitleri bulunamadi; gecici runtime hazirlanmadi.');
}
appSource = appSource
  .replace(productionUrlDeclaration, `const DEFAULT_SUPABASE_URL = '${env.SUPABASE_URL}';`)
  .replace(productionKeyDeclaration, `const DEFAULT_SUPABASE_KEY = '${env.SUPABASE_ANON_KEY}';`);
fs.writeFileSync(appPath, appSource, 'utf8');

console.log(JSON.stringify({ destination, projectUrl: env.SUPABASE_URL }));
