-- ============================================================
-- Módulo de consentimientos informados
-- Supabase / PostgreSQL
--
-- Principio de diseño: el texto legal vive en la base de datos
-- como bloques estructurados, nunca como imagen. Un documento
-- emitido guarda una COPIA CONGELADA de su contenido, para que
-- editar una plantilla no altere lo que un paciente ya firmó.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Datos del centro. Fila única.
--    El art. 36.2 de los Estatutos del COEC exige que el código
--    de inscripción en el registro sea visible; lo imprimimos en
--    el pie de cada consentimiento.
-- ------------------------------------------------------------
create table if not exists clinica_config (
  id                 smallint primary key default 1 check (id = 1),
  razon_social       text not null,
  nombre_comercial   text,
  cif                text not null,
  registro_sanitario text not null,
  direccion          text not null,
  poblacion          text not null,
  telefono           text,
  email_dpd          text,          -- contacto para derechos RGPD
  logo_url           text,          -- ya existente en el sistema
  lugar_firma        text not null default 'Figueres'
);

-- ------------------------------------------------------------
-- 2. Bloques reutilizables (partials).
--    Un solo registro por bloque, compartido por las 18 plantillas.
--    Cambiar la cláusula RGPD = editar una fila, no dieciocho.
-- ------------------------------------------------------------
create table if not exists consent_bloques (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null,               -- 'preambulo', 'revocacion', ...
  version     integer not null default 1,
  titulo      text,
  contenido   jsonb not null,              -- array de nodos (ver ESPECIFICACION.md)
  activo      boolean not null default true,
  notas       text,                        -- de dónde sale y por qué
  created_at  timestamptz not null default now(),
  unique (codigo, version)
);

-- ------------------------------------------------------------
-- 3. Plantillas de consentimiento, una por tratamiento.
--    'composicion' ordena bloques compartidos y propios.
-- ------------------------------------------------------------
create table if not exists consent_plantillas (
  id                    uuid primary key default gen_random_uuid(),
  codigo                text not null,          -- 'ENDODONCIA', 'IMPLANTES'
  titulo                text not null,          -- va en el encabezado
  version               integer not null default 1,
  idioma                char(2) not null default 'es',
  composicion           jsonb not null,
  profesional_por_defecto uuid references doctores(id),  -- Sergio en implantes
  pide_piezas           boolean not null default false,
  activa                boolean not null default true,
  aprobada_por          text,      -- responsable sanitario que la validó
  aprobada_el           date,
  created_at            timestamptz not null default now(),
  unique (codigo, version, idioma)
);

create index if not exists idx_plantillas_activas
  on consent_plantillas (codigo) where activa;

-- ------------------------------------------------------------
-- 4. Documentos emitidos.
--    contenido_congelado es lo que hace esta tabla defendible:
--    guarda el árbol de nodos YA resuelto, con los datos del
--    paciente dentro, tal y como se imprimió.
-- ------------------------------------------------------------
create table if not exists consent_documentos (
  id                     uuid primary key default gen_random_uuid(),
  paciente_id            uuid not null references pacientes(id),
  plantilla_id           uuid not null references consent_plantillas(id),
  plantilla_codigo       text not null,
  plantilla_version      integer not null,

  contenido_congelado    jsonb not null,
  datos_fusion           jsonb not null,

  profesional_id         uuid references doctores(id),
  profesional_nombre     text not null,      -- desnormalizado a propósito
  profesional_colegiado  text not null,

  firmante_tipo          text not null check (firmante_tipo in ('paciente','representante')),
  edad_al_emitir         integer not null,

  pdf_path               text,
  hash_sha256            text,

  emitido_por            uuid references auth.users(id),
  emitido_el             timestamptz not null default now(),
  firmado_el             date,               -- se marca al archivar el papel
  anulado_el             timestamptz,
  anulado_motivo         text
);

create index if not exists idx_documentos_paciente
  on consent_documentos (paciente_id, emitido_el desc);

-- ------------------------------------------------------------
-- 5. RLS. Los consentimientos son datos de salud, categoría
--    especial del RGPD (art. 9). Nada es público.
-- ------------------------------------------------------------
alter table clinica_config     enable row level security;
alter table consent_bloques    enable row level security;
alter table consent_plantillas enable row level security;
alter table consent_documentos enable row level security;

-- Lectura: cualquier usuario autenticado del sistema.
create policy "lectura_config" on clinica_config
  for select to authenticated using (true);
create policy "lectura_bloques" on consent_bloques
  for select to authenticated using (true);
create policy "lectura_plantillas" on consent_plantillas
  for select to authenticated using (true);
create policy "lectura_documentos" on consent_documentos
  for select to authenticated using (true);

-- Emitir: cualquier usuario autenticado.
create policy "emitir_documentos" on consent_documentos
  for insert to authenticated with check (emitido_por = auth.uid());

-- Editar plantillas y bloques: solo admin.
-- Ajusta el nombre de la función al que ya uses en tu sistema de roles.
create policy "admin_edita_bloques" on consent_bloques
  for all to authenticated
  using (es_admin()) with check (es_admin());
create policy "admin_edita_plantillas" on consent_plantillas
  for all to authenticated
  using (es_admin()) with check (es_admin());
create policy "admin_edita_config" on clinica_config
  for all to authenticated
  using (es_admin()) with check (es_admin());

-- Un documento emitido NO se edita ni se borra. Solo se anula.
create policy "anular_documentos" on consent_documentos
  for update to authenticated
  using (es_admin())
  with check (es_admin() and contenido_congelado is not null);

-- ------------------------------------------------------------
-- 6. Bloqueo duro de la inmutabilidad.
--    La política RLS no basta: un trigger impide reescribir el
--    contenido de un documento ya emitido, pase lo que pase.
-- ------------------------------------------------------------
create or replace function consent_documentos_inmutable()
returns trigger language plpgsql as $$
begin
  if new.contenido_congelado is distinct from old.contenido_congelado
     or new.datos_fusion is distinct from old.datos_fusion
     or new.plantilla_version is distinct from old.plantilla_version
     or new.profesional_nombre is distinct from old.profesional_nombre then
    raise exception
      'Un consentimiento emitido no se modifica. Anúlalo y emite uno nuevo.';
  end if;
  return new;
end $$;

drop trigger if exists trg_consent_inmutable on consent_documentos;
create trigger trg_consent_inmutable
  before update on consent_documentos
  for each row execute function consent_documentos_inmutable();

-- ------------------------------------------------------------
-- 7. Almacenamiento del PDF.
--    Bucket privado. Ejecutar una vez desde el panel o por API.
-- ------------------------------------------------------------
-- insert into storage.buckets (id, name, public)
-- values ('consentimientos', 'consentimientos', false);

-- ------------------------------------------------------------
-- 8. Campo que falta en pacientes.
--    El art. 43 de los Estatutos del COEC exige que la ficha
--    clínica incluya la dirección del paciente. Hoy no está, y
--    por eso se rellena a mano en el consentimiento de implantes.
-- ------------------------------------------------------------
alter table pacientes add column if not exists domicilio text;

-- Retención: 15 años desde el alta de cada proceso asistencial
-- (Llei 21/2000 art. 12.4, redactado por la Llei 16/2010).
-- No implementar borrado automático sin validación previa.
comment on table consent_documentos is
  'Conservación mínima 15 años desde el alta del proceso asistencial.';
