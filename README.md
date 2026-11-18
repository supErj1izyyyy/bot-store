# 🤖 WhatsApp Store Bot (Khusus 1 Grup)

Bot WhatsApp untuk toko aplikasi premium berbasis Node.js, Baileys, dan SQLite bawaan (tanpa perlu install database server tambahan).

---

## 🚀 Fitur Utama
1. **Khusus 1 Grup Saja (Lock Group):** Semua pesan pribadi (DM) dan pesan dari grup lain diabaikan secara total (*silent ignore*).
2. **Tanpa Prefix:** Pembeli cukup ketik nama aplikasi (contoh: `netflix`, `spotify`) untuk melihat harga dan detail.
3. **Katalog Personal & Realtime:** Perintah `list` menyapa pembeli secara dinamis (Selamat pagi/siang/sore/malam + mention nomor), menampilkan nama grup, hari & tanggal, lalu daftar produk ready.
4. **Welcome & Farewell Otomatis:** Menyapa member baru yang masuk grup dan memberi ucapan perpisahan saat ada yang keluar.
5. **CRUD Simpel:** Admin menggunakan `addlist`, `updatelist`, dan `deletelist`.
6. **Support Gambar:** Bisa upload gambar banner utama (`setbanner`) dan gambar spesifik per produk.
7. **Database SQLite Lokal:** Data tersimpan aman di `data/store.db`.

---

## ⚙️ Persiapan & Konfigurasi

Buka file [config.js](file:///c:/Users/abdia/OneDrive/Documents/Bot%20Store/config.js) lalu masukkan nomor WhatsApp kamu:
```javascript
module.exports = {
  // Masukkan nomor WhatsApp Owner (format internasional tanpa tanda +)
  ownerNumbers: [
    '628123456789'
  ],

  // Apakah Admin Grup WhatsApp diizinkan mengelola produk? (true / false)
  allowGroupAdmins: true,

  footerText: '\n\n━━━━━━━━━━━━━━━━━━━\n💬 Hubungi Admin untuk pemesanan.',

  // Jeda cooldown antar respon (dalam detik) agar aman dari ban WA (10 - 20 detik)
  cooldownSeconds: 15
};
```

---

## 📱 Cara Menjalankan Bot

### Opsi A: Scan QR Code di Terminal
```bash
npm start
```
Buka WhatsApp di HP > **Perangkat Tertaut** > Scan QR yang muncul di terminal.

### Opsi B: Login Menggunakan Kode Pairing (8 Digit)
Jika tidak mau scan QR (cocok jika terminal di VPS/server):
```bash
node index.js --pairing 628xxxxxxxx
```
*(Ganti `628xxxxxxxx` dengan nomor WhatsApp bot kamu)*.

---

## 🔒 Cara Mengunci Bot ke Grup Kamu
1. Masukkan bot ke grup toko kamu.
2. Di dalam grup tersebut, kirim:
   ```text
   setgrup
   ```
3. Bot akan mengunci grup tersebut. Mulai saat itu, bot hanya merespon di grup ini saja.
4. Jika ingin memindahkan grup di kemudian hari, kirim: `unsetgrup`.

---

## 📖 Panduan Perintah (Tanpa Prefix)

### 👥 Untuk Pembeli / Member:
| Ketik | Penjelasan |
|---|---|
| `list` / `katalog` / `menu` | Menampilkan daftar nama produk yang tersedia |
| `netflix` / `spotify` / dll | Menampilkan harga, detail paket, dan gambar produk tersebut |
| `help` / `bantuan` | Menampilkan petunjuk singkat cara cek list produk |

### 🛠️ Untuk Admin Toko:
| Perintah | Contoh | Penjelasan |
|---|---|---|
| `addlist nama \| detail` | `addlist Disney+ \| 25k 1 bln privat` | Menambah produk baru ke database |
| `updatelist nama \| detail` | `updatelist Netflix \| 30k 1 bln promo` | Mengedit/memperbarui harga atau deskripsi |
| `deletelist nama` | `deletelist Netflix` | Menghapus aplikasi dari database |
| `kick @member` | `kick @user` / reply pesan + ketik `kick` | Mengeluarkan member dari grup |
| `hapuspesan` | Reply pesan + ketik `hapuspesan` | Menghapus pesan orang lain untuk semua orang (Delete for Everyone) |
| `h <pesan>` / `hidetag` | `h restock netflix ya` | Tag semua member grup secara senyap (hidetag) |
| `status` / `ping` | `status` | Cek performa server Termux (Uptime, RAM, jam server) |
| `backup` | `backup` | Membuat & mengunduh file backup database toko langsung di chat WA |
| Kirim Foto + Caption `addlist` / `updatelist` | Foto + caption `addlist Canva \| 10k 1 thn` | Tambah/update produk sekaligus menyimpan foto produk |
| Kirim Foto + Caption `setbanner` | Foto banner toko + caption `setbanner` | Mengganti gambar brosur katalog (muncul saat `list`) |
| `setgrup` | `setgrup` | Mengunci bot ke grup saat ini |
| `unsetgrup` | `unsetgrup` | Melepas kunci grup |
