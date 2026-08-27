-- ============================================================
-- Financiación de la entrega con Frakmenta
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- El importe financiado es la entrega del plan (columna entrega), así que
-- no se duplica. Solo hace falta guardar el plazo y la comisión.
--
-- La comisión se guarda como foto y NO se recalcula: las tarifas de la
-- financiera cambian, y un plan firmado tiene que conservar la que se
-- le prometió al paciente.

ALTER TABLE payment_plans
  ADD COLUMN IF NOT EXISTS frakmenta_plazo    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frakmenta_comision NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 0 = la entrega no se financia. El resto, los plazos que ofrece Frakmenta.
ALTER TABLE payment_plans
  DROP CONSTRAINT IF EXISTS payment_plans_frakmenta_plazo_chk;
ALTER TABLE payment_plans
  ADD CONSTRAINT payment_plans_frakmenta_plazo_chk
  CHECK (frakmenta_plazo IN (0, 3, 5, 10, 12));
