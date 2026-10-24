# Testing — Checklist Uji Lab Scan KTM

Checklist ini dipakai untuk menguji **semua fitur** di PC lab. Ditulis agar berlaku di **PC mana pun yang memenuhi syarat kompatibilitas** — tidak bergantung pada merek scanner, browser, atau versi Windows tertentu.

**Prinsip uji:**
1. **Berurutan** — A → B → C → D → E → F → G → H. Tiap bagian mengandalkan bagian sebelumnya.
2. **Data uji dulu, data asli belakangan** — bagian A–E memakai data contoh. Data mahasiswa asli baru diimport di bagian H.
3. **Selalu aman** — sebelum uji yang berpotensi mengubah data (E, G5, H1), jalankan `npm run backup` lebih dulu.
4. Catat hasil per baris: `[x]` lulus, `[!]` gagal (tulis catatan), `[-]` dilewati (tulis alasan).

---

## 0. Kompatibilitas & persiapan

### Syarat minimum (semua PC yang memenuhi ini boleh dipakai)

| Komponen | Syarat | Catatan |
|---|---|---|
| OS | Windows 10 / 11 (64-bit) | 32-bit tidak diuji (modul native `better-sqlite3`) |
| Node.js | LTS 20 / 22 / 24 | Diuji di Node 24; cek `node -v` |
| Browser | Chrome, Brave, Edge, atau Helium | `setup-shortcut.ps1` mendeteksi otomatis dalam urutan itu |
| Scanner | USB **keyboard-wedge** (HID), suffix Enter | Merek apa pun; tanpa driver khusus |
| Layar | ≥ 1366×768 | Teks harus terbaca 1–2 m |
| Hak akses | Admin **hanya** untuk `setup-*.ps1`; operasional harian pakai akun kiosk non-admin | |
| Jaringan | **Tidak wajib** untuk fungsi inti | Hanya untuk sinkronisasi ke monitoring |
| Disk | ± 300 MB (`node_modules`) + pertumbuhan database | |
| Zona waktu | Jam PC benar | Timestamp aplikasi selalu WIB (+07:00), apa pun zona waktu Windows |

### Langkah persiapan

- [ ] **P0.1** Catat lingkungan: nama PC, Windows (`winver`), `node -v`, `npm -v`, browser, merek scanner — isi di bagian *Lembar Hasil* paling bawah.
- [ ] **P0.2** Buka folder proyek, jalankan `npm ci --omit=dev` → selesai tanpa error.
- [ ] **P0.3** `copy .env.example .env` (bila belum ada) lalu isi `LAB_NAME`.
- [ ] **P0.4** `npm run fixture` (bila file contoh belum ada) lalu `npm run import -- fixtures\mahasiswa-sample.xlsx` → ringkasan import tampil (`Ditambah … Diperbarui … Dilewati …`).
- [ ] **P0.5** `npm run checkup` → database **integritas ok**, `mahasiswa` > 0.
- [ ] **P0.6** `npm run backup` → file baru muncul di `data\backups\` (titik aman sebelum uji).

---

## A. Fungsi inti / Fase 1 (tanpa jaringan)

Jalankan `npm start`, buka `http://127.0.0.1:3000`.

| ID | Langkah | Hasil yang diharapkan | Lulus? |
|---|---|---|---|
| A1 | Scan NIM contoh `4420231001` (atau NIM asli yang sudah diimport) | Layar hijau, nama + kelas + semester benar, kembali standby setelah `WELCOME_SECONDS` | [ ] |
| A2 | Scan NIM yang **tidak** ada di database (mis. `999999999`) | Layar merah TIDAK TERDAFTAR, kembali standby | [ ] |
| A3 | Scan NIM yang sama lagi dalam < 10 detik | Berkedip "duplikat"; **tidak** menambah log/counter | [ ] |
| A4 | Setelah 10 detik, scan NIM yang sama lagi | Tercatat sebagai kunjungan baru (counter bertambah) | [ ] |
| A5 | Dua NIM berbeda beruntun | Tampilan berganti ke scan terbaru, tidak "nyangkut" | [ ] |
| A6 | Mode manual (`MANUAL_INPUT=true`): ketik NIM pelan + Enter | Echo NIM tampil saat mengetik; Enter memproses | [ ] |
| A7 | Mode manual: `Backspace` dan `Escape` | Backspace hapus 1 karakter; Escape bersihkan buffer | [ ] |
| A8 | Buka `http://127.0.0.1:3000/api/stats` | `today` = jumlah scan `ok` hari ini; `pending_sync` = jumlah log belum terkirim | [ ] |
| A9 | Restart server (`Ctrl+C` lalu `npm start`) | Data mahasiswa & log tetap ada; counter tidak berubah | [ ] |
| A10 | Restart **PC**, lalu buka aplikasi lagi | Data & log tetap ada (WAL bekerja) | [ ] |

> NIM contoh berasal dari fixture. Bila sudah memakai data asli, ganti dengan NIM nyata dari file import Anda — langkah ujinya sama.

---

## B. Import & integritas data

| ID | Langkah | Hasil yang diharapkan | Lulus? |
|---|---|---|---|
| B1 | `npm run import -- fixtures\mahasiswa-sample.xlsx` (ulang) | Ringkasan muncul; **jumlah mahasiswa tidak bertambah** (upsert, bukan duplikat) | [ ] |
| B2 | Import file Excel data asli lab | Ringkasan `Ditambah … Diperbarui … Dilewati …`; baris tanpa NIM/nama dilewati | [ ] |
| B3 | NIM berawalan nol (mis. `00123456`) | Tersimpan & bisa discan persis `00123456` (bukan `123456`) | [ ] |
| B4 | NIM panjang (mis. `442023123456789`) | Tersimpan utuh, bisa discan | [ ] |
| B5 | File tanpa kolom `nim`/`nama` | Ditolak dengan pesan jelas; database **tidak berubah** | [ ] |
| B6 | `npm run import -- <file kosong> --replace` | **DITOLAK** (pengaman), data lama tetap utuh | [ ] |

Setelah B6, jalankan `npm run checkup` — jumlah mahasiswa harus sama seperti sebelum B6.

---

## C. Hardware scanner & keterbacaan

| ID | Langkah | Hasil yang diharapkan | Lulus? |
|---|---|---|---|
| C1 | Set `MANUAL_INPUT=false` di `.env`, restart, scan KTM asli | Langsung terproses tanpa echo; tidak ada karakter nyasar di layar | [ ] |
| C2 | Scan cepat 3–5 KTM berturut-turut | Semua terproses berurutan, tidak ada yang hilang/tertukar | [ ] |
| C3 | Ketik manual NIM dengan `MANUAL_INPUT=false` | Ketikan manusia **tidak** mengganggu (deteksi burst scanner) | [ ] |
| C4 | Baca layar dari jarak 1–2 m | Nama & status terbaca jelas | [ ] |
| C5 | Scan saat layar sambutan masih tampil | Tetap diproses (tidak "menunggu" sambutan selesai) | [ ] |
| C6 | Cabut–pasang scanner | Scanner tetap berfungsi setelah dicolok lagi (keyboard-wedge) | [ ] |

---

## D. Operasi harian

| ID | Langkah | Hasil yang diharapkan | Lulus? |
|---|---|---|---|
| D1 | `npm run checkup` | Ringkasan **SEHAT**; ❌ 0. Kuning `MANUAL_INPUT`/`SYNC_ENABLED` boleh muncul sesuai kondisi | [ ] |
| D2 | `npm run report` lalu buka file di `reports\` | 3 sheet: Ringkasan Per Hari, Semua Scan, Rekap Per Mahasiswa; angka cocok dengan `/api/stats` | [ ] |
| D3 | `npm run report -- --from <hari-ini> --to <hari-ini>` | Hanya data hari itu yang masuk | [ ] |
| D4 | `npm run backup` | File `lab-YYYYMMDD-HHMMSS.db` baru; `npm run checkup` tetap integritas ok | [ ] |
| D5 | `npm run backup -- --keep=3` (setelah ada >3 file) | Hanya 3 backup terbaru tersisa | [ ] |
| D6 | `npm run checkup` saat server **mati** | Tetap jalan; bagian Server melaporkan "belum berjalan" (bukan error) | [ ] |

---

## E. Sinkronisasi dengan mock monitor (pengganti server pusat)

> **PENTING:** uji sukses di bagian ini menandai log `synced=1`. Lakukan **sebelum** mengimport data asli, atau terima bahwa scan uji tidak akan terkirim ke monitoring asli nanti.

**Persiapan:**
- [ ] **E0.1** Terminal 1: `npm run mock` → tampil `listen http://127.0.0.1:4000 | mode=ok`.
- [ ] **E0.2** `.env`: `SYNC_ENABLED=true`, `MONITOR_URL=http://127.0.0.1:4000/api/lab/traffic`, `MONITOR_TOKEN=secret-token`, `SYNC_INTERVAL_SECONDS=10`.
- [ ] **E0.3** Terminal 2: restart `npm start` → log `Sync : aktif -> http://127.0.0.1:4000/...`.

Ubah perilaku mock: `POST http://127.0.0.1:4000/control/mode` body `{"mode":"timeout"}` (mode: `ok`, `partial`, `no-accepted`, `unauthorized`, `bad-request`, `error`, `timeout`, `slow`, `drop`).

| ID | Langkah | Hasil yang diharapkan | Lulus? |
|---|---|---|---|
| E1 | Mode `ok`, scan 2 NIM | Dalam ≤ interval: `logs\sync.log` → SUKSES; `/control/received` berisi data; `pending_sync` turun | [ ] |
| E2 | Mode `timeout`, scan 1 NIM | `sync.log` → GAGAL timeout; log tetap `synced=0`; scan tetap instan | [ ] |
| E3 | Mode `unauthorized` (401) | Dicatat gagal; **tidak** ada log yang ditandai terkirim | [ ] |
| E4 | Mode `error` (500) | Sama seperti E3 | [ ] |
| E5 | Mode `partial` | Hanya sebagian id (yang `accepted`) ditandai; sisanya tetap `pending_sync` | [ ] |
| E6 | Kembali ke mode `ok` | Backlog terkirim berurutan; `pending_sync` → 0 | [ ] |
| E7 | Mode `drop` (data diterima tapi respons hilang), lalu `ok` | Tidak ada duplikat di database; mock mencatat `dup` di `/control/state`; akhirnya tersinkron | [ ] |
| E8 | Mode `no-accepted` | Seluruh batch ditandai terkirim (200 tanpa daftar accepted) | [ ] |
| E9 | Mode `slow` | Tidak macet; berhasil bila respons < `SYNC_TIMEOUT_SECONDS` | [ ] |
| E10 | `POST /control/reset` | Data mock dikosongkan; pengujian bisa diulang | [ ] |

**Setelah E selesai (wajib):**
- [ ] **E11** Kembalikan `.env`: `SYNC_ENABLED=false`, `SYNC_INTERVAL_SECONDS=300`, kosongkan `MONITOR_URL`/`MONITOR_TOKEN`; restart server; matikan mock.
- [ ] **E12** `npm run checkup` → sinkronisasi nonaktif, tidak ada error baru.

---

## F. Otomasi Windows (Task Scheduler, kiosk, auto-logon)

Jalankan di PC lab **sebagai admin** untuk script setup.

| ID | Langkah | Hasil yang diharapkan | Lulus? |
|---|---|---|---|
| F1 | `powershell -ExecutionPolicy Bypass -File scripts\setup-system.ps1 -Info` | Menampilkan setelan nyata (sleep, layar, reboot Update) tanpa mengubah apa pun | [ ] |
| F2 | `... setup-system.ps1 -WhatIf` | Menampilkan 8 rencana perubahan, tidak ada yang diterapkan | [ ] |
| F3 | `... setup-system.ps1` (izinkan UAC) | Selesai tanpa error; `-Info` sesudahnya menunjukkan sleep/layar mati **nonaktif** | [ ] |
| F4 | `... setup-task.ps1 -WhatIf` lalu `... setup-task.ps1` | Dua task terdaftar: cek dengan `Get-ScheduledTask -TaskName 'LabScanKTM-*' \| Select TaskName,State` → keduanya `Ready` | [ ] |
| F5 | `... setup-shortcut.ps1 -WhatIf` lalu `... setup-shortcut.ps1` | Shortcut `Lab Scan KTM` muncul di `shell:startup` (buka lewat `explorer shell:startup`) | [ ] |
| F6 | Auto-logon: `netplwiz` → hapus centang password → isi password 2× | Windows masuk otomatis (uji nyata di F7) | [ ] |
| F7 | **Cold boot:** `shutdown /r /t 0` | (1) Windows login sendiri; (2) browser kiosk terbuka penuh menampilkan standby; (3) scan uji tercatat; (4) `npm run checkup` tanpa ❌ | [ ] |
| F8 | Hentikan paksa server: Task Manager → akhiri proses `node.exe` | Server hidup lagi dalam ≤ 1 menit (task restart otomatis 3×/menit) | [ ] |
| F9 | Tutup browser kiosk (`Alt+F4` tidak tersedia) — restart PC | Kiosk kembali terbuka otomatis setelah logon | [ ] |

**Catatan perbedaan antar-PC:**
- Windows 11: bila `netplwiz` tidak menampilkan opsi password, pakai **Settings → Accounts → Sign-in options** atau minta IT mengaktifkan `AutoAdminLogon` lewat registry.
- Bila browser utama bukan Chrome, `setup-shortcut.ps1` otomatis memilih Brave → Edge → Helium; pastikan yang terpasang benar-benar ada.
- Antivirus/kebijakan kampus bisa memblokir pembuatan shortcut/Task Scheduler — minta izin IT, bukan mengakali.

---

## G. Ketahanan (opsional tapi disarankan)

| ID | Langkah | Hasil yang diharapkan | Lulus? |
|---|---|---|---|
| G1 | Restart server saat ada 5+ log `pending_sync` | Log tetap ada dan tetap `pending_sync` (tidak hilang) | [ ] |
| G2 | Simulasi listrik mati: `shutdown /s /t 0`, nyalakan kembali | Aplikasi hidup sendiri (F7), data utuh | [ ] |
| G3 | Jalankan `npm start` kedua saat server pertama hidup | Pesan `GAGAL: port 3000 sudah terpakai…`, keluar kode 1, server pertama tetap jalan | [ ] |
| G4 | Rotasi log (opsional): besarkan `logs\server.log` > 1 MB, restart lewat `start.bat` | Muncul `server.log.old`; log baru tetap ditulis | [ ] |
| G5 | **Latihan restore** (hanya data uji): matikan server → rename `data\lab.db` → `lab.db.lama` → copy backup terbaru jadi `data\lab.db` → hapus `lab.db-wal`/`lab.db-shm` → start | Data kembali sesuai isi backup; `checkup` integritas ok | [ ] |

---

## H. Go-live (menuju pemakaian nyata)

- [ ] **H1** Putuskan nasib data uji. Bila **hanya** berisi data uji: matikan server, hapus `data\lab.db`, `data\lab.db-wal`, `data\lab.db-shm` → start ulang (database baru), lalu import data asli.
- [ ] **H2** Set `.env` produksi: `LAB_NAME` benar, `MANUAL_INPUT=false` (scanner terpasang), `SYNC_ENABLED=false` sampai server pusat siap, `SYNC_INTERVAL_SECONDS=300`, `DEBOUNCE_SECONDS=10`.
- [ ] **H3** `npm run checkup` → tanpa ❌; task Windows **terdaftar**; backup terbaru valid.
- [ ] **H4** Isi *Lembar Hasil* di bawah dan simpan salinan checklist ini.
- [ ] **H5** Saat server pusat siap: isi `MONITOR_URL` + `MONITOR_TOKEN` asli, set `SYNC_ENABLED=true`, restart → pastikan `logs\sync.log` mencatat SUKSES dan `pending_sync` menyusut.

---

## Lampiran A — Perintah cepat

```bat
npm ci --omit=dev
npm run import -- <file.xlsx>
npm start
npm run checkup
npm run backup
npm run report
npm run mock
```

```powershell
Get-ScheduledTask -TaskName 'LabScanKTM-*' | Select-Object TaskName, State
explorer shell:startup
shutdown /r /t 0
```

## Lampiran B — Troubleshooting

| Gejala | Tindakan |
|---|---|
| `npm start` → `GAGAL: port ... terpakai` | Server lama masih hidup; tutup proses `node.exe` atau restart PC |
| Layar kiosk putih / tidak memuat | Pastikan server hidup (`/api/health`), buka `http://127.0.0.1:3000` |
| Scanner tidak terbaca | Cek kabel/mode HID; coba `MANUAL_INPUT=true` untuk memastikan aplikasi sehat |
| Echo karakter muncul padahal scanner | Deteksi burst meleset → set `MANUAL_INPUT=false` (override keras) |
| Tidak hidup setelah PC menyala | Cek urutan: auto-logon (F6) → task `LabScanKTM-Server` (F4) → shortcut (F5) |
| Sync tidak jalan | Mock hidup? `MONITOR_URL` & token benar? lihat `logs\sync.log` |
| Import 0 baris | Kolom wajib `nim` dan `nama`; sheet pertama yang dibaca |
| Ada tanda ❌ di checkup | Baca bagian yang ditandai; kirim output checkup saat minta bantuan |

## Lampiran C — Lembar hasil

| Field | Isi |
|---|---|
| Nama penguji | |
| Tanggal uji | |
| Nama PC / lokasi | |
| Windows | |
| Node / npm | |
| Browser | |
| Scanner (merek/tipe) | |
| Jumlah lulus / gagal | |
| Catatan penting | |

Tanda tangan: ____________________

> Checklist ini berlaku untuk semua PC yang memenuhi tabel kompatibilitas di bagian 0. Bila ada langkah yang tidak relevan (mis. tanpa scanner asli), tandai `[-]` dan tulis alasannya.
