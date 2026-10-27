import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Plus, Search, WifiOff } from 'lucide-react';
import { Empty, ErrorBox, Loading, PageHeader, StockBadge, cx, useAsync, useDebounced } from '../components/ui';
import ProductoForm from '../components/ProductoForm';
import { get } from '../lib/api';
import { cargarProductos } from '../lib/productosData';
import { fechaCorta, money, num, unidadDe } from '../lib/format';

export default function Inventario() {
  const nav = useNavigate();
  const [buscar, setBuscar] = useState('');
  const [categoria, setCategoria] = useState('');
  const [tipoVenta, setTipoVenta] = useState('');
  const [estado, setEstado] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const b = useDebounced(buscar);
  const { data, error, loading, reload } = useAsync(() => cargarProductos({ buscar: b, categoria, tipoVenta, estado }), [b, categoria, tipoVenta, estado]);

  useEffect(() => { get<string[]>('/productos/categorias').then(setCats).catch(() => undefined); }, []);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="Inventario"
        subtitle="Stock actual de todos los productos"
        actions={
          <>
            <button className="btn btn-md btn-secondary" onClick={() => nav('/productos/importar')}><FileSpreadsheet className="h-5 w-5" /> Importar desde Excel</button>
            <button className="btn btn-md btn-primary" onClick={() => setNuevo(true)}><Plus className="h-5 w-5" /> Nuevo producto</button>
          </>
        }
      />
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500" />
          <input className="field" style={{ paddingLeft: '2.75rem' }} placeholder="Buscar por nombre o código…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>
        <select className="field !w-auto" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="field !w-auto" value={tipoVenta} onChange={(e) => setTipoVenta(e.target.value)} aria-label="Modalidad">
          <option value="">Unidad y Granel</option>
          <option value="UNIDAD">Unidad</option>
          <option value="GRANEL">Granel</option>
        </select>
        <select className="field !w-auto" value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado de stock">
          <option value="">Todo el stock</option>
          <option value="critico">Stock crítico</option>
          <option value="normal">Stock normal</option>
        </select>
      </div>

      {data?.fromCache && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-alerta-50 px-4 py-2.5 text-sm font-semibold text-alerta-700"><WifiOff className="h-4 w-4" /> Sin conexión: mostrando los datos guardados en este equipo (solo lectura).</p>
      )}
      {loading && !data ? <Loading /> : error && !data ? <ErrorBox msg={error} onRetry={reload} /> : (
        <div className="card overflow-x-auto">
          {data!.items.length === 0 ? (
            <Empty title="No hay productos que coincidan" text="Probá con otra búsqueda o quitá los filtros." />
          ) : (
            <table className="w-full min-w-[56rem] text-[15px]">
              <thead>
                <tr>
                  {['Producto', 'Categoría', 'Stock', 'Unidad', 'Stock mínimo', 'Precio', 'Próx. vencimiento', 'Estado'].map((h, i) => (
                    <th key={h} className={cx('th', [2, 4, 5].includes(i) && '!text-right')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data!.items.map((p) => (
                  <tr key={p.id_producto} className="cursor-pointer transition hover:bg-brand-50/60" onClick={() => nav(`/inventario/${p.id_producto}`)}>
                    <td className="td font-bold">{p.nombre}</td>
                    <td className="td text-ink-500">{p.categoria}</td>
                    <td className={cx('td text-right text-lg font-extrabold', p.estado === 'CRITICO' && 'text-peligro-600')}>{num(p.stock_actual)}</td>
                    <td className="td">{p.tipo_venta === 'GRANEL' ? 'Granel (kg)' : 'Unidad'}</td>
                    <td className="td text-right text-ink-500">{num(p.stock_minimo)} {unidadDe(p.tipo_venta)}</td>
                    <td className="td text-right">{money(p.precio_venta)}{p.tipo_venta === 'GRANEL' ? '/kg' : ''}</td>
                    <td className="td text-ink-500">{fechaCorta(p.proximo_vencimiento)}</td>
                    <td className="td"><StockBadge estado={p.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <ProductoForm open={nuevo} producto={null} onClose={() => setNuevo(false)} onSaved={() => { setNuevo(false); reload(); }} />
    </div>
  );
}
