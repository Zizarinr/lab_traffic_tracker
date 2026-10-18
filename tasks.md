# Tasks (kerjakan berurutan, uji tiap fase sebelum lanjut)

## Fase 1: Fungsi inti, tanpa internet
- [ ] 1.1 Inisialisasi proyek Node, install `express`, `better-sqlite3`, `xlsx`, `dotenv`. `SYNC_ENABLED=false`.
- [ ] 1.2 `src/db.js`: buat skema sesuai `database.md`, aktifkan WAL.
- [ ] 1.3 `scripts/import-excel.js`: import kolom nim, nama, semester, kelas (NIM sebagai teks), cetak ringkasan.
- [ ] 1.4 `POST /api/scan` dengan debounce 10 detik dan penyimpanan log. `GET /api/stats`, `GET /api/health`.
- [ ] 1.5 Halaman kiosk (`public/`): state STANDBY, BERHASIL, TIDAK TERDAFTAR, SISTEM BERMASALAH sesuai `design.md`. Flat, tanpa gradasi/shadow, tanpa aset eksternal.
- [ ] 1.6 Input scanner tersembunyi dengan fokus permanen dan penanganan Enter.

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
- [ ] 2.1 `scripts/mock-monitor.js`: server tiruan yang menerima POST, memvalidasi token, bisa dipaksa error/timeout.
- [ ] 2.2 `src/sync.js`: worker sesuai aturan di `api.md` (batch, timeout, backoff, tandai `synced`).
- [ ] 2.3 Aktifkan lewat `SYNC_ENABLED=true`, konfigurasi dari `.env`.

### Uji Fase 2
- [ ] Mock aktif -> log terkirim dan `synced=1`.
- [ ] Mock mati/timeout -> log tetap `synced=0`, scan tetap lancar, retry dengan backoff.
- [ ] Mock hidup kembali -> semua backlog terkirim berurutan.
- [ ] Token salah (401) -> error tercatat, tidak retry agresif.
- [ ] Respons hilang setelah data diterima -> kirim ulang tidak merusak (id sama).
- [ ] Putus WiFi sungguhan selama beberapa menit lalu sambung kembali.
- [ ] Arahkan ke sistem monitoring asli setelah kontrak API dikonfirmasi.

## Fase 3: Deployment Windows
- [ ] 3.1 `start.bat` dan Task Scheduler (At log on, restart on failure).
- [ ] 3.2 Shortcut browser kiosk di `shell:startup`.
- [ ] 3.3 Nonaktifkan sleep, screen-off, dan reboot otomatis Windows Update di jam ramai.
- [ ] 3.4 Prosedur backup `data/lab.db` dan cara import ulang Excel (dokumentasikan di README).
- [ ] 3.5 Uji akhir: nyalakan PC dari kondisi mati, semuanya hidup sendiri tanpa tindakan manual.
