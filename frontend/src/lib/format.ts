import type { CanalPago, EstadoPedido, TipoVenta } from './types';

const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

/** $ 8.500  ·  $ 8.500,50 si tiene centavos */
export const money = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  return '$ ' + (Number.isInteger(v) || Math.abs(v - Math.round(v)) < 0.005 ? nf0.format(Math.round(v)) : nf2.format(v));
};
export const num = (n: number | null | undefined) => nf3.format(Number(n ?? 0));
export const unidadDe = (t: TipoVenta) => (t === 'GRANEL' ? 'kg' : 'u.');
export const qty = (n: number, t: TipoVenta) => `${nf3.format(n)} ${unidadDe(t)}`;
export const precioLabel = (n: number, t: TipoVenta) => `${money(n)}${t === 'GRANEL' ? '/kg' : ''}`;

/** Acepta "0,250", "0.25", "1.500,5". Devuelve NaN si no es un número. */
export function parseDecimal(s: string): number {
  let t = s.trim().replace(/\s/g, '');
  if (!t) return NaN;
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** 'YYYY-MM-DD' → '12/09/2026' (sin pasar por Date para evitar corrimientos de zona horaria). */
export const fechaCorta = (d: string | null | undefined) => {
  if (!d) return '—';
  const [y, m, dd] = d.slice(0, 10).split('-');
  return `${dd}/${m}/${y}`;
};
export const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(iso));
export const hora = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', { timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(iso));

/** Hoy en la zona del negocio, 'YYYY-MM-DD'. */
export const hoyISO = (offsetDias = 0) => {
  const d = new Date(Date.now() + offsetDias * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d);
};

export const canalLabel: Record<CanalPago, string> = {
  EFECTIVO: 'Efectivo',
  MERCADO_PAGO: 'Mercado Pago',
  TARJETA: 'Tarjeta',
};

export const estadoPedidoLabel: Record<EstadoPedido, string> = {
  EN_PREPARACION: 'En preparación',
  GENERADO: 'Generado',
  EXPORTADO: 'Exportado',
  ENVIADO: 'Enviado',
  EN_GESTION: 'En gestión',
  ENTREGADO: 'Entregado',
  FINALIZADO: 'Finalizado',
};

export const saludo = () => {
  const h = Number(new Intl.DateTimeFormat('es-AR', { hour: 'numeric', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()));
  return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
};

export const diasLabel = (d: number) => (d < 0 ? `venció hace ${-d} d` : d === 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : `en ${d} días`);

export const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
