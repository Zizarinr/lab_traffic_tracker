# Lab Scan KTM

Aplikasi web kiosk untuk pintu masuk lab. Mahasiswa memindai barcode NIM pada KTM, aplikasi menampilkan sambutan, mencatat kunjungan ke database lokal, dan — bila diaktifkan — mengirim salinan log ke sistem monitoring lab.

Dirancang untuk **PC lab yang bisa mati listrik kapan saja**: fungsi inti berjalan 100% offline, data tidak pernah bergantung pada internet.

| Ringkasan | |
|---|---|
| **Fungsi** | Mencatat kunjungan mahasiswa lewat scan KTM; menerima ketik NIM manual bagi yang tidak membawa KTM |
| **Pengguna** | Petugas lab (operasional harian), IT kampus (pemasangan), pengembang (pemeliharaan) |
| **Kompatibilitas** | Windows 10/11 64-bit; Node.js LTS ≥ 20; Chrome / Brave / Edge / Helium; scanner USB HID (keyboard-wedge) |
| **Status** | Fase 1–3 selesai & teruji; uji nyala-dari-mati di PC lab dan koneksi ke monitoring asli masih menunggu |
| **Data** | 100% lokal di `data/lab.db`; aman saat offline |

## Daftar isi
1. [Mulai cepat (5 menit di laptop)](#1-mulai-cepat-5-menit-di-laptop)
2. [Pemasangan di PC lab (produksi)](#2-pemasangan-di-pc-lab-produksi)
3. [Operasi harian dan darurat](#3-operasi-harian-dan-darurat)
4. [Data dan penyimpanan](#4-data-dan-penyimpanan)
5. [Konfigurasi (.env)](#5-konfigurasi-env)
6. [Troubleshooting dan FAQ](#6-troubleshooting-dan-faq)
7. [Serah terima, lisensi, dan kontak](#7-serah-terima-lisensi-dan-kontak)
- [Lampiran A: Referensi perintah](#lampiran-a-referensi-perintah)
- [Lampiran B: Struktur direktori](#lampiran-b-struktur-direktori)
- [Lampiran C: Dokumen dan glosarium](#lampiran-c-dokumen-dan-glosarium)

## Sekilas cara kerja

### Prinsip utama
1. **Offline-first**: fungsi inti (scan, cari data, sambutan, simpan log) jalan penuh tanpa internet dan tanpa jaringan sama sekali.
2. **Sinkronisasi terpisah**: pengiriman ke monitoring adalah fase belakangan. Selama gagal, data aman di lokal.
3. **UI sederhana**: flat, solid, tegas, tanpa gradasi/shadow, dioptimalkan untuk layar PC.

### Alur singkat
```text
Scanner USB / ketikan manual -> Browser kiosk -> POST /api/scan
   -> Server Express + SQLite (cari NIM, simpan log)
   -> Layar: sambutan (WELCOME_SECONDS) -> standby
   -> (tiap SYNC_INTERVAL_SECONDS) worker kirim log synced=0 ke API monitoring
```

---

## 1. Mulai cepat (5 menit di laptop)

Prasyarat: **Node.js LTS (≥ 20)** terpasang di Windows 10/11.

### Langkah 1 — pasang dependensi
```bat
npm install
```
*Kenapa:* mengunduh `express`, `better-sqlite3`, dan `xlsx` sesuai `package.json` ke `node_modules/`. Cukup sekali; ulangi hanya bila `package.json` berubah. Langkah ini butuh internet — setelah terpasang, aplikasi berjalan 100% offline.

### Langkah 2 — salin konfigurasi
```bat
copy .env.example .env
```
*Kenapa:* semua perilaku (port, nama lab, durasi sambutan, debounce, sinkronisasi) dibaca dari `.env` **saat server mulai** — dan `.env` tidak ikut ter-copy saat meng-clone repo (sengaja, berisi rahasia). Untuk uji laptop biarkan nilai contoh; `SYNC_ENABLED=false` berarti sinkronisasi dimatikan sampai ada tujuan (Bagian 2).

> **Input tidak perlu diatur.** Aplikasi selalu menerima dua cara sekaligus: scanner KTM (terdeteksi dari kecepatan ketikan) dan ketikan manual untuk yang tidak membawa KTM. Tidak ada switch yang perlu diubah per orang.

### Langkah 3 — isi database mahasiswa
```bat
npm run fixture
npm run import -- fixtures\mahasiswa-sample.xlsx
```
Baris pertama membuat Excel contoh; baris kedua mengimpornya ke SQLite.

*Kenapa:* server hanya mengenali NIM yang ada di tabel `mahasiswa` — tanpa isi, setiap scan akan `NOT FOUND`. Import bersifat **upsert**: aman diulang, baris sama diperbarui (tidak diduplikasi). Database `data/lab.db` dibuat otomatis dengan mode WAL — tahan mati listrik mendadak.

### Langkah 4 — jalankan server
```bat
npm start
```
lalu buka `http://127.0.0.1:3000` di browser.

*Kenapa:* inilah aplikasinya — Express menyajikan halaman kiosk + API scan di port 3000.

### Langkah 5 — uji alur scan
- ketik `4420231001` pelan lalu Enter → NIM tampil saat diketik, muncul sambutan nama **BUDI SANTOSO**, lalu kembali standby;
- scan NIM yang sama lagi dalam 10 detik → hanya berkedip "duplikat", **tidak ada log baru**;
- ketik NIM asing (mis. `999999999`) → layar merah **NOT FOUND**.

Kontrol saat mengetik manual: `Backspace` hapus 1 karakter, `Escape` bersihkan.

*Kenapa:* membuktikan tiga hal sekaligus sebelum lanjut — pencarian NIM, pencatatan log, dan **debounce** (mencegah log dobel saat scanner membaca dua kali atau KTM discan ulang).

**Dua cara input berjalan otomatis tanpa setelan:**
- **Scanner KTM** — karakter datang sangat cepat (≤30 ms/karakter) → layar tetap bersih, NIM tidak ditampilkan; Enter langsung memproses.
- **Ketik manual** (mis. mahasiswa tidak membawa KTM) — karakter datang pelan → NIM tampil besar di layar, Enter memproses. Petunjuk "KETIK NIM LALU TEKAN ENTER" selalu tampil di layar standby.

Bila ada yang terasa aneh di sepanjang jalan: `npm run checkup` (lihat Bagian 3).

---

## 2. Pemasangan di PC lab (produksi)

Instalasi **sekali jalan**. Ikuti urutannya — tiap langkah bergantung pada sebelumnya.

Prasyarat: Windows 10/11 64-bit, Node.js LTS (≥ 20), salinan repo ini (git clone / copy folder), file Excel data mahasiswa asli, dan akun Windows untuk kiosk (login sekali dulu di PC tersebut).

### Langkah 1 — pasang dependensi
```bat
npm ci --omit=dev
```
*Kenapa `npm ci` (bukan `install`):* memasang versi **persis** `package-lock.json` — identik dengan yang sudah diuji di laptop, tanpa risiko versi berubah sendiri. Sama seperti langkah 1 di laptop, instalasi butuh internet sekali; setelah itu runtime offline.

### Langkah 2 — konfigurasi produksi
```bat
copy .env.example .env
```
Isi minimal `LAB_NAME`, lalu untuk produksi: `SYNC_ENABLED` sesuai kesiapan monitoring (uji mock ada di bagian bawah ini). Input scanner/manual **tidak perlu diatur** — keduanya aktif otomatis.

*Kenapa di sini:* server hanya membaca `.env` saat mulai; setelan salah = perilaku salah di lapangan yang sulit ditebak dari luar.

### Langkah 3 — import data mahasiswa asli
```bat
npm run import -- data-mahasiswa.xlsx
```
Ganti `data-mahasiswa.xlsx` dengan path file Excel-mu.

*Kenapa sekarang, bukan nanti:* begitu otomasi nyala (Langkah 4–6), setiap masalah lebih sulit didebug — selesaikan komponen dasar dulu. Import idempoten: ulangi kapan pun data mahasiswa berubah. (`--replace` = hapus mahasiswa yang tidak ada di file; **ada pengaman**: file tanpa baris valid ditolak.)

### Langkah 4 — setelan Windows anti-sleep
```bat
powershell -ExecutionPolicy Bypass -File scripts\setup-system.ps1
```
Jendela UAC muncul → izinkan. (Mau lihat dulu tanpa mengubah apa pun: tambah `-Info` atau `-WhatIf`.)

*Kenapa:* kiosk harus nyala terus — sleep mematikan layar, dan reboot Windows Update mendadak menghentikan aplikasi di jam ramai. Script mengatur layar nyala terus, tanpa sleep, dan Update tidak reboot sendiri (jam aktif 07:00–21:00).

### Langkah 5 — otomasi Task Scheduler (server + backup)
```bat
powershell -ExecutionPolicy Bypass -File scripts\setup-task.ps1
```
*Kenapa:* ada dua tugas yang tidak boleh bergantung pada ingatan orang:
1. `LabScanKTM-Server` — menjalankan `start.bat` **saat logon**, plus **mengulang sendiri** bila server gagal (maks 3×/1 menit). Tanpa ini, server hanya hidup bila seseorang ingat menyalakannya.
2. `LabScanKTM-Backup` — backup harian jam 17:00 (rincian di Bagian 3).

### Langkah 6 — shortcut browser mode kiosk
```bat
powershell -ExecutionPolicy Bypass -File scripts\setup-shortcut.ps1
```
*Kenapa:* layar lab harus langsung menampilkan kiosk — bukan desktop. Shortcut di `shell:startup` membuka browser otomatis mode `--kiosk` ke `http://127.0.0.1:3000` memakai **profil khusus `LabKiosk`** (tanpa incognito) — supaya izin kamera tersimpan untuk fitur scan-KTM nanti (Fase 4). Browser terdeteksi otomatis: Chrome → Brave → Edge → Helium.

### Langkah 7 — auto-logon Windows (wajib)
```bat
netplwiz
```
Pilih akun kiosk → **hapus centang** *Users must enter a user name and password to use this computer* → OK → masukkan password akun 2×.

*Kenapa wajib:* task di Langkah 5 berpemicu **"saat logon"**. Bila Windows masih minta password tiap menyala, maka **setelah mati listrik aplikasi tidak akan hidup sendiri** — seluruh otomasi langkah 4–6 jadi percuma untuk skenario itu.

Bila akunnya akun Microsoft atau PC dikelola IT kampus: minta pihak IT mengaktifkan auto-logon (registry `AutoAdminLogon`) — lebih andal daripada `netplwiz`.

*Keamanan:* pakai **akun lokal khusus kiosk** — bukan akun admin atau akun kampus.

### Langkah 8 — uji nyata: restart PC
```bat
shutdown /r /t 0
```
*Kenapa:* satu-satunya cara membuktikan **seluruh rantai** bekerja tanpa tangan manusia — simulasi nyata "PC dinyalakan pagi" dan "mati listrik lalu nyala lagi".

**Checklist verifikasi setelah restart:**
1. Windows masuk sendiri (tanpa password) → auto-logon bekerja.
2. Browser kiosk terbuka sendiri menampilkan layar standby → shortcut + task bekerja.
3. Scan NIM uji → muncul sambutan dan tercatat.
4. `npm run checkup` → hasil **SEHAT** (tanpa ❌).

Untuk pengujian menyeluruh (semua fitur, termasuk sinkronisasi dengan mock dan ketahanan), pakai checklist siap-centang: **[docs/TESTING.md](docs/TESTING.md)** — berlaku di PC mana pun yang memenuhi syarat kompatibilitasnya.

**Catatan:**
- Script langkah 4–6 punya mode `-WhatIf` (lihat rencana tanpa menjalankan); langkah 4 juga `-Info`.
- Log: `logs/server.log` dan `logs/sync.log`. Keduanya (juga `logs/backup.log`) dirotasi otomatis jadi `*.old` bila melebihi 1 MB — aman untuk PC yang menyala 24/7.
- Selama sistem monitoring asli belum siap: `SYNC_ENABLED=false` — layar standby menampilkan pengingat + jumlah log menunggu; data menumpuk aman di lokal dan terkirim nanti saat diaktifkan.

### Uji sinkronisasi dengan mock (opsional, sebelum monitoring asli siap)

*Kenapa mock:* sistem monitoring asli mungkin belum siap atau kontrak API-nya belum jelas. Mock memungkinkan menguji batch, timeout, backoff, dan penolakan 401/500 tanpa menyentuh sistem siapa pun.

1. **Aktifkan di `.env`** — `SYNC_ENABLED=true`, `MONITOR_URL=http://127.0.0.1:4000/api/lab/traffic`, `MONITOR_TOKEN=secret-token`, `SYNC_INTERVAL_SECONDS=10`.
   *Kenapa:* worker tidak dijalankan sama sekali bila `SYNC_ENABLED=false`.
2. **Terminal 1:** `npm run mock` — endpoint tujuan harus ada sebelum worker mencoba kirim.
3. **Terminal 2:** `npm start` — worker berjalan di dalam proses server, mengirim log `synced=0` tiap interval.
4. **Amati:**
   - `GET http://127.0.0.1:4000/control/received` — data yang diterima mock.
   - `GET http://127.0.0.1:3000/api/stats` → `pending_sync` (harus menyusut setelah sukses).
   - `logs/sync.log` — catatan tiap siklus (MULAI / SUKSES / GAGAL + alasan).
   - Ubah mode: `POST http://127.0.0.1:4000/control/mode` body `{"mode":"timeout"}`. Mode tersedia: `ok`, `partial`, `no-accepted`, `unauthorized`, `bad-request`, `error`, `timeout`, `slow`, `drop`.

*Kenapa perlu:* memastikan logika batch, backoff, dan penandaan `synced` benar-benar bekerja — termasuk saat jaringan putus-pasang — sebelum dipercaya di lab.

**Penting:** uji sukses menandai log `synced=1`. Lakukan sebelum mengimport data asli, atau terima bahwa scan uji tidak akan terkirim ke monitoring asli nanti.

**Ke sistem monitoring asli:** ganti `MONITOR_URL` dan `MONITOR_TOKEN` di `.env` setelah kontrak API dikonfirmasi. Tidak ada perubahan kode.

---

## 3. Operasi harian dan darurat

### Diagnosis cepat — satu perintah
```bat
npm run checkup
```
*Kenapa:* bila terasa aneh (server tidak hidup, data menumpuk, NIM yang seharusnya terdaftar jadi tidak dikenal), perintah ini memeriksa semuanya sekaligus: konfigurasi `.env`, integritas + hitungan database, status server, isi akhir file log, backup terbaru, task Windows, dan 5 scan terakhir — lalu menyimpulkan **SEHAT** atau menandai masalahnya dengan ❌. Aman dijalankan kapan saja (hanya membuka database, tanpa mengubah data).

### Buat laporan Excel dari log scan
```bat
npm run report
npm run report -- --from 2026-10-22 --to 2026-10-24
npm run report -- --out D:\laporan\lab-oktober.xlsx
```
Baris 1 = semua data; baris 2 = rentang tanggal (WIB); baris 3 = tentukan lokasi file.

*Kenapa:* layar kiosk hanya menampilkan angka **hari ini**; untuk rekap mingguan/bulanan, log di-export jadi Excel berisi 3 sheet: **Ringkasan Per Hari** (hadir, tidak terdaftar, total, mahasiswa unik), **Semua Scan** (audit lengkap + status terkirim), dan **Rekap Per Mahasiswa** (jumlah kunjungan, scan pertama/terakhir).

- **Aman dijalankan walau server kiosk hidup:** database dibuka *read-only* — tidak ada data yang ditulis atau diubah.
- Hasil tersimpan di `reports/` dan **tidak di-commit** (berisi data kehadiran).
- Kolom **Terkirim ke monitoring = Belum** menandakan log yang masih menunggu sinkronisasi; berubah **Ya** setelah diterima sistem monitoring.

### Backup
```bat
npm run backup
npm run backup -- --keep=10
npm run backup -- D:\backup
```
Baris 1 = salin ke `data/backups/`; baris 2 = sisakan 10 backup terbaru; baris 3 = simpan ke folder lain (flashdisk/disk eksternal).

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
```bat
npm run import -- data-mahasiswa.xlsx
npm run import -- data-mahasiswa.xlsx --replace
```
Baris 1 = tambah/perbarui (upsert, aman diulang); baris 2 = hapus mahasiswa yang tidak ada di file.

*Kenapa aman diulang:* upsert — NIM sama diperbarui, NIM baru ditambahkan. `--replace` dipakai untuk pergantian roster penuh; file tanpa baris valid ditolak pengaman (tidak bisa mengosongkan tabel).

---

## 4. Data dan penyimpanan

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

### 3. Sinkronisasi ke sistem monitoring
Interval diatur `.env`: `SYNC_INTERVAL_SECONDS` (produksi 300 detik). **Bukan backup, cuma pengiriman antrian.**

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
- **Selama berjalan:** semua data operasional berada di `data/lab.db` (offline-first).
- **Sync:** **bukan pemindahan data** — hanya kirim salinan + ubah flag `synced` di file yang sama.
- **Backup harian:** **buat salinan terpisah** (`data/backups/`) untuk jaga-jaga kalau file utama rusak/terhapus.
- **Laporan Excel:** `npm run report` **hanya membaca** database lalu menulis file baru di `reports/` — database tetap utuh.
- **Online/offline:** bedanya cuma "apakah ada yang bisa dikirim". Kalau offline, data tetap aman 100% di lokal.

---

## 5. Konfigurasi (.env)

Disalin dari `.env.example`. Server membaca `.env` **hanya saat mulai** — ubah nilai lalu restart server.

| Variabel | Contoh | Fungsi |
|---|---|---|
| `PORT` | `3000` | Port lokal (hanya `127.0.0.1`). Ganti bila bentrok. |
| `LAB_NAME` | `LAB-1` | Nama lab yang tampil di layar standby. |
| `DEBOUNCE_SECONDS` | `10` | Jeda minimum agar scan NIM yang sama tidak dicatat dua kali. |
| `WELCOME_SECONDS` | `2` | Lama layar sambutan (detik). Default kode: 3. |
| `SYNC_ENABLED` | `false` | `true` = worker sinkronisasi berjalan. Biarkan `false` selama server pusat belum siap. |
| `SYNC_INTERVAL_SECONDS` | `300` | Interval kirim log (detik). Produksi 300; uji 10–60. |
| `SYNC_BATCH_SIZE` | `100` | Jumlah log maksimum per batch kirim. |
| `SYNC_TIMEOUT_SECONDS` | `10` | Batas waktu satu request kirim. |
| `MONITOR_URL` | `http://192.168.1.50:8080/api/lab/traffic` | Endpoint sistem monitoring (contoh; ganti dengan alamat asli). Kosongkan bila sync nonaktif. |
| `MONITOR_TOKEN` | *(kosong)* | Token Bearer dari pengelola monitoring. |

Detail teknis & kontrak API: [docs/tech.md](docs/tech.md) dan [docs/api.md](docs/api.md).

---

## 6. Troubleshooting dan FAQ

### Troubleshooting cepat
| Gejala | Tindakan |
|---|---|
| `npm start` → `GAGAL: port ... terpakai` | Server lama masih hidup; tutup proses `node.exe` atau restart PC |
| Layar kiosk putih / tidak memuat | Pastikan server hidup (`/api/health`), buka `http://127.0.0.1:3000` |
| Scanner tidak terbaca | Cek kabel/mode HID; ketik NIM manual untuk memastikan aplikasi sehat |
| Echo NIM muncul saat scan KTM | Scanner mungkin lebih lambat dari 30 ms/karakter; catat merek/tipe dan laporkan untuk penyesuaian ambang |
| Tidak hidup setelah PC menyala | Cek urutan: auto-logon → task `LabScanKTM-Server` → shortcut kiosk |
| Sync tidak jalan | Mock/server pusat hidup? `MONITOR_URL` & token benar? lihat `logs/sync.log` |
| Import 0 baris | Kolom wajib `nim` dan `nama`; hanya sheet pertama yang dibaca |
| Ada tanda ❌ di checkup | Baca bagian yang ditandai; kirim output checkup saat minta bantuan |

Checklist lengkap + lampiran troubleshooting: [docs/TESTING.md](docs/TESTING.md).

### FAQ

**Apakah butuh internet?**
Tidak. Scan, pencarian, sambutan, dan penyimpanan log berjalan penuh offline. Internet hanya dipakai bila `SYNC_ENABLED=true`.

**Data kunjungan disimpan di mana?**
`data/lab.db` (tabel `scan_log`). Backup ada di `data/backups/`, laporan Excel di `reports/`. Rincian: Bagian 4.

**Bagaimana mahasiswa yang tidak membawa KTM?**
Ketik NIM di layar lalu Enter. NIM langsung tampil karena aplikasi membedakan ketikan manusia dari scanner secara otomatis — tidak ada switch yang perlu diubah.

**Server pusat/monitoring belum selesai, apakah aman dipakai?**
Aman. Set `SYNC_ENABLED=false`; log menumpuk di lokal dengan status `synced=0`. Saat server pusat siap, isi `MONITOR_URL` + `MONITOR_TOKEN`, set `SYNC_ENABLED=true`, restart — seluruh backlog terkirim berurutan.

**Bagaimana melihat rekap 3 hari/mingguan?**
`npm run report` (semua data) atau `npm run report -- --from YYYY-MM-DD --to YYYY-MM-DD`. Hasilnya 3 sheet Excel di `reports/`.

**Bagaimana mengganti nama lab?**
Ubah `LAB_NAME` di `.env`, lalu restart server (atau restart PC).

**Bagaimana menambah/mengubah data mahasiswa?**
`npm run import -- file.xlsx` — upsert, aman diulang. Untuk mengganti roster penuh: tambah `--replace`.

**Bagaimana kalau listrik mati?**
Database memakai mode WAL sehingga data yang sudah tersimpan tidak hilang. Saat PC menyala lagi, auto-logon + Task Scheduler menghidupkan server dan kiosk tanpa tindakan manual.

**Bisa dijalankan di macOS/Linux?**
Target resmi hanya Windows 10/11 (Task Scheduler, `start.bat`, PowerShell). Di OS lain mungkin bisa dijalankan manual, tetapi tidak diuji dan tidak didukung.

**Bagaimana memperbarui aplikasi?**
Di PC lab: `git pull` (atau copy folder baru), `npm ci --omit=dev`, lalu restart server/PC. Data di `data/` tidak tersentuh.

**Apakah data lama dihapus otomatis?**
Tidak. `scan_log` tumbuh terus; backup menyimpan 30 file terbaru. Arsipkan rekap berkala dengan `npm run report` bila perlu.

**Jam di database berbeda dengan jam PC?**
Timestamp selalu disimpan sebagai WIB (`+07:00`) apa pun zona waktu Windows. Pastikan jam PC tetap benar.

---

## 7. Serah terima, lisensi, dan kontak

### Checklist serah terima
- [ ] Folder/repo aplikasi + catatan commit terakhir.
- [ ] File `.env` produksi (berisi `LAB_NAME`, `MONITOR_URL`, `MONITOR_TOKEN`).
- [ ] File Excel data mahasiswa asli (sumber import).
- [ ] Salinan backup terbaru di media terpisah (flashdisk/disk eksternal).
- [ ] Akun Windows kiosk + auto-logon aktif.
- [ ] Dokumen ini, [docs/TESTING.md](docs/TESTING.md), dan [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- [ ] Kontak IT/pengelola monitoring untuk integrasi berikutnya.

### Lisensi
ISC — lihat [LICENSE](LICENSE). Ringkasnya: bebas dipakai, diubah, dan didistribusikan dengan tetap menyertakan notice hak cipta.

### Kontak
Lab Komputer — *[isi nama/email/WhatsApp pengelola]*.
Untuk masalah teknis, sertakan output `npm run checkup` dan langkah yang sedang dilakukan.

---

## Lampiran A: Referensi perintah

| Perintah | Fungsi |
|---|---|
| `npm install` | Pasang dependensi (pengembangan). |
| `npm ci --omit=dev` | Pasang dependensi versi lockfile (produksi). |
| `npm start` | Jalankan server kiosk. |
| `npm run checkup` | Diagnosis satu perintah (config, DB, server, log, backup, task). |
| `npm run report` | Export log ke Excel (`--from`, `--to`, `--out`). |
| `npm run backup` | Backup database (`--keep=N`, atau tentukan folder). |
| `npm run import -- data-mahasiswa.xlsx` | Import/upsert data mahasiswa (`--replace` opsional). |
| `npm run fixture` | Buat Excel contoh untuk uji. |
| `npm run mock` | Jalankan monitoring tiruan (port 4000). |
| `scripts\setup-system.ps1` | Setelan Windows anti-sleep/anti-reboot (`-Info`, `-WhatIf`). |
| `scripts\setup-task.ps1` | Daftarkan task server + backup (`-WhatIf`, `-Remove`, `-BackupHour`, `-BackupKeep`). |
| `scripts\setup-shortcut.ps1` | Shortcut browser kiosk saat logon (`-WhatIf`, `-Remove`). |

## Lampiran B: Struktur direktori

```text
traffic_tracker/
├── server.js              # ENTRY PROGRAM: Express + API scan + worker sinkron
├── start.bat              # entry deployment (Task Scheduler): node server.js + log ke logs/server.log
├── backup.bat             # entry backup terjadwal (Task Scheduler 17:00)
├── package.json           # dependensi + daftar npm scripts
├── .env.example           # templat konfigurasi — disalin jadi .env
├── LICENSE                # lisensi ISC
│
├── src/                   # LOGIKA SERVER (hidup tiap kali program jalan)
│   ├── config.js          #   baca & validasi .env
│   ├── db.js              #   buat/kelola database SQLite (mode WAL)
│   ├── scan.js            #   otak satu scan: validasi NIM, cari, debounce, catat log
│   ├── importer.js        #   logika impor Excel (upsert + pengaman --replace)
│   └── sync.js            #   worker kirim log synced=0 ke monitoring (backoff saat gagal)
│
├── public/                # TAMPILAN KIOSK — dijalankan di browser
│   ├── index.html         #   semua state layar (standby/berhasil/tidak terdaftar/sistem bermasalah)
│   ├── style.css          #   gaya flat sesuai design.md
│   └── app.js             #   jam, deteksi scanner, mesin state, panggil API
│
├── scripts/               # ALAT OPERASI (sesekali — bukan tiap boot)
│   ├── import-excel.js    #   CLI impor (npm run import)
│   ├── checkup.js         #   diagnosis satu perintah (npm run checkup)
│   ├── export-xlsx.js     #   export laporan Excel dari log (npm run report)
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
├── reports/               # hasil laporan Excel (npm run report), TIDAK di-commit
└── docs/                  # dokumen desain (lihat Lampiran C)
```

Yang runtime hanya `server.js` + `src/` + `public/` — PC lab cukup "Node.js + folder ini" untuk hidup. Detail per file dan alur eksekusinya ada di [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Lampiran C: Dokumen dan glosarium

### Dokumen
| File | Isi |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | **Cara kerja program**: teknologi, peta file, alur eksekusi dari nol sampai akhir |
| [TESTING.md](docs/TESTING.md) | **Checklist uji semua fitur** di PC lab (berlaku untuk semua PC yang kompatibel) |
| [requirements.md](docs/requirements.md) | Kebutuhan dan batasan |
| [tech.md](docs/tech.md) | Stack, spesifikasi teknis, env, deployment Windows |
| [design.md](docs/design.md) | UI, state layar, perilaku scan |
| [database.md](docs/database.md) | Skema SQLite dan aturan import Excel |
| [api.md](docs/api.md) | Endpoint internal dan kontrak ke sistem monitoring |
| [tasks.md](docs/tasks.md) | Checklist implementasi bertahap untuk code agent |

### Glosarium
| Istilah | Arti |
|---|---|
| **Kiosk** | Mode layar penuh tanpa UI browser, khusus untuk PC lab. |
| **Keyboard-wedge** | Scanner yang "mengetik" hasil scan seperti keyboard; tidak butuh driver. |
| **Burst scanner** | Rangkaian karakter sangat cepat (≤30 ms/karakter) yang menandakan input scanner. |
| **Debounce** | Jeda minimum agar scan berulang dalam waktu singkat tidak dicatat dua kali. |
| **Offline-first** | Fungsi inti dirancang tetap berjalan tanpa jaringan. |
| **WAL** | Mode jurnal SQLite yang lebih tahan terhadap mati listrik mendadak. |
| **Upsert** | Tambah bila belum ada, perbarui bila sudah ada — tanpa duplikasi. |
| **Backoff** | Jeda yang makin panjang antar percobaan kirim setelah gagal. |
| **Synced** | Penanda bahwa sebuah log sudah diakui diterima sistem monitoring. |
| **Snapshot** | Salinan database yang konsisten pada satu titik waktu. |
