'use strict';

// CLI: node scripts/import-excel.js <file.xlsx> [--replace]
const path = require('node:path');
const { db } = require('../src/db');
const { importExcel, printSummary } = require('../src/importer');

function usage() {
  console.log('Pemakaian: node scripts/import-excel.js <file.xlsx> [--replace]');
  console.log('  --replace  hapus mahasiswa yang tidak ada di file (default: tidak dihapus)');
}

function main() {
  const args = process.argv.slice(2);
  const replace = args.includes('--replace');
  const fileArg = args.find((a) => !a.startsWith('--'));

  if (!fileArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const filePath = path.resolve(fileArg);
  try {
    const summary = importExcel(db, filePath, { replace });
    printSummary(summary);
    console.log('Import selesai.');
  } catch (err) {
    console.error(`Gagal import: ${err.message}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
