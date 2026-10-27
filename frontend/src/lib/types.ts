export type TipoVenta = 'UNIDAD' | 'GRANEL';
export type CanalPago = 'EFECTIVO' | 'MERCADO_PAGO' | 'TARJETA';
export type EstadoStock = 'CRITICO' | 'BAJO' | 'NORMAL';
export type EstadoPedido =
  | 'EN_PREPARACION' | 'GENERADO' | 'EXPORTADO' | 'ENVIADO' | 'EN_GESTION' | 'ENTREGADO' | 'FINALIZADO';

export const ESTADOS_PEDIDO: EstadoPedido[] = [
  'EN_PREPARACION', 'GENERADO', 'EXPORTADO', 'ENVIADO', 'EN_GESTION', 'ENTREGADO', 'FINALIZADO',
];

export interface Producto {
  id_producto: number;
  codigo_barra: string | null;
  nombre: string;
  categoria: string;
  tipo_venta: TipoVenta;
  stock_actual: number;
  stock_minimo: number;
  precio_costo: number;
  porcentaje_margen: number;
  precio_venta: number;
  activo: boolean;
  estado?: EstadoStock;
  proximo_vencimiento?: string | null;
  precio_sugerido?: number;
  cantidad_sugerida?: number;
  en_pedido?: boolean;
}

export interface Vencimiento {
  id_vencimiento: number;
  fecha_vencimiento: string;
  cantidad: number;
  estado: 'NORMAL' | 'PROXIMO' | 'VENCIDO' | 'RETIRADO';
}

export interface VentaItemLocal {
  id_producto: number;
  nombre: string;
  tipo_venta: TipoVenta;
  precio: number;
  cantidad: number;
}

export interface VentaPendiente {
  uuid_cliente: string;
  fecha_hora: string;
  canal_pago: CanalPago;
  monto_recibido: number | null;
  total: number;
  vuelto: number | null;
  ticket_local: string;
  items: { id_producto: number; nombre: string; tipo_venta: TipoVenta; cantidad: number; precio_unit: number }[];
  estado: 'pendiente' | 'error';
  error?: string;
}

export interface Comercio {
  nombre: string;
  direccion: string;
  telefono: string;
  ticket_texto: string;
}

export interface TicketData {
  numero: string;
  fecha_hora: string;
  canal_pago: CanalPago;
  total: number;
  monto_recibido: number | null;
  vuelto: number | null;
  items: { nombre: string; tipo_venta: TipoVenta; cantidad: number; precio: number; subtotal: number }[];
  offline?: boolean;
  usuario?: string;
}
