import { z } from 'zod';
import { Db, TZ, getConfig, q, q1, tx } from '../db';
import { bad, conflict, notFound, round2, round3 } from '../http';
import {
  aumentarStock,
  descontarPorVencimiento,
  evaluarStockCritico,
  reducirStock,
} from './dominio';

export const ventaSchema = z.object({
  uuid_cliente: z.string().uuid().optional(),
  canal_pago: z.enum(['EFECTIVO', 'MERCADO_PAGO', 'TARJETA']),
  monto_recibido: z.number().nonnegative().optional(),
  fecha_hora: z.string().datetime({ offset: true }).optional(),
  items: z
    .array(
      z.object({
        id_producto: z.number().int().positive(),
        cantidad: z.number().positive(),
        precio_unit: z.number().nonnegative().optional(), // solo se respeta al sincronizar ventas offline
      })
    )
    .min(1, 'La venta no tiene productos'),
});
export type VentaInput = z.infer<typeof ventaSchema>;

export interface VentaResultado {
  venta: any;
  detalle: any[];
  vuelto: number | null;
  alertas_stock_critico: { id_producto: number; nombre: string; stock_actual: number; stock_minimo: number }[];
  stock_actualizado: { id_producto: number; stock_actual: number }[];
  advertencias: string[];
  duplicada?: boolean;
}

export async function obtenerVenta(db: Db, idVenta: number) {
  const venta = await q1<any>(
    `SELECT v.*, u.nombre AS usuario_nombre FROM venta v JOIN usuario u USING (id_usuario) WHERE v.id_venta=$1`,
    [idVenta],
    db
  );
  if (!venta) throw notFound('Venta inexistente');
  const detalle = await q<any>(
    `SELECT d.*, p.nombre, p.tipo_venta, p.codigo_barra FROM detalle_venta d
     JOIN producto p USING (id_producto) WHERE d.id_venta=$1 ORDER BY d.id_detalle`,
    [idVenta],
    db
  );
  return { venta, detalle };
}

/**
 * Venta.liquidarTransaccion() — R3: en UNA transacción valida stock, inserta venta y detalle,
 * reduce stock (R4: también por vencimiento más próximo) y evalúa stock crítico (R5).
 * `sync=true`: venta ya cobrada offline; se respeta fecha y precio, y si falta stock se deja en 0.
 */
export async function registrarVenta(
  idUsuario: number,
  input: VentaInput,
  opts: { sync?: boolean } = {}
): Promise<VentaResultado> {
  return tx(async (c) => {
    // Idempotencia (ventas offline reenviadas)
    if (input.uuid_cliente) {
      const ya = await q1<any>('SELECT id_venta FROM venta WHERE uuid_cliente=$1', [input.uuid_cliente], c);
      if (ya) {
        const { venta, detalle } = await obtenerVenta(c, ya.id_venta);
        return {
          venta,
          detalle,
          vuelto: venta.vuelto,
          alertas_stock_critico: [],
          stock_actualizado: [],
          advertencias: [],
          duplicada: true,
        };
      }
    }

    // Unificar renglones del mismo producto y ordenar por id (evita deadlocks)
    const merged = new Map<number, { cantidad: number; precio_unit?: number }>();
    for (const it of input.items) {
      const prev = merged.get(it.id_producto);
      merged.set(it.id_producto, {
        cantidad: round3((prev?.cantidad ?? 0) + it.cantidad),
        precio_unit: it.precio_unit ?? prev?.precio_unit,
      });
    }
    const ids = [...merged.keys()].sort((a, b) => a - b);
    const productos = await q<any>(
      'SELECT * FROM producto WHERE id_producto = ANY($1::int[]) FOR UPDATE',
      [ids],
      c
    );
    const porId = new Map(productos.map((p: any) => [p.id_producto, p]));

    const lineas: { id_producto: number; cantidad: number; precio: number; subtotal: number }[] = [];
    for (const id of ids) {
      const p = porId.get(id);
      if (!p) throw notFound(`Producto ${id} inexistente`);
      if (!p.activo && !opts.sync) throw bad(`El producto ${p.nombre} está dado de baja`);
      const m = merged.get(id)!;
      const cantidad = round3(m.cantidad);
      if (cantidad <= 0) throw bad(`Cantidad inválida para ${p.nombre}`);
      if (p.tipo_venta === 'UNIDAD' && !Number.isInteger(cantidad)) {
        throw bad(`${p.nombre} se vende por unidad: la cantidad debe ser un número entero`);
      }
      const precio = opts.sync && m.precio_unit != null ? m.precio_unit : p.precio_venta;
      lineas.push({ id_producto: id, cantidad, precio, subtotal: round2(cantidad * precio) });
    }

    // Validar stock antes de tocar nada (mensaje claro para modificar la cantidad)
    if (!opts.sync) {
      const faltan = lineas
        .map((l) => ({ l, p: porId.get(l.id_producto) }))
        .filter(({ l, p }) => p.stock_actual < l.cantidad)
        .map(({ l, p }) => ({
          id_producto: p.id_producto,
          nombre: p.nombre,
          disponible: p.stock_actual,
          solicitado: l.cantidad,
        }));
      if (faltan.length) {
        throw conflict(
          `Stock insuficiente: ${faltan.map((f) => `${f.nombre} (disponible ${f.disponible})`).join(', ')}`,
          faltan
        );
      }
    }

    const total = round2(lineas.reduce((s, l) => s + l.subtotal, 0));
    let vuelto: number | null = null;
    let montoRecibido: number | null = null;
    if (input.canal_pago === 'EFECTIVO') {
      montoRecibido = input.monto_recibido ?? total;
      // Una venta offline ya fue cobrada en el mostrador: al sincronizar no se vuelve a rechazar por el monto.
      if (montoRecibido < total && !opts.sync) throw bad('El dinero recibido es menor al total de la venta');
      vuelto = Math.max(0, round2(montoRecibido - total));
    }

    const v = await q1<any>(
      `INSERT INTO venta (id_usuario, fecha_hora, total_cobrado, canal_pago, estado, uuid_cliente, monto_recibido, vuelto, sincronizada_en)
       VALUES ($1, COALESCE($2::timestamptz, now()), $3, $4, 'REGISTRADA', $5, $6, $7, $8) RETURNING *`,
      [
        idUsuario,
        input.fecha_hora ?? null,
        total,
        input.canal_pago,
        input.uuid_cliente ?? null,
        montoRecibido,
        vuelto,
        opts.sync ? new Date() : null,
      ],
      c
    );

    const advertencias: string[] = [];
    const alertas: VentaResultado['alertas_stock_critico'] = [];
    const stockActualizado: VentaResultado['stock_actualizado'] = [];

    for (const l of lineas) {
      await q(
        `INSERT INTO detalle_venta (id_venta, id_producto, cantidad, precio_unit_hist, subtotal)
         VALUES ($1,$2,$3,$4,$5)`,
        [v.id_venta, l.id_producto, l.cantidad, l.precio, l.subtotal],
        c
      );
      // Producto.reducirStock()
      const r = await reducirStock(c, l.id_producto, l.cantidad, { clamp: !!opts.sync });
      if (r.faltante > 0) {
        const msg = `Ticket #${v.numero_ticket}: al sincronizar faltaban ${r.faltante} de ${r.nombre}; el stock quedó en 0.`;
        advertencias.push(msg);
        await q('INSERT INTO alerta_sistema (tipo, mensaje) VALUES ($1,$2)', ['SYNC_STOCK', msg], c);
      }
      // R4: descuento por vencimiento más próximo
      await descontarPorVencimiento(c, l.id_producto, l.cantidad);
      stockActualizado.push({ id_producto: l.id_producto, stock_actual: r.stock_actual });
      // R5: alerta de stock crítico
      if (evaluarStockCritico(r)) {
        alertas.push({
          id_producto: l.id_producto,
          nombre: r.nombre,
          stock_actual: r.stock_actual,
          stock_minimo: r.stock_minimo,
        });
      }
    }

    const { venta, detalle } = await obtenerVenta(c, v.id_venta);
    return { venta, detalle, vuelto, alertas_stock_critico: alertas, stock_actualizado: stockActualizado, advertencias };
  });
}

/** R12: una venta anulada devuelve el stock y se excluye de caja y reportes. */
export async function anularVenta(idVenta: number) {
  return tx(async (c) => {
    const v = await q1<any>('SELECT * FROM venta WHERE id_venta=$1 FOR UPDATE', [idVenta], c);
    if (!v) throw notFound('Venta inexistente');
    if (v.estado === 'ANULADA') throw conflict('La venta ya estaba anulada');
    const cierre = await q1<any>(
      `SELECT 1 FROM cierre_caja WHERE fecha = ((SELECT fecha_hora FROM venta WHERE id_venta=$1) AT TIME ZONE '${TZ}')::date`,
      [idVenta],
      c
    );
    if (cierre) throw conflict('No se puede anular: la caja de ese día ya fue cerrada');
    const det = await q<any>('SELECT id_producto, cantidad FROM detalle_venta WHERE id_venta=$1 ORDER BY id_producto', [idVenta], c);
    for (const d of det) await aumentarStock(c, d.id_producto, d.cantidad);
    await q("UPDATE venta SET estado='ANULADA' WHERE id_venta=$1", [idVenta], c);
    return obtenerVenta(c, idVenta);
  });
}

export async function datosComercio(db: Db) {
  const cfg = await getConfig(db);
  return {
    nombre: cfg.comercio_nombre,
    direccion: cfg.comercio_direccion,
    telefono: cfg.comercio_telefono,
    ticket_texto: cfg.ticket_texto,
  };
}
