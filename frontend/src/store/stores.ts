import { create } from 'zustand';
import { getToken, setToken } from '../lib/api';

// ───────────── Toasts ─────────────
export type ToastKind = 'success' | 'error' | 'warning' | 'info';
export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  text?: string;
}
let toastId = 1;
interface ToastState {
  items: ToastItem[];
  push: (kind: ToastKind, title: string, text?: string, ms?: number) => void;
  dismiss: (id: number) => void;
}
export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push: (kind, title, text, ms = kind === 'error' ? 7000 : 4500) => {
    const id = toastId++;
    set((s) => ({ items: [...s.items.slice(-3), { id, kind, title, text }] }));
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));
export const toast = {
  ok: (t: string, x?: string) => useToasts.getState().push('success', t, x),
  error: (t: string, x?: string) => useToasts.getState().push('error', t, x),
  warn: (t: string, x?: string) => useToasts.getState().push('warning', t, x),
  info: (t: string, x?: string) => useToasts.getState().push('info', t, x),
};

// ───────────── Conexión ─────────────
interface ConnState {
  online: boolean;
  forced: boolean; // conexión caída simulada desde Configuración
  pendientes: number;
  syncing: boolean;
  restablecida: { n: number; at: number } | null;
  set: (p: Partial<ConnState>) => void;
}
export const useConn = create<ConnState>((set) => ({
  online: navigator.onLine,
  forced: false,
  pendientes: 0,
  syncing: false,
  restablecida: null,
  set: (p) => set(p),
}));

// ───────────── Sesión (un solo tipo de usuario, sin roles) ─────────────
export interface Usuario {
  id_usuario: number;
  nombre: string;
}
interface AuthState {
  usuario: Usuario | null;
  setSesion: (u: Usuario, token: string, recordar: boolean) => void;
  actualizarNombre: (n: string, token?: string) => void;
  logout: () => void;
}
const USER_KEY = 'gfl_user';
const cargarUsuario = (): Usuario | null => {
  if (!getToken()) return null;
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
};
export const useAuth = create<AuthState>((set, get) => ({
  usuario: cargarUsuario(),
  setSesion: (u, token, recordar) => {
    setToken(token, recordar);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(USER_KEY);
    (recordar ? localStorage : sessionStorage).setItem(USER_KEY, JSON.stringify(u));
    set({ usuario: u });
  },
  actualizarNombre: (nombre, token) => {
    const u = get().usuario;
    if (!u) return;
    const nuevo = { ...u, nombre };
    const recordar = !!localStorage.getItem(USER_KEY);
    if (token) setToken(token, recordar);
    (recordar ? localStorage : sessionStorage).setItem(USER_KEY, JSON.stringify(nuevo));
    set({ usuario: nuevo });
  },
  logout: () => {
    setToken(null);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(USER_KEY);
    set({ usuario: null });
  },
}));
window.addEventListener('gfl:logout', () => useAuth.getState().logout());
