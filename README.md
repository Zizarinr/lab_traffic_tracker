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

## Menjalankan sinkronisasi (Fase 2)
Uji lokal dengan server monitoring tiruan:
```
npm run mock        # terminal 1: mock monitor di http://127.0.0.1:4000 (token: secret-token)
npm start           # terminal 2: aplikasi kiosk
```
Di `.env` set `SYNC_ENABLED=true`, `MONITOR_URL=http://127.0.0.1:4000/api/lab/traffic`, `MONITOR_TOKEN=secret-token`.

- Log terkirim otomatis tiap `SYNC_INTERVAL_SECONDS` (produksi 300 = 5 menit).
- Cek backlog: `GET /api/stats` -> `pending_sync`.
- Catatan sinkronisasi: `logs/sync.log`.
- Ubah perilaku mock: `POST http://127.0.0.1:4000/control/mode` body `{"mode":"timeout"}` (lihat `scripts/mock-monitor.js` untuk daftar mode).
- Melihat data yang diterima mock: `GET http://127.0.0.1:4000/control/received`.

**Ke sistem monitoring asli:** ganti `MONITOR_URL` dan `MONITOR_TOKEN` di `.env` setelah kontrak API dikonfirmasi. Tidak ada perubahan kode.

## Deployment Windows (Fase 3)
Instalasi sekali jalan di PC lab (dilakukan berurutan):

```
npm ci --omit=dev                          # 1. pasang dependensi
copy .env.example .env                     # 2. salin konfigurasi, lalu isi
npm run import -- <file-data-mahasiswa.xlsx>   # 3. (opsional) isi database kosong
powershell -ExecutionPolicy Bypass -File scripts\setup-system.ps1    # 4. SETELAH UAC: layar nyala terus, PC tidak sleep, Update tidak reboot sendiri
powershell -ExecutionPolicy Bypass -File scripts\setup-task.ps1      # 5. Task Scheduler: jalankan start.bat saat logon (+restart otomatis bila gagal)
powershell -ExecutionPolicy Bypass -File scripts\setup-shortcut.ps1  # 6. shortcut browser mode kiosk di shell:startup
shutdown /r /t 0                                              # 7. uji: restart PC, semuanya harus hidup sendiri
```

Catatan:
- Script 4–6 punya mode `-WhatIf` (lihat rencana) dan `-Info` (khusus script 4: cek setelan tanpa mengubah).
- Shortcut kiosk memakai profile khusus `LabKiosk` tanpa incognito, supaya izin kamera tersimpan (persiapan mode kamera nanti).
- Log server: `logs/server.log` (dipakai `start.bat`), log sinkronisasi: `logs/sync.log`.
- Saat sistem monitoring asli belum siap: `SYNC_ENABLED=false` (layar standby menampilkan pengingat + jumlah log menunggu).

## Backup & pemulihan
```
npm run backup                 # salin database -> data/backups/lab-YYYYMMDD-HHMMSS.db
npm run backup -- --keep=10    # seperti di atas, sisakan 10 backup terbaru
npm run backup -- D:\backup    # simpan ke folder lain (flashdisk/disk eksternal)
```
- Backup memakai *SQLite online backup API* → **aman dijalankan walau server kiosk masih hidup**, hasilnya selalu konsisten (termasuk antrian log yang belum terkirim).
- Tiap backup diverifikasi `integrity_check` sebelum dinyatakan sukses.

Pemulihan (misal database rusak/PC diganti):
1. Matikan server (hentikan proses node / cabut shortcut kiosk).
2. Rename `data/lab.db` lama menjadi `lab.db.lama` (jangan dihapus dulu).
3. Copy file backup terbaru menjadi `data/lab.db` (hapus `data/lab.db-wal` & `data/lab.db-shm` bila ada).
4. Nyalakan lagi server; log yang belum terkirim akan terkirim otomatis saat sinkronisasi aktif.

Import ulang Excel (misal data mahasiswa berubah):
```
npm run import -- data-mahasiswa.xlsx            # tambah/perbarui (upsert, aman diulang)
npm run import -- data-mahasiswa.xlsx --replace  # hapus mahasiswa yang tidak ada di file
```
