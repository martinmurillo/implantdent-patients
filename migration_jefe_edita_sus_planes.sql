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
-- Esto añade sólo lo que falta: el DELETE, acotado a los suyos Y a los que
-- están en borrador. Un plan activo tiene cobros colgando y un paciente al
-- que se le prometió un calendario: para retirarlo está el estado
-- 'cancelado', que no destruye nada. Los planes del dueño quedan igual de
-- intocables que hasta ahora.
--
-- Nota sobre las cuotas: payment_plan_cuotas cuelga de payment_plans con
-- ON DELETE CASCADE, así que al borrar el plan se va su calendario solo. No
-- hace falta tocar "jefe_escribe_cuotas", que sigue haciéndole falta para
-- editar sus planes (regenerar cuotas al cambiar importes).

-- ── Eliminar sólo sus borradores ────────────────────────────────────
DROP POLICY IF EXISTS "jefe_borra_sus_planes" ON payment_plans;
DROP POLICY IF EXISTS "jefe_borra_sus_borradores" ON payment_plans;
CREATE POLICY "jefe_borra_sus_borradores" ON payment_plans
  FOR DELETE USING (
    public.rol_actual() = 'jefe'
    AND creado_por = lower(auth.jwt() ->> 'email')
    AND estado = 'borrador'
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
--   -- borrar uno del dueño: debe dar 0 (no error, 0 filas)
--   WITH x AS (DELETE FROM payment_plans WHERE creado_por IS NULL RETURNING 1)
--   SELECT count(*) AS borrados_del_dueno FROM x;
--
--   -- borrar un ACTIVO suyo: debe dar 0. Esto es lo importante de comprobar.
--   WITH x AS (DELETE FROM payment_plans
--              WHERE creado_por = 'EMAIL_DE_HERNAN' AND estado = 'activo'
--              RETURNING 1)
--   SELECT count(*) AS borrados_activos_suyos FROM x;
--
--   -- borrar un BORRADOR suyo: debe dar los que tenga
--   WITH x AS (DELETE FROM payment_plans
--              WHERE creado_por = 'EMAIL_DE_HERNAN' AND estado = 'borrador'
--              RETURNING 1)
--   SELECT count(*) AS borrados_borradores_suyos FROM x;
-- ROLLBACK;
