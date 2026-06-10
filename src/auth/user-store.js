const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..', '..');
const DATA_FILE = path.join(ROOT, 'data', 'users.json');

const useDb = String(process.env.USE_DB || '').toLowerCase() === 'true';

let users = [];

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 32).toString('hex');
}

function normalizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    isActive: Boolean(user.isActive),
    forceChangePassword: Boolean(user.forceChangePassword),
    passwordHash: user.passwordHash || '',
    lastLoginAt: user.lastLoginAt || null,
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

// Database-backed implementations
let pool = null;
async function ensurePool() {
  if (pool) return pool;
  const { Pool } = require('pg');
  pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    user: process.env.PGUSER || undefined,
    password: process.env.PGPASSWORD || undefined,
    database: process.env.PGDATABASE || undefined,
    port: Number(process.env.PGPORT || 5432),
  });
  return pool;
}

async function findUserDb(userId) {
  const p = await ensurePool();
  const res = await p.query('SELECT id, name, role, is_active, force_change_password, password_hash, last_login_at FROM users WHERE id = $1 LIMIT 1', [String(userId)]);
  if (!res.rows || res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    isActive: Boolean(r.is_active),
    forceChangePassword: Boolean(r.force_change_password),
    passwordHash: r.password_hash || '',
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
  };
}

async function updateUserDb(userId, patch) {
  const p = await ensurePool();
  const fields = [];
  const vals = [];
  let idx = 1;
  if (patch.lastLoginAt) {
    fields.push(`last_login_at = $${idx++}`);
    vals.push(patch.lastLoginAt);
  }
  if (patch.isActive !== undefined) {
    fields.push(`is_active = $${idx++}`);
    vals.push(patch.isActive);
  }
  if (fields.length === 0) {
    return await findUserDb(userId);
  }
  vals.push(String(userId));
  const q = `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, role, is_active, force_change_password, password_hash, last_login_at`;
  const res = await p.query(q, vals);
  if (!res.rows || res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    isActive: Boolean(r.is_active),
    forceChangePassword: Boolean(r.force_change_password),
    passwordHash: r.password_hash || '',
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
  };
}

function isValidUserId(value) {
  return /^\d{10}$/.test(String(value || ''));
}

// Public API: keep same function names, but findUser/updateUser may be async when using DB.
async function findUser(userId) {
  if (!isValidUserId(userId)) return null;
  if (useDb) {
    return await findUserDb(userId);
  }
  if (users.length === 0) loadUsers();
  return users.find((u) => u.id === String(userId)) || null;
}

async function updateUser(userId, patch) {
  if (useDb) {
    return await updateUserDb(userId, patch);
  }
  const target = (users.length === 0 ? loadUsers() : users).find((user) => user.id === String(userId));
  if (!target) return null;
  Object.assign(target, patch);
  persistUsers();
  return target;
}

module.exports = {
  DATA_FILE,
  hashPassword,
  loadUsers,
  findUser,
  updateUser,
  isValidUserId,
};
