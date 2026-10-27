import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { api } from './routes';
import { errorMiddleware } from './http';
import { migrate } from './migrate';
import { pool } from './db';

export function crearApp() {
  const app = express();
  const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim());
  app.use(cors({ origin: origins, credentials: false }));
  app.use(express.json({ limit: '5mb' }));
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta inexistente', detalle: null }));

  // Si existe el build del frontend, el mismo servidor lo sirve (despliegue en un solo proceso).
  const dist = path.resolve(process.env.FRONTEND_DIST || path.join(__dirname, '../../frontend/dist'));
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorMiddleware);
  return app;
}

async function main() {
  await migrate(); // aplica migraciones pendientes al iniciar
  const port = Number(process.env.PORT || 4000);
  crearApp().listen(port, () => console.log(`Gluten Free Life API escuchando en http://localhost:${port}`));
}

if (require.main === module) {
  main().catch(async (e) => {
    console.error('No se pudo iniciar el servidor:', e.message);
    await pool.end();
    process.exit(1);
  });
}
