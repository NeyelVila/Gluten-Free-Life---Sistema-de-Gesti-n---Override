import { useEffect, useState } from 'react';
import { Download, KeyRound, Moon, RefreshCw, Save, Sun, WifiOff } from 'lucide-react';
import { Badge, ErrorBox, Field, Loading, PageHeader, Spinner, cx, useAsync } from '../components/ui';
import { descargar, errMsg, get, put, setForcedOffline } from '../lib/api';
import { fechaHora, money } from '../lib/format';
import { localdb } from '../lib/localdb';
import { chequearConexion, contarPendientes, refrescarCache, sincronizar } from '../lib/sync';
import type { VentaPendiente } from '../lib/types';
import { toast, useAuth, useConn } from '../store/stores';
import { getTheme, toggleTheme, type Theme } from '../lib/theme';

type Cfg = Record<string, string>;

export default function Configuracion() {
  const { data, error, loading, reload } = useAsync(() => get<Cfg>('/configuracion'), []);
  const [c, setC] = useState<Cfg>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { online, pendientes, syncing, forced: forzado } = useConn();
  const [pend, setPend] = useState<VentaPendiente[]>([]);
  const usuario = useAuth((s) => s.usuario);
  const actualizarNombre = useAuth((s) => s.actualizarNombre);
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [claveActual, setClaveActual] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [claveRep, setClaveRep] = useState('');
  const [theme, setTheme] = useState<Theme>(getTheme);

  useEffect(() => { if (data) setC(data); }, [data]);
  useEffect(() => { localdb.ventasPendientes.orderBy('fecha_hora').toArray().then(setPend); }, [pendientes, syncing]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox msg={error} onRetry={reload} />;
  const set = (k: string, v: string) => setC((s) => ({ ...s, [k]: v }));

  async function guardarCfg() {
    for (const k of ['stock_minimo_default', 'umbral_alerta', 'margen_default', 'dias_alerta_vencimiento']) {
      const n = Number((c[k] ?? '').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) return toast.error('Revisá los valores numéricos', 'Deben ser números mayores o iguales a 0.');
    }
    setBusy('cfg');
    try {
      const body: Cfg = {};
      for (const k of Object.keys(c)) body[k] = String(c[k]).replace(/^(\d+),(\d+)$/, '$1.$2');
      await put('/configuracion', body);
      toast.ok('Configuración guardada');
      refrescarCache(true).catch(() => undefined);
      reload();
    } catch (e) { toast.error('No se pudo guardar', errMsg(e)); } finally { setBusy(null); }
  }

  async function guardarCuenta() {
    if (nombre.trim().length < 2) return toast.error('El nombre es muy corto');
    if (claveNueva && claveNueva.length < 4) return toast.error('La contraseña nueva debe tener al menos 4 caracteres');
    if (claveNueva && claveNueva !== claveRep) return toast.error('Las contraseñas nuevas no coinciden');
    if (!claveActual) return toast.error('Ingresá tu contraseña actual para confirmar los cambios');
    setBusy('cuenta');
    try {
      const r = await put<{ usuario: { nombre: string }; token: string }>('/auth/perfil', { nombre: nombre.trim(), clave_actual: claveActual, clave_nueva: claveNueva || undefined });
      actualizarNombre(r.usuario.nombre, r.token);
      setClaveActual(''); setClaveNueva(''); setClaveRep('');
      toast.ok('Cuenta actualizada');
    } catch (e) { toast.error('No se pudo actualizar la cuenta', errMsg(e)); } finally { setBusy(null); }
  }

  async function simular(v: boolean) {
    setForcedOffline(v);
    await chequearConexion();
    toast[v ? 'warn' : 'ok'](v ? 'Pérdida de conexión simulada' : 'Conexión restablecida', v ? 'Probá vender en el Punto de Venta: se guarda sin conexión.' : undefined);
  }

  async function sincronizarAhora() {
    setBusy('sync');
    try {
      const r = await sincronizar();
      await contarPendientes();
      toast[r.fallidas ? 'warn' : 'ok'](r.n ? `${r.n} venta(s) sincronizadas` : 'No había nada para sincronizar', r.fallidas ? `${r.fallidas} fallaron; revisá el detalle.` : undefined);
      setPend(await localdb.ventasPendientes.orderBy('fecha_hora').toArray());
    } catch (e) { toast.error('No se pudo sincronizar', errMsg(e)); } finally { setBusy(null); }
  }

  async function backup() {
    setBusy('backup');
    try { await descargar('/sistema/backup', 'backup-gluten-free-life.json'); toast.ok('Copia de seguridad descargada'); }
    catch (e) { toast.error('No se pudo descargar la copia', errMsg(e)); } finally { setBusy(null); }
  }

  const inp = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <Field label={label} hint={hint}><input className="field" value={c[k] ?? ''} onChange={(e) => set(k, e.target.value)} {...props} /></Field>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader title="Configuración" subtitle="Datos del comercio, alertas y sistema" />

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-bold">Datos del comercio</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {inp('comercio_nombre', 'Nombre')}
          {inp('comercio_telefono', 'Teléfono')}
          <div className="sm:col-span-2">{inp('comercio_direccion', 'Dirección')}</div>
          <div className="sm:col-span-2"><Field label="Texto del ticket"><textarea className="field min-h-20" value={c.ticket_texto ?? ''} onChange={(e) => set('ticket_texto', e.target.value)} /></Field></div>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-bold">Alertas y valores predeterminados</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {inp('stock_minimo_default', 'Stock mínimo predeterminado', { inputMode: 'decimal' }, 'Se usa para productos nuevos y al importar el catálogo.')}
          {inp('umbral_alerta', 'Umbral de alerta de stock', { inputMode: 'decimal' }, 'Un producto figura como «Bajo» cuando está hasta este valor por encima del mínimo.')}
          {inp('margen_default', 'Margen comercial predeterminado (%)', { inputMode: 'decimal' })}
          {inp('dias_alerta_vencimiento', 'Días de anticipación para vencimientos', { inputMode: 'numeric' }, 'Los vencimientos dentro de este plazo se marcan como «Próximo a vencer».')}
        </div>
        <button className="btn btn-md btn-primary" onClick={guardarCfg} disabled={busy === 'cfg'}>{busy === 'cfg' ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Guardar configuración</button>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold"><KeyRound className="h-5 w-5" /> Cuenta de acceso</h2>
        <p className="text-sm text-ink-500">El sistema tiene una única cuenta con acceso a todas las funciones. Acá podés cambiar su nombre y su contraseña.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre visible"><input className="field" value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
          <Field label="Contraseña actual (requerida)"><input className="field" type="password" autoComplete="current-password" value={claveActual} onChange={(e) => setClaveActual(e.target.value)} /></Field>
          <Field label="Contraseña nueva (opcional)"><input className="field" type="password" autoComplete="new-password" value={claveNueva} onChange={(e) => setClaveNueva(e.target.value)} /></Field>
          <Field label="Repetir contraseña nueva"><input className="field" type="password" autoComplete="new-password" value={claveRep} onChange={(e) => setClaveRep(e.target.value)} /></Field>
        </div>
        <button className="btn btn-md btn-primary" onClick={guardarCuenta} disabled={busy === 'cuenta'}>{busy === 'cuenta' ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Actualizar cuenta</button>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-bold">Sistema</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Apariencia</p>
            <p className="text-sm text-ink-500">Elegí el modo de colores de la aplicación.</p>
          </div>
          <button
            className="btn btn-md btn-secondary"
            onClick={() => setTheme(toggleTheme())}
            aria-pressed={theme === 'dark'}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            {theme === 'dark' ? 'Usar modo claro' : 'Usar modo oscuro'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">Estado de conexión:</span>
          {online ? <Badge tone="ok">🟢 Online</Badge> : <Badge tone="warn">🟠 Sin conexión</Badge>}
          <span className="font-semibold">Ventas pendientes de sincronizar:</span>
          <Badge tone={pendientes ? 'warn' : 'ok'}>{pendientes}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={cx('btn btn-md', forzado ? 'btn-warning' : 'btn-secondary')} onClick={() => simular(!forzado)}><WifiOff className="h-5 w-5" /> {forzado ? 'Restablecer conexión' : 'Simular pérdida de conexión'}</button>
          <button className="btn btn-md btn-secondary" onClick={sincronizarAhora} disabled={!online || busy === 'sync' || syncing}>{busy === 'sync' ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-5 w-5" />} Sincronizar ahora</button>
          <button className="btn btn-md btn-secondary" onClick={backup} disabled={!online || busy === 'backup'}>{busy === 'backup' ? <Spinner className="h-4 w-4" /> : <Download className="h-5 w-5" />} Copia de seguridad</button>
        </div>
        <p className="text-sm text-ink-500">La simulación sirve para demostrar el modo offline: con la conexión «caída» el Punto de Venta sigue vendiendo y guarda las ventas en este equipo.</p>
        <Field label="Ancho del ticket (impresión)">
          <select className="field !w-auto" value={c.impresion_ancho_ticket ?? '80mm'} onChange={(e) => set('impresion_ancho_ticket', e.target.value)}>
            <option value="80mm">80 mm</option><option value="58mm">58 mm</option>
          </select>
        </Field>
        {pend.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-crema-200">
            <table className="w-full text-sm">
              <thead><tr><th className="th">Ticket local</th><th className="th">Fecha</th><th className="th !text-right">Total</th><th className="th">Estado</th></tr></thead>
              <tbody>{pend.map((v) => <tr key={v.uuid_cliente}><td className="td font-bold">{v.ticket_local}</td><td className="td">{fechaHora(v.fecha_hora)}</td><td className="td text-right">{money(v.total)}</td><td className="td">{v.estado === 'error' ? <Badge tone="crit">Error: {v.error}</Badge> : <Badge tone="warn">Pendiente</Badge>}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
