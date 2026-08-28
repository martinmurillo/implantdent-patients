-- ============================================================
-- RLS por rol: cerrar en la base el acceso del jefe y de recepción
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Hasta ahora la política de todas las tablas era la misma: "cualquier
-- usuario autenticado puede todo". Bastaba con un único usuario, pero con
-- las cuentas del jefe y de recepción significa que podrían leer y
-- modificar cualquier cosa yendo contra la API por su cuenta, aunque la
-- pantalla no se lo enseñe.
--
--   dueño     → sin fila en plan_usuarios. Acceso completo, como hasta hoy.
--   jefe      → lee lo necesario para los planes vigentes y puede
--               actualizar esos planes (mover tratamientos). Nada más.
--   recepcion → solo lectura de lo mismo.
--
-- IMPORTANTE sobre el alcance: RLS filtra FILAS, no columnas. Los GRANT
-- por columna no sirven aquí porque el dueño también es 'authenticated' y
-- perdería el acceso él mismo. Por eso el corte se hace por filas: el
-- personal solo alcanza a los pacientes que tienen un plan vigente. De
-- esos pacientes sí podría leer todas las columnas contra la API; del
-- resto de la base, ninguna.

-- ── Limpieza previa ─────────────────────────────────────────────────
-- Se borran TODAS las políticas existentes de estas tablas antes de
-- recrearlas. Las políticas son permisivas y se suman con OR: una sola
-- política vieja de "todo permitido" anularía todo lo que viene abajo.
--
-- ⚠ Había dos así, "allow_all" en payments y "allow all" en
--   clinic_monthly_stats, con rol {public}. Eso incluye a anon, o sea que
--   cualquiera con la clave pública podía leer todos los cobros y las
--   cifras mensuales de la clínica sin estar identificado. Comprobado
--   contra la API antes de escribir esto.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('patients','payments','payment_plans','payment_plan_cuotas',
                        'plan_usuarios','treatment_items','treatment_templates',
                        'treatment_translations','doctors','wa_clicks','clinic_monthly_stats')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Y RLS activo en todas, por si alguna quedó sin él
ALTER TABLE patients             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plan_cuotas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_usuarios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_clicks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_monthly_stats ENABLE ROW LEVEL SECURITY;

-- ── Quién es quién ──────────────────────────────────────────────────
-- SECURITY DEFINER para que la función pueda consultar plan_usuarios sin
-- que el propio usuario necesite permiso sobre esa tabla.
CREATE OR REPLACE FUNCTION public.rol_actual()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT rol FROM plan_usuarios WHERE lower(email) = lower(auth.jwt() ->> 'email')),
    'dueno'
  );
$$;

CREATE OR REPLACE FUNCTION public.es_dueno()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.rol_actual() = 'dueno';
$$;

REVOKE ALL ON FUNCTION public.rol_actual() FROM public;
REVOKE ALL ON FUNCTION public.es_dueno()   FROM public;
GRANT EXECUTE ON FUNCTION public.rol_actual() TO authenticated;
GRANT EXECUTE ON FUNCTION public.es_dueno()   TO authenticated;

-- ── Tablas que el personal no necesita en absoluto ──────────────────
-- Historial clínico cerrado, plantillas, doctores, traducciones,
-- estadísticas y contadores de WhatsApp: solo el dueño.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'treatment_items', 'treatment_templates', 'treatment_translations',
    'doctors', 'wa_clicks', 'clinic_monthly_stats'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "dueno_todo" ON %I FOR ALL
         USING (auth.role() = ''authenticated'' AND public.es_dueno())
         WITH CHECK (auth.role() = ''authenticated'' AND public.es_dueno())', t);
  END LOOP;
END $$;

-- ── patients ────────────────────────────────────────────────────────
-- El personal solo alcanza a los pacientes que tienen un plan vigente.
DROP POLICY IF EXISTS "dueno_todo"        ON patients;
DROP POLICY IF EXISTS "personal_lee"      ON patients;

CREATE POLICY "dueno_todo" ON patients
  FOR ALL USING (auth.role() = 'authenticated' AND public.es_dueno())
          WITH CHECK (auth.role() = 'authenticated' AND public.es_dueno());

CREATE POLICY "personal_lee" ON patients
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND EXISTS (SELECT 1 FROM payment_plans pp
                WHERE pp.patient_id = patients.id::text
                  AND pp.estado IN ('activo','terminado'))
  );

-- ── payments ────────────────────────────────────────────────────────
-- Leer solo los cobros de esos mismos pacientes, para poder mostrar qué
-- está pagado. Registrar, cambiar o borrar cobros: únicamente el dueño.
DROP POLICY IF EXISTS "dueno_todo"        ON payments;
DROP POLICY IF EXISTS "personal_lee"      ON payments;

CREATE POLICY "dueno_todo" ON payments
  FOR ALL USING (auth.role() = 'authenticated' AND public.es_dueno())
          WITH CHECK (auth.role() = 'authenticated' AND public.es_dueno());

CREATE POLICY "personal_lee" ON payments
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND EXISTS (SELECT 1 FROM payment_plans pp
                WHERE pp.patient_id = payments.patient_id
                  AND pp.estado IN ('activo','terminado'))
  );

-- ── payment_plans ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "dueno_todo"        ON payment_plans;
DROP POLICY IF EXISTS "personal_lee"      ON payment_plans;
DROP POLICY IF EXISTS "jefe_actualiza"    ON payment_plans;

CREATE POLICY "dueno_todo" ON payment_plans
  FOR ALL USING (auth.role() = 'authenticated' AND public.es_dueno())
          WITH CHECK (auth.role() = 'authenticated' AND public.es_dueno());

-- borradores y cancelados no se ven desde el portal
CREATE POLICY "personal_lee" ON payment_plans
  FOR SELECT USING (auth.role() = 'authenticated' AND estado IN ('activo','terminado'));

-- el jefe puede mover tratamientos; recepción no
CREATE POLICY "jefe_actualiza" ON payment_plans
  FOR UPDATE USING (auth.role() = 'authenticated' AND public.rol_actual() = 'jefe'
                    AND estado IN ('activo','terminado'))
        WITH CHECK (auth.role() = 'authenticated' AND public.rol_actual() = 'jefe'
                    AND estado IN ('activo','terminado'));

-- ── payment_plan_cuotas ─────────────────────────────────────────────
DROP POLICY IF EXISTS "dueno_todo"        ON payment_plan_cuotas;
DROP POLICY IF EXISTS "personal_lee"      ON payment_plan_cuotas;

CREATE POLICY "dueno_todo" ON payment_plan_cuotas
  FOR ALL USING (auth.role() = 'authenticated' AND public.es_dueno())
          WITH CHECK (auth.role() = 'authenticated' AND public.es_dueno());

CREATE POLICY "personal_lee" ON payment_plan_cuotas
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND EXISTS (SELECT 1 FROM payment_plans pp
                WHERE pp.id = payment_plan_cuotas.plan_id
                  AND pp.estado IN ('activo','terminado'))
  );

-- ── plan_usuarios ───────────────────────────────────────────────────
-- Solo el dueño reparte roles. Cada cual puede consultar el suyo, que es
-- lo que hace el portal al entrar.
DROP POLICY IF EXISTS "dueno_todo"        ON plan_usuarios;
DROP POLICY IF EXISTS "ve_su_rol"         ON plan_usuarios;

CREATE POLICY "dueno_todo" ON plan_usuarios
  FOR ALL USING (auth.role() = 'authenticated' AND public.es_dueno())
          WITH CHECK (auth.role() = 'authenticated' AND public.es_dueno());

CREATE POLICY "ve_su_rol" ON plan_usuarios
  FOR SELECT USING (auth.role() = 'authenticated'
                    AND lower(email) = lower(auth.jwt() ->> 'email'));
