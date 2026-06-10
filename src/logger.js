const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const winston = require('winston');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'login_app.log');
const SERVICE_NAME = 'login_app';

const EVENT_ACTION_MAP = {
  'app.start': 'service_start',
  'app.shutdown': 'service_stop',
  'app.error_unhandled': 'service_error',
  'app.request': 'app_request',
  'auth.login_success': 'auth_success',
  'auth.login_fail': 'auth_failed',
  'auth.account_locked': 'account_locked',
  'auth.logout': 'auth_logout',
};

const EVENT_METADATA = {
  service_start: { category: ['process'], type: ['start'], outcome: 'success' },
  service_stop: { category: ['process'], type: ['end'], outcome: 'success' },
  service_error: { category: ['process'], type: ['error'], outcome: 'failure' },
  app_request: { category: ['web'], type: ['access'], outcome: 'unknown' },
  auth_success: { category: ['authentication'], type: ['start'], outcome: 'success' },
  auth_failed: { category: ['authentication'], type: ['start'], outcome: 'failure' },
  account_locked: { category: ['authentication'], type: ['change'], outcome: 'failure' },
  auth_logout: { category: ['authentication'], type: ['end'], outcome: 'success' },
  invalid_input: { category: ['authentication'], type: ['info'], outcome: 'failure' },
  unknown: { category: ['application'], type: ['info'], outcome: 'unknown' },
};

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function sanitizeExtra(extra) {
  const forbidden = new Set([
    'password',
    'passwordHash',
    'passwordSeed',
    'accessToken',
    'refreshToken',
    'token',
  ]);
  const out = {};
  for (const key of Object.keys(extra || {})) {
    if (forbidden.has(key)) continue;
    out[key] = extra[key];
  }
  return out;
}

function mapEventAction(event, extra) {
  const raw = String(event || '').trim();
  if (!raw) return 'unknown';
  if (raw === 'auth.login_fail' && extra && extra.reason === 'validation_failed') {
    return 'invalid_input';
  }
  return EVENT_ACTION_MAP[raw] || raw.replace(/\./g, '_');
}

function defaultMessage(eventAction, extra) {
  if (extra && extra.message) return String(extra.message);
  switch (eventAction) {
    case 'service_start':
      return 'service started';
    case 'service_stop':
      return 'service stopped';
    case 'service_error':
      return 'service error';
    case 'app_request':
      return 'request received';
    case 'auth_success':
      return 'login success';
    case 'auth_failed':
      return 'login failed';
    case 'account_locked':
      return 'account locked due to repeated failures';
    case 'auth_logout':
      return 'logout success';
    case 'invalid_input':
      return 'invalid input';
    default:
      return '';
  }
}

function normalizeValue(value) {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object') return undefined;
  return value;
}

function setField(target, key, value) {
  if (value === undefined || value === null || value === '') return;
  target[key] = value;
}

function buildEcsRecord(info) {
  const extra = sanitizeExtra(info);
  const eventCode = String(extra.event || extra.event_type || '').trim();
  const eventAction = mapEventAction(eventCode, extra);
  const metadata = EVENT_METADATA[eventAction] || EVENT_METADATA.unknown;

  const record = {
    '@timestamp': new Date().toISOString(),
    message: defaultMessage(eventAction, extra),
    'log.level': String(info.level || 'info').toUpperCase(),
    'host.name': os.hostname(),
    'service.name': SERVICE_NAME,
    'event.kind': 'event',
    'event.category': metadata.category,
    'event.type': metadata.type,
    'event.action': eventAction,
    'event.outcome': metadata.outcome,
  };

  setField(record, 'event.code', eventCode);
  setField(record, 'user.id', extra.user || extra.userId);
  setField(record, 'source.ip', extra.src_ip || extra.sourceIp);
  setField(record, 'trace.id', extra.requestId);
  setField(record, 'event.reason', extra.reason);
  setField(record, 'http.request.method', extra.method);
  setField(record, 'url.path', extra.path);
  setField(record, 'server.port', extra.port);
  setField(record, 'process.signal', extra.signal);

  if (extra.role) {
    record['user.roles'] = [String(extra.role)];
  }

  for (const key of Object.keys(extra)) {
    if (
      [
        'level',
        'message',
        'event',
        'event_type',
        'user',
        'userId',
        'src_ip',
        'sourceIp',
        'requestId',
        'reason',
        'method',
        'path',
        'port',
        'signal',
        'failCount',
        'maxAttempts',
        'forceChangePassword',
        'lockedUntil',
        'role',
      ].includes(key)
    ) {
      continue;
    }

    const value = normalizeValue(extra[key]);
    if (value === undefined) continue;
    record[`labels.${key}`] = value;
  }

  return record;
}

const ecsFormat = winston.format((info) => {
  const record = buildEcsRecord(info);
  for (const key of Object.keys(info)) {
    delete info[key];
  }
  Object.assign(info, record);
  return info;
});

ensureLogDir();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(ecsFormat(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: LOG_FILE }),
    new winston.transports.Console(),
  ],
});

function writeLog(entry) {
  logger.write({ ...(entry || {}), level: (entry && entry.level) || 'info' });
  return new Promise((resolve) => setTimeout(resolve, 25));
}

module.exports = {
  LOG_DIR,
  LOG_FILE,
  SERVICE_NAME,
  logger,
  writeLog,
};
