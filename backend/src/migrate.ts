import fs from 'fs';
import path from 'path';
import { pool } from './db';

/** Aplica en orden los archivos migrations/NNN_*.sql que todavía no se ejecutaron. */
export async function migrate(): Promise<string[]> {
  const dir = path.resolve(__dirname, '../migrations');
  const client = await pool.connect();
  const aplicadas: string[] = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migraciones (nombre VARCHAR(200) PRIMARY KEY, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const hechas = new Set((await client.query('SELECT nombre FROM schema_migraciones')).rows.map((r) => r.nombre));
    const files = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
    for (const f of files) {
      if (hechas.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migraciones (nombre) VALUES ($1)', [f]);
        await client.query('COMMIT');
        aplicadas.push(f);
        console.log(`Migración aplicada: ${f}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Falló la migración ${f}: ${(e as Error).message}`);
      }
    }
    if (!aplicadas.length) console.log('Base de datos al día: no hay migraciones pendientes.');
  } finally {
    client.release();
  }
  return aplicadas;
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch(async (e) => {
      console.error(e.message);
      await pool.end();
      process.exit(1);
    });
}
