-- ============================================================
-- El profesional que firma el presupuesto
-- ============================================================
-- La cabecera del presupuesto trae el nombre del profesional y, mejor aún,
-- su número de colegiado:
--
--   IMPLANTDENT GIRONA - STA.EUGENIA
--   Dra. Yassmine Benkaddour
--   ...
--   NIF : B17962564   Colegiado : 9239   WEB : ...
--
-- El colegiado es clave exacta contra doctors.colegiado, así que se guarda
-- ese y no el nombre: emparejar por nombre es lo que ya falló una vez con
-- "Dr Sergio".
alter table patients add column if not exists doctor_colegiado text;

-- Y el NIF de la clínica, que salía como línea de puntos por no tenerlo.
update clinica_config set cif = 'B17962564' where id = 1 and coalesce(cif,'') = '';
