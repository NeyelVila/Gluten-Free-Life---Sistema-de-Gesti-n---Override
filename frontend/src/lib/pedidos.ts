import type { EstadoPedido, TipoVenta } from './types';
import { money, num, unidadDe } from './format';

export interface PedidoItem {
  id_det_pedido: number;
  id_producto: number;
  cantidad_solicitada: number;
  observacion: string | null;
  nombre: string;
  codigo_barra: string | null;
  tipo_venta: TipoVenta;
  stock_actual: number;
  stock_minimo: number;
  precio_costo: number;
  subtotal_estimado: number;
}

export interface Pedido {
  id_pedido: number;
  estado: EstadoPedido;
  fecha_generacion: string;
  archivo_exportado: string | null;
  usuario_nombre: string;
  id_intermediario: number;
  intermediario_nombre: string;
  intermediario_contacto: string | null;
  telefono_whatsapp: string | null;
  intermediario_email: string | null;
  items: PedidoItem[];
  historial: { estado: EstadoPedido; fecha_hora: string }[];
  total_estimado: number;
}

export interface PedidoResumen {
  id_pedido: number;
  estado: EstadoPedido;
  fecha_generacion: string;
  archivo_exportado: string | null;
  usuario_nombre?: string;
  productos: number;
  total_estimado: number;
}

export const numPedido = (id: number) => String(id).padStart(4, '0');

/** Texto prearmado para WhatsApp / correo. */
export function mensajePedido(p: Pedido, comercio: string, conTotal = true): string {
  const saludo = p.intermediario_contacto ? `Hola ${p.intermediario_contacto.split(' ')[0]}!` : 'Hola!';
  const lineas = p.items.map((i) => `• ${i.nombre}: ${num(i.cantidad_solicitada)} ${unidadDe(i.tipo_venta)}${i.observacion ? ` (${i.observacion})` : ''}`);
  return [
    `${saludo} Te paso el pedido N° ${numPedido(p.id_pedido)} de ${comercio}:`,
    '',
    ...lineas,
    '',
    conTotal ? `Total estimado: ${money(p.total_estimado)}` : '',
    'Te adjunto el detalle. ¡Gracias!',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

export const soloDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
