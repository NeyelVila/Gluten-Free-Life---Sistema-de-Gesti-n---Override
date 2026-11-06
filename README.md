# 🌾 Gluten-Free Life - Sistema de Gestión y Punto de Venta (POS)

**Gluten-Free Life** es un sistema integral de Punto de Venta (POS) y gestión empresarial (ERP ligero) diseñado específicamente para optimizar las operaciones de comercios, garantizando un control riguroso de inventarios, vencimientos y transacciones financieras.

Este repositorio corresponde a la entrega de **Proyecto Final**, demostrando la implementación de una arquitectura _full-stack_ robusta, validación de datos, sincronización y despliegue en contenedores.

## 🚀 Características Principales

**Punto de Venta (POS) Ágil**: Interfaz optimizada para el registro rápido de ventas y generación automática de tickets.

**Gestión de Inventario Avanzada**: Control de stock en tiempo real, ABM de productos y categorización.

**Alertas Inteligentes**: Módulos dedicados para monitorear _Stock Crítico_ y productos próximos a _Vencimientos_ (vital para el rubro alimenticio).

**Control de Caja**: Apertura, cierre y arqueo de caja con un historial detallado de movimientos.

**Dashboard y Analítica**: Panel principal con métricas clave y módulo de reportes para la toma de decisiones.

**Importación y Exportación masiva**: Carga rápida de catálogos mediante archivos Excel (.xlsx) con validación de inconsistencias en el backend.

**Resiliencia Offline**: Sincronización local y manejo de estado para operar ante cortes de conexión.

## 🛠️ Stack Tecnológico

El proyecto fue desarrollado utilizando tecnologías modernas para garantizar escalabilidad, rendimiento y una excelente experiencia de usuario (UX):

### Frontend

- **React + TypeScript** — interfaz de usuario tipada.
- **Vite** — herramienta de desarrollo y compilación.
- **Tailwind CSS** — estilos y componentes de interfaz.

### Backend

- **Node.js + TypeScript** — entorno y lenguaje del servidor.
- **Base de datos SQL** — esquema gestionado mediante migraciones.
- **Arquitectura por servicios** — lógica de negocio organizada en `src/services/`.

### DevOps y herramientas

- **Docker y Docker Compose** — contenedorización de la aplicación.
- **Git** — control de versiones.

## 📸 Vistas del Sistema

A continuación se presentan algunas pantallas clave del sistema operativo:

### Panel de Control (Dashboard)

Brinda un resumen rápido de las ventas y el estado del negocio.
![Dashboard](docs/capturas/02-dashboard.png)

### Control de Caja

Módulo para controlar el flujo de dinero, apertura y cierre de jornada.
![Caja Cerrada](docs/capturas/20-caja-cerrada.png)

Después de cerrar la caja, el usuario puede seleccionar **Reabrir caja** desde el
resumen del arqueo. La reapertura requiere un motivo obligatorio y conserva el
cierre anterior con la fecha, el usuario y el motivo registrados. Mientras la
caja está reabierta se pueden corregir o anular ventas y luego realizar un nuevo
cierre para ese día. La base de datos mantiene un único cierre activo por fecha.

### Alertas de Inventario

El sistema notifica automáticamente los productos con bajo stock o cercanos a su fecha de vencimiento.
![Stock Crítico](docs/capturas/14-stock-critico.png)
![Vencimientos](docs/capturas/13-vencimientos.png)
![Inventario Crítico](docs/capturas/11-inventario-critico.png)

### Importación de Datos y Validación

El sistema detecta y notifica errores en los archivos de carga masiva antes de corromper la base de datos.
![Validación de Importación](docs/capturas/24-importar-validacion.png)

### Reportes y Proveedores

Módulos de analítica profunda y gestión de terceros.
![Reportes](docs/capturas/21-reportes.png)
![Intermediario](docs/capturas/22-intermediario.png)

## ⚙️ Puesta en Marcha (Instalación)

El proyecto está dockerizado.

### Requisitos Previos

- [Docker](https://www.docker.com/) y Docker Compose instalados.
- Git.
- En Linux, el usuario debe tener permisos para acceder al servicio Docker.

Podés consultar la lista de requisitos en [`requirements.txt`](requirements.txt).

### Pasos para ejecutar con Docker (Recomendado)

1. **Clonar el repositorio:**

   ```bash
   git clone https://github.com/NeyelVila/Gluten-Free-Life---Sistema-de-Gesti-n---Override.git
   cd gluten-free-life
   ```

2. **Levantar los contenedores:**
   Ejecuta el siguiente comando en la raíz del proyecto para construir las imágenes y levantar la base de datos, el backend y el frontend:

   ```bash
   cp .env.example .env        # Cambiar POSTGRES_PASSWORD y JWT_SECRET según corresponda
   docker compose up -d --build
   ```

   En Linux, si aparece `PermissionError: [Errno 13] Permission denied` al
   acceder al socket de Docker, ejecutá:

   ```bash
   sudo docker-compose up -d --build
   ```

   Si tu instalación utiliza Compose V2, el equivalente es:

   ```bash
   sudo docker compose up -d --build
   ```

   Para no tener que usar `sudo` en cada comando, agregá tu usuario al grupo
   `docker` y cerrá sesión o reiniciá el equipo:

   ```bash
   sudo usermod -aG docker "$USER"
   sudo reboot
   ```

   Luego verificá el acceso con:

   ```bash
   docker ps
   ```

3. **Acceder a la Aplicación:**
   - Frontend: Abre tu navegador en `http://localhost:4000` (o el puerto expuesto).
   - Inicia sesión con las credenciales configuradas para la aplicación. En el primer arranque se aplican las migraciones y se cargan datos de demostración (solo si la base está vacía).

## Desarrollo local (sin Docker)

Esta modalidad requiere Node.js 22, npm, PostgreSQL 16 y las herramientas
cliente de PostgreSQL. En Debian/Ubuntu, instalá todo con:

```bash
sudo apt update
sudo apt install postgresql postgresql-client
sudo systemctl enable --now postgresql
pg_isready
```

`createdb` pertenece al paquete `postgresql-client`. El comando `pg_isready`
debe informar que el servidor está aceptando conexiones antes de continuar.

### 1. Crear y configurar la base de datos

Ejecutá estos comandos una sola vez:

```bash
sudo -u postgres createdb gfl
sudo -u postgres psql -c "CREATE USER gfl WITH PASSWORD 'gfl_dev';"
sudo -u postgres psql -c "ALTER DATABASE gfl OWNER TO gfl;"
```

Si la base ya existe, no repitas `createdb`. Si el usuario `gfl` ya existe,
actualizá su contraseña con:

```bash
sudo -u postgres psql -c "ALTER USER gfl WITH PASSWORD 'gfl_dev';"
```

### 2. Instalar y preparar el backend

En una terminal, desde la raíz del proyecto:

```bash
cd backend
cp .env.example .env
npm install
npm run migrate
npm run seed
npm run dev
```

El backend queda disponible en `http://localhost:4000`. El comando `seed`
carga los datos de demostración y puede borrar los datos de negocio existentes;
no lo ejecutes sobre una base real.

#### Restaurar la base de demostración

Si necesitás volver al estado inicial de la demo, detené primero el backend y
el frontend con `Ctrl+C` en sus respectivas terminales. Luego, desde la raíz
del proyecto, ejecutá:

```bash
cd backend
npm run seed
npm run dev
```

Después, en otra terminal, iniciá nuevamente el frontend:

```bash
cd frontend
npm run dev
```

`npm run seed` borra y recrea los datos de negocio, incluyendo ventas,
productos, pedidos, ingresos, alertas y cierres de caja. No lo ejecutes sobre
datos reales ni mientras otra instancia del backend esté utilizando la base.

El archivo `backend/.env` debe usar el usuario creado para la aplicación:

```env
DATABASE_URL=postgres://gfl:gfl_dev@localhost:5432/gfl
```

`gfl_dev` es una contraseña de desarrollo. Para una instalación real,
reemplazala por una contraseña segura. Si contiene caracteres reservados como
`@`, `:` o `/`, deben codificarse en la URL.

### 3. Instalar y ejecutar el frontend

Sin cerrar la terminal del backend, abrí una segunda terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite mostrará la dirección `http://localhost:5173`. Abrila en el navegador.
Durante el desarrollo local, el frontend utiliza el backend en
`http://localhost:4000`.

### 4. Ejecutar las pruebas de integración

Con PostgreSQL disponible, abrí una tercera terminal:

```bash
cd backend
npm test
```

La prueba usa PostgreSQL real, recarga los datos de demostración y ejecuta los
17 grupos de pruebas de integración de la API. No la ejecutes sobre datos
reales.

### 5. Ejecutar las pruebas unitarias

Las pruebas unitarias son independientes de PostgreSQL y del servidor web.
Verifican funciones de dominio aisladas: cálculo de precios, clasificación de
stock, vencimientos y cantidades sugeridas para pedidos.

```bash
cd backend
npm run test:unit
```

Resultado esperado:

```text
4 pruebas unitarias OK
```

Estas pruebas se encuentran en
[`backend/src/test/unit.ts`](backend/src/test/unit.ts). Para la documentación
académica, cada caso informa la regla probada y el resultado obtenido mediante
la salida de consola; una ejecución exitosa confirma que el resultado obtenido
coincide con el esperado definido en cada aserción.

### Evidencias de ejecución

Las siguientes capturas documentan ejecuciones reales de las pruebas:

#### Pruebas de integración

La prueba ejecuta la API contra PostgreSQL real y finaliza con 17 grupos
correctos.

![Evidencia de pruebas de integración](docs/capturas/Pruebas-de-integracion.png)

#### Pruebas unitarias

La suite ejecuta cuatro casos aislados sobre funciones de dominio, sin
necesidad de conexión a la base de datos.

![Evidencia de pruebas unitarias](docs/capturas/Pruebas-unitarias.png)

### Error `EADDRINUSE` en el puerto 4000

No ejecutes simultáneamente el backend local y el contenedor `app` de Docker:
ambos intentan utilizar el puerto 4000. Si Docker Compose ya está levantado,
la aplicación está disponible en `http://localhost:4000` y no hace falta
ejecutar `npm run dev`.

Para detener Docker y trabajar en modo local:

```bash
sudo docker compose down
cd backend
npm run dev
```

Para conservar Docker y usar otro puerto local, cambiá `PORT` en
`backend/.env`, por ejemplo `PORT=4001`, y ejecutá `npm run dev`. En ese caso,
el backend local estará disponible en `http://localhost:4001`.

La alternativa recomendada para evitar instalar PostgreSQL y sus herramientas
localmente es utilizar la instalación con Docker Compose indicada arriba. En
ese caso, no es necesario ejecutar `createdb`: el servicio `db` crea la base
`gfl` automáticamente.

En producción sin Docker: ejecutá `npm run build` en ambas carpetas y luego
`npm start` en `backend/`. El backend sirve el frontend compilado si existe
`frontend/dist`.

### Guía de Pruebas Rápida

Para evaluar el alcance del proyecto, te sugerimos seguir este flujo:

1. Ingresa al sistema e inicia la jornada abriendo la **Caja**.
2. Dirígete a **Importar** y sube el archivo `docs/ejemplo-catalogo-con-errores.xlsx` para ver cómo el backend rechaza y notifica datos corruptos.
3. Ve al **POS**, realiza una venta de prueba y genera el **Ticket**.
4. Revisa el **Dashboard** y el panel de **Inventario** para comprobar el descuento automático del stock.

## Cómo demostrar el modo offline

1. Ingresá y abrí **Configuración → Simular pérdida de conexión**.
2. Andá al **Punto de Venta** y hacé una venta: se guarda en el equipo (ticket `OFF-0001`).
3. Volvé a **Configuración → Restablecer conexión**: la venta se sincroniza sola y aparece «CONEXIÓN RESTABLECIDA».

Sin conexión, el resto de las pantallas queda en **solo lectura** con los datos guardados. Pedidos, ingresos, cierre de caja e importación requieren conexión y lo avisan. El catálogo se guarda en el navegador (IndexedDB) cuando se ingresa con conexión; la primera vez hace falta Internet para iniciar sesión.

## Documentación

- [Manual de usuario](docs/Manual-de-Usuario-Gluten-Free-Life.pdf): instalación de demostración, navegación y operación diaria.
- [Manual técnico del programa](docs/Manual-Tecnico-Gluten-Free-Life.pdf): arquitectura, módulos, base de datos, lógica, ejecución y pruebas.

## 📂 Estructura del Proyecto

```text
gluten-free-life/
├── frontend/             # SPA en React/Vite
│   ├── src/
│   │   ├── components/   # Componentes UI reutilizables
│   │   ├── pages/        # Vistas de la aplicación (POS, Caja, Dashboard, etc.)
│   │   ├── lib/          # Lógica de negocio
│   │   └── store/        # Manejo del estado global
├── backend/              # API RESTful en Node.js
│   ├── src/
│   │   ├── services/     # Lógica central
│   │   ├── routes.ts     # Definición de endpoints
│   │   └── db.ts         # Conexión a BD
│   └── migrations/       # Scripts SQL
├── docs/                 # Documentación, excels de prueba y capturas
└── docker-compose.yml    # Orquestación del despliegue
```

---

## **👨‍🎓👩‍🎓 Equipo**

| [<img src="https://avatars.githubusercontent.com/u/128065511?v=4" width="115"><br><sub>Ailén Páez</sub><br><sub>a.jorgelinapaez@gmail.com</sub>](https://github.com/ailenpaez) | [<img src="https://avatars.githubusercontent.com/u/124319050?v=4" width="115"><br><sub>Marcela Herrera</sub><br><sub>mfh.jea1814@gmail.com</sub>](https://github.com/HerreraMarcela) | [<img src="https://avatars.githubusercontent.com/u/95725306?v=4" width="115"><br><sub>Neyel Vilaseco</sub><br><sub>neyelvilaseco@gmail.com</sub>](https://github.com/NeyelVila) | [<img src="https://avatars.githubusercontent.com/u/138830413?v=4" width="115"><br><sub>Sebastián Matías Puche</sub><br><sub>sebasterco10@gmail.com</sub>](https://github.com/SebasTerco73) |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |

---

## Licencia

Proyecto con fines educativos (Practica profesionalizante IV: PROYETO INTEGRADOR).

Repositorio: https://github.com/NeyelVila/Gluten-Free-Life---Sistema-de-Gesti-n---Override

**Año:** 2026

_Agradecimientos especiales a los profesores y mentores que acompañaron el proceso de desarrollo de este proyecto._
