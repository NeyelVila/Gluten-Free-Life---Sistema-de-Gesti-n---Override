# Pruebas

| Tipo | Comando | Qué hace |
|---|---|---|
| Unitarias (Vitest) | `cd backend && npm run test:unit` | 25 casos sobre funciones puras (precio sugerido, stock crítico, vencimientos, cantidad sugerida, validaciones). No necesita base de datos. |
| Integración de la API | `cd backend && DATABASE_URL=postgres://… npm test` | 17 grupos contra PostgreSQL real. **Recarga los datos de demostración.** |
| Todas las anteriores | `cd backend && DATABASE_URL=postgres://… npm run test:all` | Unitarias + integración de la API. |
| Integración API → BD (con evidencia) | `DATABASE_URL=postgres://… bash docs/pruebas/integracion-venta.sh` | Login, venta, y verificación con `psql` del stock y de los vencimientos. Requiere el sistema en `http://localhost:4000` y `psql`. |
| Integración UI → BD (alta, consulta, modificación y baja de producto) | `DATABASE_URL=postgres://… CHROME=/ruta/a/chrome OUT=./capturas-ui node docs/pruebas/ui-crud-productos.mjs` | Maneja la interfaz con Playwright y verifica cada paso en PostgreSQL. Requiere `npm i playwright-core`. |
| Recorrido completo de la interfaz (26 pasos) | `CHROME=… OUT=./capturas-ui node docs/pruebas/ui-recorrido.mjs` | Recorre todo el sistema; base de las capturas del Manual de usuario. |

Antes de los scripts de interfaz: `cd backend && npm run seed` (datos limpios), `npm run build` en `frontend/` y `backend/`, y `npm start`.
La carpeta `capturas/` contiene la evidencia de ejecución usada en la documentación.
