// Runner de migraciones a medida: SQLite no tiene un equivalente directo a
// node-pg-migrate, así que esto aplica los .sql de migrations/ en orden,
// llevando registro de lo ya aplicado en _migrations. Son solo hacia adelante
// (sin rollback) — para un panel interno de bajo volumen alcanza, y evita
// sumar una dependencia extra solo para bajar migraciones.
const fs = require('fs');
const path = require('path');
const db = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => r.name));
const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

let aplicadas = 0;
for (const archivo of archivos) {
  if (applied.has(archivo)) continue;

  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf8');
  const aplicarMigracion = db.transaction(() => {
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(archivo);
  });
  aplicarMigracion();

  console.log(`✅ Migración aplicada: ${archivo}`);
  aplicadas += 1;
}

console.log(aplicadas > 0 ? `Listo, ${aplicadas} migración(es) nueva(s).` : 'Sin migraciones pendientes.');
