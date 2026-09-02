# Módulo de consentimientos informados

Especificación de implementación para la app de gestión de la clínica
(React + Vite + Supabase).

---

## 1. Qué hay que construir

Un botón en la ficha del paciente. Se pulsa, se eligen uno o varios
tratamientos, y sale un PDF con los datos del paciente ya rellenos,
listo para imprimir y firmar en papel.

Sustituye a un Excel con macros de 20 MB donde cada consentimiento es
un JPEG escaneado con cuadros de texto colocados a mano encima.

**Fuera de alcance en esta versión:** firma digital, envío por email,
firma en tablet. Se firma en papel, como ahora.

---

## 2. Decisiones ya tomadas

Estas no hace falta reabrirlas.

| Decisión | Motivo |
|---|---|
| El texto legal es **texto**, no imagen | Los escaneos actuales pesan 20 MB y no son buscables ni versionables |
| PDF con `@react-pdf/renderer` | Encaja con React sin infraestructura extra y da texto real |
| Bloques compartidos + bloques propios | El 40% del texto se repite en las 18 plantillas |
| Copia congelada al emitir | Editar una plantilla no puede alterar lo que un paciente ya firmó |
| Plantillas inmutables | Editar = versión nueva, nunca sobrescribir |
| Campo `idioma` desde el día uno | Los pacientes pueden pedirlo en catalán; añadirlo después obliga a tocar el esquema |
| Profesional por defecto **sobrescribible** | En implantes siempre opera Sergio, pero si un día está de baja debe poder cambiarse |

---

## 3. Esquema de datos

Ver `sql/001_consentimientos.sql`. Cuatro tablas:

- `clinica_config` — fila única con razón social, CIF, registro sanitario, logo
- `consent_bloques` — bloques compartidos, uno por código y versión
- `consent_plantillas` — una por tratamiento, con su `composicion`
- `consent_documentos` — emitidos, con `contenido_congelado`

Incluye RLS y un trigger que impide reescribir un documento emitido.

**Además añade `domicilio` a la tabla `pacientes`.** Hoy no existe, y
por eso en el consentimiento de implantes hay un `con domicilio en
calle____` que se rellena a boli. El art. 43 de los Estatutos del COEC
lo exige en la ficha clínica.

---

## 4. Modelo de bloques

Un consentimiento es un array de nodos JSON. Tipos en `src/lib/consentimientos/tipos.ts`:

```
titulo, parrafo, lista, recuadro, campo_manual,
bloque_representante, firmas, salto_pagina
```

No hay HTML libre. Eso permite editar el contenido desde la app sin
que nadie pueda romper la maquetación del PDF.

**Campos de fusión**, sintaxis `{{ruta.al.campo}}`:

```
{{paciente.nombre}}            {{profesional.nombre}}
{{paciente.documento}}         {{profesional.colegiado}}
{{paciente.fecha_nacimiento}}  {{clinica.razon_social}}
{{paciente.domicilio}}         {{clinica.cif}}
{{paciente.telefono}}          {{clinica.registro_sanitario}}
{{tratamiento.piezas}}         {{clinica.email_dpd}}
{{lugar}}                      {{fecha}}
```

Un campo sin valor **no se deja en blanco**: se sustituye por una línea
de puntos para escribirlo a mano. Un hueco visible es preferible a un
documento que parece completo y no lo está.

---

## 5. Requisitos previos en la base

El módulo asume tres cosas que pueden no existir. Comprobarlas antes de
migrar y ajustar los nombres a los reales del proyecto:

| Necesita | Si no existe |
|---|---|
| `pacientes.fecha_nacimiento` | Añadir, anulable. Sin ella no se puede decidir quién firma |
| `pacientes.domicilio` | Añadir, anulable. Sale como línea manuscrita si va vacía |
| `doctores.colegiado` | Añadir. Los números están en `sql/002_colegiados.sql` |

**La fecha de nacimiento no bloquea el arranque.** Las fichas antiguas
vienen de un Excel que nunca la usó, así que estarán casi todas vacías.
El modal la pide la primera vez que se emite un consentimiento para ese
paciente y la guarda en la ficha. El dato se completa solo con el uso,
sin necesidad de rellenar miles de fichas por adelantado.

## 6. La lógica de menores

Este es el punto donde es más fácil equivocarse, así que va explícito.

El criterio **no** es «menor de 18, firman los padres». La Llei 21/2000
de Catalunya lo reparte así:

| Edad | Quién firma |
|---|---|
| 16 o más | El propio paciente. Los padres **no** firman |
| 12 a 15 | El representante, habiendo escuchado al menor |
| Menos de 12 | El representante |

Un paciente de 17 años en ortodoncia firma él. Está en
`merge.ts` como dos constantes:

```ts
export const EDAD_CONSENTIMIENTO_PROPIO = 16;
export const EDAD_ESCUCHAR_AL_MENOR = 12;
```

Si la clínica decide otro criterio se cambia ahí y en ningún otro sitio.

Cuando el firmante es un representante:

1. Se imprime el bloque `representante`, con tres líneas en blanco
   para nombre, documento y parentesco. **Se escriben a mano.** La app
   no guarda datos de los padres.
2. Se usa `firmas_representante` en lugar de `firmas_paciente`.

Cuando firma el propio paciente, el bloque de representante desaparece
del documento entero. No se imprime vacío.

---

## 7. Flujo de emisión

```
Ficha del paciente
  └─ botón "Consentimientos"
       └─ modal: lista de tratamientos con casillas
            └─ [Generar]
                 ├─ carga plantillas activas + bloques compartidos
                 ├─ calcula edad → determina firmante
                 ├─ resuelve composición y aplica fusión  (componerDocumento)
                 ├─ renderiza PDF                          (DocumentoPDF)
                 ├─ guarda en consent_documentos con contenido_congelado
                 ├─ sube el PDF al bucket privado
                 └─ abre el diálogo de impresión
```

Si se marcan varios tratamientos se genera **un documento por
tratamiento**, no uno combinado. El art. 8.3 de la Ley 41/2002 exige
consentimiento para cada actuación.

---

## 8. Requisitos de impresión

- A4, márgenes de 42 pt laterales
- Times New Roman o equivalente (`Tinos`, incluida en `public/fonts/`),
  para que el documento nuevo se parezca al que la clínica lleva años
  usando
- Pie fijo en todas las páginas con razón social, CIF, registro
  sanitario, **rúbrica** y `Pág. X de Y`
- El bloque de firmas **nunca** se parte entre páginas (`wrap={false}`)
- Los recuadros tampoco

---

## 9. Estado del contenido

Las 18 plantillas están generadas y en `seed/plantillas/`. Se cargan
**inactivas**: una plantilla inactiva no aparece en el botón de la ficha
del paciente. Se activan una a una desde el editor, después de
cotejarlas contra su escaneo en `originales/`.

Diecisiete salieron de OCR en español sobre los escaneos, con un
conversor (`scripts/convertir-ocr.py`) que las estructura en bloques.
Endodoncia está transcrita a mano y marcada `VERIFICADA`.

El OCR acertó la prosa casi entera. Quedan **16 fragmentos dudosos** en
todo el conjunto, y el editor los marca solo con un aviso al lado del
campo. Es un trabajo de corregir, no de teclear.

### Clasificación previa

Los 18 consentimientos actuales no son homogéneos. Están clasificados:

**13 en buen estado.** Citan la Ley 41/2002, tienen estructura correcta
y 11 de ellos ya traen cláusula de revocación. Son transcripción
directa: cirugía oral, endodoncia, reendodoncia, férula, conservadora,
odontopediatría, periodoncia, prótesis dentosoportada, prótesis
removible, prótesis implantosoportada, elevación, injertos, ortodoncia.

**5 necesitan trabajo antes de transcribirse:**

| Plantilla | Problema |
|---|---|
| `IMPLANTES` | Modelo argentino. No cita la ley española, sin revocación, terminología ajena («Aclaración», «Jefe de Equipo») |
| `REGENERACION` | No cita la ley, sin revocación, sin mención a representante |
| `CARILLAS` | No cita la ley, sin revocación |
| `BLANQUEAMIENTO_1` | Papel propio de la clínica, sin estructura legal |
| `BLANQUEAMIENTO_2` | Oculta en el Excel; comprobar si se sigue usando |

Que los flojos sean implantes, regeneración, carillas y blanqueamiento
no es casualidad: son los de más importe y los puramente estéticos.

**Ninguno de los 18 tiene cláusula de protección de datos.** Es el único
hueco universal.

---

## 10. Bloques pendientes de validación clínica

Dos bloques del seed llevan marca `PENDIENTE DE APROBACIÓN` porque no
proceden de ningún documento existente:

- `proteccion_datos` — redactado desde la norma. Verificar la base
  jurídica antes de publicarlo: en asistencia sanitaria suele ser el
  art. 9.2.h del RGPD, no el consentimiento del interesado.
- `contraindicaciones` — el art. 10.1.d de la Ley 41/2002 lo enumera
  como información básica obligatoria y no aparece en ninguno. El
  contenido clínico lo tiene que redactar el responsable sanitario para
  cada tratamiento.

Los dos llevan ya texto redactado, no una línea en blanco, para que
revisarlos sea leer y confirmar en vez de escribir desde cero.

Aun así **necesitan el visto bueno de un dentista antes de producción**,
y no por burocracia: las contraindicaciones son criterio médico, y la
cláusula de protección de datos es una declaración que la clínica le
hace al paciente sobre base jurídica y plazos de conservación. El
art. 40 de los Estatutos del COEC asigna al responsable sanitario la
máxima responsabilidad sobre el cumplimiento normativo del centro.

El sistema funciona igualmente mientras tanto: el bloque de
contraindicaciones deja una línea manuscrita, que es exactamente lo que
hacen hoy los dieciocho consentimientos.

---

## 11. Retención

15 años desde el alta de cada proceso asistencial (Llei 21/2000
art. 12.4, redactado por la Llei 16/2010). Los consentimientos están
nombrados explícitamente en el tramo largo.

Ojo: el art. 44 de los Estatutos del COEC dice 20 años desde la muerte
del paciente. Es la redacción anterior a la reforma de 2010 y lleva
cláusula de escape. **Manda la ley, no los Estatutos.**

No implementes borrado automático. Añade en cambio una función de
exportar el historial completo del paciente: el art. 44 reconoce el
derecho a obtener copia **sin cargo alguno**.

---

## 12. Orden de trabajo

1. Migración SQL y bucket privado de Storage
2. `create extension if not exists unaccent;` y `sql/002_colegiados.sql`
   (bloque 1 primero: comprueba el emparejamiento de nombres)
3. `node scripts/cargar-seed.mjs` — carga 12 bloques y 18 plantillas, todas inactivas
4. Rellenar `clinica_config` con razón social, CIF, registro sanitario y logo
5. Renderizador, botón y editor
6. Abrir endodoncia en el editor, vista previa, cotejar contra
   `originales/ENDODONCIAS_1_p*.jpg`, activar
7. Repetir con las otras 17. El editor avisa de los restos de OCR
8. Pasar contraindicaciones y protección de datos por un dentista

El paso 6 no se salta: valida el circuito entero con un solo documento
antes de dar por buenos los dieciocho.

---

## 13. Archivos

```
sql/001_consentimientos.sql              esquema, RLS, trigger de inmutabilidad
sql/002_colegiados.sql                   nº de colegiado sacados del Excel
seed/bloques-compartidos.json            12 bloques compartidos
seed/plantillas/*.json                   las 18 plantillas
scripts/cargar-seed.mjs                  carga a Supabase, idempotente
scripts/convertir-ocr.py                 el conversor, por si hay que rehacerlo
src/lib/consentimientos/tipos.ts         modelo de bloques
src/lib/consentimientos/merge.ts         fusión, edad, firmante, composición
src/lib/consentimientos/DocumentoPDF.tsx renderizador react-pdf
src/components/BotonConsentimientos.tsx  botón y modal de la ficha del paciente
src/components/EditorPlantillas.tsx      revisión y activación de plantillas
originales/                              39 páginas escaneadas
ocr-borrador/                            OCR en español, texto plano
```

Hace falta `Tinos` en `public/fonts/` (Regular, Bold, Italic). Es la
versión libre y métricamente compatible de Times New Roman, que es la
tipografía de los escaneos originales.
