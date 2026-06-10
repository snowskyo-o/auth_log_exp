const fs = require('node:fs');
const path = require('node:path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.jsonl');

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function toLine(entry) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'auth-log-exp',
    ...entry,
  });
}

function writeLog(entry) {
  ensureLogDir();
  fs.appendFileSync(LOG_FILE, toLine(entry) + '\n', 'utf8');
}

module.exports = {
  LOG_DIR,
  LOG_FILE,
  writeLog,
};
