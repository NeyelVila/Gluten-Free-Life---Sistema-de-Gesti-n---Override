import { useState } from 'react';
import { Banknote, CheckCircle2, CreditCard, Lock, Printer, Receipt, Smartphone, Undo2, Wallet, XCircle } from 'lucide-react';
import { Badge, ConfirmModal, Empty, ErrorBox, Field, Loading, PageHeader, Spinner, StatCard, cx, useAsync } from '../components/ui';
import TicketPrint, { imprimirTicket } from '../components/Ticket';
import { errMsg, get, post } from '../lib/api';
import { canalLabel, fechaCorta, hora, hoyISO, money, parseDecimal } from '../lib/format';
import { comercioLocal } from '../lib/sync';
import type { CanalPago, Comercio, TicketData } from '../lib/types';
import { toast } from '../store/stores';

interface Resumen {
  fecha: string; operaciones: number; anuladas: number; total_facturado: number; efectivo: number; mercado_pago: number; tarjeta: number; digital: number;
  cierre: { total_efectivo: number; total_digital: number; diferencia: number; fondo_inicial: number; efectivo_contado: number; observacion: string | null; usuario_nombre: string } | null;
  ventas: { id_venta: number; numero_ticket: number; fecha_hora: string; total_cobrado: number; canal_pago: CanalPago; estado: 'REGISTRADA' | 'ANULADA'; usuario_nombre: string }[];
}

export default function Caja() {
  const [fecha, setFecha] = useState(hoyISO());
  const { data: r, error, loading, reload } = useAsync(() => get<Resumen>(`/caja/resumen?fecha=${fecha}`), [fecha]);
  const [fondo, setFondo] = useState('');
  const [contado, setContado] = useState('');
  const [obs, setObs] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [anular, setAnular] = useState<Resumen['ventas'][number] | null>(null);
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [comercio, setComercio] = useState<Comercio | null>(null);

  if (loading && !r) return <Loading />;
  if (error && !r) return <ErrorBox msg={error} onRetry={reload} />;
  const d = r!;

  const fondoN = fondo.trim() ? parseDecimal(fondo) : 0;
  const contadoN = parseDecimal(contado);
  const esperado = d.efectivo + (Number.isFinite(fondoN) ? fondoN : 0);
  const diferencia = Number.isFinite(contadoN) ? Math.round((contadoN - esperado) * 100) / 100 : null;
  const cerrada = !!d.cierre;
  const esperadoCierre = cerrada ? d.cierre!.total_efectivo + d.cierre!.fondo_inicial : esperado;

  async function cerrar() {
    if (!Number.isFinite(contadoN) || contadoN < 0) return toast.error('Ingresá el efectivo contado');
    if (!Number.isFinite(fondoN) || fondoN < 0) return toast.error('El fondo inicial es inválido');
    setBusy(true);
    try {
      const c = await post<{ cuadrada: boolean; cierre: { diferencia: number } }>('/caja/cierre', { fecha, efectivo_contado: contadoN, fondo_inicial: fondoN, observacion: obs.trim() || null });
      setConfirm(false);
      toast[c.cuadrada ? 'ok' : 'warn'](c.cuadrada ? 'Caja cerrada: cuadrada' : 'Caja cerrada con diferencia', c.cuadrada ? undefined : `Diferencia: ${money(c.cierre.diferencia)}`);
      reload();
    } catch (e) { setConfirm(false); toast.error('No se pudo cerrar la caja', errMsg(e)); } finally { setBusy(false); }
  }

  async function anularVenta() {
    if (!anular) return;
    setBusy(true);
    try {
      await post(`/ventas/${anular.id_venta}/anular`);
      toast.ok('Venta anulada', 'El stock fue devuelto.');
      setAnular(null);
      reload();
    } catch (e) { toast.error('No se pudo anular', errMsg(e)); setAnular(null); } finally { setBusy(false); }
  }

  async function reimprimir(id: number) {
    try {
      const r = await get<any>(`/ventas/${id}`);
      setComercio(r.comercio ?? (await comercioLocal()));
      setTicket({
        numero: String(r.venta.numero_ticket).padStart(5, '0'), fecha_hora: r.venta.fecha_hora, canal_pago: r.venta.canal_pago, total: r.venta.total_cobrado,
        monto_recibido: r.venta.monto_recibido, vuelto: r.venta.vuelto, usuario: r.venta.usuario_nombre,
        items: r.detalle.map((x: any) => ({ nombre: x.nombre, tipo_venta: x.tipo_venta, cantidad: x.cantidad, precio: x.precio_unit_hist, subtotal: x.subtotal })),
      });
      imprimirTicket();
    } catch (e) { toast.error('No se pudo cargar el ticket', errMsg(e)); }
  }

  const estadoCaja = (dif: number) => dif === 0 ? <Badge tone="ok" className="!px-3 !py-1 !text-sm">🟢 Caja cuadrada</Badge> : <Badge tone="crit" className="!px-3 !py-1 !text-sm">🔴 Diferencia de caja</Badge>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader title="Caja" subtitle={`Resumen del ${fechaCorta(fecha)}`} actions={<input type="date" className="field !w-auto" value={fecha} max={hoyISO()} onChange={(e) => e.target.value && setFecha(e.target.value)} aria-label="Fecha" />} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Ventas del día" value={d.operaciones} sub={d.anuladas ? `${d.anuladas} anulada(s)` : 'operaciones'} icon={<Receipt className="h-4 w-4" />} />
        <StatCard label="Efectivo" value={money(d.efectivo)} icon={<Banknote className="h-4 w-4" />} />
        <StatCard label="Mercado Pago" value={money(d.mercado_pago)} icon={<Smartphone className="h-4 w-4" />} />
        <StatCard label="Tarjetas" value={money(d.tarjeta)} icon={<CreditCard className="h-4 w-4" />} />
        <StatCard label="Total facturado" value={money(d.total_facturado)} sub={`Digital: ${money(d.digital)}`} icon={<Wallet className="h-4 w-4" />} />
      </div>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Arqueo de caja</h2>
          {cerrada && <Badge tone="mute"><Lock className="h-3.5 w-3.5" /> Caja cerrada por {d.cierre!.usuario_nombre}</Badge>}
        </div>
        {cerrada ? (
          <div className="grid gap-4 md:grid-cols-2">
            <dl className="space-y-2 text-lg">
              {[['Fondo inicial', money(d.cierre!.fondo_inicial)], ['Efectivo de ventas', money(d.cierre!.total_efectivo)], ['Efectivo esperado', money(esperadoCierre)], ['Efectivo contado', money(d.cierre!.efectivo_contado)], ['Cobros digitales', money(d.cierre!.total_digital)]].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-crema-200 py-1.5"><dt className="text-ink-500">{k}</dt><dd className="font-bold">{v}</dd></div>
              ))}
              {d.cierre!.observacion && <p className="text-sm text-ink-500">Obs.: {d.cierre!.observacion}</p>}
            </dl>
            <div className={cx('grid place-items-center rounded-2xl p-6 text-center', d.cierre!.diferencia === 0 ? 'bg-brand-50' : 'bg-peligro-50')}>
              {d.cierre!.diferencia === 0 ? <CheckCircle2 className="h-14 w-14 text-brand-600" /> : <XCircle className="h-14 w-14 text-peligro-600" />}
              <div className="mt-2">{estadoCaja(d.cierre!.diferencia)}</div>
              <p className="mt-2 text-3xl font-black">{d.cierre!.diferencia > 0 ? '+' : ''}{money(d.cierre!.diferencia)}</p>
              <p className="text-sm text-ink-500">{d.cierre!.diferencia > 0 ? 'Sobrante' : d.cierre!.diferencia < 0 ? 'Faltante' : 'Sin diferencia'}</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              <Field label="Fondo inicial (opcional)" hint="Efectivo con el que se abrió la caja."><input className="field" inputMode="decimal" value={fondo} onChange={(e) => setFondo(e.target.value)} placeholder="$ 0" /></Field>
              <div className="flex justify-between rounded-xl bg-crema-100 px-4 py-3 text-lg font-bold"><span>Efectivo esperado</span><span>{money(esperado)}</span></div>
              <Field label="Efectivo contado" ><input className="field text-xl font-bold" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} placeholder="$ 0" /></Field>
              <Field label="Observación (opcional)"><input className="field" value={obs} maxLength={500} onChange={(e) => setObs(e.target.value)} /></Field>
            </div>
            <div className={cx('grid place-items-center rounded-2xl p-6 text-center', diferencia == null ? 'bg-crema-100' : diferencia === 0 ? 'bg-brand-50' : 'bg-peligro-50')}>
              {diferencia == null ? <p className="text-ink-500">Ingresá el efectivo contado para ver la diferencia.</p> : (
                <>
                  {diferencia === 0 ? <CheckCircle2 className="h-14 w-14 text-brand-600" /> : <XCircle className="h-14 w-14 text-peligro-600" />}
                  <div className="mt-2">{estadoCaja(diferencia)}</div>
                  <p className="mt-2 text-4xl font-black">{diferencia > 0 ? '+' : ''}{money(diferencia)}</p>
                  <p className="text-sm text-ink-500">{diferencia > 0 ? 'Sobrante' : diferencia < 0 ? 'Faltante' : 'Sin diferencia'}</p>
                </>
              )}
            </div>
            <button className="btn btn-lg btn-primary md:col-span-2" disabled={!Number.isFinite(contadoN) || busy} onClick={() => setConfirm(true)}><Lock className="h-5 w-5" /> Cerrar caja</button>
          </div>
        )}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="px-5 pt-4 text-lg font-bold">Ventas del día</h2>
        {d.ventas.length === 0 ? <Empty title="No hubo ventas este día" /> : (
          <table className="mt-3 w-full min-w-[40rem] text-[15px]">
            <thead><tr><th className="th">Ticket</th><th className="th">Hora</th><th className="th">Medio de pago</th><th className="th !text-right">Total</th><th className="th">Estado</th><th className="th" /></tr></thead>
            <tbody>
              {d.ventas.map((v) => (
                <tr key={v.id_venta} className={cx(v.estado === 'ANULADA' && 'text-ink-500 line-through decoration-ink-300')}>
                  <td className="td font-bold">N° {String(v.numero_ticket).padStart(5, '0')}</td><td className="td">{hora(v.fecha_hora)}</td><td className="td">{canalLabel[v.canal_pago]}</td>
                  <td className="td text-right font-bold">{money(v.total_cobrado)}</td>
                  <td className="td no-underline">{v.estado === 'ANULADA' ? <Badge tone="mute">Anulada</Badge> : <Badge tone="ok">Registrada</Badge>}</td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-1">
                      <button className="btn btn-sm btn-ghost" onClick={() => reimprimir(v.id_venta)} aria-label="Reimprimir ticket"><Printer className="h-4 w-4" /></button>
                      {v.estado === 'REGISTRADA' && !cerrada && <button className="btn btn-sm btn-ghost text-peligro-600" onClick={() => setAnular(v)}><Undo2 className="h-4 w-4" /> Anular</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <ConfirmModal open={confirm} busy={busy} title="Cerrar la caja del día" confirmLabel="Cerrar caja" onCancel={() => setConfirm(false)} onConfirm={cerrar}
        text={<>Efectivo esperado <b>{money(esperado)}</b>, contado <b>{money(Number.isFinite(contadoN) ? contadoN : 0)}</b>. Diferencia: <b>{money(diferencia ?? 0)}</b>. Una vez cerrada no se pueden anular las ventas de este día.</>} />
      <ConfirmModal open={!!anular} busy={busy} tone="danger" title="Anular venta" confirmLabel="Anular venta" onCancel={() => setAnular(null)} onConfirm={anularVenta}
        text={<>Se anula el ticket N° {anular ? String(anular.numero_ticket).padStart(5, '0') : ''} por <b>{money(anular?.total_cobrado ?? 0)}</b>, se devuelve el stock y deja de contar en la caja y los reportes.</>} />
      <TicketPrint ticket={ticket} comercio={comercio} />
    </div>
  );
}
