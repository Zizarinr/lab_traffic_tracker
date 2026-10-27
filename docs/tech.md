# Tech

> Bagian dari [Lab Scan KTM](../README.md). Cara pakai & pemasangan ada di README; cara kerja program di [ARCHITECTURE.md](ARCHITECTURE.md).

## Stack
- Runtime: Node.js LTS (Windows)
- Server: Express
- Database: SQLite via `better-sqlite3` (mode WAL). Alternatif jika build native bermasalah: `node:sqlite` bawaan Node versi terbaru.
- Import Excel: `xlsx` (SheetJS) atau `exceljs`
- UUID: `crypto.randomUUID()` bawaan Node
- Config: `dotenv`
- Frontend: HTML + CSS + JS biasa (tanpa framework, tanpa CDN)
- HTTP client: `fetch` bawaan Node

## Struktur folder
Peta lengkap ada di [README — Lampiran B](../README.md#lampiran-b-struktur-direktori). Ringkasnya:

```text
traffic_tracker/
  server.js          # entry: Express + static + worker sinkron
  src/               # config, db, scan, importer, sync
  public/            # index.html, style.css, app.js (layar kiosk)
  scripts/           # CLI operasi + PowerShell setup + mock monitoring
  fixtures/          # contoh Excel untuk uji import
  data/              # lab.db + backups/ (runtime, tidak di-commit)
  logs/              # server.log, sync.log, backup.log (+ *.old)
  reports/           # hasil npm run report (tidak di-commit)
  docs/              # dokumen desain (lihat README Lampiran C)
```

## Environment (.env)
Tabel penjelasan tiap variabel: [README — Bagian 5](../README.md#5-konfigurasi-env).

```
PORT=3000
LAB_NAME=LAB-1
DEBOUNCE_SECONDS=10
WELCOME_SECONDS=2
SYNC_ENABLED=false          # false selama sistem monitoring asli belum siap
SYNC_INTERVAL_SECONDS=300
SYNC_BATCH_SIZE=100
SYNC_TIMEOUT_SECONDS=10
MONITOR_URL=http://192.168.1.50:8080/api/lab/traffic
MONITOR_TOKEN=
```

## Server
- Bind ke `127.0.0.1` (hanya diakses browser di PC yang sama).
- Sajikan `public/` sebagai file statis.
- Jam dan zona waktu: simpan ISO 8601 dengan offset +07:00.

## Deployment Windows
Instalasi sekali jalan di PC lab (rincian di `../README.md` bagian "Pemasangan di PC lab"):
- `start.bat`: entry deployment; output server dicatat ke `logs/server.log`.
- `scripts/setup-system.ps1`: matikan sleep/screen-off (`powercfg`) dan cegah Windows Update me-reboot sendiri (registri `NoAutoRebootWithLoggedOnUsers` + jam aktif). Jalankan sebagai admin.
- `scripts/setup-task.ps1`: mendaftarkan 2 task Task Scheduler — server (trigger "At log on" → `start.bat`, restart otomatis saat gagal 3×/1 menit) dan **backup harian** (`LabScanKTM-Backup`, `backup.bat --keep=30` jam 17:00, log ke `logs/backup.log`).
- `scripts/setup-shortcut.ps1`: shortcut browser kiosk di `shell:startup`; deteksi Chrome→Brave→Edge→Helium. Flag: `--kiosk --profile-directory=LabKiosk --no-first-run --use-fake-ui-for-media-stream http://localhost:3000` — **tanpa `--incognito`** supaya izin kamera tersimpan (persiapan mode kamera Fase 4).
- Backup: `npm run backup` (SQLite online backup API → `data/backups/lab-<waktu>.db`), aman dijalankan walau server hidup. Restore & import ulang Excel: lihat README.
- Rotasi log: `start.bat`/`backup.bat` memindah log >1 MB jadi `*.log.old` saat mulai; `sync.log` dirotasi oleh logger saat server start (gagal memindah diabaikan — file mungkin terkunci instance lain). Kegagalan tulis log ditahan oleh listener `error` stream agar server tetap hidup.
- Auto-logon: task server berpemicu "saat logon" → Windows harus login otomatis (panduan `netplwiz` di README langkah 7) supaya kios hidup sendiri setelah mati listrik.
- Bila port terpakai: server mencetak `GAGAL: port ... sudah terpakai` (dengan petunjuk `npm run checkup`) lalu keluar kode 1 — task mencoba lagi 3×/1 menit. Catatan Node 24 + Express 5: callback `app.listen` bisa terpanggil walau bind gagal; diblokir dengan cek `server.listening` agar banner "siap" tidak muncul keliru.
- Diagnosis: `npm run checkup` memeriksa config, DB, server, log, backup, dan task Windows dalam satu perintah (lihat README bagian "Diagnosis cepat").
- Laporan: `npm run report` mengekspor `scan_log` ke `reports/*.xlsx` (3 sheet: ringkasan harian, semua scan, rekap per mahasiswa). Koneksi **read-only** — aman dijalankan saat server hidup; opsi `--from`/`--to`/`--out`.
