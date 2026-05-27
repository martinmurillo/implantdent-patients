-- ============================================================
-- GRANTs explícitos para PostgREST / supabase-js
-- Requerido a partir del 30 oct 2026 (Supabase changelog)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Solo rol "authenticated" — anon bloqueado por RLS en todas las tablas

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctors                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_items        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_templates    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_translations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_clicks              TO authenticated;
