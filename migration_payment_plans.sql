-- ============================================================
-- Planes de pago + seguimiento de cuotas
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Notas de diseño:
--   · El "presupuesto" es la fila de patients: patient_id = patients.id
--   · El dinero cobrado vive SIEMPRE en payments. Acá solo se guarda el
--     vínculo (payment_id), para no contar la misma plata dos veces y que
--     las pestañas Deudas y Cobros sigan cuadrando.
--   · Sin FK a patients ni a payments a propósito: son tablas preexistentes
--     y hay borrado de pagos (deletePayment). El vínculo se resuelve en JS;
--     si el pago o el paciente no aparecen, la app lo ignora.
--   · Varios planes por presupuesto (para ofrecer alternativas), pero solo
--     uno en estado 'activo' a la vez: es el que manda en "Pendientes".

-- ── 1. Cabecera del plan ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_plans (
  id                TEXT PRIMARY KEY,
  patient_id        TEXT NOT NULL,                       -- = presupuesto (patients.id)
  patient_name      TEXT NOT NULL DEFAULT '',            -- denormalizado, patrón treatment_items
  budget_no         TEXT NOT NULL DEFAULT '',
  modo              TEXT NOT NULL DEFAULT 'visita',
  fecha_inicio      DATE NOT NULL,                       -- mes 1 = esta fecha
  n_meses           INTEGER NOT NULL DEFAULT 6,
  entrega           NUMERIC(10,2) NOT NULL DEFAULT 0,
  techo_mes         NUMERIC(10,2) NOT NULL DEFAULT 0,    -- solo modo 'visita'
  n_cuotas          INTEGER NOT NULL DEFAULT 0,
  importe_cuota     NUMERIC(10,2) NOT NULL DEFAULT 0,
  cuota_manual      BOOLEAN NOT NULL DEFAULT false,      -- el usuario pisó la cuota a mano
  mes_inicio_cuotas INTEGER NOT NULL DEFAULT 2,          -- 1-based
  colocacion        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{tx_id,nombre,importe,mes}] mes 1-based
  total_presupuesto NUMERIC(10,2) NOT NULL DEFAULT 0,    -- foto al guardar
  estado            TEXT NOT NULL DEFAULT 'activo',
  notas             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_plans_modo_chk
    CHECK (modo IN ('visita','cuotas')),
  CONSTRAINT payment_plans_estado_chk
    CHECK (estado IN ('activo','borrador','terminado','cancelado')),
  CONSTRAINT payment_plans_meses_chk
    CHECK (n_meses BETWEEN 1 AND 60),
  CONSTRAINT payment_plans_mes_inicio_chk
    CHECK (mes_inicio_cuotas BETWEEN 1 AND 60)
);

CREATE INDEX IF NOT EXISTS payment_plans_patient_idx
  ON payment_plans(patient_id);

-- Un solo plan vigente por presupuesto; el resto quedan como borrador/historial
CREATE UNIQUE INDEX IF NOT EXISTS payment_plans_un_activo
  ON payment_plans(patient_id) WHERE estado = 'activo';

-- ── 2. Calendario de cobros ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_plan_cuotas (
  id         TEXT PRIMARY KEY,
  plan_id    TEXT NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL,
  numero     INTEGER NOT NULL,                     -- 0 = entrega, 1..n = cuotas
  concepto   TEXT NOT NULL DEFAULT 'cuota',
  mes        INTEGER NOT NULL,                     -- 1-based, mes 1 = fecha_inicio
  vence_el   DATE NOT NULL,
  importe    NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_id TEXT,                                 -- payments.id que la salda; NULL = pendiente
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ppc_concepto_chk
    CHECK (concepto IN ('entrega','cuota','visita')),
  CONSTRAINT ppc_numero_un
    UNIQUE (plan_id, numero)
);

CREATE INDEX IF NOT EXISTS ppc_plan_idx
  ON payment_plan_cuotas(plan_id);

-- Para la vista "Pendientes de pago": lo no cobrado, por vencimiento
CREATE INDEX IF NOT EXISTS ppc_pendientes_idx
  ON payment_plan_cuotas(vence_el) WHERE payment_id IS NULL;

-- ── 3. Row Level Security ───────────────────────────────────────────
ALTER TABLE payment_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plan_cuotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo_autenticados" ON payment_plans
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON payment_plan_cuotas
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ── 4. GRANTs explícitos (PostgREST / supabase-js) ──────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_plans       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_plan_cuotas TO authenticated;
