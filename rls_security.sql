-- ============================================================
-- SEGURIDAD: Row Level Security para todas las tablas
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Habilitar RLS en todas las tablas
ALTER TABLE patients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors               ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_templates   ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE treatment_translations ENABLE ROW LEVEL SECURITY;  ← ejecutar después de crear la tabla
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;

-- 2. Políticas: solo usuarios autenticados pueden acceder
--    (el PIN correcto inicia sesión en Supabase Auth → JWT válido → acceso permitido)

CREATE POLICY "solo_autenticados" ON patients
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON doctors
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON treatment_items
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON treatment_templates
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- CREATE POLICY "solo_autenticados" ON treatment_translations  ← ejecutar después de crear la tabla
--   FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON payments
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
