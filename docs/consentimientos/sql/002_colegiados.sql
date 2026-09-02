-- ============================================================
-- Relleno de doctors.colegiado
--
-- Los números salen de la hoja DOCTORES del Excel que la clínica
-- usa hoy, así que son los que ya se están imprimiendo en los
-- consentimientos en papel.
--
-- Ojo con "Dra. Sonia Roouer": en el Excel está escrito así y casi
-- seguro es un error de tecleo por Roquer o Rouer. Comprobar antes
-- de dar el nombre por bueno. El número (8348) sí es fiable.
--
-- El emparejamiento va por nombre y los nombres de tu tabla pueden
-- estar escritos de otra forma (con o sin "Dra.", con dos apellidos
-- o uno). EJECUTA PRIMERO EL BLOQUE DE COMPROBACIÓN.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Comprobación. Mira qué empareja y qué no ANTES de actualizar.
-- ------------------------------------------------------------
with excel(nombre, colegiado) as (values
  ('Sergio Molina',            '5296'),
  ('Leticia Molina',           '5430'),
  ('Astrid Gonzalez',          '7924'),
  ('Monica Arriaga Osorio',    '5010'),
  ('Jessica Rodriguez',        '7621'),
  ('Gemma Costa',              '9006'),
  ('Sonia Roouer',             '8348'),
  ('Yassmine Benkaddour',      '9239'),
  ('Maiyelin Llanes Rodriguez','9391'),
  ('Francesc Font I Falgas',   '9861')
)
select
  e.nombre        as en_el_excel,
  e.colegiado,
  d.name          as en_la_base,
  case when d.id is null then 'SIN EMPAREJAR' else 'ok' end as estado
from excel e
left join doctors d
  on unaccent(lower(d.name)) like '%' || unaccent(lower(e.nombre)) || '%'
order by estado desc, e.nombre;

-- Y al revés: doctores en la base que no salen en el Excel.
-- Estos se quedarán sin número y hay que preguntarlo.
-- select name from doctors d where not exists (...);


-- ------------------------------------------------------------
-- 2. Actualización. Solo cuando el bloque de arriba no deje
--    ningún SIN EMPAREJAR (o hayas decidido qué hacer con ellos).
-- ------------------------------------------------------------
-- Necesita la extensión unaccent:
--   create extension if not exists unaccent;

/*
with excel(nombre, colegiado) as (values
  ('Sergio Molina',            '5296'),
  ('Leticia Molina',           '5430'),
  ('Astrid Gonzalez',          '7924'),
  ('Monica Arriaga Osorio',    '5010'),
  ('Jessica Rodriguez',        '7621'),
  ('Gemma Costa',              '9006'),
  ('Sonia Roouer',             '8348'),
  ('Yassmine Benkaddour',      '9239'),
  ('Maiyelin Llanes Rodriguez','9391'),
  ('Francesc Font I Falgas',   '9861')
)
update doctors d
   set colegiado = e.colegiado
  from excel e
 where unaccent(lower(d.name)) like '%' || unaccent(lower(e.nombre)) || '%'
   and d.colegiado is null;
*/


-- ------------------------------------------------------------
-- 3. Profesional por defecto de las plantillas quirúrgicas.
--
--    Los implantes los coloca siempre Sergio y la prótesis
--    implantosoportada siempre Leticia. Con esto la plantilla sale
--    ya con el profesional correcto, sin dejar de ser sobrescribible
--    desde el desplegable del modal.
-- ------------------------------------------------------------
/*
update consent_plantillas set profesional_por_defecto =
  (select id from doctors where name ilike '%Sergio Molina%' limit 1)
 where codigo in ('IMPLANTES', 'ELEVACION', 'INJERTOS', 'REGENERACION');

update consent_plantillas set profesional_por_defecto =
  (select id from doctors where name ilike '%Leticia Molina%' limit 1)
 where codigo = 'PROTESISIMPLANTOSOPORTADA';
*/


-- ------------------------------------------------------------
-- 4. Auditoría de fechas de nacimiento.
--    Cuántos pacientes quedan sin fecha: son los que no podrán
--    generar consentimiento hasta que se rellene o se confirme
--    la edad en el momento de emitir.
-- ------------------------------------------------------------
-- select count(*) filter (where fecha_nacimiento is null) as sin_fecha,
--        count(*) as total
--   from patients;
