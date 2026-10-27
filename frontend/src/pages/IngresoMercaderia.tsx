import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { Empty, Field, Modal, Spinner, cx, useAsync } from '../components/ui';
import { errMsg, get, post } from '../lib/api';
import { fechaCorta, hoyISO, money, num, parseDecimal, unidadDe } from '../lib/format';
import { numPedido, type Pedido } from '../lib/pedidos';
import { refrescarCache } from '../lib/sync';
import type { Producto } from '../lib/types';
import { toast } from '../store/stores';

interface Fila { id_producto: number | ''; cant: string; costo: string; venc: string }
interface Resumen { nombre: string; stock_anterior: number; stock_nuevo: number; costo_anterior: number; costo_nuevo: number; precio_venta_anterior: number; precio_venta_nuevo: number; vencimiento_registrado: string | null }
interface IngresoLista { id_ingreso: number; fecha: string; numero_comprobante: string | null; id_pedido: number | null; productos: number; total: number }

const vacia = (): Fila => ({ id_producto: '', cant: '', costo: '', venc: '' });

export default function IngresoMercaderia() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const idPedido = params.get('pedido') ? Number(params.get('pedido')) : null;
  const [productos, setProductos] = useState<Producto[]>([]);
  const [interNombre, setInterNombre] = useState('');
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [comprobante, setComprobante] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [filas, setFilas] = useState<Fila[]>([vacia()]);
  const [actualizar, setActualizar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resumen, setResumen] = useState<Resumen[] | null>(null);
  const [pedidoFinalizado, setPedidoFinalizado] = useState(false);
  const [errIdx, setErrIdx] = useState<Record<number, string>>({});
  const hist = useAsync(() => get<IngresoLista[]>('/ingresos'), []);

  useEffect(() => {
    get<Producto[]>('/productos').then(setProductos).catch((e) => toast.error('No se pudo cargar el catálogo', errMsg(e)));
    get<{ intermediario: { nombre: string } | null }>('/intermediario').then((r) => setInterNombre(r.intermediario?.nombre ?? '')).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!idPedido) return;
    get<Pedido>(`/pedidos/${idPedido}`).then((p) => {
      setPedido(p);
      setFilas(p.items.map((i) => ({ id_producto: i.id_producto, cant: String(i.cantidad_solicitada), costo: String(i.precio_costo), venc: '' })));
    }).catch((e) => toast.error('No se pudo cargar el pedido', errMsg(e)));
  }, [idPedido]);

  const porId = new Map(productos.map((p) => [p.id_producto, p]));
  const setFila = (i: number, patch: Partial<Fila>) => setFilas((fs) => fs.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const elegirProducto = (i: number, id: number) => { const p = porId.get(id); setFila(i, { id_producto: id, costo: filas[i].costo || (p ? String(p.precio_costo) : '') }); };
  const total = filas.reduce((s, f) => { const c = parseDecimal(f.cant), k = parseDecimal(f.costo); return s + (Number.isFinite(c) && Number.isFinite(k) ? c * k : 0); }, 0);

  async function confirmar() {
    const errs: Record<number, string> = {};
    const items: any[] = [];
    filas.forEach((f, i) => {
      if (f.id_producto === '' && !f.cant && !f.costo) return; // renglón vacío
      const p = f.id_producto === '' ? null : porId.get(f.id_producto);
      const c = parseDecimal(f.cant), k = parseDecimal(f.costo);
      if (!p) errs[i] = 'Elegí un producto';
      else if (!Number.isFinite(c) || c <= 0) errs[i] = 'Cantidad inválida';
      else if (p.tipo_venta === 'UNIDAD' && !Number.isInteger(c)) errs[i] = 'Este producto se cuenta por unidad (número entero)';
      else if (!Number.isFinite(k) || k < 0) errs[i] = 'Costo inválido';
      else if (f.venc && !/^\d{4}-\d{2}-\d{2}$/.test(f.venc)) errs[i] = 'Fecha de vencimiento inválida';
      else items.push({ id_producto: p.id_producto, cantidad: c, precio_costo: k, fecha_vencimiento: f.venc || null });
    });
    const ids = items.map((i) => i.id_producto);
    if (new Set(ids).size !== ids.length) { toast.error('Hay productos repetidos', 'Unificá las cantidades en un solo renglón.'); return; }
    setErrIdx(errs);
    if (Object.keys(errs).length) return toast.error('Revisá los renglones marcados');
    if (!items.length) return toast.error('Agregá al menos un producto');
    setBusy(true);
    try {
      const r = await post<{ resumen: Resumen[]; pedido_finalizado: boolean }>('/ingresos', {
        id_pedido: idPedido, numero_comprobante: comprobante.trim() || null, fecha, actualizar_precios: actualizar, finalizar_pedido: true, items,
      });
      setResumen(r.resumen);
      setPedidoFinalizado(r.pedido_finalizado);
      refrescarCache(true).catch(() => undefined);
      hist.reload();
    } catch (e) { toast.error('No se pudo registrar el ingreso', errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <button className="btn btn-sm btn-ghost" onClick={() => nav(idPedido ? `/compras/${idPedido}` : '/compras')}><ArrowLeft className="h-4 w-4" /> Volver</button>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Ingreso de mercadería</h1>
        <p className="text-ink-500">{pedido ? <>Recepción del pedido N° {numPedido(pedido.id_pedido)}. Ajustá lo que realmente llegó.</> : 'Registrá lo que llegó para actualizar stock, costos y vencimientos.'}</p>
      </div>

      <section className="card grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Intermediario"><input className="field" disabled value={interNombre} /></Field>
        <Field label="N° de remito o factura"><input className="field" value={comprobante} onChange={(e) => setComprobante(e.target.value)} placeholder="0001-00004521" /></Field>
        <Field label="Fecha"><input type="date" className="field" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} /></Field>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[56rem] text-[15px]">
          <thead><tr><th className="th">Producto</th><th className="th !text-right">Cantidad</th><th className="th !text-right">Precio de costo</th><th className="th">Vencimiento</th><th className="th">Precio de venta sugerido</th><th className="th" /></tr></thead>
          <tbody>
            {filas.map((f, i) => {
              const p = f.id_producto === '' ? null : porId.get(f.id_producto);
              const k = parseDecimal(f.costo);
              const sug = p && Number.isFinite(k) ? Math.round(k * (1 + p.porcentaje_margen / 100)) : null;
              return (
                <tr key={i} className={cx(errIdx[i] && 'bg-peligro-50/60')}>
                  <td className="td">
                    <select className="field !py-2" value={f.id_producto} onChange={(e) => elegirProducto(i, Number(e.target.value))} aria-label="Producto">
                      <option value="">Elegir producto…</option>
                      {productos.map((x) => <option key={x.id_producto} value={x.id_producto}>{x.nombre}</option>)}
                    </select>
                    {errIdx[i] && <p className="mt-1 text-sm font-semibold text-peligro-600">{errIdx[i]}</p>}
                  </td>
                  <td className="td text-right"><div className="flex items-center justify-end gap-1.5"><input className="field !w-24 !px-2 !py-2 text-right font-bold" inputMode="decimal" value={f.cant} onChange={(e) => setFila(i, { cant: e.target.value })} aria-label="Cantidad" />{p && <span className="text-sm text-ink-500">{unidadDe(p.tipo_venta)}</span>}</div></td>
                  <td className="td text-right"><input className="field !w-28 !px-2 !py-2 text-right" inputMode="decimal" value={f.costo} onChange={(e) => setFila(i, { costo: e.target.value })} aria-label="Precio de costo" /></td>
                  <td className="td"><input type="date" className="field !w-44 !py-2" value={f.venc} onChange={(e) => setFila(i, { venc: e.target.value })} aria-label="Fecha de vencimiento" /></td>
                  <td className="td text-sm">{p && sug != null ? <span className="font-semibold text-brand-800">Costo {money(k)} + margen {num(p.porcentaje_margen)}% = <b className="text-base">{money(sug)}</b></span> : <span className="text-ink-500">—</span>}</td>
                  <td className="td text-right"><button className="btn btn-sm btn-ghost text-peligro-600" disabled={filas.length === 1} onClick={() => setFilas((fs) => fs.filter((_, kk) => kk !== i))} aria-label="Quitar renglón"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-crema-200 p-4">
          <button className="btn btn-md btn-secondary" onClick={() => setFilas((fs) => [...fs, vacia()])}><Plus className="h-4 w-4" /> Agregar renglón</button>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-700"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={actualizar} onChange={(e) => setActualizar(e.target.checked)} /> Actualizar el precio de venta con el sugerido</label>
          <p className="text-lg font-bold">Total del ingreso: <span className="text-2xl font-black text-brand-800">{money(total)}</span></p>
        </div>
      </section>
      <button className="btn btn-lg btn-primary" onClick={confirmar} disabled={busy}>{busy ? <Spinner /> : <CheckCircle2 className="h-6 w-6" />} CONFIRMAR INGRESO</button>

      <section className="card overflow-x-auto">
        <h2 className="px-5 pt-4 text-lg font-bold">Ingresos recientes</h2>
        {!hist.data?.length ? <Empty title="Todavía no hay ingresos registrados" /> : (
          <table className="mt-3 w-full text-[15px]">
            <thead><tr><th className="th">Fecha</th><th className="th">Comprobante</th><th className="th">Pedido</th><th className="th !text-right">Productos</th><th className="th !text-right">Total</th></tr></thead>
            <tbody>{hist.data.slice(0, 10).map((i) => <tr key={i.id_ingreso}><td className="td">{fechaCorta(i.fecha)}</td><td className="td">{i.numero_comprobante ?? '—'}</td><td className="td">{i.id_pedido ? `N° ${numPedido(i.id_pedido)}` : 'Manual'}</td><td className="td text-right">{i.productos}</td><td className="td text-right font-bold">{money(i.total)}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <Modal open={!!resumen} onClose={() => nav(idPedido ? `/compras/${idPedido}` : '/compras')} width="max-w-2xl" title={<span className="flex items-center gap-2 text-brand-800"><CheckCircle2 className="h-6 w-6 text-brand-600" /> Ingreso registrado</span>}
        footer={<button className="btn btn-md btn-primary" onClick={() => nav(idPedido ? `/compras/${idPedido}` : '/compras')}>Listo</button>}>
        <div className="space-y-3">
          {pedidoFinalizado && <p className="rounded-xl bg-brand-50 p-3 font-semibold text-brand-800">El pedido N° {pedido ? numPedido(pedido.id_pedido) : ''} pasó a «Finalizado».</p>}
          <ul className="space-y-2">
            {resumen?.map((r, i) => (
              <li key={i} className="rounded-xl bg-crema-100 p-3 text-sm">
                <p className="font-bold">{r.nombre}</p>
                <p>Stock: {num(r.stock_anterior)} → <b className="text-brand-800">{num(r.stock_nuevo)}</b> · Costo: {money(r.costo_anterior)} → <b>{money(r.costo_nuevo)}</b> · Precio de venta: {money(r.precio_venta_anterior)} → <b>{money(r.precio_venta_nuevo)}</b>{r.vencimiento_registrado && <> · Vence {fechaCorta(r.vencimiento_registrado)}</>}</p>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </div>
  );
}
