const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config({ quiet: true });

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'camaras.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log(`✅ SQLite conectado: ${dbPath}`);

module.exports = db;
