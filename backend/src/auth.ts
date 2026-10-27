import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { q1 } from './db';
import { HttpError } from './http';

const SECRET = process.env.JWT_SECRET || 'cambiar-este-secreto-en-produccion';
if (process.env.NODE_ENV === 'production' && SECRET === 'cambiar-este-secreto-en-produccion') {
  console.warn('⚠ JWT_SECRET no está definido: definí uno propio y largo en las variables de entorno.');
}

export interface AuthUser {
  id_usuario: number;
  nombre: string;
  usuario_login: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const hashClave = (clave: string) => bcrypt.hashSync(clave, 10);

/** Usuario.autenticar(clave) */
export async function autenticar(usuarioLogin: string, clave: string): Promise<AuthUser | null> {
  const u = await q1<any>('SELECT * FROM usuario WHERE usuario_login = $1 AND activo = true', [usuarioLogin]);
  if (!u) return null;
  if (!bcrypt.compareSync(clave, u.clave_hash)) return null;
  return { id_usuario: u.id_usuario, nombre: u.nombre, usuario_login: u.usuario_login };
}

export function firmarToken(user: AuthUser, recordar: boolean) {
  return jwt.sign(user, SECRET, { expiresIn: recordar ? '30d' : '12h' });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return next(new HttpError(401, 'Sesión no iniciada'));
  try {
    const p = jwt.verify(token, SECRET) as any;
    req.user = { id_usuario: p.id_usuario, nombre: p.nombre, usuario_login: p.usuario_login };
    next();
  } catch {
    next(new HttpError(401, 'Sesión vencida. Volvé a ingresar.'));
  }
}
