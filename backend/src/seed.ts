/**
 * Datos de demostración (ficticios). ATENCIÓN: `npm run seed` BORRA los datos de negocio y los reemplaza.
 * Con `--if-empty` solo carga si todavía no hay usuarios (lo usa docker-compose en el primer arranque).
 */
import { pool, q, q1, tx } from './db';
import { hashClave } from './auth';
import { migrate } from './migrate';
import { actualizarPrecioVenta } from './services/dominio';

// PRNG determinista para que la demo sea reproducible
let seedN = 20261019;
const rnd = () => {
  seedN = (seedN * 1664525 + 1013904223) % 4294967296;
  return seedN / 4294967296;
};
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const PRODUCTOS = [
  // codigo, nombre, categoria, tipo, costo, margen, stock, minimo, vencimientos[[dias, cantidad]]
  ['7790001000011', 'Almendras', 'Frutos secos', 'GRANEL', 6000, 41.67, 4.2, 2, [[120, 2.0], [200, 2.2]]],
  ['7790001000028', 'Nueces', 'Frutos secos', 'GRANEL', 9000, 40, 6.5, 2, [[90, 6.5]]],
  ['7790001000035', 'Maní', 'Frutos secos', 'GRANEL', 2200, 40, 1.8, 3, [[25, 1.8]]],
  ['7790001000042', 'Semillas de chía', 'Semillas', 'GRANEL', 3500, 40, 5, 2, [[12, 2.0], [150, 3.0]]],
  ['7790001000059', 'Semillas de lino', 'Semillas', 'GRANEL', 1800, 45, 7.3, 2, [[180, 7.3]]],
  ['7790001000066', 'Harina de almendras', 'Harinas', 'UNIDAD', 4800, 40, 1, 2, [[60, 1]]],
  ['7790001000073', 'Harina de arroz', 'Harinas', 'UNIDAD', 1500, 40, 14, 4, [[300, 14]]],
  ['7790001000080', 'Granola Sin TACC', 'Sin TACC', 'UNIDAD', 2800, 40, 9, 3, [[15, 4], [120, 5]]],
  ['7790001000097', 'Galletitas Sin TACC', 'Sin TACC', 'UNIDAD', 2500, 40, 8, 3, [[-5, 1], [45, 7]]],
  ['7790001000103', 'Suplemento Magnesio 60 cáps', 'Suplementos', 'UNIDAD', 7000, 40, 2, 2, [[400, 2]]],
  ['7790001000110', 'Lentejas', 'Legumbres', 'GRANEL', 1200, 50, 12, 3, [[365, 12]]],
  ['7790001000127', 'Copos de avena Sin TACC', 'Cereales', 'GRANEL', 2000, 40, 8, 3, [[200, 8]]],
] as const;

export async function seed(opts: { ifEmpty?: boolean } = {}) {
  await migrate();
  if (opts.ifEmpty) {
    const n = await q1<any>('SELECT count(*)::int AS n FROM usuario');
    if (n && n.n > 0) {
      console.log('La base ya tiene datos: no se carga la demostración.');
      return;
    }
  }

  await tx(async (c) => {
    await q(
      `TRUNCATE alerta_sistema, detalle_ingreso, ingreso_mercaderia, pedido_estado_historial, detalle_pedido, pedido_compra,
         intermediario_logistico, cierre_caja, detalle_venta, venta, vencimiento_producto, producto, usuario RESTART IDENTITY CASCADE`,
      [],
      c
    );
    // La demostración también restablece la configuración a sus valores por defecto
    await q('DELETE FROM configuracion', [], c);
    await q(
      `INSERT INTO configuracion (clave, valor) VALUES
        ('comercio_nombre','Gluten Free Life'),('comercio_direccion','Av. Siempreviva 742'),('comercio_telefono','011 5555-0100'),
        ('ticket_texto','¡Gracias por su compra! Comprobante no válido como factura.'),('stock_minimo_default','2'),('umbral_alerta','1'),
        ('margen_default','40'),('dias_alerta_vencimiento','30'),('impresion_ancho_ticket','80mm')`,
      [],
      c
    );
    const u = await q1<any>(
      `INSERT INTO usuario (nombre, usuario_login, clave_hash) VALUES ($1,$2,$3) RETURNING id_usuario`,
      ['Gluten Free Life', 'admin', hashClave('1234')],
      c
    );
    const inter = await q1<any>(
      `INSERT INTO intermediario_logistico (nombre, contacto, telefono_whatsapp, email, observaciones)
       VALUES ($1,$2,$3,$4,$5) RETURNING id_intermediario`,
      [
        'Distribuidora Natural', 'Carlos Méndez', '5491155550142', 'pedidos@distribuidoranatural.example',
        'Realiza las compras, el retiro y la entrega. Pedidos los lunes antes de las 12 h.',
      ],
      c
    );

    const ids: Record<string, number> = {};
    for (const [codigo, nombre, cat, tipo, costo, margen, stock, min, venc] of PRODUCTOS) {
      const p = await q1<any>(
        `INSERT INTO producto (codigo_barra, nombre, categoria, tipo_venta, stock_actual, stock_minimo, precio_costo, porcentaje_margen, precio_venta)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id_producto`,
        [codigo, nombre, cat, tipo, stock, min, costo, margen, actualizarPrecioVenta(costo, margen)],
        c
      );
      ids[nombre] = p.id_producto;
      for (const [dias, cant] of venc) {
        await q(
          `INSERT INTO vencimiento_producto (id_producto, fecha_vencimiento, cantidad)
           VALUES ($1, ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + $2::int), $3)`,
          [p.id_producto, dias, cant],
          c
        );
      }
    }
    // Estados de vencimiento iniciales
    await q(
      `UPDATE vencimiento_producto SET estado = CASE
         WHEN fecha_vencimiento < ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) THEN 'VENCIDO'::estado_vencimiento
         WHEN fecha_vencimiento <= ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) + 30 THEN 'PROXIMO'::estado_vencimiento
         ELSE 'NORMAL'::estado_vencimiento END`,
      [],
      c
    );

    // Ventas históricas de los últimos 7 días (no tocan el stock actual, que ya es el vigente)
    const prods = await q<any>('SELECT id_producto, nombre, tipo_venta, precio_venta FROM producto', [], c);
    const canales = ['EFECTIVO', 'EFECTIVO', 'EFECTIVO', 'MERCADO_PAGO', 'TARJETA'];
    for (let dia = 6; dia >= 0; dia--) {
      const n = dia === 0 ? 5 : 7 + Math.floor(rnd() * 6);
      for (let k = 0; k < n; k++) {
        const items = new Map<number, number>();
        const nItems = 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < nItems; i++) {
          const p = pick(prods);
          const cant = p.tipo_venta === 'GRANEL' ? [0.25, 0.5, 0.75, 1, 1.5][Math.floor(rnd() * 5)] : 1 + Math.floor(rnd() * 2);
          items.set(p.id_producto, cant);
        }
        const lineas = [...items.entries()].map(([id, cant]) => {
          const p = prods.find((x: any) => x.id_producto === id);
          return { id, cant, precio: p.precio_venta, sub: Math.round(cant * p.precio_venta * 100) / 100 };
        });
        const total = Math.round(lineas.reduce((s, l) => s + l.sub, 0) * 100) / 100;
        const canal = pick(canales);
        const recibido = canal === 'EFECTIVO' ? Math.ceil(total / 1000) * 1000 : null;
        // Hoy: horas pasadas (nunca en el futuro). Días previos: horario comercial.
        const minutosAtras = dia === 0 ? 20 + Math.floor(rnd() * 240) : dia * 1440 + 60 + Math.floor(rnd() * 600);
        const v = await q1<any>(
          `INSERT INTO venta (id_usuario, fecha_hora, total_cobrado, canal_pago, estado, monto_recibido, vuelto)
           VALUES ($1, now() - ($2::int * interval '1 minute'), $3, $4, 'REGISTRADA', $5, $6) RETURNING id_venta`,
          [u.id_usuario, minutosAtras, total, canal, recibido, recibido ? recibido - total : null],
          c
        );
        for (const l of lineas) {
          await q(
            'INSERT INTO detalle_venta (id_venta, id_producto, cantidad, precio_unit_hist, subtotal) VALUES ($1,$2,$3,$4,$5)',
            [v.id_venta, l.id, l.cant, l.precio, l.sub],
            c
          );
        }
      }
    }

    // Pedidos históricos en distintos estados
    const crearPedido = async (diasAtras: number, estados: string[], items: [string, number][]) => {
      const estadoFinal = estados[estados.length - 1];
      const p = await q1<any>(
        `INSERT INTO pedido_compra (id_usuario, id_intermediario, fecha_generacion, estado, archivo_exportado, actualizado_en)
         VALUES ($1,$2, now() - ($3::int * interval '1 day'), $4, $5, now() - ($3::int * interval '1 day')) RETURNING id_pedido`,
        [u.id_usuario, inter.id_intermediario, diasAtras, estadoFinal, estados.includes('EXPORTADO') ? 'pedido-pendiente.pdf' : null],
        c
      );
      for (let i = 0; i < estados.length; i++) {
        await q(
          `INSERT INTO pedido_estado_historial (id_pedido, estado, fecha_hora) VALUES ($1,$2, now() - ($3::float8 * interval '1 day'))`,
          [p.id_pedido, estados[i], Math.max(diasAtras - i * 0.2, 0)],
          c
        );
      }
      for (const [nombre, cant] of items) {
        await q('INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad_solicitada) VALUES ($1,$2,$3)', [p.id_pedido, ids[nombre], cant], c);
      }
      return p.id_pedido as number;
    };
    const ESTADOS = ['EN_PREPARACION', 'GENERADO', 'EXPORTADO', 'ENVIADO', 'EN_GESTION', 'ENTREGADO', 'FINALIZADO'];
    const p1 = await crearPedido(12, ESTADOS, [['Nueces', 4], ['Semillas de lino', 5], ['Harina de arroz', 10]]);
    await crearPedido(5, ESTADOS.slice(0, 6), [['Lentejas', 10], ['Copos de avena Sin TACC', 6], ['Galletitas Sin TACC', 8]]);
    await crearPedido(2, ESTADOS.slice(0, 4), [['Almendras', 3], ['Granola Sin TACC', 6]]);

    // Un ingreso de mercadería de ejemplo (del pedido finalizado)
    const ing = await q1<any>(
      `INSERT INTO ingreso_mercaderia (id_usuario, id_pedido, numero_comprobante, fecha)
       VALUES ($1,$2,'0001-00004521', current_date - 10) RETURNING id_ingreso`,
      [u.id_usuario, p1],
      c
    );
    for (const [nombre, cant, costo, dias] of [['Nueces', 4, 9000, 90], ['Semillas de lino', 5, 1800, 180], ['Harina de arroz', 10, 1500, 300]] as const) {
      await q(
        `INSERT INTO detalle_ingreso (id_ingreso, id_producto, cantidad, precio_costo, fecha_vencimiento)
         VALUES ($1,$2,$3,$4, current_date + $5::int)`,
        [ing.id_ingreso, ids[nombre], cant, costo, dias],
        c
      );
    }
  });

  console.log('Demostración cargada. Ingresá con usuario "admin" y contraseña "1234".');
}

if (require.main === module) {
  seed({ ifEmpty: process.argv.includes('--if-empty') })
    .then(() => pool.end())
    .catch(async (e) => {
      console.error(e);
      await pool.end();
      process.exit(1);
    });
}
