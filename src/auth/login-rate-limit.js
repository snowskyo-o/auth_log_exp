const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 15 * 60;
const attempts = new Map();

function getState(userId) {
  const item = attempts.get(userId);
  if (!item) {
    return { count: 0, lockedUntil: 0 };
  }
  if (Date.now() > item.lockedUntil && item.count >= MAX_ATTEMPTS) {
    attempts.delete(userId);
    return { count: 0, lockedUntil: 0 };
  }
  return item;
}

function isLocked(userId) {
  const item = getState(userId);
  return item.count >= MAX_ATTEMPTS && item.lockedUntil > Date.now();
}

function recordFailure(userId) {
  const current = getState(userId);
  const nextCount = current.count + 1;
  const lockedUntil = nextCount >= MAX_ATTEMPTS ? Date.now() + LOCK_SECONDS * 1000 : current.lockedUntil;
  attempts.set(userId, { count: nextCount, lockedUntil });
  return { count: nextCount, lockedUntil };
}

function clearFailures(userId) {
  attempts.delete(userId);
}

module.exports = {
  MAX_ATTEMPTS,
  LOCK_SECONDS,
  isLocked,
  recordFailure,
  clearFailures,
};
