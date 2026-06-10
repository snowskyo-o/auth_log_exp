const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { writeLog, LOG_FILE } = require('../src/logger');

async function main() {
  const dir = path.dirname(LOG_FILE);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

  await writeLog({
    level: 'info',
    event: 'auth.login_success',
    user: '2024000001',
    src_ip: '192.168.1.10',
    message: 'login success',
  });

  const text = fs.readFileSync(LOG_FILE, 'utf8').trim();
  const record = JSON.parse(text);
  assert.equal(record['event.action'], 'auth_success');
  assert.equal(record['user.id'], '2024000001');
  assert.equal(record['source.ip'], '192.168.1.10');
  assert.equal(record.message, 'login success');
  assert.equal(record['service.name'], 'login_app');
  assert.equal(record['event.outcome'], 'success');
  assert.ok(record['@timestamp']);
  console.log('smoke ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
