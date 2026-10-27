# API

> Bagian dari [Lab Scan KTM](../README.md).

## A. Endpoint internal (browser kiosk -> server lokal)

### POST /api/scan
Request:
```json
{ "nim": "442023xxxx" }
```
Response 200:
```json
{ "status": "ok", "duplicate": false,
  "nama": "BUDI SANTOSO", "kelas": "A", "semester": 3,
  "scanned_at": "2026-10-18T14:30:12+07:00" }
```
```json
{ "status": "not_found", "duplicate": false, "nim": "999999" }
```
Jika NIM sama dalam `DEBOUNCE_SECONDS`: `duplicate: true`, tidak ada log baru.
Validasi: `nim` wajib, string, panjang wajar (mis. 3-32), selain itu 400.

### GET /api/stats
```json
{ "today": 42, "pending_sync": 5 }
```
`today` dihitung berdasarkan tanggal lokal (+07:00), hanya `status = ok`.

### GET /api/health
`{ "ok": true }` untuk pengecekan hidup.

(Impor Excel dilakukan lewat CLI `scripts/import-excel.js`, bukan endpoint, agar tidak ada permukaan serangan yang tidak perlu.)

## B. Kontrak ke sistem monitoring (Fase 2)

Konfirmasi detail aslinya ke pengelola sistem monitoring. Berikut format default yang diusulkan.

Request:
```
POST {MONITOR_URL}
Content-Type: application/json
Authorization: Bearer {MONITOR_TOKEN}
```
```json
{
  "lab": "LAB-1",
  "sent_at": "2026-10-18T14:35:00+07:00",
  "records": [
    { "id": "b1f6...-uuid", "nim": "442023xxxx", "nama": "BUDI SANTOSO",
      "kelas": "A", "semester": 3,
      "scanned_at": "2026-10-18T14:30:12+07:00", "status": "ok" }
  ]
}
```
Respons sukses: HTTP 2xx. Disarankan monitoring membalas `{ "accepted": [ids...] }`. Jika ada, hanya id tersebut yang ditandai `synced=1`; jika tidak ada, seluruh batch dianggap diterima saat 2xx.

## Aturan sinkronisasi (WiFi tidak stabil)
- Interval `SYNC_INTERVAL_SECONDS` (300 detik). Ambil maks `SYNC_BATCH_SIZE` (100) log `synced=0`, urut `scanned_at`.
- Timeout request `SYNC_TIMEOUT_SECONDS` (10 detik).
- Jika gagal (timeout/jaringan/5xx): jangan ubah data, retry dengan backoff (30s, 60s, 120s, ... maks interval normal). Setelah berhasil, kembali ke interval normal.
- Jika 4xx (mis. 401/403/400): catat error jelas di log, jangan retry agresif (kemungkinan token atau format salah).
- Jika masih ada sisa log setelah satu batch sukses, langsung kirim batch berikutnya.
- Pengiriman bersifat *at-least-once*. Monitoring harus dedup berdasarkan `id`.
- Sinkronisasi tidak boleh memblokir atau memperlambat proses scan.
- Catat status sinkronisasi terakhir (waktu, sukses/gagal, jumlah) di log file.
