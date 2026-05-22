-- Tabla para persistir contadores de envíos WhatsApp por paciente y tipo de mensaje
CREATE TABLE IF NOT EXISTS wa_clicks (
  patient_id TEXT NOT NULL,
  button_key TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (patient_id, button_key)
);
