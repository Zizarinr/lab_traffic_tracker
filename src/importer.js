'use strict';

const XLSX = require('xlsx');

const REQUIRED_COLUMNS = ['nim', 'nama'];
const KNOWN_COLUMNS = ['nim', 'nama', 'semester', 'kelas'];

/**
 * Ubah nilai sel jadi teks NIM yang bersih.
 * Angka (mis. Excel menyimpannya sebagai number) dikonversi tanpa notasi ilmiah.
 * Selalu dipertahankan angka nol di depan bila tersimpan sebagai teks.
 */
function toNimText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toFixed(0) : String(value).trim();
  }
  return String(value).trim();
}

function toText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function toSemester(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isInteger(value) ? value : Math.trunc(value);
  const text = String(value).trim();
  if (text === '') return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Normalisasi header: trim + huruf kecil. */
function normalizeHeader(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

/**
 * Baca file Excel dan kembalikan { rows, skipped } untuk di-upsert.
 * rows: [{ rowNumber, nim, nama, semester, kelas }]
 * skipped: [{ rowNumber, reason }]
 */
function readWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('File Excel tidak punya sheet apa pun.');
  }
  const sheet = workbook.Sheets[sheetName];
  // raw: true -> ambil nilai asli sel, bukan teks tampilan (hindari notasi ilmiah).
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: false });
  if (matrix.length === 0) {
    throw new Error('Sheet pertama kosong.');
  }

  const headerRow = matrix[0].map(normalizeHeader);
  const columnIndex = {};
  for (const name of KNOWN_COLUMNS) {
    const idx = headerRow.indexOf(name);
    if (idx !== -1) columnIndex[name] = idx;
  }

  const missing = REQUIRED_COLUMNS.filter((name) => columnIndex[name] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Kolom wajib tidak ditemukan: ${missing.join(', ')}. ` +
        `Header terbaca: ${headerRow.filter(Boolean).join(', ') || '(kosong)'}`
    );
  }

  const rows = [];
  const skipped = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const rowNumber = r + 1; // nomor baris seperti di Excel (header = baris 1)
    const line = matrix[r] || [];
    const nim = toNimText(columnIndex.nim !== undefined ? line[columnIndex.nim] : null);
    const nama = toText(columnIndex.nama !== undefined ? line[columnIndex.nama] : null);

    if (nim === '' || nama === null) {
      skipped.push({
        rowNumber,
        reason: nim === '' ? 'NIM kosong' : 'Nama kosong',
      });
      continue;
    }

    rows.push({
      rowNumber,
      nim,
      nama,
      semester: columnIndex.semester !== undefined ? toSemester(line[columnIndex.semester]) : null,
      kelas: columnIndex.kelas !== undefined ? toText(line[columnIndex.kelas]) : null,
    });
  }

  return { sheetName, rows, skipped };
}

/**
 * Import data mahasiswa dari file Excel ke database.
 * @param {import('better-sqlite3').Database} db
 * @param {string} filePath
 * @param {{ replace?: boolean }} [options]
 */
function importExcel(db, filePath, options = {}) {
  const replace = options.replace === true;
  const { sheetName, rows, skipped } = readWorkbook(filePath);

  const findStmt = db.prepare('SELECT 1 FROM mahasiswa WHERE nim = ?');
  const upsertStmt = db.prepare(`
    INSERT INTO mahasiswa (nim, nama, semester, kelas)
    VALUES (@nim, @nama, @semester, @kelas)
    ON CONFLICT(nim) DO UPDATE SET
      nama = excluded.nama,
      semester = excluded.semester,
      kelas = excluded.kelas
  `);

  let inserted = 0;
  let updated = 0;

  const run = db.transaction((items) => {
    for (const item of items) {
      const exists = findStmt.get(item.nim);
      upsertStmt.run(item);
      if (exists) updated += 1;
      else inserted += 1;
    }

    if (replace) {
      // Hapus mahasiswa yang tidak ada di file.
      const placeholders = items.map(() => '?').join(',');
      if (items.length === 0) {
        db.prepare('DELETE FROM mahasiswa').run();
      } else {
        db.prepare(`DELETE FROM mahasiswa WHERE nim NOT IN (${placeholders})`).run(
          ...items.map((item) => item.nim)
        );
      }
    }
  });

  run(rows);

  return {
    filePath,
    sheetName,
    read: rows.length + skipped.length,
    inserted,
    updated,
    skipped,
    replaced: replace,
  };
}

/** Cetak ringkasan hasil import ke stdout. */
function printSummary(summary) {
  console.log(`File       : ${summary.filePath}`);
  console.log(`Sheet      : ${summary.sheetName}`);
  console.log(`Dibaca     : ${summary.read} baris`);
  console.log(`Ditambah   : ${summary.inserted}`);
  console.log(`Diperbarui : ${summary.updated}`);
  console.log(`Dilewati   : ${summary.skipped.length}`);
  for (const item of summary.skipped) {
    console.log(`  - baris ${item.rowNumber}: ${item.reason}`);
  }
  if (summary.replaced) {
    console.log('Mode --replace aktif: mahasiswa di luar file sudah dihapus.');
  }
}

module.exports = { importExcel, printSummary, readWorkbook };
