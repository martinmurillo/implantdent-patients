-- ============================================================
-- Fecha del primer cobro en clínica, editable
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Por defecto las cuotas vencen el mismo día del mes que la fecha de
-- inicio. Con esta columna se puede fijar otro día acordado con el
-- paciente (cobrar el 5, cuando le entra la nómina, por ejemplo) y las
-- demás cuotas van de mes en mes a partir de ahí.
--
-- NULL = comportamiento de siempre, derivado de fecha_inicio.

ALTER TABLE payment_plans
  ADD COLUMN IF NOT EXISTS fecha_primer_cobro DATE;
