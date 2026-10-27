import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Banknote, CreditCard, Receipt, Smartphone, TrendingUp } from 'lucide-react';
import { Empty, ErrorBox, Field, Loading, PageHeader, StatCard, Tabs, useAsync } from '../components/ui';
import { get } from '../lib/api';
import { fechaCorta, hoyISO, money, num, unidadDe } from '../lib/format';
import type { TipoVenta } from '../lib/types';

type Rango = 'hoy' | 'semana' | 'mes' | 'custom';
interface Rep {
  desde: string; hasta: string; total_vendido: number; operaciones: number; ticket_promedio: number; efectivo: number; mercado_pago: number; tarjeta: number; stock_critico: number;
  mas_vendidos: { id_producto: number; nombre: string; tipo_venta: TipoVenta; cantidad: number; monto: number }[];
  menor_rotacion: { id_producto: number; nombre: string; tipo_venta: TipoVenta; cantidad: number; stock_actual: number }[];
  ventas_por_dia: { dia: string; operaciones: number; total: number }[];
}

export default function Reportes() {
  const [rango, setRango] = useState<Rango>('semana');
  const [desdeC, setDesdeC] = useState(hoyISO(-30));
  const [hastaC, setHastaC] = useState(hoyISO());
  const hoy = hoyISO();
  const desde = rango === 'hoy' ? hoy : rango === 'semana' ? hoyISO(-6) : rango === 'mes' ? hoyISO(-29) : desdeC;
  const hasta = rango === 'custom' ? hastaC : hoy;
  const invalido = rango === 'custom' && (!desdeC || !hastaC || desdeC > hastaC);
  const { data: r, error, loading, reload } = useAsync(() => (invalido ? Promise.resolve(null) : get<Rep>(`/reportes?desde=${desde}&hasta=${hasta}`)), [desde, hasta, invalido]);

  const pagos = r ? [
    { medio: 'Efectivo', monto: r.efectivo }, { medio: 'Mercado Pago', monto: r.mercado_pago }, { medio: 'Tarjeta', monto: r.tarjeta },
  ] : [];
  const maxPago = Math.max(1, ...pagos.map((p) => p.monto));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader title="Reportes" subtitle={`Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`}
        actions={<Tabs<Rango> value={rango} onChange={setRango} items={[{ id: 'hoy', label: 'Hoy' }, { id: 'semana', label: 'Semana' }, { id: 'mes', label: 'Mes' }, { id: 'custom', label: 'Personalizado' }]} />} />
      {rango === 'custom' && (
        <div className="card flex flex-wrap items-end gap-4 p-4">
          <Field label="Desde"><input type="date" className="field" value={desdeC} max={hastaC || hoy} onChange={(e) => setDesdeC(e.target.value)} /></Field>
          <Field label="Hasta"><input type="date" className="field" value={hastaC} min={desdeC} max={hoy} onChange={(e) => setHastaC(e.target.value)} /></Field>
          {invalido && <p className="pb-2 text-sm font-semibold text-peligro-600">Elegí un rango de fechas válido.</p>}
        </div>
      )}
      {loading && !r ? <Loading /> : error && !r ? <ErrorBox msg={error} onRetry={reload} /> : r && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total vendido" value={money(r.total_vendido)} icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard label="Operaciones" value={r.operaciones} sub={`Ticket promedio ${money(r.ticket_promedio)}`} icon={<Receipt className="h-4 w-4" />} />
            <StatCard label="Stock crítico" value={r.stock_critico} sub="productos hoy" tone={r.stock_critico ? 'crit' : 'ok'} icon={<AlertTriangle className="h-4 w-4" />} />
            <StatCard label="Digital" value={money(r.mercado_pago + r.tarjeta)} sub="Mercado Pago + tarjeta" icon={<CreditCard className="h-4 w-4" />} />
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            <section className="card p-5 lg:col-span-3">
              <h2 className="mb-4 text-lg font-bold">Ventas por día</h2>
              {r.ventas_por_dia.length === 0 ? <Empty title="Sin ventas en el período" /> : (
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={r.ventas_por_dia.map((v) => ({ ...v, etiqueta: v.dia.slice(8) + '/' + v.dia.slice(5, 7) }))} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid vertical={false} stroke="#EFEBE0" />
                      <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#607D8B' }} />
                      <YAxis tickLine={false} axisLine={false} width={64} tick={{ fontSize: 12, fill: '#607D8B' }} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                      <Tooltip cursor={{ fill: '#F1F8E9' }} formatter={(v: number, _n, p: any) => [`${money(v)} · ${p.payload.operaciones} op.`, 'Ventas']} />
                      <Bar dataKey="total" fill="#43A047" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
            <section className="card p-5 lg:col-span-2">
              <h2 className="mb-4 text-lg font-bold">Por medio de pago</h2>
              <ul className="space-y-4">
                {pagos.map((p, i) => (
                  <li key={p.medio}>
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span className="flex items-center gap-2">{[<Banknote key="a" className="h-4 w-4" />, <Smartphone key="b" className="h-4 w-4" />, <CreditCard key="c" className="h-4 w-4" />][i]} {p.medio}</span>
                      <span>{money(p.monto)} <span className="text-ink-500">({r.total_vendido ? Math.round((p.monto / r.total_vendido) * 100) : 0}%)</span></span>
                    </div>
                    <div className="mt-1.5 h-3 rounded-full bg-crema-200"><div className="h-3 rounded-full bg-brand-500" style={{ width: `${(p.monto / maxPago) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card overflow-x-auto">
              <h2 className="px-5 pt-4 text-lg font-bold">Más vendidos</h2>
              {r.mas_vendidos.length === 0 ? <Empty title="Sin ventas en el período" /> : (
                <table className="mt-2 w-full text-[15px]"><thead><tr><th className="th">#</th><th className="th">Producto</th><th className="th !text-right">Cantidad</th><th className="th !text-right">Monto</th></tr></thead>
                  <tbody>{r.mas_vendidos.map((p, i) => <tr key={p.id_producto}><td className="td font-black text-brand-700">{i + 1}</td><td className="td font-bold">{p.nombre}</td><td className="td text-right">{num(p.cantidad)} {unidadDe(p.tipo_venta)}</td><td className="td text-right font-bold">{money(p.monto)}</td></tr>)}</tbody></table>
              )}
            </section>
            <section className="card overflow-x-auto">
              <h2 className="px-5 pt-4 text-lg font-bold">Menor rotación</h2>
              <table className="mt-2 w-full text-[15px]"><thead><tr><th className="th">Producto</th><th className="th !text-right">Vendido</th><th className="th !text-right">Stock actual</th></tr></thead>
                <tbody>{r.menor_rotacion.map((p) => <tr key={p.id_producto}><td className="td font-bold">{p.nombre}</td><td className="td text-right">{num(p.cantidad)} {unidadDe(p.tipo_venta)}</td><td className="td text-right text-ink-500">{num(p.stock_actual)} {unidadDe(p.tipo_venta)}</td></tr>)}</tbody></table>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
