const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config({ quiet: true });

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'camaras.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
// DELETE en vez de WAL: WAL depende de locking/memoria compartida entre
// conexiones (via el .db-shm) que el bind mount de Windows de backend/data
// no soporta de forma confiable — eso perdio una fila reciente sin que el
// contenedor se haya reiniciado (ver historial). DELETE usa el rollback
// journal clasico, sin ese requisito, y a esta escala no hace falta la
// concurrencia extra que da WAL.
db.pragma('journal_mode = DELETE');
db.pragma('foreign_keys = ON');

console.log(`✅ SQLite conectado: ${dbPath}`);

module.exports = db;
