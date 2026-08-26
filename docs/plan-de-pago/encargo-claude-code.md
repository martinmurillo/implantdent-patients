# Encargo: pestaña "Plan de pago" + seguimiento de planes acordados

## Antes de escribir código

Revisá primero la estructura actual del proyecto: cómo están modeladas las tablas de
presupuestos y tratamientos en Supabase, cómo se navega entre pestañas, qué componentes
de UI ya existen (botones, inputs, tarjetas, tablas) y cómo se gestionan las rutas.
Todo lo que sigue tiene que integrarse con lo que ya hay, no montarse en paralelo.

Adjunto `plan-de-pago.html`, un prototipo que ya funciona y está probado con presupuestos
reales de la clínica.

**No lo integres tal cual.** Es HTML suelto con manipulación directa del DOM. Reimplementá
la funcionalidad en React siguiendo los patrones del proyecto y usá el prototipo únicamente
como referencia de comportamiento y de diseño visual.

**La única excepción:** la función `parseRows()` del prototipo (lectura del PDF por
posición de columnas). Esa lógica ya está validada contra los presupuestos que emite el
software de la clínica y conviene portarla casi literal. Si la reescribís desde cero se
rompe: el nombre del tratamiento se dibuja en una línea de texto ligeramente distinta a
la de los importes de su propia fila, y agrupar por texto corrido desalinea las filas.

---

## 1. Qué tiene que hacer la pestaña

Una pantalla donde armar, junto al paciente, cómo va a pagar un tratamiento ya
presupuestado. Cada tratamiento se coloca en un mes, y la pantalla muestra al instante
cuánto paga el paciente cada mes.

### Dos modos de cobro (selector arriba)

**A · Paga cada vez que viene**
Cada mes se cobra lo que se ejecuta ese mes. Campos: entrega hoy (se descuenta de los
primeros meses) y techo por mes opcional (marca en rojo los meses que lo superan).

**B · Entrega + cuotas fijas**
Campos: entrega, número de cuotas, importe de cuota y en qué mes empiezan las cuotas.
La cuota se calcula sola como `(total − entrega) / nº cuotas`, pero el usuario la puede
pisar a mano y ese valor manual manda: el importe real lo fija la financiera, con sus
intereses del día, y no se puede calcular internamente.
En este modo la columna del mes muestra **el importe de la cuota**, no el coste de lo que
se hace ese mes, con la etiqueta "Cuota 3 de 5".

### Control de cobertura acumulada (lo más importante)

En cada mes que tenga tratamientos, comparar:

- **cobrado acumulado** hasta ese mes (entrega + cuotas, o pagos por visita)
- **ejecutado acumulado** hasta ese mes (suma de los tratamientos colocados)

Si lo ejecutado supera lo cobrado, mostrar en esa columna una franja roja con la
diferencia ("Faltan 357 €"); si no, una verde ("Cubierto +338 €"). Debajo del tablero,
un aviso que resuma en qué meses hay descubierto y de cuánto es el mayor.

Este control es la razón de ser de la herramienta: sirve para colocar los tratamientos
caros (implantes) en un punto del calendario donde ya estén pagados.

Cuando el plan cobre más que el presupuesto (porque la cuota lleva intereses), avisar la
diferencia en euros.

### Interacción

Los tratamientos se mueven entre meses arrastrando y también con flechas ‹ › en cada
tarjeta, porque en tablet el arrastre es poco fiable. Botones + y − para agregar o quitar
meses; el − se deshabilita si el último mes tiene tratamientos o cuotas pendientes.

### Impresión

A4 **apaisado**, márgenes de 7 mm, todo en una sola hoja, seis columnas por fila. Ocultar
controles, flechas y botones. Es lo que se le entrega al paciente.

---

## 2. Vinculación con los presupuestos (clave)

Hoy el presupuesto se carga desde PDF y queda en el sistema. **No debe volver a cargarse
para armar el plan.**

- En la vista de un presupuesto, agregar un botón **"Armar plan de pago"** que abra la
  pestaña con los tratamientos ya cargados desde la base.
- Si se entra a la pestaña "Plan de pago" directamente, mostrar un selector de
  presupuestos existentes (buscables por paciente o número), y al elegir uno se carga solo.
- El import de PDF queda **solo como alternativa** para presupuestos que no estén en el
  sistema. No debe ser el camino principal.
- Un plan ya guardado se abre para editar, no se rehace.

---

## 3. Persistencia y seguimiento

El plan se guarda en base, atado al presupuesto (`presupuesto_id`).

**El plan necesita fecha de inicio real.** Guardar `fecha_inicio` y derivar de ahí la fecha
de vencimiento de cada cuota (mes 1 = fecha de inicio, mes 2 = +1 mes, etc.). Sin fechas
reales no hay seguimiento posible: "Mes 3" no sirve para saber quién se atrasó.

Guardar como mínimo: presupuesto y paciente asociados, modo (visita / cuotas), entrega,
número de cuotas, importe de cuota, mes de inicio de cuotas, fecha de inicio, y para cada
tratamiento en qué mes quedó colocado. Además, el registro de cobros efectivos por cuota
(fecha y importe), para poder marcar pagado / pendiente / vencido.

Proponeme el esquema de tablas antes de aplicar cualquier migración.

---

## 4. Sección nueva: "Pendientes de pago"

Sección **separada** de la agenda y de los recordatorios de visita, que ya existen y no hay
que tocar. Esto no es una cita: es un compromiso económico.

Debe mostrar, para todos los planes activos:

- paciente, presupuesto e importe total
- cuota que viene y cuándo vence
- cuántas cuotas van pagadas sobre el total
- cuánto queda por cobrar
- **alerta de cuota vencida no cobrada**
- **alerta de tratamiento próximo con cobertura insuficiente**: si en el mes que viene hay
  un implante o una corona y el acumulado cobrado no lo cubre, avisarlo antes de la cita

Filtros por estado (al día / atrasado / terminado) y orden por vencimiento más próximo.

---

## 5. Criterios generales

- Idioma de toda la interfaz: español.
- Todos los cálculos deterministas, sin llamadas a IA: esto se usa con el paciente sentado
  enfrente y necesita respuesta instantánea y siempre igual.
- Todo el procesamiento del PDF sigue siendo en el navegador; los PDFs contienen nombre,
  DNI y dirección del paciente y no deben salir del cliente.
- Reutilizar los componentes y estilos que ya existan en el proyecto en lugar de copiar el
  CSS del prototipo.
- Antes de implementar, respondeme con el plan de trabajo y el esquema de tablas propuesto.
  No apliques migraciones sin confirmación.
