'use strict';

/**
 * Backup database dengan SQLite online backup API.
 * Aman dijalankan walau server kiosk masih hidup (tidak perlu berhenti).
 *
 * Pemakaian:
 *   node scripts/backup.js                    -> data/backups/lab-YYYYMMDD-HHMMSS.db
 *   node scripts/backup.js <folderTujuan>     -> simpan ke folder pilihan
 *   node scripts/backup.js --keep=10          -> sisakan 10 backup terbaru (dihapus sisanya)
 *
 * Kembalian (kode keluar): 0 = sukses, 1 = gagal.
 */

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const { db, DB_PATH } = require('../src/db');

function timestamp() {
  // Nama file: lab-20261019-134500.db (urut secara leksikografis = urut waktu)
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  return fmt.format(new Date()).replace(/[-: ]/g, '');
}

function parseArgs(argv) {
  const out = { destDir: null, keep: 0 };
  for (const arg of argv) {
    const keep = arg.match(/^--keep=(\d+)$/);
    if (keep) out.keep = parseInt(keep[1], 10);
    else if (!arg.startsWith('--')) out.destDir = arg;
  }
  return out;
}

async function main() {
  const { destDir, keep } = parseArgs(process.argv.slice(2));

  const targetDir = destDir
    ? path.resolve(destDir)
    : path.join(path.dirname(DB_PATH), 'backups');
  fs.mkdirSync(targetDir, { recursive: true });

  const destFile = path.join(targetDir, `lab-${timestamp()}.db`);

  console.log(`Sumber : ${DB_PATH}`);
  console.log(`Target : ${destFile}`);

  // Online backup: salinan konsisten walau server sedang menulis (WAL).
  await db.backup(destFile);

  // Jadikan berkas tunggal: keluar dari mode WAL agar -wal/-shm ikut
  // tergabung dan cadangan bisa disalin sebagai SATU file (mis. ke flashdisk).
  const target = new Database(destFile);
  target.pragma('journal_mode = DELETE');
  target.close();

  // Verifikasi: buka hasil backup dan jalankan integrity_check.
  const backup = new Database(destFile, { readonly: true });
  const integrity = backup.pragma('integrity_check', { simple: true });
  backup.close();

  const size = fs.statSync(destFile).size;
  console.log(`Ukuran : ${size} bytes`);
  if (integrity !== 'ok') {
    console.error(`GAGAL: integrity_check = ${integrity}`);
    process.exit(1);
  }
  console.log('Integrity: ok');

  if (keep > 0) {
    const files = fs.readdirSync(targetDir)
      .filter((f) => /^lab-\d{14}\.db$/.test(f))
      .sort();
    const excess = files.length - keep;
    if (excess > 0) {
      for (const f of files.slice(0, excess)) {
        fs.rmSync(path.join(targetDir, f));
        console.log(`Buang : ${f} (lebih dari --keep=${keep})`);
      }
    }
  }

  console.log('');
  console.log('Selesai. Simpan juga salinan ke tempat lain (flashdisk/cloud) secara berkala.');
}

main().catch((err) => {
  console.error('Backup gagal:', err.message);
  process.exitCode = 1;
}).finally(() => {
  try { db.close(); } catch { /* sudah tertutup */ }
});
