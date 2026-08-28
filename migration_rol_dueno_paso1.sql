-- ============================================================
-- PASO 1 de 2 — Dar de alta al dueño explícitamente
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- CORRER ESTE ARCHIVO ANTES QUE migration_rol_dueno_paso2.sql.
--
-- El paso 2 cambia rol_actual() para que sin fila en plan_usuarios no se
-- pueda entrar. Si se corriera primero, el dueño se quedaría fuera de su
-- propia aplicación: hasta ahora funcionaba precisamente por NO tener
-- fila.

-- 'dueno' pasa a ser un rol válido
ALTER TABLE plan_usuarios DROP CONSTRAINT IF EXISTS plan_usuarios_rol_chk;
ALTER TABLE plan_usuarios
  ADD CONSTRAINT plan_usuarios_rol_chk
  CHECK (rol IN ('dueno', 'jefe', 'recepcion'));

INSERT INTO plan_usuarios (email, rol, nombre)
VALUES ('martingabrielmurillo@gmail.com', 'dueno', 'Martín Murillo')
ON CONFLICT (email) DO UPDATE SET rol = 'dueno', nombre = EXCLUDED.nombre;

-- Comprobación: tiene que devolver 'dueno'
SELECT email, rol, nombre FROM plan_usuarios ORDER BY rol, email;
