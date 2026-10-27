/**
 * Prueba de punta a punta de la API contra PostgreSQL real. ATENCIÓN: recarga los datos de demostración.
 * Uso: DATABASE_URL=... npm test
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { crearApp } from '../index';
import { pool } from '../db';
import { seed } from '../seed';

let base = '';
let token = '';
let pasados = 0;

async function call(method: string, url: string, body?: any, raw = false): Promise<any> {
  const r = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return r;
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* no json */ }
  return { status: r.status, body: json };
}
const ok = (name: string) => { pasados++; console.log(`  ✓ ${name}`); };
async function t(name: string, fn: () => Promise<void>) {
  try { await fn(); ok(name); } catch (e) { console.error(`  ✗ ${name}\n`, e); throw e; }
}
const approx = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.0005, `${msg ?? ''} esperado ${b}, obtenido ${a}`);

async function main() {
  await seed();
  const server = crearApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  console.log('Probando API en', base);

  await t('health y login', async () => {
    assert.equal((await call('GET', '/health')).status, 200);
    assert.equal((await call('POST', '/auth/login', { usuario: 'admin', clave: 'mala' })).status, 401);
    assert.equal((await call('GET', '/productos')).status, 401);
    const l = await call('POST', '/auth/login', { usuario: 'admin', clave: '1234', recordar: true });
    assert.equal(l.status, 200);
    token = l.body.token;
    assert.equal(l.body.usuario.nombre, 'Gluten Free Life');
    assert.equal(l.body.usuario.rol, undefined, 'no debe existir el concepto de rol');
  });

  const prods: Record<string, any> = {};
  await t('catálogo de demostración', async () => {
    const r = await call('GET', '/productos');
    assert.equal(r.body.length, 12);
    for (const p of r.body) prods[p.nombre] = p;
    const crit = (await call('GET', '/productos?estado=critico')).body.map((p: any) => p.nombre).sort();
    assert.deepEqual(crit, ['Harina de almendras', 'Maní', 'Suplemento Magnesio 60 cáps']);
    assert.equal(prods['Almendras'].precio_venta, 8500);
    assert.equal((await call('GET', '/productos?buscar=7790001000011')).body.length, 1);
    assert.equal((await call('GET', '/productos?tipoVenta=GRANEL')).body.every((p: any) => p.tipo_venta === 'GRANEL'), true);
  });

  const stock = async (n: string) => (await call('GET', `/productos/${prods[n].id_producto}`)).body;

  await t('R3/R4 venta: descuenta stock y el vencimiento más próximo; vuelto', async () => {
    const r = await call('POST', '/ventas', {
      canal_pago: 'EFECTIVO', monto_recibido: 10000,
      items: [{ id_producto: prods['Almendras'].id_producto, cantidad: 0.25 }, { id_producto: prods['Galletitas Sin TACC'].id_producto, cantidad: 2 }],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    approx(r.body.venta.total_cobrado, 0.25 * 8500 + 2 * 3500);
    approx(r.body.vuelto, 10000 - (0.25 * 8500 + 2 * 3500));
    const a = await stock('Almendras');
    approx(a.stock_actual, 3.95);
    approx(a.vencimientos[0].cantidad, 1.75, 'vencimiento más próximo de almendras');
    approx(a.vencimientos[1].cantidad, 2.2);
    const g = await stock('Galletitas Sin TACC');
    approx(g.stock_actual, 6);
    const venc = g.vencimientos;
    const vencido = venc.find((v: any) => v.estado === 'VENCIDO');
    approx(vencido.cantidad, 1, 'el vencido no se toca');
    approx(venc.find((v: any) => v.estado !== 'VENCIDO').cantidad, 5);
  });

  await t('R3 un renglón repetido se unifica y baja el vencimiento siguiente al agotar el primero', async () => {
    const id = prods['Granola Sin TACC'].id_producto; // vencimientos 4 (15d) y 5 (120d)
    const r = await call('POST', '/ventas', { canal_pago: 'TARJETA', items: [{ id_producto: id, cantidad: 5 }, { id_producto: id, cantidad: 1 }] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const g = await stock('Granola Sin TACC');
    approx(g.stock_actual, 3);
    assert.equal(g.vencimientos.length, 1, 'el primer registro llegó a 0 y se eliminó');
    approx(g.vencimientos[0].cantidad, 3);
    assert.equal(r.body.alertas_stock_critico.length, 1, 'R5: stock <= mínimo → alerta inmediata');
    assert.equal(r.body.alertas_stock_critico[0].nombre, 'Granola Sin TACC');
    assert.equal(r.body.vuelto, null);
  });

  await t('validaciones de venta', async () => {
    const sin = await call('POST', '/ventas', { canal_pago: 'EFECTIVO', items: [{ id_producto: prods['Harina de almendras'].id_producto, cantidad: 2 }] });
    assert.equal(sin.status, 409);
    assert.match(sin.body.error, /Stock insuficiente/);
    assert.equal((await stock('Harina de almendras')).stock_actual, 1, 'no se descontó nada');
    const frac = await call('POST', '/ventas', { canal_pago: 'EFECTIVO', items: [{ id_producto: prods['Harina de arroz'].id_producto, cantidad: 1.5 }] });
    assert.equal(frac.status, 400);
    const poco = await call('POST', '/ventas', { canal_pago: 'EFECTIVO', monto_recibido: 10, items: [{ id_producto: prods['Harina de arroz'].id_producto, cantidad: 1 }] });
    assert.equal(poco.status, 400);
    assert.equal((await call('POST', '/ventas', { canal_pago: 'EFECTIVO', items: [] })).status, 400);
  });

  await t('sync offline: idempotente, respeta precio y fecha; stock insuficiente deja 0 y avisa', async () => {
    const u1 = randomUUID();
    const u2 = randomUUID();
    const hace = new Date(Date.now() - 3600_000).toISOString();
    const payload = {
      ventas: [
        { uuid_cliente: u1, canal_pago: 'MERCADO_PAGO', fecha_hora: hace, items: [{ id_producto: prods['Harina de arroz'].id_producto, cantidad: 2, precio_unit: 2100 }] },
        { uuid_cliente: u2, canal_pago: 'EFECTIVO', monto_recibido: 50000, fecha_hora: hace, items: [{ id_producto: prods['Suplemento Magnesio 60 cáps'].id_producto, cantidad: 5, precio_unit: 9800 }] },
      ],
    };
    const r = await call('POST', '/sync/ventas', payload);
    assert.equal(r.body.sincronizadas, 2, JSON.stringify(r.body));
    assert.ok(r.body.resultados[1].advertencias.length === 1);
    assert.equal((await stock('Suplemento Magnesio 60 cáps')).stock_actual, 0);
    const again = await call('POST', '/sync/ventas', payload);
    assert.equal(again.body.resultados.every((x: any) => x.duplicada), true);
    approx((await stock('Harina de arroz')).stock_actual, 12, 'no se descontó dos veces');
    const dash = await call('GET', '/dashboard');
    assert.ok(dash.body.alertas_sistema.length >= 1);
  });

  let idVentaAnular = 0;
  await t('R12 anular venta devuelve el stock', async () => {
    const antes = (await stock('Nueces')).stock_actual;
    const v = await call('POST', '/ventas', { canal_pago: 'TARJETA', items: [{ id_producto: prods['Nueces'].id_producto, cantidad: 1 }] });
    idVentaAnular = v.body.venta.id_venta;
    approx((await stock('Nueces')).stock_actual, antes - 1);
    const a = await call('POST', `/ventas/${idVentaAnular}/anular`);
    assert.equal(a.status, 200);
    approx((await stock('Nueces')).stock_actual, antes);
    assert.equal((await call('POST', `/ventas/${idVentaAnular}/anular`)).status, 409);
    const tk = await call('GET', `/ventas/${idVentaAnular}`);
    assert.equal(tk.body.venta.estado, 'ANULADA');
    assert.ok(tk.body.comercio.nombre);
  });

  await t('vencimientos: filtros, estados y R7 retirar', async () => {
    const todos = (await call('GET', '/vencimientos?filtro=todos')).body.items;
    assert.ok(todos.length >= 10);
    assert.deepEqual(todos.map((v: any) => v.fecha_vencimiento), [...todos.map((v: any) => v.fecha_vencimiento)].sort());
    const venc = (await call('GET', '/vencimientos?filtro=vencidos')).body.items;
    assert.equal(venc.length, 1);
    assert.equal(venc[0].producto, 'Galletitas Sin TACC');
    const d7 = (await call('GET', '/vencimientos?filtro=7')).body.items;
    assert.equal(d7.length, 0);
    const d30 = (await call('GET', '/vencimientos?filtro=30')).body.items.map((v: any) => v.producto);
    assert.ok(d30.includes('Semillas de chía') && d30.includes('Maní'));
    const stockAntes = (await stock('Galletitas Sin TACC')).stock_actual;
    const r = await call('POST', `/vencimientos/${venc[0].id_vencimiento}/retirar`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    approx((await stock('Galletitas Sin TACC')).stock_actual, stockAntes - 1);
    assert.equal((await call('POST', `/vencimientos/${venc[0].id_vencimiento}/retirar`)).status, 409);
    assert.equal((await call('GET', '/vencimientos?filtro=vencidos')).body.items.length, 0);
    assert.equal((await call('GET', '/vencimientos?filtro=retirados')).body.items.length, 1);
  });

  let pedidoId = 0;
  await t('R8 consolidar faltantes en UN pedido al intermediario único', async () => {
    const crit = (await call('GET', '/stock-critico')).body;
    assert.ok(crit.length >= 3);
    const r = await call('POST', '/pedidos/consolidar', {});
    assert.equal(r.status, 201, JSON.stringify(r.body));
    pedidoId = r.body.pedido.id_pedido;
    assert.equal(r.body.pedido.estado, 'EN_PREPARACION');
    assert.equal(r.body.pedido.intermediario_nombre, 'Distribuidora Natural');
    const maní = r.body.pedido.items.find((i: any) => i.nombre === 'Maní');
    approx(maní.cantidad_solicitada, 4.2, 'max(min×2−stock,1) = 3×2−1.8');
    const again = await call('POST', '/pedidos/consolidar', {});
    assert.equal(again.body.pedido.id_pedido, pedidoId, 'reutiliza el pedido en preparación');
    assert.equal(again.body.agregados, 0);
    const flag = (await call('GET', '/stock-critico')).body.every((p: any) => p.en_pedido);
    assert.equal(flag, true);
  });

  await t('R9 ciclo de vida estricto; PDF y Excel; edición bloqueada', async () => {
    assert.equal((await call('GET', `/pedidos/${pedidoId}/pdf`)).status, 409, 'no se exporta en preparación');
    const ed = await call('PUT', `/pedidos/${pedidoId}`, { items: [{ id_producto: prods['Maní'].id_producto, cantidad_solicitada: 6, observacion: 'Urgente' }, { id_producto: prods['Harina de almendras'].id_producto, cantidad_solicitada: 5 }] });
    assert.equal(ed.status, 200, JSON.stringify(ed.body));
    assert.equal(ed.body.items.length, 2);
    approx(ed.body.total_estimado, 6 * 2200 + 5 * 4800);
    let r = await call('POST', `/pedidos/${pedidoId}/avanzar`);
    assert.equal(r.body.estado, 'GENERADO');
    assert.equal((await call('POST', `/pedidos/${pedidoId}/avanzar`)).status, 409, 'GENERADO no avanza sin exportar');
    const pdf = await call('GET', `/pedidos/${pedidoId}/pdf`, undefined, true);
    assert.equal(pdf.status, 200);
    const buf = Buffer.from(await pdf.arrayBuffer());
    assert.equal(buf.subarray(0, 4).toString(), '%PDF');
    assert.ok(buf.length > 1500);
    assert.equal((await call('GET', `/pedidos/${pedidoId}`)).body.estado, 'EXPORTADO');
    const xl = await call('GET', `/pedidos/${pedidoId}/excel`, undefined, true);
    assert.equal(xl.status, 200);
    assert.equal(Buffer.from(await xl.arrayBuffer()).subarray(0, 2).toString(), 'PK');
    assert.equal((await call('PUT', `/pedidos/${pedidoId}`, { items: [{ id_producto: prods['Maní'].id_producto, cantidad_solicitada: 1 }] })).status, 409);
    for (const esperado of ['ENVIADO', 'EN_GESTION', 'ENTREGADO']) {
      r = await call('POST', `/pedidos/${pedidoId}/avanzar`);
      assert.equal(r.body.estado, esperado);
    }
    assert.deepEqual(r.body.historial.map((h: any) => h.estado), ['EN_PREPARACION', 'GENERADO', 'EXPORTADO', 'ENVIADO', 'EN_GESTION', 'ENTREGADO']);
  });

  await t('R10 ingreso de mercadería desde pedido ENTREGADO', async () => {
    const mani = await stock('Maní');
    const antesVenc = mani.vencimientos.length;
    const venc = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);
    const r = await call('POST', '/ingresos', {
      id_pedido: pedidoId, numero_comprobante: 'A-0001-123',
      items: [
        { id_producto: prods['Maní'].id_producto, cantidad: 6, precio_costo: 5000, fecha_vencimiento: venc },
        { id_producto: prods['Harina de almendras'].id_producto, cantidad: 5, precio_costo: 5000 },
      ],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const m = r.body.resumen.find((x: any) => x.nombre === 'Maní');
    assert.equal(m.precio_venta_nuevo, 7000, 'costo $5.000 con margen 40% → $7.000');
    approx(m.stock_nuevo, mani.stock_actual + 6);
    const m2 = await stock('Maní');
    assert.equal(m2.precio_costo, 5000);
    assert.equal(m2.precio_venta, 7000);
    assert.equal(m2.vencimientos.length, antesVenc + 1);
    assert.equal((await call('GET', `/pedidos/${pedidoId}`)).body.estado, 'FINALIZADO');
    assert.equal((await call('POST', '/ingresos', { id_pedido: pedidoId, items: [{ id_producto: prods['Maní'].id_producto, cantidad: 1, precio_costo: 1 }] })).status, 409);
    assert.equal((await call('POST', `/pedidos/${pedidoId}/avanzar`)).status, 409);
    const manual = await call('POST', '/ingresos', { numero_comprobante: 'M-1', items: [{ id_producto: prods['Maní'].id_producto, cantidad: 1, precio_costo: 5000, fecha_vencimiento: venc }] });
    assert.equal(manual.status, 201);
    assert.equal((await stock('Maní')).vencimientos.length, antesVenc + 1, 'misma fecha → suma la cantidad');
    assert.equal((await call('GET', `/productos/${prods['Maní'].id_producto}/ingresos`)).body.length, 2);
  });

  await t('duplicar pedido', async () => {
    const d = await call('POST', `/pedidos/${pedidoId}/duplicar`);
    assert.equal(d.status, 201, JSON.stringify(d.body));
    assert.equal(d.body.estado, 'EN_PREPARACION');
    assert.equal(d.body.items.length, 2);
    assert.equal((await call('POST', `/pedidos/${pedidoId}/duplicar`)).status, 409);
    const lista = await call('GET', '/pedidos?estado=EN_PREPARACION,GENERADO');
    assert.equal(lista.body.length, 1);
  });

  await t('R11 caja: resumen, arqueo, cierre único y anulación bloqueada', async () => {
    const r = await call('GET', '/caja/resumen');
    assert.ok(r.body.operaciones > 5);
    approx(r.body.digital, r.body.mercado_pago + r.body.tarjeta);
    approx(r.body.total_facturado, r.body.efectivo + r.body.digital);
    assert.equal(r.body.anuladas, 1);
    const mal = await call('POST', '/caja/cierre', { efectivo_contado: r.body.efectivo + 50 });
    assert.equal(mal.status, 201);
    approx(mal.body.cierre.diferencia, 50);
    assert.equal(mal.body.cuadrada, false);
    assert.equal((await call('POST', '/caja/cierre', { efectivo_contado: 1 })).status, 409);
    const nueva = await call('POST', '/ventas', { canal_pago: 'TARJETA', items: [{ id_producto: prods['Harina de arroz'].id_producto, cantidad: 1 }] });
    assert.equal((await call('POST', `/ventas/${nueva.body.venta.id_venta}/anular`)).status, 409, 'caja cerrada');
  });

  await t('reportes y dashboard', async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const desde = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const r = await call('GET', `/reportes?desde=${desde}&hasta=${hoy}`);
    assert.equal(r.status, 200);
    assert.ok(r.body.total_vendido > 0 && r.body.mas_vendidos.length > 0 && r.body.menor_rotacion.length > 0);
    approx(r.body.total_vendido, r.body.efectivo + r.body.mercado_pago + r.body.tarjeta);
    const d = (await call('GET', '/dashboard')).body;
    assert.equal(d.ventas_7_dias.length, 7);
    assert.ok(d.hoy.operaciones > 0 && d.hoy.caja_cerrada);
    assert.ok(Array.isArray(d.stock_critico.items) && Array.isArray(d.proximos_vencimientos.items));
  });

  await t('CU-09 importación de catálogo con errores', async () => {
    const filas = [
      { codigo: 'X1', producto: 'Pasas de uva', categoria: 'Frutos secos', precio: '5.500,50', modalidad: 'Granel' },
      { codigo: 'X2', producto: 'Té verde', categoria: 'Infusiones', precio: 2500, modalidad: 'unidad' },
      { codigo: 'X2', producto: 'Duplicado', categoria: 'Infusiones', precio: 100, modalidad: 'Unidad' },
      { codigo: 'X3', producto: '', categoria: 'Infusiones', precio: 'abc', modalidad: 'Caja' },
      { codigo: '7790001000011', producto: 'Almendras', categoria: 'Frutos secos', precio: 9000, modalidad: 'Granel' },
    ];
    const v = await call('POST', '/importacion/validar', { filas });
    assert.equal(v.body.correctos.length, 3);
    assert.equal(v.body.errores.length, 2);
    assert.equal(v.body.errores[0].fila, 4);
    assert.ok(v.body.errores[1].errores.length >= 3);
    const i = await call('POST', '/importacion/confirmar', { filas });
    assert.deepEqual([i.body.importados, i.body.creados, i.body.actualizados, i.body.con_errores], [3, 2, 1, 2]);
    approx((await call('GET', '/productos?buscar=Pasas')).body[0].precio_venta, 5500.5);
    assert.equal((await stock('Almendras')).precio_venta, 9000);
  });

  await t('productos: alta, precio sugerido, baja lógica y configuración', async () => {
    const c = await call('POST', '/productos', { nombre: 'Quinoa', categoria: 'Cereales', tipo_venta: 'GRANEL', precio_costo: 5000, porcentaje_margen: 40, stock_minimo: 2, stock_actual: 3 });
    assert.equal(c.status, 201);
    assert.equal(c.body.precio_venta, 7000);
    const up = await call('PUT', `/productos/${c.body.id_producto}`, { stock_minimo: 5, precio_venta: 7500 });
    assert.equal(up.body.precio_venta, 7500);
    assert.equal((await call('DELETE', `/productos/${c.body.id_producto}`)).status, 200);
    assert.equal((await call('GET', '/productos?buscar=Quinoa')).body.length, 0);
    assert.equal((await call('GET', '/productos?buscar=Quinoa&activo=todos')).body.length, 1);
    assert.equal((await call('PUT', '/configuracion', { margen_default: 'x' })).status, 400);
    assert.equal((await call('PUT', '/configuracion', { rol: 'admin' })).status, 400);
    assert.equal((await call('PUT', '/configuracion', { dias_alerta_vencimiento: 10, comercio_nombre: 'Dietética Prueba' })).status, 200);
    assert.equal((await call('GET', '/vencimientos?filtro=todos')).body.dias_alerta, 10);
  });

  await t('intermediario único, perfil y backup', async () => {
    const i = await call('GET', '/intermediario');
    assert.equal(i.body.intermediario.nombre, 'Distribuidora Natural');
    assert.ok(i.body.pedidos.length >= 4);
    assert.equal((await call('PUT', '/intermediario', { nombre: 'Distribuidora Natural', telefono_whatsapp: '5491100000000', email: 'no-es-email' })).status, 400);
    assert.equal((await call('PUT', '/intermediario', { nombre: 'Distribuidora Natural', contacto: 'Ana', telefono_whatsapp: '5491100000000', email: 'a@b.com' })).status, 200);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM intermediario_logistico')).rows[0].n, 1);
    assert.equal((await call('PUT', '/auth/perfil', { clave_actual: 'x', clave_nueva: '9999' })).status, 400);
    const p = await call('PUT', '/auth/perfil', { clave_actual: '1234', nombre: 'Local Centro' });
    assert.equal(p.body.usuario.nombre, 'Local Centro');
    const b = await call('GET', '/sistema/backup');
    assert.ok(b.body.producto.length >= 12);
  });

  console.log(`\n${pasados} grupos de pruebas OK`);
  server.close();
  await pool.end();
}

main().catch(async (e) => {
  console.error('\nFALLÓ LA PRUEBA:', e?.message ?? e);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
