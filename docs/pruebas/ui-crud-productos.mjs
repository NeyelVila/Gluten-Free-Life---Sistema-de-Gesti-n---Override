import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const OUT = process.env.OUT || './capturas-ui'; fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:4000';
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL}" -P pager=off -c "${q}"`).toString().trim();
const log = [];
const L = (s) => { log.push(s); console.log(s); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' });
const page = await ctx.newPage();
const shot = async (n) => { const h = await page.addStyleTag({ content: '.fixed.bottom-4.right-4{visibility:hidden!important}' }); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${n}.png` }); await h.evaluate((e) => e.remove()); };
const shotToast = async (n) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${n}.png` }); };
const COD = '7790009999991', NOM = 'Alfajor de maicena sin TACC';

await page.goto(BASE + '/login');
await page.getByPlaceholder('admin').fill('admin'); await page.getByPlaceholder('••••').fill('1234');
await page.getByRole('button', { name: 'Ingresar' }).click();
await page.getByText('Total recaudado').first().waitFor();
await page.getByRole('link', { name: 'Productos' }).first().click();
await page.getByRole('button', { name: /Nuevo producto/ }).waitFor();
L('ANTES  → ' + sql(`select count(*) as productos_con_codigo_${COD} from producto where codigo_barra='${COD}'`).split('\n').slice(2,3).join(''));

// ---- CREATE
await page.getByRole('button', { name: /Nuevo producto/ }).click();
await page.getByLabel('Nombre').fill(NOM);
await page.getByLabel('Código de barras').fill(COD);
await page.getByLabel('Categoría').fill('Galletitas');
await page.getByLabel(/Stock mínimo/).fill('5');
await page.getByLabel('Precio de costo').fill('800');
await page.getByLabel(/Margen comercial/).fill('50');
await page.getByLabel(/Stock inicial/).fill('20');
await shot('C1-crear-formulario');
await page.getByRole('button', { name: 'Guardar' }).click();
await page.getByText('Producto creado', { exact: false }).first().waitFor({ timeout: 6000 }).catch(() => {});
await shotToast('C2-crear-aviso');
await page.waitForTimeout(800);
L('\n[CREATE] fila en PostgreSQL:\n' + sql(`select id_producto id, nombre, stock_actual stock, precio_costo costo, porcentaje_margen margen, precio_venta precio, activo from producto where codigo_barra='${COD}'`));

// ---- READ (lista de Productos e Inventario)
await page.getByPlaceholder('Buscar por nombre o código…').fill('Alfajor de maicena');
await page.waitForTimeout(900); await shot('R1-leer-productos');
await page.getByRole('link', { name: 'Inventario' }).first().click();
await page.getByPlaceholder(/Buscar/).first().fill('maicena');
await page.waitForTimeout(1000); await shot('R2-leer-inventario');
L('\n[READ] el producto se visualiza en Productos e Inventario (ver capturas R1 y R2).');

// ---- UPDATE
await page.getByRole('link', { name: 'Productos' }).first().click();
await page.getByPlaceholder('Buscar por nombre o código…').fill('Alfajor de maicena');
await page.waitForTimeout(900);
await page.getByRole('button', { name: /Editar/ }).first().click();
await page.getByLabel(/Margen comercial/).fill('60');
await page.waitForTimeout(400); await shot('U1-editar-formulario');
await page.getByRole('button', { name: 'Guardar' }).click();
await page.waitForTimeout(900); await shotToast('U2-editar-aviso');
await page.waitForTimeout(700);
L('\n[UPDATE] margen 50 → 60 (precio sugerido 800 × 1,60). Fila en PostgreSQL:\n' + sql(`select id_producto id, nombre, precio_costo costo, porcentaje_margen margen, precio_venta precio from producto where codigo_barra='${COD}'`));

// ---- VALIDACIONES
await page.getByRole('button', { name: /Nuevo producto/ }).click();
await page.getByLabel('Categoría').fill('Galletitas');
await page.getByRole('button', { name: 'Guardar' }).click();
await page.waitForTimeout(500); await shot('V1-validacion-nombre-vacio');
await page.getByLabel('Nombre').fill('Otro alfajor');
await page.getByLabel('Código de barras').fill(COD);
await page.getByLabel('Precio de costo').fill('500');
await page.getByRole('button', { name: 'Guardar' }).click();
await page.waitForTimeout(900); await shotToast('V2-validacion-duplicado');
L('\n[VALIDACIÓN] código duplicado rechazado. Registros con ese código en PostgreSQL:\n' + sql(`select count(*) as cantidad from producto where codigo_barra='${COD}'`));
await page.getByRole('button', { name: 'Cancelar' }).click();

// ---- DELETE (baja lógica con confirmación)
await page.waitForTimeout(500);
await page.getByLabel(/Dar de baja Alfajor/).click();
await page.waitForTimeout(500); await shot('D1-baja-confirmacion');
await page.getByRole('button', { name: 'Dar de baja' }).last().click();
await page.waitForTimeout(900); await shotToast('D2-baja-aviso');
await page.waitForTimeout(700);
L('\n[DELETE] baja lógica confirmada. Fila en PostgreSQL (el historial se conserva):\n' + sql(`select id_producto id, nombre, activo from producto where codigo_barra='${COD}'`));
await page.getByPlaceholder('Buscar por nombre o código…').fill('Alfajor de maicena');
await page.waitForTimeout(900); await shot('D3-baja-ya-no-aparece');
fs.writeFileSync(`${OUT}/crud-log.txt`, log.join('\n'));
await browser.close();
