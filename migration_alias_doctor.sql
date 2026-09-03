-- ============================================================
-- Nombres con los que un doctor aparece en los presupuestos
-- ============================================================
-- El presupuesto trae el nombre del profesional en su cabecera, y no siempre
-- coincide con el de la ficha. "DRA OLGA BUTKO" firma presupuestos, pero el
-- consentimiento tiene que salir a nombre de Leticia Molina.
--
-- Va como lista y no como campo suelto porque el mismo doctor puede aparecer
-- escrito de varias formas, y porque mañana habrá otro caso.
alter table doctors add column if not exists alias_presupuesto text[];

update doctors set alias_presupuesto = array['OLGA BUTKO']
 where name = 'Leticia Molina';
