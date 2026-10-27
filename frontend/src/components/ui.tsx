import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import { useToasts } from '../store/stores';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('animate-spin', className ?? 'h-5 w-5')} />;
}

export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-500">
      <Spinner className="h-6 w-6 text-brand-600" /> <span>{text}</span>
    </div>
  );
}

export function ErrorBox({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div className="card m-4 flex items-center gap-4 border-peligro-100 bg-peligro-50 p-5 text-peligro-700">
      <XCircle className="h-6 w-6 shrink-0" />
      <div className="flex-1">
        <p className="font-semibold">No se pudo cargar la información</p>
        <p className="text-sm">{msg}</p>
      </div>
      {onRetry && (
        <button className="btn btn-md btn-secondary" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'mute';
const tones: Record<Tone, string> = {
  ok: 'bg-brand-100 text-brand-800',
  warn: 'bg-alerta-100 text-alerta-700',
  crit: 'bg-peligro-100 text-peligro-700',
  info: 'bg-sky-100 text-sky-800',
  mute: 'bg-ink-300/30 text-ink-700',
};
export function Badge({ tone = 'mute', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold', tones[tone], className)}>{children}</span>;
}

export function StockBadge({ estado }: { estado?: string }) {
  if (estado === 'CRITICO') return <Badge tone="crit">🔴 Crítico</Badge>;
  if (estado === 'BAJO') return <Badge tone="warn">🟠 Bajo</Badge>;
  return <Badge tone="ok">🟢 Normal</Badge>;
}
export function VencBadge({ estado }: { estado: string }) {
  if (estado === 'VENCIDO') return <Badge tone="crit">🔴 Vencido</Badge>;
  if (estado === 'PROXIMO') return <Badge tone="warn">🟠 Próximo a vencer</Badge>;
  if (estado === 'RETIRADO') return <Badge tone="mute">Retirado</Badge>;
  return <Badge tone="ok">🟢 Normal</Badge>;
}

export function Modal({
  open, onClose, title, children, footer, width = 'max-w-lg', dismissable = true,
}: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: string; dismissable?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && dismissable && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose, dismissable]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && dismissable && onClose()}>
      <div className={cx('card flex max-h-[92vh] w-full animate-pop flex-col', width)} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-crema-200 px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          {dismissable && (
            <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Cerrar">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-crema-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open, title, text, confirmLabel = 'Confirmar', tone = 'primary', onConfirm, onCancel, busy,
}: { open: boolean; title: string; text: ReactNode; confirmLabel?: string; tone?: 'primary' | 'danger' | 'warning'; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="btn btn-md btn-secondary" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className={cx('btn btn-md', tone === 'danger' ? 'btn-danger' : tone === 'warning' ? 'btn-warning' : 'btn-primary')} onClick={onConfirm} disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />} {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-ink-700">{text}</div>
    </Modal>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-semibold text-ink-700">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm text-peligro-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-500">{hint}</span> : null}
    </label>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-ink-500">
      {icon && <div className="text-brand-300">{icon}</div>}
      <p className="text-lg font-bold text-ink-700">{title}</p>
      {text && <p className="max-w-md">{text}</p>}
      {action}
    </div>
  );
}

export function StatCard({ label, value, sub, tone = 'ok', icon, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: ReactNode; onClick?: () => void }) {
  const ring = tone === 'crit' ? 'border-peligro-100' : tone === 'warn' ? 'border-alerta-100' : 'border-crema-200';
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cx('card p-4 text-left', ring, onClick && 'transition hover:-translate-y-0.5 hover:shadow-md')}>
      <div className="flex items-center justify-between text-sm font-semibold text-ink-500">
        <span>{label}</span>
        {icon && <span className={cx('rounded-lg p-1.5', tones[tone])}>{icon}</span>}
      </div>
      <div className="mt-1.5 text-3xl font-extrabold tracking-tight text-ink-900">{value}</div>
      {sub && <div className="mt-0.5 text-sm text-ink-500">{sub}</div>}
    </Tag>
  );
}

export function Toasts() {
  const { items, dismiss } = useToasts();
  const icon = { success: <CheckCircle2 className="h-5 w-5 text-brand-600" />, error: <XCircle className="h-5 w-5 text-peligro-600" />, warning: <AlertTriangle className="h-5 w-5 text-alerta-600" />, info: <Info className="h-5 w-5 text-sky-600" /> };
  const bg = { success: 'border-brand-300', error: 'border-peligro-100', warning: 'border-alerta-100', info: 'border-sky-200' };
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={cx('card pointer-events-auto flex animate-slideUp items-start gap-3 border-2 p-3.5', bg[t.kind])}>
          <div className="mt-0.5">{icon[t.kind]}</div>
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-tight">{t.title}</p>
            {t.text && <p className="mt-0.5 break-words text-sm text-ink-700">{t.text}</p>}
          </div>
          <button className="text-ink-500 hover:text-ink-900" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; badge?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-crema-200 p-1">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={cx('flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition', value === it.id ? 'bg-white text-brand-800 shadow-sm' : 'text-ink-500 hover:text-ink-900')}
        >
          {it.label}
          {it.badge != null && it.badge > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">{it.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Carga datos async con estados de carga/error y recarga manual. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = () => {
    const my = ++seq.current;
    setLoading(true);
    fn()
      .then((d) => seq.current === my && (setData(d), setError(null)))
      .catch((e) => seq.current === my && setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => seq.current === my && setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, deps);
  return { data, error, loading, reload: run, setData };
}

export function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}
