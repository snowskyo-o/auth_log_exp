const crypto = require('node:crypto');

const TOKEN_SECRET = process.env.AUTH_SECRET || 'auth_log_exp_dev_secret';
const ACCESS_TTL_MS = 30 * 60 * 1000;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_PREFIX = 'rt:';
const memoryRefreshTokens = new Map();

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payload) {
  const body = base64Url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySignature(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) {
    return null;
  }
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function signAccessToken(payload) {
  return signPayload({
    ...payload,
    iat: Date.now(),
    exp: Date.now() + ACCESS_TTL_MS,
  });
}

function verifyAccessToken(token) {
  const payload = verifySignature(token);
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) {
    return null;
  }
  return payload;
}

function createRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

function refreshKey(rawToken) {
  return `${REFRESH_PREFIX}${crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex')}`;
}

function setMemoryRefreshToken(rawToken, userId) {
  memoryRefreshTokens.set(refreshKey(rawToken), {
    userId,
    expiresAt: Date.now() + REFRESH_TTL_MS,
  });
}

function getMemoryRefreshToken(rawToken) {
  const key = refreshKey(rawToken);
  const entry = memoryRefreshTokens.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    memoryRefreshTokens.delete(key);
    return null;
  }
  return entry.userId;
}

async function storeRefreshToken(rawToken, userId) {
  setMemoryRefreshToken(rawToken, userId);
}

async function consumeRefreshToken(rawToken) {
  const key = refreshKey(rawToken);
  const userId = getMemoryRefreshToken(rawToken);
  if (!userId) {
    return null;
  }
  memoryRefreshTokens.delete(key);
  return userId;
}

async function revokeRefreshToken(rawToken) {
  memoryRefreshTokens.delete(refreshKey(rawToken));
}

async function revokeAllRefreshTokensForUsers(userIds) {
  const target = new Set(userIds);
  for (const [key, entry] of memoryRefreshTokens.entries()) {
    if (target.has(entry.userId)) {
      memoryRefreshTokens.delete(key);
    }
  }
}

async function revokeAllUserRefreshTokens(userId) {
  await revokeAllRefreshTokensForUsers([userId]);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  createRefreshToken,
  storeRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUsers,
  revokeAllUserRefreshTokens,
};
