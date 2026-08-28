-- ============================================================
-- Acceso restringido a los planes de pago (/planes)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Quien entre por /planes solo ve los planes activos y terminados.
--
--   rol 'jefe'      → puede mover tratamientos entre meses y guardarlo
--   rol 'recepcion' → solo mira, no toca nada
--
-- Sin fila en esta tabla se entra como 'recepcion'. Para dar permiso de
-- jefe hay que añadir la fila explícitamente.
--
-- ⚠ Esto restringe la INTERFAZ, no la base de datos. Las políticas RLS
--   dan acceso a cualquier usuario autenticado, así que estas cuentas
--   podrían leer otras tablas si alguien las usara contra la API
--   directamente. Es suficiente para separar lo que ve el personal en
--   pantalla, no para defenderse de alguien que quiera saltárselo.

CREATE TABLE IF NOT EXISTS plan_usuarios (
  email      TEXT PRIMARY KEY,
  rol        TEXT NOT NULL DEFAULT 'recepcion',
  nombre     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_usuarios_rol_chk CHECK (rol IN ('jefe','recepcion'))
);

ALTER TABLE plan_usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo_autenticados" ON plan_usuarios
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_usuarios TO authenticated;

-- ── Para dar de alta a alguien ──────────────────────────────────────
-- 1. Supabase → Authentication → Users → Add user (email y contraseña)
-- 2. Y aquí su rol:
--
--    INSERT INTO plan_usuarios (email, rol, nombre)
--    VALUES ('jefe@ejemplo.com', 'jefe', 'Nombre del jefe')
--    ON CONFLICT (email) DO UPDATE SET rol = EXCLUDED.rol;
