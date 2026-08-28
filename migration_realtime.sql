-- ============================================================
-- Avisos en vivo de cambios en los planes de pago
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Sin esto, si el dueño borra un plan el jefe no se entera hasta que sale
-- y vuelve a entrar, y al revés.
--
-- Sobre los datos: la aplicación IGNORA el contenido del aviso y lo único
-- que hace al recibirlo es volver a consultar por las vías normales, que
-- pasan por RLS. Así el canal solo transporta un "algo cambió" y no puede
-- filtrar nada que el usuario no pudiera leer igualmente.

ALTER PUBLICATION supabase_realtime ADD TABLE payment_plans;
ALTER PUBLICATION supabase_realtime ADD TABLE payment_plan_cuotas;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
