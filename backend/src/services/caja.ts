import { Db, HOY, TZ, diaLocal, q, q1, tx } from '../db';
import { bad, conflict, round2 } from '../http';

const fechaOHoy = async (db: Db, f?: string) => {
  if (f) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) throw bad('Fecha inválida (usar AAAA-MM-DD)');
    return f;
  }
  const r = await q1<any>(`SELECT ${HOY}::text AS hoy`, [], db);
  return r.hoy as string;
};

/** CierreCaja.consolidarTotales() — R11. Mercado Pago + Tarjeta se suman como "digital". */
export async function resumenCaja(db: Db, fecha?: string) {
  const f = await fechaOHoy(db, fecha);
  const t = await q1<any>(
    `SELECT
        count(*)::int AS operaciones,
        COALESCE(sum(total_cobrado),0) AS total,
        COALESCE(sum(total_cobrado) FILTER (WHERE canal_pago='EFECTIVO'),0) AS efectivo,
        COALESCE(sum(total_cobrado) FILTER (WHERE canal_pago='MERCADO_PAGO'),0) AS mercado_pago,
        COALESCE(sum(total_cobrado) FILTER (WHERE canal_pago='TARJETA'),0) AS tarjeta
     FROM venta WHERE estado='REGISTRADA' AND ${diaLocal('fecha_hora')} = $1::date`,
    [f],
    db
  );
  const anuladas = await q1<any>(
    `SELECT count(*)::int AS n FROM venta WHERE estado='ANULADA' AND ${diaLocal('fecha_hora')} = $1::date`,
    [f],
    db
  );
  const cierre = await q1<any>(
    `SELECT c.*, u.nombre AS usuario_nombre FROM cierre_caja c JOIN usuario u USING (id_usuario) WHERE fecha=$1::date`,
    [f],
    db
  );
  const ventas = await q<any>(
    `SELECT v.id_venta, v.numero_ticket, v.fecha_hora, v.total_cobrado, v.canal_pago, v.estado, u.nombre AS usuario_nombre
     FROM venta v JOIN usuario u USING (id_usuario)
     WHERE ${diaLocal('v.fecha_hora')} = $1::date ORDER BY v.fecha_hora DESC`,
    [f],
    db
  );
  return {
    fecha: f,
    operaciones: t.operaciones,
    anuladas: anuladas.n,
    total_facturado: round2(t.total),
    efectivo: round2(t.efectivo),
    mercado_pago: round2(t.mercado_pago),
    tarjeta: round2(t.tarjeta),
    digital: round2(t.mercado_pago + t.tarjeta),
    cierre,
    ventas,
  };
}

/** R11: diferencia = efectivo contado − efectivo esperado (efectivo del día + fondo inicial). */
export async function cerrarCaja(
  idUsuario: number,
  input: { fecha?: string; efectivo_contado: number; fondo_inicial?: number; observacion?: string | null }
) {
  return tx(async (c) => {
    // Evita que dos cierres simultáneos del mismo día se pisen
    await q('SELECT pg_advisory_xact_lock(7001)', [], c);
    const r = await resumenCaja(c, input.fecha);
    if (r.cierre) throw conflict('La caja de ese día ya fue cerrada');
    const fondo = round2(input.fondo_inicial ?? 0);
    const esperado = round2(r.efectivo + fondo);
    const diferencia = round2(input.efectivo_contado - esperado);
    await q(
      `INSERT INTO cierre_caja (id_usuario, fecha, total_efectivo, total_digital, diferencia, fondo_inicial, efectivo_contado, observacion)
       VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8)`,
      [idUsuario, r.fecha, r.efectivo, r.digital, diferencia, fondo, input.efectivo_contado, input.observacion ?? null],
      c
    );
    const out = await resumenCaja(c, r.fecha);
    return { ...out, efectivo_esperado: esperado, cuadrada: diferencia === 0 };
  });
}

export async function reporte(db: Db, desde: string, hasta: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) throw bad('Fechas inválidas (usar AAAA-MM-DD)');
  const rango = `v.estado='REGISTRADA' AND ${diaLocal('v.fecha_hora')} BETWEEN $1::date AND $2::date`;
  const tot = await q1<any>(
    `SELECT count(*)::int AS operaciones, COALESCE(sum(total_cobrado),0) AS total,
        COALESCE(sum(total_cobrado) FILTER (WHERE canal_pago='EFECTIVO'),0) AS efectivo,
        COALESCE(sum(total_cobrado) FILTER (WHERE canal_pago='MERCADO_PAGO'),0) AS mercado_pago,
        COALESCE(sum(total_cobrado) FILTER (WHERE canal_pago='TARJETA'),0) AS tarjeta
     FROM venta v WHERE ${rango}`,
    [desde, hasta],
    db
  );
  const masVendidos = await q<any>(
    `SELECT p.id_producto, p.nombre, p.tipo_venta, sum(d.cantidad) AS cantidad, sum(d.subtotal) AS monto
     FROM detalle_venta d JOIN venta v USING (id_venta) JOIN producto p USING (id_producto)
     WHERE ${rango} GROUP BY p.id_producto, p.nombre, p.tipo_venta ORDER BY sum(d.subtotal) DESC LIMIT 10`,
    [desde, hasta],
    db
  );
  const menorRotacion = await q<any>(
    `SELECT p.id_producto, p.nombre, p.tipo_venta, p.stock_actual,
            COALESCE(sum(d.cantidad) FILTER (WHERE ${rango.replace(/v\./g, 'v.')}),0) AS cantidad
     FROM producto p
     LEFT JOIN detalle_venta d ON d.id_producto = p.id_producto
     LEFT JOIN venta v ON v.id_venta = d.id_venta
     WHERE p.activo = true
     GROUP BY p.id_producto, p.nombre, p.tipo_venta, p.stock_actual
     ORDER BY cantidad ASC, p.stock_actual DESC LIMIT 10`,
    [desde, hasta],
    db
  );
  const porDia = await q<any>(
    `SELECT ${diaLocal('v.fecha_hora')}::text AS dia, count(*)::int AS operaciones, sum(v.total_cobrado) AS total
     FROM venta v WHERE ${rango} GROUP BY 1 ORDER BY 1`,
    [desde, hasta],
    db
  );
  const crit = await q1<any>('SELECT count(*)::int AS n FROM producto WHERE activo AND stock_actual <= stock_minimo', [], db);
  return {
    desde,
    hasta,
    total_vendido: round2(tot.total),
    operaciones: tot.operaciones,
    ticket_promedio: tot.operaciones ? round2(tot.total / tot.operaciones) : 0,
    efectivo: round2(tot.efectivo),
    mercado_pago: round2(tot.mercado_pago),
    tarjeta: round2(tot.tarjeta),
    mas_vendidos: masVendidos,
    menor_rotacion: menorRotacion,
    ventas_por_dia: porDia,
    stock_critico: crit.n,
  };
}

export { TZ };
