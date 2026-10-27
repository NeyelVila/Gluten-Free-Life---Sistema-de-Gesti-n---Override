import { z } from 'zod';
import { Db, getConfig, q, tx, num } from '../db';
import { actualizarPrecioVenta } from './dominio';

export const importSchema = z.object({
  filas: z
    .array(
      z.object({
        codigo: z.any().optional(),
        producto: z.any().optional(),
        categoria: z.any().optional(),
        precio: z.any().optional(),
        modalidad: z.any().optional(),
        costo: z.any().optional(),
        stock: z.any().optional(),
        stock_minimo: z.any().optional(),
      })
    )
    .max(5000, 'Máximo 5000 filas por importación'),
});

const str = (v: unknown) => (v == null ? '' : String(v).trim());
const parseNum = (v: unknown): number | null => {
  if (v == null || String(v).trim() === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[$\s]/g, '');
  // Formato es-AR: 8.500,50  /  8500,50  /  8500.50
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const parseModalidad = (v: unknown): 'UNIDAD' | 'GRANEL' | null => {
  const s = str(v).toLowerCase();
  if (['unidad', 'u', 'un', 'unid', 'cerrado'].includes(s)) return 'UNIDAD';
  if (['granel', 'kg', 'peso', 'a granel'].includes(s)) return 'GRANEL';
  return null;
};

export interface FilaOk {
  fila: number;
  codigo: string;
  producto: string;
  categoria: string;
  precio: number;
  modalidad: 'UNIDAD' | 'GRANEL';
  costo: number | null;
  stock: number | null;
  stock_minimo: number | null;
  accion: 'crear' | 'actualizar';
}
export interface FilaError {
  fila: number;
  codigo: string;
  producto: string;
  errores: string[];
}

/** CU-09: valida el catálogo antes de importarlo. `fila` es el número de fila en el Excel (encabezado = 1). */
export async function validarCatalogo(db: Db, filas: any[]) {
  const existentes = new Set(
    (await q<{ codigo_barra: string }>('SELECT codigo_barra FROM producto WHERE codigo_barra IS NOT NULL', [], db)).map((r) => r.codigo_barra)
  );
  const vistos = new Map<string, number>();
  const ok: FilaOk[] = [];
  const errores: FilaError[] = [];

  filas.forEach((f, i) => {
    const fila = i + 2;
    const errs: string[] = [];
    const codigo = str(f.codigo);
    const producto = str(f.producto);
    const categoria = str(f.categoria);
    const precio = parseNum(f.precio);
    const modalidad = parseModalidad(f.modalidad);
    const costo = parseNum(f.costo);
    const stock = parseNum(f.stock);
    const stockMin = parseNum(f.stock_minimo);

    if (!codigo) errs.push('Código vacío');
    if (!producto) errs.push('Nombre de producto vacío');
    if (!categoria) errs.push('Categoría vacía');
    if (precio == null) errs.push('Precio vacío o no numérico');
    else if (precio <= 0) errs.push('El precio debe ser mayor a 0');
    if (!str(f.modalidad)) errs.push('Modalidad vacía (usar Unidad o Granel)');
    else if (!modalidad) errs.push(`Modalidad inválida "${str(f.modalidad)}" (usar Unidad o Granel)`);
    if (f.costo != null && str(f.costo) !== '' && (costo == null || costo < 0)) errs.push('Costo inválido');
    if (f.stock != null && str(f.stock) !== '' && (stock == null || stock < 0)) errs.push('Stock inválido');
    if (f.stock_minimo != null && str(f.stock_minimo) !== '' && (stockMin == null || stockMin < 0)) errs.push('Stock mínimo inválido');
    if (codigo) {
      const prev = vistos.get(codigo);
      if (prev) errs.push(`Código duplicado en el archivo (también en la fila ${prev})`);
      else vistos.set(codigo, fila);
    }
    if (errs.length) errores.push({ fila, codigo, producto, errores: errs });
    else
      ok.push({
        fila,
        codigo,
        producto,
        categoria,
        precio: precio!,
        modalidad: modalidad!,
        costo,
        stock,
        stock_minimo: stockMin,
        accion: existentes.has(codigo) ? 'actualizar' : 'crear',
      });
  });
  return { correctos: ok, errores, total: filas.length };
}

/** Importa solo las filas correctas (crea o actualiza por código de barras). */
export async function importarCatalogo(filas: any[]) {
  return tx(async (c) => {
    const v = await validarCatalogo(c, filas);
    const cfg = await getConfig(c);
    const margenDef = num(cfg.margen_default, 40);
    const minDef = num(cfg.stock_minimo_default, 2);
    let creados = 0;
    let actualizados = 0;
    for (const f of v.correctos) {
      // Si no viene costo se deriva del precio de venta y el margen por defecto.
      const costo = f.costo ?? Math.round(f.precio / (1 + margenDef / 100));
      const margen = costo > 0 ? Math.round(((f.precio / costo - 1) * 100) * 100) / 100 : margenDef;
      const r = await q<any>(
        `INSERT INTO producto (codigo_barra, nombre, categoria, tipo_venta, stock_actual, stock_minimo, precio_costo, porcentaje_margen, precio_venta)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (codigo_barra) DO UPDATE SET
           nombre=EXCLUDED.nombre, categoria=EXCLUDED.categoria, tipo_venta=EXCLUDED.tipo_venta,
           precio_venta=EXCLUDED.precio_venta, activo=true,
           precio_costo = CASE WHEN $10 THEN EXCLUDED.precio_costo ELSE producto.precio_costo END,
           porcentaje_margen = CASE WHEN $10 THEN EXCLUDED.porcentaje_margen ELSE producto.porcentaje_margen END,
           stock_actual = CASE WHEN $11 THEN EXCLUDED.stock_actual ELSE producto.stock_actual END,
           stock_minimo = CASE WHEN $12 THEN EXCLUDED.stock_minimo ELSE producto.stock_minimo END
         RETURNING (xmax = 0) AS insertado`,
        [
          f.codigo, f.producto, f.categoria, f.modalidad, f.stock ?? 0, f.stock_minimo ?? minDef,
          Math.min(costo, 9999999999), Math.min(Math.max(margen, 0), 999), f.precio,
          f.costo != null, f.stock != null, f.stock_minimo != null,
        ],
        c
      );
      if (r[0].insertado) creados++;
      else actualizados++;
    }
    return { importados: v.correctos.length, creados, actualizados, con_errores: v.errores.length, errores: v.errores };
  });
}

export { actualizarPrecioVenta };
