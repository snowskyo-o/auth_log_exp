const fs = require('node:fs');
const path = require('node:path');

const logFile = process.argv[2] || path.join(__dirname, '..', 'logs', 'app.jsonl');

function main() {
  const text = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
  const lines = text.split(/\r?\n/).filter(Boolean);
  const counts = new Map();

  for (const line of lines) {
    try {
      const item = JSON.parse(line);
      const key = item.event || 'unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
    } catch {
      counts.set('parse_error', (counts.get('parse_error') || 0) + 1);
    }
  }

  const summary = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  console.log(JSON.stringify({ logFile, events: summary }, null, 2));
}

main();
