const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const path = require('node:path');
const fs = require('node:fs');

const db = require('./db');
const config = require('./config');

// Ensure directories exist
const sessionDir = path.join(__dirname, 'session');
const mediaDir = path.join(__dirname, 'media');
const backupsDir = path.join(__dirname, 'backups');
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

// Check CLI arguments for pairing code option: node index.js --pairing 628123456789
const isPairing = process.argv.includes('--pairing');
const pairingNumber = isPairing ? process.argv[process.argv.indexOf('--pairing') + 1] : null;

// Helpers: Time greeting & date formatting (Indonesian)
function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 11) return 'Selamat pagi';
  if (hour >= 11 && hour < 15) return 'Selamat siang';
  if (hour >= 15 && hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function getFormattedDate() {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const now = new Date();
  const dayName = days[now.getDay()];
  const date = now.getDate();
  const monthName = months[now.getMonth()];
  const year = now.getFullYear();
  return `${dayName}, ${date} ${monthName} ${year}`;
}

// Helper: Format uptime menjadi teks mudah dibaca (hari, jam, menit, detik)
function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d} hari`);
  if (h > 0) parts.push(`${h} jam`);
  if (m > 0) parts.push(`${m} menit`);
  parts.push(`${s} detik`);
  return parts.join(' ');
}

// Helper: Membuat backup database harian (file JSON dan file .db)
function createDatabaseBackup() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  const allProducts = db.getAllProducts();
  const backupData = {
    backupDate: now.toISOString(),
    backupDateWIB: `${getFormattedDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`,
    totalProducts: allProducts.length,
    targetGroupId: db.getSetting('target_group_id'),
    products: allProducts
  };

  const jsonFileName = `backup_${dateStr}.json`;
  const jsonPath = path.join(backupsDir, jsonFileName);
  fs.writeFileSync(jsonPath, JSON.stringify(backupData, null, 2), 'utf8');

  // Salin file .db SQLite sebagai cadangan tambahan
  const dbSource = path.join(__dirname, 'data', 'store.db');
  const dbFileName = `store_${dateStr}.db`;
  const dbDest = path.join(backupsDir, dbFileName);
  if (fs.existsSync(dbSource)) {
    fs.copyFileSync(dbSource, dbDest);
  }

  // Hapus backup lama jika lebih dari 14 hari agar memori HP tidak penuh
  try {
    const files = fs.readdirSync(backupsDir);
    const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
    for (const f of files) {
      const full = path.join(backupsDir, f);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < fourteenDaysAgo) {
        fs.unlinkSync(full);
      }
    }
  } catch (e) {}

  return { jsonPath, dbDest, jsonFileName, total: allProducts.length };
}

// Helper: Cek apakah saat ini masuk jam tidur bot (00:00 - 05:00)
function isSleepTime() {
  if (!config.sleepHours?.enabled) return false;
  const currentHour = new Date().getHours();
  const { startHour, endHour } = config.sleepHours;
  if (startHour <= endHour) {
    return currentHour >= startHour && currentHour < endHour;
  } else {
    return currentHour >= startHour || currentHour < endHour;
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  
  let version = [2, 3000, 1017531287];
  try {
    const latest = await fetchLatestBaileysVersion();
    version = latest.version;
    console.log(`[BOT] Memulai bot dengan Baileys v${version.join('.')}`);
  } catch (err) {
    console.log(`[BOT] Menggunakan versi Baileys lokal: v${version.join('.')}`);
  }

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    browser: Browsers.windows('Desktop'),
    syncFullHistory: false
  });

  // Pairing code flow
  if (isPairing && !sock.authState.creds.registered) {
    if (!pairingNumber) {
      console.error('[ERROR] Masukkan nomor WhatsApp untuk pairing code! Contoh: node index.js --pairing 628123456789');
      process.exit(1);
    }
    setTimeout(async () => {
      try {
        const cleanNumber = pairingNumber.replace(/[^0-9]/g, '');
        const code = await sock.requestPairingCode(cleanNumber);
        console.log(`\n=========================================`);
        console.log(`🔑 KODE PAIRING WHATSAPP:  ${code}`);
        console.log(`Buka WA di HP > Perangkat Tertaut > Tautkan dengan nomor telepon`);
        console.log(`=========================================\n`);
      } catch (err) {
        console.error('[ERROR] Gagal meminta kode pairing:', err);
      }
    }, 3000);
  }

  // Handle credentials update
  sock.ev.on('creds.update', saveCreds);

  // Handle connection updates
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !isPairing) {
      console.log('\n[BOT] Silakan scan QR code berikut melalui WhatsApp di HP:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`[BOT] Koneksi terputus (status: ${statusCode}). Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        startBot();
      } else {
        console.log('[BOT] Sesi telah logout. Silakan hapus folder session/ dan scan ulang.');
      }
    } else if (connection === 'open') {
      console.log('[BOT] ✅ Terhubung sukses ke WhatsApp!');
      const targetGroup = db.getSetting('target_group_id');
      if (targetGroup) {
        console.log(`[BOT] 🔒 Bot aktif dan terkunci ke grup: ${targetGroup}`);
      } else {
        console.log('[BOT] ⚠️ Belum ada grup yang dikunci. Ketik "setgrup" di grup toko untuk mengunci.');
      }

      // Backup otomatis saat bot terhubung
      try {
        const { jsonFileName, total } = createDatabaseBackup();
        console.log(`[BACKUP] Backup database siap: ${jsonFileName} (${total} produk)`);
      } catch (err) {
        console.error('[BACKUP] Gagal membuat backup saat startup:', err);
      }
    }
  });

  // Backup otomatis berkala setiap 6 jam
  setInterval(() => {
    try {
      const { jsonFileName, total } = createDatabaseBackup();
      console.log(`[BACKUP] Cek backup otomatis: ${jsonFileName} (${total} produk)`);
    } catch (e) {}
  }, 6 * 60 * 60 * 1000);

  // Handle welcome & farewell messages
  sock.ev.on('group-participants.update', async (update) => {
    const { id, participants, action } = update;
    const targetGroup = db.getSetting('target_group_id');
    if (!targetGroup || id !== targetGroup) return;

    // Saat jam tidur (00:00 - 05:00), jangan kirim welcome/farewell agar akun terlihat offline
    if (isSleepTime()) return;

    try {
      const groupMeta = await sock.groupMetadata(id);
      const groupName = groupMeta.subject || 'Grup Toko';

      for (const participant of participants) {
        const jid = typeof participant === 'string' ? participant : (participant?.id || '');
        if (!jid) continue;
        const cleanNumber = jid.split('@')[0].split(':')[0];

        if (action === 'add') {
          const welcomeText = `👋 Halo @${cleanNumber}, selamat datang di *${groupName}*!\n\n💡 Ketik *list* untuk melihat daftar produk yang tersedia.`;
          await sendSafeReply(id, {
            text: welcomeText,
            mentions: [jid]
          });
        } else if (action === 'remove') {
          const farewellText = `👋 Selamat tinggal @${cleanNumber}, terima kasih sudah pernah bergabung di *${groupName}*!`;
          await sendSafeReply(id, {
            text: farewellText,
            mentions: [jid]
          });
        }
      }
    } catch (err) {
      console.error('[ERROR] Gagal memproses welcome/farewell:', err);
    }
  });

  // Helper: check if sender is admin or owner
  async function isAuthorized(remoteJid, senderNumber, participantList = null) {
    const cleanSender = senderNumber.replace(/[^0-9]/g, '');
    
    // Check config owner numbers
    const isOwner = config.ownerNumbers.some((num) => num.replace(/[^0-9]/g, '') === cleanSender);
    if (isOwner) return true;

    // Check if sender is admin in current group
    if (config.allowGroupAdmins && remoteJid.endsWith('@g.us')) {
      try {
        let participants = participantList;
        if (!participants) {
          const groupMeta = await sock.groupMetadata(remoteJid);
          participants = groupMeta.participants;
        }
        const senderObj = participants.find((p) => {
          const pJid = typeof p === 'string' ? p : (p?.id || '');
          return pJid.split('@')[0].split(':')[0] === cleanSender;
        });
        if (senderObj && (senderObj.admin === 'admin' || senderObj.admin === 'superadmin')) {
          return true;
        }
      } catch (e) {
        // Fallback silently
      }
    }
    return false;
  }

  // Helper: check if bot is admin in current group
  async function isBotAdmin(remoteJid) {
    if (!remoteJid.endsWith('@g.us')) return false;
    try {
      const groupMeta = await sock.groupMetadata(remoteJid);
      const botNumber = (sock.user?.id || '').split('@')[0].split(':')[0];
      const botObj = groupMeta.participants.find((p) => {
        const pJid = typeof p === 'string' ? p : (p?.id || '');
        return pJid.split('@')[0].split(':')[0] === botNumber;
      });
      return botObj && (botObj.admin === 'admin' || botObj.admin === 'superadmin');
    } catch (e) {
      return false;
    }
  }

  // Anti-spam & Cooldown tracker (10 - 20 detik)
  const userCooldowns = new Map();

  function checkCooldown(sender, isAdmin = false) {
    if (isAdmin) return true; // Admin bebas cooldown untuk kelola toko

    const now = Date.now();
    const cooldownMs = (config.cooldownSeconds || 15) * 1000;
    const lastTime = userCooldowns.get(sender);

    if (lastTime && (now - lastTime < cooldownMs)) {
      const remaining = Math.ceil((cooldownMs - (now - lastTime)) / 1000);
      console.log(`[ANTI-SPAM] Request dari ${sender.split('@')[0]} diabaikan (cooldown sisa ${remaining} detik)`);
      return false;
    }

    userCooldowns.set(sender, now);
    return true;
  }

  // Helper mengirim pesan dengan jeda natural & simulasi mengetik (human typing presence)
  async function sendSafeReply(remoteJid, content, options = {}) {
    try {
      await sock.sendPresenceUpdate('composing', remoteJid);
      // Jeda natural acak 1.2 - 2.0 detik agar tidak terdeteksi bot otomatis
      const delay = Math.floor(Math.random() * 800) + 1200;
      await new Promise((r) => setTimeout(r, delay));
      return await sock.sendMessage(remoteJid, content, options);
    } catch (err) {
      console.error('[ERROR] Gagal mengirim pesan:', err);
    }
  }

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Ignore broadcast or system status
      if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

      const remoteJid = msg.key.remoteJid;
      const isGroup = remoteJid.endsWith('@g.us');
      const sender = msg.key.participant || msg.key.remoteJid;
      const senderNumber = sender.split('@')[0].split(':')[0];

      // Extract message text
      const messageContent = msg.message;
      let body = '';
      let isImage = false;

      if (messageContent.conversation) {
        body = messageContent.conversation;
      } else if (messageContent.extendedTextMessage?.text) {
        body = messageContent.extendedTextMessage.text;
      } else if (messageContent.imageMessage) {
        isImage = true;
        body = messageContent.imageMessage.caption || '';
      }

      const trimmedText = body.trim();
      const lowerText = trimmedText.toLowerCase();

      // Check current locked target group
      const targetGroup = db.getSetting('target_group_id');

      // Jam tidur bot (00:00 - 05:00): Abaikan pesan dari member agar terhindar dari deteksi bot 24 jam oleh Meta
      if (isSleepTime()) {
        const adminAllowed = await isAuthorized(remoteJid, senderNumber);
        if (!adminAllowed) {
          return; // Silent ignore untuk member
        }
      }

      // 1. Initial lock command: "setgrup"
      if (lowerText === 'setgrup' || lowerText === 'setgroup') {
        if (!isGroup) {
          // If DM, do not allow locking
          return;
        }
        const adminAllowed = await isAuthorized(remoteJid, senderNumber);
        if (!adminAllowed) {
          await sock.sendMessage(remoteJid, { text: '❌ Perintah ini hanya dapat dijalankan oleh Admin toko.' }, { quoted: msg });
          return;
        }

        db.setSetting('target_group_id', remoteJid);
        await sock.sendMessage(remoteJid, {
          text: '✅ *Grup ini berhasil dikunci!*\nBot sekarang hanya merespon pesan di grup ini. Pesan pribadi (DM) dan grup lain akan diabaikan.'
        }, { quoted: msg });
        console.log(`[BOT] Target group diset ke: ${remoteJid}`);
        return;
      }

      // If target group is not set yet, or message is NOT from target group, SILENTLY IGNORE
      if (!targetGroup || remoteJid !== targetGroup) {
        return;
      }

      // 2. Command "unsetgrup" (to release lock)
      if (lowerText === 'unsetgrup' || lowerText === 'unsetgroup') {
        const adminAllowed = await isAuthorized(remoteJid, senderNumber);
        if (!adminAllowed) return;

        db.setSetting('target_group_id', '');
        await sock.sendMessage(remoteJid, {
          text: '🔓 *Kunci grup dilepas.* Silakan ketik "setgrup" di grup baru untuk mengunci kembali.'
        }, { quoted: msg });
        return;
      }

      // 3. Command "setbanner" (Upload/update main banner image)
      if (lowerText === 'setbanner') {
        const adminAllowed = await isAuthorized(remoteJid, senderNumber);
        if (!adminAllowed) {
          await sock.sendMessage(remoteJid, { text: '❌ Khusus Admin toko.' }, { quoted: msg });
          return;
        }

        if (!isImage) {
          await sock.sendMessage(remoteJid, { text: '⚠️ Kirim foto dengan caption *setbanner* untuk mengganti banner toko.' }, { quoted: msg });
          return;
        }

        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
          const bannerPath = path.join(mediaDir, 'banner.jpg');
          fs.writeFileSync(bannerPath, buffer);
          await sock.sendMessage(remoteJid, { text: '✅ *Banner katalog berhasil diperbarui!*' }, { quoted: msg });
        } catch (err) {
          console.error('[ERROR] Gagal download banner:', err);
          await sock.sendMessage(remoteJid, { text: '❌ Gagal menyimpan gambar banner.' }, { quoted: msg });
        }
        return;
      }

      // 4. Command "kick" (@mention / reply / nomor)
      if (/^kick(\s+.*)?$/i.test(trimmedText)) {
        const adminAllowed = await isAuthorized(remoteJid, senderNumber);
        if (!adminAllowed) {
          await sock.sendMessage(remoteJid, { text: '❌ Khusus Admin toko.' }, { quoted: msg });
          return;
        }

        const botAdmin = await isBotAdmin(remoteJid);
        if (!botAdmin) {
          await sock.sendMessage(remoteJid, { text: '⚠️ Jadikan bot sebagai Admin grup terlebih dahulu untuk menggunakan fitur kick.' }, { quoted: msg });
          return;
        }

        const contextInfo = messageContent.extendedTextMessage?.contextInfo;
        let targetJid = null;

        if (contextInfo?.participant) {
          targetJid = contextInfo.participant;
        } else if (contextInfo?.mentionedJid?.length > 0) {
          targetJid = contextInfo.mentionedJid[0];
        } else {
          const rawNum = trimmedText.replace(/^kick\s*/i, '').replace(/[^0-9]/g, '');
          if (rawNum) {
            targetJid = rawNum + '@s.whatsapp.net';
          }
        }

        if (!targetJid) {
          await sock.sendMessage(remoteJid, { text: '⚠️ Reply pesan member yang ingin di-kick atau ketik: *kick @member*' }, { quoted: msg });
          return;
        }

        const botNumber = (sock.user?.id || '').split('@')[0].split(':')[0];
        const targetNumber = targetJid.split('@')[0].split(':')[0];

        if (targetNumber === botNumber) {
          await sock.sendMessage(remoteJid, { text: '❌ Bot tidak bisa meng-kick dirinya sendiri.' }, { quoted: msg });
          return;
        }

        if (config.ownerNumbers.some((num) => num.replace(/[^0-9]/g, '') === targetNumber)) {
          await sock.sendMessage(remoteJid, { text: '❌ Tidak dapat meng-kick Owner bot.' }, { quoted: msg });
          return;
        }

        try {
          await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'remove');
          await sock.sendMessage(remoteJid, { text: `✅ Berhasil mengeluarkan @${targetNumber} dari grup.`, mentions: [targetJid] });
        } catch (err) {
          console.error('[ERROR] Gagal kick member:', err);
          await sock.sendMessage(remoteJid, { text: '❌ Gagal mengeluarkan member. Pastikan bot adalah Admin grup.' }, { quoted: msg });
        }
        return;
      }

      // 5. Command "hapuspesan" / "delpesan" (Reply pesan member lalu ketik hapuspesan)
      if (['hapuspesan', 'delpesan', 'delete', 'delforall'].includes(lowerText)) {
        const adminAllowed = await isAuthorized(remoteJid, senderNumber);
        if (!adminAllowed) {
          await sock.sendMessage(remoteJid, { text: '❌ Khusus Admin toko.' }, { quoted: msg });
          return;
        }

        const contextInfo = messageContent.extendedTextMessage?.contextInfo;
        if (!contextInfo?.stanzaId) {
          await sock.sendMessage(remoteJid, { text: '⚠️ Balas (reply) pesan yang ingin dihapus lalu ketik *hapuspesan*.' }, { quoted: msg });
          return;
        }

        const botAdmin = await isBotAdmin(remoteJid);
        if (!botAdmin) {
          await sock.sendMessage(remoteJid, { text: '⚠️ Jadikan bot sebagai Admin grup terlebih dahulu untuk menghapus pesan member lain.' }, { quoted: msg });
          return;
        }

        try {
          // Delete target message for everyone
          await sock.sendMessage(remoteJid, {
            delete: {
              remoteJid,
              fromMe: false,
              id: contextInfo.stanzaId,
              participant: contextInfo.participant
            }
          });

          // Delete admin command message too so chat stays clean
          if (msg.key?.id) {
            await sock.sendMessage(remoteJid, {
              delete: msg.key
            });
          }
        } catch (err) {
          console.error('[ERROR] Gagal hapus pesan:', err);
        }
        return;
      }

      // 6. Command "h" / "hidetag" (Tag all group members)
      if (lowerText === 'h' || lowerText === 'hidetag' || /^(h|hidetag)\s+/i.test(trimmedText)) {
        const adminAllowed = await isAuthorized(remoteJid, senderNumber);
        if (!adminAllowed) {
          await sock.sendMessage(remoteJid, { text: '❌ Khusus Admin toko.' }, { quoted: msg });
          return;
        }

        try {
          const groupMeta = await sock.groupMetadata(remoteJid);
          const allParticipants = groupMeta.participants.map((p) => (typeof p === 'string' ? p : p.id));

          let tagText = trimmedText.replace(/^(h|hidetag)\s*/i, '').trim();

          // Jika me-reply pesan lain dan tidak ada teks tambahan
          const contextInfo = messageContent.extendedTextMessage?.contextInfo;
          if (!tagText && contextInfo?.quotedMessage) {
            const qMsg = contextInfo.quotedMessage;
            tagText = qMsg.conversation || qMsg.extendedTextMessage?.text || qMsg.imageMessage?.caption || '';
          }

          if (!tagText && !isImage) {
            tagText = '📢 *PENGUMUMAN UNTUK SEMUA MEMBER*';
          }

          if (isImage) {
            try {
              const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
              await sock.sendMessage(remoteJid, {
                image: buffer,
                caption: tagText || '',
                mentions: allParticipants
              });
              return;
            } catch (err) {
              console.error('[ERROR] Gagal kirim gambar hidetag:', err);
            }
          }

          await sock.sendMessage(remoteJid, {
            text: tagText,
            mentions: allParticipants
          });
        } catch (err) {
          console.error('[ERROR] Gagal menjalankan hidetag:', err);
        }
        return;
      }

      // 7. Command "ping" / "status" / "server" (Pantau performa server dari jauh)
      if (['ping', 'status', 'server'].includes(lowerText)) {
        const adminAllowed = await isAuthorized(remoteJid, senderNumber);
        if (!adminAllowed) return;

        const uptimeStr = formatUptime(process.uptime());
        const mem = process.memoryUsage();
        const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
        const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
        const totalProd = db.getAllProducts().length;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const sleeping = isSleepTime() ? '🌙 Jam Tidur (Off)' : '🟢 Aktif Melayani';

        const statusText = `🖥️ *STATUS SERVER BOT STORE*\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `🟢 *Status:* Online (Termux)\n` +
          `⏱️ *Uptime:* ${uptimeStr}\n` +
          `💾 *RAM Usage:* ${rssMb} MB (Heap: ${heapMb} MB)\n` +
          `📦 *Total Produk:* ${totalProd} item\n` +
          `🕒 *Jam Server:* ${timeStr} WIB\n` +
          `🔋 *Mode:* ${sleeping}\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `💡 Ketik *backup* untuk unduh file backup database.`;

        await sock.sendMessage(remoteJid, { text: statusText }, { quoted: msg });
        return;
      }

      // 8. Command "backup" (Unduh file backup database langsung lewat WhatsApp)
      if (lowerText === 'backup') {
        const adminAllowed = await isAuthorized(remoteJid, senderNumber);
        if (!adminAllowed) return;

        await sock.sendMessage(remoteJid, { text: '⏳ Sedang menyiapkan file backup database...' }, { quoted: msg });
        try {
          const { jsonPath, total, jsonFileName } = createDatabaseBackup();
          await sock.sendMessage(remoteJid, {
            document: fs.readFileSync(jsonPath),
            mimetype: 'application/json',
            fileName: jsonFileName,
            caption: `📦 *BACKUP DATABASE BOT STORE*\n` +
              `🗓️ Tanggal: ${getFormattedDate()}\n` +
              `📦 Total: ${total} produk\n\n` +
              `_File ini tersimpan di folder backups/ dan bisa kamu simpan sebagai cadangan data toko kamu._`
          }, { quoted: msg });
        } catch (err) {
          console.error('[BACKUP] Gagal mengirim file backup:', err);
          await sock.sendMessage(remoteJid, { text: '❌ Gagal membuat file backup.' }, { quoted: msg });
        }
        return;
      }

      // 9. Command "deletelist <nama>" (alias: hapus / del)
      if (/^(deletelist|hapus|del)\s+/i.test(trimmedText)) {
        const adminAllowed = await isAuthorized(remoteJid, senderNumber);
        if (!adminAllowed) {
          await sock.sendMessage(remoteJid, { text: '❌ Khusus Admin toko.' }, { quoted: msg });
          return;
        }

        const targetName = trimmedText.replace(/^(deletelist|hapus|del)\s+/i, '').trim();
        const deleted = db.deleteProduct(targetName);
        if (deleted) {
          if (deleted.image_path && fs.existsSync(deleted.image_path)) {
            try { fs.unlinkSync(deleted.image_path); } catch (e) {}
          }
          await sock.sendMessage(remoteJid, { text: `✅ *${deleted.name}* berhasil dihapus dari list.` }, { quoted: msg });
        } else {
          await sock.sendMessage(remoteJid, { text: `⚠️ Produk *${targetName}* tidak ditemukan di database.` }, { quoted: msg });
        }
        return;
      }

      // 5. Command "addlist <nama> | <detail>"
      if (/^addlist\s+/i.test(trimmedText)) {
        const adminAllowed = await isAuthorized(remoteJid, senderNumber);
        if (!adminAllowed) {
          await sock.sendMessage(remoteJid, { text: '❌ Khusus Admin toko.' }, { quoted: msg });
          return;
        }

        const raw = trimmedText.replace(/^addlist\s+/i, '').trim();
        if (!raw.includes('|')) {
          await sock.sendMessage(remoteJid, {
            text: '⚠️ Format salah. Gunakan:\n*addlist nama | detail/harga*\nContoh: `addlist Disney+ | 25k 1 bulan privat`'
          }, { quoted: msg });
          return;
        }

        const parts = raw.split('|');
        const prodName = parts[0].trim();
        const prodDetails = parts.slice(1).join('|').trim();

        if (!prodName || !prodDetails) {
          await sock.sendMessage(remoteJid, { text: '⚠️ Nama dan detail produk tidak boleh kosong.' }, { quoted: msg });
          return;
        }

        const existing = db.getProductByName(prodName);
        if (existing) {
          await sock.sendMessage(remoteJid, {
            text: `⚠️ Produk *${existing.name}* sudah ada di list.\nGunakan *updatelist* jika ingin mengubah detailnya.`
          }, { quoted: msg });
          return;
        }

        let savedImagePath = null;
        if (isImage) {
          try {
            const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
            const safeFileName = prodName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '.jpg';
            savedImagePath = path.join(mediaDir, safeFileName);
            fs.writeFileSync(savedImagePath, buffer);
          } catch (err) {
            console.error('[ERROR] Gagal download gambar produk:', err);
          }
        }

        db.upsertProduct(prodName, prodDetails, savedImagePath);
        await sock.sendMessage(remoteJid, {
          text: `✅ Produk *${prodName}* berhasil ditambahkan!\n\nKetik *${prodName.toLowerCase()}* untuk melihat hasilnya.`
        }, { quoted: msg });
        return;
      }

      // 6. Command "updatelist <nama> | <detail>"
      if (/^updatelist\s+/i.test(trimmedText)) {
        const adminAllowed = await isAuthorized(remoteJid, senderNumber);
        if (!adminAllowed) {
          await sock.sendMessage(remoteJid, { text: '❌ Khusus Admin toko.' }, { quoted: msg });
          return;
        }

        const raw = trimmedText.replace(/^updatelist\s+/i, '').trim();
        if (!raw.includes('|')) {
          await sock.sendMessage(remoteJid, {
            text: '⚠️ Format salah. Gunakan:\n*updatelist nama | detail/harga baru*\nContoh: `updatelist Disney+ | 20k 1 bulan promo`'
          }, { quoted: msg });
          return;
        }

        const parts = raw.split('|');
        const prodName = parts[0].trim();
        const prodDetails = parts.slice(1).join('|').trim();

        if (!prodName || !prodDetails) {
          await sock.sendMessage(remoteJid, { text: '⚠️ Nama dan detail produk tidak boleh kosong.' }, { quoted: msg });
          return;
        }

        const existing = db.getProductByName(prodName);
        if (!existing) {
          await sock.sendMessage(remoteJid, {
            text: `⚠️ Produk *${prodName}* belum terdaftar.\nGunakan *addlist* untuk menambahkannya ke list.`
          }, { quoted: msg });
          return;
        }

        let savedImagePath = existing.image_path;
        if (isImage) {
          try {
            const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
            const safeFileName = prodName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '.jpg';
            savedImagePath = path.join(mediaDir, safeFileName);
            fs.writeFileSync(savedImagePath, buffer);
          } catch (err) {
            console.error('[ERROR] Gagal download gambar produk:', err);
          }
        }

        db.upsertProduct(existing.name, prodDetails, savedImagePath);
        await sock.sendMessage(remoteJid, {
          text: `✅ Detail produk *${existing.name}* berhasil diperbarui!\n\nKetik *${existing.name.toLowerCase()}* untuk melihat hasilnya.`
        }, { quoted: msg });
        return;
      }

      // 6. Command "list" / "katalog" / "ready" / "menu"
      if (['list', 'katalog', 'ready', 'menu'].includes(lowerText)) {
        const adminAllowed = await isAuthorized(remoteJid, senderNumber);
        if (!checkCooldown(sender, adminAllowed)) {
          return; // Abaikan jika masih dalam jeda cooldown anti-spam
        }

        const products = db.getAllProducts();

        let groupName = 'Grup Toko';
        try {
          const groupMeta = await sock.groupMetadata(remoteJid);
          if (groupMeta.subject) groupName = groupMeta.subject;
        } catch (e) {}

        const greeting = getGreeting();
        const dateStr = getFormattedDate();

        if (products.length === 0) {
          const emptyText = `Halo ${greeting} @${senderNumber}\n` +
            `👥 *${groupName}*\n` +
            `🗓️ ${dateStr}\n\n` +
            `📦 *Belum ada list produk tersedia.*\nAdmin bisa menambahkan dengan format: *addlist nama | detail*`;
          await sendSafeReply(remoteJid, {
            text: emptyText,
            mentions: [sender]
          }, { quoted: msg });
          return;
        }

        let replyText = `Halo ${greeting} @${senderNumber}\n`;
        replyText += `👥 *${groupName}*\n`;
        replyText += `🗓️ ${dateStr}\n\n`;
        replyText += `📱 *LIST PRODUK TERSEDIA:*\n`;
        replyText += `━━━━━━━━━━━━━━━━━━━\n`;
        products.forEach((p, idx) => {
          replyText += `${idx + 1}. *${p.name}*\n`;
        });
        replyText += `━━━━━━━━━━━━━━━━━━━\n`;
        replyText += `💡 _Ketik nama produk di atas untuk cek harga & detail lengkap._`;

        const bannerPath = path.join(mediaDir, 'banner.jpg');
        if (fs.existsSync(bannerPath)) {
          await sendSafeReply(remoteJid, {
            image: fs.readFileSync(bannerPath),
            caption: replyText,
            mentions: [sender]
          }, { quoted: msg });
        } else {
          await sendSafeReply(remoteJid, {
            text: replyText,
            mentions: [sender]
          }, { quoted: msg });
        }
        return;
      }

      // 7. Check specific product by name (Buyer typing app name)
      const matchedProduct = db.getProductByName(lowerText);
      if (matchedProduct) {
        const adminAllowed = await isAuthorized(remoteJid, senderNumber);
        if (!checkCooldown(sender, adminAllowed)) {
          return; // Abaikan jika masih dalam jeda cooldown anti-spam
        }

        let replyText = `✨ *${matchedProduct.name.toUpperCase()}*\n`;
        replyText += `━━━━━━━━━━━━━━━━━━━\n`;
        replyText += `${matchedProduct.details}`;
        replyText += config.footerText;

        if (matchedProduct.image_path && fs.existsSync(matchedProduct.image_path)) {
          await sendSafeReply(remoteJid, {
            image: fs.readFileSync(matchedProduct.image_path),
            caption: replyText
          }, { quoted: msg });
        } else {
          await sendSafeReply(remoteJid, { text: replyText }, { quoted: msg });
        }
        return;
      }

      // 8. Command "bantuan" / "help"
      if (lowerText === 'bantuan' || lowerText === 'help') {
        const adminAllowed = await isAuthorized(remoteJid, senderNumber);
        if (adminAllowed) {
          const helpAdmin = `🛠️ *PANDUAN ADMIN BOT STORE:*\n` +
            `• *list* : Menampilkan daftar nama produk.\n` +
            `• *addlist <nama> | <detail>* : Tambah produk baru (bisa lampirkan foto).\n` +
            `• *updatelist <nama> | <detail>* : Update harga/detail produk (bisa lampirkan foto).\n` +
            `• *deletelist <nama>* : Hapus produk dari database.\n` +
            `• *setbanner* : Kirim foto dengan caption ini untuk mengganti banner katalog.\n` +
            `• *kick @member* : Keluarkan member (atau reply pesannya lalu ketik kick).\n` +
            `• *hapuspesan* : Reply pesan yang ingin dihapus untuk semua orang.\n` +
            `• *h <pesan>* : Tag semua member grup (hidetag).\n` +
            `• *status* : Cek performa server (uptime, RAM, status).\n` +
            `• *backup* : Unduh file backup database toko.\n` +
            `• *setgrup* : Kunci bot ke grup ini.\n` +
            `• *unsetgrup* : Buka kunci grup.`;
          await sock.sendMessage(remoteJid, { text: helpAdmin }, { quoted: msg });
        } else {
          const helpMember = `💡 *CARA MELIHAT PRODUK:*\n` +
            `• Ketik *list* untuk melihat semua produk yang tersedia.\n` +
            `• Ketik *nama produk* (contoh: *netflix*) untuk melihat harga & detail lengkap.`;
          await sock.sendMessage(remoteJid, { text: helpMember }, { quoted: msg });
        }
        return;
      }
    }
  });
}

startBot().catch((err) => {
  console.error('[FATAL] Gagal memulai bot:', err);
});
