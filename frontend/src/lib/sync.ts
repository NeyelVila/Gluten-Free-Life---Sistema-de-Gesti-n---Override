/**
 * Modo offline (RNF-02): el POS nunca se bloquea.
 *  - El catálogo (precios y stock) y la configuración se cachean en IndexedDB.
 *  - Las ventas sin conexión se guardan localmente (cola) y se sincronizan solas al volver Internet.
 */
import { get, isForcedOffline, post, NetworkError, getToken } from './api';
import { getMeta, localdb, setMeta } from './localdb';
import type { Comercio, Producto, VentaPendiente } from './types';
import { toast, useConn } from '../store/stores';

const emitirCache = () => window.dispatchEvent(new Event('gfl:cache'));

export async function contarPendientes() {
  const n = await localdb.ventasPendientes.count();
  useConn.getState().set({ pendientes: n });
  return n;
}

/** Descarga catálogo y configuración y los guarda localmente. No pisa el stock local si hay ventas pendientes. */
export async function refrescarCache(force = false) {
  if (!getToken()) return;
  if (!force && (await localdb.ventasPendientes.count()) > 0) return;
  const [prods, cfg] = await Promise.all([get<Producto[]>('/productos?limit=5000'), get<Record<string, string>>('/configuracion')]);
  await localdb.transaction('rw', localdb.productos, localdb.meta, async () => {
    await localdb.productos.clear();
    await localdb.productos.bulkPut(prods);
    await setMeta('configuracion', cfg);
    await setMeta('cache_fecha', Date.now());
  });
  emitirCache();
}

export async function comercioLocal(): Promise<Comercio> {
  const c = (await getMeta<Record<string, string>>('configuracion')) ?? {};
  return {
    nombre: c.comercio_nombre ?? 'Gluten Free Life',
    direccion: c.comercio_direccion ?? '',
    telefono: c.comercio_telefono ?? '',
    ticket_texto: c.ticket_texto ?? '',
  };
}

export async function productosLocales(): Promise<Producto[]> {
  return localdb.productos.orderBy('nombre').toArray();
}

/** Aplica localmente el descuento de stock (venta online confirmada o venta offline). */
export async function aplicarStockLocal(cambios: { id_producto: number; stock_actual: number }[]) {
  await localdb.transaction('rw', localdb.productos, async () => {
    for (const c of cambios) await localdb.productos.update(c.id_producto, { stock_actual: c.stock_actual });
  });
  emitirCache();
}

export async function siguienteTicketOffline(): Promise<string> {
  const n = ((await getMeta<number>('offline_seq')) ?? 0) + 1;
  await setMeta('offline_seq', n);
  return `OFF-${String(n).padStart(4, '0')}`;
}

/** Guarda una venta en la cola local y descuenta el stock en el cache. */
export async function encolarVenta(v: VentaPendiente) {
  await localdb.transaction('rw', localdb.ventasPendientes, localdb.productos, async () => {
    await localdb.ventasPendientes.put(v);
    for (const it of v.items) {
      const p = await localdb.productos.get(it.id_producto);
      if (p) await localdb.productos.update(it.id_producto, { stock_actual: Math.max(0, Math.round((p.stock_actual - it.cantidad) * 1000) / 1000) });
    }
  });
  await contarPendientes();
  emitirCache();
}

let sincronizando = false;
/** Envía la cola al servidor (en orden cronológico, idempotente por uuid_cliente). */
export async function sincronizar(): Promise<{ n: number; fallidas: number; advertencias: string[] }> {
  if (sincronizando) return { n: 0, fallidas: 0, advertencias: [] };
  const pend = await localdb.ventasPendientes.orderBy('fecha_hora').toArray();
  if (!pend.length) return { n: 0, fallidas: 0, advertencias: [] };
  sincronizando = true;
  useConn.getState().set({ syncing: true });
  try {
    const r = await post<{ resultados: any[]; sincronizadas: number; fallidas: number }>('/sync/ventas', {
      ventas: pend.map((v) => ({
        uuid_cliente: v.uuid_cliente,
        fecha_hora: v.fecha_hora,
        canal_pago: v.canal_pago,
        monto_recibido: v.monto_recibido ?? undefined,
        items: v.items.map((i) => ({ id_producto: i.id_producto, cantidad: i.cantidad, precio_unit: i.precio_unit })),
      })),
    });
    const advertencias: string[] = [];
    for (const res of r.resultados) {
      if (res.ok) {
        await localdb.ventasPendientes.delete(res.uuid_cliente);
        advertencias.push(...(res.advertencias ?? []));
      } else if (res.uuid_cliente) {
        await localdb.ventasPendientes.update(res.uuid_cliente, { estado: 'error', error: res.error });
      }
    }
    await contarPendientes();
    if ((await localdb.ventasPendientes.count()) === 0) await refrescarCache(true);
    return { n: r.sincronizadas, fallidas: r.fallidas, advertencias };
  } finally {
    sincronizando = false;
    useConn.getState().set({ syncing: false });
  }
}

// ───────────── Monitor de conexión ─────────────
async function ping(): Promise<boolean> {
  if (isForcedOffline()) return false;
  if (!navigator.onLine) return false;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3500);
    const base = (import.meta.env.VITE_API_URL as string | undefined) || '/api';
    const res = await fetch(base + '/health', { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

let iniciado = false;
export async function chequearConexion() {
  const conn = useConn.getState();
  const forced = isForcedOffline();
  const ok = await ping();
  const antes = conn.online;
  conn.set({ online: ok, forced });
  if (ok && !antes) await alVolverConexion();
  else if (!ok && antes) toast.warn('Sin conexión', 'Podés seguir vendiendo. Las ventas se guardan y se sincronizan solas.');
  return ok;
}

async function alVolverConexion() {
  try {
    const { n, fallidas, advertencias } = await sincronizar();
    if (n > 0) useConn.getState().set({ restablecida: { n, at: Date.now() } });
    else useConn.getState().set({ restablecida: { n: 0, at: Date.now() } });
    if (fallidas > 0) toast.error(`${fallidas} venta(s) no se pudieron sincronizar`, 'Quedaron guardadas en el equipo. Revisalas en Configuración → Sincronización.');
    advertencias.slice(0, 3).forEach((a) => toast.warn('Aviso de sincronización', a));
    await refrescarCache();
  } catch (e) {
    if (!(e instanceof NetworkError)) console.error(e);
  }
}

export function iniciarMonitor() {
  if (iniciado) return;
  iniciado = true;
  window.addEventListener('online', chequearConexion);
  window.addEventListener('offline', chequearConexion);
  setInterval(chequearConexion, 8000);
  contarPendientes();
  chequearConexion();
}
