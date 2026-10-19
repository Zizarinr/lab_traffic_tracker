'use strict';

const path = require('node:path');
const express = require('express');

const config = require('./src/config');
const { db, DB_PATH } = require('./src/db');
const { handleScan, getStats } = require('./src/scan');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8kb' }));

// Halaman kiosk (aset lokal, tanpa CDN).
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Konfigurasi yang dibutuhkan UI (nama lab, durasi sambutan, mode input manual).
app.get('/api/config', (req, res) => {
  res.json({
    lab_name: config.labName,
    welcome_seconds: config.welcomeSeconds,
    manual_input: config.manualInput,
  });
});

app.get('/api/stats', (req, res) => {
  res.json(getStats(db));
});

app.post('/api/scan', (req, res) => {
  const nim = req.body ? req.body.nim : undefined;
  const { httpStatus, body } = handleScan(db, nim);
  res.status(httpStatus).json(body);
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Endpoint tidak dikenal.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err.status === 400)) {
    res.status(400).json({ error: 'bad_json', message: 'Body JSON tidak sah.' });
    return;
  }
  console.error('[server] error:', err && err.message ? err.message : err);
  res.status(500).json({ error: 'internal' });
});

let syncWorker = null;
let syncLogger = null;

const server = app.listen(config.port, '127.0.0.1', () => {
  console.log('Lab Scan KTM siap.');
  console.log(`  URL      : http://127.0.0.1:${config.port}`);
  console.log(`  Lab      : ${config.labName}`);
  console.log(`  Database : ${DB_PATH}`);
  console.log(`  Debounce : ${config.debounceSeconds} detik`);
  console.log(`  Sambutan : ${config.welcomeSeconds} detik`);
  console.log(`  Input    : ${config.manualInput ? 'manual (uji)' : 'scanner kiosk'}`);

  // Fase 2: worker sinkronisasi.
  if (!config.syncEnabled) {
    console.log('  Sync     : nonaktif (SYNC_ENABLED=false)');
    return;
  }
  if (!/^https?:\/\//.test(config.monitorUrl)) {
    console.warn('  Sync     : SYNC_ENABLED=true tapi MONITOR_URL belum diisi/belum sah -> tidak dijalankan.');
    return;
  }
  const { createSyncWorker, createLogger } = require('./src/sync');
  syncLogger = createLogger(path.join(__dirname, 'logs', 'sync.log'));
  syncWorker = createSyncWorker({ db, cfg: config, logger: syncLogger });
  syncWorker.start();
  console.log(`  Sync     : aktif -> ${config.monitorUrl} (interval ${config.syncIntervalSeconds}s)`);
});

function shutdown() {
  if (syncWorker) syncWorker.stop();
  server.close(() => {
    if (syncLogger) syncLogger.close();
    try {
      db.close();
    } catch (err) {
      /* abaikan */
    }
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
