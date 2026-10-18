'use strict';

// Membuat file Excel contoh untuk uji import:
//   node scripts/make-fixture.js
// Menghasilkan: fixtures/mahasiswa-sample.xlsx
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const OUT_DIR = path.join(__dirname, '..', 'fixtures');
const OUT_FILE = path.join(OUT_DIR, 'mahasiswa-sample.xlsx');

// Header sengaja HURUF BESAR untuk menguji pencocokan tanpa sensitif huruf.
const rows = [
  ['NIM', 'NAMA', 'SEMESTER', 'KELAS'],
  ['4420231001', 'BUDI SANTOSO', 3, 'A'],
  ['4420231002', 'SITI AMINAH', 3, 'A'],
  ['4420231003', 'ANDI WIJAYA', 5, 'B'],
  ['00123456', 'RINA MARLINA', 5, 'B'], // NIM berawalan nol (harus tetap teks)
  ['00998877', 'JOKO SUSILO', 1, 'C'], // NIM berawalan nol
  ['442023123456789', 'DEWI LESTARI', 7, 'C'], // NIM sangat panjang
  [4420231004, 'AGUS PRATAMA', 3, 'A'], // NIM disimpan sebagai angka (uji konversi)
  ['4420231005', '  NUR HIDAYAT  ', '3', ' A '], // spasi berlebih + semester/kelas sebagai teks
  ['4420231006', 'MAYA SARI', 3, 'A'],
  ['4420231007', 'EKO PRASETYO', 5, 'B'],
  ['4420231008', 'LILIS SURYANI', 5, 'B'],
  ['4420231009', 'HENDRA GUNAWAN', 7, 'C'],
  ['4420231010', 'FITRI HANDAYANI', 7, 'C'],
  ['4420231003', 'ANDI WIJAYA (DATA BARU)', 3, 'A'], // duplikat NIM -> uji upsert (update)
  ['', 'TANPA NIM', 3, 'A'], // baris rusak: NIM kosong -> dilewati
  ['4420231011', '', 3, 'A'], // baris rusak: nama kosong -> dilewati
  ['4420231012', 'RUDI HARTONO', 1, 'C'],
];

const worksheet = XLSX.utils.aoa_to_sheet(rows);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Mahasiswa');

fs.mkdirSync(OUT_DIR, { recursive: true });
XLSX.writeFile(workbook, OUT_FILE);

console.log(`Fixture dibuat: ${OUT_FILE}`);
console.log(`Total baris data (tanpa header): ${rows.length - 1}`);
