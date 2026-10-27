-- Gluten Free Life — Sistema de Gestión
-- Modelo de datos según el DER del MDS (sin lotes, vencimiento por producto,
-- un único intermediario logístico) + INGRESO_MERCADERIA / DETALLE_INGRESO.

CREATE TYPE tipo_venta AS ENUM ('UNIDAD','GRANEL');
CREATE TYPE canal_pago AS ENUM ('EFECTIVO','MERCADO_PAGO','TARJETA');
CREATE TYPE estado_venta AS ENUM ('REGISTRADA','ANULADA');
CREATE TYPE estado_vencimiento AS ENUM ('NORMAL','PROXIMO','VENCIDO','RETIRADO');
CREATE TYPE estado_pedido AS ENUM ('EN_PREPARACION','GENERADO','EXPORTADO','ENVIADO','EN_GESTION','ENTREGADO','FINALIZADO');

CREATE TABLE usuario (
  id_usuario     SERIAL PRIMARY KEY,
  nombre         VARCHAR(120) NOT NULL,
  usuario_login  VARCHAR(60)  NOT NULL UNIQUE,
  clave_hash     VARCHAR(200) NOT NULL,
  activo         BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE producto (
  id_producto        SERIAL PRIMARY KEY,
  codigo_barra       VARCHAR(60) UNIQUE,
  nombre             VARCHAR(160) NOT NULL,
  categoria          VARCHAR(80)  NOT NULL,
  tipo_venta         tipo_venta   NOT NULL DEFAULT 'UNIDAD',
  stock_actual       NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  stock_minimo       NUMERIC(12,3) NOT NULL DEFAULT 0,
  precio_costo       NUMERIC(12,2) NOT NULL DEFAULT 0,
  porcentaje_margen  NUMERIC(5,2)  NOT NULL DEFAULT 40,
  precio_venta       NUMERIC(12,2) NOT NULL DEFAULT 0,
  activo             BOOLEAN NOT NULL DEFAULT true   -- técnico: baja lógica
);

CREATE TABLE vencimiento_producto (
  id_vencimiento     SERIAL PRIMARY KEY,
  id_producto        INTEGER NOT NULL REFERENCES producto(id_producto) ON DELETE CASCADE,
  fecha_vencimiento  DATE NOT NULL,
  cantidad           NUMERIC(12,3) NOT NULL CHECK (cantidad >= 0),
  estado             estado_vencimiento NOT NULL DEFAULT 'NORMAL'
);
CREATE INDEX idx_venc_producto ON vencimiento_producto(id_producto, fecha_vencimiento);

CREATE TABLE venta (
  id_venta         SERIAL PRIMARY KEY,
  id_usuario       INTEGER NOT NULL REFERENCES usuario(id_usuario),
  fecha_hora       TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_cobrado    NUMERIC(12,2) NOT NULL,
  canal_pago       canal_pago NOT NULL,
  estado           estado_venta NOT NULL DEFAULT 'REGISTRADA',
  -- técnicos
  numero_ticket    SERIAL UNIQUE,
  uuid_cliente     UUID UNIQUE,
  monto_recibido   NUMERIC(12,2),
  vuelto           NUMERIC(12,2),
  sincronizada_en  TIMESTAMPTZ
);
CREATE INDEX idx_venta_fecha ON venta(fecha_hora);

CREATE TABLE detalle_venta (
  id_detalle        SERIAL PRIMARY KEY,
  id_venta          INTEGER NOT NULL REFERENCES venta(id_venta) ON DELETE CASCADE,
  id_producto       INTEGER NOT NULL REFERENCES producto(id_producto),
  cantidad          NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  precio_unit_hist  NUMERIC(12,2) NOT NULL,
  subtotal          NUMERIC(12,2) NOT NULL
);
CREATE INDEX idx_detalle_venta_venta ON detalle_venta(id_venta);
CREATE INDEX idx_detalle_venta_prod ON detalle_venta(id_producto);

CREATE TABLE cierre_caja (
  id_cierre        SERIAL PRIMARY KEY,
  id_usuario       INTEGER NOT NULL REFERENCES usuario(id_usuario),
  fecha            DATE NOT NULL UNIQUE,
  total_efectivo   NUMERIC(12,2) NOT NULL,
  total_digital    NUMERIC(12,2) NOT NULL,
  diferencia       NUMERIC(12,2) NOT NULL,
  -- técnicos
  fondo_inicial    NUMERIC(12,2) NOT NULL DEFAULT 0,
  efectivo_contado NUMERIC(12,2) NOT NULL DEFAULT 0,
  observacion      TEXT,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE intermediario_logistico (
  id_intermediario  SERIAL PRIMARY KEY,
  nombre            VARCHAR(160) NOT NULL,
  contacto          VARCHAR(160),
  -- técnicos
  telefono_whatsapp VARCHAR(40),
  email             VARCHAR(160),
  observaciones     TEXT
);

CREATE TABLE pedido_compra (
  id_pedido         SERIAL PRIMARY KEY,
  id_usuario        INTEGER NOT NULL REFERENCES usuario(id_usuario),
  id_intermediario  INTEGER NOT NULL REFERENCES intermediario_logistico(id_intermediario),
  fecha_generacion  TIMESTAMPTZ NOT NULL DEFAULT now(),
  estado            estado_pedido NOT NULL DEFAULT 'EN_PREPARACION',
  archivo_exportado VARCHAR(200),
  -- técnico: historial de cambios de estado
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE detalle_pedido (
  id_det_pedido       SERIAL PRIMARY KEY,
  id_pedido           INTEGER NOT NULL REFERENCES pedido_compra(id_pedido) ON DELETE CASCADE,
  id_producto         INTEGER NOT NULL REFERENCES producto(id_producto),
  cantidad_solicitada NUMERIC(12,3) NOT NULL CHECK (cantidad_solicitada > 0),
  observacion         VARCHAR(250),
  UNIQUE (id_pedido, id_producto)
);

-- técnico: registro de cada cambio de estado (línea de tiempo del pedido)
CREATE TABLE pedido_estado_historial (
  id          SERIAL PRIMARY KEY,
  id_pedido   INTEGER NOT NULL REFERENCES pedido_compra(id_pedido) ON DELETE CASCADE,
  estado      estado_pedido NOT NULL,
  fecha_hora  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ingreso_mercaderia (
  id_ingreso          SERIAL PRIMARY KEY,
  id_usuario          INTEGER NOT NULL REFERENCES usuario(id_usuario),
  id_pedido           INTEGER REFERENCES pedido_compra(id_pedido),
  numero_comprobante  VARCHAR(80),
  fecha               DATE NOT NULL DEFAULT current_date
);

CREATE TABLE detalle_ingreso (
  id_det_ingreso     SERIAL PRIMARY KEY,
  id_ingreso         INTEGER NOT NULL REFERENCES ingreso_mercaderia(id_ingreso) ON DELETE CASCADE,
  id_producto        INTEGER NOT NULL REFERENCES producto(id_producto),
  cantidad           NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  precio_costo       NUMERIC(12,2) NOT NULL,
  fecha_vencimiento  DATE
);

-- técnico: configuración clave/valor
CREATE TABLE configuracion (
  clave  VARCHAR(80) PRIMARY KEY,
  valor  VARCHAR(500) NOT NULL DEFAULT ''
);

-- técnico: avisos del sistema (p. ej. stock insuficiente al sincronizar ventas offline)
CREATE TABLE alerta_sistema (
  id         SERIAL PRIMARY KEY,
  tipo       VARCHAR(40) NOT NULL,
  mensaje    VARCHAR(400) NOT NULL,
  fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  leida      BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO configuracion (clave, valor) VALUES
  ('comercio_nombre', 'Gluten Free Life'),
  ('comercio_direccion', 'Av. Siempreviva 742'),
  ('comercio_telefono', '011 5555-0100'),
  ('ticket_texto', '¡Gracias por su compra! Comprobante no válido como factura.'),
  ('stock_minimo_default', '2'),
  ('umbral_alerta', '1'),
  ('margen_default', '40'),
  ('dias_alerta_vencimiento', '30'),
  ('impresion_ancho_ticket', '80mm')
ON CONFLICT DO NOTHING;
