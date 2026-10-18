'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'lab.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

// N3: data tidak hilang saat PC restart / listrik mati.
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
CREATE TABLE IF NOT EXISTS mahasiswa (
  nim       TEXT PRIMARY KEY,
  nama      TEXT NOT NULL,
  semester  INTEGER,
  kelas     TEXT
);

CREATE TABLE IF NOT EXISTS scan_log (
  id          TEXT PRIMARY KEY,       -- UUID, dipakai dedup di monitoring
  nim         TEXT NOT NULL,
  nama        TEXT,                   -- salinan saat scan (NULL jika tidak terdaftar)
  kelas       TEXT,
  semester    INTEGER,
  scanned_at  TEXT NOT NULL,          -- ISO 8601 dengan +07:00
  status      TEXT NOT NULL,          -- 'ok' | 'not_found'
  synced      INTEGER NOT NULL DEFAULT 0,
  synced_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_scan_log_synced ON scan_log(synced, scanned_at);
CREATE INDEX IF NOT EXISTS idx_scan_log_nim_time ON scan_log(nim, scanned_at);
`);

/** Waktu sekarang sebagai ISO 8601 dengan offset +07:00 (Asia/Jakarta). */
function nowIso() {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  // sv-SE menghasilkan "YYYY-MM-DD HH:MM:SS"
  return fmt.format(new Date()).replace(' ', 'T') + '+07:00';
}

/** Tanggal lokal +07:00 dalam format YYYY-MM-DD (untuk hitung "hari ini"). */
function todayLocal() {
  return nowIso().slice(0, 10);
}

module.exports = { db, DB_PATH, nowIso, todayLocal };
