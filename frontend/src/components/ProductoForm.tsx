import { useEffect, useMemo, useState } from 'react';
import { Field, Modal, Spinner, cx } from './ui';
import { errMsg, post, put, get } from '../lib/api';
import { money, parseDecimal, num } from '../lib/format';
import { refrescarCache } from '../lib/sync';
import type { Producto, TipoVenta } from '../lib/types';
import { toast } from '../store/stores';

const sugerido = (costo: number, margen: number) => Math.round(costo * (1 + margen / 100));

interface Props {
  open: boolean;
  producto: Producto | null; // null = nuevo
  onClose: () => void;
  onSaved: (p: Producto) => void;
}

export default function ProductoForm({ open, producto, onClose, onSaved }: Props) {
  const nuevo = !producto;
  const [f, setF] = useState({ codigo: '', nombre: '', categoria: '', tipo: 'UNIDAD' as TipoVenta, costo: '', margen: '40', precio: '', minimo: '', stock: '0' });
  const [precioManual, setPrecioManual] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [cats, setCats] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setErrs({});
    if (producto) {
      setF({
        codigo: producto.codigo_barra ?? '', nombre: producto.nombre, categoria: producto.categoria, tipo: producto.tipo_venta,
        costo: String(producto.precio_costo), margen: String(producto.porcentaje_margen), precio: String(producto.precio_venta),
        minimo: String(producto.stock_minimo), stock: String(producto.stock_actual),
      });
      setPrecioManual(Math.abs(producto.precio_venta - sugerido(producto.precio_costo, producto.porcentaje_margen)) > 1);
    } else {
      setF({ codigo: '', nombre: '', categoria: '', tipo: 'UNIDAD', costo: '', margen: '40', precio: '', minimo: '2', stock: '0' });
      setPrecioManual(false);
    }
    get<string[]>('/productos/categorias').then(setCats).catch(() => undefined);
  }, [open, producto]);

  const costoN = parseDecimal(f.costo);
  const margenN = parseDecimal(f.margen);
  const sug = Number.isFinite(costoN) && Number.isFinite(margenN) ? sugerido(costoN, margenN) : null;
  const precioN = parseDecimal(f.precio);
  const precioFinal = precioManual ? precioN : sug ?? NaN;
  const upd = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const step = useMemo(() => (f.tipo === 'GRANEL' ? 'kg' : 'unidades'), [f.tipo]);

  async function guardar() {
    const e: Record<string, string> = {};
    if (!f.nombre.trim()) e.nombre = 'El nombre es obligatorio';
    if (!f.categoria.trim()) e.categoria = 'La categoría es obligatoria';
    if (!Number.isFinite(costoN) || costoN < 0) e.costo = 'Ingresá un costo válido';
    if (!Number.isFinite(margenN) || margenN < 0) e.margen = 'Ingresá un margen válido';
    if (!Number.isFinite(precioFinal) || precioFinal < 0) e.precio = 'Ingresá un precio válido';
    const min = parseDecimal(f.minimo);
    if (!Number.isFinite(min) || min < 0) e.minimo = 'Stock mínimo inválido';
    const stock = parseDecimal(f.stock);
    if (nuevo && (!Number.isFinite(stock) || stock < 0)) e.stock = 'Stock inicial inválido';
    if (f.tipo === 'UNIDAD' && nuevo && Number.isFinite(stock) && !Number.isInteger(stock)) e.stock = 'Un producto por unidad debe tener stock entero';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const body: any = {
        codigo_barra: f.codigo.trim() || null, nombre: f.nombre.trim(), categoria: f.categoria.trim(), tipo_venta: f.tipo,
        precio_costo: costoN, porcentaje_margen: margenN, precio_venta: precioFinal, stock_minimo: min,
      };
      const saved = nuevo ? await post<Producto>('/productos', { ...body, stock_actual: stock }) : await put<Producto>(`/productos/${producto!.id_producto}`, body);
      toast.ok(nuevo ? 'Producto creado' : 'Producto actualizado', saved.nombre);
      refrescarCache(true).catch(() => undefined);
      onSaved(saved);
    } catch (err) {
      const m = errMsg(err);
      if (/Ya existe/.test(m)) setErrs({ codigo: 'Ya existe un producto con ese código' });
      else toast.error('No se pudo guardar', m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={nuevo ? 'Nuevo producto' : `Editar ${producto!.nombre}`}
      width="max-w-2xl"
      footer={
        <>
          <button className="btn btn-md btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-md btn-primary" onClick={guardar} disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Guardar</button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
        <Field label="Nombre" error={errs.nombre} className="sm:col-span-2">
          <input className={cx('field', errs.nombre && 'field-error')} value={f.nombre} onChange={(e) => upd('nombre', e.target.value)} autoFocus />
        </Field>
        <Field label="Código de barras" error={errs.codigo} hint="Opcional. Se usa con el lector del Punto de Venta.">
          <input className={cx('field', errs.codigo && 'field-error')} value={f.codigo} onChange={(e) => upd('codigo', e.target.value)} />
        </Field>
        <Field label="Categoría" error={errs.categoria}>
          <input className={cx('field', errs.categoria && 'field-error')} list="cats" value={f.categoria} onChange={(e) => upd('categoria', e.target.value)} />
          <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Modalidad de venta">
          <div className="grid grid-cols-2 gap-2">
            {(['UNIDAD', 'GRANEL'] as TipoVenta[]).map((t) => (
              <button type="button" key={t} className={cx('btn btn-md', f.tipo === t ? 'btn-primary' : 'btn-secondary')} onClick={() => upd('tipo', t)}>{t === 'UNIDAD' ? 'Unidad' : 'Granel (kg)'}</button>
            ))}
          </div>
        </Field>
        <Field label={`Stock mínimo (${step})`} error={errs.minimo}>
          <input className={cx('field', errs.minimo && 'field-error')} inputMode="decimal" value={f.minimo} onChange={(e) => upd('minimo', e.target.value)} />
        </Field>
        <Field label="Precio de costo" error={errs.costo}>
          <input className={cx('field', errs.costo && 'field-error')} inputMode="decimal" value={f.costo} onChange={(e) => upd('costo', e.target.value)} />
        </Field>
        <Field label="Margen comercial (%)" error={errs.margen}>
          <input className={cx('field', errs.margen && 'field-error')} inputMode="decimal" value={f.margen} onChange={(e) => upd('margen', e.target.value)} />
        </Field>
        <div className="rounded-xl bg-brand-50 p-3 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-brand-800">
              {sug != null ? <>Precio sugerido: <b className="text-xl">{money(sug)}{f.tipo === 'GRANEL' ? '/kg' : ''}</b> <span className="text-sm text-ink-500">(costo {money(costoN)} + margen {num(margenN)}%)</span></> : 'Cargá costo y margen para ver el precio sugerido'}
            </p>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={precioManual} onChange={(e) => { setPrecioManual(e.target.checked); if (e.target.checked && sug != null && !f.precio) upd('precio', String(sug)); }} />
              Definir el precio manualmente
            </label>
          </div>
          {precioManual && (
            <Field label="Precio de venta" error={errs.precio} className="mt-3">
              <input className={cx('field', errs.precio && 'field-error')} inputMode="decimal" value={f.precio} onChange={(e) => upd('precio', e.target.value)} />
            </Field>
          )}
        </div>
        {nuevo && (
          <Field label={`Stock inicial (${step})`} error={errs.stock} hint="Los vencimientos se cargan en la ficha del producto o al ingresar mercadería.">
            <input className={cx('field', errs.stock && 'field-error')} inputMode="decimal" value={f.stock} onChange={(e) => upd('stock', e.target.value)} />
          </Field>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
