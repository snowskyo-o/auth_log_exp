const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { writeLog, LOG_FILE } = require('../src/logger');

function main() {
  const dir = path.dirname(LOG_FILE);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

  writeLog({
    level: 'info',
    event: 'auth.login_success',
    user: '2024000001',
    sourceIp: '192.168.1.10',
    message: 'login success',
  });

  const text = fs.readFileSync(LOG_FILE, 'utf8').trim();
  assert(text.includes('event_type=auth_success'));
  assert(text.includes('user=2024000001'));
  assert(text.includes('src_ip=192.168.1.10'));
  assert(text.includes('message="login success"'));
  console.log('smoke ok');
}

main();
