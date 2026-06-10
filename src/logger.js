const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'login_app.log');
const SERVICE_NAME = 'login_app';

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function sanitizeExtra(extra) {
  // remove sensitive keys if present
  const forbidden = new Set(['password', 'passwordHash', 'passwordSeed', 'accessToken', 'refreshToken', 'token']);
  const out = {};
  for (const k of Object.keys(extra || {})) {
    if (forbidden.has(k)) continue;
    out[k] = extra[k];
  }
  return out;
}

function mapEventType(event, extra) {
  // map various internal event names to required event_type values
  if (!event) return 'unknown';
  const e = String(event);
  if (e === 'app.start') return 'service_start';
  if (e === 'app.shutdown') return 'service_stop';
  if (e === 'app.error_unhandled') return 'service_error';
  if (e.includes('auth.login_success') || e === 'auth.login_success') return 'auth_success';
  if (e.includes('auth.login_fail') || e === 'auth.login_fail') {
    if (extra && extra.reason === 'validation_failed') return 'invalid_input';
    return 'auth_failed';
  }
  if (e.includes('auth.account_locked') || e === 'auth.account_locked') return 'account_locked';
  return e.replace(/\./g, '_');
}

function levelName(level) {
  if (!level) return 'INFO';
  return String(level).toUpperCase();
}

function formatMessage(eventType, extra) {
  if (extra && extra.message) return String(extra.message);
  // provide default messages for common events
  switch (eventType) {
    case 'service_start': return 'service started';
    case 'service_stop': return 'service stopped';
    case 'service_error': return 'service error';
    case 'auth_success': return 'login success';
    case 'auth_failed': return 'login failed';
    case 'account_locked': return 'account locked due to repeated failures';
    case 'invalid_input': return 'invalid input';
    default: return '';
  }
}

function toLine(entry) {
  ensureLogDir();
  const ts = new Date().toISOString();
  const host = os.hostname();
  const extra = sanitizeExtra(entry || {});
  const eventType = mapEventType(entry.event || entry.event_type || '', extra);
  const level = levelName(entry.level || extra.level || 'INFO');
  const user = extra.user || extra.userId || '';
  const src_ip = extra.src_ip || extra.sourceIp || extra.sourceIp || '';
  const message = formatMessage(eventType, extra);

  // Build key=value pairs, ensure values with spaces/quotes are quoted
  const pairs = [];
  pairs.push(`level=${level}`);
  pairs.push(`event_type=${eventType}`);
  if (user) pairs.push(`user=${user}`);
  if (src_ip) pairs.push(`src_ip=${src_ip}`);
  pairs.push(`message="${String(message).replace(/"/g, '\\"')}"`);

  // include other non-sensitive extra fields for analysis
  for (const k of Object.keys(extra)) {
    if (['user', 'userId', 'sourceIp', 'src_ip', 'message', 'level'].includes(k)) continue;
    const v = extra[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') continue;
    // simple key=value (no quoting unless contains space)
    const val = String(v);
    if (/\s/.test(val) || /"/.test(val)) {
      pairs.push(`${k}="${val.replace(/"/g, '\\"')}"`);
    } else {
      pairs.push(`${k}=${val}`);
    }
  }

  return `${ts} ${host} ${SERVICE_NAME}: ${pairs.join(' ')}`;
}

function writeLog(entry) {
  try {
    const line = toLine(entry) + '\n';
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (err) {
    // best-effort: if logging fails, write to console but avoid throwing
    try { console.error('logger write failed', err && err.message); } catch (e) {}
  }
}

module.exports = {
  LOG_DIR,
  LOG_FILE,
  writeLog,
};
