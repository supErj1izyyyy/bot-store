const db = require('./db');

const initialData = [
  {
    name: 'Netflix',
    details: 'Netflix Premium Privat\n• 1 Profil Privat (Pin Sendiri)\n• Kualitas Ultra HD 4K\n• Harga: Rp 35.000 / 1 Bulan\n• Garansi Full 30 Hari'
  },
  {
    name: 'Spotify',
    details: 'Spotify Premium Individual\n• Akun Baru atau Perpanjang\n• Bebas Iklan & Download Offline\n• Harga: Rp 15.000 / 1 Bulan\n• Garansi Full'
  },
  {
    name: 'Canva',
    details: 'Canva Pro Member\n• Invite Team (Email Sendiri)\n• Akses Semua Template & Elemen Premium\n• Harga: Rp 10.000 / 1 Tahun'
  }
];

const existing = db.getAllProducts();
if (existing.length === 0) {
  for (const item of initialData) {
    db.upsertProduct(item.name, item.details);
  }
  console.log('✅ Berhasil memasukkan data sampel produk (Netflix, Spotify, Canva)!');
} else {
  console.log(`ℹ️ Database sudah memiliki ${existing.length} produk.`);
}
