# Nueva sección: Pacientes de Mutua (consulta de disponibilidad)

## Contexto y objetivo

La clínica atiende pacientes de la mutua **Agrupació (producto "Tomamos Impulso")**. La mutua solo permite volver a facturar ciertos tratamientos **sobre la misma pieza** cuando pasaron **6 meses** desde la última vez. Queremos una sección de consulta para:

1. **Ficha por paciente**: al buscar por DNI o nombre, ver qué hay por hacer hoy de estos tratamientos: qué piezas están disponibles, cuáles están bloqueadas y hasta cuándo, y el historial completo con la mutua, para no pisarnos.
2. **Por hacer del mes**: para un mes elegido, ver todos los pacientes con lo que tienen disponible de estos tratamientos, con prioridad para los que liberan piezas ese mes. Sirve para repartir el trabajo y llamar a pacientes a valoración.

Los pacientes de mutua son **independientes** de la tabla de pacientes existente: tablas propias, sin foreign keys ni lecturas hacia lo que ya existe. La única escritura de la sección es la importación.

## Acceso

Visible solo para **Martín y Hernán**, igual que la sección restringida que ya ve Hernán. **Antes de escribir código**, localizá cómo está restringida esa sección (guard de ruta, helper de rol/usuario, políticas RLS) y reutilizá exactamente ese mecanismo, tanto en el frontend (menú + ruta) como en **RLS de todas las tablas y vistas nuevas**. Ocultar el menú no alcanza: con la anon key las tablas son consultables. Si el mecanismo no es obvio, preguntame antes de inventar uno.

Son datos de salud con DNI (RGPD, categoría especial): el Excel **no se commitea** (agregalo a `.gitignore` si lo dejás dentro del repo).

## Datos de origen

Export del portal de la mutua (`treatments_list_YYYYMMDDHHMM.xlsx`, una hoja "Adeland Export"). Columnas exactas:

| Columna Excel | Tipo | Notas |
|---|---|---|
| Información de Paciente | texto | Nombre completo en mayúsculas |
| DNI del paciente | texto, **nullable** | 29 pacientes sin DNI (286 filas), casi todos menores |
| código | entero | Código de prestación de la mutua |
| Tratamiento | texto | Un mismo código puede venir con textos distintos; **usar siempre el código** |
| Precio | entero | Casi siempre 0 |
| Pieza | entero, nullable | Numeración FDI (11–48 permanentes, 51–85 temporales) |
| Producto | texto | |
| Creado el | fecha dd/mm/aaaa | |
| Facturado | fecha, nullable | |
| Fecha Alb/Fact | fecha, nullable | |
| Devuelto | fecha, nullable | Línea rechazada por la mutua al revisar la factura mensual (ver regla) |
| Fecha de Realización | fecha dd/mm/aaaa | **Fecha base del cálculo** |

Hechos verificados en el archivo actual: 3465 filas, 233 pacientes (204 DNIs + 29 sin DNI), realizaciones del 20/01/2020 al 28/08/2026. Hay filas idénticas legítimas (mismo paciente, código, pieza y fecha, p. ej. radiografías), así que **no hay clave natural única**: no deduplicar. 

## Reglas de negocio

### Familias

La lógica trabaja por familia, no por código, porque la serie 321xx es la tarifa infantil de la 323xx y un paciente pasa de una a otra al crecer (misma pieza, distinto código).

| Familia | Etiqueta en UI | Códigos |
|---|---|---|
| OBTURACION | Obturación | 32301, 32102, 32101 |
| ANGULOS | Reconstrucción de ángulos | 32302, 32103 |
| PERDIDA | (solo para excluir piezas) | 32020, 32450, 32222, 32452, 32543, 32878 (extracciones), 32890 (implante) |

### Universo de piezas por tratamiento ("lo que se podría hacer")

- **Obturación**: las 32 permanentes (11–18, 21–28, 31–38, 41–48).
- **Reconstrucción de ángulos**: solo **sector anterior**, posiciones 1 a 3 de cada cuadrante (11–13, 21–23, 31–33, 41–43). En el historial, el 96% de los ángulos está en esas posiciones; ofrecer molares como "por hacer" sería ruido. Si hay historial de ángulos fuera del sector, esa pieza igual se muestra en la ficha con su estado, pero no suma en los conteos.
- **Temporales** (51–55, 61–65, 71–75, 81–85, y para ángulos 51–53, 61–63, 71–73, 81–83): se agregan al universo **solo si el paciente tuvo alguna prestación en pieza temporal en los últimos 24 meses**. En la UI se muestran separados de los permanentes.
- Las tres reglas anteriores van en constantes de configuración centralizadas.

### Estado de cada pieza del universo en una fecha de referencia R

Para paciente + familia + pieza:

- `ultima_fecha` = máxima `fecha_realizacion` de esa familia en esa pieza, **ignorando filas con `devuelto` no nulo** y filas sin pieza.
- `fecha_liberacion` = `ultima_fecha + 6 meses calendario` (31/08 → 28/02). En Postgres: `(ultima_fecha + interval '6 months')::date`.
- **Perdida** si hay una prestación de familia PERDIDA en esa pieza con fecha `>=` a `ultima_fecha` (o sin `ultima_fecha`). No se ofrece nunca.
- **Bloqueada** si `fecha_liberacion > R`.
- **Disponible con historial** si `fecha_liberacion <= R`.
- **Disponible sin historial** si nunca se hizo.
- **Se libera en el mes**: subcaso de disponible cuando `fecha_liberacion` cae dentro del mes elegido.

Otras reglas:

- Obturación y ángulos **no se bloquean entre sí** (confirmado).
- La fecha base es **siempre la de realización**, nunca la de facturación (confirmado).
- **Devueltos no bloquean.** Es una inferencia a partir de los datos, no está confirmado con la mutua: solo hay 8 filas en 6 años, siempre devueltas entre 2 y 6 días después de la facturación de fin de mes. Cuando la clínica volvió a pasar la prestación, aparece una fila nueva sin `devuelto`, y esa bloquea normalmente. Dejarlo en la constante `DEVUELTOS_BLOQUEAN = false`.
- Filas de estas familias **sin pieza** no entran en el cálculo; la ficha muestra un aviso.
- **R en la ficha** = hoy. **R en la vista mensual** = último día del mes elegido. Si una pieza se libera dentro del mes, se muestra "desde dd/mm".
- "Hoy" es la fecha local Europe/Madrid. No usar `toISOString()` para obtener la fecha del día (desfase UTC).
- Las constantes de reglas (`MESES_BLOQUEO = 6`, `BLOQUEO_CRUZADO = false`, `DEVUELTOS_BLOQUEAN = false`, sector de ángulos, ventana de temporales) van centralizadas en un solo archivo.

## Modelo de datos (Supabase)

Adaptá nombres al estilo de las migraciones existentes del repo.

```sql
create table mutua_importaciones (
  id bigint generated always as identity primary key,
  archivo text not null,
  filas int not null,
  pacientes int not null,
  fecha_min_realizacion date,
  fecha_max_realizacion date,
  importado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table mutua_prestaciones (
  id bigint generated always as identity primary key,
  importacion_id bigint not null references mutua_importaciones(id),
  paciente_key text not null,        -- DNI normalizado, o 'NOM:' || nombre normalizado si no hay DNI
  dni text,
  nombre text not null,
  codigo int not null,
  tratamiento text not null,
  precio numeric(10,2) not null default 0,
  pieza smallint,
  producto text,
  creado_el date,
  facturado date,
  fecha_alb_fact date,
  devuelto date,
  fecha_realizacion date not null
);
create index on mutua_prestaciones (paciente_key);
create index on mutua_prestaciones (codigo, pieza);

create table mutua_familias (
  codigo int primary key,
  familia text not null check (familia in ('OBTURACION','ANGULOS','PERDIDA'))
);
-- seed con los códigos de la tabla de familias
```

Vistas, todas con **`security_invoker = true`** para que respeten RLS:

```sql
-- Última realización y liberación por paciente/familia/pieza
create or replace view mutua_ultimas as
select p.paciente_key, f.familia, p.pieza,
       max(p.fecha_realizacion) as ultima_fecha,
       (max(p.fecha_realizacion) + interval '6 months')::date as fecha_liberacion
from mutua_prestaciones p
join mutua_familias f on f.codigo = p.codigo and f.familia in ('OBTURACION','ANGULOS')
where p.pieza is not null and p.devuelto is null
group by 1, 2, 3;

-- Piezas con extracción o implante (independiente de si tuvieron obturación/ángulos)
create or replace view mutua_perdidas as
select p.paciente_key, p.pieza, max(p.fecha_realizacion) as fecha_perdida
from mutua_prestaciones p
join mutua_familias f on f.codigo = p.codigo and f.familia = 'PERDIDA'
where p.pieza is not null
group by 1, 2;

-- Resumen por paciente: nombre, DNI, última visita, si tuvo temporales en 24 meses
create or replace view mutua_pacientes as
select paciente_key,
       max(nombre) as nombre,
       max(dni) as dni,
       max(fecha_realizacion) as ultima_visita,
       bool_or(pieza >= 51 and fecha_realizacion >= current_date - interval '24 months') as incluye_temporales
from mutua_prestaciones
group by paciente_key;
```

El cruce contra el universo de piezas y la fecha de referencia se hace en el cliente con una **única función pura** (p. ej. `calcularEstadoPiezas(paciente, ultimas, perdidas, R)`) usada por la ficha y por la vista mensual, con tests unitarios. Con ~233 pacientes y ~2000 filas en `mutua_ultimas`, calcular en cliente es suficiente.

## Importador

Botón "Actualizar datos de la mutua" dentro de la sección (mismos permisos).

1. Parseo en el cliente (SheetJS o la librería de Excel que ya use el repo). Validar que existan las 12 columnas exactas; si falta alguna, abortar con mensaje claro.
2. Fechas: aceptar tanto texto `dd/mm/aaaa` (formato actual) como fechas nativas de Excel.
3. Normalizar: DNI `trim().toUpperCase()` (vacío → null); nombre `trim`, espacios colapsados, mayúsculas; pieza y código a entero.
4. `paciente_key` = DNI, o `'NOM:' + nombre` si no hay DNI.
5. **Reemplazo total** de `mutua_prestaciones` en una transacción, mediante RPC `mutua_reemplazar_datos(p_archivo text, p_filas jsonb)`:
   - inserta el registro en `mutua_importaciones`;
   - borra las prestaciones (`delete ... where true`, porque Supabase bloquea DELETE sin WHERE);
   - inserta las nuevas con `jsonb_to_recordset`;
   - completa filas, pacientes y fechas mínima y máxima.

   Se reemplaza todo porque el export trae el historial completo y no hay clave para upsert.
6. Protección: si el archivo nuevo tiene **menos filas** que lo cargado o su fecha mínima de realización es **posterior** a la actual, pedir confirmación explícita ("Este archivo parece tener menos historial que el actual: X filas vs Y. ¿Reemplazar igual?").

En la cabecera de la sección, siempre visible: **"Datos de la mutua hasta el [fecha_max_realizacion] · importado el [fecha] por [usuario]"**. Si la importación tiene más de 30 días, mostrarlo en color de alerta.

## UI

Ruta propia (p. ej. `/mutua`) con dos pestañas. Usar los componentes y estilos que ya existen en el proyecto. En toda la sección solo aparecen estas dos familias; el resto de tratamientos solo en el historial de la ficha.

### Buscador común

Un único input en ambas pestañas que busca por **DNI o nombre**, parcial, sin distinguir mayúsculas ni tildes (`normalize('NFD')` y quitar diacríticos). Nada más: sin teléfono.

### Pestaña 1: Ficha de paciente

- Cabecera: nombre, DNI (o "Sin DNI"), producto, última visita.
- **Bloque "Por hacer hoy"** arriba de todo, uno por tratamiento, expresado como conteo + excepciones para que se lea rápido:
  - "**Obturación: 26 de 32 piezas disponibles.** Bloqueadas: 14, 26, 34, 35, 44, 45 hasta 17/02/2027."
  - "**Reconstrucción de ángulos: 9 de 12 disponibles.** Bloqueadas: 11, 12, 41 hasta 17/02/2027."
  - Si hay perdidas: "Perdidas: 24, 28 (extracción)". Si hay varias fechas de liberación, agrupar por fecha. Si no hay nada bloqueado ni perdido: "Todas disponibles".
  - Si incluye temporales, línea aparte: "Temporales: 19 de 20 disponibles. Bloqueada: 55 hasta 17/09/2026."
  - Debajo, lista expandible con las piezas **disponibles con historial**: pieza, última fecha, "hace N meses", código.
- **Odontograma FDI por familia** (dos, lado a lado o en tabs):
  - Permanentes: 18–11 | 21–28 arriba, 48–41 | 31–38 abajo.
  - Temporales (55–51 | 61–65, 85–81 | 71–75) solo si `incluye_temporales`.
  - Estados de celda:
    - **Bloqueada**: color alerta; tooltip con hecha, libera y días que faltan.
    - **Disponible con historial**: color ok, más tenue; tooltip con la última fecha, hace cuánto y el código.
    - **Disponible sin historial**: color ok.
    - **Perdida**: tachada; tooltip con la extracción o el implante.
    - **Fuera de sector** (ángulos en posteriores sin historial): gris muy tenue.
- Avisos: prestaciones de estas familias sin pieza; prestaciones devueltas.
- **Historial completo** (colapsado por defecto): todas las prestaciones del paciente, incluidas las que no son de estas familias, orden descendente por realización. Columnas: realización, código, tratamiento, pieza, facturado, devuelto (badge "Devuelto"). Solo lectura.

### Pestaña 2: Por hacer del mes

**Filtros:**
- **Mes**: por defecto el mes en curso.
- **Última visita**: 12 meses / **24 meses (por defecto)** / 36 meses / Todos. El export no indica si el paciente sigue afiliado, y 158 de los 233 no vienen hace más de 2 años.
- **Tratamiento**: Ambos (por defecto) / Obturación / Ángulos. Con uno solo elegido, se ocultan la columna y los conteos del otro, y se excluyen los pacientes sin nada disponible de ese tratamiento.
- **Buscador común.**

**KPIs arriba, grandes, contados en pacientes y no en piezas** (un total de piezas disponibles suma miles y no informa):
- Pacientes en la lista
- **Liberan piezas este mes**
- Todo disponible (sin bloqueos)
- Con piezas bloqueadas

**Tabla en dos bloques:**
1. **"Se liberan en [mes]"** (resaltado, arriba): pacientes con al menos una pieza que se libera en el mes.
2. **"Resto con disponibilidad"**: todos los demás del filtro, ordenados por última visita, la más reciente primero.

**Columnas de cada fila:**
- Paciente · DNI
- **Obturación**: "26/32" + chips **resaltados** con las piezas que se liberan este mes ("15 desde 17/09") + texto corto de bloqueadas ("bloq. 14, 26… hasta 17/02/27"). Click o expandir muestra la lista completa de piezas disponibles.
- **Reconstrucción de ángulos**: mismo formato.
- Marca "+ temporales" si el paciente los incluye; chips de temporales con marca visual.
- Última visita

**Comportamiento:**
- Ordenable por nombre, última visita, disponibles de cada tratamiento.
- Click en la fila abre la ficha.
- Si el bloque 1 está vacío: "Ningún paciente libera piezas en [mes]", y el bloque 2 se muestra igual.

## Orden de trabajo

1. Investigar el mecanismo de permisos de la sección de Hernán y la estructura del repo.
2. Migración: tablas, seed de familias, vistas, RLS, RPC.
3. Importador, e importar `treatments_list_202609101526.xlsx`.
4. Función pura de estado de piezas + tests unitarios + verificar los tests de aceptación antes de la UI.
5. Ficha de paciente.
6. Por hacer del mes.

## Tests de aceptación (archivo actual, hoy = 10/09/2026)

1. **Import**: 3465 filas, 233 pacientes, fecha máxima de realización 28/08/2026.
2. **Septiembre 2026, ambos tratamientos**:
   - Filtro 24 meses: 75 pacientes; 13 liberan este mes; 55 todo disponible; 20 con bloqueadas.
   - Filtro 12 meses: 50 / 13 / 30 / 20.
   - Filtro Todos: 233 / 13 / 213 / 20.
3. **Liberaciones**: octubre 2026 = 4 pacientes; noviembre 2026 = 0, con el mensaje de bloque vacío y el bloque 2 visible.
4. **Ficha 41674423X (ERIC ANGELO DOS ANJOS)**:
   - Obturación 26 de 32, bloqueadas 14, 26, 34, 35, 44, 45 hasta 17/02/2027.
   - Ángulos 9 de 12, bloqueadas 11, 12, 41 hasta 17/02/2027.
   - Pieza 25 tiene 32102 del 04/03/2024 y 32301 del 31/01/2025: toma la más reciente y figura disponible con historial.
   - Sin temporales.
5. **Sin DNI + temporales**: buscar "cañadas" encuentra MIA JULIETH CAÑADAS GALAN.
   - Incluye temporales.
   - Hoy la obturación en 55 está bloqueada hasta 17/09/2026.
   - En la vista de septiembre aparece en el bloque "Se liberan" con el chip "55 desde 17/09".
6. **Piezas perdidas**: X6973651M (RACHID HARCHA) tiene perdidas 24, 28, 36, 48 (extracciones sin obturación previa en la mutua). Obturación: 23 de 32 disponibles, y esas 4 no figuran como disponibles.
7. **Devuelto**: RUBEN ALDAIR VELASQUEZ URBINA, obturación pieza 15 del 16/07/2026 devuelta el 06/08/2026. No bloquea y aparece en el historial con badge "Devuelto".
8. **Sin pieza**: 26475037J (ANA M. MARTINEZ GOMEZ) tiene ángulos del 20/04/2021 sin pieza: aviso en la ficha, no afecta el cálculo.
9. **Búsqueda**: "41674423x" (minúscula) encuentra a Eric; "canadas" (sin tilde) encuentra a MIA JULIETH CAÑADAS GALAN.
10. **Unitario de fechas**: 31/08/2026 + 6 meses = 28/02/2027; 31/08/2027 + 6 meses = 29/02/2028.

## Fuera de alcance

Teléfonos (ni búsqueda, ni carga manual, ni cruce con la tabla de pacientes existente), registro de llamadas o estado "contactado", asignación de pacientes a una persona, exportación a CSV. No implementar sin pedido explícito.
