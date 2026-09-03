-- ============================================================
-- Tratamiento del profesional, bajas, y profesional por defecto
-- ============================================================
-- 1. "Dr./Dra." deja de imprimirse a medias. El dato se guarda, no se deduce
--    del nombre: adivinar el sexo por el nombre de pila falla con Astrid,
--    Yassmine, Maiyelin o Francesc, y equivocarse en un documento que firma
--    un paciente es peor que no poner nada.
--
--    Se guarda con el artículo incluido ("el Dr." / "la Dra.") porque en las
--    dos frases donde aparece también cambia: "declaro que EL Dr." / "que LA
--    Dra.", "informado por EL Dr." / "por LA Dra.".
alter table doctors add column if not exists tratamiento text;

update doctors set tratamiento = 'la Dra.';
update doctors set tratamiento = 'el Dr.' where name = 'Sergio Molina';

-- 2. Bajas. NO se borran: hay consentimientos ya emitidos que apuntan a
--    ellos, y un documento firmado no puede quedarse sin el profesional que
--    lo firmó. Se marcan inactivos y desaparecen del desplegable.
alter table doctors add column if not exists activo boolean not null default true;

update doctors set activo = false where colegiado in ('9861', '7621');

-- 3. Profesional por defecto. Se puede cambiar en el desplegable, pero sale
--    ya puesto porque en estos tratamientos siempre opera el mismo.
update consent_plantillas set profesional_por_defecto =
  (select id from doctors where name = 'Sergio Molina' limit 1)
 where codigo in ('IMPLANTES', 'REGENERACION', 'INJERTOS', 'ELEVACION');

update consent_plantillas set profesional_por_defecto =
  (select id from doctors where name = 'Leticia Molina' limit 1)
 where codigo = 'PROTESISIMPLANTOSOPORTADA';

-- 4. Los dos bloques que decían "Dr./Dra." pasan a usar el campo.
update consent_bloques
   set contenido = '[{"tipo": "parrafo", "texto": "D./Dña. {{paciente.nombre}}, con documento {{paciente.documento}}, como paciente, declaro que {{profesional.tratamiento}} {{profesional.nombre}}, con número de colegiado {{profesional.colegiado}}, me ha diagnosticado:"}]'::jsonb,
       version = 3
 where codigo = 'identificacion';
