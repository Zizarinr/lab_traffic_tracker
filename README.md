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
   -> Layar: sambutan (WELCOME_SECONDS, default 3 detik) -> standby
   -> (tiap 5 menit) worker kirim log synced=0 ke API monitoring
```

## Lokasi & alur penyimpanan data

Intinya: **`data/lab.db` adalah sumber kebenaran. Yang dikirim ke sistem monitoring cuma *salinan* JSON, bukan file databasenya. Backup adalah *snapshot konsisten* terpisah dari file yang sama.**

### 1. Dari awal: import data mahasiswa
| Kejadian | Lokasi | Keterangan |
|---|---|---|
| **File Excel sumber** | Bebas (mis. `fixtures/mahasiswa-sample.xlsx` atau file lain) | Hanya dibaca sekali saat `npm run import`. File Excel **tidak disalin** ke dalam folder aplikasi. |
| **Proses import** | `scripts/import-excel.js` → `src/importer.js` | Membaca kolom `nim`, `nama`, `semester`, `kelas`. NIM dipaksa jadi teks (aman buat awalan `0` & NIM panjang). |
| **Hasil import** | `data/lab.db` (tabel `mahasiswa`) | Diupsert dalam 1 transaksi. File `lab.db` dibuat otomatis oleh `src/db.js` kalau belum ada. |

### 2. Saat program sedang berjalan (runtime)
| Item | Lokasi | Keterangan |
|---|---|---|
| **Database utama** | `data/lab.db` | **Sumber kebenaran.** Semua hasil scan dicatat ke tabel `scan_log`. Baik **online maupun offline**, fungsi inti (scan, cari, sambutan) tetap jalan 100%. |
| **File sementara SQLite (WAL/SHM)** | `data/lab.db-wal`, `data/lab.db-shm` | Dibentuk otomatis oleh SQLite saat mode WAL ada proses write. Biasanya muncul sesaat lalu mengecil/hilang. **Jangan dihapus saat server masih hidup.** |
| **Log aplikasi** | `logs/server.log`, `logs/sync.log`, `logs/backup.log` | Catatan event, hasil worker sync, dan hasil backup. Akan dirotasi jadi `*.log.old` bila ukurannya > 1 MB. |
| **Frontend (browser kiosk)** | Memori browser | `public/` hanya disajikan statis oleh server. Browser **tidak** punya salinan database, hanya mengirim `POST /api/scan` ke server. |

### 3. Sinkronisasi ke sistem monitoring (tiap 5 menit)
Interval ini diatur oleh `.env`: `SYNC_INTERVAL_SECONDS=300`. **Bukan backup, cuma pengiriman antrian.**

| Kejadian | Lokasi | Keterangan |
|---|---|---|
| **Ambil antrian** | Dibaca dari `data/lab.db` (`scan_log` WHERE `synced=0`) | Worker di `src/sync.js` mengambil batch (maks `SYNC_BATCH_SIZE=100`) berurutan. |
| **Kirim** | **Hanya salinan** dikirim via HTTP `POST` ke `MONITOR_URL` (+ `MONITOR_TOKEN`) | Yang dikirim adalah JSON berisi data log. **File `data/lab.db` TIDAK dipindahkan/dihapus.** |
| **Tandai terkirim** | Di-update di `data/lab.db` → `synced=1` | Hanya log yang **benar-benar diakui** oleh monitoring yang ditandai. Kalau gagal, timeout, atau koneksi putus, `synced` tetap `0` lalu akan dicoba ulang dengan **backoff**. |
| **Offline** | Tetap di `data/lab.db` | Kalau jaringan mati, seluruh backlog aman tersimpan. Begitu jaringan kembali, antrian akan terkirim berurutan tanpa kehilangan data. |

### 4. Backup (manual & terjadwal)
Backup ini **salinan snapshot konsisten** dari database, terpisah dari proses sync.

| Cara | Kapan | Lokasi simpan | Keterangan |
|---|---|---|---|
| **Manual** | Kapan saja (`npm run backup`) | `data/backups/lab-YYYYMMDD-HHMMSS.db` | Bisa diarahkan ke folder lain, contoh: `npm run backup -- D:\backup`. |
| **Terjadwal** | Otomatis **harian jam 17:00** (Task `LabScanKTM-Backup`) | `data/backups/lab-YYYYMMDD-HHMMSS.db` | Dijalankan `backup.bat` → `scripts/backup.js`. Menggunakan **SQLite Online Backup API**, aman dijalankan **sambil server masih hidup**. Setiap backup dicek `integrity_check`, lalu dipangkas otomatis (`--keep=30`). |

### Ringkasan cepat
- **Selama berjalan:** Semua data operasional berada di `data/lab.db` (offline-first).
- **Sync 5 menit:** **Bukan pemindahan data.** Cuma kirim salinan + ubah flag `synced` di file yang sama.
- **Backup harian:** **Buat salinan terpisah** (`data/backups/`) untuk jaga-jaga kalau file utama rusak/terhapus.
- **Online/Offline:** Bedanya cuma "apakah ada yang bisa dikirim". Kalau offline, data tetap aman 100% di lokal.

## Peta jalan
Dari nol sampai kiosk jalan di lab:

| # | Bagian | Kapan dipakai |
|---|---|---|
| 1 | [Jalankan di laptop (uji cepat)](#1-menjalankan-di-laptop-uji-cepat-fase-1) | pengembangan & uji tanpa hardware |
| 2 | [Uji sinkronisasi (mock monitor)](#2-uji-sinkronisasi-fase-2-dengan-mock-monitor) | sebelum sistem monitoring asli siap |
| 3 | [Pemasangan di PC lab (produksi)](#3-pemasangan-di-pc-lab-fase-3-produksi) | sekali jalan — **ikuti urutannya** |
| 4 | [Operasi harian & darurat](#4-operasi-harian--darurat) | checkup, backup, pemulihan, import ulang |

Semua bagian disusun **berurutan**. Tiap langkah menyertakan **Kenapa** — supaya jelas apa yang rusak bila langkahnya dilewati.

## Dokumen
Semua dokumen desain ada di folder [`docs/`](docs/):

| File | Isi |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | **Cara kerja program**: teknologi, peta file, alur eksekusi dari nol sampai akhir |
| [requirements.md](docs/requirements.md) | Kebutuhan dan batasan |
| [tech.md](docs/tech.md) | Stack, spesifikasi teknis, env, deployment Windows |
| [design.md](docs/design.md) | UI, state layar, perilaku scan |
| [database.md](docs/database.md) | Skema SQLite dan aturan import Excel |
| [api.md](docs/api.md) | Endpoint internal dan kontrak ke sistem monitoring |
| [tasks.md](docs/tasks.md) | Checklist implementasi bertahap untuk code agent |

## Struktur direktori
```
traffic_tracker/
├── server.js              # ENTRY PROGRAM: Express + API scan + worker sinkron
├── start.bat              # entry deployment (Task Scheduler): node server.js + log ke logs/server.log
├── backup.bat             # entry backup terjadwal (Task Scheduler 17:00)
├── package.json           # dependensi + daftar npm start/import/backup/checkup/mock/fixture
├── .env.example           # templat konfigurasi — disalin jadi .env
│
├── src/                   # LOGIKA SERVER (hidup tiap kali program jalan)
│   ├── config.js          #   baca & validasi .env
│   ├── db.js              #   buat/kelola database SQLite (mode WAL)
│   ├── scan.js            #   otak satu scan: validasi NIM, cari, debounce, catat log
│   ├── importer.js        #   logika impor Excel (upsert + pengaman --replace)
│   └── sync.js            #   worker kirim log synced=0 ke monitoring (backoff saat gagal)
│
├── public/                # TAMPILAN KIOSK — dijalankan di browser
│   ├── index.html         #   semua state layar (standby/berhasil/tidak terdaftar/b error)
│   ├── style.css          #   gaya flat sesuai design.md
│   └── app.js             #   jam, deteksi scanner, mesin state, panggil API
│
├── scripts/               # ALAT OPERASI (sesekali — bukan tiap boot)
│   ├── import-excel.js    #   CLI impor (npm run import)
│   ├── checkup.js         #   diagnosis satu perintah (npm run checkup)
│   ├── backup.js          #   backup database (npm run backup)
│   ├── make-fixture.js    #   buat Excel contoh (npm run fixture)
│   ├── mock-monitor.js    #   monitoring tiruan untuk uji Fase 2 (npm run mock)
│   ├── setup-system.ps1   #   setelan Windows: anti-sleep, anti-reboot Update
│   ├── setup-task.ps1     #   daftarkan 2 task Task Scheduler
│   └── setup-shortcut.ps1 #   shortcut browser kiosk saat logon
│
├── fixtures/              # data contoh (mahasiswa-sample.xlsx)
├── data/                  # lab.db + backups/ — dijalankan program, TIDAK di-commit
├── logs/                  # server.log, sync.log, backup.log (*.old = hasil rotasi >1 MB)
└── docs/                  # dokumen desain (lihat tabel Dokumen di atas)
```
Yang runtime hanya `server.js` + `src/` + `public/` — PC lab cukup "Node.js + folder ini" untuk hidup. Detail penjelasan per file dan alur eksekusinya ada di [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Urutan kerja (untuk AI coding agent)
Kerjakan [`docs/tasks.md`](docs/tasks.md) berurutan. Selesaikan dan uji Fase 1 (tanpa jaringan) sebelum menyentuh Fase 2 (sinkronisasi).

---

## 1. Menjalankan di laptop (uji cepat, Fase 1)

Prasyarat: [Node.js LTS](https://nodejs.org) terpasang.

### Langkah 1 — pasang dependensi
```
npm install
```
*Kenapa:* mengunduh `express`, `better-sqlite3`, dan `xlsx` sesuai `package.json` ke `node_modules/`. Cukup sekali; ulangi hanya bila `package.json` berubah.

### Langkah 2 — salin konfigurasi
```
copy .env.example .env
```
*Kenapa:* semua perilaku (port, nama lab, durasi sambutan, debounce, mode uji, sinkronisasi) dibaca dari `.env` **saat server mulai** — dan `.env` tidak ikut ter-copy saat meng-clone repo (sengaja, berisi rahasia). Untuk uji laptop biarkan nilai contoh:
- `MANUAL_INPUT=true` — ketikan NIM tampil di layar; berguna saat belum ada scanner.
- `SYNC_ENABLED=false` — sinkronisasi dimatikan sampai ada tujuan (Bagian 2).

### Langkah 3 — isi database mahasiswa
```
npm run fixture                                           # buat Excel contoh (sekali saja)
npm run import -- fixtures/mahasiswa-sample.xlsx          # import ke SQLite
```
*Kenapa:* server hanya mengenali NIM yang ada di tabel `mahasiswa` — tanpa isi, setiap scan akan `NOT FOUND`. Import bersifat **upsert**: aman diulang, baris sama diperbarui (tidak diduplikasi). Database `data/lab.db` dibuat otomatis dengan mode WAL — tahan mati listrik mendadak.

### Langkah 4 — jalankan server
```
npm start
```
lalu buka `http://127.0.0.1:3000` di browser.

*Kenapa:* inilah aplikasinya — Express menyajikan halaman kiosk + API scan di port 3000.

### Langkah 5 — uji alur scan
Dengan mode manual di layar:
- ketik `4420231001` lalu Enter → muncul sambutan nama **BUDI SANTOSO** → kembali standby;
- scan NIM yang sama lagi dalam 10 detik → hanya berkedip "duplikat", **tidak ada log baru**;
- ketik NIM asing (mis. `999999999`) → layar merah **NOT FOUND**.

Kontrol mode manual: `Backspace` hapus 1 karakter, `Escape` bersihkan.

*Kenapa:* membuktikan tiga hal sekaligus sebelum lanjut — pencarian NIM, pencatatan log, dan **debounce** (mencegah log dobel saat scanner membaca dua kali atau KTM discan ulang).

Saat scanner asli sudah terpasang: set `MANUAL_INPUT=false` di `.env`, supaya ketikan manusia (mis. petugas mengetik NIM manual) tidak dianggap scan oleh deteksi scanner.

Bila ada yang terasa aneh di sepanjang jalan: `npm run checkup` (lihat Bagian 4).

---

## 2. Uji sinkronisasi (Fase 2) dengan mock monitor

*Kenapa mock:* sistem monitoring asli mungkin belum siap atau kontrak API-nya belum jelas. Mock memungkinkan menguji perilaku penting — kirim per-batch, timeout, backoff, ditolak 401/500 — tanpa menyentuh sistem siapa pun.

### Langkah 1 — aktifkan sinkronisasi di `.env`
```
SYNC_ENABLED=true
MONITOR_URL=http://127.0.0.1:4000/api/lab/traffic
MONITOR_TOKEN=secret-token
```
*Kenapa:* worker sinkronisasi **tidak dijalankan sama sekali** bila `SYNC_ENABLED=false` — tidak ada gunanya nyalakan server mock dulu.

### Langkah 2 — nyalakan mock (terminal 1)
```
npm run mock
```
*Kenapa:* endpoint tujuan harus sudah ada sebelum worker mencoba kirim. (Bila belum ada pun worker aman — ia mengulang sendiri dengan backoff — tapi log jadi penuh percobaan gagal.)

### Langkah 3 — jalankan aplikasi (terminal 2)
```
npm start
```
*Kenapa:* worker berjalan **di dalam proses server** dan mulai mengirim log `synced=0` tiap `SYNC_INTERVAL_SECONDS` (uji: 60 detik, produksi: 300 detik).

### Langkah 4 — amati dan picu perilaku
- `GET http://127.0.0.1:4000/control/received` — data yang diterima mock.
- `GET http://127.0.0.1:3000/api/stats` -> `pending_sync` — antrian menunggu kirim; harus menyusut setelah sukses.
- `logs/sync.log` — catatan tiap siklus (MULAI / SUKSES / GAGAL + alasannya).
- Ubah perilaku mock kapan saja: `POST http://127.0.0.1:4000/control/mode` body `{"mode":"timeout"}` — daftar mode (partial, unauthorized, error, drop, slow, ...) di `scripts/mock-monitor.js`.

*Kenapa perlu:* memastikan logika batch, backoff, dan penandaan `synced` benar-benar bekerja — termasuk saat jaringan putus-pasang — sebelum dipercaya di lab.

**Ke sistem monitoring asli:** ganti `MONITOR_URL` dan `MONITOR_TOKEN` di `.env` setelah kontrak API dikonfirmasi. Tidak ada perubahan kode.

---

## 3. Pemasangan di PC lab (Fase 3, produksi)

Instalasi **sekali jalan**. Ikuti urutannya — tiap langkah bergantung pada sebelumnya.

Prasyarat: Node.js LTS, salinan repo ini (git clone / copy folder), file Excel data mahasiswa asli, dan akun Windows untuk kiosk (login sekali dulu di PC tersebut).

### Langkah 1 — pasang dependensi
```
npm ci --omit=dev
```
*Kenapa `npm ci` (bukan `install`):* memasang versi **persis** `package-lock.json` — identik dengan yang sudah diuji di laptop, tanpa risiko versi berubah sendiri.

### Langkah 2 — konfigurasi produksi
```
copy .env.example .env
```
Isi minimal `LAB_NAME`, lalu untuk produksi: `MANUAL_INPUT=false` (scanner asli sudah terpasang) dan `SYNC_ENABLED` sesuai kesiapan monitoring (lihat Bagian 2).

*Kenapa di sini:* server hanya membaca `.env` saat mulai; setelan salah = perilaku salah di lapangan yang sulit ditebak dari luar.

### Langkah 3 — import data mahasiswa asli
```
npm run import -- <file-data-mahasiswa.xlsx>
```
*Kenapa sekarang, bukan nanti:* begitu otomasi nyala (Langkah 4–6), setiap masalah lebih sulit didebug — selesaikan komponen manual dulu. Import idempoten: ulangi kapan pun data mahasiswa berubah. (`--replace` = hapus mahasiswa yang tidak ada di file; **ada pengaman**: file tanpa baris valid ditolak.)

### Langkah 4 — setelan Windows anti-sleep
```
powershell -ExecutionPolicy Bypass -File scripts\setup-system.ps1
```
Jendela UAC muncul → izinkan. (Mau lihat dulu tanpa mengubah apa pun: tambah `-Info`.)

*Kenapa:* kiosk harus nyala terus — sleep mematikan layar, dan reboot Windows Update mendadak menghentikan aplikasi di jam ramai. Script mengatur layar nyala terus, tanpa sleep, dan Update tidak reboot sendiri (jam aktif 07:00–21:00).

### Langkah 5 — otomasi Task Scheduler (server + backup)
```
powershell -ExecutionPolicy Bypass -File scripts\setup-task.ps1
```
*Kenapa:* ada dua tugas yang tidak boleh bergantung pada ingatan orang:
1. `LabScanKTM-Server` — menjalankan `start.bat` **saat logon**, plus **mengulang sendiri** bila server gagal (maks 3×/1 menit). Tanpa ini, server hanya hidup bila seseorang ingat menyalakannya.
2. `LabScanKTM-Backup` — backup harian jam 17:00 (rincian di Bagian 4).

### Langkah 6 — shortcut browser mode kiosk
```
powershell -ExecutionPolicy Bypass -File scripts\setup-shortcut.ps1
```
*Kenapa:* layar lab harus langsung menampilkan kiosk — bukan desktop. Shortcut di `shell:startup` membuka browser otomatis mode `--kiosk` ke `http://127.0.0.1:3000` memakai **profil khusus `LabKiosk`** (tanpa incognito) — supaya izin kamera tersimpan untuk fitur scan-KTM nanti (Fase 4). Browser terdeteksi otomatis: Chrome → Brave → Edge → Helium.

### Langkah 7 — auto-logon Windows (wajib)
```
netplwiz
```
Pilih akun kiosk → **hapus centang** *Users must enter a user name and password to use this computer* → OK → masukkan password akun 2×.

*Kenapa wajib:* task di Langkah 5 berpemicu **"saat logon"**. Bila Windows masih minta password tiap menyala, maka **setelah mati listrik aplikasi tidak akan hidup sendiri** — seluruh otomasi langkah 4–6 jadi percuma untuk skenario itu.

Bila akunnya akun Microsoft atau PC dikelola IT kampus: minta pihak IT mengaktifkan auto-logon (registry `AutoAdminLogon`) — lebih andal daripada `netplwiz`.

*Keamanan:* pakai **akun lokal khusus kiosk** — bukan akun admin atau akun kampus.

### Langkah 8 — uji nyata: restart PC
```
shutdown /r /t 0
```
*Kenapa:* satu-satunya cara membuktikan **seluruh rantai** bekerja tanpa tangan manusia — simulasi nyata "PC dinyalakan pagi" dan "mati listrik lalu nyala lagi".

**Checklist verifikasi setelah restart:**
1. Windows masuk sendiri (tanpa password) → auto-logon bekerja.
2. Browser kiosk terbuka sendiri menampilkan layar standby → shortcut + task bekerja.
3. Scan NIM uji → muncul sambutan dan tercatat.
4. `npm run checkup` → hasil **SEHAT** (tanpa ❌).

**Catatan:**
- Script langkah 4–6 punya mode `-WhatIf` (lihat rencana tanpa menjalankan); langkah 4 juga `-Info`.
- Log: `logs/server.log` dan `logs/sync.log`. Keduanya (juga `logs/backup.log`) dirotasi otomatis jadi `*.old` bila melebihi 1 MB — aman untuk PC yang menyala 24/7.
- Selama sistem monitoring asli belum siap: `SYNC_ENABLED=false` — layar standby menampilkan pengingat + jumlah log menunggu; data menumpuk aman di lokal dan terkirim nanti saat diaktifkan.

---

## 4. Operasi harian & darurat

### Diagnosis cepat — satu perintah
```
npm run checkup
```
*Kenapa:* bila terasa aneh (server tidak hidup, data menumpuk, NIM yang seharusnya terdaftar jadi tidak dikenal), perintah ini memeriksa semuanya sekaligus: konfigurasi `.env`, integritas + hitungan database, status server, isi akhir file log, backup terbaru, task Windows, dan 5 scan terakhir — lalu menyimpulkan **SEHAT** atau menandai masalahnya dengan ❌. Aman dijalankan kapan saja (hanya membuka database, tanpa mengubah data).

### Backup
```
npm run backup                 # salin database -> data/backups/lab-YYYYMMDD-HHMMSS.db
npm run backup -- --keep=10    # seperti di atas, sisakan 10 backup terbaru
npm run backup -- D:\backup    # simpan ke folder lain (flashdisk/disk eksternal)
```
*Kenapa:* data kunjungan di `data/lab.db` adalah satu-satunya catatan kehadiran — tanpa backup, satu kerusakan file = hilang selamanya. Dua jaminan desain:
- Memakai *SQLite online backup API* → **aman dijalankan walau server kiosk masih hidup**, hasilnya selalu konsisten (termasuk antrean log yang belum terkirim).
- Tiap backup lolos `integrity_check` sebelum dinyatakan sukses.

*Backup terjadwal:* Langkah 5 pemasangan juga mendaftarkan backup harian **jam 17:00** (menyisakan 30 file terbaru, hasil tercatat di `logs/backup.log`). Jam 17:00 dipilih agar cadangan hari itu selalu ada sebelum lab tutup. Ubah jadwal/jumlah: `-BackupHour 18 -BackupKeep 60` (tersedia juga `-WhatIf` dan `-Remove`).

### Pemulihan (database rusak / ganti PC)
1. Matikan server (hentikan proses node / cabut shortcut kiosk).
   *Kenapa:* jangan sentuh file database saat server masih menulis.
2. Rename `data/lab.db` menjadi `lab.db.lama` (jangan dihapus dulu).
   *Kenapa:* siapa tahu file lama masih bisa dipulihkan; rename = jalan kembali tanpa kehilangan apa pun.
3. Copy file backup terbaru menjadi `data/lab.db`; hapus `data/lab.db-wal` dan `data/lab.db-shm` bila ada.
   *Kenapa:* `-wal`/`-shm` adalah sisa database **lama** — bila dibiarkan, SQLite bisa mencampurnya dan merusak hasil restore.
4. Nyalakan lagi server.
   *Kenapa:* antrian log ikut terbackup, jadi log yang belum terkirim akan terkirim otomatis saat sinkronisasi aktif — tidak ada data yang hilang.

### Import ulang (data mahasiswa berubah)
```
npm run import -- data-mahasiswa.xlsx            # tambah/perbarui (upsert, aman diulang)
npm run import -- data-mahasiswa.xlsx --replace  # hapus mahasiswa yang tidak ada di file
```
*Kenapa aman diulang:* upsert — NIM sama diperbarui, NIM baru ditambahkan. `--replace` dipakai untuk pergantian roster penuh; file tanpa baris valid ditolak pengaman (tidak bisa mengosongkan tabel).
