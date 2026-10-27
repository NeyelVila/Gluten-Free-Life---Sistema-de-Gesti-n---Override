import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AlertOctagon, BarChart3, CalendarClock, CheckCircle2, Home, LogOut, Package, Settings, ShoppingBasket, ShoppingCart, Tags, Truck, Wallet, WifiOff, Wheat,
} from 'lucide-react';
import { useAuth, useConn } from '../store/stores';
import { cx, Spinner } from './ui';
import { setForcedOffline } from '../lib/api';
import { chequearConexion } from '../lib/sync';

const MENU = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/pos', label: 'Punto de Venta', icon: ShoppingCart },
  { to: '/inventario', label: 'Inventario', icon: Package },
  { to: '/productos', label: 'Productos', icon: Tags },
  { to: '/vencimientos', label: 'Vencimientos', icon: CalendarClock },
  { to: '/compras', label: 'Compras', icon: ShoppingBasket },
  { to: '/intermediario', label: 'Intermediario', icon: Truck },
  { to: '/caja', label: 'Caja', icon: Wallet },
  { to: '/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/configuracion', label: 'Configuración', icon: Settings },
];

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cx('flex items-center gap-3', className)}>
      <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-600 text-white ring-4 ring-brand-200">
        <Wheat className="h-6 w-6" />
      </span>
      <div className="leading-none">
        <div className="text-[17px] font-black tracking-wide text-brand-800">GLUTEN FREE</div>
        <div className="text-[17px] font-black tracking-[0.35em] text-brand-600">LIFE</div>
      </div>
    </div>
  );
}

export function ConnIndicator({ compact }: { compact?: boolean }) {
  const { online, pendientes, syncing } = useConn();
  if (online)
    return (
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-800">
        {syncing ? <Spinner className="h-4 w-4" /> : <span className="h-2.5 w-2.5 rounded-full bg-brand-500 shadow-[0_0_0_3px_rgba(67,160,71,.25)]" />}
        {compact ? 'Online' : syncing ? 'Sincronizando…' : 'Online'}
      </div>
    );
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-alerta-700">
      <span className="h-2.5 w-2.5 rounded-full bg-alerta-500 shadow-[0_0_0_3px_rgba(245,158,11,.3)]" />
      {compact ? 'Sin conexión' : `Sin conexión — trabajando offline${pendientes ? ` (${pendientes} pend.)` : ''}`}
    </div>
  );
}

export default function Layout() {
  const { usuario, logout } = useAuth();
  const { online, forced, pendientes, restablecida } = useConn();
  const nav = useNavigate();
  const [verRestablecida, setVerRestablecida] = useState(false);

  useEffect(() => {
    if (!restablecida) return;
    setVerRestablecida(true);
    const t = setTimeout(() => setVerRestablecida(false), 9000);
    return () => clearTimeout(t);
  }, [restablecida]);

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-crema-200 bg-white">
        <div className="px-5 pb-4 pt-5">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          {MENU.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-semibold transition',
                  isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-700 hover:bg-brand-50'
                )
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-3 border-t border-crema-200 p-4">
          <ConnIndicator />
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{usuario?.nombre}</p>
              <p className="text-xs text-ink-500">Sesión iniciada</p>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                logout();
                nav('/login');
              }}
              title="Cerrar sesión"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {!online && (
          <div className="flex flex-wrap items-center gap-3 bg-alerta-500 px-5 py-2.5 text-white">
            <WifiOff className="h-5 w-5 shrink-0" />
            <p className="flex-1 text-sm font-semibold">
              SIN CONEXIÓN — MODO OFFLINE. Podés continuar vendiendo. Las operaciones se sincronizarán automáticamente cuando vuelva la conexión.
              {pendientes > 0 && ` · ${pendientes} venta(s) pendiente(s) de sincronizar.`}
            </p>
            {forced && (
              <button
                className="btn btn-sm bg-white/95 text-alerta-700 hover:bg-white"
                onClick={() => {
                  setForcedOffline(false);
                  chequearConexion();
                }}
              >
                Restablecer conexión
              </button>
            )}
          </div>
        )}
        {online && verRestablecida && restablecida && (
          <div className="flex items-center gap-3 bg-brand-600 px-5 py-2.5 text-white">
            <CheckCircle2 className="h-5 w-5" />
            <p className="flex-1 text-sm font-semibold">
              CONEXIÓN RESTABLECIDA —{' '}
              {restablecida.n > 0 ? `${restablecida.n} ${restablecida.n === 1 ? 'venta sincronizada correctamente' : 'ventas sincronizadas correctamente'}.` : 'todo está al día.'}
            </p>
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export { AlertOctagon };
