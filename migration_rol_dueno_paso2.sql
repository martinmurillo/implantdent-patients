-- ============================================================
-- PASO 2 de 2 — Que sin fila en plan_usuarios no se entre
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- ⚠ CORRER DESPUÉS de migration_rol_dueno_paso1.sql, que da de alta al
--   dueño. Al revés, el dueño se queda fuera.
--
-- Antes: sin fila → 'dueno'. Fallaba abierto. Eso significaba que
--   · borrar la fila de alguien le AMPLIABA el acceso en vez de quitárselo,
--     justo lo contrario de lo que uno espera de un DELETE
--   · cualquier cuenta nueva nacía con acceso total, y el registro público
--     estaba abierto
--
-- Ahora: sin fila → 'sin_acceso'. Falla cerrado. Quien no esté listado no
-- pasa de la pantalla de entrada, y un DELETE retira el acceso de verdad.

CREATE OR REPLACE FUNCTION public.rol_actual()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT rol FROM plan_usuarios WHERE lower(email) = lower(auth.jwt() ->> 'email')),
    'sin_acceso'
  );
$$;

-- es_dueno() no cambia de forma, pero ahora solo es cierto con fila 'dueno'
CREATE OR REPLACE FUNCTION public.es_dueno()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.rol_actual() = 'dueno';
$$;

-- El personal deja de ser "cualquier autenticado": ahora hay que estar
-- listado. Se rehacen las políticas que decían solo auth.role().
DROP POLICY IF EXISTS "personal_lee" ON patients;
CREATE POLICY "personal_lee" ON patients
  FOR SELECT USING (
    public.rol_actual() IN ('jefe','recepcion')
    AND EXISTS (SELECT 1 FROM payment_plans pp
                WHERE pp.patient_id = patients.id::text
                  AND pp.estado IN ('activo','terminado'))
  );

DROP POLICY IF EXISTS "personal_lee" ON payments;
CREATE POLICY "personal_lee" ON payments
  FOR SELECT USING (
    public.rol_actual() IN ('jefe','recepcion')
    AND EXISTS (SELECT 1 FROM payment_plans pp
                WHERE pp.patient_id = payments.patient_id
                  AND pp.estado IN ('activo','terminado'))
  );

DROP POLICY IF EXISTS "personal_lee" ON payment_plans;
CREATE POLICY "personal_lee" ON payment_plans
  FOR SELECT USING (
    public.rol_actual() IN ('jefe','recepcion')
    AND estado IN ('activo','terminado')
  );

DROP POLICY IF EXISTS "personal_lee" ON payment_plan_cuotas;
CREATE POLICY "personal_lee" ON payment_plan_cuotas
  FOR SELECT USING (
    public.rol_actual() IN ('jefe','recepcion')
    AND EXISTS (SELECT 1 FROM payment_plans pp
                WHERE pp.id = payment_plan_cuotas.plan_id
                  AND pp.estado IN ('activo','terminado'))
  );

-- Consultar el propio rol sigue abierto a cualquier autenticado: es lo que
-- hace la aplicación al entrar para saber si deja pasar. Sin fila no
-- devuelve nada, que es la respuesta correcta.
DROP POLICY IF EXISTS "ve_su_rol" ON plan_usuarios;
CREATE POLICY "ve_su_rol" ON plan_usuarios
  FOR SELECT USING (auth.role() = 'authenticated'
                    AND lower(email) = lower(auth.jwt() ->> 'email'));
