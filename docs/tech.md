# Tech

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
```
lab-scan/
  server.js            # entry: Express + static + worker
  src/
    db.js              # koneksi, skema, query
    scan.js            # logika scan + debounce
    importer.js        # import Excel
    sync.js            # worker sinkronisasi (Fase 2)
  public/
    index.html
    style.css
    app.js
  scripts/
    import-excel.js    # CLI: node scripts/import-excel.js data.xlsx
    checkup.js         # npm run checkup: diagnosis cepat satu perintah
    make-fixture.js    # buat fixtures/mahasiswa-sample.xlsx untuk uji
    mock-monitor.js    # server monitoring tiruan untuk uji Fase 2
    export-xlsx.js     # export log scan -> laporan Excel (read-only)
    backup.js          # backup database (online backup API, aman saat server jalan)
    setup-task.ps1     # daftarkan Task Scheduler (start.bat saat logon + restart gagal)
    setup-shortcut.ps1 # shortcut browser kiosk di shell:startup
    setup-system.ps1   # setelan Windows: layar nyala, tanpa sleep, anti-reboot Update
  docs/                  # dokumen desain (termasuk ARCHITECTURE.md: cara kerja program)
  fixtures/
    mahasiswa-sample.xlsx  # contoh data uji import
  data/
    lab.db             # dibuat otomatis, jangan di-commit
    backups/           # hasil npm run backup, jangan di-commit
  reports/             # hasil npm run report (XLSX), jangan di-commit
  logs/
    sync.log           # catatan status sinkronisasi, jangan di-commit
    server.log         # log start.bat (deployment), jangan di-commit
    *.log.old          # hasil rotasi (>1 MB), diganti otomatis saat proses mulai
  .env
  start.bat            # entry deployment (server), log ke logs/server.log
  backup.bat           # entry backup terjadwal, log ke logs/backup.log
  package.json
```

## Environment (.env)
```
PORT=3000
LAB_NAME=LAB-1
DEBOUNCE_SECONDS=10
WELCOME_SECONDS=2
MANUAL_INPUT=true           # true selama scanner asli belum ada; false = kiosk murni
SYNC_ENABLED=false          # false selama sistem monitoring asli belum siap
SYNC_INTERVAL_SECONDS=300
SYNC_BATCH_SIZE=100
SYNC_TIMEOUT_SECONDS=10
MONITOR_URL=http://192.168.x.x:PORT/api/lab/traffic
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
