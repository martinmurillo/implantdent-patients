-- Agrega columna de recordatorios a la tabla de pacientes
ALTER TABLE patients ADD COLUMN IF NOT EXISTS reminders JSONB DEFAULT '[]'::jsonb;
