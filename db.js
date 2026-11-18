const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

// Ensure data directory exists
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(path.join(dbDir, 'store.db'));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    details TEXT NOT NULL,
    image_path TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function getAllProducts() {
  const query = db.prepare('SELECT id, name, details, image_path FROM products ORDER BY name COLLATE NOCASE ASC');
  return query.all();
}

function getProductByName(name) {
  const query = db.prepare('SELECT id, name, details, image_path FROM products WHERE LOWER(name) = LOWER(?)');
  return query.get(name.trim());
}

function upsertProduct(name, details, imagePath = null) {
  const trimmedName = name.trim();
  const trimmedDetails = details.trim();
  
  const existing = getProductByName(trimmedName);
  if (existing) {
    if (imagePath) {
      const stmt = db.prepare('UPDATE products SET details = ?, image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      stmt.run(trimmedDetails, imagePath, existing.id);
    } else {
      const stmt = db.prepare('UPDATE products SET details = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      stmt.run(trimmedDetails, existing.id);
    }
    return { action: 'updated', product: getProductByName(trimmedName) };
  } else {
    const stmt = db.prepare('INSERT INTO products (name, details, image_path) VALUES (?, ?, ?)');
    stmt.run(trimmedName, trimmedDetails, imagePath);
    return { action: 'created', product: getProductByName(trimmedName) };
  }
}

function deleteProduct(name) {
  const existing = getProductByName(name.trim());
  if (!existing) return null;
  const stmt = db.prepare('DELETE FROM products WHERE id = ?');
  stmt.run(existing.id);
  return existing;
}

function getSetting(key) {
  const query = db.prepare('SELECT value FROM settings WHERE key = ?');
  const res = query.get(key);
  return res ? res.value : null;
}

function setSetting(key, value) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  stmt.run(key, String(value));
}

module.exports = {
  getAllProducts,
  getProductByName,
  upsertProduct,
  deleteProduct,
  getSetting,
  setSetting
};
