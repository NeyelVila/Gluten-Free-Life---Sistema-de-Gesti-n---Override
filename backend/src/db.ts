import 'dotenv/config';
import pg from 'pg';

const { Pool, types } = pg;

// NUMERIC -> number, BIGINT -> number, DATE -> 'YYYY-MM-DD' (sin corrimiento de zona horaria)
types.setTypeParser(1700, (v: string) => parseFloat(v));
types.setTypeParser(20, (v: string) => parseInt(v, 10));
types.setTypeParser(1082, (v: string) => v);

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/gfl',
});

// Zona horaria del comercio (para "hoy", cierres de caja y reportes por día)
const tzRaw = process.env.TZ_NEGOCIO || 'America/Argentina/Buenos_Aires';
export const TZ = /^[A-Za-z_\/+-]+$/.test(tzRaw) ? tzRaw : 'America/Argentina/Buenos_Aires';
/** Expresión SQL: fecha local del negocio de una columna timestamptz. */
export const diaLocal = (col: string) => `((${col} AT TIME ZONE '${TZ}')::date)`;
/** Expresión SQL: hoy en la zona del negocio. */
export const HOY = `((now() AT TIME ZONE '${TZ}')::date)`;

export type Db = pg.Pool | pg.PoolClient;

export async function q<T = any>(text: string, params: any[] = [], db: Db = pool): Promise<T[]> {
  const r = await db.query(text, params);
  return r.rows as T[];
}

export async function q1<T = any>(text: string, params: any[] = [], db: Db = pool): Promise<T | null> {
  const rows = await q<T>(text, params, db);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function getConfig(db: Db = pool): Promise<Record<string, string>> {
  const rows = await q<{ clave: string; valor: string }>('SELECT clave, valor FROM configuracion', [], db);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.clave] = r.valor;
  return out;
}

export const num = (v: unknown, fallback = 0) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};
