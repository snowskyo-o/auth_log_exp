const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildEcsRecord } = require('../src/logger');
const { hashPassword } = require('../src/auth/user-store');

const ROOT = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'generated');
const USERS_FILE = path.join(OUTPUT_DIR, 'medium_users.json');
const LOG_FILE = path.join(OUTPUT_DIR, 'medium_login_app.log');
const SUMMARY_FILE = path.join(OUTPUT_DIR, 'medium_dataset_summary.json');

const CONFIG = {
  seed: 20260611,
  days: 7,
  totalUsers: 1000,
  totalIps: 300,
  totalLogs: 25000,
  serviceEvents: 250,
};

function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function intBetween(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

function weightedPick(rng, items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = rng() * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function makeUsers() {
  const users = [];
  for (let index = 0; index < CONFIG.totalUsers; index += 1) {
    const id = String(2024000001 + index).padStart(10, '0');
    const role = index < 40 ? 'admin' : 'student';
    const forceChangePassword = index % 37 === 0;
    const password = `Pass${id}!`;
    users.push({
      id,
      name: `User ${index + 1}`,
      role,
      isActive: true,
      forceChangePassword,
      passwordHash: hashPassword(password, id),
      lastLoginAt: null,
      plainPassword: password,
    });
  }
  return users;
}

function makeIpPool() {
  const ips = [];
  for (let i = 0; i < 180; i += 1) {
    ips.push(`10.20.${Math.floor(i / 60)}.${(i % 60) + 10}`);
  }
  for (let i = 0; i < 75; i += 1) {
    ips.push(`172.16.${Math.floor(i / 50) + 1}.${(i % 50) + 20}`);
  }
  for (let i = 0; i < 30; i += 1) {
    ips.push(`203.0.113.${i + 10}`);
  }
  for (let i = 0; i < 15; i += 1) {
    ips.push(`198.51.100.${i + 10}`);
  }
  return ips.slice(0, CONFIG.totalIps);
}

function buildTrafficProfile(rng, users, ips) {
  const activeUsers = users.slice(0, 100);
  const normalUsers = users.slice(100, 900);
  const lowUsers = users.slice(900);
  const attackIps = ips.slice(-40);
  const normalIps = ips.slice(0, 220);
  const scatteredIps = ips.slice(220, 260);
  const quietIps = ips.slice(260);

  function chooseUser() {
    return weightedPick(rng, [
      { weight: 0.45, value: pick(rng, activeUsers) },
      { weight: 0.45, value: pick(rng, normalUsers) },
      { weight: 0.10, value: pick(rng, lowUsers) },
    ]);
  }

  function chooseNormalIp() {
    return weightedPick(rng, [
      { weight: 0.70, value: pick(rng, normalIps) },
      { weight: 0.20, value: pick(rng, scatteredIps) },
      { weight: 0.10, value: pick(rng, quietIps) },
    ]);
  }

  return {
    chooseUser,
    chooseNormalIp,
    attackIps,
    normalIps,
    scatteredIps,
  };
}

function buildTimestampGenerator(rng) {
  const start = Date.UTC(2026, 5, 1, 0, 0, 0, 0);
  const totalMinutes = CONFIG.days * 24 * 60;

  return function nextTimestamp() {
    const minuteOffset = intBetween(rng, 0, totalMinutes - 1);
    const base = new Date(start + minuteOffset * 60 * 1000);
    const hour = base.getUTCHours();
    let bonus = 0;
    if (hour >= 8 && hour < 12) bonus = intBetween(rng, 0, 12000);
    else if (hour >= 14 && hour < 18) bonus = intBetween(rng, 0, 16000);
    else if (hour >= 19 && hour < 22) bonus = intBetween(rng, 0, 8000);
    else bonus = intBetween(rng, 0, 2000);
    const millis = intBetween(rng, 0, 999);
    return new Date(base.getTime() + bonus + millis).toISOString();
  };
}

function makeEvent(level, event, extra) {
  return { level, event, ...extra };
}

function pushRecord(records, counters, entry) {
  const record = buildEcsRecord(entry);
  records.push(record);
  counters.total += 1;
  const action = record['event.action'] || 'unknown';
  counters.byAction[action] = (counters.byAction[action] || 0) + 1;
}

function generateRecords(users, ips) {
  const rng = createRng(CONFIG.seed);
  const nextTimestamp = buildTimestampGenerator(rng);
  const traffic = buildTrafficProfile(rng, users, ips);
  const records = [];
  const counters = { total: 0, byAction: {} };

  const serviceStarts = 70;
  const serviceStops = 50;
  const serviceErrors = CONFIG.serviceEvents - serviceStarts - serviceStops;

  for (let i = 0; i < serviceStarts; i += 1) {
    pushRecord(records, counters, makeEvent('info', 'app.start', {
      '@timestamp': nextTimestamp(),
      port: 3004,
      message: 'service started',
    }));
  }

  for (let i = 0; i < serviceStops; i += 1) {
    pushRecord(records, counters, makeEvent('info', 'app.shutdown', {
      '@timestamp': nextTimestamp(),
      signal: pick(rng, ['SIGINT', 'SIGTERM']),
      message: 'service stopped',
    }));
  }

  for (let i = 0; i < serviceErrors; i += 1) {
    pushRecord(records, counters, makeEvent('error', 'app.error_unhandled', {
      '@timestamp': nextTimestamp(),
      message: pick(rng, [
        'listen EADDRINUSE: address already in use :::3004',
        'database timeout while fetching user profile',
        'unexpected internal exception in auth pipeline',
      ]),
    }));
  }

  const remaining = CONFIG.totalLogs - CONFIG.serviceEvents;
  const interactionCount = Math.floor(remaining / 2);
  const plan = [
    { count: Math.round(interactionCount * 0.70), type: 'success' },
    { count: Math.round(interactionCount * 0.12), type: 'password_mismatch' },
    { count: Math.round(interactionCount * 0.05), type: 'invalid_input' },
    { count: Math.round(interactionCount * 0.05), type: 'targeted_account' },
    { count: Math.round(interactionCount * 0.04), type: 'single_ip_attack' },
    { count: interactionCount, type: 'distributed_attack' },
  ];
  plan[5].count = interactionCount - plan.slice(0, 5).reduce((sum, item) => sum + item.count, 0);

  const targetedVictims = users.slice(0, 50);
  const distributedVictims = users.slice(50, 200);
  const singleAttackIp = traffic.attackIps[0];

  function addRequest(timestamp, userId, sourceIp) {
    pushRecord(records, counters, makeEvent('info', 'app.request', {
      '@timestamp': timestamp,
      requestId: crypto.randomUUID(),
      method: 'POST',
      path: '/api/v1/auth/login',
      user: userId,
      src_ip: sourceIp,
      message: 'request received',
    }));
    return records[records.length - 1]['trace.id'];
  }

  function addResult(level, event, timestamp, traceId, userId, sourceIp, extra) {
    pushRecord(records, counters, makeEvent(level, event, {
      '@timestamp': timestamp,
      requestId: traceId,
      user: userId,
      src_ip: sourceIp,
      ...extra,
    }));
  }

  for (const item of plan) {
    for (let i = 0; i < item.count; i += 1) {
      const timestamp = nextTimestamp();

      if (item.type === 'success') {
        const user = traffic.chooseUser();
        const sourceIp = traffic.chooseNormalIp();
        const traceId = addRequest(timestamp, user.id, sourceIp);
        addResult('info', 'auth.login_success', timestamp, traceId, user.id, sourceIp, {
          role: user.role,
          message: 'login success',
        });
        continue;
      }

      if (item.type === 'password_mismatch') {
        const user = traffic.chooseUser();
        const sourceIp = traffic.chooseNormalIp();
        const traceId = addRequest(timestamp, user.id, sourceIp);
        addResult('warning', 'auth.login_fail', timestamp, traceId, user.id, sourceIp, {
          reason: 'password_mismatch',
          message: 'login failed',
        });
        continue;
      }

      if (item.type === 'invalid_input') {
        const badUser = `${intBetween(rng, 10, 99999)}`;
        const sourceIp = traffic.chooseNormalIp();
        const traceId = addRequest(timestamp, badUser, sourceIp);
        addResult('warning', 'auth.login_fail', timestamp, traceId, badUser, sourceIp, {
          reason: 'validation_failed',
          message: 'invalid input',
        });
        continue;
      }

      if (item.type === 'targeted_account') {
        const victim = pick(rng, targetedVictims);
        const sourceIp = pick(rng, traffic.attackIps);
        const traceId = addRequest(timestamp, victim.id, sourceIp);
        const shouldLock = rng() < 0.18;
        addResult(shouldLock ? 'error' : 'warning', shouldLock ? 'auth.account_locked' : 'auth.login_fail', timestamp, traceId, victim.id, sourceIp, {
          reason: shouldLock ? 'too_many_failures' : 'password_mismatch',
          message: shouldLock ? 'account locked due to repeated failures' : 'login failed',
        });
        continue;
      }

      if (item.type === 'single_ip_attack') {
        const victim = pick(rng, users);
        const traceId = addRequest(timestamp, victim.id, singleAttackIp);
        addResult('warning', 'auth.login_fail', timestamp, traceId, victim.id, singleAttackIp, {
          reason: weightedPick(rng, [
            { weight: 0.65, value: 'password_mismatch' },
            { weight: 0.35, value: 'user_not_found_or_disabled' },
          ]),
          message: 'login failed',
        });
        continue;
      }

      if (item.type === 'distributed_attack') {
        const victim = pick(rng, distributedVictims);
        const sourceIp = pick(rng, traffic.attackIps);
        const traceId = addRequest(timestamp, victim.id, sourceIp);
        addResult('warning', 'auth.login_fail', timestamp, traceId, victim.id, sourceIp, {
          reason: 'user_not_found_or_disabled',
          message: 'login failed',
        });
      }
    }
  }

  records.sort((left, right) => left['@timestamp'].localeCompare(right['@timestamp']));
  return { records, counters };
}

function writeOutputs(users, records, counters, ips) {
  const exportUsers = users.map(({ plainPassword, ...user }) => user);
  fs.writeFileSync(USERS_FILE, JSON.stringify(exportUsers, null, 2) + '\n', 'utf8');
  fs.writeFileSync(LOG_FILE, records.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8');

  const summary = {
    profile: 'medium',
    generatedAt: new Date().toISOString(),
    seed: CONFIG.seed,
    users: users.length,
    distinctIps: ips.length,
    totalLogs: counters.total,
    timeSpanDays: CONFIG.days,
    logFile: path.relative(ROOT, LOG_FILE),
    userFile: path.relative(ROOT, USERS_FILE),
    byEventAction: counters.byAction,
  };

  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  return summary;
}

function main() {
  ensureOutputDir();
  const users = makeUsers();
  const ips = makeIpPool();
  const { records, counters } = generateRecords(users, ips);
  const summary = writeOutputs(users, records, counters, ips);

  console.log(JSON.stringify(summary, null, 2));
}

main();
