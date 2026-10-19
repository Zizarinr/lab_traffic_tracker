'use strict';

// Server monitoring tiruan untuk uji Fase 2 (tidak untuk produksi).
//   node scripts/mock-monitor.js [--port=4000] [--token=secret-token] [--mode=ok] [--delay=3000]
//
// Mode perilaku (bisa diubah saat jalan lewat POST /control/mode):
//   ok           -> 200 + { accepted: [semua id] }
//   partial      -> 200 + { accepted: [separuh id] }
//   no-accepted  -> 200 tanpa daftar accepted (seluruh batch dianggap diterima)
//   unauthorized -> 401
//   bad-request  -> 400
//   error        -> 500
//   timeout      -> tidak pernah menjawab (menguji timeout klien)
//   slow         -> menjawab 200 setelah --delay ms
//   drop         -> data tercatat lalu koneksi diputus (respons hilang)

const express = require('express');

const MODES = ['ok', 'partial', 'no-accepted', 'unauthorized', 'bad-request', 'error', 'timeout', 'slow', 'drop'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startMockMonitor(options = {}) {
  const port = Number(options.port || 4000);
  const token = options.token || 'secret-token';
  const delayMs = Number(options.delayMs || 3000);
  const quiet = options.quiet === true;

  const state = {
    mode: MODES.includes(options.mode) ? options.mode : 'ok',
    token,
    requests: 0,
    batches: 0,
    unauthorized: 0,
    received: new Map(),
    duplicates: 0,
    lastAt: null,
  };
  const log = (...args) => {
    if (!quiet) console.log('[mock-monitor]', ...args);
  };

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  function respondOk(res, records) {
    res.json({ accepted: records.map((r) => r.id) });
  }

  app.post('/api/lab/traffic', async (req, res) => {
    state.requests += 1;

    const auth = req.get('authorization') || '';
    if (auth !== `Bearer ${token}`) {
      state.unauthorized += 1;
      log(`401 unauthorized (header="${auth}")`);
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const body = req.body || {};
    const records = Array.isArray(body.records) ? body.records : [];
    state.batches += 1;
    state.lastAt = new Date().toISOString();

    for (const record of records) {
      const id = String(record.id);
      if (state.received.has(id)) state.duplicates += 1;
      else state.received.set(id, record);
    }
    log(
      `batch=${records.length} lab=${body.lab || '-'} mode=${state.mode} total_id=${state.received.size} dup=${state.duplicates}`
    );

    switch (state.mode) {
      case 'unauthorized':
        res.status(401).json({ error: 'unauthorized' });
        return;
      case 'bad-request':
        res.status(400).json({ error: 'bad_request' });
        return;
      case 'error':
        res.status(500).json({ error: 'server_error' });
        return;
      case 'timeout':
        return; // sengaja tidak menjawab sama sekali
      case 'slow':
        await sleep(delayMs);
        respondOk(res, records);
        return;
      case 'drop':
        // Data sudah tercatat, tetapi respons hilang (koneksi diputus).
        if (res.socket) res.socket.destroy();
        return;
      case 'partial': {
        const half = records.slice(0, Math.ceil(records.length / 2));
        res.json({ accepted: half.map((r) => r.id) });
        return;
      }
      case 'no-accepted':
        res.json({});
        return;
      default:
        respondOk(res, records);
    }
  });

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.get('/control/state', (req, res) => {
    res.json({
      mode: state.mode,
      token: state.token,
      requests: state.requests,
      batches: state.batches,
      unauthorized: state.unauthorized,
      received: state.received.size,
      duplicates: state.duplicates,
      lastAt: state.lastAt,
    });
  });

  app.get('/control/received', (req, res) => {
    res.json({ count: state.received.size, records: [...state.received.values()] });
  });

  app.post('/control/mode', (req, res) => {
    const mode = req.body && req.body.mode;
    if (!MODES.includes(mode)) {
      res.status(400).json({ error: 'bad_mode', modes: MODES });
      return;
    }
    state.mode = mode;
    log(`mode -> ${mode}`);
    res.json({ mode });
  });

  app.post('/control/reset', (req, res) => {
    state.requests = 0;
    state.batches = 0;
    state.unauthorized = 0;
    state.received.clear();
    state.duplicates = 0;
    state.lastAt = null;
    res.json({ ok: true });
  });

  const server = app.listen(port, '127.0.0.1', () => {
    log(`listen http://127.0.0.1:${port} | mode=${state.mode} | token=${token}`);
  });

  return {
    port,
    url: `http://127.0.0.1:${port}/api/lab/traffic`,
    state,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function parseArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function main() {
  const monitor = startMockMonitor({
    port: parseArg('port', 4000),
    token: parseArg('token', process.env.MOCK_TOKEN || 'secret-token'),
    mode: parseArg('mode', 'ok'),
    delayMs: parseArg('delay', 3000),
  });
  console.log('Kontrol:');
  console.log(`  GET  http://127.0.0.1:${monitor.port}/control/state`);
  console.log(`  POST http://127.0.0.1:${monitor.port}/control/mode   body {"mode":"timeout"}`);
  console.log(`  POST http://127.0.0.1:${monitor.port}/control/reset`);
  console.log(`Mode tersedia: ${MODES.join(', ')}`);
}

if (require.main === module) main();

module.exports = { startMockMonitor, MODES };
