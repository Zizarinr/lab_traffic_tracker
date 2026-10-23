'use strict';

/**
 * Export log scan dari data/lab.db ke file Excel (.xlsx).
 *
 * READ-ONLY: koneksi database dibuka dengan { readonly: true } (fallback query_only),
 * sehingga TIDAK ada INSERT/UPDATE/DELETE ke database kiosk.
 *
 * Pemakaian:
 *   npm run report
 *   npm run report -- --from 2026-10-22 --to 2026-10-24
 *   npm run report -- --out D:\laporan\lab.xlsx
 */

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const XLSX = require('xlsx');

const DB_PATH = path.join(__dirname, '..', 'data', 'lab.db');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function usage() {
  console.log(`
Pemakaian: npm run report -- [opsi]

Opsi:
  --from YYYY-MM-DD   hanya scan mulai tanggal ini (waktu WIB)
  --to   YYYY-MM-DD   hanya scan sampai tanggal ini (waktu WIB)
  --out  <path>       lokasi file hasil (default: reports/laporan-traffic-<waktu>.xlsx)
  -h, --help          tampilkan bantuan ini

Contoh:
  npm run report
  npm run report -- --from 2026-10-22 --to 2026-10-24
  npm run report -- --out D:\\laporan\\lab.xlsx
`);
}

function isRealDate(value) {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseArgs(argv) {
  const opts = { from: null, to: null, out: null, help: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const match = /^--(from|to|out)(?:=(.*))?$/.exec(arg);

    if (!match) {
      if (arg === '--help' || arg === '-h') {
        opts.help = true;
        continue;
      }
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }

    const value = match[2] !== undefined ? match[2] : argv[++i];
    if (!value) throw new Error(`Nilai untuk --${match[1]} kosong.`);
    opts[match[1]] = value;
  }

  for (const key of ['from', 'to']) {
    if (opts[key] === null) continue;
    if (!isRealDate(opts[key])) {
      throw new Error(`Format --${key} harus tanggal valid YYYY-MM-DD (contoh: 2026-10-24).`);
    }
  }

  if (opts.from && opts.to && opts.from > opts.to) {
    throw new Error('Nilai --from harus sama atau lebih awal dari --to.');
  }

  return opts;
}

/** Waktu lokal WIB (Asia/Jakarta) sebagai bagian nama file, mis. 20261024-143000. */
function localStamp() {
  const formatted = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date()); // "YYYY-MM-DD HH:MM:SS"

  const [date, time] = formatted.split(' ');
  return `${date.replace(/-/g, '')}-${time.replace(/:/g, '')}`;
}

/**
 * Buka database dalam mode baca-saja. Fallback ke koneksi normal + query_only
 * bila mode readonly menolak (mis. sisa WAL/SHM pada beberapa versi SQLite).
 */
function openReadOnly() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Database tidak ditemukan: ${DB_PATH}\nJalankan aplikasi atau import data terlebih dahulu.`);
  }

  try {
    return new Database(DB_PATH, { readonly: true, fileMustExist: true });
  } catch {
    const db = new Database(DB_PATH);
    db.pragma('query_only = ON');
    return db;
  }
}

function buildFilter(opts) {
  const clauses = [];
  const params = [];

  if (opts.from) {
    clauses.push('substr(scanned_at, 1, 10) >= ?');
    params.push(opts.from);
  }
  if (opts.to) {
    clauses.push('substr(scanned_at, 1, 10) <= ?');
    params.push(opts.to);
  }

  return { sql: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', params };
}

function makeSheet(rows, widths) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  return sheet;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }

  const filter = buildFilter(opts);
  const db = openReadOnly();

  let daily;
  let scans;
  let perStudent;

  try {
    daily = db
      .prepare(
        `SELECT substr(scanned_at, 1, 10) AS tanggal,
                SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS hadir,
                SUM(CASE WHEN status = 'not_found' THEN 1 ELSE 0 END) AS tidak_terdaftar,
                COUNT(*) AS total,
                COUNT(DISTINCT CASE WHEN status = 'ok' THEN nim END) AS mahasiswa_unik
         FROM scan_log${filter.sql}
         GROUP BY tanggal
         ORDER BY tanggal`
      )
      .all(...filter.params);

    scans = db
      .prepare(
        `SELECT scanned_at, nim, nama, kelas, semester, status, synced, synced_at
         FROM scan_log${filter.sql}
         ORDER BY scanned_at`
      )
      .all(...filter.params);

    const studentWhere = filter.sql
      ? `${filter.sql} AND status = 'ok'`
      : " WHERE status = 'ok'";

    perStudent = db
      .prepare(
        `SELECT nim,
                MAX(nama) AS nama,
                MAX(kelas) AS kelas,
                MAX(semester) AS semester,
                COUNT(*) AS kunjungan,
                MIN(scanned_at) AS pertama,
                MAX(scanned_at) AS terakhir
         FROM scan_log${studentWhere}
         GROUP BY nim
         ORDER BY kunjungan DESC, nama ASC`
      )
      .all(...filter.params);
  } finally {
    db.close();
  }

  const dailyRows = daily.map((r) => ({
    Tanggal: r.tanggal,
    'Hadir (ok)': r.hadir,
    'Tidak terdaftar (not_found)': r.tidak_terdaftar,
    'Total kejadian scan': r.total,
    'Mahasiswa unik': r.mahasiswa_unik,
  }));

  const scanRows = scans.map((r) => ({
    'Waktu (WIB)': r.scanned_at,
    NIM: r.nim,
    Nama: r.nama ?? '',
    Kelas: r.kelas ?? '',
    Semester: r.semester ?? '',
    Status: r.status,
    'Terkirim ke monitoring': r.synced === 1 ? 'Ya' : 'Belum',
    'Waktu terkirim': r.synced_at ?? '',
  }));

  const studentRows = perStudent.map((r) => ({
    NIM: r.nim,
    Nama: r.nama ?? '',
    Kelas: r.kelas ?? '',
    Semester: r.semester ?? '',
    'Jumlah kunjungan': r.kunjungan,
    'Scan pertama': r.pertama,
    'Scan terakhir': r.terakhir,
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, makeSheet(dailyRows, [14, 12, 26, 22, 16]), 'Ringkasan Per Hari');
  XLSX.utils.book_append_sheet(workbook, makeSheet(scanRows, [28, 18, 28, 10, 10, 12, 22, 28]), 'Semua Scan');
  XLSX.utils.book_append_sheet(workbook, makeSheet(studentRows, [18, 28, 10, 10, 18, 28, 28]), 'Rekap Per Mahasiswa');

  const stamp = localStamp();
  const outPath = opts.out
    ? path.resolve(opts.out)
    : path.join(REPORTS_DIR, `laporan-traffic-${stamp}.xlsx`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  XLSX.writeFile(workbook, outPath);

  const range = opts.from || opts.to ? `${opts.from ?? '(awal)'} s/d ${opts.to ?? '(akhir)'}` : 'semua data';

  console.log('== Lab Scan KTM - EXPORT LAPORAN ==');
  console.log(`  ℹ️ Rentang       : ${range}`);
  console.log(`  ℹ️ Database      : ${DB_PATH}`);
  console.log('  ✅ Akses         : READ-ONLY (database tidak diubah)');
  console.log(`  ℹ️ Baris scan    : ${scanRows.length}`);
  console.log(`  ℹ️ Ringkasan     : ${dailyRows.length} hari, ${studentRows.length} mahasiswa (hadir)`);
  console.log(`  ✅ File dibuat   : ${outPath}`);

  if (scanRows.length === 0) {
    console.log('  ⚠️ Tidak ada data scan pada rentang ini — file tetap dibuat dengan sheet kosong.');
  }
}

try {
  main();
} catch (err) {
  console.error(`GAGAL: ${err.message}`);
  process.exitCode = 1;
}
