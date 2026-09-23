const http = require('http');
const fs = require('fs');
const path = require('path');

// Yerel gelistirme sunucusu (LEXBNB-Baslat.bat).
//
// Bu klasorde .env (service_role anahtari), .git, supabase/ ve testler durur.
// Sunucu bir zamanlar klasorun TAMAMINI, ust dizine cikisa da izin vererek
// 0.0.0.0 uzerinden sunuyordu: ayni agdaki herkes /.env'i indirebiliyordu.
// Artik yalnizca 127.0.0.1'e baglanir ve yalnizca tarayicinin ihtiyac duydugu
// dosyalari verir (izin listesi). Listede olmayan her yol 404'tur.

const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1';
const WEB_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.txt': 'text/plain; charset=UTF-8',
  '.csv': 'text/csv; charset=UTF-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const ROOT_FILES = new Set(['index.html', 'style.css', 'app.js', 'xlsx.full.min.js', 'robots.txt', 'favicon.ico']);

/** Istenen yolun izin listesinde olup olmadigi. Goreli, '/' ayracli yol alir. */
function isAllowed(rel) {
  const parts = rel.split('/');
  if (parts.some(p => !p || p.startsWith('.'))) return false;
  if (parts.length === 1) return ROOT_FILES.has(parts[0]);
  if (parts.length !== 2) return false;
  const [dir, name] = parts;
  if (dir === 'core') {
    return /^[a-z0-9_]+\.js$/.test(name) && !/_tests\.js$/.test(name) && name !== 'test_env.js';
  }
  if (dir === 'sablonlar') return /^[a-z0-9-]+\.(csv|xlsx)$/.test(name);
  return false;
}

/**
 * URL'yi diskteki mutlak yola cevirir; izin verilmiyorsa null.
 * Kodlanmis gezinme (%2e%2e, %2f, %5c), NUL bayti ve ters bolu reddedilir.
 */
function resolveRequestPath(url) {
  let raw = String(url || '/').split('?')[0].split('#')[0];
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch (_) { return null; }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  if (decoded === '/' || decoded === '') decoded = '/index.html';
  if (!decoded.startsWith('/')) return null;
  const rel = decoded.slice(1);
  if (!isAllowed(rel)) return null;
  const abs = path.resolve(WEB_DIR, rel);
  if (!abs.startsWith(WEB_DIR + path.sep)) return null;
  return abs;
}

function handler(req, res) {
  const send = (code, body, type) => {
    res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=UTF-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    res.end(body);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, '405 Method Not Allowed');
  const filePath = resolveRequestPath(req.url);
  if (!filePath) return send(404, '404 Not Found');
  fs.readFile(filePath, (err, data) => {
    if (err) return send(404, '404 Not Found');
    send(200, req.method === 'HEAD' ? undefined : data, MIME_TYPES[path.extname(filePath)] || 'application/octet-stream');
  });
}

function createServer() { return http.createServer(handler); }

module.exports = { resolveRequestPath, isAllowed, createServer, HOST };

if (require.main === module) {
  createServer().listen(PORT, HOST, () => {
    console.log(`🌲 Lexbnb Executive Control Center running at http://localhost:${PORT}/ (yalnizca bu bilgisayar)`);
  });
}
