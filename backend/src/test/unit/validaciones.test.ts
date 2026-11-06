import { describe, expect, it } from 'vitest';
import { parseModalidad, parseNum } from '../../services/importacion';
import { ventaSchema } from '../../services/ventas';

/** Validación de la venta (esquema Zod usado por POST /api/ventas). */
describe('ventaSchema — validación de entrada', () => {
  const ok = { canal_pago: 'EFECTIVO', monto_recibido: 5000, items: [{ id_producto: 1, cantidad: 2 }] };

  it('acepta una venta válida', () => {
    expect(ventaSchema.safeParse(ok).success).toBe(true);
  });
  it('rechaza una venta sin productos', () => {
    const r = ventaSchema.safeParse({ ...ok, items: [] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('La venta no tiene productos');
  });
  it('rechaza un medio de pago inexistente', () => {
    expect(ventaSchema.safeParse({ ...ok, canal_pago: 'BITCOIN' }).success).toBe(false);
  });
  it('rechaza cantidades en cero o negativas', () => {
    expect(ventaSchema.safeParse({ ...ok, items: [{ id_producto: 1, cantidad: 0 }] }).success).toBe(false);
    expect(ventaSchema.safeParse({ ...ok, items: [{ id_producto: 1, cantidad: -1 }] }).success).toBe(false);
  });
});

/** Importación de catálogo — normalización de números y modalidad escritos a mano en Excel. */
describe('importación — parseNum', () => {
  it('interpreta el formato argentino 8.500,50', () => {
    expect(parseNum('8.500,50')).toBe(8500.5);
  });
  it('interpreta coma decimal y símbolo $', () => {
    expect(parseNum('$ 8500,5')).toBe(8500.5);
  });
  it('acepta números ya numéricos', () => {
    expect(parseNum(1200)).toBe(1200);
  });
  it('devuelve null ante vacío o texto no numérico', () => {
    expect(parseNum('')).toBeNull();
    expect(parseNum(undefined)).toBeNull();
    expect(parseNum('abc')).toBeNull();
  });
});

describe('importación — parseModalidad', () => {
  it('reconoce sinónimos de UNIDAD y GRANEL sin importar mayúsculas', () => {
    expect(parseModalidad('Unidad')).toBe('UNIDAD');
    expect(parseModalidad('KG')).toBe('GRANEL');
    expect(parseModalidad('a granel')).toBe('GRANEL');
  });
  it('devuelve null si no es una modalidad válida', () => {
    expect(parseModalidad('caja')).toBeNull();
    expect(parseModalidad('')).toBeNull();
  });
});
