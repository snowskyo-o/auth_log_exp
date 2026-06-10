const crypto = require('node:crypto');
const { writeLog } = require('../logger');
const { isLocked, recordFailure, clearFailures } = require('./login-rate-limit');
const {
  signAccessToken,
  createRefreshToken,
  storeRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
} = require('./token-service');
const { findUser, updateUser, isValidUserId } = require('./user-store');

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function ok(res, data) {
  return json(res, 200, { ok: true, data });
}

function fail(res, statusCode, code, message) {
  return json(res, statusCode, { ok: false, code, message });
}

function invalidCredentials(res) {
  return fail(res, 401, 'UNAUTHENTICATED', 'Invalid userId or password');
}

function getSourceIp(req, body) {
  return String(body.sourceIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown');
}

function getRequestId(req) {
  return String(req.headers['x-request-id'] || crypto.randomUUID());
}

function logEvent(event, extra, level = 'info') {
  writeLog({ level, event, ...extra });
}

async function handleLogin(req, res, body) {
  const requestId = getRequestId(req);
  const { userId, password } = body || {};
  const sourceIp = getSourceIp(req, body || {});

  logEvent('app.request', {
    requestId,
    method: 'POST',
    path: '/api/v1/auth/login',
    sourceIp,
    userId: String(userId || ''),
  });

  if (!userId || !password || !isValidUserId(userId)) {
    logEvent('auth.login_fail', {
      requestId,
      sourceIp,
      userId: String(userId || ''),
      reason: 'validation_failed',
    });
    return fail(res, 400, 'VALIDATION_FAILED', 'userId must be 10 digits and password is required');
  }

  if (await isLocked(userId)) {
    const state = recordFailure(userId);
    logEvent('auth.account_locked', {
      requestId,
      sourceIp,
      userId,
      failCount: state.count,
      lockedUntil: new Date(state.lockedUntil).toISOString(),
      reason: 'too_many_failures',
    });
    return fail(res, 423, 'CONFLICT', 'Too many failed attempts. Try again later.');
  }

  const user = findUser(userId);
  if (!user || !user.isActive) {
    const state = recordFailure(userId);
    logEvent('auth.login_fail', {
      requestId,
      sourceIp,
      userId,
      failCount: state.count,
      reason: 'user_not_found_or_disabled',
    });
    return invalidCredentials(res);
  }

  const passwordHash = require('node:crypto').scryptSync(String(password), String(user.id), 32).toString('hex');
  if (passwordHash !== user.passwordHash) {
    const state = recordFailure(userId);
    logEvent('auth.login_fail', {
      requestId,
      sourceIp,
      userId,
      failCount: state.count,
      lockedUntil: state.lockedUntil ? new Date(state.lockedUntil).toISOString() : null,
      reason: 'password_mismatch',
    });
    return invalidCredentials(res);
  }

  clearFailures(userId);
  const accessToken = signAccessToken({ sub: user.id, role: user.role, forceChangePassword: Boolean(user.forceChangePassword) });
  const refreshToken = createRefreshToken();
  await storeRefreshToken(refreshToken, user.id);
  updateUser(user.id, { lastLoginAt: new Date().toISOString() });

  logEvent('auth.login_success', {
    requestId,
    sourceIp,
    userId: user.id,
    role: user.role,
    forceChangePassword: Boolean(user.forceChangePassword),
  });

  return ok(res, {
    accessToken,
    refreshToken,
    expiresIn: '30m',
    role: user.role,
    forceChangePassword: Boolean(user.forceChangePassword),
  });
}

async function handleRefresh(req, res, body) {
  const { refreshToken } = body || {};
  if (!refreshToken) {
    return fail(res, 400, 'VALIDATION_FAILED', 'refreshToken is required');
  }

  const userId = await consumeRefreshToken(refreshToken);
  if (!userId) {
    return fail(res, 401, 'UNAUTHENTICATED', 'Invalid or expired refresh token');
  }

  const user = findUser(userId);
  if (!user || !user.isActive) {
    return fail(res, 401, 'UNAUTHENTICATED', 'User not found or disabled');
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role, forceChangePassword: Boolean(user.forceChangePassword) });
  const nextRefreshToken = createRefreshToken();
  await storeRefreshToken(nextRefreshToken, user.id);

  return ok(res, {
    accessToken,
    refreshToken: nextRefreshToken,
    expiresIn: '30m',
    role: user.role,
    forceChangePassword: Boolean(user.forceChangePassword),
  });
}

async function handleLogout(req, res, body) {
  const { refreshToken } = body || {};
  if (!refreshToken) {
    return fail(res, 400, 'VALIDATION_FAILED', 'refreshToken is required');
  }

  await revokeRefreshToken(refreshToken);
  logEvent('auth.logout', {
    requestId: getRequestId(req),
    sourceIp: getSourceIp(req, body || {}),
  });
  return ok(res, { ok: true });
}

async function handleAuthRequest(req, res, pathname, body) {
  if (req.method === 'POST' && pathname === '/api/v1/auth/login') {
    await handleLogin(req, res, body);
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/v1/auth/refresh') {
    await handleRefresh(req, res, body);
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/v1/auth/logout') {
    await handleLogout(req, res, body);
    return true;
  }
  return false;
}

module.exports = {
  handleAuthRequest,
};
