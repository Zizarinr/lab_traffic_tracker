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
    make-fixture.js    # buat fixtures/mahasiswa-sample.xlsx untuk uji
    mock-monitor.js    # server monitoring tiruan untuk uji Fase 2
    backup.js          # backup database (online backup API, aman saat server jalan)
    setup-task.ps1     # daftarkan Task Scheduler (start.bat saat logon + restart gagal)
    setup-shortcut.ps1 # shortcut browser kiosk di shell:startup
    setup-system.ps1   # setelan Windows: layar nyala, tanpa sleep, anti-reboot Update
  fixtures/
    mahasiswa-sample.xlsx  # contoh data uji import
  data/
    lab.db             # dibuat otomatis, jangan di-commit
    backups/           # hasil npm run backup, jangan di-commit
  logs/
    sync.log           # catatan status sinkronisasi, jangan di-commit
    server.log         # log start.bat (deployment), jangan di-commit
  .env
  start.bat
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
Instalasi sekali jalan di PC lab (rincian di `README.md` bagian "Deployment Windows"):
- `start.bat`: entry deployment; output server dicatat ke `logs/server.log`.
- `scripts/setup-system.ps1`: matikan sleep/screen-off (`powercfg`) dan cegah Windows Update me-reboot sendiri (registri `NoAutoRebootWithLoggedOnUsers` + jam aktif). Jalankan sebagai admin.
- `scripts/setup-task.ps1`: Task Scheduler trigger "At log on" → `start.bat`, restart otomatis saat gagal (3×, tiap 1 menit).
- `scripts/setup-shortcut.ps1`: shortcut browser kiosk di `shell:startup`; deteksi Chrome→Brave→Edge→Helium. Flag: `--kiosk --profile-directory=LabKiosk --no-first-run --use-fake-ui-for-media-stream http://localhost:3000` — **tanpa `--incognito`** supaya izin kamera tersimpan (persiapan mode kamera Fase 4).
- Backup: `npm run backup` (SQLite online backup API → `data/backups/lab-<waktu>.db`), aman dijalankan walau server hidup. Restore & import ulang Excel: lihat README.
