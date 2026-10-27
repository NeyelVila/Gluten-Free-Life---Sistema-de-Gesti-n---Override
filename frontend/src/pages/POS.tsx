import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Banknote, CheckCircle2, CreditCard, Minus, Plus, Printer, ScanBarcode, Search, ShoppingCart, Smartphone, Trash2, WifiOff, X,
} from 'lucide-react';
import { ConfirmModal, Field, Modal, Spinner, cx, Badge } from '../components/ui';
import TicketPrint, { imprimirTicket } from '../components/Ticket';
import { ApiError, NetworkError, post } from '../lib/api';
import { canalLabel, money, num, parseDecimal, precioLabel, qty, unidadDe, uuid } from '../lib/format';
import { aplicarStockLocal, comercioLocal, encolarVenta, productosLocales, refrescarCache, siguienteTicketOffline } from '../lib/sync';
import type { CanalPago, Comercio, Producto, TicketData, VentaItemLocal } from '../lib/types';
import { toast, useAuth, useConn } from '../store/stores';

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

interface Resultado {
  ticket: TicketData;
  alertas: { nombre: string; stock_actual: number; stock_minimo: number }[];
  cambios: { nombre: string; antes: number; despues: number; tipo_venta: Producto['tipo_venta'] }[];
  offline: boolean;
}

export default function POS() {
  const usuario = useAuth((s) => s.usuario);
  const online = useConn((s) => s.online);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargado, setCargado] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [categoria, setCategoria] = useState<string>('');
  const [carrito, setCarrito] = useState<VentaItemLocal[]>([]);
  const [canal, setCanal] = useState<CanalPago>('EFECTIVO');
  const [recibidoTxt, setRecibidoTxt] = useState('');
  const [pesoDe, setPesoDe] = useState<Producto | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [confirmCancelar, setConfirmCancelar] = useState(false);
  const [comercio, setComercio] = useState<Comercio | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const buscarRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => setProductos((await productosLocales()).filter((p) => p.activo)), []);

  useEffect(() => {
    (async () => {
      await cargar();
      setComercio(await comercioLocal());
      setCargado(true);
      try {
        await refrescarCache(); // si hay conexión, trae precios y stock al día
        await cargar();
        setComercio(await comercioLocal());
      } catch {
        /* sin red: se usa el cache local */
      }
    })();
    const h = () => cargar();
    window.addEventListener('gfl:cache', h);
    return () => window.removeEventListener('gfl:cache', h);
  }, [cargar]);

  useEffect(() => buscarRef.current?.focus(), [cargado]);

  const porId = useMemo(() => new Map(productos.map((p) => [p.id_producto, p])), [productos]);
  const categorias = useMemo(() => [...new Set(productos.map((p) => p.categoria))].sort(), [productos]);

  const filtrados = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    return productos
      .filter((p) => (!categoria || p.categoria === categoria) && (!t || p.nombre.toLowerCase().includes(t) || (p.codigo_barra ?? '').toLowerCase().startsWith(t)))
      .slice(0, 80);
  }, [productos, buscar, categoria]);

  const total = r2(carrito.reduce((s, i) => s + r2(i.cantidad * i.precio), 0));
  const recibido = parseDecimal(recibidoTxt);
  const vuelto = canal === 'EFECTIVO' && Number.isFinite(recibido) ? r2(recibido - total) : null;
  const efectivoOk = canal !== 'EFECTIVO' || recibidoTxt.trim() === '' || (Number.isFinite(recibido) && recibido >= total);
  const puedeConfirmar = carrito.length > 0 && !busy && efectivoOk && !resultado;

  const enCarrito = (id: number) => carrito.find((i) => i.id_producto === id)?.cantidad ?? 0;

  /** Agrega `cant` al carrito validando stock (mensaje claro si no alcanza). */
  function agregar(p: Producto, cant: number) {
    const actual = enCarrito(p.id_producto);
    const nueva = r3(actual + cant);
    if (nueva > p.stock_actual + 1e-9) {
      toast.error(`Stock insuficiente de ${p.nombre}`, `Disponible: ${qty(p.stock_actual, p.tipo_venta)}${actual ? ` (ya agregaste ${qty(actual, p.tipo_venta)})` : ''}. Modificá la cantidad.`);
      return false;
    }
    setCarrito((c) => {
      const ex = c.find((i) => i.id_producto === p.id_producto);
      if (ex) return c.map((i) => (i.id_producto === p.id_producto ? { ...i, cantidad: nueva } : i));
      return [...c, { id_producto: p.id_producto, nombre: p.nombre, tipo_venta: p.tipo_venta, precio: p.precio_venta, cantidad: nueva }];
    });
    setFlash(p.id_producto);
    setTimeout(() => setFlash((f) => (f === p.id_producto ? null : f)), 900);
    return true;
  }

  function elegir(p: Producto) {
    if (p.stock_actual <= 0) return toast.warn(`${p.nombre} sin stock`, 'No hay unidades disponibles para vender.');
    if (p.tipo_venta === 'GRANEL') setPesoDe(p);
    else agregar(p, 1);
  }

  function fijarCantidad(id: number, cant: number) {
    const p = porId.get(id);
    if (!p) return;
    if (cant <= 0) return setCarrito((c) => c.filter((i) => i.id_producto !== id));
    if (p.tipo_venta === 'UNIDAD' && !Number.isInteger(cant)) return toast.error('Este producto se vende por unidad', 'Ingresá una cantidad entera.');
    if (cant > p.stock_actual + 1e-9) {
      toast.error(`Stock insuficiente de ${p.nombre}`, `Disponible: ${qty(p.stock_actual, p.tipo_venta)}. Modificá la cantidad.`);
      return;
    }
    setCarrito((c) => c.map((i) => (i.id_producto === id ? { ...i, cantidad: r3(cant) } : i)));
  }

  function onBuscarEnter() {
    const t = buscar.trim();
    if (!t) return;
    const exacto = productos.find((p) => p.codigo_barra === t);
    const elegido = exacto ?? (filtrados.length === 1 ? filtrados[0] : null);
    if (elegido) {
      elegir(elegido);
      setBuscar('');
    } else if (!filtrados.length) {
      toast.warn('Producto no encontrado', `No hay ningún producto con "${t}".`);
    }
  }

  function nuevaVenta() {
    setCarrito([]);
    setRecibidoTxt('');
    setCanal('EFECTIVO');
    setResultado(null);
    setBuscar('');
    setTimeout(() => buscarRef.current?.focus(), 50);
  }

  async function confirmar() {
    if (!puedeConfirmar) return;
    setBusy(true);
    const items = carrito.map((i) => ({ ...i }));
    const recibidoNum = canal === 'EFECTIVO' ? (Number.isFinite(recibido) ? recibido : total) : null;
    const clienteId = uuid();
    const ahora = new Date().toISOString();
    const stockAntes = new Map(items.map((i) => [i.id_producto, porId.get(i.id_producto)?.stock_actual ?? 0]));

    const ticketBase = (numero: string, vueltoFinal: number | null, offline: boolean): TicketData => ({
      numero,
      fecha_hora: ahora,
      canal_pago: canal,
      total,
      monto_recibido: recibidoNum,
      vuelto: vueltoFinal,
      offline,
      usuario: usuario?.nombre,
      items: items.map((i) => ({ nombre: i.nombre, tipo_venta: i.tipo_venta, cantidad: i.cantidad, precio: i.precio, subtotal: r2(i.cantidad * i.precio) })),
    });

    async function guardarOffline() {
      const numero = await siguienteTicketOffline();
      const vueltoOff = recibidoNum != null ? r2(recibidoNum - total) : null;
      await encolarVenta({
        uuid_cliente: clienteId,
        fecha_hora: ahora,
        canal_pago: canal,
        monto_recibido: recibidoNum,
        total,
        vuelto: vueltoOff,
        ticket_local: numero,
        estado: 'pendiente',
        items: items.map((i) => ({ id_producto: i.id_producto, nombre: i.nombre, tipo_venta: i.tipo_venta, cantidad: i.cantidad, precio_unit: i.precio })),
      });
      const alertas: Resultado['alertas'] = [];
      const cambios: Resultado['cambios'] = [];
      for (const i of items) {
        const antes = stockAntes.get(i.id_producto) ?? 0;
        const despues = Math.max(0, r3(antes - i.cantidad));
        const p = porId.get(i.id_producto);
        cambios.push({ nombre: i.nombre, antes, despues, tipo_venta: i.tipo_venta });
        if (p && despues <= p.stock_minimo) alertas.push({ nombre: i.nombre, stock_actual: despues, stock_minimo: p.stock_minimo });
      }
      setResultado({ ticket: ticketBase(numero, vueltoOff, true), alertas, cambios, offline: true });
      toast.info('Venta guardada sin conexión', 'Se sincronizará automáticamente cuando vuelva Internet.');
    }

    try {
      if (!online) {
        await guardarOffline();
      } else {
        try {
          const r = await post<any>('/ventas', {
            uuid_cliente: clienteId,
            canal_pago: canal,
            monto_recibido: recibidoNum ?? undefined,
            items: items.map((i) => ({ id_producto: i.id_producto, cantidad: i.cantidad })),
          });
          await aplicarStockLocal(r.stock_actualizado);
          setResultado({
            ticket: ticketBase(String(r.venta.numero_ticket).padStart(5, '0'), r.vuelto, false),
            alertas: r.alertas_stock_critico,
            cambios: items.map((i) => ({
              nombre: i.nombre,
              tipo_venta: i.tipo_venta,
              antes: stockAntes.get(i.id_producto) ?? 0,
              despues: r.stock_actualizado.find((s: any) => s.id_producto === i.id_producto)?.stock_actual ?? 0,
            })),
            offline: false,
          });
          if (r.alertas_stock_critico.length) toast.warn('Stock crítico', r.alertas_stock_critico.map((a: any) => a.nombre).join(', '));
        } catch (e) {
          if (e instanceof NetworkError) {
            useConn.getState().set({ online: false });
            await guardarOffline(); // el POS nunca se bloquea
          } else if (e instanceof ApiError && e.status === 409) {
            toast.error('No se pudo confirmar la venta', e.message);
            await refrescarCache(true).catch(() => undefined);
            await cargar();
          } else throw e;
        }
      }
    } catch (e) {
      toast.error('No se pudo registrar la venta', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  // ─── Atajos de teclado: F2 buscar · F4 efectivo · F5 digital · Enter confirmar · Esc cancelar ───
  const estado = { puedeConfirmar, pesoDe, resultado, confirmCancelar, buscar, carrito: carrito.length };
  const ref = useRef(estado);
  ref.current = estado;
  const confirmarRef = useRef(confirmar);
  confirmarRef.current = confirmar;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const s = ref.current;
      if (e.key === 'F2') { e.preventDefault(); buscarRef.current?.focus(); buscarRef.current?.select(); }
      else if (e.key === 'F4') { e.preventDefault(); if (!s.resultado) setCanal('EFECTIVO'); }
      else if (e.key === 'F5') { e.preventDefault(); if (!s.resultado) setCanal((c) => (c === 'EFECTIVO' ? 'MERCADO_PAGO' : c)); }
      else if (e.key === 'Enter') {
        const el = document.activeElement as HTMLElement | null;
        if (s.resultado) { e.preventDefault(); nuevaVenta(); return; }
        if (s.pesoDe || s.confirmCancelar || el === buscarRef.current || el?.tagName === 'BUTTON') return;
        if (s.puedeConfirmar) { e.preventDefault(); confirmarRef.current(); }
      } else if (e.key === 'Escape') {
        if (s.resultado || s.pesoDe || s.confirmCancelar) return; // los modales manejan su propio Esc
        if (s.buscar) setBuscar('');
        else if (s.carrito) setConfirmCancelar(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (!cargado) return <div className="grid h-full place-items-center"><Spinner className="h-8 w-8 text-brand-600" /></div>;

  return (
    <div className="flex h-full">
      {/* ─── Productos ─── */}
      <section className="flex min-w-0 flex-1 flex-col p-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-ink-500" />
            <input
              ref={buscarRef}
              className="field !rounded-2xl !py-4 !pl-13 text-xl"
              style={{ paddingLeft: '3.25rem' }}
              placeholder="Buscar producto o escanear código..."
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onBuscarEnter()}
              inputMode="search"
              autoComplete="off"
              aria-label="Buscar producto o escanear código"
            />
          </div>
          <button className="btn btn-lg btn-secondary" onClick={() => { buscarRef.current?.focus(); toast.info('Lector de código de barras', 'Escaneá el producto: el lector USB escribe el código y presiona Enter.'); }} title="Lector de código de barras">
            <ScanBarcode className="h-6 w-6" />
          </button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <button className={cx('rounded-full px-4 py-1.5 text-sm font-bold', !categoria ? 'bg-brand-600 text-white' : 'bg-white text-ink-700 hover:bg-brand-50')} onClick={() => setCategoria('')}>Todas</button>
          {categorias.map((c) => (
            <button key={c} className={cx('rounded-full px-4 py-1.5 text-sm font-bold', categoria === c ? 'bg-brand-600 text-white' : 'bg-white text-ink-700 hover:bg-brand-50')} onClick={() => setCategoria(c === categoria ? '' : c)}>{c}</button>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto pb-4 xl:grid-cols-3 2xl:grid-cols-4">
          {filtrados.length === 0 && <p className="col-span-full py-10 text-center text-ink-500">No hay productos para mostrar.</p>}
          {filtrados.map((p) => {
            const sinStock = p.stock_actual <= 0;
            const critico = p.stock_actual <= p.stock_minimo;
            const yaEn = enCarrito(p.id_producto);
            return (
              <button
                key={p.id_producto}
                onClick={() => elegir(p)}
                disabled={sinStock}
                className={cx(
                  'card relative flex flex-col items-start gap-1 p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50',
                  flash === p.id_producto && 'animate-flash',
                  yaEn > 0 && 'border-brand-500 ring-2 ring-brand-200'
                )}
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <span className="text-[17px] font-bold leading-tight">{p.nombre}</span>
                  <Badge tone={p.tipo_venta === 'GRANEL' ? 'info' : 'mute'}>{p.tipo_venta === 'GRANEL' ? 'Granel' : 'Unidad'}</Badge>
                </div>
                <span className="text-xs font-semibold text-ink-500">{p.categoria}</span>
                <span className="mt-1 text-2xl font-extrabold text-brand-800">{precioLabel(p.precio_venta, p.tipo_venta)}</span>
                <span className={cx('text-sm font-semibold', sinStock ? 'text-peligro-600' : critico ? 'text-alerta-700' : 'text-ink-500')}>
                  {sinStock ? 'Sin stock' : `Stock: ${qty(p.stock_actual, p.tipo_venta)}`}{critico && !sinStock ? ' · ⚠ crítico' : ''}
                </span>
                {yaEn > 0 && <span className="absolute -right-2 -top-2 rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-bold text-white shadow">{num(yaEn)}</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-ink-500">
          Atajos: <span className="kbd">F2</span> buscar · <span className="kbd">F4</span> efectivo · <span className="kbd">F5</span> digital · <span className="kbd">Enter</span> confirmar · <span className="kbd">Esc</span> cancelar
        </p>
      </section>

      {/* ─── Venta actual ─── */}
      <aside className="flex w-[27rem] shrink-0 flex-col border-l border-crema-200 bg-white">
        <div className="flex items-center justify-between border-b border-crema-200 px-5 py-4">
          <h2 className="flex items-center gap-2 text-xl font-extrabold"><ShoppingCart className="h-6 w-6 text-brand-600" /> Venta actual</h2>
          {!online ? (
            <Badge tone="warn"><WifiOff className="h-3.5 w-3.5" /> Modo offline</Badge>
          ) : (
            <Badge tone="ok">🟢 Sistema operativo</Badge>
          )}
        </div>
        {!online && (
          <p className="bg-alerta-50 px-5 py-2 text-sm font-semibold text-alerta-700">🟠 Las ventas se guardarán y sincronizarán automáticamente.</p>
        )}

        <div className="flex-1 overflow-y-auto">
          {carrito.length === 0 ? (
            <div className="grid h-full place-items-center px-8 text-center text-ink-500">
              <div>
                <ShoppingCart className="mx-auto mb-3 h-12 w-12 text-brand-200" />
                <p className="text-lg font-bold text-ink-700">El carrito está vacío</p>
                <p>Escaneá un código o tocá un producto para empezar.</p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-crema-200">
              {carrito.map((i) => (
                <li key={i.id_producto} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{i.nombre}</p>
                      <p className="text-sm text-ink-500">{precioLabel(i.precio, i.tipo_venta)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-extrabold">{money(r2(i.cantidad * i.precio))}</p>
                      <button className="text-peligro-600 hover:text-peligro-700" onClick={() => setCarrito((c) => c.filter((x) => x.id_producto !== i.id_producto))} aria-label={`Quitar ${i.nombre}`}>
                        <Trash2 className="ml-auto h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button className="btn btn-sm btn-secondary !px-2.5" onClick={() => fijarCantidad(i.id_producto, r3(i.cantidad - (i.tipo_venta === 'GRANEL' ? 0.1 : 1)))} aria-label="Menos"><Minus className="h-4 w-4" /></button>
                    <CantidadInput item={i} onCommit={(n) => fijarCantidad(i.id_producto, n)} />
                    <button className="btn btn-sm btn-secondary !px-2.5" onClick={() => { const p = porId.get(i.id_producto); if (p) agregar(p, i.tipo_venta === 'GRANEL' ? 0.1 : 1); }} aria-label="Más"><Plus className="h-4 w-4" /></button>
                    <span className="text-sm font-semibold text-ink-500">{unidadDe(i.tipo_venta)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t border-crema-200 bg-crema-50 p-5">
          <div className="flex items-end justify-between">
            <span className="text-lg font-bold text-ink-500">TOTAL</span>
            <span className="text-5xl font-black tracking-tight text-brand-800" aria-live="polite">{money(total)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button className={cx('btn btn-lg !flex-col !gap-1 !py-3', canal === 'EFECTIVO' ? 'btn-primary' : 'btn-secondary')} onClick={() => setCanal('EFECTIVO')}>
              <Banknote className="h-7 w-7" /> EFECTIVO <span className="text-xs font-semibold opacity-70">F4</span>
            </button>
            <button className={cx('btn btn-lg !flex-col !gap-1 !py-3', canal !== 'EFECTIVO' ? 'btn-primary' : 'btn-secondary')} onClick={() => setCanal((c) => (c === 'EFECTIVO' ? 'MERCADO_PAGO' : c))}>
              <Smartphone className="h-7 w-7" /> MP / TARJETA <span className="text-xs font-semibold opacity-70">F5</span>
            </button>
          </div>

          {canal === 'EFECTIVO' ? (
            <div className="space-y-2">
              <Field label="Dinero recibido" error={!efectivoOk ? 'El dinero recibido no alcanza para cubrir el total' : null}>
                <input
                  className={cx('field text-xl font-bold', !efectivoOk && 'field-error')}
                  inputMode="decimal"
                  value={recibidoTxt}
                  onChange={(e) => setRecibidoTxt(e.target.value)}
                  placeholder={total ? money(total) : '$ 0'}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-sm btn-secondary" onClick={() => setRecibidoTxt(String(total))} disabled={!total}>Justo</button>
                {[1000, 5000, 10000, 20000].map((m) => (
                  <button key={m} className="btn btn-sm btn-secondary" onClick={() => setRecibidoTxt(String(m))}>{money(m)}</button>
                ))}
              </div>
              <div className={cx('flex items-center justify-between rounded-xl px-4 py-2.5 text-lg font-bold', vuelto != null && vuelto >= 0 ? 'bg-brand-100 text-brand-800' : 'bg-white text-ink-500')}>
                <span>Vuelto</span>
                <span className="text-2xl">{vuelto != null && vuelto >= 0 ? money(vuelto) : '—'}</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(['MERCADO_PAGO', 'TARJETA'] as CanalPago[]).map((c) => (
                <button key={c} className={cx('btn btn-md', canal === c ? 'btn-primary' : 'btn-secondary')} onClick={() => setCanal(c)}>
                  {c === 'MERCADO_PAGO' ? <Smartphone className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />} {canalLabel[c]}
                </button>
              ))}
            </div>
          )}

          <button className="btn btn-lg btn-primary w-full !py-5 text-xl" disabled={!puedeConfirmar} onClick={confirmar}>
            {busy ? <Spinner className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />} CONFIRMAR VENTA
          </button>
          {carrito.length > 0 && (
            <button className="btn btn-sm btn-ghost w-full" onClick={() => setConfirmCancelar(true)}><X className="h-4 w-4" /> Cancelar venta</button>
          )}
        </div>
      </aside>

      <PesoModal producto={pesoDe} enCarrito={pesoDe ? enCarrito(pesoDe.id_producto) : 0} onClose={() => setPesoDe(null)} onOk={(kg) => { if (pesoDe && agregar(pesoDe, kg)) { setPesoDe(null); setBuscar(''); buscarRef.current?.focus(); } }} />

      <ConfirmModal
        open={confirmCancelar}
        title="¿Cancelar la venta?"
        text="Se va a vaciar el carrito actual. Esta acción no se puede deshacer."
        confirmLabel="Sí, cancelar venta"
        tone="danger"
        onCancel={() => setConfirmCancelar(false)}
        onConfirm={() => { setConfirmCancelar(false); nuevaVenta(); }}
      />

      <ResultadoModal resultado={resultado} onNueva={nuevaVenta} />
      <TicketPrint ticket={resultado?.ticket ?? null} comercio={comercio} />
    </div>
  );
}

function CantidadInput({ item, onCommit }: { item: VentaItemLocal; onCommit: (n: number) => void }) {
  const [txt, setTxt] = useState(num(item.cantidad));
  const [editando, setEditando] = useState(false);
  useEffect(() => { if (!editando) setTxt(num(item.cantidad)); }, [item.cantidad, editando]);
  const commit = () => {
    setEditando(false);
    const n = parseDecimal(txt);
    if (Number.isFinite(n) && n !== item.cantidad) onCommit(n);
    else setTxt(num(item.cantidad));
  };
  return (
    <input
      className="field !w-24 !px-2 !py-1.5 text-center text-lg font-bold"
      inputMode="decimal"
      value={txt}
      onFocus={(e) => { setEditando(true); e.target.select(); }}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), (e.target as HTMLInputElement).blur())}
      aria-label={`Cantidad de ${item.nombre}`}
    />
  );
}

function PesoModal({ producto, enCarrito, onClose, onOk }: { producto: Producto | null; enCarrito: number; onClose: () => void; onOk: (kg: number) => void }) {
  const [txt, setTxt] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (producto) { setTxt(''); setTimeout(() => ref.current?.focus(), 30); } }, [producto]);
  if (!producto) return null;
  const kg = parseDecimal(txt);
  const disp = r3(producto.stock_actual - enCarrito);
  const valido = Number.isFinite(kg) && kg > 0;
  const excede = valido && kg > disp + 1e-9;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Peso de ${producto.nombre}`}
      width="max-w-md"
      footer={
        <>
          <button className="btn btn-md btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-md btn-primary" disabled={!valido || excede} onClick={() => onOk(r3(kg))}>Agregar al carrito</button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); if (valido && !excede) onOk(r3(kg)); }} className="space-y-4">
        <p className="text-ink-500">Precio {precioLabel(producto.precio_venta, 'GRANEL')} · Disponible {qty(disp, 'GRANEL')}</p>
        <Field label="Peso en kg" error={excede ? `Stock insuficiente: disponible ${qty(disp, 'GRANEL')}` : null}>
          <input ref={ref} className={cx('field !py-4 text-3xl font-black', excede && 'field-error')} inputMode="decimal" placeholder="0,250" value={txt} onChange={(e) => setTxt(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {[0.1, 0.25, 0.5, 1, 2].map((v) => (
            <button type="button" key={v} className="btn btn-md btn-secondary" onClick={() => setTxt(num(v))}>{num(v)} kg</button>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3 text-lg font-bold text-brand-800">
          <span>Subtotal</span>
          <span className="text-2xl">{valido ? money(r2(kg * producto.precio_venta)) : '—'}</span>
        </div>
      </form>
    </Modal>
  );
}

function ResultadoModal({ resultado, onNueva }: { resultado: Resultado | null; onNueva: () => void }) {
  if (!resultado) return null;
  const { ticket } = resultado;
  return (
    <Modal open onClose={onNueva} title={<span className="flex items-center gap-2 text-brand-800"><CheckCircle2 className="h-6 w-6 text-brand-600" /> Venta registrada</span>} width="max-w-lg"
      footer={
        <>
          <button className="btn btn-lg btn-secondary" onClick={imprimirTicket}><Printer className="h-5 w-5" /> Imprimir ticket</button>
          <button className="btn btn-lg btn-primary" autoFocus onClick={onNueva}><ShoppingCart className="h-5 w-5" /> Nueva venta</button>
        </>
      }
    >
      <div className="space-y-4">
        {resultado.offline && (
          <p className="rounded-xl bg-alerta-50 p-3 text-sm font-semibold text-alerta-700">🟠 Venta guardada sin conexión: se sincronizará automáticamente cuando vuelva Internet.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-brand-50 p-3"><p className="text-xs font-bold uppercase text-ink-500">Total cobrado</p><p className="text-3xl font-black text-brand-800">{money(ticket.total)}</p></div>
          <div className="rounded-xl bg-crema-100 p-3"><p className="text-xs font-bold uppercase text-ink-500">Ticket N°</p><p className="text-3xl font-black">{ticket.numero}</p></div>
          <div className="rounded-xl bg-crema-100 p-3"><p className="text-xs font-bold uppercase text-ink-500">Medio de pago</p><p className="text-lg font-bold">{canalLabel[ticket.canal_pago]}</p></div>
          {ticket.canal_pago === 'EFECTIVO' && (
            <div className="rounded-xl bg-crema-100 p-3"><p className="text-xs font-bold uppercase text-ink-500">Vuelto</p><p className="text-lg font-bold">{money(ticket.vuelto ?? 0)}</p></div>
          )}
        </div>
        <div>
          <p className="mb-1.5 text-sm font-bold text-ink-700">Stock actualizado automáticamente</p>
          <ul className="space-y-1.5">
            {resultado.cambios.map((c, i) => (
              <li key={i} className="flex animate-stockdown items-center justify-between rounded-lg bg-crema-100 px-3 py-2 text-sm" style={{ animationDelay: `${i * 120}ms` }}>
                <span className="font-semibold">{c.nombre}</span>
                <span><span className="text-ink-500 line-through">{qty(c.antes, c.tipo_venta)}</span> → <b className="text-brand-800">{qty(c.despues, c.tipo_venta)}</b></span>
              </li>
            ))}
          </ul>
        </div>
        {resultado.alertas.length > 0 && (
          <div className="rounded-xl border-2 border-peligro-100 bg-peligro-50 p-3" role="alert">
            <p className="flex items-center gap-2 font-bold text-peligro-700"><AlertTriangle className="h-5 w-5" /> ¡Stock crítico!</p>
            <ul className="mt-1 text-sm text-peligro-700">
              {resultado.alertas.map((a, i) => <li key={i}>🔴 {a.nombre}: quedan {num(a.stock_actual)} (mínimo {num(a.stock_minimo)}). Ya figura en «Reposición necesaria».</li>)}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
