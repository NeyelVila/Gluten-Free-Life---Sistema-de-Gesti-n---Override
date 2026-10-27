import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Banknote, CalendarClock, CreditCard, Package, Receipt, ShoppingCart, TrendingUp, ClipboardList, Wallet } from 'lucide-react';
import { ErrorBox, Loading, StatCard, useAsync, cx, Badge } from '../components/ui';
import { get, post } from '../lib/api';
import { fechaCorta, money, num, saludo, unidadDe } from '../lib/format';
import { useAuth, useConn } from '../store/stores';
import type { TipoVenta } from '../lib/types';

interface Dash {
  hoy: { operaciones: number; total: number; efectivo: number; digital: number; mercado_pago: number; tarjeta: number; caja_cerrada: boolean };
  dias_alerta: number;
  stock_critico: { cantidad: number; items: { id_producto: number; nombre: string; stock_actual: number; stock_minimo: number; tipo_venta: TipoVenta }[] };
  proximos_vencimientos: { cantidad: number; items: { id_vencimiento: number; producto: string; cantidad: number; tipo_venta: TipoVenta; fecha_vencimiento: string; estado: string }[] };
  ventas_7_dias: { dia: string; total: number; operaciones: number }[];
  mas_vendidos: { nombre: string; tipo_venta: TipoVenta; cantidad: number; monto: number }[];
  alertas_sistema: { id: number; tipo: string; mensaje: string }[];
  pedidos_abiertos: number;
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const diaCorto = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
};

export default function Dashboard() {
  const nav = useNavigate();
  const usuario = useAuth((s) => s.usuario);
  const online = useConn((s) => s.online);
  const { data, error, loading, reload } = useAsync(() => get<Dash>('/dashboard'), [online]);

  if (loading && !data) return <Loading />;
  if (error && !data)
    return (
      <div className="p-6">
        <ErrorBox msg={online ? error : 'Sin conexión: el resumen del día necesita el servidor. El Punto de Venta sigue funcionando.'} onRetry={reload} />
        <button className="btn btn-lg btn-primary m-4" onClick={() => nav('/pos')}><ShoppingCart className="h-5 w-5" /> Ir al Punto de Venta</button>
      </div>
    );
  const d = data!;
  const ventas7 = d.ventas_7_dias.map((v) => ({ ...v, etiqueta: diaCorto(v.dia) }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{saludo()}, {usuario?.nombre} 👋</h1>
          <p className="text-ink-500">Así viene el día en la dietética.</p>
        </div>
        <button className="btn btn-lg btn-primary" onClick={() => nav('/pos')}>
          <ShoppingCart className="h-6 w-6" /> Nueva venta
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Ventas de hoy" value={d.hoy.operaciones} sub="operaciones" icon={<Receipt className="h-4 w-4" />} />
        <StatCard label="Total recaudado" value={money(d.hoy.total)} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Efectivo" value={money(d.hoy.efectivo)} icon={<Banknote className="h-4 w-4" />} />
        <StatCard label="Cobros digitales" value={money(d.hoy.digital)} sub={`MP ${money(d.hoy.mercado_pago)} · Tarj. ${money(d.hoy.tarjeta)}`} icon={<CreditCard className="h-4 w-4" />} />
        <StatCard label="Stock crítico" value={d.stock_critico.cantidad} sub="productos" tone={d.stock_critico.cantidad ? 'crit' : 'ok'} icon={<Package className="h-4 w-4" />} onClick={() => nav('/stock-critico')} />
        <StatCard label="Próximos a vencer" value={d.proximos_vencimientos.cantidad} sub={`en ${d.dias_alerta} días o vencidos`} tone={d.proximos_vencimientos.cantidad ? 'warn' : 'ok'} icon={<CalendarClock className="h-4 w-4" />} onClick={() => nav('/vencimientos')} />
      </div>

      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><AlertTriangle className="h-5 w-5 text-alerta-600" /> Alertas importantes</h2>
        {d.stock_critico.cantidad === 0 && d.proximos_vencimientos.cantidad === 0 && d.alertas_sistema.length === 0 ? (
          <p className="rounded-xl bg-brand-50 p-4 font-semibold text-brand-800">🟢 Todo en orden: no hay stock crítico ni vencimientos próximos.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <ul className="space-y-2">
              {d.stock_critico.items.map((p) => (
                <li key={p.id_producto} className="flex items-center justify-between gap-3 rounded-xl bg-peligro-50 px-4 py-2.5 text-peligro-700">
                  <span className="font-semibold">🔴 Stock crítico: {p.nombre}</span>
                  <Badge tone="crit">{num(p.stock_actual)} {unidadDe(p.tipo_venta)} (mín. {num(p.stock_minimo)})</Badge>
                </li>
              ))}
              {d.stock_critico.cantidad > d.stock_critico.items.length && (
                <li className="px-2 text-sm text-ink-500">y {d.stock_critico.cantidad - d.stock_critico.items.length} más…</li>
              )}
            </ul>
            <ul className="space-y-2">
              {d.proximos_vencimientos.items.map((v) => (
                <li key={v.id_vencimiento} className={cx('flex items-center justify-between gap-3 rounded-xl px-4 py-2.5', v.estado === 'VENCIDO' ? 'bg-peligro-50 text-peligro-700' : 'bg-alerta-50 text-alerta-700')}>
                  <span className="font-semibold">{v.estado === 'VENCIDO' ? '🔴 Vencido' : '🟠 Vence pronto'}: {v.producto}</span>
                  <Badge tone={v.estado === 'VENCIDO' ? 'crit' : 'warn'}>{fechaCorta(v.fecha_vencimiento)}</Badge>
                </li>
              ))}
              {d.alertas_sistema.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 rounded-xl bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
                  <span>ℹ️ {a.mensaje}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {d.alertas_sistema.length > 0 && (
          <button className="btn btn-sm btn-ghost mt-3" onClick={async () => { await post('/alertas/leer'); reload(); }}>Marcar avisos como leídos</button>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <button className="btn btn-lg btn-primary" onClick={() => nav('/pos')}><ShoppingCart className="h-5 w-5" /> Nueva venta</button>
        <button className="btn btn-lg btn-secondary" onClick={() => nav('/stock-critico')}><Package className="h-5 w-5" /> Ver stock crítico</button>
        <button className="btn btn-lg btn-secondary" onClick={() => nav('/vencimientos')}><CalendarClock className="h-5 w-5" /> Ver vencimientos</button>
        <button className="btn btn-lg btn-secondary" onClick={() => nav('/stock-critico')}><ClipboardList className="h-5 w-5" /> Generar pedido</button>
      </section>

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-3">
          <h2 className="mb-4 text-lg font-bold">Ventas de los últimos 7 días</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={ventas7} margin={{ top: 5, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid vertical={false} stroke="#EFEBE0" />
                <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#607D8B' }} />
                <YAxis tickLine={false} axisLine={false} width={64} tick={{ fontSize: 12, fill: '#607D8B' }} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip cursor={{ fill: '#F1F8E9' }} formatter={(v: number) => [money(v), 'Ventas']} labelFormatter={(l) => l} />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {ventas7.map((_, i) => <Cell key={i} fill={i === ventas7.length - 1 ? '#2E7D32' : '#A5D6A7'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-lg font-bold">Más vendidos (7 días)</h2>
          {d.mas_vendidos.length === 0 ? (
            <p className="text-ink-500">Todavía no hay ventas registradas.</p>
          ) : (
            <ol className="space-y-3">
              {d.mas_vendidos.map((p, i) => {
                const max = d.mas_vendidos[0].monto || 1;
                return (
                  <li key={p.nombre}>
                    <div className="flex justify-between text-sm font-semibold">
                      <span>{i + 1}. {p.nombre}</span>
                      <span className="text-ink-500">{num(p.cantidad)} {unidadDe(p.tipo_venta)} · {money(p.monto)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-crema-200"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${(p.monto / max) * 100}%` }} /></div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
      {d.hoy.caja_cerrada ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-800"><Wallet className="h-4 w-4" /> La caja de hoy ya fue cerrada.</p>
      ) : (
        <button className="btn btn-md btn-ghost" onClick={() => nav('/caja')}><Wallet className="h-4 w-4" /> Ir a cerrar la caja del día</button>
      )}
    </div>
  );
}
