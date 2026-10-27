/**
 * Métodos del dominio según el diagrama de clases:
 *  Producto: actualizarPrecioVenta(), evaluarStockCritico(), reducirStock(cant), aumentarStock(cant)
 *  VencimientoProducto: verificarCaducidad()
 *  Reglas R1, R2, R4, R6, R7
 */
import { Db, HOY, getConfig, q, q1, num } from '../db';
import { conflict, notFound, round3 } from '../http';

/** R2: precio sugerido = costo × (1 + margen/100), redondeado al peso. */
export function actualizarPrecioVenta(precioCosto: number, porcentajeMargen: number): number {
  return Math.round(precioCosto * (1 + porcentajeMargen / 100));
}

/** R1: crítico si stock_actual <= stock_minimo. */
export function evaluarStockCritico(p: { stock_actual: number; stock_minimo: number }): boolean {
  return p.stock_actual <= p.stock_minimo;
}

/** Estado de inventario: CRITICO (R1) / BAJO (hasta `umbral` unidades sobre el mínimo) / NORMAL. */
export function estadoStock(p: { stock_actual: number; stock_minimo: number }, umbral = 0): 'CRITICO' | 'BAJO' | 'NORMAL' {
  if (evaluarStockCritico(p)) return 'CRITICO';
  if (umbral > 0 && p.stock_actual <= p.stock_minimo + umbral) return 'BAJO';
  return 'NORMAL';
}

/** VencimientoProducto.verificarCaducidad(): true si ya venció. */
export function verificarCaducidad(fechaVencimiento: string, hoy: string): boolean {
  return fechaVencimiento < hoy;
}

/** Producto.reducirStock(cant). Atómico. Con `clamp` deja el stock en 0 si no alcanza (sync offline). */
export async function reducirStock(
  db: Db,
  idProducto: number,
  cant: number,
  opts: { clamp?: boolean } = {}
): Promise<{ stock_actual: number; stock_minimo: number; nombre: string; faltante: number }> {
  const antes = await q1<any>('SELECT stock_actual, nombre FROM producto WHERE id_producto=$1 FOR UPDATE', [idProducto], db);
  if (!antes) throw notFound(`Producto ${idProducto} inexistente`);
  if (antes.stock_actual < cant && !opts.clamp) {
    throw conflict(`Stock insuficiente de ${antes.nombre}`, {
      id_producto: idProducto,
      disponible: antes.stock_actual,
      solicitado: cant,
    });
  }
  const faltante = Math.max(0, round3(cant - antes.stock_actual));
  const row = await q1<any>(
    `UPDATE producto SET stock_actual = GREATEST(stock_actual - $2, 0) WHERE id_producto=$1
     RETURNING stock_actual, stock_minimo, nombre`,
    [idProducto, cant],
    db
  );
  return { ...row, faltante };
}

/** Producto.aumentarStock(cant). */
export async function aumentarStock(db: Db, idProducto: number, cant: number) {
  const row = await q1<any>(
    `UPDATE producto SET stock_actual = stock_actual + $2 WHERE id_producto=$1
     RETURNING stock_actual, stock_minimo, nombre`,
    [idProducto, cant],
    db
  );
  if (!row) throw notFound(`Producto ${idProducto} inexistente`);
  return row as { stock_actual: number; stock_minimo: number; nombre: string };
}

/** R6: recalcula el estado de los vencimientos según la fecha y los días de anticipación configurados. */
export async function refrescarEstadosVencimiento(db: Db) {
  const cfg = await getConfig(db);
  const dias = Math.max(0, Math.round(num(cfg.dias_alerta_vencimiento, 30)));
  await q(
    `UPDATE vencimiento_producto SET estado = CASE
        WHEN fecha_vencimiento < ${HOY} THEN 'VENCIDO'::estado_vencimiento
        WHEN fecha_vencimiento <= ${HOY} + $1::int THEN 'PROXIMO'::estado_vencimiento
        ELSE 'NORMAL'::estado_vencimiento END
     WHERE estado <> 'RETIRADO'`,
    [dias],
    db
  );
  return dias;
}

/**
 * R4: descuenta `cantidad` de los registros de vencimiento del producto, empezando por la fecha
 * más cercana que no esté vencida ni retirada. Si un registro no alcanza, pasa al siguiente.
 * Si el producto no tiene vencimientos cargados, no hace nada (solo cuenta producto.stock_actual).
 * Un registro que llega a 0 se elimina.
 */
export async function descontarPorVencimiento(db: Db, idProducto: number, cantidad: number) {
  let resto = cantidad;
  const rows = await q<any>(
    `SELECT id_vencimiento, cantidad FROM vencimiento_producto
     WHERE id_producto=$1 AND estado <> 'RETIRADO' AND fecha_vencimiento >= ${HOY} AND cantidad > 0
     ORDER BY fecha_vencimiento ASC, id_vencimiento ASC FOR UPDATE`,
    [idProducto],
    db
  );
  const afectados: { id_vencimiento: number; descontado: number }[] = [];
  for (const r of rows) {
    if (resto <= 0) break;
    const d = Math.min(r.cantidad, resto);
    const nueva = round3(r.cantidad - d);
    if (nueva <= 0) {
      await q('DELETE FROM vencimiento_producto WHERE id_vencimiento=$1', [r.id_vencimiento], db);
    } else {
      await q('UPDATE vencimiento_producto SET cantidad=$2 WHERE id_vencimiento=$1', [r.id_vencimiento, nueva], db);
    }
    afectados.push({ id_vencimiento: r.id_vencimiento, descontado: d });
    resto = round3(resto - d);
  }
  return afectados;
}

/** R7: marcar un vencimiento como retirado: baja el stock del producto y deja el registro RETIRADO. */
export async function retirarVencimiento(db: Db, idVencimiento: number) {
  const v = await q1<any>(
    'SELECT * FROM vencimiento_producto WHERE id_vencimiento=$1 FOR UPDATE',
    [idVencimiento],
    db
  );
  if (!v) throw notFound('Vencimiento inexistente');
  if (v.estado === 'RETIRADO') throw conflict('Este vencimiento ya fue retirado');
  const prod = await reducirStock(db, v.id_producto, v.cantidad, { clamp: true });
  await q("UPDATE vencimiento_producto SET estado='RETIRADO' WHERE id_vencimiento=$1", [idVencimiento], db);
  return { id_vencimiento: idVencimiento, id_producto: v.id_producto, cantidad_retirada: v.cantidad, producto: prod };
}
