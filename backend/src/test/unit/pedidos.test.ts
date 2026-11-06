import { describe, expect, it } from 'vitest';
import { cantidadSugerida } from '../../services/pedidos';

/** R8 — cantidad sugerida = max(stock_minimo × 2 − stock_actual, 1); unidades enteras. */
describe('cantidadSugerida (R8)', () => {
  it('repone hasta el doble del mínimo', () => {
    expect(cantidadSugerida(10, 3, 'UNIDAD')).toBe(17);
  });
  it('nunca sugiere menos de 1', () => {
    expect(cantidadSugerida(5, 40, 'UNIDAD')).toBe(1);
  });
  it('en productos por unidad redondea hacia arriba a un entero', () => {
    expect(cantidadSugerida(2.5, 1, 'UNIDAD')).toBe(4);
  });
  it('en granel conserva hasta 3 decimales', () => {
    expect(cantidadSugerida(2.5, 1.2345, 'GRANEL')).toBe(3.766);
  });
});
