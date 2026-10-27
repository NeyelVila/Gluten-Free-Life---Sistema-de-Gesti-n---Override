import type { Comercio, TicketData } from '../lib/types';
import { canalLabel, fechaHora, money, num, unidadDe } from '../lib/format';

/** Ticket imprimible (ancho 80 mm). Solo se ve al imprimir (ver index.css: #ticket-print). */
export default function TicketPrint({ ticket, comercio }: { ticket: TicketData | null; comercio: Comercio | null }) {
  if (!ticket) return <div id="ticket-print" />;
  const linea = '-'.repeat(32);
  return (
    <div id="ticket-print">
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{comercio?.nombre || 'Gluten Free Life'}</div>
      {comercio?.direccion && <div style={{ textAlign: 'center' }}>{comercio.direccion}</div>}
      {comercio?.telefono && <div style={{ textAlign: 'center' }}>Tel. {comercio.telefono}</div>}
      <div>{linea}</div>
      <div>Ticket N° {ticket.numero}{ticket.offline ? ' (offline)' : ''}</div>
      <div>{fechaHora(ticket.fecha_hora)}</div>
      {ticket.usuario && <div>Atendió: {ticket.usuario}</div>}
      <div>{linea}</div>
      {ticket.items.map((it, i) => (
        <div key={i} style={{ marginBottom: 3 }}>
          <div>{it.nombre}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{num(it.cantidad)} {unidadDe(it.tipo_venta)} x {money(it.precio)}</span>
            <span>{money(it.subtotal)}</span>
          </div>
        </div>
      ))}
      <div>{linea}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
        <span>TOTAL</span>
        <span>{money(ticket.total)}</span>
      </div>
      <div>Medio de pago: {canalLabel[ticket.canal_pago]}</div>
      {ticket.canal_pago === 'EFECTIVO' && ticket.monto_recibido != null && (
        <>
          <div>Recibido: {money(ticket.monto_recibido)}</div>
          <div>Vuelto: {money(ticket.vuelto ?? 0)}</div>
        </>
      )}
      <div>{linea}</div>
      <div style={{ textAlign: 'center' }}>{comercio?.ticket_texto || '¡Gracias por su compra!'}</div>
    </div>
  );
}

export function imprimirTicket() {
  // Deja que React pinte el ticket antes de abrir el diálogo de impresión.
  setTimeout(() => window.print(), 80);
}
