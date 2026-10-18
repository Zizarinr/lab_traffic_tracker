# Design (UI dan perilaku)

## Prinsip visual
- Flat dan solid: **tanpa gradasi, shadow, blur, animasi dekoratif, atau border-radius besar**.
- Satu warna latar penuh per state, teks kontras tinggi.
- Landscape PC 1920x1080, teks sangat besar agar terbaca dari 1-2 meter.
- Font sistem (`Arial, sans-serif`), tanpa font eksternal. Semua aset lokal.
- Tidak ada tombol atau elemen interaktif. Kursor disembunyikan (`cursor: none`).

## Palet
| Fungsi | Latar | Teks |
|---|---|---|
| Standby | #FFFFFF | #000000 |
| Berhasil | #1B8A3A | #FFFFFF |
| Tidak terdaftar | #C62828 | #FFFFFF |
| Scan ganda (opsional singkat) | #F9A825 | #000000 |

## State layar
Satu halaman, satu state aktif, layar penuh.

**STANDBY**
```
+----------------------------------------------+
|  LAB KOMPUTER (nama dari LAB_NAME)           |
|                                              |
|        SILAKAN SCAN KTM ANDA                 |
|                                              |
|  Hari ini: 42 kunjungan            14:30     |
+----------------------------------------------+
```

**BERHASIL** (3 detik, lalu kembali ke standby)
```
+----------------------------------------------+
|  SELAMAT DATANG                              |
|  BUDI SANTOSO                                |
|  Kelas A  |  Semester 3                      |
|  NIM 442023xxxx                              |
+----------------------------------------------+
```

**TIDAK TERDAFTAR** (3 detik)
```
+----------------------------------------------+
|  NIM TIDAK TERDAFTAR                         |
|  Hubungi petugas lab                         |
+----------------------------------------------+
```

**SCAN GANDA**: NIM sama dalam 10 detik. Boleh tampilkan pesan singkat "Sudah tercatat" atau diam saja (tidak membuat log baru).

## Perilaku input scanner
- Satu `<input>` tersembunyi selalu fokus. Pada event `blur`, fokus dikembalikan.
- Kumpulkan karakter hingga `Enter`. Bersihkan spasi dan karakter non-digit/alfanumerik di awal-akhir.
- Karakter dari scanner datang sangat cepat. Jika Enter datang tanpa input, abaikan.
- Saat state sambutan sedang tampil dan scan baru masuk, state diganti langsung dengan scan terbaru dan timer 3 detik di-reset.
- Jika server tidak merespons, tampilkan state "SISTEM BERMASALAH, hubungi petugas" dan coba lagi otomatis tanpa memblokir.

## Jam dan counter
- Jam di pojok standby diperbarui tiap detik dari jam PC.
- Counter "kunjungan hari ini" diambil dari `GET /api/stats` setiap selesai scan dan tiap 60 detik.
