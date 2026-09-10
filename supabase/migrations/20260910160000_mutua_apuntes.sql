-- ============================================================
-- Mutua: apuntes propios y pacientes dados de alta a mano
-- Se aplica con: npx supabase db push
-- ============================================================
-- ⚠ TOCA PERMISOS. Probar antes de dar por bueno.
--
-- El export del portal llega con retraso: lo que se hizo en la clínica esta
-- semana no aparece hasta la siguiente exportación, y mientras tanto la pieza
-- figura libre y se puede volver a citar por error. A partir de aquí el
-- programa es el registro y el export solo lo completa hacia atrás.
--
-- Van en tablas aparte porque la importación BORRA mutua_prestaciones entera
-- (el export trae el historial completo y no hay clave por la que casar filas,
-- así que se reemplaza todo). Lo apuntado a mano no puede vivir ahí dentro o
-- desaparecería en la siguiente importación.

-- ── Pacientes que todavía no salen en ningún export ──────────────────
-- Uno recién llegado de la mutua no está en el archivo hasta que se le
-- factura algo. Se le da de alta aquí con la misma clave que usa el
-- importador (DNI, o 'NOM:' || nombre normalizado), así que el día que
-- aparezca en el export las dos mitades se juntan solas.
CREATE TABLE IF NOT EXISTS mutua_pacientes_manuales (
  paciente_key TEXT PRIMARY KEY,
  dni          TEXT,
  nombre       TEXT NOT NULL,
  nota         TEXT,
  creado_por   TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Lo que se apunta en la clínica ──────────────────────────────────
--   'hecho'    ya realizado: cuenta y bloquea la pieza 6 meses, igual
--              que si viniera del portal
--   'previsto' planificado: no bloquea, porque no se facturó nada, pero
--              marca la pieza para no volver a ofrecerla como trabajo
--              por hacer
CREATE TABLE IF NOT EXISTS mutua_apuntes (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  paciente_key TEXT NOT NULL,
  -- La familia y no el código: quien apunta en la clínica no tiene por qué
  -- saberse los códigos de la mutua. Mismo CHECK que en mutua_familias, que
  -- no sirve de FK porque su clave es el código y la familia se repite.
  familia      TEXT NOT NULL CHECK (familia IN ('OBTURACION','ANGULOS','PERDIDA')),
  pieza        SMALLINT NOT NULL,
  estado       TEXT NOT NULL CHECK (estado IN ('hecho','previsto')),
  fecha        DATE,
  nota         TEXT,
  creado_por   TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- lo hecho necesita fecha: de ella cuelgan los 6 meses
  CONSTRAINT mutua_apuntes_hecho_con_fecha CHECK (estado <> 'hecho' OR fecha IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mutua_apuntes_paciente_idx ON mutua_apuntes(paciente_key);

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE mutua_pacientes_manuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutua_apuntes            ENABLE ROW LEVEL SECURITY;

-- Aquí sí se escribe desde el cliente, al revés que en mutua_prestaciones:
-- son apuntes de uno en uno, no un reemplazo masivo, y quien puede ver la
-- sección puede anotar en ella.
DROP POLICY IF EXISTS "mutua_pacientes_manuales_rw" ON mutua_pacientes_manuales;
CREATE POLICY "mutua_pacientes_manuales_rw" ON mutua_pacientes_manuales
  FOR ALL USING (public.rol_actual() IN ('dueno','jefe'))
          WITH CHECK (public.rol_actual() IN ('dueno','jefe'));

DROP POLICY IF EXISTS "mutua_apuntes_rw" ON mutua_apuntes;
CREATE POLICY "mutua_apuntes_rw" ON mutua_apuntes
  FOR ALL USING (public.rol_actual() IN ('dueno','jefe'))
          WITH CHECK (public.rol_actual() IN ('dueno','jefe'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mutua_pacientes_manuales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mutua_apuntes            TO authenticated;

-- ── Las vistas pasan a mirar las dos fuentes ────────────────────────
-- El cálculo no tiene que saber de dónde salió cada dato: si algo está
-- hecho, está hecho, lo trajera el portal o lo apuntara la clínica.

-- Última realización por paciente, familia y pieza, venga de donde venga.
-- El MAX() resuelve solo el solapamiento: cuando el export acaba trayendo
-- una prestación que ya estaba apuntada a mano, gana la fecha más reciente
-- y el apunte deja de aportar nada. No hay duplicados que limpiar para que
-- las cuentas salgan.
DROP VIEW IF EXISTS mutua_ultimas;
CREATE VIEW mutua_ultimas WITH (security_invoker = true) AS
  WITH todo AS (
    SELECT p.paciente_key, f.familia, p.pieza, p.fecha_realizacion AS fecha
    FROM mutua_prestaciones p
    JOIN mutua_familias f ON f.codigo = p.codigo
    WHERE f.familia IN ('OBTURACION','ANGULOS')
      AND p.pieza IS NOT NULL
      AND p.devuelto IS NULL
    UNION ALL
    SELECT a.paciente_key, a.familia, a.pieza, a.fecha
    FROM mutua_apuntes a
    WHERE a.estado = 'hecho'
      AND a.familia IN ('OBTURACION','ANGULOS')
  )
  SELECT paciente_key, familia, pieza,
         MAX(fecha) AS ultima_fecha,
         (MAX(fecha) + INTERVAL '6 months')::date AS fecha_liberacion
  FROM todo
  GROUP BY paciente_key, familia, pieza;

-- Piezas que ya no están. Las extracciones apuntadas a mano cuentan igual.
DROP VIEW IF EXISTS mutua_perdidas;
CREATE VIEW mutua_perdidas WITH (security_invoker = true) AS
  WITH todo AS (
    SELECT p.paciente_key, p.pieza, p.fecha_realizacion AS fecha
    FROM mutua_prestaciones p
    JOIN mutua_familias f ON f.codigo = p.codigo
    WHERE f.familia = 'PERDIDA' AND p.pieza IS NOT NULL AND p.devuelto IS NULL
    UNION ALL
    SELECT a.paciente_key, a.pieza, a.fecha
    FROM mutua_apuntes a
    WHERE a.estado = 'hecho' AND a.familia = 'PERDIDA'
  )
  SELECT paciente_key, pieza, MAX(fecha) AS fecha_perdida
  FROM todo
  GROUP BY paciente_key, pieza;

-- Lo planificado y todavía no hecho. No bloquea —no se facturó nada— pero
-- la pieza deja de ofrecerse como trabajo por hacer: ya está agendada.
DROP VIEW IF EXISTS mutua_previstos;
CREATE VIEW mutua_previstos WITH (security_invoker = true) AS
  SELECT paciente_key, familia, pieza,
         MIN(fecha) AS fecha_prevista,
         MAX(nota)  AS nota
  FROM mutua_apuntes
  WHERE estado = 'previsto'
  GROUP BY paciente_key, familia, pieza;

-- Un renglón por paciente, salga del portal o esté dado de alta a mano.
-- Un paciente nuevo sin ninguna prestación todavía tiene que aparecer
-- igual en el buscador: es justo el que se acaba de dar de alta.
DROP VIEW IF EXISTS mutua_pacientes;
CREATE VIEW mutua_pacientes WITH (security_invoker = true) AS
  WITH todo AS (
    SELECT paciente_key, nombre, dni, fecha_realizacion AS fecha, pieza, false AS manual
    FROM mutua_prestaciones
    UNION ALL
    SELECT a.paciente_key, m.nombre, m.dni, a.fecha, a.pieza, true
    FROM mutua_apuntes a
    LEFT JOIN mutua_pacientes_manuales m ON m.paciente_key = a.paciente_key
    WHERE a.estado = 'hecho'
    UNION ALL
    SELECT paciente_key, nombre, dni, NULL::date, NULL::smallint, true
    FROM mutua_pacientes_manuales
  )
  SELECT paciente_key,
         MAX(nombre) AS nombre,
         MAX(dni)    AS dni,
         MAX(fecha)  AS ultima_visita,
         MAX(fecha) FILTER (WHERE pieza >= 51) AS ultima_temporal,
         bool_and(manual) AS solo_manual
  FROM todo
  GROUP BY paciente_key;

GRANT SELECT ON public.mutua_ultimas   TO authenticated;
GRANT SELECT ON public.mutua_perdidas  TO authenticated;
GRANT SELECT ON public.mutua_previstos TO authenticated;
GRANT SELECT ON public.mutua_pacientes TO authenticated;

-- ── Limpieza de apuntes ya cubiertos por el portal ──────────────────
-- El MAX() de arriba ya hace que un apunte cubierto no cambie ninguna
-- cuenta, así que esto es solo higiene: que la tabla no crezca para
-- siempre con apuntes que el export ya trae. Se llama al importar.
CREATE OR REPLACE FUNCTION public.mutua_limpiar_apuntes()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_borrados INTEGER;
BEGIN
  IF public.rol_actual() NOT IN ('dueno','jefe') THEN
    RAISE EXCEPTION 'Sin permiso para tocar los apuntes de la mutua';
  END IF;

  DELETE FROM mutua_apuntes a
  WHERE a.estado = 'hecho'
    AND EXISTS (
      SELECT 1
      FROM mutua_prestaciones p
      JOIN mutua_familias f ON f.codigo = p.codigo
      WHERE p.paciente_key = a.paciente_key
        AND f.familia      = a.familia
        AND p.pieza        = a.pieza
        AND p.devuelto IS NULL
        AND p.fecha_realizacion >= a.fecha
    );
  GET DIAGNOSTICS v_borrados = ROW_COUNT;
  RETURN v_borrados;
END;
$$;

REVOKE ALL     ON FUNCTION public.mutua_limpiar_apuntes() FROM public;
GRANT  EXECUTE ON FUNCTION public.mutua_limpiar_apuntes() TO authenticated;
