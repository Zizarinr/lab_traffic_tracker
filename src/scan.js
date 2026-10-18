'use strict';

const crypto = require('node:crypto');
const config = require('./config');
const { nowIso, todayLocal } = require('./db');

const NIM_MIN_LENGTH = 3;
const NIM_MAX_LENGTH = 32;

/** Validasi + normalisasi NIM dari request. Kembalikan null jika tidak sah. */
function validateNim(raw) {
  if (typeof raw !== 'string') return null;
  const nim = raw.trim();
  if (nim.length < NIM_MIN_LENGTH || nim.length > NIM_MAX_LENGTH) return null;
  return nim;
}

function findMahasiswa(db, nim) {
  return (
    db.prepare('SELECT nim, nama, semester, kelas FROM mahasiswa WHERE nim = ?').get(nim) || null
  );
}

function lastScanFor(db, nim) {
  return (
    db
      .prepare('SELECT id, scanned_at FROM scan_log WHERE nim = ? ORDER BY scanned_at DESC LIMIT 1')
      .get(nim) || null
  );
}

/** True bila scan NIM yang sama masih dalam jendela debounce. */
function isDuplicate(previous, nowMs) {
  if (!previous) return false;
  const previousMs = Date.parse(previous.scanned_at);
  if (Number.isNaN(previousMs)) return false;
  return nowMs - previousMs < config.debounceSeconds * 1000;
}

const insertLogStmt = () => `
  INSERT INTO scan_log (id, nim, nama, kelas, semester, scanned_at, status, synced)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0)
`;

/**
 * Proses satu scan dari browser kiosk.
 * @returns {{ httpStatus: number, body: object }}
 */
function handleScan(db, rawNim) {
  const nim = validateNim(rawNim);
  if (nim === null) {
    return {
      httpStatus: 400,
      body: {
        error: 'invalid_nim',
        message: `NIM wajib berupa teks ${NIM_MIN_LENGTH}-${NIM_MAX_LENGTH} karakter.`,
      },
    };
  }

  const nowMs = Date.now();
  const mahasiswa = findMahasiswa(db, nim);
  const previous = lastScanFor(db, nim);

  // F4: abaikan scan NIM yang sama dalam jendela debounce.
  if (isDuplicate(previous, nowMs)) {
    const body = {
      status: mahasiswa ? 'ok' : 'not_found',
      duplicate: true,
      nim,
      scanned_at: previous.scanned_at,
    };
    if (mahasiswa) {
      body.nama = mahasiswa.nama;
      body.kelas = mahasiswa.kelas;
      body.semester = mahasiswa.semester;
    }
    return { httpStatus: 200, body };
  }

  const scannedAt = nowIso();
  const status = mahasiswa ? 'ok' : 'not_found';
  const id = crypto.randomUUID();

  db.prepare(insertLogStmt()).run(
    id,
    nim,
    mahasiswa ? mahasiswa.nama : null,
    mahasiswa ? mahasiswa.kelas : null,
    mahasiswa ? mahasiswa.semester : null,
    scannedAt,
    status
  );

  const body = { status, duplicate: false, nim, scanned_at: scannedAt };
  if (mahasiswa) {
    body.nama = mahasiswa.nama;
    body.kelas = mahasiswa.kelas;
    body.semester = mahasiswa.semester;
  }
  return { httpStatus: 200, body };
}

/** F7: statistik untuk layar standby. */
function getStats(db) {
  const today = todayLocal();
  const todayCount = db
    .prepare("SELECT COUNT(*) AS c FROM scan_log WHERE status = 'ok' AND substr(scanned_at, 1, 10) = ?")
    .get(today).c;
  const pendingSync = db.prepare('SELECT COUNT(*) AS c FROM scan_log WHERE synced = 0').get().c;
  return { today: todayCount, pending_sync: pendingSync };
}

module.exports = { handleScan, getStats, validateNim };
