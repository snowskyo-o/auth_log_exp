const { handleAuthRequest } = require('../src/auth/auth-router');
const fs = require('node:fs');
const path = require('node:path');

function makeReq() {
  return {
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function makeRes() {
  return {
    status: null,
    body: null,
    writeHead(code, headers) { this.status = code; },
    end(payload) { this.body = payload; console.log('response:', this.status, this.body); },
  };
}

async function main() {
  const req = makeReq();
  const res = makeRes();
  const body = { userId: '2024000001', password: 'Study2026!', sourceIp: '127.0.0.1' };

  // ensure logs dir exists
  const logDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  await handleAuthRequest(req, res, '/api/v1/auth/login', body);
}

main().catch((e) => { console.error(e); process.exit(1); });
