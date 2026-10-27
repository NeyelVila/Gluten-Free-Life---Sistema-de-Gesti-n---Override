const BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api';

export class ApiError extends Error {
  status: number;
  detalle: any;
  constructor(status: number, message: string, detalle?: any) {
    super(message);
    this.status = status;
    this.detalle = detalle;
  }
}
/** No hay conexión con el servidor (o se está simulando la pérdida de conexión). */
export class NetworkError extends Error {
  constructor(message = 'Sin conexión con el servidor') {
    super(message);
  }
}

const FORCE_KEY = 'gfl_force_offline';
export const isForcedOffline = () => localStorage.getItem(FORCE_KEY) === '1';
export const setForcedOffline = (v: boolean) => (v ? localStorage.setItem(FORCE_KEY, '1') : localStorage.removeItem(FORCE_KEY));

const TOKEN_KEY = 'gfl_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
export function setToken(token: string | null, recordar = false) {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (token) (recordar ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  if (isForcedOffline()) throw new NetworkError('Conexión simulada como caída');
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new NetworkError();
  }
  // Un 502/503/504 (proxy sin backend) equivale a no tener servidor
  if ([502, 503, 504].includes(res.status)) throw new NetworkError('El servidor no responde');
  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    window.dispatchEvent(new Event('gfl:logout'));
  }
  return res;
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await request(method, path, body);
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* respuesta no JSON */
  }
  if (!res.ok) {
    const det = Array.isArray(json?.detalle) && json.detalle[0]?.mensaje ? ` (${json.detalle.map((d: any) => `${d.campo}: ${d.mensaje}`).join('; ')})` : '';
    throw new ApiError(res.status, (json?.error ?? `Error ${res.status}`) + det, json?.detalle);
  }
  return json as T;
}
export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b?: unknown) => api<T>('POST', p, b ?? {});
export const put = <T = any>(p: string, b?: unknown) => api<T>('PUT', p, b ?? {});
export const del = <T = any>(p: string) => api<T>('DELETE', p);

/** Descarga un archivo autenticado (PDF, Excel, backup). Devuelve el blob y el nombre sugerido. */
export async function descargar(path: string, nombreSugerido: string, guardar = true): Promise<{ blob: Blob; filename: string }> {
  const res = await request('GET', path);
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* */
    }
    throw new ApiError(res.status, msg);
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename="?([^";]+)"?/i.exec(cd);
  const filename = m?.[1] ?? nombreSugerido;
  const blob = await res.blob();
  if (guardar) guardarBlob(blob, filename);
  return { blob, filename };
}

export function guardarBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const errMsg = (e: unknown) =>
  e instanceof NetworkError
    ? 'Esta operación requiere conexión con el servidor. Probá de nuevo cuando vuelva Internet.'
    : e instanceof Error
    ? e.message
    : 'Error inesperado';
