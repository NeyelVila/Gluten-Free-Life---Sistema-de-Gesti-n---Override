import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogIn, ShieldCheck, WifiOff } from 'lucide-react';
import { Logo } from '../components/Layout';
import { Field, Spinner } from '../components/ui';
import { NetworkError, post } from '../lib/api';
import { useAuth } from '../store/stores';

export default function Login() {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [recordar, setRecordar] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setSesion = useAuth((s) => s.setSesion);
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario.trim() || !clave) return setError('Ingresá usuario y contraseña');
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ token: string; usuario: { id_usuario: number; nombre: string } }>('/auth/login', { usuario: usuario.trim(), clave, recordar });
      setSesion(r.usuario, r.token, recordar);
      nav(loc.state?.from && loc.state.from !== '/login' ? loc.state.from : '/', { replace: true });
    } catch (err) {
      setError(err instanceof NetworkError ? 'No hay conexión con el servidor. Para ingresar por primera vez necesitás conexión.' : err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full place-items-center bg-gradient-to-br from-brand-50 via-crema-100 to-brand-100 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl md:grid-cols-2">
        <div className="hidden flex-col justify-between bg-brand-700 p-10 text-white md:flex">
          <Logo className="[&_*]:!text-white [&>span]:!bg-white/15 [&>span]:!ring-white/20" />
          <div>
            <h2 className="text-3xl font-extrabold leading-tight">Todo el negocio, en una sola pantalla.</h2>
            <p className="mt-3 text-brand-100">Ventas, stock, vencimientos, compras al intermediario y caja. Simple, rápido y sin papeles.</p>
          </div>
          <p className="text-sm text-brand-200">Override Software Solutions · «Del barrio, para el barrio»</p>
        </div>
        <form onSubmit={enviar} className="flex flex-col justify-center gap-5 p-8 sm:p-10">
          <div className="md:hidden"><Logo /></div>
          <div>
            <h1 className="text-2xl font-extrabold">Ingresar al sistema</h1>
            <p className="text-ink-500">Usá la cuenta del comercio.</p>
          </div>
          <Field label="Usuario">
            <input className="field" autoFocus autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="admin" />
          </Field>
          <Field label="Contraseña">
            <input className="field" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="••••" />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
            Recordarme en este equipo
          </label>
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-peligro-100 bg-peligro-50 p-3 text-sm font-semibold text-peligro-700">
              {error.includes('conexión') ? <WifiOff className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />}
              {error}
            </div>
          )}
          <button className="btn btn-lg btn-primary" disabled={busy}>
            {busy ? <Spinner /> : <LogIn className="h-5 w-5" />} Ingresar
          </button>
          <p className="text-center text-xs text-ink-500">Usuario de demostración: <b>admin</b> / <b>1234</b></p>
        </form>
      </div>
    </div>
  );
}
