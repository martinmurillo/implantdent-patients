-- ============================================================
-- Mutua: el DELETE del reemplazo necesita WHERE
-- Se aplica con: npx supabase db push
-- ============================================================
-- Importar fallaba con "DELETE requires a WHERE clause" y no entraba ni una
-- fila: la función es una transacción, así que la excepción revertía todo,
-- incluido el registro de la importación.
--
-- El mensaje lo da la extensión safeupdate, que está activa en la base y
-- rechaza cualquier DELETE o UPDATE sin WHERE, venga de donde venga. Yo di
-- por hecho que era cosa de PostgREST y que dentro de una función en plpgsql
-- daba igual. No da igual: es el servidor el que lo comprueba.
--
-- `WHERE true` es la forma de decir "todas" pasando ese filtro.

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

  DELETE FROM mutua_prestaciones WHERE true;

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

-- Una importación fallida deja su registro huérfano si alguna vez el DELETE
-- se salta la transacción: no debería pasar, pero por si acaso no se queda
-- una cabecera diciendo "0 filas" que confunda la pantalla.
DELETE FROM mutua_importaciones WHERE filas = 0;
