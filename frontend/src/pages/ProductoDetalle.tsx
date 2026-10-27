import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, History, Pencil } from 'lucide-react';
import { Badge, ConfirmModal, Empty, ErrorBox, Field, Loading, Modal, Spinner, StockBadge, VencBadge, cx, useAsync } from '../components/ui';
import ProductoForm from '../components/ProductoForm';
import { errMsg, get, post } from '../lib/api';
import { fechaCorta, hoyISO, money, num, parseDecimal, unidadDe } from '../lib/format';
import { refrescarCache } from '../lib/sync';
import type { Producto, Vencimiento } from '../lib/types';
import { toast } from '../store/stores';

type Detalle = Producto & { vencimientos: Vencimiento[] };
interface IngresoFila { id_ingreso: number; fecha: string; numero_comprobante: string | null; cantidad: number; precio_costo: number; fecha_vencimiento: string | null }

export default function ProductoDetalle() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: p, error, loading, reload } = useAsync(() => get<Detalle>(`/productos/${id}`), [id]);
  const [editar, setEditar] = useState(false);
  const [agregar, setAgregar] = useState(false);
  const [verIngresos, setVerIngresos] = useState(false);
  const [ingresos, setIngresos] = useState<IngresoFila[] | null>(null);
  const [retirar, setRetirar] = useState<Vencimiento | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !p) return <Loading />;
  if (error || !p) return <ErrorBox msg={error ?? 'No encontrado'} onRetry={reload} />;

  const activos = p.vencimientos.filter((v) => v.estado !== 'RETIRADO');
  const proximo = activos.find((v) => v.estado !== 'VENCIDO') ?? activos[0];

  async function cargarIngresos() {
    setVerIngresos(true);
    try { setIngresos(await get<IngresoFila[]>(`/productos/${p!.id_producto}/ingresos`)); } catch (e) { toast.error('No se pudo cargar el historial', errMsg(e)); }
  }
  async function confirmarRetiro() {
    if (!retirar) return;
    setBusy(true);
    try {
      await post(`/vencimientos/${retirar.id_vencimiento}/retirar`);
      toast.ok('Vencimiento retirado', `Se descontaron ${num(retirar.cantidad)} ${unidadDe(p!.tipo_venta)} del stock.`);
      refrescarCache(true).catch(() => undefined);
      setRetirar(null);
      reload();
    } catch (e) { toast.error('No se pudo retirar', errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <button className="btn btn-sm btn-ghost" onClick={() => nav(-1)}><ArrowLeft className="h-4 w-4" /> Volver</button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{p.nombre}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-ink-500">
            {p.categoria} · <Badge tone={p.tipo_venta === 'GRANEL' ? 'info' : 'mute'}>{p.tipo_venta === 'GRANEL' ? 'Granel' : 'Unidad'}</Badge> · <StockBadge estado={p.estado} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-md btn-secondary" onClick={() => setEditar(true)}><Pencil className="h-5 w-5" /> Editar producto</button>
          <button className="btn btn-md btn-secondary" onClick={() => setAgregar(true)}><CalendarPlus className="h-5 w-5" /> Agregar vencimiento</button>
          <button className="btn btn-md btn-secondary" onClick={cargarIngresos}><History className="h-5 w-5" /> Ver historial de ingresos</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Stock actual', `${num(p.stock_actual)} ${unidadDe(p.tipo_venta)}`, p.estado === 'CRITICO'],
          ['Stock mínimo', `${num(p.stock_minimo)} ${unidadDe(p.tipo_venta)}`, false],
          ['Precio de costo', money(p.precio_costo), false],
          ['Margen', `${num(p.porcentaje_margen)}%`, false],
          ['Precio de venta', `${money(p.precio_venta)}${p.tipo_venta === 'GRANEL' ? '/kg' : ''}`, false],
          ['Precio sugerido', `${money(p.precio_sugerido ?? 0)}${p.tipo_venta === 'GRANEL' ? '/kg' : ''}`, false],
          ['Código de barras', p.codigo_barra ?? '—', false],
          ['Próximo vencimiento', fechaCorta(proximo?.fecha_vencimiento), proximo?.estado === 'VENCIDO'],
        ].map(([l, v, crit]) => (
          <div key={l as string} className="card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{l}</p>
            <p className={cx('mt-1 truncate text-2xl font-extrabold', crit && 'text-peligro-600')}>{v}</p>
          </div>
        ))}
      </div>

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-lg font-bold">Vencimientos del producto</h2>
          <p className="text-sm text-ink-500">Se descuentan primero los que vencen antes. No hay lotes: el vencimiento se controla por producto.</p>
        </div>
        {p.vencimientos.length === 0 ? <Empty title="Sin vencimientos cargados" text="Agregá un vencimiento o registralo al ingresar mercadería." /> : (
          <table className="mt-3 w-full text-[15px]">
            <thead><tr><th className="th">Fecha de vencimiento</th><th className="th !text-right">Cantidad</th><th className="th">Estado</th><th className="th" /></tr></thead>
            <tbody>
              {p.vencimientos.map((v) => (
                <tr key={v.id_vencimiento} className={cx(v === proximo && 'bg-brand-50/70')}>
                  <td className="td font-bold">{fechaCorta(v.fecha_vencimiento)} {v === proximo && <Badge tone="ok" className="ml-2">Próximo vencimiento</Badge>}</td>
                  <td className="td text-right">{num(v.cantidad)} {unidadDe(p.tipo_venta)}</td>
                  <td className="td"><VencBadge estado={v.estado} /></td>
                  <td className="td text-right">{v.estado !== 'RETIRADO' && <button className="btn btn-sm btn-secondary" onClick={() => setRetirar(v)}>Marcar como retirado</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {verIngresos && (
        <section className="card overflow-x-auto">
          <h2 className="px-5 pt-4 text-lg font-bold">Historial de ingresos</h2>
          {!ingresos ? <Loading /> : ingresos.length === 0 ? <Empty title="Sin ingresos registrados" /> : (
            <table className="mt-3 w-full text-[15px]">
              <thead><tr><th className="th">Fecha</th><th className="th">Comprobante</th><th className="th !text-right">Cantidad</th><th className="th !text-right">Costo</th><th className="th">Vencimiento</th></tr></thead>
              <tbody>
                {ingresos.map((i, k) => (
                  <tr key={k}><td className="td">{fechaCorta(i.fecha)}</td><td className="td">{i.numero_comprobante ?? '—'}</td><td className="td text-right">{num(i.cantidad)} {unidadDe(p.tipo_venta)}</td><td className="td text-right">{money(i.precio_costo)}</td><td className="td">{fechaCorta(i.fecha_vencimiento)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      <p className="text-sm text-ink-500">¿Llegó mercadería? <Link className="font-bold text-brand-700 underline" to="/compras/ingreso">Registrar ingreso</Link></p>

      <ProductoForm open={editar} producto={p} onClose={() => setEditar(false)} onSaved={() => { setEditar(false); reload(); }} />
      <AgregarVencimiento open={agregar} producto={p} onClose={() => setAgregar(false)} onSaved={() => { setAgregar(false); reload(); }} />
      <ConfirmModal open={!!retirar} title="Marcar como retirado" tone="warning" confirmLabel="Retirar" busy={busy} onCancel={() => setRetirar(null)} onConfirm={confirmarRetiro}
        text={<>Se van a descontar <b>{num(retirar?.cantidad ?? 0)} {unidadDe(p.tipo_venta)}</b> de {p.nombre} del stock (vencimiento {fechaCorta(retirar?.fecha_vencimiento)}).</>} />
    </div>
  );
}

function AgregarVencimiento({ open, producto, onClose, onSaved }: { open: boolean; producto: Producto; onClose: () => void; onSaved: () => void }) {
  const [fecha, setFecha] = useState('');
  const [cant, setCant] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function guardar() {
    const n = parseDecimal(cant);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return setErr('Elegí una fecha de vencimiento');
    if (!Number.isFinite(n) || n <= 0) return setErr('Ingresá una cantidad mayor a 0');
    if (producto.tipo_venta === 'UNIDAD' && !Number.isInteger(n)) return setErr('Este producto se cuenta por unidad: ingresá un número entero');
    if (n > producto.stock_actual + 1e-9) return setErr(`La cantidad supera el stock actual (${num(producto.stock_actual)} ${unidadDe(producto.tipo_venta)})`);
    setBusy(true); setErr(null);
    try {
      await post(`/productos/${producto.id_producto}/vencimientos`, { fecha_vencimiento: fecha, cantidad: n });
      toast.ok('Vencimiento agregado');
      setFecha(''); setCant('');
      onSaved();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Agregar vencimiento" width="max-w-md"
      footer={<><button className="btn btn-md btn-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-md btn-primary" onClick={guardar} disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Guardar</button></>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-500">Asigna una fecha de vencimiento a parte del stock actual. No modifica el stock.</p>
        <Field label="Fecha de vencimiento"><input type="date" className="field" min={hoyISO(-365)} value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
        <Field label={`Cantidad (${unidadDe(producto.tipo_venta)})`}><input className="field" inputMode="decimal" value={cant} onChange={(e) => setCant(e.target.value)} /></Field>
        {err && <p role="alert" className="text-sm font-semibold text-peligro-600">{err}</p>}
      </div>
    </Modal>
  );
}
