const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { writeLog } = require('./logger');
const { MAX_ATTEMPTS } = require('./auth/login-rate-limit');
const { loadUsers } = require('./auth/user-store');
const { handleAuthRequest } = require('./auth/auth-router');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
// Default port is 3004 to match Docker setup and README guidance.
const PORT = Number(process.env.PORT || 3004);

let shuttingDown = false;

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  const type = ext === '.html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(filePath).pipe(res);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function logEvent(event, extra, level = 'info') {
  writeLog({ level, event, ...extra });
}

function errorEvent(base, extra) {
  writeLog({ level: 'error', event: base, ...extra });
}

function startServer() {
  loadUsers();
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;

      if (req.method === 'GET' && req.url === '/') {
        return sendFile(res, path.join(PUBLIC_DIR, 'login.html'));
      }
      if (req.method === 'GET' && req.url === '/login.html') {
        return sendFile(res, path.join(PUBLIC_DIR, 'login.html'));
      }
      if (req.method === 'GET' && req.url === '/health') {
        return json(res, 200, { ok: true, service: 'auth-log-exp', now: new Date().toISOString() });
      }
      if (req.method === 'POST' && pathname.startsWith('/api/v1/auth/')) {
        const body = await parseBody(req);
        const handled = await handleAuthRequest(req, res, pathname, body);
        if (handled) {
          return;
        }
      }

      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, code: 'NOT_FOUND', message: 'Route not found' }));
    } catch (error) {
      errorEvent('app.error_unhandled', {
        message: error && error.message ? error.message : 'unknown error',
      });
      json(res, 500, { ok: false, code: 'INTERNAL_ERROR', message: 'Unexpected server error' });
    }
  });

  server.on('error', (err) => {
    errorEvent('app.error_unhandled', { message: err.message });
  });

  server.listen(PORT, () => {
    logEvent('app.start', { port: PORT, maxAttempts: MAX_ATTEMPTS });
    console.log(`auth_log_exp listening on http://localhost:${PORT}`);
  });

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logEvent('app.shutdown', { signal });
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer,
};
