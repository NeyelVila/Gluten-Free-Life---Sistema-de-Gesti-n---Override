import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, PackagePlus, ShoppingBasket } from 'lucide-react';
import { Badge, Empty, ErrorBox, Loading, PageHeader, Spinner, Tabs, useAsync } from '../components/ui';
import { errMsg, get, post } from '../lib/api';
import { estadoPedidoLabel, fechaHora, money } from '../lib/format';
import { numPedido, type PedidoResumen } from '../lib/pedidos';
import type { EstadoPedido } from '../lib/types';
import { toast } from '../store/stores';

type Tab = 'pendientes' | 'enviados' | 'historial';
const GRUPOS: Record<Tab, EstadoPedido[]> = {
  pendientes: ['EN_PREPARACION', 'GENERADO'],
  enviados: ['EXPORTADO', 'ENVIADO', 'EN_GESTION'],
  historial: ['ENTREGADO', 'FINALIZADO'],
};
export const tonoEstado = (e: EstadoPedido) =>
  e === 'FINALIZADO' ? 'mute' : e === 'ENTREGADO' ? 'ok' : e === 'EN_PREPARACION' || e === 'GENERADO' ? 'warn' : 'info';

export default function Compras() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('pendientes');
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useAsync(() => get<PedidoResumen[]>('/pedidos'), []);

  async function generar() {
    setBusy(true);
    try {
      const r = await post<{ pedido: { id_pedido: number }; creado: boolean; agregados: number }>('/pedidos/consolidar', {});
      toast.ok(r.creado ? 'Pedido generado' : 'Pedido actualizado', r.creado ? 'Se armó con todos los productos en stock crítico.' : `Se sumaron ${r.agregados} producto(s) al pedido en preparación.`);
      nav(`/compras/${r.pedido.id_pedido}`);
    } catch (e) { toast.warn('No se pudo generar el pedido', errMsg(e)); } finally { setBusy(false); }
  }

  const lista = (data ?? []).filter((p) => GRUPOS[tab].includes(p.estado));
  const cuenta = (t: Tab) => (data ?? []).filter((p) => GRUPOS[t].includes(p.estado)).length;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader title="Pedidos de compra" subtitle="Todos los pedidos van al intermediario logístico: un solo pedido, exportable a PDF o Excel."
        actions={<>
          <button className="btn btn-md btn-secondary" onClick={() => nav('/compras/ingreso')}><PackagePlus className="h-5 w-5" /> Registrar ingreso</button>
          <button className="btn btn-lg btn-primary" disabled={busy} onClick={generar}>{busy ? <Spinner /> : <ClipboardList className="h-5 w-5" />} + Generar pedido</button>
        </>} />
      <div className="mb-4">
        <Tabs<Tab> value={tab} onChange={setTab} items={[
          { id: 'pendientes', label: 'Pedidos pendientes', badge: cuenta('pendientes') },
          { id: 'enviados', label: 'Pedidos enviados', badge: cuenta('enviados') },
          { id: 'historial', label: 'Entregados e Historial' },
        ]} />
      </div>
      {loading && !data ? <Loading /> : error && !data ? <ErrorBox msg={error} onRetry={reload} /> : (
        <div className="card overflow-x-auto">
          {lista.length === 0 ? (
            <Empty icon={<ShoppingBasket className="h-12 w-12" />} title="No hay pedidos en esta pestaña"
              text={tab === 'pendientes' ? 'Generá un pedido con los productos en stock crítico.' : undefined} />
          ) : (
            <table className="w-full min-w-[44rem] text-[15px]">
              <thead><tr><th className="th">Pedido</th><th className="th">Fecha</th><th className="th">Estado</th><th className="th !text-right">Productos</th><th className="th !text-right">Total estimado</th><th className="th" /></tr></thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id_pedido} className="cursor-pointer hover:bg-brand-50/60" onClick={() => nav(`/compras/${p.id_pedido}`)}>
                    <td className="td font-bold">N° {numPedido(p.id_pedido)}</td>
                    <td className="td text-ink-500">{fechaHora(p.fecha_generacion)}</td>
                    <td className="td"><Badge tone={tonoEstado(p.estado)}>{estadoPedidoLabel[p.estado]}</Badge></td>
                    <td className="td text-right">{p.productos}</td>
                    <td className="td text-right font-bold">{money(p.total_estimado)}</td>
                    <td className="td text-right"><span className="btn btn-sm btn-secondary">Abrir</span></td>
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
