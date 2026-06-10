const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..', '..');
const DATA_FILE = path.join(ROOT, 'data', 'users.json');

let users = [];

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 32).toString('hex');
}

function ensurePasswordHash(user) {
  if (user.passwordHash) {
    return user.passwordHash;
  }
  if (user.passwordSeed) {
    return hashPassword(user.passwordSeed, user.id);
  }
  return '';
}

function normalizeUser(user) {
  return {
    ...user,
    isActive: Boolean(user.isActive),
    forceChangePassword: Boolean(user.forceChangePassword),
    passwordHash: ensurePasswordHash(user),
  };
}

function loadUsers() {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  users = JSON.parse(raw).map(normalizeUser);
  return users;
}

function persistUsers() {
  const serializable = users.map((user) => ({
    id: user.id,
    name: user.name,
    role: user.role,
    isActive: Boolean(user.isActive),
    forceChangePassword: Boolean(user.forceChangePassword),
    passwordHash: user.passwordHash,
    lastLoginAt: user.lastLoginAt || null,
  }));
  fs.writeFileSync(DATA_FILE, JSON.stringify(serializable, null, 2) + '\n', 'utf8');
}

function getUsers() {
  if (users.length === 0) {
    loadUsers();
  }
  return users;
}

function findUser(userId) {
  return getUsers().find((user) => user.id === userId) || null;
}

function updateUser(userId, patch) {
  const target = findUser(userId);
  if (!target) {
    return null;
  }
  Object.assign(target, patch);
  persistUsers();
  return target;
}

function isValidUserId(value) {
  return /^\d{10}$/.test(String(value || ''));
}

module.exports = {
  DATA_FILE,
  hashPassword,
  loadUsers,
  findUser,
  updateUser,
  isValidUserId,
};
