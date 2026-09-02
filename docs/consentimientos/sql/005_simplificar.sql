-- ============================================================
-- 005 · Simplificación
--
-- 1. El bloque identificacion deja de pedir fecha de nacimiento y
--    domicilio. Los escaneos originales no los llevan: solo nombre y
--    documento, que es lo que ya trae el presupuesto. Eran adiciones
--    innecesarias que obligaban a mantener dos datos de más.
--
-- 2. Se deja de usar profesional_por_defecto. El doctor se elige
--    siempre a mano en el modal.
-- ============================================================

begin;

update consent_bloques
   set contenido = '[{"tipo": "parrafo", "texto": "D./Dña. {{paciente.nombre}}, con documento {{paciente.documento}}, como paciente, declaro que el Dr./Dra. {{profesional.nombre}}, con número de colegiado {{profesional.colegiado}}, me ha diagnosticado:"}]'::jsonb, version = 2
 where codigo = 'identificacion';

update consent_plantillas set profesional_por_defecto = null;

commit;

-- Las columnas patients.fecha_nacimiento y patients.domicilio quedan
-- sin uso. No las borres todavía por si más adelante hacen falta,
-- pero el módulo de consentimientos ya no las lee ni las escribe.
