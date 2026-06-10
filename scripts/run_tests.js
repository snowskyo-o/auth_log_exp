const http = require('node:http');

const CASES = [
  { name: 'success-1', userId: '2024000001', password: 'Study2026!', sourceIp: '127.0.0.1' },
  { name: 'bad-password', userId: '2024000001', password: 'wrongpass', sourceIp: '127.0.0.1' },
  { name: 'invalid-userid', userId: 'abc', password: 'x', sourceIp: '127.0.0.1' },
];

async function post(body) {
  const data = JSON.stringify(body);
  const options = {
    hostname: 'localhost',
    port: process.env.PORT || 3004,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  };
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); } catch (e) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('running tests against http://localhost:' + (process.env.PORT || 3004));
  for (const c of CASES) {
    console.log('\n---', c.name);
    try {
      const r = await post({ userId: c.userId, password: c.password, sourceIp: c.sourceIp });
      console.log('status', r.status);
      console.log('body', JSON.stringify(r.body));
    } catch (e) {
      console.error('error', e && e.message);
    }
  }
  // simulate repeated failures to trigger lock
  console.log('\n--- simulate lock (5 failures)');
  for (let i = 0; i < 6; i++) {
    const r = await post({ userId: '2024000002', password: 'bad', sourceIp: '127.0.0.2' });
    console.log(i + 1, r.status, JSON.stringify(r.body));
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
