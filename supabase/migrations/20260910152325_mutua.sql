-- ============================================================
-- Pacientes de mutua (Agrupació · Tomamos Impulso)
-- Se aplica con: npx supabase db push
-- ============================================================
-- ⚠ TOCA PERMISOS. Probar antes de dar por bueno.
--
-- Consulta de disponibilidad: la mutua solo deja volver a facturar
-- ciertos tratamientos sobre la misma pieza pasados 6 meses. Estas
-- tablas guardan el export del portal de la mutua para poder mirar, por
-- paciente y por mes, qué piezas están libres y cuáles siguen bloqueadas.
--
-- Son datos de salud con DNI (RGPD, categoría especial). No hay relación
-- con `patients`: paciente propio, identificado por su DNI. Lectura solo
-- para el dueño y el jefe, igual que la consulta de presupuestos de
-- migration_planes_hernan.sql. La escritura no se abre nunca al cliente:
-- va toda por mutua_reemplazar_datos(), que es la única forma de tocar
-- estas filas.

-- ── Cada importación del export ─────────────────────────────────────
-- Se conservan todas para poder decir en la cabecera desde cuándo son
-- los datos y quién los subió.
CREATE TABLE IF NOT EXISTS mutua_importaciones (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  archivo               TEXT NOT NULL,
  filas                 INTEGER NOT NULL DEFAULT 0,
  pacientes             INTEGER NOT NULL DEFAULT 0,
  fecha_min_realizacion DATE,
  fecha_max_realizacion DATE,
  -- email y no uuid: en todo el proyecto el usuario es su email
  -- (creado_por, enviado_por). Con un uuid habría que leer auth.users
  -- para pintar la cabecera, y desde el cliente eso no se puede.
  importado_por         TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Las prestaciones tal como vienen del export ─────────────────────
-- Sin clave natural a propósito: hay filas idénticas legítimas (la misma
-- radiografía dos veces el mismo día), así que no se deduplica nada.
CREATE TABLE IF NOT EXISTS mutua_prestaciones (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  importacion_id   BIGINT NOT NULL REFERENCES mutua_importaciones(id) ON DELETE CASCADE,
  -- DNI normalizado, o 'NOM:' || nombre normalizado para los 29 sin DNI
  paciente_key     TEXT NOT NULL,
  dni              TEXT,
  nombre           TEXT NOT NULL,
  codigo           INTEGER NOT NULL,
  tratamiento      TEXT NOT NULL DEFAULT '',
  precio           NUMERIC(10,2) NOT NULL DEFAULT 0,
  pieza            SMALLINT,
  producto         TEXT,
  creado_el        DATE,
  facturado        DATE,
  fecha_alb_fact   DATE,
  devuelto         DATE,
  fecha_realizacion DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS mutua_prestaciones_paciente_idx
  ON mutua_prestaciones(paciente_key);
CREATE INDEX IF NOT EXISTS mutua_prestaciones_codigo_pieza_idx
  ON mutua_prestaciones(codigo, pieza);

-- ── Familias de tratamiento ─────────────────────────────────────────
-- Se trabaja por familia y no por código porque la serie 321xx es la
-- tarifa infantil de la 323xx: el mismo paciente pasa de una a otra al
-- crecer, sobre la misma pieza.
CREATE TABLE IF NOT EXISTS mutua_familias (
  codigo  INTEGER PRIMARY KEY,
  familia TEXT NOT NULL CHECK (familia IN ('OBTURACION','ANGULOS','PERDIDA'))
);

INSERT INTO mutua_familias (codigo, familia) VALUES
  (32301,'OBTURACION'), (32102,'OBTURACION'), (32101,'OBTURACION'),
  (32302,'ANGULOS'),    (32103,'ANGULOS'),
  -- extracciones e implante: la pieza ya no está, no se ofrece nunca
  (32020,'PERDIDA'), (32450,'PERDIDA'), (32222,'PERDIDA'), (32452,'PERDIDA'),
  (32543,'PERDIDA'), (32878,'PERDIDA'), (32890,'PERDIDA')
ON CONFLICT (codigo) DO UPDATE SET familia = EXCLUDED.familia;

-- ── RLS ─────────────────────────────────────────────────────────────
-- Sin esto las tablas se leen enteras con la anon key.
ALTER TABLE mutua_importaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutua_prestaciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutua_familias      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mutua_lee_importaciones" ON mutua_importaciones;
CREATE POLICY "mutua_lee_importaciones" ON mutua_importaciones
  FOR SELECT USING (public.rol_actual() IN ('dueno','jefe'));

DROP POLICY IF EXISTS "mutua_lee_prestaciones" ON mutua_prestaciones;
CREATE POLICY "mutua_lee_prestaciones" ON mutua_prestaciones
  FOR SELECT USING (public.rol_actual() IN ('dueno','jefe'));

DROP POLICY IF EXISTS "mutua_lee_familias" ON mutua_familias;
CREATE POLICY "mutua_lee_familias" ON mutua_familias
  FOR SELECT USING (public.rol_actual() IN ('dueno','jefe'));

-- Solo SELECT: escribir es cosa de la función de más abajo.
GRANT SELECT ON public.mutua_importaciones TO authenticated;
GRANT SELECT ON public.mutua_prestaciones  TO authenticated;
GRANT SELECT ON public.mutua_familias      TO authenticated;

-- ── Vistas ──────────────────────────────────────────────────────────
-- security_invoker = true es obligatorio, no un adorno: sin él la vista
-- corre con los permisos de su dueño (postgres) y se salta la RLS de la
-- tabla de abajo, o sea que dejaría salir los datos que acabamos de
-- cerrar. Con él, quien consulta la vista pasa por su propia política.

-- Última realización y liberación por paciente, familia y pieza.
DROP VIEW IF EXISTS mutua_ultimas;
CREATE VIEW mutua_ultimas WITH (security_invoker = true) AS
  SELECT p.paciente_key,
         f.familia,
         p.pieza,
         MAX(p.fecha_realizacion) AS ultima_fecha,
         (MAX(p.fecha_realizacion) + INTERVAL '6 months')::date AS fecha_liberacion
  FROM mutua_prestaciones p
  JOIN mutua_familias f ON f.codigo = p.codigo
  WHERE f.familia IN ('OBTURACION','ANGULOS')
    AND p.pieza IS NOT NULL
    AND p.devuelto IS NULL
  GROUP BY p.paciente_key, f.familia, p.pieza;

-- Piezas que ya no están: extracción o implante.
-- Se filtran los devueltos igual que arriba. Que la mutua rechace la
-- línea de facturación no debería marcar una pieza como perdida para
-- siempre, y hoy no cambia ningún número: de las 8 devueltas del archivo
-- ninguna es una extracción.
DROP VIEW IF EXISTS mutua_perdidas;
CREATE VIEW mutua_perdidas WITH (security_invoker = true) AS
  SELECT p.paciente_key,
         p.pieza,
         MAX(p.fecha_realizacion) AS fecha_perdida
  FROM mutua_prestaciones p
  JOIN mutua_familias f ON f.codigo = p.codigo
  WHERE f.familia = 'PERDIDA'
    AND p.pieza IS NOT NULL
    AND p.devuelto IS NULL
  GROUP BY p.paciente_key, p.pieza;

-- Un renglón por paciente.
-- `ultima_temporal` en crudo y no un booleano "incluye temporales": el
-- booleano habría que calcularlo contra una fecha, y la vista solo
-- conoce current_date. La pestaña mensual trabaja con el último día del
-- mes elegido, así que al mirar octubre o un mes pasado la respuesta
-- saldría contra "hoy" y no contra ese mes. Se deja el dato y decide el
-- cliente, que es quien sabe la fecha de referencia.
DROP VIEW IF EXISTS mutua_pacientes;
CREATE VIEW mutua_pacientes WITH (security_invoker = true) AS
  SELECT paciente_key,
         MAX(nombre) AS nombre,
         MAX(dni)    AS dni,
         MAX(fecha_realizacion) AS ultima_visita,
         MAX(fecha_realizacion) FILTER (WHERE pieza >= 51) AS ultima_temporal
  FROM mutua_prestaciones
  GROUP BY paciente_key;

GRANT SELECT ON public.mutua_ultimas   TO authenticated;
GRANT SELECT ON public.mutua_perdidas  TO authenticated;
GRANT SELECT ON public.mutua_pacientes TO authenticated;

-- ── Reemplazo total de los datos ────────────────────────────────────
-- El export trae el historial completo cada vez y no hay clave por la
-- que hacer upsert, así que se reemplaza entero. En una sola función
-- para que sea una transacción: si algo falla no quedan los datos a
-- medias.
--
-- SECURITY DEFINER con el rol comprobado dentro, igual que
-- presupuesto_por_hc: así el cliente nunca necesita permiso de INSERT ni
-- de DELETE sobre la tabla. La única forma de escribir es esta función,
-- y la función exige ser dueño o jefe.
CREATE OR REPLACE FUNCTION public.mutua_reemplazar_datos(
  p_archivo TEXT,
  p_filas   JSONB
) RETURNS TABLE (
  out_importacion_id BIGINT,
  out_filas          INTEGER,
  out_pacientes      INTEGER,
  out_fecha_min      DATE,
  out_fecha_max      DATE
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id BIGINT;
BEGIN
  IF public.rol_actual() NOT IN ('dueno','jefe') THEN
    RAISE EXCEPTION 'Sin permiso para importar datos de la mutua';
  END IF;

  INSERT INTO mutua_importaciones (archivo, importado_por)
  VALUES (p_archivo, lower(COALESCE(auth.jwt() ->> 'email', '')))
  RETURNING id INTO v_id;

  -- Dentro de la función el DELETE sin WHERE es válido; lo que no lo
  -- admite es PostgREST, que es otra cosa.
  DELETE FROM mutua_prestaciones;

  INSERT INTO mutua_prestaciones (
    importacion_id, paciente_key, dni, nombre, codigo, tratamiento,
    precio, pieza, producto, creado_el, facturado, fecha_alb_fact,
    devuelto, fecha_realizacion)
  SELECT v_id, r.paciente_key, r.dni, r.nombre, r.codigo, COALESCE(r.tratamiento,''),
         COALESCE(r.precio,0), r.pieza, r.producto, r.creado_el, r.facturado,
         r.fecha_alb_fact, r.devuelto, r.fecha_realizacion
  FROM jsonb_to_recordset(p_filas) AS r (
    paciente_key TEXT, dni TEXT, nombre TEXT, codigo INTEGER, tratamiento TEXT,
    precio NUMERIC, pieza SMALLINT, producto TEXT, creado_el DATE,
    facturado DATE, fecha_alb_fact DATE, devuelto DATE, fecha_realizacion DATE);

  UPDATE mutua_importaciones i SET
    filas                 = s.n,
    pacientes             = s.p,
    fecha_min_realizacion = s.mn,
    fecha_max_realizacion = s.mx
  FROM (SELECT count(*) AS n, count(DISTINCT paciente_key) AS p,
               min(fecha_realizacion) AS mn, max(fecha_realizacion) AS mx
        FROM mutua_prestaciones) s
  WHERE i.id = v_id;

  RETURN QUERY
    SELECT i.id, i.filas, i.pacientes, i.fecha_min_realizacion, i.fecha_max_realizacion
    FROM mutua_importaciones i WHERE i.id = v_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.mutua_reemplazar_datos(TEXT, JSONB) FROM public;
GRANT  EXECUTE ON FUNCTION public.mutua_reemplazar_datos(TEXT, JSONB) TO authenticated;

-- ── Comprobaciones ──────────────────────────────────────────────────
-- Tras importar, esto tiene que dar 3465 filas y 233 pacientes:
--   SELECT filas, pacientes, fecha_min_realizacion, fecha_max_realizacion
--   FROM mutua_importaciones ORDER BY id DESC LIMIT 1;
--
-- Y esto, vacío. Si devuelve filas, alguna vista se está saltando la RLS:
--   SET ROLE anon;
--   SELECT count(*) FROM mutua_prestaciones;
--   SELECT count(*) FROM mutua_pacientes;
--   RESET ROLE;
