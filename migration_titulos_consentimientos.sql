-- ============================================================
-- Títulos limpios de los consentimientos
-- ============================================================
-- Los títulos salían del OCR con el prefijo "Documento de consentimiento
-- informado para" pegado delante, y en cinco de ellos lo que venía detrás
-- no servía:
--
--   CARILLAS                    "diagnostico:"
--   FERULA                      "documento de qonsentimiento informado para"
--   REENDO                      "aee endodoncia"          (aee = AEDE)
--   ODONTOPEDIATRIA             ". odontopediatría"
--   PROTESISIMPLANTOSOPORTADA   ": protesis fija implantosoportada"
--
-- Así que no basta con recortar el prefijo: hay que nombrarlos. El título
-- es lo que se ve en la lista de la ficha y lo que encabeza el PDF.

update consent_plantillas set titulo = v.titulo
  from (values
    ('BLANQUEAMIENTO',            'Blanqueamiento dental'),
    ('BLANQUEAMIENTO_2',          'Blanqueamiento dental (2)'),
    ('CARILLAS',                  'Carillas'),
    ('CIRUGIAORAL',               'Cirugía oral'),
    ('CONSERVADORA',              'Odontología conservadora'),
    ('ELEVACION',                 'Elevación de seno'),
    ('ENDODONCIA',                'Endodoncia'),
    ('FERULA',                    'Férula de descarga'),
    ('IMPLANTES',                 'Implantes dentales'),
    ('INJERTOS',                  'Injertos conectivos'),
    ('ODONTOPEDIATRIA',           'Odontopediatría'),
    ('ORTODONCIA',                'Ortodoncia'),
    ('PERIODONCIA',               'Periodoncia'),
    ('PROTESISDENTOSOPORTADA',    'Prótesis fija dentosoportada'),
    ('PROTESISIMPLANTOSOPORTADA', 'Prótesis fija implantosoportada'),
    ('PROTESISREMOVIBLE',         'Prótesis removible'),
    ('REENDO',                    'Reendodoncia'),
    ('REGENERACION',              'Regeneración ósea')
  ) as v(codigo, titulo)
 where consent_plantillas.codigo = v.codigo;
