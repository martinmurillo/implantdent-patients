-- ============================================================
-- Que el jefe pueda armar planes de pago
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- ⚠ TOCA PERMISOS. Probar antes de dar por bueno.
--
-- Qué habilita:
--   · buscar un presupuesto por nº de historia y ver un resumen para
--     cotejarlo con el del sistema de la clínica antes de armar nada
--   · crear planes, y crear el paciente si no está en el sistema
--   · todo lo que cree queda a su nombre, para no confundirlo con lo del
--     dueño y para dejarlo fuera de las estadísticas

-- ── Quién creó cada cosa ────────────────────────────────────────────
-- NULL = lo creó el dueño, que es todo lo que había hasta ahora.
ALTER TABLE patients      ADD COLUMN IF NOT EXISTS creado_por TEXT;
ALTER TABLE payment_plans ADD COLUMN IF NOT EXISTS creado_por TEXT;

CREATE INDEX IF NOT EXISTS patients_creado_por_idx ON patients(creado_por)
  WHERE creado_por IS NOT NULL;

-- ── Consulta de presupuesto por nº de historia ──────────────────────
-- SECURITY DEFINER a propósito: así el jefe puede cotejar un presupuesto
-- concreto SIN darle lectura de la tabla de pacientes. No puede listar,
-- ni buscar por nombre, ni ver historial clínico, notas, DNI o teléfono.
-- Solo lo que necesita el cartel de cotejo, y solo con el HC exacto.
CREATE OR REPLACE FUNCTION public.presupuesto_por_hc(p_hc TEXT)
RETURNS TABLE (
  id                 TEXT,
  name               TEXT,
  hc                 TEXT,
  budget_no          TEXT,
  fecha              TEXT,
  treatments         JSONB,
  paciente_creado_por TEXT,
  plan_id            TEXT,
  plan_estado        TEXT,
  plan_modo          TEXT,
  plan_entrega       NUMERIC,
  plan_n_cuotas      INTEGER,
  plan_importe_cuota NUMERIC,
  plan_fecha_inicio  DATE,
  plan_creado_por    TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id::text, p.name, p.hc, p.budget_no, p.date,
         p.treatments, p.creado_por,
         pl.id, pl.estado, pl.modo, pl.entrega, pl.n_cuotas,
         pl.importe_cuota, pl.fecha_inicio, pl.creado_por
  FROM patients p
  LEFT JOIN LATERAL (
    SELECT * FROM payment_plans x
    WHERE x.patient_id = p.id::text
    ORDER BY CASE x.estado WHEN 'activo' THEN 0 WHEN 'borrador' THEN 1
                           WHEN 'terminado' THEN 2 ELSE 3 END,
             x.updated_at DESC
    LIMIT 1
  ) pl ON TRUE
  WHERE btrim(p.hc) = btrim(p_hc)
    AND public.rol_actual() IN ('dueno','jefe');
$$;

REVOKE ALL ON FUNCTION public.presupuesto_por_hc(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.presupuesto_por_hc(TEXT) TO authenticated;

-- ── El jefe puede crear pacientes, pero solo suyos ──────────────────
DROP POLICY IF EXISTS "jefe_crea_pacientes"   ON patients;
DROP POLICY IF EXISTS "jefe_edita_sus_pacientes" ON patients;

CREATE POLICY "jefe_crea_pacientes" ON patients
  FOR INSERT WITH CHECK (
    public.rol_actual() = 'jefe'
    AND creado_por = lower(auth.jwt() ->> 'email')
  );

-- y editar los que él mismo creó, no los del dueño
CREATE POLICY "jefe_edita_sus_pacientes" ON patients
  FOR UPDATE USING (public.rol_actual() = 'jefe'
                    AND creado_por = lower(auth.jwt() ->> 'email'))
        WITH CHECK (public.rol_actual() = 'jefe'
                    AND creado_por = lower(auth.jwt() ->> 'email'));

-- leer los suyos completos (los del dueño siguen pasando por la función)
DROP POLICY IF EXISTS "jefe_lee_sus_pacientes" ON patients;
CREATE POLICY "jefe_lee_sus_pacientes" ON patients
  FOR SELECT USING (public.rol_actual() = 'jefe'
                    AND creado_por = lower(auth.jwt() ->> 'email'));

-- ── El jefe puede crear planes, a su nombre ─────────────────────────
DROP POLICY IF EXISTS "jefe_crea_planes" ON payment_plans;
CREATE POLICY "jefe_crea_planes" ON payment_plans
  FOR INSERT WITH CHECK (
    public.rol_actual() = 'jefe'
    AND creado_por = lower(auth.jwt() ->> 'email')
  );

-- y editar los que él creó, en cualquier estado (para sus borradores)
DROP POLICY IF EXISTS "jefe_edita_sus_planes" ON payment_plans;
CREATE POLICY "jefe_edita_sus_planes" ON payment_plans
  FOR UPDATE USING (public.rol_actual() = 'jefe'
                    AND creado_por = lower(auth.jwt() ->> 'email'))
        WITH CHECK (public.rol_actual() = 'jefe'
                    AND creado_por = lower(auth.jwt() ->> 'email'));

-- ver sus borradores además de los activos y terminados de todos
DROP POLICY IF EXISTS "jefe_lee_sus_planes" ON payment_plans;
CREATE POLICY "jefe_lee_sus_planes" ON payment_plans
  FOR SELECT USING (public.rol_actual() = 'jefe'
                    AND creado_por = lower(auth.jwt() ->> 'email'));

-- ── Cuotas de los planes que él crea ────────────────────────────────
DROP POLICY IF EXISTS "jefe_escribe_cuotas" ON payment_plan_cuotas;
CREATE POLICY "jefe_escribe_cuotas" ON payment_plan_cuotas
  FOR ALL USING (
    public.rol_actual() = 'jefe'
    AND EXISTS (SELECT 1 FROM payment_plans pp
                WHERE pp.id = payment_plan_cuotas.plan_id
                  AND pp.creado_por = lower(auth.jwt() ->> 'email'))
  )
  WITH CHECK (
    public.rol_actual() = 'jefe'
    AND EXISTS (SELECT 1 FROM payment_plans pp
                WHERE pp.id = payment_plan_cuotas.plan_id
                  AND pp.creado_por = lower(auth.jwt() ->> 'email'))
  );
