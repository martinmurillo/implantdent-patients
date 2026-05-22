-- Agrega columna historial clínico a la tabla de pacientes
ALTER TABLE patients ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]'::jsonb;
