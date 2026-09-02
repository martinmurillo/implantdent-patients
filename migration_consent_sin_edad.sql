-- ============================================================
-- La edad deja de calcularse: quien firma se elige a mano
-- ============================================================
-- El modal ya no pide la fecha de nacimiento ni deduce el firmante, así
-- que no hay ninguna edad que guardar. La columna se queda -no se borra
-- por si vuelve a hacer falta- pero deja de ser obligatoria: tal como
-- estaba, con NOT NULL, cualquier intento de emitir un consentimiento
-- fallaba al insertar.
alter table consent_documentos alter column edad_al_emitir drop not null;

comment on column consent_documentos.edad_al_emitir is
  'En desuso desde que el firmante se elige a mano en el modal.';
