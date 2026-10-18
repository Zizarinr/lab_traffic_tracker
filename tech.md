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
    mock-monitor.js    # server monitoring tiruan untuk uji Fase 2
  data/
    lab.db             # dibuat otomatis, jangan di-commit
  .env
  start.bat
  package.json
```

## Environment (.env)
```
PORT=3000
LAB_NAME=LAB-1
DEBOUNCE_SECONDS=10
WELCOME_SECONDS=3
SYNC_ENABLED=false          # false di Fase 1
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
- `start.bat`: `cd` ke folder proyek lalu `node server.js`.
- Auto-start: Task Scheduler, trigger "At log on", jalankan `start.bat`, opsi restart saat gagal.
- Browser kiosk: shortcut di `shell:startup`:
  `chrome.exe --kiosk --incognito http://localhost:3000` (Edge: `msedge.exe --kiosk http://localhost:3000 --edge-kiosk-type=fullscreen`).
- Matikan sleep/screen-off dan pembaruan otomatis yang me-reboot di jam ramai.
- Backup: salin `data/lab.db` berkala (mis. ke flashdisk) selama jam tidak ramai.
