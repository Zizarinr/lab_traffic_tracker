# Lab Scan KTM

Aplikasi web kiosk di PC depan lab. Mahasiswa scan barcode NIM pada KTM sebelum masuk lab. Aplikasi menampilkan sambutan, mencatat kunjungan, dan mengirim log secara berkala ke sistem monitoring lab lewat API.

## Prinsip utama
1. **Offline-first**: fungsi inti (scan, cari data, sambutan, simpan log) jalan penuh tanpa internet dan tanpa jaringan sama sekali.
2. **Sinkronisasi terpisah**: pengiriman ke monitoring adalah fase belakangan. Selama gagal, data aman di lokal.
3. **UI sederhana**: flat, solid, tegas, tanpa gradasi/shadow, dioptimalkan untuk layar PC.

## Ringkasan alur
```
Scanner USB (keyboard-wedge) -> Browser kiosk -> POST /api/scan
   -> Server Express + SQLite (cari NIM, simpan log)
   -> Layar: sambutan 3 detik -> standby
   -> (tiap 5 menit) worker kirim log synced=0 ke API monitoring
```

## Dokumen
| File | Isi |
|---|---|
| requirements.md | Kebutuhan dan batasan |
| tech.md | Stack, struktur folder, env, deployment Windows |
| design.md | UI, state layar, perilaku scan |
| database.md | Skema SQLite dan aturan import Excel |
| api.md | Endpoint internal dan kontrak ke sistem monitoring |
| tasks.md | Checklist implementasi bertahap untuk code agent |

## Urutan kerja
Kerjakan `tasks.md` berurutan. Selesaikan dan uji Fase 1 (tanpa jaringan) sebelum menyentuh Fase 2 (sinkronisasi).

## Menjalankan (Fase 1)
```
npm install                        # sekali saja
npm run fixture                    # buat contoh Excel di fixtures/mahasiswa-sample.xlsx
npm run import -- fixtures/mahasiswa-sample.xlsx   # import data mahasiswa
npm start                          # jalankan server, buka http://127.0.0.1:3000
```
- Import ulang aman (upsert). Tambahkan `--replace` untuk menghapus mahasiswa yang tidak ada di file.
- Konfigurasi ada di `.env` (lihat `.env.example`). `SYNC_ENABLED=false` selama Fase 1.
- Database: `data/lab.db` (dibuat otomatis, mode WAL).
- `MANUAL_INPUT=true` untuk uji tanpa scanner: NIM yang diketik tampil di layar, `Backspace` hapus 1 karakter, `Escape` bersihkan. Set `false` saat scanner asli sudah terpasang.
