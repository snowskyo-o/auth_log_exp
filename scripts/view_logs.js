#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const ROOT = path.join(__dirname, '..');
const DEFAULT_LOG = path.join(ROOT, 'logs', 'login_app.log');

function printHelp() {
  console.log(`Usage:
  node scripts/view_logs.js short [log_file] [--limit N]
  node scripts/view_logs.js tail [log_file] [--lines N]
  node scripts/view_logs.js grep <pattern> [log_file] [--field FIELD] [--ignore-case]
  node scripts/view_logs.js stats [log_file]
  node scripts/view_logs.js json [log_file] [--limit N]

Commands:
  short   Show human-readable log lines (journalctl-like short view)
  tail    Show the last N human-readable lines
  grep    Filter logs by pattern, optionally against a specific field
  stats   Print summary counts for common ECS fields
  json    Pretty-print the latest N structured records

Examples:
  node scripts/view_logs.js short
  node scripts/view_logs.js tail generated/medium_login_app.log --lines 20
  node scripts/view_logs.js grep auth_failed generated/medium_login_app.log --field event.action
  node scripts/view_logs.js grep 203.0.113.44 generated/medium_login_app.log --field source.ip
  node scripts/view_logs.js stats generated/medium_login_app.log
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const positionals = [];
  const options = {};

  for (let i = 1; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--limit' || token === '--lines' || token === '--field') {
      options[token.slice(2)] = args[i + 1];
      i += 1;
      continue;
    }
    if (token === '--ignore-case') {
      options.ignoreCase = true;
      continue;
    }
    positionals.push(token);
  }

  return { command, positionals, options };
}

function resolveLogFile(candidate) {
  if (!candidate) return DEFAULT_LOG;
  return path.isAbsolute(candidate) ? candidate : path.join(ROOT, candidate);
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`log file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
}

function parseJsonLine(line) {
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === 'object' ? parsed : { raw: line };
  } catch {
    return { raw: line };
  }
}

function getField(record, field) {
  if (!field) return undefined;
  return record[field];
}

function formatTimestamp(value) {
  if (!value) return 'unknown-time';
  return String(value).replace('T', ' ').replace('Z', 'Z');
}

function formatRecordShort(record) {
  const timestamp = formatTimestamp(record['@timestamp']);
  const host = record['host.name'] || '-';
  const service = record['service.name'] || '-';
  const level = record['log.level'] || '-';
  const action = record['event.action'] || record['event.code'] || '-';
  const outcome = record['event.outcome'] ? ` outcome=${record['event.outcome']}` : '';
  const user = record['user.id'] ? ` user=${record['user.id']}` : '';
  const sourceIp = record['source.ip'] ? ` ip=${record['source.ip']}` : '';
  const reason = record['event.reason'] ? ` reason=${record['event.reason']}` : '';
  const traceId = record['trace.id'] ? ` trace=${record['trace.id']}` : '';
  const message = record.message || '';

  return `${timestamp} ${host} ${service}[${level}] ${action}${outcome}${user}${sourceIp}${reason}${traceId} msg="${message}"`;
}

function takeLast(items, count) {
  const safeCount = Math.max(0, count);
  return items.slice(Math.max(0, items.length - safeCount));
}

function printShort(filePath, limit) {
  const lines = readLines(filePath).map(parseJsonLine);
  const output = limit ? takeLast(lines, limit) : lines;
  for (const record of output) {
    console.log(formatRecordShort(record));
  }
}

function printTail(filePath, linesCount) {
  const lines = readLines(filePath).map(parseJsonLine);
  const output = takeLast(lines, linesCount);
  for (const record of output) {
    console.log(formatRecordShort(record));
  }
}

function printGrep(pattern, filePath, field, ignoreCase) {
  const matcher = ignoreCase ? pattern.toLowerCase() : pattern;
  const records = readLines(filePath).map(parseJsonLine);

  for (const record of records) {
    const haystackValue = field ? getField(record, field) : JSON.stringify(record);
    if (haystackValue === undefined) continue;
    const haystack = ignoreCase ? String(haystackValue).toLowerCase() : String(haystackValue);
    if (haystack.includes(matcher)) {
      console.log(formatRecordShort(record));
    }
  }
}

function increment(map, key) {
  const bucket = key || 'unknown';
  map[bucket] = (map[bucket] || 0) + 1;
}

function printStats(filePath) {
  const records = readLines(filePath).map(parseJsonLine);
  const byAction = {};
  const byOutcome = {};
  const byLevel = {};
  const byReason = {};

  for (const record of records) {
    increment(byAction, record['event.action']);
    increment(byOutcome, record['event.outcome']);
    increment(byLevel, record['log.level']);
    increment(byReason, record['event.reason']);
  }

  const summary = {
    total: records.length,
    byAction,
    byOutcome,
    byLevel,
    byReason,
  };
  console.log(JSON.stringify(summary, null, 2));
}

function printJson(filePath, limit) {
  const lines = readLines(filePath).map(parseJsonLine);
  const output = limit ? takeLast(lines, limit) : lines;
  console.log(JSON.stringify(output, null, 2));
}

function main() {
  const { command, positionals, options } = parseArgs(process.argv);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  try {
    if (command === 'short') {
      printShort(resolveLogFile(positionals[0]), Number(options.limit || 50));
      return;
    }

    if (command === 'tail') {
      printTail(resolveLogFile(positionals[0]), Number(options.lines || 20));
      return;
    }

    if (command === 'grep') {
      if (!positionals[0]) {
        throw new Error('grep requires a pattern');
      }
      printGrep(positionals[0], resolveLogFile(positionals[1]), options.field, Boolean(options.ignoreCase));
      return;
    }

    if (command === 'stats') {
      printStats(resolveLogFile(positionals[0]));
      return;
    }

    if (command === 'json') {
      printJson(resolveLogFile(positionals[0]), Number(options.limit || 20));
      return;
    }

    throw new Error(`unknown command: ${command}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

main();
