'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function toNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function toText(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

const config = {
  port: toNumber('PORT', 3000),
  labName: toText('LAB_NAME', 'LAB KOMPUTER'),

  debounceSeconds: toNumber('DEBOUNCE_SECONDS', 10),
  welcomeSeconds: toNumber('WELCOME_SECONDS', 3),

  syncEnabled: toText('SYNC_ENABLED', 'false').toLowerCase() === 'true',
  syncIntervalSeconds: toNumber('SYNC_INTERVAL_SECONDS', 300),
  syncBatchSize: toNumber('SYNC_BATCH_SIZE', 100),
  syncTimeoutSeconds: toNumber('SYNC_TIMEOUT_SECONDS', 10),
  monitorUrl: toText('MONITOR_URL', ''),
  monitorToken: toText('MONITOR_TOKEN', ''),
};

module.exports = config;
