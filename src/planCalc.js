// ─── Motor de cálculo del plan de pago ───────────────────────────────────────
// Funciones puras, sin DOM y sin llamadas de red: se usan con el paciente
// sentado enfrente, así que tienen que responder al instante y siempre igual.
//
// Convención de meses: 1-based hacia afuera (mes 1 = fecha de inicio del plan),
// que es como se guardan en la base. Internamente se trabaja 0-based.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Umbral en euros por debajo del cual una diferencia no se considera descubierto.
// El tablero muestra euros enteros; avisar por 0,20 € sería ruido.
const EPS = 0.5;

// ─── Fechas ──────────────────────────────────────────────────────────────────
// Suma meses a una fecha ISO capando al último día del mes destino:
// 31/01 + 1 mes = 28/02 (o 29/02 en bisiesto), no 02/03 o 03/03 como haría
// el constructor Date por desbordamiento. Mismo caso para 29 y 30.
export const addMeses = (iso, k) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  const total = (m - 1) + k;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;               // 0-based
  const ultimoDia = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, ultimoDia);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
};

// Días de "desde" a "hasta". Negativo si ya pasó.
export const diasEntre = (desde, hasta) => {
  const p = (s) => { const [y, m, d] = String(s).split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(hasta) - p(desde)) / 86400000);
};

export const sumarDias = (iso, n) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};

// Reparte los meses del tablero en filas equilibradas. Con 13 meses y un
// máximo de 7 por fila da 7+6, en vez de 6+6+1 con el último mes suelto.
export const columnasTablero = (nMeses, maxCols = 7) => {
  const n = Math.max(1, Number(nMeses) || 1);
  const filas = Math.ceil(n / Math.max(1, maxCols));
  return Math.ceil(n / filas);
};

// ─── Clasificación de tratamientos ───────────────────────────────────────────
// Vive acá y no en el lector de PDF porque la usan tanto la colocación inicial
// como las alertas de cobertura.
export const tipoTratamiento = (nombre) => {
  const n = String(nombre).toLowerCase();
  if (/corona.*implante/.test(n)) return "corona";
  if (/implante|multi ?unit|pilar/.test(n)) return "implante";
  return "otro";
};

// Deshace el descuento por línea del PDF: el importe guardado es el neto, y
// esto devuelve el precio de tarifa. Es lo que se cobra cuando el paciente
// paga según se va haciendo, porque ahí pierde el descuento.
export const precioSinDescuento = (neto, dtoPct) => {
  const n = Number(neto) || 0;
  const d = Number(dtoPct) || 0;
  if (d <= 0 || d >= 100) return round2(n);
  return round2(n / (1 - d / 100));
};

// Los que conviene no empezar sin tenerlos cobrados
export const esCaro = (nombre) => tipoTratamiento(nombre) !== "otro";

// ─── Cuota sugerida ──────────────────────────────────────────────────────────
// Solo orientativa: el importe real lo fija la financiera con sus intereses,
// y si el usuario lo pisa a mano ese valor manda (cuota_manual).
export const cuotaSugerida = (total, entrega, nCuotas) => {
  const n = Number(nCuotas) || 0;
  if (n <= 0) return 0;
  return round2(Math.max(0, (Number(total) || 0) - (Number(entrega) || 0)) / n);
};

export const totalTratamientos = (tratamientos = []) =>
  round2(tratamientos.reduce((s, t) => s + (Number(t.importe) || 0), 0));

// ─── Cálculo principal ───────────────────────────────────────────────────────
// tratamientos: [{ id, nombre, importe, mes }] con mes 1-based.
export function calcPlan({
  tratamientos    = [],
  nMeses          = 6,
  modo            = "visita",
  entrega         = 0,
  techoMes        = 0,
  nCuotas         = 0,
  importeCuota    = 0,
  mesInicioCuotas = 2,
} = {}) {
  const M = Math.max(1, Number(nMeses) || 1);
  const ent = Number(entrega) || 0;

  // Coste de lo que se ejecuta cada mes
  const ejecutado = new Array(M).fill(0);
  for (const t of tratamientos) {
    const m = (Number(t.mes) || 1) - 1;
    if (m >= 0 && m < M) ejecutado[m] += Number(t.importe) || 0;
  }

  // Lo que paga el paciente cada mes
  const porMes = new Array(M).fill(0);

  if (modo === "visita") {
    // Paga lo que se ejecuta ese mes; la entrega adelanta los primeros meses
    for (let m = 0; m < M; m++) porMes[m] = ejecutado[m];
    let resto = ent;
    for (let m = 0; m < M && resto > 0; m++) {
      const q = Math.min(resto, porMes[m]);
      porMes[m] -= q;
      resto -= q;
    }
    if (ent > 0) porMes[0] += ent;
  } else {
    const c = Number(importeCuota) || 0;
    const n = Number(nCuotas) || 0;
    const inicio = Math.max(1, Number(mesInicioCuotas) || 1) - 1;   // 0-based
    if (ent > 0) porMes[0] += ent;
    for (let i = 0; i < n; i++) {
      const m = inicio + i;
      if (m < M) porMes[m] += c;
    }
  }

  // Acumulados: la comparación que da sentido a la herramienta
  const cobradoAcum = [];
  const ejecutadoAcum = [];
  let a = 0, b = 0;
  for (let m = 0; m < M; m++) {
    a += porMes[m];      cobradoAcum.push(round2(a));
    b += ejecutado[m];   ejecutadoAcum.push(round2(b));
  }

  // Meses con tratamiento donde lo ejecutado supera lo cobrado hasta ahí
  const descubiertos = [];
  for (let m = 0; m < M; m++) {
    const tieneTx = tratamientos.some(t => (Number(t.mes) || 1) - 1 === m);
    const falta = ejecutadoAcum[m] - cobradoAcum[m];
    if (tieneTx && falta > EPS) descubiertos.push({ mes: m + 1, falta: round2(falta) });
  }

  // Meses que superan el techo (solo modo visita)
  const techo = Number(techoMes) || 0;
  const sobreTecho = [];
  if (modo === "visita" && techo > 0) {
    for (let m = 0; m < M; m++) {
      if (porMes[m] > techo + EPS) sobreTecho.push({ mes: m + 1, importe: round2(porMes[m]) });
    }
  }

  const totalTratamiento = totalTratamientos(tratamientos);
  const totalPlan = round2(porMes.reduce((s, x) => s + x, 0));
  const inicio0 = Math.max(1, Number(mesInicioCuotas) || 1) - 1;
  const n = Number(nCuotas) || 0;

  return {
    porMes: porMes.map(round2),
    ejecutado: ejecutado.map(round2),
    cobradoAcum,
    ejecutadoAcum,
    descubiertos,
    sobreTecho,
    totalTratamiento,
    totalPlan,
    diferencia: round2(totalPlan - totalTratamiento),
    peorDescubierto: descubiertos.length
      ? Math.max(...descubiertos.map(d => d.falta))
      : 0,
    cuotasFueraDeTablero: modo === "cuotas" && n > 0 && inicio0 + n > M,
    // El "−" del tablero no puede bajar de acá: dejaría tratamientos
    // o cuotas fuera de rango
    minMeses: Math.max(
      2,
      ...tratamientos.map(t => Number(t.mes) || 1),
      modo === "cuotas" && n > 0 ? inicio0 + n : 0,
    ),
  };
}

// ─── Calendario de cobros ────────────────────────────────────────────────────
// Genera las filas de payment_plan_cuotas. Mes 1 = fecha_inicio.
export function cuotasDelPlan(plan, calc) {
  const { modo, fecha_inicio, entrega, n_cuotas, importe_cuota, mes_inicio_cuotas } = plan;
  const filas = [];
  const ent = Number(entrega) || 0;

  if (modo === "cuotas") {
    if (ent > 0) {
      filas.push({ numero: 0, concepto: "entrega", mes: 1, vence_el: fecha_inicio, importe: round2(ent) });
    }
    const n = Number(n_cuotas) || 0;
    const inicio = Math.max(1, Number(mes_inicio_cuotas) || 1);
    for (let i = 0; i < n; i++) {
      const mes = inicio + i;
      filas.push({
        numero: i + 1,
        concepto: "cuota",
        mes,
        vence_el: addMeses(fecha_inicio, mes - 1),
        importe: round2(Number(importe_cuota) || 0),
      });
    }
  } else {
    // Modo visita: una fila por mes en que el paciente paga algo
    let numero = 1;
    calc.porMes.forEach((importe, i) => {
      if (importe > 0.005) {
        filas.push({
          numero: numero++,
          concepto: i === 0 && ent > 0 ? "entrega" : "visita",
          mes: i + 1,
          vence_el: addMeses(fecha_inicio, i),
          importe: round2(importe),
        });
      }
    });
  }
  return filas;
}

// ─── Estado de una cuota ─────────────────────────────────────────────────────
// pagos: filas de la tabla payments. Si el pago vinculado ya no existe
// (se borró desde Cobros), la cuota vuelve a contar como pendiente.
export const estadoCuota = (cuota, pagos = [], hoy) => {
  if (cuota.payment_id && pagos.some(p => p.id === cuota.payment_id)) return "pagado";
  return cuota.vence_el < hoy ? "vencido" : "pendiente";
};

// ─── Seguimiento de un plan acordado ─────────────────────────────────────────
export function resumenPlan({ plan, cuotas = [], pagos = [], pagosPaciente = null, hoy }) {
  const conEstado = [...cuotas]
    .sort((a, b) => a.vence_el.localeCompare(b.vence_el) || a.numero - b.numero)
    .map(c => ({ ...c, estado: estadoCuota(c, pagos, hoy) }));

  const pagadas  = conEstado.filter(c => c.estado === "pagado");
  const vencidas = conEstado.filter(c => c.estado === "vencido");
  const total    = round2(conEstado.reduce((s, c) => s + (Number(c.importe) || 0), 0));
  const cobrado  = round2(pagadas.reduce((s, c) => s + (Number(c.importe) || 0), 0));

  // Un borrador o un cancelado no son un compromiso de cobro: no se juzgan
  // por sus vencimientos.
  let estado;
  if (plan.estado === "cancelado" || plan.estado === "borrador") estado = plan.estado;
  else if (conEstado.length > 0 && pagadas.length === conEstado.length) estado = "terminado";
  else if (vencidas.length > 0) estado = "atrasado";
  else estado = "al día";

  const proxima = conEstado.find(c => c.estado !== "pagado") || null;

  // Lo que le toca abonar ahora. No es el importe de la cuota a secas: es el
  // acumulado que debería llevar pagado hasta ella, menos lo que lleva pagado
  // de verdad. Así arrastra solo lo que un mes haya quedado corto.
  const totalPagado = pagosPaciente
    ? round2(pagosPaciente.reduce((s, p) => s + (Number(p.amount) || 0), 0))
    : cobrado;
  let aCobrarAhora = 0;
  if (proxima) {
    const esperado = conEstado
      .filter(c => c.vence_el <= proxima.vence_el)
      .reduce((s, c) => s + (Number(c.importe) || 0), 0);
    aCobrarAhora = round2(Math.max(0, esperado - totalPagado));
  }
  const arrastre = proxima ? round2(Math.max(0, aCobrarAhora - (Number(proxima.importe) || 0))) : 0;

  return {
    cuotas: conEstado,
    pagadas: pagadas.length,
    totalCuotas: conEstado.length,
    vencidas,
    proxima,
    diasParaProxima: proxima ? diasEntre(hoy, proxima.vence_el) : null,
    aCobrarAhora,
    arrastre,          // lo que viene de cuotas anteriores pagadas de menos
    totalPagado,
    total, cobrado,
    restante: round2(total - cobrado),
    estado,
  };
}

// Reparte los pagos del paciente sobre las cuotas en orden: una cuota se da por
// cobrada cuando el acumulado pagado llega a cubrir el acumulado esperado hasta
// ella. Devuelve [{cuotaId, paymentId}] solo para las que hay que marcar.
// Nunca desmarca: si algo ya se dio por cobrado, se respeta.
export function conciliarCuotas({ cuotas = [], pagosPaciente = [] }) {
  const orden = [...cuotas].sort((a, b) => a.vence_el.localeCompare(b.vence_el) || a.numero - b.numero);
  const pagos = [...pagosPaciente].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const marcar = [];
  let esperado = 0;
  let i = 0, acumPagado = 0;
  for (const c of orden) {
    esperado += Number(c.importe) || 0;
    while (acumPagado < esperado - 0.005 && i < pagos.length) {
      acumPagado += Number(pagos[i].amount) || 0;
      i++;
    }
    if (acumPagado >= esperado - 0.005 && !c.payment_id && i > 0) {
      marcar.push({ cuotaId: c.id, paymentId: pagos[i - 1].id });
    }
  }
  return marcar;
}

// Tratamientos caros que se hacen pronto y que lo cobrado todavía no cubre.
// Es el aviso que hay que ver ANTES de la cita, no después.
export function coberturaProxima({ plan, cuotas = [], pagos = [], hoy, diasVista = 35 }) {
  const colocacion = plan.colocacion || [];
  if (!colocacion.length || !plan.fecha_inicio) return [];

  const cobradoHoy = cuotas
    .filter(c => estadoCuota(c, pagos, hoy) === "pagado")
    .reduce((s, c) => s + (Number(c.importe) || 0), 0);

  const limite = sumarDias(hoy, diasVista);
  const avisos = [];
  for (const t of colocacion) {
    if (!esCaro(t.nombre)) continue;
    const fecha = addMeses(plan.fecha_inicio, (Number(t.mes) || 1) - 1);
    if (fecha < hoy || fecha > limite) continue;
    // todo lo que estará ejecutado una vez hecho este tratamiento
    const ejecutadoHasta = colocacion
      .filter(x => (Number(x.mes) || 1) <= (Number(t.mes) || 1))
      .reduce((s, x) => s + (Number(x.importe) || 0), 0);
    const falta = ejecutadoHasta - cobradoHoy;
    if (falta > EPS) avisos.push({ nombre: t.nombre, fecha, mes: Number(t.mes) || 1, falta: round2(falta) });
  }
  return avisos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
