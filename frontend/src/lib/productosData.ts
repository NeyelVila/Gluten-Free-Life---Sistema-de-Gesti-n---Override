import { get, NetworkError } from './api';
import { productosLocales } from './sync';
import type { Producto } from './types';

export interface FiltroProductos {
  buscar?: string;
  categoria?: string;
  tipoVenta?: string;
  estado?: string; // 'critico' | 'normal' | ''
}

/** Lee productos del servidor; sin conexión, cae al cache local (modo lectura). */
export async function cargarProductos(f: FiltroProductos): Promise<{ items: Producto[]; fromCache: boolean }> {
  const qs = new URLSearchParams();
  if (f.buscar?.trim()) qs.set('buscar', f.buscar.trim());
  if (f.categoria) qs.set('categoria', f.categoria);
  if (f.tipoVenta) qs.set('tipoVenta', f.tipoVenta);
  if (f.estado) qs.set('estado', f.estado);
  try {
    return { items: await get<Producto[]>('/productos?' + qs.toString()), fromCache: false };
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
    const t = (f.buscar ?? '').trim().toLowerCase();
    const items = (await productosLocales())
      .filter((p) => p.activo)
      .filter((p) => !t || p.nombre.toLowerCase().includes(t) || (p.codigo_barra ?? '').toLowerCase().startsWith(t))
      .filter((p) => !f.categoria || p.categoria === f.categoria)
      .filter((p) => !f.tipoVenta || p.tipo_venta === f.tipoVenta)
      .filter((p) => (f.estado === 'critico' ? p.stock_actual <= p.stock_minimo : f.estado === 'normal' ? p.stock_actual > p.stock_minimo : true))
      .map((p) => ({ ...p, estado: p.stock_actual <= p.stock_minimo ? ('CRITICO' as const) : ('NORMAL' as const) }));
    return { items, fromCache: true };
  }
}
