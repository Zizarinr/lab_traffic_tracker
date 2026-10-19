# Tasks (kerjakan berurutan, uji tiap fase sebelum lanjut)

## Fase 1: Fungsi inti, tanpa internet
- [x] 1.1 Inisialisasi proyek Node, install `express`, `better-sqlite3`, `xlsx`, `dotenv`. `SYNC_ENABLED=false`.
- [ ] 1.2 `src/db.js`: buat skema sesuai `database.md`, aktifkan WAL.
- [x] 1.3 `scripts/import-excel.js`: import kolom nim, nama, semester, kelas (NIM sebagai teks), cetak ringkasan.
- [ ] 1.4 `POST /api/scan` dengan debounce 10 detik dan penyimpanan log. `GET /api/stats`, `GET /api/health`.
- [x] 1.5 Halaman kiosk (`public/`): state STANDBY, BERHASIL, TIDAK TERDAFTAR, SISTEM BERMASALAH sesuai `design.md`. Flat, tanpa gradasi/shadow, tanpa aset eksternal.
- [x] 1.6 Input scanner tersembunyi dengan fokus permanen dan penanganan Enter.
- [x] 1.7 (Tambahan) Mode input manual untuk uji tanpa scanner: `MANUAL_INPUT=true` menampilkan NIM yang diketik di layar + petunjuk, `Backspace`/`Delete` hapus 1 karakter, `Escape` bersihkan. Scanner keyboard-wedge tetap jalan normal saat mode ini `false`.

### Uji Fase 1 (semua tanpa internet, cabut kabel/WiFi saat menguji)
- [ ] NIM valid -> sambutan benar (nama, kelas, semester), log tersimpan.
- [ ] NIM tidak ada -> pesan tidak terdaftar, log `not_found` tersimpan.
- [ ] Scan NIM yang sama berulang cepat -> hanya satu log.
- [ ] Dua scan berbeda beruntun -> tampilan beralih ke scan terbaru.
- [ ] Restart server dan PC -> data mahasiswa dan log tetap ada.
- [ ] NIM berawalan nol dan NIM panjang tidak rusak saat import.
- [ ] Uji dengan scanner barcode asli dan KTM asli.
- [ ] Tampilan terbaca dari jarak 1-2 meter di monitor lab.

## Fase 2: Sinkronisasi ke monitoring
- [x] 2.1 `scripts/mock-monitor.js`: server tiruan yang menerima POST, memvalidasi token, bisa dipaksa error/timeout.
- [x] 2.2 `src/sync.js`: worker sesuai aturan di `api.md` (batch, timeout, backoff, tandai `synced`).
- [x] 2.3 Aktifkan lewat `SYNC_ENABLED=true`, konfigurasi dari `.env`.

### Uji Fase 2
- [x] Mock aktif -> log terkirim dan `synced=1`.
- [x] Mock mati/timeout -> log tetap `synced=0`, scan tetap lancar, retry dengan backoff.
- [x] Mock hidup kembali -> semua backlog terkirim berurutan.
- [x] Token salah (401) -> error tercatat, tidak retry agresif.
- [x] Respons hilang setelah data diterima -> kirim ulang tidak merusak (id sama).
- [ ] Putus WiFi sungguhan selama beberapa menit lalu sambung kembali. (uji lapangan: perilaku setara "mock mati" yang sudah terverifikasi)
- [ ] Arahkan ke sistem monitoring asli setelah kontrak API dikonfirmasi.

> Catatan uji: perilaku di atas diverifikasi otomatis lewat 22 uji unit worker, 27 uji integrasi (mock HTTP nyata + SQLite asli), dan 16 uji end-to-end (server asli + `SYNC_ENABLED=true`). Mode mock yang tersedia: `ok`, `partial`, `no-accepted`, `unauthorized`, `bad-request`, `error`, `timeout`, `slow`, `drop`.

## Fase 3: Deployment Windows
- [ ] 3.1 `start.bat` dan Task Scheduler (At log on, restart on failure).
- [ ] 3.2 Shortcut browser kiosk di `shell:startup`.
- [ ] 3.3 Nonaktifkan sleep, screen-off, dan reboot otomatis Windows Update di jam ramai.
- [ ] 3.4 Prosedur backup `data/lab.db` dan cara import ulang Excel (dokumentasikan di README).
- [ ] 3.5 Uji akhir: nyalakan PC dari kondisi mati, semuanya hidup sendiri tanpa tindakan manual.
