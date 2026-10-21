# Tasks (kerjakan berurutan, uji tiap fase sebelum lanjut)

## Fase 1: Fungsi inti, tanpa internet
- [x] 1.1 Inisialisasi proyek Node, install `express`, `better-sqlite3`, `xlsx`, `dotenv`. `SYNC_ENABLED=false`.
- [x] 1.2 `src/db.js`: buat skema sesuai `database.md`, aktifkan WAL. → terverifikasi (`journal_mode=WAL`, tabel mahasiswa/scan_log + indeks)
- [x] 1.3 `scripts/import-excel.js`: import kolom nim, nama, semester, kelas (NIM sebagai teks), cetak ringkasan.
- [x] 1.4 `POST /api/scan` dengan debounce 10 detik dan penyimpanan log. `GET /api/stats`, `GET /api/health`. → terverifikasi (11 pemeriksaan API)
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
- [x] 3.1 `start.bat` dan Task Scheduler (At log on, restart on failure). → `start.bat` (output ke `logs/server.log`) + `scripts/setup-task.ps1` (ujicoba: terdaftar `State=Ready`, restart 3x/1 menit, tanpa admin)
- [x] 3.2 Shortcut browser kiosk di `shell:startup`. → `scripts/setup-shortcut.ps1` (deteksi Chrome→Brave→Edge→Helium; `--kiosk` + profile `LabKiosk`, tanpa incognito, izin kamera siap Fase 4)
- [x] 3.3 Nonaktifkan sleep, screen-off, dan reboot otomatis Windows Update di jam ramai. → `scripts/setup-system.ps1` (`-Info` cek tanpa admin, default = terapkan + auto-UAC, jam aktif 07:00–21:00). ⚠️ Jalankan di PC LAB (mesin dev sengaja tidak diubah: masih sleep 15 mnt / layar 5 mnt)
- [x] 3.4 Prosedur backup `data/lab.db` dan cara import ulang Excel (dokumentasikan di README). → `scripts/backup.js` (SQLite online backup API, aman saat server jalan, verifikasi `integrity_check`, `--keep=N`) + npm `backup` + README (deployment, backup/pemulihan, import ulang)
- [ ] 3.5 Uji akhir: nyalakan PC dari kondisi mati, semuanya hidup sendiri tanpa tindakan manual. (checklist di README bagian "Deployment Windows"; jalankan di PC lab)
- [x] 3.6 (Baru) Pengingat status sinkronisasi di layar standby: saat `SYNC_ENABLED=false`, pojok kanan-atas menampilkan `PENGINGAT: SINKRONISASI NONAKTIF — N log menunggu` (amber, flat). `/api/config` kirim `sync_enabled`.
- [x] 3.7 (Baru) Deteksi otomatis scanner keyboard-wedge: ketikan ≥3 karakter berjarak ≤30 ms = scanner → echo/petunjuk mode manual disembunyikan selama sesi (tampil seperti kiosk murni). `MANUAL_INPUT=false` tetap override keras; fallback bila deteksi meleset.

### Uji Fase 3
- [x] `start.bat`: server hidup ~2 detik, output tercatat di `logs/server.log`.
- [x] Task Scheduler: terdaftar `State=Ready`, trigger logon, restart 3× tiap 1 menit, tanpa batas waktu, tanpa admin.
- [x] Shortcut kiosk: `.lnk` terbentuk & isinya terverifikasi (deteksi browser otomatis; uji di folder sementara).
- [x] `setup-system.ps1`: mode `-Info` membaca setelan nyata, `-WhatIf` menampilkan 8 langkah tanpa mengubah apa pun. (Penerapan = di PC lab, butuh UAC.)
- [x] Backup: aman dijalankan saat server berjalan, `integrity_check` ok, isi cocok (14 mahasiswa), `--keep=N` memangkas file lama.
- [x] UI: 18 pemeriksaan baru lulus (pengingat sync on/off, deteksi scanner vs manusia, reset Enter, regresi kiosk) + 17 pemeriksaan UI lama tetap lulus.
- [x] Integrasi nyata: `/api/config` → `sync_enabled:false`, halaman memuat elemen `sync-reminder`, log startup `Sync : nonaktif`.
- [ ] Uji nyala-dari-mati di PC lab (mencakup 3.1–3.3 sekaligus) — oleh petugas.
- [ ] Set scanner asli terpasang: pastikan echo hilang otomatis (terdeteksi) atau set `MANUAL_INPUT=false` bila perlu.

- [x] 3.8 (Baru) Backup terjadwal otomatis: `setup-task.ps1` mendaftarkan task kedua `LabScanKTM-Backup` (harian jam 17:00, `backup.bat --keep=30`, hasil ke `logs/backup.log`). Param `-BackupHour`/`-BackupKeep`. Terverifikasi: task nyata dijalankan via Task Scheduler → file backup bertambah + integrity ok.

## Fase 4: Backlog (setelah hardware & sistem monitoring siap)
- [ ] 4.1 Mode kamera (jalur A: **decode barcode/QR, bukan OCR**): flag `INPUT_MODE=scanner|camera|manual`, module `public/camera.js` (getUserMedia + decoder lokal di `public/vendor/`, tanpa CDN), hasil decode masuk `submitScan()` yang sama. Server/DB/sync: nol perubahan.
- [ ] 4.2 Uji kamera: kecepatan decode vs N4 (<300 ms), akurasi di cahaya lab asli, izin tersimpan di profile `LabKiosk`.
- [ ] 4.3 Uji lapangan sisanya Fase 2: putus WiFi sungguhan; sambung ke sistem monitoring asli (butuh kontrak API + URL/token).
