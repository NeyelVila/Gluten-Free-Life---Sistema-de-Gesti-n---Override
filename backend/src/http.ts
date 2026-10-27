import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  status: number;
  detalle?: unknown;
  constructor(status: number, message: string, detalle?: unknown) {
    super(message);
    this.status = status;
    this.detalle = detalle;
  }
}

export const bad = (msg: string, detalle?: unknown) => new HttpError(400, msg, detalle);
export const notFound = (msg = 'No encontrado') => new HttpError(404, msg);
export const conflict = (msg: string, detalle?: unknown) => new HttpError(409, msg, detalle);

/** Envuelve handlers async para que los errores lleguen al middleware de errores. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function errorMiddleware(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, detalle: err.detalle ?? null });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos inválidos',
      detalle: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
    });
  }
  if (err?.code === '23505') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos', detalle: err.detail ?? null });
  }
  if (err?.code === '23503') {
    return res.status(409).json({ error: 'El registro está referenciado por otros datos', detalle: err.detail ?? null });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido', detalle: null });
  }
  console.error(err);
  return res.status(500).json({ error: 'Error interno del servidor', detalle: null });
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
