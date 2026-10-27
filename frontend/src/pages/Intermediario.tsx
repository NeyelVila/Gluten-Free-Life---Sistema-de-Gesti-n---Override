import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save } from 'lucide-react';
import { Badge, Empty, ErrorBox, Field, Loading, PageHeader, Spinner, useAsync } from '../components/ui';
import { errMsg, get, put } from '../lib/api';
import { estadoPedidoLabel, fechaHora, money, num, unidadDe } from '../lib/format';
import { numPedido } from '../lib/pedidos';
import { tonoEstado } from './Compras';
import type { EstadoPedido, TipoVenta } from '../lib/types';
import { toast } from '../store/stores';

interface Inter { id_intermediario: number; nombre: string; contacto: string | null; telefono_whatsapp: string | null; email: string | null; observaciones: string | null }
interface Data {
  intermediario: Inter | null;
  pedidos: { id_pedido: number; estado: EstadoPedido; fecha_generacion: string; productos: number; total_estimado: number }[];
  precios: { id_producto: number; nombre: string; tipo_venta: TipoVenta; precio_costo: number; stock_actual: number; ultimo_pedido: string | null }[];
}

export default function Intermediario() {
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(() => get<Data>('/intermediario'), []);
  const [f, setF] = useState({ nombre: '', contacto: '', telefono_whatsapp: '', email: '', observaciones: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const i = data?.intermediario;
    if (i) setF({ nombre: i.nombre, contacto: i.contacto ?? '', telefono_whatsapp: i.telefono_whatsapp ?? '', email: i.email ?? '', observaciones: i.observaciones ?? '' });
  }, [data]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.nombre.trim()) er.nombre = 'El nombre es obligatorio';
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) er.email = 'Email inválido';
    if (f.telefono_whatsapp.trim() && f.telefono_whatsapp.replace(/\D/g, '').length < 8) er.telefono_whatsapp = 'Ingresá el número con código de área';
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await put('/intermediario', { nombre: f.nombre.trim(), contacto: f.contacto.trim() || null, telefono_whatsapp: f.telefono_whatsapp.trim() || null, email: f.email.trim() || null, observaciones: f.observaciones.trim() || null });
      toast.ok('Datos del intermediario guardados');
      reload();
    } catch (err) { toast.error('No se pudo guardar', errMsg(err)); } finally { setBusy(false); }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox msg={error} onRetry={reload} />;
  const d = data!;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader title="Intermediario logístico" subtitle="Realiza las compras, el retiro y la entrega por cuenta del comercio. Es el único destinatario de los pedidos." />
      <form onSubmit={guardar} className="card grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Nombre" error={errs.nombre}><input className="field" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
        <Field label="Persona de contacto"><input className="field" value={f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.value })} /></Field>
        <Field label="WhatsApp" error={errs.telefono_whatsapp} hint="Con código de país y área, sin + ni espacios. Ej.: 5491155550142"><input className="field" inputMode="tel" value={f.telefono_whatsapp} onChange={(e) => setF({ ...f, telefono_whatsapp: e.target.value })} /></Field>
        <Field label="Email" error={errs.email}><input className="field" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Observaciones" className="sm:col-span-2"><textarea className="field min-h-20" value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} /></Field>
        <div className="sm:col-span-2"><button className="btn btn-md btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Guardar datos</button></div>
      </form>

      <section className="card overflow-x-auto">
        <h2 className="px-5 pt-4 text-lg font-bold">Historial de pedidos</h2>
        {d.pedidos.length === 0 ? <Empty title="Todavía no hay pedidos" /> : (
          <table className="mt-3 w-full text-[15px]">
            <thead><tr><th className="th">Pedido</th><th className="th">Fecha</th><th className="th">Estado</th><th className="th !text-right">Productos</th><th className="th !text-right">Total estimado</th></tr></thead>
            <tbody>
              {d.pedidos.map((p) => (
                <tr key={p.id_pedido} className="cursor-pointer hover:bg-brand-50/60" onClick={() => nav(`/compras/${p.id_pedido}`)}>
                  <td className="td font-bold">N° {numPedido(p.id_pedido)}</td><td className="td text-ink-500">{fechaHora(p.fecha_generacion)}</td>
                  <td className="td"><Badge tone={tonoEstado(p.estado)}>{estadoPedidoLabel[p.estado]}</Badge></td>
                  <td className="td text-right">{p.productos}</td><td className="td text-right font-bold">{money(p.total_estimado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="px-5 pt-4 text-lg font-bold">Precio de compra por producto</h2>
        <table className="mt-3 w-full text-[15px]">
          <thead><tr><th className="th">Producto</th><th className="th !text-right">Precio de compra</th><th className="th !text-right">Stock</th><th className="th">Último pedido</th></tr></thead>
          <tbody>
            {d.precios.map((p) => (
              <tr key={p.id_producto}><td className="td font-bold">{p.nombre}</td><td className="td text-right">{money(p.precio_costo)}{p.tipo_venta === 'GRANEL' ? '/kg' : ''}</td><td className="td text-right text-ink-500">{num(p.stock_actual)} {unidadDe(p.tipo_venta)}</td><td className="td text-ink-500">{p.ultimo_pedido ? fechaHora(p.ultimo_pedido) : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
