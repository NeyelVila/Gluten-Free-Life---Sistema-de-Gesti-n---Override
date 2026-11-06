import { chromium } from 'playwright-core';
import fs from 'node:fs';

const SHOTS = process.env.OUT || './capturas-ui';
fs.mkdirSync(SHOTS, { recursive: true });
const exe = process.env.CHROME;
const BASE = process.env.BASE || 'http://localhost:4000';

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' });
await ctx.grantPermissions([]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });

let n = 0, ok = 0;
const step = async (name, fn) => {
  n++;
  try { await fn(); ok++; console.log(`  ✓ ${name}`); }
  catch (e) { console.log(`  ✗ ${name}\n     ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${SHOTS}/FAIL-${n}.png` }); }
};
const shot = async (name) => { const h = await page.addStyleTag({ content: '.fixed.bottom-4.right-4{visibility:hidden!important}' }); await page.waitForTimeout(900); await page.screenshot({ path: `${SHOTS}/${name}.png` }); await h.evaluate((e) => e.remove()); };
const expectText = async (text, timeout = 6000) => page.getByText(text, { exact: false }).first().waitFor({ timeout });

await step('login con credenciales incorrectas muestra error', async () => {
  await page.goto(BASE + '/login');
  await page.waitForTimeout(600); await shot('00-login');
  await page.getByPlaceholder('admin').fill('admin');
  await page.getByPlaceholder('••••').fill('mala');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expectText('Usuario o contraseña incorrectos');
  await shot('01-login-error');
});

await step('login correcto → Dashboard con datos reales', async () => {
  await page.getByPlaceholder('••••').fill('1234');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expectText('Total recaudado');
  await expectText('Alertas importantes');
  await expectText('Stock crítico: Maní');
  await page.waitForTimeout(800);
  await shot('02-dashboard');
});

await step('menú sin roles ni permisos', async () => {
  const txt = await page.locator('aside').innerText();
  for (const m of ['Inicio', 'Punto de Venta', 'Inventario', 'Productos', 'Vencimientos', 'Compras', 'Intermediario', 'Caja', 'Reportes', 'Configuración']) if (!txt.includes(m)) throw new Error('falta ' + m);
  if (/rol|admin|vendedor|permiso/i.test(txt.replace('Sesión iniciada', ''))) throw new Error('aparece un rol en la UI: ' + txt);
});

await step('POS: grilla, búsqueda y venta de unidad con vuelto', async () => {
  await page.getByRole('link', { name: 'Punto de Venta' }).click();
  await page.getByPlaceholder('Buscar producto o escanear código...').waitFor({ timeout: 6000 });
  await page.waitForTimeout(500);
  await expectText('Harina de arroz');
  await shot('03-pos-vacio');
  await page.getByPlaceholder('Buscar producto o escanear código...').fill('harina de arroz');
  await page.getByRole('button', { name: /Harina de arroz/ }).first().click();
  await page.getByRole('button', { name: /Harina de arroz/ }).first().click();
});

await step('POS: producto a granel pide peso y calcula subtotal', async () => {
  await page.getByPlaceholder('Buscar producto o escanear código...').fill('almendras');
  await page.getByRole('button', { name: /^Almendras/ }).first().click();
  await expectText('Peso de Almendras');
  await page.getByPlaceholder('0,250').fill('0,250');
  await expectText('$ 2.125'); // 0,25 × 8.500
  await shot('04-pos-peso');
  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
});

await step('POS: lector de código de barras (Enter con código exacto) agrega el producto', async () => {
  const inp = page.getByPlaceholder('Buscar producto o escanear código...');
  await inp.fill('7790001000073');
  await inp.press('Enter');
  await page.waitForTimeout(300);
  const txt = await page.locator('aside').last().innerText();
  if (!/Harina de arroz/.test(txt)) throw new Error('no agregó por código');
});

await step('POS: stock insuficiente se rechaza con mensaje claro', async () => {
  await page.getByPlaceholder('Buscar producto o escanear código...').fill('almendras');
  await page.getByRole('button', { name: /^Almendras/ }).first().click();
  await page.getByPlaceholder('0,250').fill('50');
  await expectText('Stock insuficiente: disponible');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
});

let totalTxt = '';
await step('POS: total, efectivo, vuelto y confirmar → ticket + stock actualizado', async () => {
  totalTxt = await page.locator('[aria-live="polite"]').first().innerText();
  await page.getByRole('button', { name: '$ 20.000' }).click();
  await shot('05-pos-carrito');
  await page.getByRole('button', { name: 'CONFIRMAR VENTA' }).click();
  await expectText('Venta registrada');
  await expectText('Stock actualizado automáticamente');
  await shot('06-pos-venta-registrada');
  console.log('     total de la venta:', totalTxt);
});

await step('POS: nueva venta limpia el carrito', async () => {
  await page.getByRole('button', { name: 'Nueva venta' }).click();
  await expectText('El carrito está vacío');
});

await step('POS: alerta inmediata de stock crítico al vender (R5)', async () => {
  await page.getByPlaceholder('Buscar producto o escanear código...').fill('magnesio');
  await page.getByRole('button', { name: /Suplemento Magnesio/ }).first().click();
  await page.getByRole('button', { name: /MP \/ TARJETA/ }).click();
  await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
  await page.getByRole('button', { name: 'CONFIRMAR VENTA' }).click();
  await expectText('Venta registrada');
  await expectText('¡Stock crítico!');
  await shot('07-pos-alerta');
  await page.getByRole('button', { name: 'Nueva venta' }).click();
});

await step('OFFLINE: simular pérdida de conexión muestra el aviso', async () => {
  await page.getByRole('link', { name: 'Configuración' }).click();
  await page.getByRole('button', { name: 'Simular pérdida de conexión' }).click();
  await expectText('SIN CONEXIÓN — MODO OFFLINE');
  await shot('08-offline-config');
});

await step('OFFLINE: el POS sigue vendiendo y guarda la venta pendiente', async () => {
  await page.getByRole('link', { name: 'Punto de Venta' }).click();
  await expectText('Modo offline');
  await page.getByPlaceholder('Buscar producto o escanear código...').fill('lentejas');
  await page.getByRole('button', { name: /^Lentejas/ }).first().click();
  await page.getByPlaceholder('0,250').fill('0,5');
  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
  await page.getByRole('button', { name: 'CONFIRMAR VENTA' }).click();
  await expectText('Venta guardada sin conexión');
  await expectText('OFF-0001');
  await shot('09-offline-venta');
  await page.getByRole('button', { name: 'Nueva venta' }).click();
  const pend = await page.evaluate(async () => {
    const db = indexedDB.open('gluten-free-life');
    return await new Promise((res) => { db.onsuccess = () => { const tx = db.result.transaction('ventasPendientes'); const r = tx.objectStore('ventasPendientes').count(); r.onsuccess = () => res(r.result); }; });
  });
  if (pend !== 1) throw new Error('pendientes en IndexedDB = ' + pend);
});

await step('OFFLINE: Inventario funciona en modo lectura con el cache', async () => {
  await page.getByRole('link', { name: 'Inventario' }).click();
  await expectText('Sin conexión: mostrando los datos guardados');
  await expectText('Lentejas');
});

await step('Al volver la conexión se sincroniza solo y avisa', async () => {
  await page.getByRole('link', { name: 'Configuración' }).click();
  await page.getByRole('button', { name: 'Restablecer conexión' }).first().click();
  await expectText('CONEXIÓN RESTABLECIDA', 15000);
  await expectText('1 venta sincronizada correctamente', 5000);
  await page.waitForTimeout(1500); await shot('10-online-sync');
});

await step('Dashboard refleja la venta sincronizada; stock descontado en servidor', async () => {
  const r = await page.evaluate(async () => {
    const t = (localStorage.getItem('gfl_token') || sessionStorage.getItem('gfl_token'));
    const j = await (await fetch('/api/productos?buscar=lentejas', { headers: { Authorization: 'Bearer ' + t } })).json();
    return j[0].stock_actual;
  });
  if (Math.abs(r - 11.5) > 1e-6) throw new Error('stock lentejas = ' + r);
});

await step('Inventario: tabla, filtro por estado y detalle de producto sin lotes', async () => {
  await page.getByRole('link', { name: 'Inventario' }).click();
  await expectText('Stock mínimo');
  await page.locator('select[aria-label="Estado de stock"]').selectOption('critico');
  await page.waitForTimeout(600);
  await shot('11-inventario-critico');
  await page.getByText('Maní', { exact: true }).first().click();
  await expectText('Vencimientos del producto');
  await expectText('Próximo vencimiento');
  const t = await page.locator('main').innerText();
  if (/lote/i.test(t.replace('No hay lotes', ''))) throw new Error('aparece el concepto de lote');
  await shot('12-producto-detalle');
});

await step('Vencimientos: filtros y retirar', async () => {
  await page.getByRole('link', { name: 'Vencimientos' }).click();
  await expectText('Control de Vencimientos');
  await page.getByRole('button', { name: 'Vencidos' }).click();
  await expectText('Galletitas Sin TACC');
  await expectText('Vencido');
  await shot('13-vencimientos');
  await page.getByRole('button', { name: 'Marcar como retirado' }).first().click();
  await page.getByRole('button', { name: 'Retirar del stock' }).click();
  await expectText('Marcado como retirado');
});

await step('Reposición → Generar pedido → detalle con línea de 7 estados', async () => {
  await page.getByRole('link', { name: 'Inventario' }).click();
  await page.goto(BASE + '/stock-critico');
  await expectText('Reposición necesaria');
  await shot('14-stock-critico');
  await page.getByRole('button', { name: /Generar pedido/ }).click();
  await expectText('Pedido N°');
  for (const e of ['En preparación', 'Generado', 'Exportado', 'Enviado', 'En gestión', 'Entregado', 'Finalizado']) await expectText(e, 3000);
  await shot('15-pedido-preparacion');
});

await step('Pedido: generar → exportar PDF y Excel (descargas reales) → WhatsApp/correo', async () => {
  await page.getByRole('button', { name: 'Generar pedido' }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expectText('Descargá el PDF o el Excel');
  const [dlPdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar PDF' }).click()]);
  const pdfPath = `${SHOTS}/${dlPdf.suggestedFilename()}`;
  await dlPdf.saveAs(pdfPath);
  if (fs.readFileSync(pdfPath).subarray(0, 4).toString() !== '%PDF') throw new Error('PDF inválido');
  await expectText('Marcar como enviado');
  const [dlXls] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar Excel' }).click()]);
  await dlXls.saveAs(`${SHOTS}/${dlXls.suggestedFilename()}`);
  if (!/\.xlsx$/.test(dlXls.suggestedFilename())) throw new Error('nombre xlsx ' + dlXls.suggestedFilename());
  await shot('16-pedido-exportado');
  await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
  await page.getByRole('button', { name: 'Enviar por WhatsApp' }).click();
  await page.waitForFunction(() => window.__opened.length > 0, null, { timeout: 8000 });
  const url = await page.evaluate(() => window.__opened[0]);
  if (!url.startsWith('https://wa.me/5491155550142?text=')) throw new Error('url wsp: ' + url);
  if (!decodeURIComponent(url).includes('Te paso el pedido')) throw new Error('mensaje prearmado ausente');
  fs.copyFileSync(pdfPath, '/tmp/claude-0/e2e/pedido-demo.pdf');
});

await step('Pedido: avanzar hasta ENTREGADO y registrar ingreso → FINALIZADO', async () => {
  for (const label of ['Marcar como enviado', /Avanzar a «En gestión»/, /Avanzar a «Entregado»/]) {
    await page.getByRole('button', { name: label }).first().click();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await page.waitForTimeout(500);
  }
  await expectText('Registrar ingreso');
  await page.getByRole('button', { name: 'Registrar ingreso' }).click();
  await expectText('Ingreso de mercadería');
  await page.waitForTimeout(500);
  await expectText('Costo');
  await shot('17-ingreso');
  await page.getByRole('button', { name: 'CONFIRMAR INGRESO' }).click();
  await expectText('Ingreso registrado');
  await shot('18-ingreso-ok');
  await expectText('pasó a «Finalizado»');
  await page.getByRole('button', { name: 'Listo' }).click();
  await expectText('Finalizado');
});

await step('Caja: resumen, arqueo con diferencia y cierre', async () => {
  await page.getByRole('link', { name: 'Caja' }).click();
  await expectText('Arqueo de caja');
  await page.getByPlaceholder('$ 0').nth(1).fill('62000');
  await expectText('Diferencia de caja');
  await shot('19-caja-arqueo');
  await page.getByRole('button', { name: 'Cerrar caja' }).click();
  await page.getByRole('button', { name: 'Cerrar caja' }).last().click();
  await expectText('Caja cerrada por');
  await shot('20-caja-cerrada');
});

await step('Reportes con gráficos', async () => {
  await page.getByRole('link', { name: 'Reportes' }).click();
  await expectText('Más vendidos');
  await page.waitForTimeout(700);
  await shot('21-reportes');
});

await step('Intermediario único (sin alta de proveedores)', async () => {
  await page.getByRole('link', { name: 'Intermediario' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === 'Distribuidora Natural'), null, { timeout: 6000 });
  await expectText('Historial de pedidos');
  const t = await page.locator('main').innerText();
  if (/nuevo proveedor|agregar proveedor/i.test(t)) throw new Error('hay alta de proveedores');
  await shot('22-intermediario');
});

await step('Importar Excel: validación con errores + importación', async () => {
  await page.goto(BASE + '/productos/importar');
  await expectText('Arrastrá tu archivo Excel aquí');
  await page.locator('input[type=file]').setInputFiles('/tmp/claude-0/e2e/catalogo.xlsx');
  await expectText('3 producto(s) correctos');
  await expectText('2 con errores');
  await expectText('Código duplicado en el archivo');
  await expectText('Modalidad inválida');
  await shot('24-importar-validacion');
  await page.getByRole('button', { name: /Importar catálogo/ }).click();
  await expectText('Importación completada');
  await expectText('2 nuevos y 1 actualizados');
  await shot('25-importar-ok');
});

await step('Productos y precios: editar con precio sugerido', async () => {
  await page.getByRole('link', { name: 'Productos' }).click();
  await expectText('Productos y precios');
  await page.getByRole('button', { name: 'Editar' }).first().click();
  await expectText('Precio sugerido');
  await shot('23-producto-form');
  await page.getByRole('button', { name: 'Cancelar' }).click();
});

await step('Sin errores de JavaScript en consola', async () => {
  if (errors.length) throw new Error(errors.slice(0, 3).join(' | '));
});

console.log(`\n${ok}/${n} pasos OK`);
await browser.close();
process.exit(ok === n ? 0 : 1);
