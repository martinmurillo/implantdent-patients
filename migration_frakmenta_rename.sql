-- ============================================================
-- La financiera se llama FRAKMENTA, no Fragmenta
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- RENAME COLUMN conserva los datos: los planes que ya tienen
-- financiación no se tocan.

ALTER TABLE payment_plans RENAME COLUMN fragmenta_plazo    TO frakmenta_plazo;
ALTER TABLE payment_plans RENAME COLUMN fragmenta_comision TO frakmenta_comision;

ALTER TABLE payment_plans
  DROP CONSTRAINT IF EXISTS payment_plans_fragmenta_plazo_chk;
ALTER TABLE payment_plans
  DROP CONSTRAINT IF EXISTS payment_plans_frakmenta_plazo_chk;
ALTER TABLE payment_plans
  ADD CONSTRAINT payment_plans_frakmenta_plazo_chk
  CHECK (frakmenta_plazo IN (0, 3, 5, 10, 12));
