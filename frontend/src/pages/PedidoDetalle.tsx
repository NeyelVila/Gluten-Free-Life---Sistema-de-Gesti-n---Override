import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Copy, FileSpreadsheet, FileText, Mail, MessageCircle, PackagePlus, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { Badge, ConfirmModal, ErrorBox, Loading, Spinner, cx, useAsync } from '../components/ui';
import { descargar, errMsg, get, post, put } from '../lib/api';
import { estadoPedidoLabel, fechaHora, money, num, parseDecimal, unidadDe } from '../lib/format';
import { mensajePedido, numPedido, soloDigitos, type Pedido } from '../lib/pedidos';
import { comercioLocal } from '../lib/sync';
import { ESTADOS_PEDIDO, type Producto } from '../lib/types';
import { toast } from '../store/stores';

interface Fila { id_producto: number; nombre: string; tipo_venta: Producto['tipo_venta']; stock_actual: number; precio_costo: number; cant: string; obs: string }

export default function PedidoDetalle() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: p, error, loading, reload } = useAsync(() => get<Pedido>(`/pedidos/${id}`), [id]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [avanzar, setAvanzar] = useState(false);
  const [catalogo, setCatalogo] = useState<Producto[]>([]);
  const [agregarId, setAgregarId] = useState('');

  useEffect(() => {
    if (!p) return;
    setFilas(p.items.map((i) => ({ id_producto: i.id_producto, nombre: i.nombre, tipo_venta: i.tipo_venta, stock_actual: i.stock_actual, precio_costo: i.precio_costo, cant: String(i.cantidad_solicitada), obs: i.observacion ?? '' })));
    setDirty(false);
  }, [p]);

  const editable = !!p && (p.estado === 'EN_PREPARACION' || p.estado === 'GENERADO');
  useEffect(() => { if (editable) get<Producto[]>('/productos').then(setCatalogo).catch(() => undefined); }, [editable]);

  if (loading && !p) return <Loading />;
  if (error || !p) return <ErrorBox msg={error ?? 'Pedido inexistente'} onRetry={reload} />;

  const idx = ESTADOS_PEDIDO.indexOf(p.estado);
  const siguiente = ESTADOS_PEDIDO[idx + 1];
  const total = filas.reduce((s, f) => { const n = parseDecimal(f.cant); return s + (Number.isFinite(n) ? n * f.precio_costo : 0); }, 0);

  const setFila = (i: number, patch: Partial<Fila>) => { setFilas((fs) => fs.map((f, k) => (k === i ? { ...f, ...patch } : f))); setDirty(true); };

  function validar(): { id_producto: number; cantidad_solicitada: number; observacion: string | null }[] | null {
    if (!filas.length) { toast.error('El pedido no tiene productos'); return null; }
    const out = [];
    for (const f of filas) {
      const n = parseDecimal(f.cant);
      if (!Number.isFinite(n) || n <= 0) { toast.error(`Cantidad inválida en ${f.nombre}`, 'Ingresá un número mayor a 0.'); return null; }
      if (f.tipo_venta === 'UNIDAD' && !Number.isInteger(n)) { toast.error(`${f.nombre} se pide por unidad`, 'Ingresá una cantidad entera.'); return null; }
      out.push({ id_producto: f.id_producto, cantidad_solicitada: n, observacion: f.obs.trim() || null });
    }
    return out;
  }

  async function guardar(silencioso = false): Promise<boolean> {
    const items = validar();
    if (!items) return false;
    setBusy('guardar');
    try {
      await put(`/pedidos/${p!.id_pedido}`, { items });
      if (!silencioso) toast.ok('Pedido guardado');
      await reload();
      return true;
    } catch (e) { toast.error('No se pudo guardar', errMsg(e)); return false; } finally { setBusy(null); }
  }

  async function hacerAvanzar() {
    setAvanzar(false);
    if (dirty && !(await guardar(true))) return;
    setBusy('avanzar');
    try {
      await post(`/pedidos/${p!.id_pedido}/avanzar`);
      toast.ok(`Pedido ${estadoPedidoLabel[siguiente].toLowerCase()}`);
      reload();
    } catch (e) { toast.error('No se pudo avanzar el estado', errMsg(e)); } finally { setBusy(null); }
  }

  async function exportar(formato: 'pdf' | 'excel', guardarArchivo = true) {
    if (dirty && !(await guardar(true))) return null;
    try {
      const r = await descargar(`/pedidos/${p!.id_pedido}/${formato}`, `pedido-${numPedido(p!.id_pedido)}.${formato === 'pdf' ? 'pdf' : 'xlsx'}`, guardarArchivo);
      reload();
      return r;
    } catch (e) { toast.error('No se pudo generar el archivo', errMsg(e)); return null; }
  }

  async function descargarFormato(f: 'pdf' | 'excel') {
    setBusy(f);
    const r = await exportar(f);
    if (r) toast.ok(f === 'pdf' ? 'PDF descargado' : 'Excel descargado', r.filename);
    setBusy(null);
  }

  async function imprimir() {
    setBusy('imprimir');
    const r = await exportar('pdf', false);
    setBusy(null);
    if (!r) return;
    const url = URL.createObjectURL(r.blob);
    const w = window.open(url, '_blank');
    if (!w) {
      toast.warn('El navegador bloqueó la ventana', 'Permití las ventanas emergentes o descargá el PDF para imprimirlo.');
    } else {
      toast.info('PDF abierto en una pestaña nueva', 'Imprimilo con Ctrl+P.');
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function enviarWhatsApp() {
    setBusy('wsp');
    const com = await comercioLocal();
    const r = await exportar('pdf', false);
    if (!r) return setBusy(null);
    const texto = mensajePedido(p!, com.nombre);
    const file = new File([r.blob], r.filename, { type: 'application/pdf' });
    try {
      // Si el navegador permite compartir archivos (celulares / algunos escritorios), se adjunta directo.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: texto, title: `Pedido ${numPedido(p!.id_pedido)}` });
        toast.ok('Pedido compartido');
        setBusy(null);
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') { setBusy(null); return; }
    }
    // Escritorio: se guarda el PDF y se abre el chat de WhatsApp con el mensaje; el archivo se arrastra al chat.
    const a = document.createElement('a');
    a.href = URL.createObjectURL(r.blob); a.download = r.filename; a.click();
    const tel = soloDigitos(p!.telefono_whatsapp);
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank');
    toast.info('Adjuntá el archivo en WhatsApp', `Se descargó ${r.filename}. Arrastralo al chat (WhatsApp no permite adjuntar archivos automáticamente desde el navegador).`);
    setBusy(null);
  }

  async function enviarCorreo() {
    setBusy('mail');
    const com = await comercioLocal();
    const r = await exportar('pdf');
    setBusy(null);
    if (!r) return;
    const asunto = `Pedido de compra N° ${numPedido(p!.id_pedido)} — ${com.nombre}`;
    window.location.href = `mailto:${p!.intermediario_email ?? ''}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensajePedido(p!, com.nombre))}`;
    toast.info('Adjuntá el archivo en el correo', `Se descargó ${r.filename}.`);
  }

  async function duplicar() {
    setBusy('dup');
    try {
      const n = await post<Pedido>(`/pedidos/${p!.id_pedido}/duplicar`);
      toast.ok('Pedido duplicado', `Nuevo pedido N° ${numPedido(n.id_pedido)} en preparación.`);
      nav(`/compras/${n.id_pedido}`);
    } catch (e) { toast.error('No se pudo duplicar', errMsg(e)); } finally { setBusy(null); }
  }

  const exportable = p.estado !== 'EN_PREPARACION';
  const disponibles = catalogo.filter((c) => !filas.some((f) => f.id_producto === c.id_producto));
  const labelAvanzar = p.estado === 'EN_PREPARACION' ? 'Generar pedido' : p.estado === 'EXPORTADO' ? 'Marcar como enviado' : `Avanzar a «${estadoPedidoLabel[siguiente] ?? ''}»`;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <button className="btn btn-sm btn-ghost" onClick={() => nav('/compras')}><ArrowLeft className="h-4 w-4" /> Pedidos de compra</button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Pedido N° {numPedido(p.id_pedido)}</h1>
          <p className="text-ink-500">Para <b>{p.intermediario_nombre}</b> · {fechaHora(p.fecha_generacion)} · emitido por {p.usuario_nombre}</p>
        </div>
        <Badge tone="info" className="!px-4 !py-1.5 !text-sm">{estadoPedidoLabel[p.estado]}</Badge>
      </div>

      {/* Línea de tiempo de los 7 estados */}
      <section className="card overflow-x-auto p-5">
        <ol className="flex min-w-[40rem] items-start">
          {ESTADOS_PEDIDO.map((e, i) => {
            const hecho = i < idx; const actual = i === idx;
            const h = p.historial.find((x) => x.estado === e);
            return (
              <li key={e} className="relative flex flex-1 flex-col items-center text-center">
                {i > 0 && <span className={cx('absolute right-1/2 top-4 h-1 w-full -translate-y-1/2', i <= idx ? 'bg-brand-500' : 'bg-crema-200')} />}
                <span className={cx('relative z-10 grid h-8 w-8 place-items-center rounded-full text-sm font-black ring-4 ring-white', hecho ? 'bg-brand-600 text-white' : actual ? 'bg-brand-600 text-white ring-brand-200' : 'bg-crema-200 text-ink-500')}>
                  {hecho ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={cx('mt-2 text-xs font-bold', actual ? 'text-brand-800' : 'text-ink-500')}>{estadoPedidoLabel[e]}</span>
                {h && <span className="text-[11px] text-ink-500">{fechaHora(h.fecha_hora)}</span>}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[46rem] text-[15px]">
          <thead><tr><th className="th">Producto</th><th className="th !text-right">Stock</th><th className="th !text-right">Cantidad</th><th className="th">Observación</th><th className="th !text-right">P. compra</th><th className="th !text-right">Subtotal</th>{editable && <th className="th" />}</tr></thead>
          <tbody>
            {filas.map((f, i) => {
              const n = parseDecimal(f.cant);
              return (
                <tr key={f.id_producto}>
                  <td className="td font-bold">{f.nombre}</td>
                  <td className="td text-right text-ink-500">{num(f.stock_actual)} {unidadDe(f.tipo_venta)}</td>
                  <td className="td text-right">
                    {editable ? <input className="field !w-28 !px-2 !py-1.5 text-right font-bold" inputMode="decimal" value={f.cant} onChange={(e) => setFila(i, { cant: e.target.value })} aria-label={`Cantidad de ${f.nombre}`} /> : <b>{num(n)} {unidadDe(f.tipo_venta)}</b>}
                  </td>
                  <td className="td">{editable ? <input className="field !px-2 !py-1.5" value={f.obs} maxLength={250} onChange={(e) => setFila(i, { obs: e.target.value })} placeholder="Opcional" /> : <span className="text-ink-500">{f.obs || '—'}</span>}</td>
                  <td className="td text-right">{money(f.precio_costo)}</td>
                  <td className="td text-right font-bold">{money(Number.isFinite(n) ? n * f.precio_costo : 0)}</td>
                  {editable && <td className="td text-right"><button className="btn btn-sm btn-ghost text-peligro-600" onClick={() => { setFilas((fs) => fs.filter((_, k) => k !== i)); setDirty(true); }} aria-label={`Quitar ${f.nombre}`}><Trash2 className="h-4 w-4" /></button></td>}
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><td className="td text-right text-lg font-bold" colSpan={5}>Total estimado</td><td className="td text-right text-xl font-black text-brand-800">{money(total)}</td>{editable && <td className="td" />}</tr></tfoot>
        </table>
        {editable && (
          <div className="flex flex-wrap items-center gap-2 border-t border-crema-200 p-4">
            <select className="field !w-auto min-w-[16rem]" value={agregarId} onChange={(e) => setAgregarId(e.target.value)} aria-label="Agregar producto al pedido">
              <option value="">Agregar otro producto…</option>
              {disponibles.map((c) => <option key={c.id_producto} value={c.id_producto}>{c.nombre}</option>)}
            </select>
            <button className="btn btn-md btn-secondary" disabled={!agregarId} onClick={() => {
              const c = catalogo.find((x) => x.id_producto === Number(agregarId));
              if (c) { setFilas((fs) => [...fs, { id_producto: c.id_producto, nombre: c.nombre, tipo_venta: c.tipo_venta, stock_actual: c.stock_actual, precio_costo: c.precio_costo, cant: String(c.cantidad_sugerida ?? 1), obs: '' }]); setDirty(true); setAgregarId(''); }
            }}><Plus className="h-4 w-4" /> Agregar</button>
            <button className="btn btn-md btn-primary ml-auto" disabled={!dirty || busy === 'guardar'} onClick={() => guardar()}>{busy === 'guardar' ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Guardar cambios</button>
          </div>
        )}
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap gap-3">
          {siguiente && p.estado !== 'GENERADO' && (
            <button className="btn btn-lg btn-primary" disabled={!!busy} onClick={() => setAvanzar(true)}>{busy === 'avanzar' ? <Spinner /> : <ArrowRight className="h-5 w-5" />} {labelAvanzar}</button>
          )}
          {p.estado === 'GENERADO' && <p className="rounded-xl bg-alerta-50 px-4 py-3 font-semibold text-alerta-700">Descargá el PDF o el Excel para pasar el pedido a «Exportado».</p>}
          {p.estado === 'ENTREGADO' && <button className="btn btn-lg btn-primary" onClick={() => nav(`/compras/ingreso?pedido=${p.id_pedido}`)}><PackagePlus className="h-5 w-5" /> Registrar ingreso</button>}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-crema-200 pt-4">
          <button className="btn btn-md btn-secondary" disabled={!exportable || !!busy} onClick={() => descargarFormato('pdf')}>{busy === 'pdf' ? <Spinner className="h-4 w-4" /> : <FileText className="h-5 w-5" />} Descargar PDF</button>
          <button className="btn btn-md btn-secondary" disabled={!exportable || !!busy} onClick={() => descargarFormato('excel')}>{busy === 'excel' ? <Spinner className="h-4 w-4" /> : <FileSpreadsheet className="h-5 w-5" />} Descargar Excel</button>
          <button className="btn btn-md btn-secondary" disabled={!exportable || !!busy} onClick={imprimir}><Printer className="h-5 w-5" /> Imprimir</button>
          <button className="btn btn-md btn-secondary" disabled={!exportable || !!busy} onClick={enviarWhatsApp}>{busy === 'wsp' ? <Spinner className="h-4 w-4" /> : <MessageCircle className="h-5 w-5 text-brand-600" />} Enviar por WhatsApp</button>
          <button className="btn btn-md btn-secondary" disabled={!exportable || !!busy} onClick={enviarCorreo}>{busy === 'mail' ? <Spinner className="h-4 w-4" /> : <Mail className="h-5 w-5" />} Enviar por correo</button>
          <button className="btn btn-md btn-ghost ml-auto" disabled={!!busy} onClick={duplicar}><Copy className="h-5 w-5" /> Duplicar pedido</button>
        </div>
        {!exportable && <p className="text-sm text-ink-500">Primero generá el pedido para poder exportarlo y enviarlo.</p>}
        {!p.telefono_whatsapp && exportable && <p className="text-sm text-alerta-700">Cargá el WhatsApp del intermediario en la sección «Intermediario» para abrir el chat directo.</p>}
      </section>

      <ConfirmModal open={avanzar} title={labelAvanzar} confirmLabel="Confirmar" onCancel={() => setAvanzar(false)} onConfirm={hacerAvanzar}
        text={<>El pedido pasa de <b>{estadoPedidoLabel[p.estado]}</b> a <b>{siguiente ? estadoPedidoLabel[siguiente] : ''}</b>. Los estados avanzan en orden y no se puede volver atrás.</>} />
    </div>
  );
}
