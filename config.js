// Konfigurasi Bot Store WhatsApp
module.exports = {
  // Masukkan nomor WhatsApp Owner/Admin (format internasional tanpa tanda +, contoh: '6281234567890')
  ownerNumbers: [
    '628123456789' // Ganti dengan nomor WhatsApp kamu
  ],

  // Apakah Admin Grup WhatsApp otomatis diizinkan mengelola produk? (true / false)
  allowGroupAdmins: true,

  // Pesan footer di bawah setiap detail produk
  footerText: '\n\n━━━━━━━━━━━━━━━━━━━\n💬 Hubungi Admin untuk pemesanan.',

  // Jeda cooldown antar perintah (dalam detik) agar aman dari deteksi spam WhatsApp (10 - 20 detik)
  cooldownSeconds: 15,

  // Jam tidur bot (Off otomatis jam 00:00 - 05:00 agar tidak terdeteksi bot aktif 24 jam oleh Meta)
  sleepHours: {
    enabled: true,
    startHour: 0, // 00:00 (12 malam)
    endHour: 5    // 05:00 (5 pagi)
  }
};
