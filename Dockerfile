# Imagen única: compila el frontend y el backend; el backend sirve la API y la web.
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine AS backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package*.json backend/
RUN cd backend && npm ci --omit=dev
COPY --from=backend /app/backend/dist backend/dist
COPY backend/migrations backend/migrations
COPY --from=frontend /app/frontend/dist frontend/dist
WORKDIR /app/backend
EXPOSE 4000
# Aplica migraciones, carga los datos de demostración solo si la base está vacía y arranca.
CMD ["sh", "-c", "node dist/migrate.js && node dist/seed.js --if-empty && node dist/index.js"]
