# Requirements

> Bagian dari [Lab Scan KTM](../README.md).

## Konteks
- PC Windows di depan lab, layar landscape (target 1920x1080).
- Scanner barcode USB tipe keyboard-wedge (seperti di minimarket): mengetik NIM lalu menekan Enter.
- Data mahasiswa dari Excel dengan kolom: `nim`, `nama`, `semester`, `kelas`.
- Sistem monitoring lab ada di jaringan lokal via WiFi, diakses lewat API.

## Fungsional
- F1. Terima NIM dari scanner pada halaman kiosk tanpa perlu klik apa pun.
- F2. Cari NIM di data mahasiswa. Jika ada, tampilkan sambutan (nama, kelas, semester). Jika tidak, tampilkan pesan tidak terdaftar.
- F3. Simpan setiap scan (berhasil maupun tidak) sebagai log dengan waktu.
- F4. Abaikan scan NIM yang sama dalam jendela 10 detik (debounce).
- F5. Import data mahasiswa dari file Excel (.xlsx) ke database lokal, bisa diulang saat data berubah.
- F6. Kirim log yang belum terkirim ke API monitoring secara berkala (default 5 menit), dengan retry otomatis.
- F7. Tampilkan jumlah kunjungan hari ini di layar standby.

## Non-fungsional
- N1. Fungsi inti harus jalan 100% tanpa internet dan tanpa koneksi ke monitoring.
- N2. Tidak ada dependensi CDN/font/skrip eksternal di sisi frontend.
- N3. Data tidak boleh hilang saat PC restart atau listrik mati (SQLite mode WAL).
- N4. Respons scan sampai tampil di layar kurang dari 300 ms.
- N5. Aplikasi otomatis hidup saat Windows menyala.
- N6. Tampilkan data pribadi seperlunya (nama, kelas, semester). Token API tidak ditaruh di kode.

## Di luar cakupan (untuk sekarang)
- Pencatatan keluar/masuk (hanya masuk).
- Login admin dan dashboard laporan.
- Dukungan perangkat mobile/sentuh.
