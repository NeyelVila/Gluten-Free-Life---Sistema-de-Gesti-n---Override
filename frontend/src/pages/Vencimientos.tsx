import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { ConfirmModal, Empty, ErrorBox, Loading, PageHeader, Tabs, VencBadge, cx, useAsync } from '../components/ui';
import { errMsg, get, post } from '../lib/api';
import { diasLabel, fechaCorta, num, unidadDe } from '../lib/format';
import { refrescarCache } from '../lib/sync';
import type { TipoVenta } from '../lib/types';
import { toast } from '../store/stores';

type Filtro = 'todos' | '7' | '30' | 'vencidos' | 'retirados';
interface Fila { id_vencimiento: number; id_producto: number; producto: string; categoria: string; tipo_venta: TipoVenta; cantidad: number; fecha_vencimiento: string; estado: string; dias_restantes: number }

export default function Vencimientos() {
  const nav = useNavigate();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const { data, error, loading, reload } = useAsync(() => get<{ dias_alerta: number; items: Fila[] }>(`/vencimientos?filtro=${filtro}`), [filtro]);
  const [retirar, setRetirar] = useState<Fila | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmar() {
    if (!retirar) return;
    setBusy(true);
    try {
      await post(`/vencimientos/${retirar.id_vencimiento}/retirar`);
      toast.ok('Marcado como retirado', `${retirar.producto}: se descontaron ${num(retirar.cantidad)} ${unidadDe(retirar.tipo_venta)} del stock.`);
      refrescarCache(true).catch(() => undefined);
      setRetirar(null);
      reload();
    } catch (e) { toast.error('No se pudo retirar', errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader title="Control de Vencimientos" subtitle={`Ordenado por proximidad. Se avisa con ${data?.dias_alerta ?? 30} días de anticipación (configurable).`}
        actions={<Tabs<Filtro> value={filtro} onChange={setFiltro} items={[{ id: 'todos', label: 'Todos' }, { id: '7', label: 'Próximos 7 días' }, { id: '30', label: 'Próximos 30 días' }, { id: 'vencidos', label: 'Vencidos' }, { id: 'retirados', label: 'Retirados' }]} />} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorBox msg={error} onRetry={reload} /> : (
        <div className="card overflow-x-auto">
          {data!.items.length === 0 ? <Empty icon={<CalendarClock className="h-12 w-12" />} title="No hay vencimientos en esta vista" text="Cuando cargues vencimientos de productos van a aparecer acá." /> : (
            <table className="w-full min-w-[44rem] text-[15px]">
              <thead><tr><th className="th">Producto</th><th className="th !text-right">Cantidad</th><th className="th">Vencimiento</th><th className="th">Estado</th><th className="th" /></tr></thead>
              <tbody>
                {data!.items.map((v) => (
                  <tr key={v.id_vencimiento} className={cx(v.estado === 'VENCIDO' && 'bg-peligro-50/60', v.estado === 'PROXIMO' && 'bg-alerta-50/60')}>
                    <td className="td"><button className="text-left font-bold hover:underline" onClick={() => nav(`/inventario/${v.id_producto}`)}>{v.producto}</button><div className="text-xs text-ink-500">{v.categoria}</div></td>
                    <td className="td text-right font-semibold">{num(v.cantidad)} {unidadDe(v.tipo_venta)}</td>
                    <td className="td"><b>{fechaCorta(v.fecha_vencimiento)}</b>{v.estado !== 'RETIRADO' && <div className="text-xs text-ink-500">{diasLabel(v.dias_restantes)}</div>}</td>
                    <td className="td"><VencBadge estado={v.estado} /></td>
                    <td className="td text-right">{v.estado !== 'RETIRADO' && <button className="btn btn-sm btn-secondary" onClick={() => setRetirar(v)}>Marcar como retirado</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <ConfirmModal open={!!retirar} title="Marcar como retirado" tone="warning" confirmLabel="Retirar del stock" busy={busy} onCancel={() => setRetirar(null)} onConfirm={confirmar}
        text={<>Se van a descontar <b>{num(retirar?.cantidad ?? 0)} {retirar ? unidadDe(retirar.tipo_venta) : ''}</b> de <b>{retirar?.producto}</b> (vencimiento {fechaCorta(retirar?.fecha_vencimiento)}) y quedará registrado el retiro.</>} />
    </div>
  );
}
