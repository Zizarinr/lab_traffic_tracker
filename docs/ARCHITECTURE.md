# Architecture — Cara Kerja Lab Scan KTM

> Bagian dari [Lab Scan KTM](../README.md). Cara pakai & operasi ada di README; spesifikasi teknis di [tech.md](tech.md).

Dokumen ini menjelaskan **teknologi, struktur file, dan alur eksekusi** program dari awal sampai akhir: apa yang dieksekusi ketika komputer nyala, apa yang terjadi saat satu KTM discan, dan bagaimana data sampai ke sistem monitoring.

## 1. Teknologi dan alasannya

| Teknologi | Peran di project | Kenapa dipilih |
|---|---|---|
| **Node.js** (CommonJS, tanpa TypeScript) | Satu-satunya runtime — server, worker, semua script | Spek awal: **100% Node.js, tanpa Python/container** |
| **Express 5** | HTTP server, routing API, sajikan file statis `public/` | Ringkas; cukup `app.get`/`app.post`, tanpa framework berat |
| **SQLite + `better-sqlite3`** | Database `data/lab.db` (offline-first) | Satu file, tanpa server DB terpisah; driver **sinkron** jadi logika kode linear; mode **WAL** = tahan mati listrik mendadak |
| **SheetJS (`xlsx`)** | Baca file `.xlsx` saat import data mahasiswa | Dari CDN resmi SheetJS, `npm audit` = 0 vulnerabilities |
| **`dotenv`** | Baca `.env` | Ubah perilaku (port, nama lab, sinkron) tanpa ubah kode |
| **HTML/CSS/JS murni** (tanpa framework, tanpa CDN) | Layar kiosk di `public/` | Aturan `design.md`: offline penuh, flat, tanpa aset eksternal |
| **`fetch` bawaan Node** | Kirim log ke sistem monitoring | Tanpa library HTTP tambahan (axios dsb.) |
| **Chrome mode `--kiosk`** | Layar penuh tanpa UI browser | Profil khusus `LabKiosk` supaya izin kamera persisten (Fase 4) |
| **Windows Task Scheduler + PowerShell + .bat** | Otomasi hidup-mati & backup harian | Target mesin Windows polos tanpa Docker |
| **Harness uji JS kustom** | Regresi 100+ pemeriksaan | Tanpa framework uji (Jest dsb.) — sesuai batasan proyek |

## 2. Peta file — siapa bertugas apa

### Bagian RUNTIME (dieksekusi tiap kali program jalan)

| File | Tugas |
|---|---|
| `server.js` | **Entry point satu-satunya.** Susun Express, daftarkan route, `app.listen`, nyalakan worker sinkron |
| `src/config.js` | Baca + validasi `.env` (fallback aman bila nilai tak valid) |
| `src/db.js` | Buka `data/lab.db`, set WAL, buat tabel `mahasiswa`/`scan_log` + index, pembuat timestamp `+07:00` |
| `src/scan.js` | **Otak satu scan**: validasi NIM → cari mahasiswa → debounce → insert log → statistik |
| `src/sync.js` | **Worker latar**: ambil log `synced=0` → kirim batch → tandai `synced` → backoff saat gagal |
| `src/importer.js` | Logika impor Excel: baca sheet pertama, konversi tipe, upsert transaksional, pengaman `--replace` |
| `public/index.html` | Kerangka halaman kiosk (semua state layar ada di sini) |
| `public/style.css` | Gaya flat sesuai `design.md` |
| `public/app.js` | **Otak browser**: jam, deteksi scanner, mesin state layar, panggil API |

### Bagian OPERASI (dieksekusi sesekali, bukan tiap boot)

| File | Tugas |
|---|---|
| `start.bat` | Entry deployment: cek Node → rotasi `logs/server.log` >1 MB → `node server.js` |
| `backup.bat` → `scripts/backup.js` | Backup terjadwal: online backup API + integrity check + keep-N |
| `scripts/import-excel.js` | CLI impor — menerima argumen file, memanggil `src/importer.js` |
| `scripts/checkup.js` | Diagnosis satu perintah `npm run checkup` |
| `scripts/export-xlsx.js` | Export log scan ke laporan Excel `npm run report` (koneksi read-only) |
| `scripts/make-fixture.js` | Buat Excel contoh untuk uji |
| `scripts/mock-monitor.js` | Server monitoring tiruan untuk uji Fase 2 |
| `scripts/setup-system.ps1` | Setelan Windows anti-sleep/anti-reboot (sekali jalan) |
| `scripts/setup-task.ps1` | Daftarkan 2 task: server saat logon + backup 17:00 (sekali jalan) |
| `scripts/setup-shortcut.ps1` | Shortcut browser kiosk di `shell:startup` (sekali jalan) |

**Prinsip pemisahan:** yang runtime hanya `server.js` + `src/*` + `public/*`. Sisanya alat — itulah kenapa PC lab cukup "Node.js + folder ini" untuk hidup.

**Jangan dipindahkan dari root:** `start.bat` dan `backup.bat` — path absolut keduanya terdaftar di Task Scheduler (lihat `scripts/setup-task.ps1`); memindahnya membuat task gagal di PC lab.

## 3. Alur AWAL: komputer menyala → layar standby

```
PC nyala / user logon
   │
   ├─[Task Scheduler: LabScanKTM-Server]──→ start.bat
   │      start.bat: cek `node` di PATH
   │      → rotasi logs/server.log bila > 1 MB
   │      → node server.js  (output → logs/server.log)
   │
   ├─[shell:startup]──→ Chrome --kiosk http://127.0.0.1:3000
   │
   └─[Task Scheduler: LabScanKTM-Backup]──→ (baru jalan jam 17:00)
```

### Yang terjadi di dalam `node server.js`, berurutan:

| # | File | Yang dikerjakan |
|---|---|---|
| 1 | `server.js` | `require('./src/config')` → masuk `src/config.js` → `dotenv` baca `.env` → parse angka (port, debounce, welcome, interval) dengan fallback → kembali ke `server.js` |
| 2 | `server.js` | `require('./src/db')` → masuk `src/db.js` → buat folder `data/` → buka `lab.db` → `PRAGMA journal_mode=WAL` → `CREATE TABLE IF NOT EXISTS` (tabel + index) → kembali |
| 3 | `server.js` | `require('./src/scan')` → masuk `src/scan.js` → siapkan helper query |
| 4 | `server.js` | Pasang middleware `express.json({limit:'8kb'})` + `express.static('public')` → daftarkan route: `/api/health`, `/api/config`, `/api/stats`, `/api/scan`, 404 `/api/*` |
| 5 | `server.js` | `app.listen(3000, '127.0.0.1', cb)` → di callback: **cek `server.listening` dulu** (quirk Node 24 + Express 5: callback bisa terpanggil walau bind gagal) → cetak banner → kalau `SYNC_ENABLED=true` → buat logger `logs/sync.log` + `createSyncWorker` |
| 6 | `server.js` | `server.on('error')` → bila port terpakai: pesan jelas + exit 1 (task coba lagi 3×/1 menit) |
| 7 | — | Proses **tinggal hidup** menunggu request. Browser kiosk menampilkan `public/index.html` |

### Yang terjadi di BROWSER (`public/app.js`):

| # | Yang dijalankan | Tujuan |
|---|---|---|
| 1 | Ambil semua elemen DOM (layar, jam, scanner, counter…) | Menyiapkan jangkar tampilan |
| 2 | `GET /api/config` | Isi nama lab, durasi sambutan, status sinkronisasi |
| 3 | Loop jam tiap 1 detik | Jam layar standby |
| 4 | `GET /api/stats` tiap 60 detik | Counter kunjungan hari ini + pengingat sinkron nonaktif |
| 5 | Pasang `keydown` listener | Menunggu ketikan scanner → lihat bagian 4 |
| 6 | Kalau pernah error: poll `/api/health` tiap 5 detik | Auto-pulih sendiri saat server bangkit |

## 4. Alur SATU SCAN (dari ketukan keyboard sampai layar hijau)

```
Scanner USB (atau ketikan manual)
   │  1. app.js menerima keydown per karakter
   │  2. Deteksi burst: >= 3 karakter berjarak <= 30 ms = scanner
   │     (echo & petunjuk disembunyikan selama burst; ketikan pelan = manusia → echo tampil)
   │  3. Enter ditekan → buffer NIM
   ▼
app.js → fetch POST /api/scan {nim}
   ▼
server.js (route) → handleScan(db, nim) di src/scan.js
   │
   ├─ validateNim: 3–32 karakter?  ── tidak → 400 invalid_nim
   │                      (app.js diamkan → noise tak mengganggu layar)
   ├─ findMahasiswa: SELECT * FROM mahasiswa WHERE nim=?
   ├─ lastScanFor + isDuplicate: scan sama < 10 detik lalu?
   │                      ── ya → 200 {duplicate:true}, TANPA insert log
   ├─ INSERT INTO scan_log (UUID, nim, nama, status, synced=0)
   │                      status = 'ok' | 'not_found'
   └─ → response JSON
   ▼
app.js merender state:
   ok        → layar hijau + sambutan WELCOME_SECONDS → standby
   not_found → layar merah NIM TIDAK TERDAFTAR → standby
   duplicate → berkedip singkat saja (tak ada log baru)
   400       → abaikan total (imunitas noise scanner)
   gagal/jaringan → layar merah SERVER TIDAK TERHUBUNG + poll auto-pulih
```

Inti yang perlu diingat: satu scan = **4 file** (`app.js` → `server.js` → `scan.js` → balik ke `app.js`), dan log tersimpan di SQLite **sebelum** ada pikiran soal internet — itu inti *offline-first*.

## 5. Alur SINKRONISASI (latar, tiap `SYNC_INTERVAL_SECONDS`)

Berjalan **di dalam proses server yang sama** (bukan proses terpisah), di `src/sync.js`:

```
tiap SYNC_INTERVAL_SECONDS (produksi: 300 dtk):
   SELECT * FROM scan_log WHERE synced=0 ORDER BY scanned_at LIMIT 100
        │ tidak ada → tidur sampai interval berikutnya
        ▼
   POST batch JSON ke MONITOR_URL  (+ header token, timeout 10 dtk)
        │
        ├─ 200 + accepted[] → tandai synced=1 HANYA id yang diterima
        ├─ 200 tanpa accepted → seluruh batch ditandai
        ├─ gagal (timeout/500/401/jaringan) → TIDAK ada yang ditandai
        │       → backoff 30 → 60 → 120 → 240 → 300 dtk
        │       → data tetap aman di lokal, coba lagi nanti
        └─ tiap kejadian ditulis ke logs/sync.log (dirotasi > 1 MB)
```

Kata kunci: **tanda `synced` hanya dipasang setelah server monitoring mengaku menerima** — kalau respons hilang di jalan, log terkirim ulang, dan UUID dipakai untuk dedup di sisi sana. Kontrak lengkap di [api.md](api.md).

## 6. Alur BACKUP terjadwal (jam 17:00)

```
Task Scheduler → backup.bat
   → rotasi logs/backup.log bila > 1 MB
   → node scripts/backup.js --keep=30
        → require src/db.js (buka lab.db — aman walau server hidup)
        → db.backup()  ← SQLite ONLINE backup API (snapshot konsisten)
        → integrity_check terhadap hasil backup
        → hapus backup lebih dari 30 → logs/backup.log
```

Bedanya dengan copy-paste biasa: `db.backup()` mengambil snapshot konsisten **tanpa perlu mematikan server** — tidak mungkin dapat file setengah-jadi.

## 7. Perintah pengguna (sekali jalan / sesekali)

| Perintah | File yang dieksekusi | Isi kerjanya |
|---|---|---|
| `npm run import -- file.xlsx` | `scripts/import-excel.js` → `src/importer.js` | SheetJS baca **sheet pertama** → wajib kolom `nim`/`nama` → angka dikonversi jadi teks (anti notasi ilmiah, leading-zero aman) → **satu transaksi upsert** → pengaman: `--replace` + file 0 baris = **ditolak** |
| `npm run checkup` | `scripts/checkup.js` | Baca config → buka DB (integritas + hitungan) → probe port/health → ukur & tail log → verifikasi backup terbaru → cek 2 task Windows → 5 scan terakhir → ringkasan SEHAT/❌ |
| `npm run backup` | `scripts/backup.js` | Online backup + integrity + keep-N (lihat bagian 6) |
| `npm run report` | `scripts/export-xlsx.js` | `SELECT` dari `scan_log` (**read-only**, opsi `--from`/`--to`/`--out`) → 3 sheet XLSX di `reports/` |
| `npm run mock` | `scripts/mock-monitor.js` | Server port 4000 yang mode-nya bisa disetel (`POST /control/mode`) |
| `setup-*.ps1` | script PowerShell masing-masing | **Tidak bagian runtime sama sekali** — sekali jalan saat pemasangan |

### Alur export laporan (`npm run report`)

```
data/lab.db ──(dibuka READ-ONLY / query_only)──→ SELECT scan_log
   │ opsional filter --from/--to (tanggal WIB)
   ▼
3 sheet: Ringkasan Per Hari | Semua Scan | Rekap Per Mahasiswa
   ▼
reports/laporan-traffic-<YYYYMMDD-HHMMSS>.xlsx
   (database TIDAK berubah — hanya dibaca)
```

Tidak ada worker/timer: script berjalan sekali, selesai, lalu keluar. Aman dijalankan **sambil server kiosk hidup** karena tidak pernah menulis ke database.

## 8. Ringkasan 5 kalimat untuk hafal

1. **Satu entry point**: semua yang berjalan saat program hidup dimulai dari `server.js` — file lain masuk lewat `require`.
2. **Tiga lapis**: `config` (baca `.env`) → `db` (buka SQLite) → `scan`/`sync` (logika), lalu Express di atasnya.
3. **Frontend terpisah total**: browser menjalankan `public/app.js` sendiri, berkomunikasi hanya lewat 4 endpoint `/api/*`.
4. **Dua pekerjaan latar**: sinkronisasi (di dalam proses `server.js`) dan backup (proses terpisah lewat `backup.bat` + Task Scheduler).
5. **File `.ps1`/`.bat` = otomasi Windows**, bukan logika aplikasi — itu yang bikin aplikasi bisa hidup sendiri tanpa manusia.
