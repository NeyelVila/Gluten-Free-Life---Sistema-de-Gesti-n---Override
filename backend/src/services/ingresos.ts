import { z } from 'zod';
import { Db, q, q1, tx } from '../db';
import { bad, conflict, notFound, round3 } from '../http';
import { actualizarPrecioVenta, aumentarStock } from './dominio';
import { finalizarSiEntregado } from './pedidos';

export const ingresoSchema = z.object({
  id_pedido: z.number().int().positive().nullable().optional(),
  numero_comprobante: z.string().trim().max(80).optional().nullable(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  actualizar_precios: z.boolean().default(true),
  finalizar_pedido: z.boolean().default(true),
  items: z
    .array(
      z.object({
        id_producto: z.number().int().positive(),
        cantidad: z.number().positive(),
        precio_costo: z.number().nonnegative(),
        fecha_vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      })
    )
    .min(1, 'El ingreso no tiene productos'),
});
export type IngresoInput = z.infer<typeof ingresoSchema>;

export async function obtenerIngreso(db: Db, id: number) {
  const ing = await q1<any>(
    `SELECT i.*, u.nombre AS usuario_nombre FROM ingreso_mercaderia i JOIN usuario u USING (id_usuario) WHERE id_ingreso=$1`,
    [id],
    db
  );
  if (!ing) throw notFound('Ingreso inexistente');
  const items = await q<any>(
    `SELECT d.*, p.nombre, p.tipo_venta FROM detalle_ingreso d JOIN producto p USING (id_producto)
     WHERE d.id_ingreso=$1 ORDER BY d.id_det_ingreso`,
    [id],
    db
  );
  return { ...ing, items };
}

/**
 * R10 — Ingreso de mercadería (CU-06). En una transacción: crea ingreso y detalle, aumentarStock(),
 * actualiza precio_costo, recalcula el precio de venta sugerido y registra el vencimiento
 * (si ya existe uno con la misma fecha para ese producto, suma la cantidad).
 */
export async function registrarIngreso(idUsuario: number, input: IngresoInput) {
  return tx(async (c) => {
    if (input.id_pedido) {
      const p = await q1<any>('SELECT estado FROM pedido_compra WHERE id_pedido=$1 FOR UPDATE', [input.id_pedido], c);
      if (!p) throw notFound('Pedido inexistente');
      if (p.estado !== 'ENTREGADO') throw conflict('Solo se puede registrar el ingreso de un pedido ENTREGADO');
      const ya = await q1<any>('SELECT id_ingreso FROM ingreso_mercaderia WHERE id_pedido=$1', [input.id_pedido], c);
      if (ya) throw conflict(`El pedido ya tiene un ingreso registrado (#${ya.id_ingreso})`);
    }
    const ing = await q1<any>(
      `INSERT INTO ingreso_mercaderia (id_usuario, id_pedido, numero_comprobante, fecha)
       VALUES ($1,$2,$3, COALESCE($4::date, current_date)) RETURNING *`,
      [idUsuario, input.id_pedido ?? null, input.numero_comprobante ?? null, input.fecha ?? null],
      c
    );

    const resumen: any[] = [];
    const items = [...input.items].sort((a, b) => a.id_producto - b.id_producto);
    for (const it of items) {
      const prod = await q1<any>('SELECT * FROM producto WHERE id_producto=$1 FOR UPDATE', [it.id_producto], c);
      if (!prod) throw notFound(`Producto ${it.id_producto} inexistente`);
      const cantidad = round3(it.cantidad);
      if (prod.tipo_venta === 'UNIDAD' && !Number.isInteger(cantidad)) {
        throw bad(`${prod.nombre} se vende por unidad: la cantidad debe ser entera`);
      }
      await q(
        `INSERT INTO detalle_ingreso (id_ingreso, id_producto, cantidad, precio_costo, fecha_vencimiento)
         VALUES ($1,$2,$3,$4,$5)`,
        [ing.id_ingreso, it.id_producto, cantidad, it.precio_costo, it.fecha_vencimiento ?? null],
        c
      );
      const stockAntes = prod.stock_actual;
      const s = await aumentarStock(c, it.id_producto, cantidad); // Producto.aumentarStock()
      const nuevoPrecio = actualizarPrecioVenta(it.precio_costo, prod.porcentaje_margen);
      await q(
        `UPDATE producto SET precio_costo=$2 ${input.actualizar_precios ? ', precio_venta=$3' : ''} WHERE id_producto=$1`,
        input.actualizar_precios ? [it.id_producto, it.precio_costo, nuevoPrecio] : [it.id_producto, it.precio_costo],
        c
      );
      if (it.fecha_vencimiento) {
        const ex = await q1<any>(
          `SELECT id_vencimiento FROM vencimiento_producto
           WHERE id_producto=$1 AND fecha_vencimiento=$2 AND estado <> 'RETIRADO' FOR UPDATE`,
          [it.id_producto, it.fecha_vencimiento],
          c
        );
        if (ex) {
          await q('UPDATE vencimiento_producto SET cantidad = cantidad + $2 WHERE id_vencimiento=$1', [ex.id_vencimiento, cantidad], c);
        } else {
          await q(
            'INSERT INTO vencimiento_producto (id_producto, fecha_vencimiento, cantidad) VALUES ($1,$2,$3)',
            [it.id_producto, it.fecha_vencimiento, cantidad],
            c
          );
        }
      }
      resumen.push({
        id_producto: it.id_producto,
        nombre: prod.nombre,
        stock_anterior: stockAntes,
        stock_nuevo: s.stock_actual,
        costo_anterior: prod.precio_costo,
        costo_nuevo: it.precio_costo,
        precio_venta_anterior: prod.precio_venta,
        precio_venta_nuevo: input.actualizar_precios ? nuevoPrecio : prod.precio_venta,
        precio_sugerido: nuevoPrecio,
        vencimiento_registrado: it.fecha_vencimiento ?? null,
      });
    }

    let pedidoFinalizado = false;
    if (input.id_pedido && input.finalizar_pedido) {
      await finalizarSiEntregado(c, input.id_pedido);
      pedidoFinalizado = true;
    }
    return { ingreso: await obtenerIngreso(c, ing.id_ingreso), resumen, pedido_finalizado: pedidoFinalizado };
  });
}
