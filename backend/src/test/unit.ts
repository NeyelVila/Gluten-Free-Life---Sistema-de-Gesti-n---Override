import assert from 'node:assert/strict';
import { actualizarPrecioVenta, estadoStock, evaluarStockCritico, verificarCaducidad } from '../services/dominio';
import { cantidadSugerida } from '../services/pedidos';

let pasadas = 0;

function test(nombre: string, fn: () => void) {
  fn();
  pasadas++;
  console.log(`  ✓ ${nombre}`);
}

console.log('Pruebas unitarias');

test('calcula el precio de venta aplicando margen y redondeando al peso', () => {
  assert.equal(actualizarPrecioVenta(5000, 40), 7000);
  assert.equal(actualizarPrecioVenta(1250, 33), 1663);
});

test('clasifica correctamente el stock crítico, bajo y normal', () => {
  assert.equal(evaluarStockCritico({ stock_actual: 2, stock_minimo: 2 }), true);
  assert.equal(estadoStock({ stock_actual: 3, stock_minimo: 2 }, 2), 'BAJO');
  assert.equal(estadoStock({ stock_actual: 10, stock_minimo: 2 }, 2), 'NORMAL');
});

test('detecta vencimientos anteriores al día actual', () => {
  assert.equal(verificarCaducidad('2026-11-05', '2026-11-06'), true);
  assert.equal(verificarCaducidad('2026-11-06', '2026-11-06'), false);
  assert.equal(verificarCaducidad('2026-11-07', '2026-11-06'), false);
});

test('calcula la cantidad sugerida y redondea unidades hacia arriba', () => {
  assert.equal(cantidadSugerida(5, 3, 'UNIDAD'), 7);
  assert.equal(cantidadSugerida(5, 3.75, 'GRANEL'), 6.25);
  assert.equal(cantidadSugerida(1, 10, 'UNIDAD'), 1);
});

console.log(`\n${pasadas} pruebas unitarias OK`);
