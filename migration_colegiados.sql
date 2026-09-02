-- ============================================================
-- Alta y numeración de los profesionales
-- ============================================================
-- Los diez nombres y números salen de la hoja DOCTORES del Excel que la
-- clínica usa hoy, así que son los que ya se están imprimiendo en los
-- consentimientos en papel. Martín los dio por correctos.
--
-- Se descarta el update automático por nombre del 002 original: la tabla
-- solo tenía "Dr Sergio" y "Dra Leticia", sin apellidos, y ninguno de los
-- diez emparejaba. Adivinar el emparejamiento por el nombre de pila habría
-- puesto el número de colegiado de alguien en el consentimiento de otro.
-- Se hace explícito: update para los dos que ya estaban, insert para los
-- ocho que faltaban.
--
-- Nota: "Sonia Roouer" está así escrito en el Excel y parece un error de
-- tecleo por Roquer o Rouer. Se avisó y Martín confirmó el Excel, así que
-- entra tal cual. El número, 8348, no estaba en duda.

-- ── 1. Los dos que ya existían: nombre completo y número ────────────
-- "Dr Sergio" a secas no identifica a nadie en un documento firmado.
update doctors set name = 'Sergio Molina',  colegiado = '5296' where name = 'Dr Sergio';
update doctors set name = 'Leticia Molina', colegiado = '5430' where name = 'Dra Leticia';

-- ── 2. Los ocho que faltaban ────────────────────────────────────────
-- La tabla doctors solo alimenta el panel Clínica → Doctores: una lista
-- con alta y baja. El campo "Doctor(es)" de las citas es texto libre y no
-- apunta aquí, así que añadir filas no altera ningún cálculo ni informe.
insert into doctors (name, colegiado)
select v.name, v.colegiado
  from (values
    ('Astrid Gonzalez',           '7924'),
    ('Monica Arriaga Osorio',     '5010'),
    ('Jessica Rodriguez',         '7621'),
    ('Gemma Costa',               '9006'),
    ('Sonia Roouer',              '8348'),
    ('Yassmine Benkaddour',       '9239'),
    ('Maiyelin Llanes Rodriguez', '9391'),
    ('Francesc Font I Falgas',    '9861')
  ) as v(name, colegiado)
 where not exists (select 1 from doctors d where d.name = v.name);

-- ── 3. Profesional por defecto de las plantillas quirúrgicas ────────
-- Los implantes los coloca siempre Sergio y la prótesis implantosoportada
-- siempre Leticia. La plantilla sale ya con el profesional correcto, sin
-- dejar de ser sobrescribible desde el desplegable del modal.
update consent_plantillas set profesional_por_defecto =
  (select id from doctors where name = 'Sergio Molina' limit 1)
 where codigo in ('IMPLANTES', 'ELEVACION', 'INJERTOS', 'REGENERACION');

update consent_plantillas set profesional_por_defecto =
  (select id from doctors where name = 'Leticia Molina' limit 1)
 where codigo = 'PROTESISIMPLANTOSOPORTADA';
