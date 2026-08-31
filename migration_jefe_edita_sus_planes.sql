-- ============================================================
-- Que el jefe pueda editar y eliminar los planes que él creó
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- ⚠ TOCA PERMISOS. Probar antes de mergear a main.
--
-- Situación de partida (migration_planes_hernan.sql):
--   · el jefe ya puede CREAR planes a su nombre
--   · ya puede EDITAR (UPDATE) los que él creó
--   · ya puede LEER los suyos
--   · NO puede eliminarlos: no hay política de DELETE para 'jefe'
--
-- Esto añade sólo lo que falta: el DELETE, y siempre acotado a los suyos.
-- Los planes del dueño quedan igual de intocables que hasta ahora.
--
-- Nota sobre las cuotas: payment_plan_cuotas ya tiene una política FOR ALL
-- para el jefe acotada a los planes que él creó ("jefe_escribe_cuotas"), así
-- que el borrado del calendario ya está cubierto y no hace falta tocarla.

-- ── Eliminar planes propios ─────────────────────────────────────────
DROP POLICY IF EXISTS "jefe_borra_sus_planes" ON payment_plans;
CREATE POLICY "jefe_borra_sus_planes" ON payment_plans
  FOR DELETE USING (
    public.rol_actual() = 'jefe'
    AND creado_por = lower(auth.jwt() ->> 'email')
  );

-- ── Comprobación ────────────────────────────────────────────────────
-- Todo dentro de una transacción que se deshace: no deja rastro.
-- Sustituí el email por el de Hernán antes de correrlo.
--
-- BEGIN;
--   SET LOCAL ROLE authenticated;
--   SET LOCAL request.jwt.claims = '{"email":"EMAIL_DE_HERNAN"}';
--
--   -- debe devolver 'jefe'
--   SELECT public.rol_actual();
--
--   -- los suyos: debe listar sólo planes con creado_por = su email
--   SELECT id, estado, creado_por FROM payment_plans;
--
--   -- borrar uno del dueño: debe afectar 0 filas (no error, 0 filas)
--   WITH x AS (DELETE FROM payment_plans WHERE creado_por IS NULL RETURNING 1)
--   SELECT count(*) AS borrados_del_dueno FROM x;
--
--   -- borrar uno suyo: debe afectar las que tenga
--   WITH x AS (DELETE FROM payment_plans
--              WHERE creado_por = 'EMAIL_DE_HERNAN' RETURNING 1)
--   SELECT count(*) AS borrados_suyos FROM x;
-- ROLLBACK;
