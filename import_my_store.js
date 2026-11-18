const fs = require('fs');
const path = require('path');
const db = require('./db');

async function importMyStore() {
  const backupFile = path.join(__dirname, 'backup_nerestore_1_2026-11-18_055532.json');
  if (!fs.existsSync(backupFile)) {
    console.error('File backup tidak ditemukan!');
    return;
  }

  const raw = fs.readFileSync(backupFile, 'utf8');
  const backup = JSON.parse(raw);

  const targetGroupId = '120363306493113758@g.us';
  const storeItems = backup.lists[targetGroupId];

  if (!storeItems) {
    console.error('Data grup ' + targetGroupId + ' tidak ditemukan di backup!');
    return;
  }

  console.log(`Ditemukan ${Object.keys(storeItems).length} produk untuk grup toko kamu.`);

  // 1. Simpan salinan bersih JSON khusus toko kamu
  const cleanJsonPath = path.join(__dirname, 'data', 'produk_toko_saya.json');
  fs.writeFileSync(cleanJsonPath, JSON.stringify(storeItems, null, 2), 'utf8');
  console.log('✅ File JSON bersih khusus toko kamu disimpan di: data/produk_toko_saya.json');

  // 2. Download gambar QRIS (pay/payment) jika ada
  const mediaDir = path.join(__dirname, 'media');
  if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

  let qrisLocalPath = null;
  const qrisUrl = storeItems.payment?.imageUrl || storeItems.pay?.imageUrl;
  if (qrisUrl) {
    try {
      console.log('Mengunduh gambar QRIS pembayaran...');
      const res = await fetch(qrisUrl);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        qrisLocalPath = path.join(mediaDir, 'qris.jpg');
        fs.writeFileSync(qrisLocalPath, buffer);
        console.log('✅ Gambar QRIS berhasil disimpan di: media/qris.jpg');
      }
    } catch (err) {
      console.error('Gagal download QRIS:', err.message);
    }
  }

  // 3. Masukkan semua produk ke database SQLite
  let importedCount = 0;
  for (const [key, item] of Object.entries(storeItems)) {
    const productName = key.trim();
    const productDetails = (item.text || '').trim();
    const imagePath = (productName === 'pay' || productName === 'payment') && qrisLocalPath ? qrisLocalPath : null;

    db.upsertProduct(productName, productDetails, imagePath);
    importedCount++;
  }

  console.log(`\n🎉 SUKSES! ${importedCount} produk toko berhasil diimport ke SQLite.`);
}

importMyStore().catch(console.error);
