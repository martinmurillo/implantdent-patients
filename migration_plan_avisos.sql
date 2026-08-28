-- ============================================================
-- Registro de recordatorios de cobro enviados
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- ⚠ TOCA PERMISOS.
--
-- Los tres usuarios ven la cola diaria y cualquiera puede mandar el
-- mensaje, así que hace falta un registro compartido de lo ya enviado:
-- si no, el paciente recibiría el mismo aviso tres veces.
--
-- Tabla aparte y no wa_clicks a propósito: wa_clicks lleva contadores de
-- TODOS los pacientes, y darle acceso al personal les enseñaría a quién
-- se ha escrito de gente que no tienen por qué conocer. Esta solo habla
-- de planes, que es lo que ya pueden ver.

CREATE TABLE IF NOT EXISTS plan_avisos (
  clave       TEXT PRIMARY KEY,          -- aviso_<plan>_<mes>_<dias de antelación>
  plan_id     TEXT NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  mes         INTEGER NOT NULL,
  dias        INTEGER NOT NULL,          -- 7, 1 ó 0
  enviado_por TEXT NOT NULL DEFAULT '',
  enviado_el  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_avisos_plan_idx ON plan_avisos(plan_id);

ALTER TABLE plan_avisos ENABLE ROW LEVEL SECURITY;

-- Se puede leer y anotar el aviso de un plan que ya se puede ver. No hace
-- falta más: quien no ve el plan tampoco ve ni escribe sus avisos.
DROP POLICY IF EXISTS "ve_avisos_de_sus_planes"   ON plan_avisos;
DROP POLICY IF EXISTS "anota_avisos_de_sus_planes" ON plan_avisos;

CREATE POLICY "ve_avisos_de_sus_planes" ON plan_avisos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM payment_plans pp WHERE pp.id = plan_avisos.plan_id)
  );

CREATE POLICY "anota_avisos_de_sus_planes" ON plan_avisos
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM payment_plans pp WHERE pp.id = plan_avisos.plan_id)
    AND enviado_por = lower(auth.jwt() ->> 'email')
  );

-- Deshacer un envío marcado por error: solo el dueño
DROP POLICY IF EXISTS "dueno_borra_avisos" ON plan_avisos;
CREATE POLICY "dueno_borra_avisos" ON plan_avisos
  FOR DELETE USING (public.es_dueno());

GRANT SELECT, INSERT, DELETE ON public.plan_avisos TO authenticated;

-- Que los tres vean al momento lo que manda cualquiera
ALTER PUBLICATION supabase_realtime ADD TABLE plan_avisos;
