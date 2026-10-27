import fs from 'fs';
import path from 'path';
import { Db, q, q1, tx } from '../db';
import { bad, conflict, notFound, round2, round3 } from '../http';
import { generarExcelPedido, generarPdfPedido } from './exportar';

export const ESTADOS = [
  'EN_PREPARACION',
  'GENERADO',
  'EXPORTADO',
  'ENVIADO',
  'EN_GESTION',
  'ENTREGADO',
  'FINALIZADO',
] as const;
export type EstadoPedido = (typeof ESTADOS)[number];

export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || path.join(__dirname, '../../storage'));

/** R8: cantidad sugerida por defecto = max(stock_minimo × 2 − stock_actual, 1) */
export function cantidadSugerida(stockMinimo: number, stockActual: number, tipoVenta: string): number {
  const c = Math.max(stockMinimo * 2 - stockActual, 1);
  return tipoVenta === 'UNIDAD' ? Math.ceil(c) : round3(c);
}

export async function obtenerPedido(db: Db, id: number) {
  const pedido = await q1<any>(
    `SELECT p.*, u.nombre AS usuario_nombre,
            i.nombre AS intermediario_nombre, i.contacto AS intermediario_contacto,
            i.telefono_whatsapp, i.email AS intermediario_email
     FROM pedido_compra p
     JOIN usuario u USING (id_usuario)
     JOIN intermediario_logistico i USING (id_intermediario)
     WHERE p.id_pedido=$1`,
    [id],
    db
  );
  if (!pedido) throw notFound('Pedido inexistente');
  const items = await q<any>(
    `SELECT d.id_det_pedido, d.id_producto, d.cantidad_solicitada, d.observacion,
            pr.nombre, pr.codigo_barra, pr.tipo_venta, pr.stock_actual, pr.stock_minimo, pr.precio_costo,
            round((d.cantidad_solicitada * pr.precio_costo)::numeric, 2) AS subtotal_estimado
     FROM detalle_pedido d JOIN producto pr USING (id_producto)
     WHERE d.id_pedido=$1 ORDER BY pr.nombre`,
    [id],
    db
  );
  const historial = await q<any>(
    'SELECT estado, fecha_hora FROM pedido_estado_historial WHERE id_pedido=$1 ORDER BY id',
    [id],
    db
  );
  const total_estimado = round2(items.reduce((s: number, i: any) => s + i.subtotal_estimado, 0));
  return { ...pedido, items, historial, total_estimado };
}

async function pedidoAbierto(db: Db) {
  return q1<any>("SELECT * FROM pedido_compra WHERE estado='EN_PREPARACION' ORDER BY id_pedido DESC LIMIT 1 FOR UPDATE", [], db);
}

async function marcarEstado(db: Db, id: number, estado: EstadoPedido) {
  await q('UPDATE pedido_compra SET estado=$2, actualizado_en=now() WHERE id_pedido=$1', [id, estado], db);
  await q('INSERT INTO pedido_estado_historial (id_pedido, estado) VALUES ($1,$2)', [id, estado], db);
}

/**
 * PedidoCompra.consolidarFaltantes() — R8.
 * Crea UN pedido EN_PREPARACION con los productos en stock crítico (o los indicados), dirigido al
 * único intermediario. Si ya hay un pedido EN_PREPARACION, agrega los productos que falten.
 */
export async function consolidarFaltantes(idUsuario: number, idProductos?: number[]) {
  return tx(async (c) => {
    const inter = await q1<any>('SELECT id_intermediario FROM intermediario_logistico ORDER BY id_intermediario LIMIT 1', [], c);
    if (!inter) throw conflict('Primero cargá los datos del intermediario logístico');

    const productos = await q<any>(
      `SELECT * FROM producto WHERE activo = true AND
         ${idProductos?.length ? 'id_producto = ANY($1::int[])' : 'stock_actual <= stock_minimo AND $1::int[] IS NULL'}
       ORDER BY nombre`,
      [idProductos?.length ? idProductos : null],
      c
    );
    if (!productos.length) throw bad('No hay productos con stock crítico para pedir');

    let pedido = await pedidoAbierto(c);
    let creado = false;
    if (!pedido) {
      pedido = await q1<any>(
        `INSERT INTO pedido_compra (id_usuario, id_intermediario, estado) VALUES ($1,$2,'EN_PREPARACION') RETURNING *`,
        [idUsuario, inter.id_intermediario],
        c
      );
      await q('INSERT INTO pedido_estado_historial (id_pedido, estado) VALUES ($1,$2)', [pedido.id_pedido, 'EN_PREPARACION'], c);
      creado = true;
    }
    let agregados = 0;
    for (const p of productos) {
      const r = await q(
        `INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad_solicitada)
         VALUES ($1,$2,$3) ON CONFLICT (id_pedido, id_producto) DO NOTHING RETURNING id_det_pedido`,
        [pedido.id_pedido, p.id_producto, cantidadSugerida(p.stock_minimo, p.stock_actual, p.tipo_venta)],
        c
      );
      agregados += r.length;
    }
    const out = await obtenerPedido(c, pedido.id_pedido);
    return { pedido: out, creado, agregados };
  });
}

export interface ItemEdicion {
  id_producto: number;
  cantidad_solicitada: number;
  observacion?: string | null;
}

/** Edita el detalle: solo mientras el pedido está EN_PREPARACION o GENERADO (R9). */
export async function editarPedido(id: number, items: ItemEdicion[]) {
  return tx(async (c) => {
    const p = await q1<any>('SELECT * FROM pedido_compra WHERE id_pedido=$1 FOR UPDATE', [id], c);
    if (!p) throw notFound('Pedido inexistente');
    if (!['EN_PREPARACION', 'GENERADO'].includes(p.estado)) {
      throw conflict('El pedido ya no se puede editar: solo se edita en EN_PREPARACION o GENERADO');
    }
    if (!items.length) throw bad('El pedido debe tener al menos un producto');
    const ids = items.map((i) => i.id_producto);
    if (new Set(ids).size !== ids.length) throw bad('Hay productos repetidos en el pedido');
    await q('DELETE FROM detalle_pedido WHERE id_pedido=$1 AND NOT (id_producto = ANY($2::int[]))', [id, ids], c);
    for (const it of items) {
      await q(
        `INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad_solicitada, observacion)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id_pedido, id_producto) DO UPDATE SET cantidad_solicitada=EXCLUDED.cantidad_solicitada, observacion=EXCLUDED.observacion`,
        [id, it.id_producto, round3(it.cantidad_solicitada), it.observacion ?? null],
        c
      );
    }
    return obtenerPedido(c, id);
  });
}

/** R9: ciclo de vida estricto y lineal. */
export async function avanzarEstado(id: number) {
  return tx(async (c) => {
    const p = await q1<any>('SELECT * FROM pedido_compra WHERE id_pedido=$1 FOR UPDATE', [id], c);
    if (!p) throw notFound('Pedido inexistente');
    const idx = ESTADOS.indexOf(p.estado);
    if (idx === ESTADOS.length - 1) throw conflict('El pedido ya está FINALIZADO');
    if (p.estado === 'GENERADO') {
      throw conflict('Descargá el PDF o el Excel del pedido para marcarlo como EXPORTADO');
    }
    if (p.estado === 'EN_PREPARACION') {
      const n = await q1<any>('SELECT count(*)::int AS n FROM detalle_pedido WHERE id_pedido=$1', [id], c);
      if (!n || n.n === 0) throw bad('El pedido no tiene productos');
    }
    await marcarEstado(c, id, ESTADOS[idx + 1]);
    return obtenerPedido(c, id);
  });
}

/** Marca como FINALIZADO un pedido ENTREGADO (usado al registrar el ingreso). */
export async function finalizarSiEntregado(db: Db, id: number) {
  const p = await q1<any>('SELECT estado FROM pedido_compra WHERE id_pedido=$1 FOR UPDATE', [id], db);
  if (p && p.estado === 'ENTREGADO') await marcarEstado(db, id, 'FINALIZADO');
}

/** PedidoCompra.generarPDF() / generarExcel(): genera el archivo, lo guarda y marca EXPORTADO si corresponde. */
export async function exportarPedido(id: number, formato: 'pdf' | 'excel'): Promise<{ buffer: Buffer; filename: string; mime: string }> {
  const pedido = await tx(async (c) => {
    const p = await q1<any>('SELECT * FROM pedido_compra WHERE id_pedido=$1 FOR UPDATE', [id], c);
    if (!p) throw notFound('Pedido inexistente');
    if (p.estado === 'EN_PREPARACION') {
      throw conflict('Primero generá el pedido (pasalo a GENERADO) para poder exportarlo');
    }
    const full = await obtenerPedido(c, id);
    return full;
  });
  const comercio = await q<any>("SELECT clave, valor FROM configuracion WHERE clave LIKE 'comercio_%'");
  const cfg: Record<string, string> = {};
  for (const r of comercio) cfg[r.clave] = r.valor;

  const num = String(id).padStart(4, '0');
  const ext = formato === 'pdf' ? 'pdf' : 'xlsx';
  const filename = `pedido-${num}.${ext}`;
  const buffer = formato === 'pdf' ? await generarPdfPedido(pedido, cfg) : await generarExcelPedido(pedido, cfg);

  fs.mkdirSync(path.join(STORAGE_DIR, 'pedidos'), { recursive: true });
  fs.writeFileSync(path.join(STORAGE_DIR, 'pedidos', filename), buffer);

  await tx(async (c) => {
    await q('UPDATE pedido_compra SET archivo_exportado=$2 WHERE id_pedido=$1', [id, filename], c);
    const p = await q1<any>('SELECT estado FROM pedido_compra WHERE id_pedido=$1 FOR UPDATE', [id], c);
    if (p.estado === 'GENERADO') await marcarEstado(c, id, 'EXPORTADO');
  });

  return {
    buffer,
    filename,
    mime: formato === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

export async function duplicarPedido(idUsuario: number, id: number) {
  return tx(async (c) => {
    const orig = await obtenerPedido(c, id);
    const abierto = await pedidoAbierto(c);
    if (abierto) throw conflict(`Ya hay un pedido en preparación (#${abierto.id_pedido}). Terminalo o editalo antes de duplicar otro.`);
    const nuevo = await q1<any>(
      `INSERT INTO pedido_compra (id_usuario, id_intermediario, estado) VALUES ($1,$2,'EN_PREPARACION') RETURNING id_pedido`,
      [idUsuario, orig.id_intermediario],
      c
    );
    await q('INSERT INTO pedido_estado_historial (id_pedido, estado) VALUES ($1,$2)', [nuevo.id_pedido, 'EN_PREPARACION'], c);
    for (const it of orig.items) {
      await q(
        'INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad_solicitada, observacion) VALUES ($1,$2,$3,$4)',
        [nuevo.id_pedido, it.id_producto, it.cantidad_solicitada, it.observacion],
        c
      );
    }
    return obtenerPedido(c, nuevo.id_pedido);
  });
}
