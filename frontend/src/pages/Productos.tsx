import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Badge, ConfirmModal, Empty, ErrorBox, Loading, PageHeader, useAsync, useDebounced } from '../components/ui';
import ProductoForm from '../components/ProductoForm';
import { del, errMsg } from '../lib/api';
import { cargarProductos } from '../lib/productosData';
import { money, num } from '../lib/format';
import { refrescarCache } from '../lib/sync';
import type { Producto } from '../lib/types';
import { toast } from '../store/stores';

export default function Productos() {
  const nav = useNavigate();
  const [buscar, setBuscar] = useState('');
  const b = useDebounced(buscar);
  const { data, error, loading, reload } = useAsync(() => cargarProductos({ buscar: b }), [b]);
  const [editar, setEditar] = useState<Producto | null>(null);
  const [crear, setCrear] = useState(false);
  const [borrar, setBorrar] = useState<Producto | null>(null);
  const [busy, setBusy] = useState(false);

  async function eliminar() {
    if (!borrar) return;
    setBusy(true);
    try {
      await del(`/productos/${borrar.id_producto}`);
      toast.ok('Producto dado de baja', `${borrar.nombre} ya no aparece en el catálogo. El historial se conserva.`);
      refrescarCache(true).catch(() => undefined);
      setBorrar(null);
      reload();
    } catch (e) {
      toast.error('No se pudo dar de baja', errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="Productos y precios"
        subtitle="Costos, márgenes y precios de venta"
        actions={
          <>
            <button className="btn btn-md btn-secondary" onClick={() => nav('/productos/importar')}><FileSpreadsheet className="h-5 w-5" /> Importar catálogo (Excel)</button>
            <button className="btn btn-md btn-primary" onClick={() => setCrear(true)}><Plus className="h-5 w-5" /> Nuevo producto</button>
          </>
        }
      />
      <div className="card mb-4 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500" />
          <input className="field" style={{ paddingLeft: '2.75rem' }} placeholder="Buscar por nombre o código…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>
      </div>
      {data?.fromCache && <p className="mb-3 rounded-xl bg-alerta-50 px-4 py-2.5 text-sm font-semibold text-alerta-700">Sin conexión: solo lectura. Para modificar precios se necesita conexión.</p>}
      {loading && !data ? <Loading /> : error && !data ? <ErrorBox msg={error} onRetry={reload} /> : (
        <div className="card overflow-x-auto">
          {data!.items.length === 0 ? <Empty title="No hay productos" text="Creá uno nuevo o importá tu catálogo desde Excel." /> : (
            <table className="w-full min-w-[56rem] text-[15px]">
              <thead>
                <tr>
                  <th className="th">Código</th><th className="th">Producto</th><th className="th">Categoría</th>
                  <th className="th !text-right">Costo</th><th className="th !text-right">Margen</th><th className="th !text-right">Precio venta</th>
                  <th className="th">Modalidad</th><th className="th" />
                </tr>
              </thead>
              <tbody>
                {data!.items.map((p) => (
                  <tr key={p.id_producto} className="hover:bg-brand-50/60">
                    <td className="td font-mono text-sm text-ink-500">{p.codigo_barra ?? '—'}</td>
                    <td className="td font-bold">{p.nombre}</td>
                    <td className="td text-ink-500">{p.categoria}</td>
                    <td className="td text-right">{money(p.precio_costo)}</td>
                    <td className="td text-right">{num(p.porcentaje_margen)}%</td>
                    <td className="td text-right text-lg font-extrabold text-brand-800">{money(p.precio_venta)}{p.tipo_venta === 'GRANEL' ? '/kg' : ''}</td>
                    <td className="td"><Badge tone={p.tipo_venta === 'GRANEL' ? 'info' : 'mute'}>{p.tipo_venta === 'GRANEL' ? 'Granel' : 'Unidad'}</Badge></td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditar(p)} disabled={data!.fromCache}><Pencil className="h-4 w-4" /> Editar</button>
                        <button className="btn btn-sm btn-ghost text-peligro-600" onClick={() => setBorrar(p)} disabled={data!.fromCache} aria-label={`Dar de baja ${p.nombre}`}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <ProductoForm open={crear || !!editar} producto={editar} onClose={() => { setCrear(false); setEditar(null); }} onSaved={() => { setCrear(false); setEditar(null); reload(); }} />
      <ConfirmModal open={!!borrar} title="Dar de baja el producto" tone="danger" confirmLabel="Dar de baja" busy={busy} onCancel={() => setBorrar(null)} onConfirm={eliminar}
        text={<>¿Querés dar de baja <b>{borrar?.nombre}</b>? Dejará de aparecer en el catálogo y en el Punto de Venta. Las ventas e ingresos anteriores se conservan.</>} />
    </div>
  );
}
