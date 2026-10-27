import { Router } from 'express';
import { z } from 'zod';
import { autenticar, firmarToken, hashClave, requireAuth } from './auth';
import { HOY, Db, diaLocal, getConfig, num, pool, q, q1, tx } from './db';
import { HttpError, ah, bad, conflict, notFound, round2, round3 } from './http';
import bcrypt from 'bcryptjs';
import {
  actualizarPrecioVenta,
  estadoStock,
  refrescarEstadosVencimiento,
  retirarVencimiento,
} from './services/dominio';
import { anularVenta, datosComercio, obtenerVenta, registrarVenta, ventaSchema } from './services/ventas';
import {
  avanzarEstado,
  cantidadSugerida,
  consolidarFaltantes,
  duplicarPedido,
  editarPedido,
  exportarPedido,
  obtenerPedido,
} from './services/pedidos';
import { ingresoSchema, obtenerIngreso, registrarIngreso } from './services/ingresos';
import { cerrarCaja, reporte, resumenCaja } from './services/caja';
import { importarCatalogo, importSchema, validarCatalogo } from './services/importacion';

export const api = Router();

// ─────────────────────────── Público ───────────────────────────
api.get('/health', ah(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, hora: new Date().toISOString() });
}));

api.post('/auth/login', ah(async (req, res) => {
  const { usuario, clave, recordar } = z
    .object({ usuario: z.string().min(1), clave: z.string().min(1), recordar: z.boolean().optional() })
    .parse(req.body);
  const u = await autenticar(usuario.trim(), clave);
  if (!u) throw new HttpError(401, 'Usuario o contraseña incorrectos');
  res.json({ token: firmarToken(u, !!recordar), usuario: { id_usuario: u.id_usuario, nombre: u.nombre } });
}));

// ─────────────────────────── Protegido ───────────────────────────
api.use(requireAuth);

api.get('/auth/me', (req, res) => res.json({ usuario: req.user }));

api.put('/auth/perfil', ah(async (req, res) => {
  const b = z
    .object({
      nombre: z.string().trim().min(2).max(120).optional(),
      clave_actual: z.string().min(1),
      clave_nueva: z.string().min(4, 'La contraseña nueva debe tener al menos 4 caracteres').optional(),
    })
    .parse(req.body);
  const u = await q1<any>('SELECT * FROM usuario WHERE id_usuario=$1', [req.user!.id_usuario]);
  if (!bcrypt.compareSync(b.clave_actual, u.clave_hash)) throw bad('La contraseña actual no es correcta');
  await q('UPDATE usuario SET nombre=COALESCE($2,nombre), clave_hash=COALESCE($3,clave_hash) WHERE id_usuario=$1', [
    u.id_usuario,
    b.nombre ?? null,
    b.clave_nueva ? hashClave(b.clave_nueva) : null,
  ]);
  const nuevo = { id_usuario: u.id_usuario, nombre: b.nombre ?? u.nombre, usuario_login: u.usuario_login };
  res.json({ usuario: nuevo, token: firmarToken(nuevo, false) });
}));

// ─────────────────────────── Productos ───────────────────────────
const productoBase = z.object({
  codigo_barra: z.string().trim().max(60).nullable().optional(),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(160),
  categoria: z.string().trim().min(1, 'La categoría es obligatoria').max(80),
  tipo_venta: z.enum(['UNIDAD', 'GRANEL']),
  stock_minimo: z.number().nonnegative().default(0),
  precio_costo: z.number().nonnegative().default(0),
  porcentaje_margen: z.number().min(0).max(999).default(40),
  precio_venta: z.number().nonnegative().optional(),
});

const SELECT_PRODUCTO = `
  SELECT p.*,
    (SELECT min(v.fecha_vencimiento) FROM vencimiento_producto v
       WHERE v.id_producto=p.id_producto AND v.estado <> 'RETIRADO' AND v.cantidad > 0)::text AS proximo_vencimiento,
    round((p.precio_costo * (1 + p.porcentaje_margen/100))::numeric, 0) AS precio_sugerido
  FROM producto p`;

function decorar(rows: any[], umbral: number) {
  return rows.map((p) => ({
    ...p,
    estado: estadoStock(p, umbral),
    cantidad_sugerida: cantidadSugerida(p.stock_minimo, p.stock_actual, p.tipo_venta),
  }));
}

api.get('/productos', ah(async (req, res) => {
  const f = z
    .object({
      buscar: z.string().optional(),
      categoria: z.string().optional(),
      tipoVenta: z.enum(['UNIDAD', 'GRANEL']).optional(),
      estado: z.enum(['critico', 'normal']).optional(),
      activo: z.enum(['true', 'false', 'todos']).default('true'),
      limit: z.coerce.number().int().min(1).max(5000).default(2000),
    })
    .parse(req.query);
  const where: string[] = [];
  const params: any[] = [];
  const add = (sql: string, v: any) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (f.activo !== 'todos') add('p.activo = ?', f.activo === 'true');
  if (f.buscar?.trim()) {
    params.push(f.buscar.trim());
    where.push(`(p.nombre ILIKE '%' || $${params.length} || '%' OR p.codigo_barra ILIKE $${params.length} || '%')`);
  }
  if (f.categoria) add('p.categoria = ?', f.categoria);
  if (f.tipoVenta) add('p.tipo_venta = ?', f.tipoVenta);
  if (f.estado === 'critico') where.push('p.stock_actual <= p.stock_minimo');
  if (f.estado === 'normal') where.push('p.stock_actual > p.stock_minimo');
  const cfg = await getConfig();
  const rows = await q(
    `${SELECT_PRODUCTO} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.nombre LIMIT ${f.limit}`,
    params
  );
  res.json(decorar(rows, num(cfg.umbral_alerta, 0)));
}));

api.get('/productos/categorias', ah(async (_req, res) => {
  const rows = await q<{ categoria: string }>('SELECT DISTINCT categoria FROM producto WHERE activo ORDER BY categoria');
  res.json(rows.map((r) => r.categoria));
}));

api.get('/productos/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  const p = await q1(`${SELECT_PRODUCTO} WHERE p.id_producto=$1`, [id]);
  if (!p) throw notFound('Producto inexistente');
  const cfg = await getConfig();
  await refrescarEstadosVencimiento(pool);
  const vencimientos = await q(
    `SELECT id_vencimiento, fecha_vencimiento::text AS fecha_vencimiento, cantidad, estado
     FROM vencimiento_producto WHERE id_producto=$1 ORDER BY (estado='RETIRADO'), fecha_vencimiento`,
    [id]
  );
  res.json({ ...decorar([p], num(cfg.umbral_alerta, 0))[0], vencimientos });
}));

api.post('/productos', ah(async (req, res) => {
  const b = productoBase.extend({ stock_actual: z.number().nonnegative().default(0) }).parse(req.body);
  const precio = b.precio_venta ?? actualizarPrecioVenta(b.precio_costo, b.porcentaje_margen);
  const p = await q1(
    `INSERT INTO producto (codigo_barra, nombre, categoria, tipo_venta, stock_actual, stock_minimo, precio_costo, porcentaje_margen, precio_venta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.codigo_barra || null, b.nombre, b.categoria, b.tipo_venta, round3(b.stock_actual), b.stock_minimo, b.precio_costo, b.porcentaje_margen, precio]
  );
  res.status(201).json(p);
}));

api.put('/productos/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  const b = productoBase.partial().extend({ activo: z.boolean().optional() }).parse(req.body);
  const sets: string[] = [];
  const params: any[] = [id];
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined) continue;
    params.push(k === 'codigo_barra' ? v || null : v);
    sets.push(`${k}=$${params.length}`);
  }
  if (!sets.length) throw bad('No hay cambios para guardar');
  const p = await q1(`UPDATE producto SET ${sets.join(', ')} WHERE id_producto=$1 RETURNING *`, params);
  if (!p) throw notFound('Producto inexistente');
  res.json(p);
}));

// Baja lógica (conserva el historial de ventas e ingresos)
api.delete('/productos/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  const p = await q1('UPDATE producto SET activo=false WHERE id_producto=$1 RETURNING id_producto', [id]);
  if (!p) throw notFound('Producto inexistente');
  res.json({ ok: true });
}));

api.get('/productos/:id/vencimientos', ah(async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  await refrescarEstadosVencimiento(pool);
  res.json(
    await q(
      `SELECT id_vencimiento, fecha_vencimiento::text AS fecha_vencimiento, cantidad, estado
       FROM vencimiento_producto WHERE id_producto=$1 ORDER BY (estado='RETIRADO'), fecha_vencimiento`,
      [id]
    )
  );
}));

// Agregar vencimiento manualmente: suma cantidad si ya existe esa fecha. No modifica el stock del producto.
api.post('/productos/:id/vencimientos', ah(async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  const b = z.object({ fecha_vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cantidad: z.number().positive() }).parse(req.body);
  const r = await tx(async (c) => {
    const prod = await q1<any>('SELECT id_producto FROM producto WHERE id_producto=$1', [id], c);
    if (!prod) throw notFound('Producto inexistente');
    const ex = await q1<any>(
      "SELECT id_vencimiento FROM vencimiento_producto WHERE id_producto=$1 AND fecha_vencimiento=$2 AND estado<>'RETIRADO' FOR UPDATE",
      [id, b.fecha_vencimiento],
      c
    );
    if (ex) {
      return q1('UPDATE vencimiento_producto SET cantidad=cantidad+$2 WHERE id_vencimiento=$1 RETURNING *', [ex.id_vencimiento, b.cantidad], c);
    }
    return q1('INSERT INTO vencimiento_producto (id_producto, fecha_vencimiento, cantidad) VALUES ($1,$2,$3) RETURNING *', [id, b.fecha_vencimiento, b.cantidad], c);
  });
  await refrescarEstadosVencimiento(pool);
  res.status(201).json(r);
}));

api.put('/vencimientos/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  const b = z.object({ fecha_vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), cantidad: z.number().positive().optional() }).parse(req.body);
  const r = await q1(
    'UPDATE vencimiento_producto SET fecha_vencimiento=COALESCE($2::date,fecha_vencimiento), cantidad=COALESCE($3,cantidad) WHERE id_vencimiento=$1 AND estado<>\'RETIRADO\' RETURNING *',
    [id, b.fecha_vencimiento ?? null, b.cantidad ?? null]
  );
  if (!r) throw notFound('Vencimiento inexistente o ya retirado');
  await refrescarEstadosVencimiento(pool);
  res.json(r);
}));

api.get('/productos/:id/ingresos', ah(async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  res.json(
    await q(
      `SELECT i.id_ingreso, i.fecha::text AS fecha, i.numero_comprobante, d.cantidad, d.precio_costo, d.fecha_vencimiento::text AS fecha_vencimiento
       FROM detalle_ingreso d JOIN ingreso_mercaderia i USING (id_ingreso)
       WHERE d.id_producto=$1 ORDER BY i.fecha DESC, i.id_ingreso DESC`,
      [id]
    )
  );
}));

// ─────────────────────────── Vencimientos ───────────────────────────
api.get('/vencimientos', ah(async (req, res) => {
  const { filtro } = z.object({ filtro: z.enum(['todos', '7', '30', 'vencidos', 'retirados']).default('todos') }).parse(req.query);
  const dias = await refrescarEstadosVencimiento(pool);
  const cond: Record<string, string> = {
    todos: "v.estado <> 'RETIRADO'",
    '7': `v.estado <> 'RETIRADO' AND v.fecha_vencimiento BETWEEN ${HOY} AND ${HOY} + 7`,
    '30': `v.estado <> 'RETIRADO' AND v.fecha_vencimiento BETWEEN ${HOY} AND ${HOY} + 30`,
    vencidos: "v.estado = 'VENCIDO'",
    retirados: "v.estado = 'RETIRADO'",
  };
  const rows = await q(
    `SELECT v.id_vencimiento, v.id_producto, p.nombre AS producto, p.categoria, p.tipo_venta,
            v.cantidad, v.fecha_vencimiento::text AS fecha_vencimiento, v.estado,
            (v.fecha_vencimiento - ${HOY}) AS dias_restantes
     FROM vencimiento_producto v JOIN producto p USING (id_producto)
     WHERE v.cantidad > 0 AND ${cond[filtro]}
     ORDER BY v.fecha_vencimiento ASC, p.nombre`
  );
  res.json({ dias_alerta: dias, items: rows });
}));

api.post('/vencimientos/:id/retirar', ah(async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  res.json(await tx((c) => retirarVencimiento(c, id)));
}));

// ─────────────────────────── Stock crítico ───────────────────────────
api.get('/stock-critico', ah(async (_req, res) => {
  const rows = await q<any>(
    `${SELECT_PRODUCTO} WHERE p.activo AND p.stock_actual <= p.stock_minimo ORDER BY (p.stock_actual / NULLIF(p.stock_minimo,0)) NULLS FIRST, p.nombre`
  );
  const enPedido = new Set(
    (
      await q<any>(
        `SELECT DISTINCT d.id_producto FROM detalle_pedido d JOIN pedido_compra p USING (id_pedido) WHERE p.estado IN ('EN_PREPARACION','GENERADO')`
      )
    ).map((r) => r.id_producto)
  );
  res.json(decorar(rows, 0).map((p: any) => ({ ...p, en_pedido: enPedido.has(p.id_producto) })));
}));

// ─────────────────────────── Ventas ───────────────────────────
api.post('/ventas', ah(async (req, res) => {
  const input = ventaSchema.parse(req.body);
  res.status(201).json(await registrarVenta(req.user!.id_usuario, input));
}));

api.get('/ventas', ah(async (req, res) => {
  const f = z.object({ fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), limit: z.coerce.number().int().max(500).default(100) }).parse(req.query);
  res.json(
    await q(
      `SELECT v.id_venta, v.numero_ticket, v.fecha_hora, v.total_cobrado, v.canal_pago, v.estado, u.nombre AS usuario_nombre
       FROM venta v JOIN usuario u USING (id_usuario)
       WHERE ($1::date IS NULL OR ${diaLocal('v.fecha_hora')} = $1::date) ORDER BY v.fecha_hora DESC LIMIT ${f.limit}`,
      [f.fecha ?? null]
    )
  );
}));

api.get('/ventas/:id', ah(async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  const r = await obtenerVenta(pool, id);
  res.json({ ...r, comercio: await datosComercio(pool) });
}));

api.post('/ventas/:id/anular', ah(async (req, res) => {
  res.json(await anularVenta(z.coerce.number().int().parse(req.params.id)));
}));

// Sincronización de ventas hechas offline (idempotente por uuid_cliente)
api.post('/sync/ventas', ah(async (req, res) => {
  const { ventas } = z.object({ ventas: z.array(z.any()).max(1000) }).parse(req.body);
  const ordenadas = [...ventas].sort((a, b) => String(a?.fecha_hora ?? '').localeCompare(String(b?.fecha_hora ?? '')));
  const resultados: any[] = [];
  for (const raw of ordenadas) {
    try {
      const input = ventaSchema.parse(raw);
      const r = await registrarVenta(req.user!.id_usuario, input, { sync: true });
      resultados.push({
        uuid_cliente: input.uuid_cliente,
        ok: true,
        duplicada: !!r.duplicada,
        id_venta: r.venta.id_venta,
        numero_ticket: r.venta.numero_ticket,
        advertencias: r.advertencias,
      });
    } catch (e: any) {
      resultados.push({ uuid_cliente: raw?.uuid_cliente, ok: false, error: e?.message ?? 'Error', detalle: e?.detalle ?? null });
    }
  }
  res.json({ resultados, sincronizadas: resultados.filter((r) => r.ok).length, fallidas: resultados.filter((r) => !r.ok).length });
}));

// ─────────────────────────── Caja ───────────────────────────
api.get('/caja/resumen', ah(async (req, res) => {
  const { fecha } = z.object({ fecha: z.string().optional() }).parse(req.query);
  res.json(await resumenCaja(pool, fecha));
}));

api.post('/caja/cierre', ah(async (req, res) => {
  const b = z
    .object({
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      efectivo_contado: z.number().nonnegative(),
      fondo_inicial: z.number().nonnegative().optional(),
      observacion: z.string().max(500).nullable().optional(),
    })
    .parse(req.body);
  res.status(201).json(await cerrarCaja(req.user!.id_usuario, b));
}));

// ─────────────────────────── Intermediario ───────────────────────────
api.get('/intermediario', ah(async (_req, res) => {
  const i = await q1('SELECT * FROM intermediario_logistico ORDER BY id_intermediario LIMIT 1');
  const pedidos = await q(
    `SELECT p.id_pedido, p.estado, p.fecha_generacion, p.archivo_exportado,
            (SELECT count(*)::int FROM detalle_pedido d WHERE d.id_pedido=p.id_pedido) AS productos,
            (SELECT COALESCE(sum(d.cantidad_solicitada*pr.precio_costo),0) FROM detalle_pedido d JOIN producto pr USING (id_producto) WHERE d.id_pedido=p.id_pedido) AS total_estimado
     FROM pedido_compra p ORDER BY p.id_pedido DESC LIMIT 100`
  );
  const precios = await q(
    `SELECT id_producto, nombre, tipo_venta, precio_costo, stock_actual,
            (SELECT max(p.fecha_generacion) FROM pedido_compra p JOIN detalle_pedido d USING (id_pedido) WHERE d.id_producto=pr.id_producto) AS ultimo_pedido
     FROM producto pr WHERE activo ORDER BY nombre`
  );
  res.json({ intermediario: i, pedidos, precios });
}));

api.put('/intermediario', ah(async (req, res) => {
  const b = z
    .object({
      nombre: z.string().trim().min(1).max(160),
      contacto: z.string().trim().max(160).nullable().optional(),
      telefono_whatsapp: z.string().trim().max(40).nullable().optional(),
      email: z.string().trim().email('Email inválido').max(160).or(z.literal('')).nullable().optional(),
      observaciones: z.string().max(1000).nullable().optional(),
    })
    .parse(req.body);
  const ex = await q1<any>('SELECT id_intermediario FROM intermediario_logistico ORDER BY id_intermediario LIMIT 1');
  const vals = [b.nombre, b.contacto ?? null, b.telefono_whatsapp ?? null, b.email || null, b.observaciones ?? null];
  const r = ex
    ? await q1('UPDATE intermediario_logistico SET nombre=$2, contacto=$3, telefono_whatsapp=$4, email=$5, observaciones=$6 WHERE id_intermediario=$1 RETURNING *', [ex.id_intermediario, ...vals])
    : await q1('INSERT INTO intermediario_logistico (nombre, contacto, telefono_whatsapp, email, observaciones) VALUES ($1,$2,$3,$4,$5) RETURNING *', vals);
  res.json(r);
}));

// ─────────────────────────── Pedidos de compra ───────────────────────────
api.get('/pedidos', ah(async (req, res) => {
  const { estado } = z.object({ estado: z.string().optional() }).parse(req.query);
  const estados = estado ? estado.split(',').map((s) => s.trim()).filter(Boolean) : null;
  res.json(
    await q(
      `SELECT p.id_pedido, p.estado, p.fecha_generacion, p.actualizado_en, p.archivo_exportado, u.nombre AS usuario_nombre,
              (SELECT count(*)::int FROM detalle_pedido d WHERE d.id_pedido=p.id_pedido) AS productos,
              (SELECT COALESCE(sum(d.cantidad_solicitada*pr.precio_costo),0) FROM detalle_pedido d JOIN producto pr USING (id_producto) WHERE d.id_pedido=p.id_pedido) AS total_estimado
       FROM pedido_compra p JOIN usuario u USING (id_usuario)
       WHERE ($1::text[] IS NULL OR p.estado::text = ANY($1::text[]))
       ORDER BY p.id_pedido DESC`,
      [estados]
    )
  );
}));

api.post('/pedidos/consolidar', ah(async (req, res) => {
  const b = z.object({ id_productos: z.array(z.number().int()).optional() }).parse(req.body ?? {});
  res.status(201).json(await consolidarFaltantes(req.user!.id_usuario, b.id_productos));
}));

api.get('/pedidos/:id', ah(async (req, res) => {
  res.json(await obtenerPedido(pool, z.coerce.number().int().parse(req.params.id)));
}));

api.put('/pedidos/:id', ah(async (req, res) => {
  const items = z
    .object({
      items: z.array(z.object({ id_producto: z.number().int(), cantidad_solicitada: z.number().positive(), observacion: z.string().max(250).nullable().optional() })),
    })
    .parse(req.body).items;
  res.json(await editarPedido(z.coerce.number().int().parse(req.params.id), items));
}));

api.post('/pedidos/:id/avanzar', ah(async (req, res) => {
  res.json(await avanzarEstado(z.coerce.number().int().parse(req.params.id)));
}));

api.post('/pedidos/:id/duplicar', ah(async (req, res) => {
  res.status(201).json(await duplicarPedido(req.user!.id_usuario, z.coerce.number().int().parse(req.params.id)));
}));

for (const [ruta, formato] of [['pdf', 'pdf'], ['excel', 'excel']] as const) {
  api.get(`/pedidos/:id/${ruta}`, ah(async (req, res) => {
    const f = await exportarPedido(z.coerce.number().int().parse(req.params.id), formato);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${f.filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(f.buffer);
  }));
}

// ─────────────────────────── Ingresos de mercadería ───────────────────────────
api.post('/ingresos', ah(async (req, res) => {
  res.status(201).json(await registrarIngreso(req.user!.id_usuario, ingresoSchema.parse(req.body)));
}));

api.get('/ingresos', ah(async (_req, res) => {
  res.json(
    await q(
      `SELECT i.id_ingreso, i.fecha::text AS fecha, i.numero_comprobante, i.id_pedido, u.nombre AS usuario_nombre,
              (SELECT count(*)::int FROM detalle_ingreso d WHERE d.id_ingreso=i.id_ingreso) AS productos,
              (SELECT COALESCE(sum(d.cantidad*d.precio_costo),0) FROM detalle_ingreso d WHERE d.id_ingreso=i.id_ingreso) AS total
       FROM ingreso_mercaderia i JOIN usuario u USING (id_usuario) ORDER BY i.id_ingreso DESC LIMIT 200`
    )
  );
}));

api.get('/ingresos/:id', ah(async (req, res) => {
  res.json(await obtenerIngreso(pool, z.coerce.number().int().parse(req.params.id)));
}));

// ─────────────────────────── Dashboard ───────────────────────────
api.get('/dashboard', ah(async (_req, res) => {
  await refrescarEstadosVencimiento(pool);
  const cfg = await getConfig();
  const dias = Math.round(num(cfg.dias_alerta_vencimiento, 30));
  const hoy = await resumenCaja(pool);
  const criticos = await q<any>(
    `SELECT id_producto, nombre, stock_actual, stock_minimo, tipo_venta FROM producto
     WHERE activo AND stock_actual <= stock_minimo ORDER BY stock_actual / NULLIF(stock_minimo,0) NULLS FIRST, nombre`
  );
  const proximos = await q<any>(
    `SELECT v.id_vencimiento, v.id_producto, p.nombre AS producto, v.cantidad, p.tipo_venta, v.fecha_vencimiento::text AS fecha_vencimiento, v.estado
     FROM vencimiento_producto v JOIN producto p USING (id_producto)
     WHERE v.estado IN ('PROXIMO','VENCIDO') AND v.cantidad > 0 ORDER BY v.fecha_vencimiento`
  );
  const ultimos7 = await q<any>(
    `SELECT x.d::text AS dia,
            COALESCE((SELECT sum(total_cobrado) FROM venta v WHERE v.estado='REGISTRADA' AND ${diaLocal('v.fecha_hora')} = x.d),0) AS total,
            (SELECT count(*)::int FROM venta v WHERE v.estado='REGISTRADA' AND ${diaLocal('v.fecha_hora')} = x.d) AS operaciones
     FROM (SELECT (${HOY} - n) AS d FROM generate_series(0,6) AS n) x ORDER BY x.d`
  );
  const top = await q<any>(
    `SELECT p.nombre, p.tipo_venta, sum(dv.cantidad) AS cantidad, sum(dv.subtotal) AS monto
     FROM detalle_venta dv JOIN venta v USING (id_venta) JOIN producto p USING (id_producto)
     WHERE v.estado='REGISTRADA' AND ${diaLocal('v.fecha_hora')} >= ${HOY} - 6
     GROUP BY p.nombre, p.tipo_venta ORDER BY sum(dv.subtotal) DESC LIMIT 6`
  );
  const alertas = await q<any>('SELECT id, tipo, mensaje, fecha_hora FROM alerta_sistema WHERE NOT leida ORDER BY id DESC LIMIT 20');
  const pend = await q1<any>("SELECT count(*)::int AS n FROM pedido_compra WHERE estado NOT IN ('FINALIZADO')");
  res.json({
    hoy: {
      operaciones: hoy.operaciones,
      total: hoy.total_facturado,
      efectivo: hoy.efectivo,
      digital: hoy.digital,
      mercado_pago: hoy.mercado_pago,
      tarjeta: hoy.tarjeta,
      caja_cerrada: !!hoy.cierre,
    },
    dias_alerta: dias,
    stock_critico: { cantidad: criticos.length, items: criticos.slice(0, 8) },
    proximos_vencimientos: { cantidad: proximos.length, items: proximos.slice(0, 8) },
    ventas_7_dias: ultimos7,
    mas_vendidos: top,
    alertas_sistema: alertas,
    pedidos_abiertos: pend.n,
  });
}));

api.post('/alertas/leer', ah(async (_req, res) => {
  await q('UPDATE alerta_sistema SET leida=true WHERE NOT leida');
  res.json({ ok: true });
}));

// ─────────────────────────── Reportes ───────────────────────────
api.get('/reportes', ah(async (req, res) => {
  const f = z.object({ desde: z.string(), hasta: z.string() }).parse(req.query);
  res.json(await reporte(pool, f.desde, f.hasta));
}));

// ─────────────────────────── Importación de catálogo ───────────────────────────
api.post('/importacion/validar', ah(async (req, res) => {
  res.json(await validarCatalogo(pool, importSchema.parse(req.body).filas));
}));
api.post('/importacion/confirmar', ah(async (req, res) => {
  res.json(await importarCatalogo(importSchema.parse(req.body).filas));
}));

// ─────────────────────────── Configuración ───────────────────────────
const CLAVES_CFG = [
  'comercio_nombre', 'comercio_direccion', 'comercio_telefono', 'ticket_texto',
  'stock_minimo_default', 'umbral_alerta', 'margen_default', 'dias_alerta_vencimiento', 'impresion_ancho_ticket',
];
const CLAVES_NUM = ['stock_minimo_default', 'umbral_alerta', 'margen_default', 'dias_alerta_vencimiento'];

api.get('/configuracion', ah(async (_req, res) => {
  res.json(await getConfig());
}));

api.put('/configuracion', ah(async (req, res) => {
  const b = z.record(z.string(), z.union([z.string(), z.number()])).parse(req.body);
  await tx(async (c) => {
    for (const [k, v] of Object.entries(b)) {
      if (!CLAVES_CFG.includes(k)) throw bad(`Clave de configuración desconocida: ${k}`);
      const s = String(v).trim();
      if (CLAVES_NUM.includes(k) && (s === '' || !Number.isFinite(Number(s)) || Number(s) < 0)) throw bad(`${k} debe ser un número mayor o igual a 0`);
      await q(`INSERT INTO configuracion (clave, valor) VALUES ($1,$2) ON CONFLICT (clave) DO UPDATE SET valor=EXCLUDED.valor`, [k, s], c);
    }
  });
  res.json(await getConfig());
}));

// Copia de seguridad: volcado JSON de todas las tablas
api.get('/sistema/backup', ah(async (_req, res) => {
  const tablas = [
    'producto', 'vencimiento_producto', 'venta', 'detalle_venta', 'cierre_caja', 'intermediario_logistico',
    'pedido_compra', 'detalle_pedido', 'pedido_estado_historial', 'ingreso_mercaderia', 'detalle_ingreso', 'configuracion', 'alerta_sistema',
  ];
  const out: Record<string, unknown> = { generado: new Date().toISOString() };
  for (const t of tablas) out[t] = await q(`SELECT * FROM ${t}`);
  res.setHeader('Content-Disposition', `attachment; filename="backup-gluten-free-life-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  res.json(out);
}));

export type { Db };
export { conflict, round2 };
