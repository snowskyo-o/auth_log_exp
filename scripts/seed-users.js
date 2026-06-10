const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'users.json');

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 32).toString('hex');
}

function main() {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const users = JSON.parse(raw).map((user) => ({
    id: user.id,
    name: user.name,
    role: user.role,
    isActive: Boolean(user.isActive),
    forceChangePassword: Boolean(user.forceChangePassword),
    passwordHash: hashPassword(user.passwordSeed || 'ChangeMe123!', user.id),
  }));

  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2) + '\n', 'utf8');
  console.log(`seeded ${users.length} users into ${DATA_FILE}`);
}

main();
