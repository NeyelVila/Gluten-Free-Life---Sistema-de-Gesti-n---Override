import { describe, expect, it } from 'vitest';
import { actualizarPrecioVenta, estadoStock, evaluarStockCritico, verificarCaducidad } from '../../services/dominio';

/** R2 — precio sugerido = costo × (1 + margen/100), redondeado al peso. */
describe('Producto.actualizarPrecioVenta (R2)', () => {
  it('aplica el margen sobre el costo', () => {
    expect(actualizarPrecioVenta(1000, 40)).toBe(1400);
  });
  it('redondea al peso más cercano', () => {
    // 1234,5 × 1,35 = 1666,575 → 1667
    expect(actualizarPrecioVenta(1234.5, 35)).toBe(1667);
  });
  it('con margen 0 el precio es el costo', () => {
    expect(actualizarPrecioVenta(850, 0)).toBe(850);
  });
  it('con costo 0 devuelve 0', () => {
    expect(actualizarPrecioVenta(0, 40)).toBe(0);
  });
});

/** R1 — stock crítico cuando stock_actual <= stock_minimo. */
describe('Producto.evaluarStockCritico (R1)', () => {
  it('es crítico cuando el stock es menor al mínimo', () => {
    expect(evaluarStockCritico({ stock_actual: 2, stock_minimo: 5 })).toBe(true);
  });
  it('es crítico cuando el stock es IGUAL al mínimo (borde)', () => {
    expect(evaluarStockCritico({ stock_actual: 5, stock_minimo: 5 })).toBe(true);
  });
  it('no es crítico cuando supera el mínimo', () => {
    expect(evaluarStockCritico({ stock_actual: 6, stock_minimo: 5 })).toBe(false);
  });
  it('estadoStock distingue CRITICO, BAJO y NORMAL', () => {
    expect(estadoStock({ stock_actual: 5, stock_minimo: 5 }, 3)).toBe('CRITICO');
    expect(estadoStock({ stock_actual: 7, stock_minimo: 5 }, 3)).toBe('BAJO');
    expect(estadoStock({ stock_actual: 9, stock_minimo: 5 }, 3)).toBe('NORMAL');
  });
});

/** R6 — un vencimiento está vencido solo si su fecha es anterior a hoy. */
describe('VencimientoProducto.verificarCaducidad (R6)', () => {
  it('una fecha pasada está vencida', () => {
    expect(verificarCaducidad('2026-11-04', '2026-11-05')).toBe(true);
  });
  it('vencer hoy todavía NO es vencido (borde)', () => {
    expect(verificarCaducidad('2026-11-05', '2026-11-05')).toBe(false);
  });
  it('una fecha futura no está vencida', () => {
    expect(verificarCaducidad('2026-12-01', '2026-11-05')).toBe(false);
  });
});
