'use strict';

/**
 * Diagnosis cepat satu perintah untuk petugas lab:
 *   npm run checkup
 *
 * Memeriksa: konfigurasi .env, database (integritas + hitungan), status server,
 * file log, backup terbaru, task Windows (Task Scheduler), dan 5 scan terakhir.
 * Tidak mengubah data apa pun. Kode keluar 1 hanya bila ada pemeriksaan GAGAL.
 */

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');

const LEVEL_ICON = { OK: '\u2705', WARN: '\u26a0\ufe0f', FAIL: '\u274c', INFO: '\u2139\ufe0f' };
const counts = { OK: 0, WARN: 0, FAIL: 0, INFO: 0 };

function report(level, label, detail) {
  counts[level] += 1;
  console.log(`  ${LEVEL_ICON[level]} ${label}${detail ? `: ${detail}` : ''}`);
}

function section(title) {
  console.log(`\n-- ${title} --`);
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Ambil beberapa baris terakhir file (tanpa membaca seluruh file). */
function tailFile(filePath, linesCount) {
  let fd = null;
  try {
    const size = fs.statSync(filePath).size;
    if (size === 0) return [];
    fd = fs.openSync(filePath, 'r');
    const chunkSize = Math.min(size, 4096);
    const buf = Buffer.alloc(chunkSize);
    fs.readSync(fd, buf, 0, chunkSize, size - chunkSize);
    return buf.toString('utf8').split(/\r?\n/).filter((l) => l !== '').slice(-linesCount);
  } catch {
    return null;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

/** Server lab hidup? (GET /api/health) */
async function fetchHealth(port) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Apakah port benar-benar terbuka oleh proses lain? */
function portProbe(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(800, () => settle(false));
    socket.once('connect', () => settle(true));
    socket.once('error', () => settle(false));
  });
}

function taskExists(name) {
  try {
    execFileSync('schtasks', ['/query', '/tn', name], {
      windowsHide: true,
      timeout: 5000,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('== Lab Scan KTM - CHECKUP ==');

  // ---------- Konfigurasi ----------
  let config;
  try {
    config = require('../src/config');
  } catch (err) {
    section('Konfigurasi (.env)');
    report('FAIL', 'Config', `tidak bisa dimuat: ${err.message}`);
    process.exit(1);
  }

  section('Konfigurasi (.env)');
  report('INFO', 'Port / Lab', `${config.port} / ${config.labName}`);
  report('INFO', 'Debounce / sambutan', `${config.debounceSeconds} dtk / ${config.welcomeSeconds} dtk`);
  if (config.manualInput) {
    report('WARN', 'Input manual', 'AKTIF (mode uji) - di PC lab dengan scanner: MANUAL_INPUT=false');
  } else {
    report('OK', 'Input manual', 'nonaktif (kiosk murni)');
  }
  if (config.syncEnabled) {
    if (/^https?:\/\//.test(config.monitorUrl)) {
      report('OK', 'Sinkronisasi', `aktif -> ${config.monitorUrl} (interval ${config.syncIntervalSeconds}s)`);
    } else {
      report('FAIL', 'Sinkronisasi', 'SYNC_ENABLED=true tapi MONITOR_URL belum diisi/belum sah');
    }
    if (config.monitorToken) {
      report('OK', 'Token', `terisi (${String(config.monitorToken).length} karakter, disamarkan)`);
    } else {
      report('WARN', 'Token', 'MONITOR_TOKEN kosong - server monitoring pasti menolak (401)');
    }
  } else {
    report('INFO', 'Sinkronisasi', 'nonaktif (SYNC_ENABLED=false) - log menumpuk di lokal sampai diaktifkan');
  }

  // ---------- Database ----------
  section('Database');
  let db = null;
  let DB_PATH = path.join(root, 'data', 'lab.db');
  let todayLocal = null;
  let dbError = null;
  try {
    const dbModule = require('../src/db');
    db = dbModule.db;
    DB_PATH = dbModule.DB_PATH;
    todayLocal = dbModule.todayLocal;
  } catch (err) {
    dbError = err;
  }

  if (dbError) {
    report('FAIL', 'Buka database', `${dbError.message} - ikuti "Backup & pemulihan" di README`);
  } else {
    report('INFO', 'File', `${DB_PATH} (${fmtSize(fs.statSync(DB_PATH).size)})`);
    try {
      const integrity = db.pragma('integrity_check', { simple: true });
      if (integrity === 'ok') report('OK', 'Integritas', 'ok');
      else report('FAIL', 'Integritas', integrity);
    } catch (err) {
      report('FAIL', 'Integritas', err.message);
    }
    try {
      const c = (sql) => db.prepare(sql).get().c;
      const mahasiswa = c('SELECT COUNT(*) c FROM mahasiswa');
      const total = c('SELECT COUNT(*) c FROM scan_log');
      const okCount = c("SELECT COUNT(*) c FROM scan_log WHERE status = 'ok'");
      const notFound = c("SELECT COUNT(*) c FROM scan_log WHERE status = 'not_found'");
      const pending = c('SELECT COUNT(*) c FROM scan_log WHERE synced = 0');
      const today = db
        .prepare("SELECT COUNT(*) c FROM scan_log WHERE status = 'ok' AND substr(scanned_at, 1, 10) = ?")
        .get(todayLocal()).c;
      if (mahasiswa === 0) {
        report('WARN', 'Hitungan', 'mahasiswa=0 - database masih kosong? Jalankan npm run import');
      } else {
        report('OK', 'Hitungan', `mahasiswa=${mahasiswa}`);
      }
      report('INFO', 'Scan log', `total=${total} (ok=${okCount}, tidak terdaftar=${notFound}) | hari ini=${today}`);
      if (pending > 0) report('INFO', 'Menunggu sinkron', `${pending} log (synced=0)`);
    } catch (err) {
      report('FAIL', 'Hitungan', err.message);
    }
  }

  // ---------- Server ----------
  section('Server');
  const healthy = await fetchHealth(config.port);
  if (healthy) {
    report('OK', 'Server', `HIDUP - http://127.0.0.1:${config.port}/api/health merespons`);
  } else {
    const occupied = await portProbe(config.port);
    if (occupied) {
      report('FAIL', 'Server', `port ${config.port} terpakai TETAPI bukan API lab (proses lain?) - lihat logs/server.log`);
    } else {
      report('INFO', 'Server', 'belum berjalan (wajar bila sengaja dimatikan; di PC lab hidup otomatis saat logon)');
    }
  }

  // ---------- Log ----------
  section('Log');
  for (const name of ['server.log', 'sync.log', 'backup.log']) {
    const p = path.join(root, 'logs', name);
    if (!fs.existsSync(p)) {
      report('INFO', `logs/${name}`, 'belum ada (belum pernah jalan)');
      continue;
    }
    const size = fs.statSync(p).size;
    const rotated = size > 1024 * 1024;
    report('INFO', `logs/${name}`, `${fmtSize(size)}${rotated ? ' (dirotasi jadi .old saat server mulai berikutnya)' : ''}`);
    const tail = tailFile(p, 2);
    if (tail && tail.length > 0) {
      for (const line of tail) console.log(`      | ${line}`);
    }
  }

  // ---------- Backup ----------
  section('Backup');
  const backupDir = path.join(path.dirname(DB_PATH), 'backups');
  let backupFiles = [];
  try {
    backupFiles = fs.readdirSync(backupDir).filter((f) => /^lab-\d{14}\.db$/.test(f)).sort();
  } catch {
    backupFiles = [];
  }
  if (backupFiles.length === 0) {
    report('WARN', 'Backup', 'belum ada file - jalankan npm run backup (atau tunggu task harian jam 17:00)');
  } else {
    const newest = backupFiles[backupFiles.length - 1];
    const newestPath = path.join(backupDir, newest);
    try {
      const Database = require('better-sqlite3');
      const b = new Database(newestPath, { readonly: true, fileMustExist: true });
      const integrity = b.pragma('integrity_check', { simple: true });
      const mhs = b.prepare('SELECT COUNT(*) c FROM mahasiswa').get().c;
      b.close();
      const detail = `${newest} (${fmtSize(fs.statSync(newestPath).size)}, total ${backupFiles.length} file, ${mhs} mahasiswa)`;
      if (integrity === 'ok') report('OK', 'Backup terbaru', detail);
      else report('FAIL', 'Backup terbaru', `${newest} integrity=${integrity}`);
    } catch (err) {
      report('FAIL', 'Backup terbaru', `${newest} tidak bisa dibuka: ${err.message}`);
    }
  }

  // ---------- Task Windows ----------
  section('Task Windows (Task Scheduler)');
  if (process.platform !== 'win32') {
    report('INFO', 'Task', 'hanya bisa dicek di Windows');
  } else {
    const tasks = [
      ['LabScanKTM-Server', 'server saat logon'],
      ['LabScanKTM-Backup', 'backup harian 17:00'],
    ];
    for (const [name, desc] of tasks) {
      if (taskExists(name)) report('OK', `Task ${name}`, `terdaftar (${desc})`);
      else report('WARN', `Task ${name}`, 'BELUM terdaftar - jalankan scripts\\setup-task.ps1');
    }
  }

  // ---------- 5 scan terakhir ----------
  section('5 scan terakhir');
  if (db) {
    try {
      const rows = db
        .prepare('SELECT scanned_at, nim, status, synced FROM scan_log ORDER BY scanned_at DESC, id DESC LIMIT 5')
        .all();
      if (rows.length === 0) {
        report('INFO', 'Scan', 'belum ada scan');
      } else {
        for (const r of rows) {
          console.log(`      ${r.scanned_at} | ${r.nim} | ${r.status} | ${r.synced ? 'tersinkron' : 'menunggu'}`);
        }
      }
    } catch (err) {
      report('FAIL', 'Riwayat scan', err.message);
    }
  }

  // ---------- Ringkasan ----------
  console.log('\n== Ringkasan ==');
  console.log(`  ${LEVEL_ICON.OK} ${counts.OK}  ${LEVEL_ICON.WARN} ${counts.WARN}  ${LEVEL_ICON.FAIL} ${counts.FAIL}  ${LEVEL_ICON.INFO} ${counts.INFO}`);
  if (counts.FAIL > 0) {
    console.log('  Hasil: ADA MASALAH - perbaiki pemeriksaan berlambang merah dulu.');
  } else if (counts.WARN > 0) {
    console.log('  Hasil: SEHAT, dengan catatan (kuning) yang perlu diperhatikan.');
  } else {
    console.log('  Hasil: SEHAT.');
  }
  process.exitCode = counts.FAIL > 0 ? 1 : 0;

  if (db) {
    try {
      db.close();
    } catch {
      /* sudah tertutup */
    }
  }
}

main().catch((err) => {
  console.error('Checkup gagal berjalan:', err && err.message ? err.message : err);
  process.exit(1);
});
