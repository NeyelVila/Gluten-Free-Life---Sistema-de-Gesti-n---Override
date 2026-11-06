ALTER TABLE cierre_caja
  ADD COLUMN reabierta_en TIMESTAMPTZ,
  ADD COLUMN reabierta_por INTEGER REFERENCES usuario(id_usuario),
  ADD COLUMN motivo_reapertura VARCHAR(500);

ALTER TABLE cierre_caja DROP CONSTRAINT cierre_caja_fecha_key;

CREATE UNIQUE INDEX cierre_caja_fecha_activa_key
  ON cierre_caja (fecha)
  WHERE reabierta_en IS NULL;

CREATE INDEX idx_cierre_caja_reabierta_por
  ON cierre_caja (reabierta_por);
