// Runner de migraciones a medida: SQLite no tiene un equivalente directo a
// node-pg-migrate, asi que esto aplica los .sql de migrations/ en orden,
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

  // PRAGMA foreign_keys=OFF no tiene efecto si se ejecuta dentro de una
  // transaccion ya abierta (la que arma db.transaction() mas abajo) — es
  // el unico caso en que hace falta correr fuera de una transaccion: cuando
  // hay que reconstruir una tabla que otras referencian por FK (SQLite no
  // soporta ALTER de un CHECK existente). Ese tipo de migracion marca esto
  // con un comentario al principio del archivo.
  if (sql.trimStart().startsWith('-- migrate:no-transaction')) {
    db.pragma('foreign_keys = OFF');
    db.exec(sql);
    const rotas = db.pragma('foreign_key_check');
    if (rotas.length > 0) {
      db.pragma('foreign_keys = ON');
      throw new Error(`${archivo} dejo referencias rotas: ${JSON.stringify(rotas)}`);
    }
    db.pragma('foreign_keys = ON');
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(archivo);
  } else {
    const aplicarMigracion = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(archivo);
    });
    aplicarMigracion();
  }

  console.log(`✅ Migracion aplicada: ${archivo}`);
  aplicadas += 1;
}

console.log(aplicadas > 0 ? `Listo, ${aplicadas} migracion(es) nueva(s).` : 'Sin migraciones pendientes.');
