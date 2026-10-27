import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, PackageCheck, Plus } from 'lucide-react';
import { Badge, Empty, ErrorBox, Loading, PageHeader, Spinner, useAsync } from '../components/ui';
import { errMsg, get, post } from '../lib/api';
import { num, unidadDe } from '../lib/format';
import type { Producto } from '../lib/types';
import { toast } from '../store/stores';

export default function StockCritico() {
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(() => get<Producto[]>('/stock-critico'), []);
  const [busyId, setBusyId] = useState<number | 'all' | null>(null);

  async function agregar(ids?: number[]) {
    setBusyId(ids?.length === 1 ? ids[0] : 'all');
    try {
      const r = await post<{ pedido: { id_pedido: number }; agregados: number }>('/pedidos/consolidar', ids ? { id_productos: ids } : {});
      if (!ids) {
        toast.ok('Pedido generado', 'Revisá las cantidades y exportalo para enviárselo al intermediario.');
        nav(`/compras/${r.pedido.id_pedido}`);
      } else {
        toast.ok(r.agregados ? 'Agregado al pedido' : 'Ya estaba en el pedido', `Pedido #${r.pedido.id_pedido} en preparación.`);
        reload();
      }
    } catch (e) { toast.error('No se pudo armar el pedido', errMsg(e)); } finally { setBusyId(null); }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader title="Reposición necesaria" subtitle="Productos con stock igual o por debajo del mínimo. Todo se pide al intermediario logístico."
        actions={<button className="btn btn-lg btn-primary" disabled={!data?.length || busyId !== null} onClick={() => agregar()}>{busyId === 'all' ? <Spinner /> : <ClipboardList className="h-5 w-5" />} Generar pedido</button>} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorBox msg={error} onRetry={reload} /> : (
        <div className="card overflow-x-auto">
          {data!.length === 0 ? <Empty icon={<PackageCheck className="h-12 w-12" />} title="Todo el stock está en orden" text="Ningún producto está por debajo de su mínimo." /> : (
            <table className="w-full min-w-[44rem] text-[15px]">
              <thead><tr><th className="th">Producto</th><th className="th !text-right">Stock actual</th><th className="th !text-right">Stock mínimo</th><th className="th !text-right">Cantidad sugerida</th><th className="th" /></tr></thead>
              <tbody>
                {data!.map((p) => (
                  <tr key={p.id_producto} className="bg-peligro-50/40">
                    <td className="td"><button className="font-bold hover:underline" onClick={() => nav(`/inventario/${p.id_producto}`)}>🔴 {p.nombre}</button><div className="text-xs text-ink-500">{p.categoria}</div></td>
                    <td className="td text-right text-lg font-extrabold text-peligro-600">{num(p.stock_actual)} {unidadDe(p.tipo_venta)}</td>
                    <td className="td text-right text-ink-500">{num(p.stock_minimo)} {unidadDe(p.tipo_venta)}</td>
                    <td className="td text-right font-bold">{num(p.cantidad_sugerida ?? 0)} {unidadDe(p.tipo_venta)}</td>
                    <td className="td text-right">
                      {p.en_pedido ? <Badge tone="ok">✔ En el pedido</Badge> : (
                        <button className="btn btn-sm btn-secondary" disabled={busyId !== null} onClick={() => agregar([p.id_producto])}>{busyId === p.id_producto ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Agregar al pedido</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
