# Database (SQLite)

> Bagian dari [Lab Scan KTM](../README.md).

File: `data/lab.db`. Aktifkan `PRAGMA journal_mode = WAL;` dan `PRAGMA synchronous = NORMAL;`.

## Skema
```sql
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
```

Alasan menyalin nama/kelas/semester ke `scan_log`: riwayat tetap akurat walau data mahasiswa diimpor ulang atau berubah.

## Import Excel
- Kolom wajib (header baris pertama, tidak sensitif huruf besar-kecil): `nim`, `nama`, `semester`, `kelas`.
- NIM selalu dibaca sebagai **teks** (hindari Excel mengubah jadi angka/notasi ilmiah atau menghapus angka nol di depan). Trim spasi.
- Baris tanpa NIM atau nama dilewati dan dilaporkan.
- Strategi: upsert (`INSERT ... ON CONFLICT(nim) DO UPDATE`) dalam satu transaksi. Tidak menghapus mahasiswa yang tidak ada di file kecuali dengan opsi `--replace`.
- **Pengaman `--replace`**: file yang tidak berisi baris valid (0 baris) **ditolak** — mode ini tidak boleh pernah mengosongkan seluruh tabel dari file kosong/salah.
- Setelah import, cetak ringkasan: jumlah baris dibaca, ditambah, diperbarui, dilewati (beserta nomor baris).

## Retensi
- Log disimpan tanpa batas pada tahap awal. Pembersihan log lama yang sudah `synced=1` (mis. > 1 tahun) bisa ditambah nanti.
