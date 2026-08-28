import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  addMeses, sumarDias, cuotaSugerida, totalTratamientos,
  calcPlan, cuotasDelPlan, estadoCuota, resumenPlan, coberturaProxima,
  diasEntre, conciliarCuotas, precioSinDescuento, columnasTablero,
  estadoCobroMeses, vencimientosPorMes, avisosDelDia,
  nombreCortoTratamiento, tratamientosPorMes,
} from "./planCalc.js";

// ─── Fechas ──────────────────────────────────────────────────────────────────
describe("addMeses", () => {
  test("capa al último día del mes destino (31)", () => {
    assert.equal(addMeses("2026-01-31", 1), "2026-02-28");
    assert.equal(addMeses("2026-03-31", 1), "2026-04-30");
    assert.equal(addMeses("2026-05-31", 1), "2026-06-30");
  });

  test("capa también el 29 y el 30, no solo el 31", () => {
    assert.equal(addMeses("2026-01-29", 1), "2026-02-28");
    assert.equal(addMeses("2026-01-30", 1), "2026-02-28");
  });

  test("respeta el 29 de febrero en año bisiesto", () => {
    assert.equal(addMeses("2028-01-31", 1), "2028-02-29");
    assert.equal(addMeses("2028-01-29", 1), "2028-02-29");
  });

  test("no toca los días que caben", () => {
    assert.equal(addMeses("2026-01-15", 0), "2026-01-15");
    assert.equal(addMeses("2026-01-15", 1), "2026-02-15");
    assert.equal(addMeses("2026-01-31", 12), "2027-01-31");
  });

  test("cruza el fin de año", () => {
    assert.equal(addMeses("2026-11-15", 2), "2027-01-15");
    assert.equal(addMeses("2026-12-31", 1), "2027-01-31");
    assert.equal(addMeses("2026-01-15", -1), "2025-12-15");
  });

  test("un plan de 12 meses desde fin de enero no se desborda nunca", () => {
    const venc = Array.from({ length: 12 }, (_, i) => addMeses("2026-01-31", i));
    assert.deepEqual(venc, [
      "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30",
      "2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31",
      "2026-09-30", "2026-10-31", "2026-11-30", "2026-12-31",
    ]);
  });
});

// ─── Cuota sugerida ──────────────────────────────────────────────────────────
describe("cuotaSugerida", () => {
  test("reparte lo que queda tras la entrega", () => {
    assert.equal(cuotaSugerida(5000, 1000, 5), 800);
    assert.equal(cuotaSugerida(2800, 500, 5), 460);
  });

  test("redondea a dos decimales", () => {
    assert.equal(cuotaSugerida(1000, 0, 3), 333.33);
  });

  test("sin cuotas devuelve 0 en vez de dividir por cero", () => {
    assert.equal(cuotaSugerida(5000, 0, 0), 0);
  });

  test("nunca devuelve negativo aunque la entrega supere el total", () => {
    assert.equal(cuotaSugerida(1000, 2000, 4), 0);
  });
});

// ─── Modo visita ─────────────────────────────────────────────────────────────
describe("calcPlan · modo visita", () => {
  const tx = [
    { id: "a", nombre: "LIMPIEZA",  importe: 500,  mes: 1 },
    { id: "b", nombre: "ENDODONCIA", importe: 1000, mes: 2 },
    { id: "c", nombre: "IMPLANTE",   importe: 2000, mes: 3 },
  ];

  test("sin entrega paga exactamente lo que se ejecuta cada mes", () => {
    const r = calcPlan({ tratamientos: tx, nMeses: 6, modo: "visita" });
    assert.deepEqual(r.porMes, [500, 1000, 2000, 0, 0, 0]);
    assert.deepEqual(r.ejecutado, [500, 1000, 2000, 0, 0, 0]);
    assert.equal(r.totalPlan, 3500);
    assert.equal(r.totalTratamiento, 3500);
  });

  test("sin entrega nunca hay descubierto: se paga al ejecutar", () => {
    const r = calcPlan({ tratamientos: tx, nMeses: 6, modo: "visita" });
    assert.deepEqual(r.descubiertos, []);
    assert.equal(r.peorDescubierto, 0);
  });

  test("la entrega adelanta los primeros meses sin cambiar el total", () => {
    const r = calcPlan({ tratamientos: tx, nMeses: 6, modo: "visita", entrega: 800 });
    // 800 cubren los 500 del mes 1 y 300 del mes 2; la entrega se cobra en el mes 1
    assert.deepEqual(r.porMes, [800, 700, 2000, 0, 0, 0]);
    assert.equal(r.totalPlan, 3500);
    assert.equal(r.diferencia, 0);
  });

  test("entrega mayor que el tratamiento: el plan cobra de más y lo avisa", () => {
    const r = calcPlan({
      tratamientos: [{ id: "a", importe: 500, mes: 1 }],
      nMeses: 3, modo: "visita", entrega: 800,
    });
    assert.equal(r.totalPlan, 800);
    assert.equal(r.totalTratamiento, 500);
    assert.equal(r.diferencia, 300);
  });

  test("marca los meses que superan el techo", () => {
    const r = calcPlan({ tratamientos: tx, nMeses: 6, modo: "visita", techoMes: 900 });
    assert.deepEqual(r.sobreTecho, [{ mes: 2, importe: 1000 }, { mes: 3, importe: 2000 }]);
  });

  test("sin techo no marca nada", () => {
    const r = calcPlan({ tratamientos: tx, nMeses: 6, modo: "visita", techoMes: 0 });
    assert.deepEqual(r.sobreTecho, []);
  });
});

// ─── Modo cuotas ─────────────────────────────────────────────────────────────
describe("calcPlan · modo cuotas", () => {
  const base = {
    nMeses: 6, modo: "cuotas",
    entrega: 500, nCuotas: 5, importeCuota: 500, mesInicioCuotas: 2,
  };

  test("la columna del mes muestra la cuota, no el coste ejecutado", () => {
    const r = calcPlan({
      ...base,
      tratamientos: [{ id: "i", importe: 2000, mes: 3 }],
    });
    assert.deepEqual(r.porMes, [500, 500, 500, 500, 500, 500]);
    assert.deepEqual(r.ejecutado, [0, 0, 2000, 0, 0, 0]);
  });

  test("avisa cuando el plan cobra por encima del presupuesto", () => {
    const r = calcPlan({
      ...base,
      tratamientos: [{ id: "i", importe: 2000, mes: 3 }, { id: "c", importe: 800, mes: 5 }],
    });
    assert.equal(r.totalPlan, 3000);
    assert.equal(r.totalTratamiento, 2800);
    assert.equal(r.diferencia, 200);
  });

  test("detecta cuotas que caen fuera del tablero", () => {
    const r = calcPlan({ ...base, nCuotas: 6, tratamientos: [] });
    assert.equal(r.cuotasFueraDeTablero, true);
    // la sexta cuota no se suma a ningún mes visible
    assert.equal(r.totalPlan, 3000);
  });

  test("no avisa si las cuotas entran justo", () => {
    const r = calcPlan({ ...base, tratamientos: [] });
    assert.equal(r.cuotasFueraDeTablero, false);
  });
});

// ─── Cobertura acumulada: la razón de ser de la herramienta ──────────────────
describe("calcPlan · descubiertos acumulados", () => {
  const base = {
    nMeses: 6, modo: "cuotas",
    entrega: 500, nCuotas: 5, importeCuota: 500, mesInicioCuotas: 2,
  };
  // cobrado acumulado: [500, 1000, 1500, 2000, 2500, 3000]

  test("un implante caro demasiado pronto queda descubierto", () => {
    const r = calcPlan({
      ...base,
      tratamientos: [{ id: "i", importe: 2000, mes: 3 }, { id: "c", importe: 800, mes: 5 }],
    });
    assert.deepEqual(r.cobradoAcum,   [500, 1000, 1500, 2000, 2500, 3000]);
    assert.deepEqual(r.ejecutadoAcum, [0, 0, 2000, 2000, 2800, 2800]);
    assert.deepEqual(r.descubiertos, [
      { mes: 3, falta: 500 },   // 2000 ejecutado contra 1500 cobrado
      { mes: 5, falta: 300 },   // 2800 ejecutado contra 2500 cobrado
    ]);
    assert.equal(r.peorDescubierto, 500);
  });

  test("moviendo el implante un mes más adelante desaparece el descubierto", () => {
    const r = calcPlan({
      ...base,
      tratamientos: [{ id: "i", importe: 2000, mes: 4 }, { id: "c", importe: 800, mes: 6 }],
    });
    assert.deepEqual(r.ejecutadoAcum, [0, 0, 0, 2000, 2000, 2800]);
    assert.deepEqual(r.descubiertos, []);
    assert.equal(r.peorDescubierto, 0);
  });

  test("solo señala meses que tienen tratamiento colocado", () => {
    // el mes 2 arrastra déficit, pero no hay nada que hacer ese mes
    const r = calcPlan({
      nMeses: 4, modo: "cuotas",
      entrega: 0, nCuotas: 4, importeCuota: 100, mesInicioCuotas: 1,
      tratamientos: [{ id: "x", importe: 1000, mes: 4 }],
    });
    assert.deepEqual(r.descubiertos, [{ mes: 4, falta: 600 }]);
  });

  test("ignora diferencias de céntimos por redondeo", () => {
    const r = calcPlan({
      nMeses: 2, modo: "cuotas",
      entrega: 0, nCuotas: 2, importeCuota: 500, mesInicioCuotas: 1,
      tratamientos: [{ id: "x", importe: 500.2, mes: 1 }],
    });
    assert.deepEqual(r.descubiertos, []);
  });

  test("cubierto exacto no cuenta como descubierto", () => {
    const r = calcPlan({
      nMeses: 2, modo: "cuotas",
      entrega: 1000, nCuotas: 0, importeCuota: 0, mesInicioCuotas: 2,
      tratamientos: [{ id: "x", importe: 1000, mes: 1 }],
    });
    assert.deepEqual(r.descubiertos, []);
  });
});

// ─── Caso comercial real: cuota manual por encima de la calculada ───────────
// Es el escenario habitual y el número que se le muestra al paciente, así que
// no puede mentir: la financiera pone su cuota con intereses, el usuario la
// escribe a mano y el motor tiene que respetarla tal cual.
describe("calcPlan · cuota manual por encima de la sugerida", () => {
  const tratamientos = [
    { id: "i1", nombre: "IMPLANTE ESTANDAR",       importe: 764.15, mes: 1 },
    { id: "i2", nombre: "IMPLANTE ESTANDAR",       importe: 764.15, mes: 1 },
    { id: "in", nombre: "INJERTO OSEO",            importe: 428.75, mes: 1 },
    { id: "es", nombre: "ESTUDIO IMPLANTOLOGICO",  importe: 400.00, mes: 1 },
    { id: "co", nombre: "CORONA SOBRE IMPLANTE",   importe: 828.75, mes: 4 },
    { id: "li", nombre: "LIMPIEZA BUCAL",          importe: 182.75, mes: 6 },
  ];
  const plan = {
    nMeses: 6, modo: "cuotas",
    entrega: 2000, nCuotas: 5, importeCuota: 426.74, mesInicioCuotas: 2,
  };

  test("el presupuesto suma 3.368,55 €", () => {
    assert.equal(totalTratamientos(tratamientos), 3368.55);
  });

  test("la cuota sugerida sería 273,71 €, muy por debajo de la real", () => {
    assert.equal(cuotaSugerida(3368.55, 2000, 5), 273.71);
  });

  test("el motor respeta la cuota escrita a mano, no la recalcula", () => {
    const r = calcPlan({ ...plan, tratamientos });
    assert.deepEqual(r.porMes, [2000, 426.74, 426.74, 426.74, 426.74, 426.74]);
  });

  test("el plan cobra 4.133,70 €: 765,15 € por encima del presupuesto", () => {
    const r = calcPlan({ ...plan, tratamientos });
    assert.equal(r.totalPlan, 4133.70);
    assert.equal(r.totalTratamiento, 3368.55);
    assert.equal(r.diferencia, 765.15);
  });

  test("con todo en el mes 1 hay un descubierto de 357,05 €", () => {
    const r = calcPlan({ ...plan, tratamientos });
    // en el mes 1 solo se ha cobrado la entrega
    assert.equal(r.cobradoAcum[0], 2000);
    assert.equal(r.ejecutadoAcum[0], 2357.05);
    assert.deepEqual(r.descubiertos, [{ mes: 1, falta: 357.05 }]);
    assert.equal(r.peorDescubierto, 357.05);
  });

  test("moviendo el estudio de 400 € al mes 2 desaparece el descubierto", () => {
    const movido = tratamientos.map(t => t.id === "es" ? { ...t, mes: 2 } : t);
    const r = calcPlan({ ...plan, tratamientos: movido });
    assert.equal(r.ejecutadoAcum[0], 1957.05);   // contra 2000 cobrados
    assert.equal(r.ejecutadoAcum[1], 2357.05);   // contra 2426,74 cobrados
    assert.deepEqual(r.descubiertos, []);
    assert.equal(r.peorDescubierto, 0);
  });

  test("mover el tratamiento no cambia el total del plan ni la diferencia", () => {
    const movido = tratamientos.map(t => t.id === "es" ? { ...t, mes: 2 } : t);
    const r = calcPlan({ ...plan, tratamientos: movido });
    assert.equal(r.totalPlan, 4133.70);
    assert.equal(r.diferencia, 765.15);
  });

  test("los acumulados no arrastran error de coma flotante", () => {
    const r = calcPlan({ ...plan, tratamientos });
    assert.deepEqual(r.cobradoAcum, [2000, 2426.74, 2853.48, 3280.22, 3706.96, 4133.70]);
    assert.deepEqual(r.ejecutadoAcum, [2357.05, 2357.05, 2357.05, 3185.80, 3185.80, 3368.55]);
  });
});

// ─── minMeses (bloqueo del botón "−") ────────────────────────────────────────
describe("calcPlan · minMeses", () => {
  test("no deja quitar el mes donde hay un tratamiento", () => {
    const r = calcPlan({
      tratamientos: [{ id: "a", importe: 100, mes: 5 }], nMeses: 6, modo: "visita",
    });
    assert.equal(r.minMeses, 5);
  });

  test("no deja quitar meses con cuotas pendientes", () => {
    const r = calcPlan({
      tratamientos: [], nMeses: 8, modo: "cuotas",
      nCuotas: 5, importeCuota: 100, mesInicioCuotas: 3,
    });
    assert.equal(r.minMeses, 7);   // cuotas del mes 3 al 7
  });

  test("nunca baja de 2", () => {
    const r = calcPlan({ tratamientos: [], nMeses: 6, modo: "visita" });
    assert.equal(r.minMeses, 2);
  });
});

// ─── Calendario de cobros ────────────────────────────────────────────────────
describe("cuotasDelPlan", () => {
  test("modo cuotas: entrega + vencimientos mensuales sin desbordar", () => {
    const plan = {
      modo: "cuotas", fecha_inicio: "2026-01-31",
      entrega: 500, n_cuotas: 3, importe_cuota: 800, mes_inicio_cuotas: 2,
    };
    const calc = calcPlan({
      tratamientos: [], nMeses: 6, modo: "cuotas",
      entrega: 500, nCuotas: 3, importeCuota: 800, mesInicioCuotas: 2,
    });
    assert.deepEqual(cuotasDelPlan(plan, calc), [
      { numero: 0, concepto: "entrega", mes: 1, vence_el: "2026-01-31", importe: 500 },
      { numero: 1, concepto: "cuota",   mes: 2, vence_el: "2026-02-28", importe: 800 },
      { numero: 2, concepto: "cuota",   mes: 3, vence_el: "2026-03-31", importe: 800 },
      { numero: 3, concepto: "cuota",   mes: 4, vence_el: "2026-04-30", importe: 800 },
    ]);
  });

  test("modo cuotas sin entrega no genera la fila de entrega", () => {
    const plan = {
      modo: "cuotas", fecha_inicio: "2026-03-10",
      entrega: 0, n_cuotas: 2, importe_cuota: 300, mes_inicio_cuotas: 1,
    };
    const calc = calcPlan({
      tratamientos: [], nMeses: 4, modo: "cuotas",
      entrega: 0, nCuotas: 2, importeCuota: 300, mesInicioCuotas: 1,
    });
    const filas = cuotasDelPlan(plan, calc);
    assert.equal(filas.length, 2);
    assert.equal(filas[0].concepto, "cuota");
    assert.equal(filas[0].vence_el, "2026-03-10");
    assert.equal(filas[1].vence_el, "2026-04-10");
  });

  test("modo visita: una fila por mes en que el paciente paga", () => {
    const tratamientos = [
      { id: "a", importe: 500,  mes: 1 },
      { id: "b", importe: 1000, mes: 3 },
    ];
    const calc = calcPlan({ tratamientos, nMeses: 4, modo: "visita" });
    const plan = { modo: "visita", fecha_inicio: "2026-01-15", entrega: 0 };
    assert.deepEqual(cuotasDelPlan(plan, calc), [
      { numero: 1, concepto: "visita", mes: 1, vence_el: "2026-01-15", importe: 500 },
      { numero: 2, concepto: "visita", mes: 3, vence_el: "2026-03-15", importe: 1000 },
    ]);
  });

  test("modo visita con entrega: el primer cobro se marca como entrega", () => {
    const tratamientos = [{ id: "a", importe: 500, mes: 2 }];
    const calc = calcPlan({ tratamientos, nMeses: 3, modo: "visita", entrega: 200 });
    const plan = { modo: "visita", fecha_inicio: "2026-01-15", entrega: 200 };
    const filas = cuotasDelPlan(plan, calc);
    assert.equal(filas[0].concepto, "entrega");
    assert.equal(filas[0].importe, 200);
  });
});

// ─── Estado de cuota ─────────────────────────────────────────────────────────
describe("estadoCuota", () => {
  const hoy = "2026-08-26";
  const pagos = [{ id: "p1", amount: 800 }];

  test("pagada si el pago vinculado existe", () => {
    assert.equal(estadoCuota({ payment_id: "p1", vence_el: "2026-01-01" }, pagos, hoy), "pagado");
  });

  test("vencida si pasó la fecha y no hay pago", () => {
    assert.equal(estadoCuota({ payment_id: null, vence_el: "2026-08-25" }, pagos, hoy), "vencido");
  });

  test("pendiente si vence hoy o más adelante", () => {
    assert.equal(estadoCuota({ payment_id: null, vence_el: "2026-08-26" }, pagos, hoy), "pendiente");
    assert.equal(estadoCuota({ payment_id: null, vence_el: "2026-09-30" }, pagos, hoy), "pendiente");
  });

  test("si el pago vinculado se borró desde Cobros, vuelve a contar como impaga", () => {
    assert.equal(estadoCuota({ payment_id: "borrado", vence_el: "2026-08-25" }, pagos, hoy), "vencido");
    assert.equal(estadoCuota({ payment_id: "borrado", vence_el: "2026-09-30" }, pagos, hoy), "pendiente");
  });
});

// ─── Seguimiento de planes acordados ─────────────────────────────────────────
describe("sumarDias", () => {
  test("cruza fin de mes y fin de año", () => {
    assert.equal(sumarDias("2026-08-26", 35), "2026-09-30");
    assert.equal(sumarDias("2026-12-20", 15), "2027-01-04");
    assert.equal(sumarDias("2028-02-28", 1),  "2028-02-29");
  });
});

describe("resumenPlan", () => {
  const hoy = "2026-08-26";
  const plan = { id:"p1", estado:"activo" };
  const cuotas = [
    { id:"c0", numero:0, concepto:"entrega", mes:1, vence_el:"2026-05-31", importe:2000, payment_id:"pg1" },
    { id:"c1", numero:1, concepto:"cuota",   mes:2, vence_el:"2026-06-30", importe:426.74, payment_id:"pg2" },
    { id:"c2", numero:2, concepto:"cuota",   mes:3, vence_el:"2026-07-31", importe:426.74, payment_id:null },
    { id:"c3", numero:3, concepto:"cuota",   mes:4, vence_el:"2026-09-30", importe:426.74, payment_id:null },
  ];
  const pagos = [{ id:"pg1", amount:2000 }, { id:"pg2", amount:426.74 }];

  test("cuenta pagadas sobre el total y lo que queda por cobrar", () => {
    const r = resumenPlan({ plan, cuotas, pagos, hoy });
    assert.equal(r.pagadas, 2);
    assert.equal(r.totalCuotas, 4);
    assert.equal(r.total, 3280.22);
    assert.equal(r.cobrado, 2426.74);
    assert.equal(r.restante, 853.48);
  });

  test("marca atrasado si hay una cuota vencida sin cobrar", () => {
    const r = resumenPlan({ plan, cuotas, pagos, hoy });
    assert.equal(r.estado, "atrasado");
    assert.deepEqual(r.vencidas.map(c => c.id), ["c2"]);
  });

  test("la próxima cuota es la primera sin cobrar, por vencimiento", () => {
    const r = resumenPlan({ plan, cuotas, pagos, hoy });
    assert.equal(r.proxima.id, "c2");
    assert.equal(r.proxima.vence_el, "2026-07-31");
  });

  test("al día cuando nada vencido está impago", () => {
    const alDia = cuotas.map(c => c.id === "c2" ? { ...c, payment_id:"pg3" } : c);
    const r = resumenPlan({ plan, cuotas: alDia, pagos: [...pagos, { id:"pg3", amount:426.74 }], hoy });
    assert.equal(r.estado, "al día");
    assert.equal(r.proxima.id, "c3");
  });

  test("terminado cuando están todas cobradas", () => {
    const todas = cuotas.map(c => ({ ...c, payment_id:"pgX" }));
    const r = resumenPlan({ plan, cuotas: todas, pagos: [{ id:"pgX", amount:1 }], hoy });
    assert.equal(r.estado, "terminado");
    assert.equal(r.proxima, null);
    assert.equal(r.restante, 0);
  });

  test("un plan cancelado no se reporta como atrasado", () => {
    const r = resumenPlan({ plan: { ...plan, estado:"cancelado" }, cuotas, pagos, hoy });
    assert.equal(r.estado, "cancelado");
  });

  test("un borrador tampoco: todavía no es un compromiso de cobro", () => {
    const r = resumenPlan({ plan: { ...plan, estado:"borrador" }, cuotas, pagos, hoy });
    assert.equal(r.estado, "borrador");
    // pero sus importes se siguen calculando, para poder mostrarlos
    assert.equal(r.cobrado, 2426.74);
    assert.equal(r.restante, 853.48);
  });

  test("si el pago vinculado se borró desde Cobros, la cuota vuelve a contar", () => {
    const r = resumenPlan({ plan, cuotas, pagos: [{ id:"pg1", amount:2000 }], hoy });
    assert.equal(r.pagadas, 1);
    assert.equal(r.cobrado, 2000);
    assert.equal(r.vencidas.length, 2);   // c1 y c2
  });

  test("un plan sin cuotas no explota", () => {
    const r = resumenPlan({ plan, cuotas: [], pagos: [], hoy });
    assert.equal(r.totalCuotas, 0);
    assert.equal(r.proxima, null);
    assert.equal(r.estado, "al día");
  });
});

describe("coberturaProxima", () => {
  const hoy = "2026-08-26";
  // mes 1 = 2026-07-15 · mes 2 = 15/08 · mes 3 = 15/09 · mes 4 = 15/10
  const plan = {
    fecha_inicio: "2026-07-15",
    colocacion: [
      { tx_id:"a", nombre:"LIMPIEZA BUCAL",        importe:100,  mes:1 },
      { tx_id:"b", nombre:"IMPLANTE ESTANDAR",     importe:2000, mes:3 },
      { tx_id:"c", nombre:"CORONA SOBRE IMPLANTE", importe:800,  mes:6 },
    ],
  };
  const cuotas = [
    { id:"c0", numero:0, vence_el:"2026-07-15", importe:500, payment_id:"pg1" },
    { id:"c1", numero:1, vence_el:"2026-08-15", importe:500, payment_id:"pg2" },
    { id:"c2", numero:2, vence_el:"2026-09-15", importe:500, payment_id:null },
  ];
  const pagos = [{ id:"pg1" }, { id:"pg2" }];

  test("avisa del implante del mes que viene si no está cubierto", () => {
    const av = coberturaProxima({ plan, cuotas, pagos, hoy });
    assert.equal(av.length, 1);
    assert.equal(av[0].nombre, "IMPLANTE ESTANDAR");
    assert.equal(av[0].fecha, "2026-09-15");
    // ejecutado hasta el mes 3 = 2100, cobrado = 1000
    assert.equal(av[0].falta, 1100);
  });

  test("no avisa si ya está cobrado de sobra", () => {
    const cobradas = cuotas.map(c => ({ ...c, payment_id:"pgX", importe:2000 }));
    const av = coberturaProxima({ plan, cuotas: cobradas, pagos: [{ id:"pgX" }], hoy });
    assert.deepEqual(av, []);
  });

  test("no mira tratamientos que caen fuera de la ventana", () => {
    // la corona del mes 6 vence en diciembre: todavía no es asunto de hoy
    const av = coberturaProxima({ plan, cuotas, pagos, hoy });
    assert.equal(av.some(a => a.nombre.includes("CORONA")), false);
  });

  test("ignora los tratamientos baratos aunque estén descubiertos", () => {
    const soloLimpieza = { ...plan, colocacion: [{ tx_id:"a", nombre:"LIMPIEZA BUCAL", importe:5000, mes:3 }] };
    const av = coberturaProxima({ plan: soloLimpieza, cuotas, pagos, hoy });
    assert.deepEqual(av, []);
  });

  test("no mira hacia atrás: lo del mes pasado ya pasó", () => {
    const atras = { ...plan, colocacion: [{ tx_id:"b", nombre:"IMPLANTE ESTANDAR", importe:9000, mes:1 }] };
    const av = coberturaProxima({ plan: atras, cuotas, pagos, hoy });
    assert.deepEqual(av, []);
  });

  test("un plan sin colocación ni fecha no explota", () => {
    assert.deepEqual(coberturaProxima({ plan: {}, cuotas, pagos, hoy }), []);
    assert.deepEqual(coberturaProxima({ plan: { fecha_inicio:"2026-07-15" }, cuotas, pagos, hoy }), []);
  });
});

// ─── Recordatorio de cuota: cuánto le toca abonar de verdad ─────────────────
describe("diasEntre", () => {
  test("cuenta días hacia adelante y hacia atrás", () => {
    assert.equal(diasEntre("2026-08-26", "2026-08-31"), 5);
    assert.equal(diasEntre("2026-08-26", "2026-08-26"), 0);
    assert.equal(diasEntre("2026-08-26", "2026-08-20"), -6);
  });

  test("cruza meses y años sin errores de huso", () => {
    assert.equal(diasEntre("2026-08-26", "2026-09-01"), 6);
    assert.equal(diasEntre("2026-12-28", "2027-01-04"), 7);
    assert.equal(diasEntre("2028-02-28", "2028-03-01"), 2);   // bisiesto
  });
});

describe("resumenPlan · importe a recordar con arrastre", () => {
  const hoy = "2026-08-26";
  const plan = { id:"p1", estado:"activo" };
  const cuotas = [
    { id:"c1", numero:1, concepto:"cuota", mes:1, vence_el:"2026-06-30", importe:500, payment_id:"pg1" },
    { id:"c2", numero:2, concepto:"cuota", mes:2, vence_el:"2026-07-31", importe:500, payment_id:"pg2" },
    { id:"c3", numero:3, concepto:"cuota", mes:3, vence_el:"2026-09-30", importe:500, payment_id:null },
  ];

  test("si pagó todo al día, toca solo la cuota", () => {
    const pagosPaciente = [{ id:"pg1", amount:500, date:"2026-06-30" }, { id:"pg2", amount:500, date:"2026-07-31" }];
    const r = resumenPlan({ plan, cuotas, pagos: pagosPaciente, pagosPaciente, hoy });
    assert.equal(r.aCobrarAhora, 500);
    assert.equal(r.arrastre, 0);
  });

  test("si un mes pagó de menos, la próxima arrastra la diferencia", () => {
    // en la segunda cuota abonó 350 en vez de 500
    const pagosPaciente = [{ id:"pg1", amount:500, date:"2026-06-30" }, { id:"pg2", amount:350, date:"2026-07-31" }];
    const r = resumenPlan({ plan, cuotas, pagos: pagosPaciente, pagosPaciente, hoy });
    assert.equal(r.aCobrarAhora, 650);   // 500 de la cuota 3 + 150 que faltaron
    assert.equal(r.arrastre, 150);
  });

  test("si pagó de más, la próxima cuota se descuenta", () => {
    const pagosPaciente = [{ id:"pg1", amount:500, date:"2026-06-30" }, { id:"pg2", amount:800, date:"2026-07-31" }];
    const r = resumenPlan({ plan, cuotas, pagos: pagosPaciente, pagosPaciente, hoy });
    assert.equal(r.aCobrarAhora, 200);
    assert.equal(r.arrastre, 0);
  });

  test("nunca pide un importe negativo", () => {
    const pagosPaciente = [{ id:"pg1", amount:5000, date:"2026-06-30" }, { id:"pg2", amount:0, date:"2026-07-31" }];
    const r = resumenPlan({ plan, cuotas, pagos: pagosPaciente, pagosPaciente, hoy });
    assert.equal(r.aCobrarAhora, 0);
  });

  test("informa cuántos días faltan para el vencimiento", () => {
    const pagosPaciente = [{ id:"pg1", amount:500, date:"2026-06-30" }, { id:"pg2", amount:500, date:"2026-07-31" }];
    const r = resumenPlan({ plan, cuotas, pagos: pagosPaciente, pagosPaciente, hoy });
    assert.equal(r.proxima.id, "c3");
    assert.equal(r.diasParaProxima, 35);
  });

  test("días negativos cuando la cuota ya venció", () => {
    const vencida = cuotas.map(c => c.id === "c3" ? { ...c, vence_el:"2026-08-20" } : c);
    const pagosPaciente = [{ id:"pg1", amount:500, date:"2026-06-30" }, { id:"pg2", amount:500, date:"2026-07-31" }];
    const r = resumenPlan({ plan, cuotas: vencida, pagos: pagosPaciente, pagosPaciente, hoy });
    assert.equal(r.proxima.id, "c3");
    assert.equal(r.diasParaProxima, -6);
  });
});

describe("conciliarCuotas", () => {
  const cuotas = [
    { id:"c1", numero:1, vence_el:"2026-06-30", importe:500, payment_id:null },
    { id:"c2", numero:2, vence_el:"2026-07-31", importe:500, payment_id:null },
    { id:"c3", numero:3, vence_el:"2026-08-31", importe:500, payment_id:null },
  ];

  test("marca las cuotas que el acumulado pagado ya cubre", () => {
    const pagosPaciente = [{ id:"pg1", amount:500, date:"2026-06-30" }, { id:"pg2", amount:500, date:"2026-07-31" }];
    assert.deepEqual(conciliarCuotas({ cuotas, pagosPaciente }), [
      { cuotaId:"c1", paymentId:"pg1" },
      { cuotaId:"c2", paymentId:"pg2" },
    ]);
  });

  test("un pago grande salda varias cuotas de una vez", () => {
    const pagosPaciente = [{ id:"pg1", amount:1200, date:"2026-06-30" }];
    const r = conciliarCuotas({ cuotas, pagosPaciente });
    assert.deepEqual(r.map(x => x.cuotaId), ["c1","c2"]);
    assert.equal(r[0].paymentId, "pg1");
  });

  test("un pago corto no da por cobrada la cuota", () => {
    const pagosPaciente = [{ id:"pg1", amount:350, date:"2026-06-30" }];
    assert.deepEqual(conciliarCuotas({ cuotas, pagosPaciente }), []);
  });

  test("no vuelve a marcar lo que ya estaba vinculado", () => {
    const yaMarcada = cuotas.map(c => c.id === "c1" ? { ...c, payment_id:"viejo" } : c);
    const pagosPaciente = [{ id:"pg1", amount:1000, date:"2026-06-30" }];
    assert.deepEqual(conciliarCuotas({ cuotas: yaMarcada, pagosPaciente }).map(x => x.cuotaId), ["c2"]);
  });

  test("sin pagos no marca nada", () => {
    assert.deepEqual(conciliarCuotas({ cuotas, pagosPaciente: [] }), []);
  });

  test("tolera centimos de redondeo", () => {
    const c = [{ id:"c1", numero:1, vence_el:"2026-06-30", importe:426.74, payment_id:null }];
    const pagosPaciente = [{ id:"pg1", amount:426.74, date:"2026-06-30" }];
    assert.equal(conciliarCuotas({ cuotas: c, pagosPaciente }).length, 1);
  });
});

describe("precioSinDescuento", () => {
  test("deshace el descuento del PDF y devuelve el precio de tarifa", () => {
    // caso real: corona con 10% de dto. guardada como 535,50
    assert.equal(precioSinDescuento(535.5, 10), 595);
    assert.equal(precioSinDescuento(45, 10), 50);
    assert.equal(precioSinDescuento(445.5, 10), 495);
  });

  test("es la inversa exacta de aplicar el descuento", () => {
    const tarifa = 764.15;
    for (const dto of [5, 10, 15, 20, 25]) {
      const neto = Math.round(tarifa * (1 - dto/100) * 100) / 100;
      assert.ok(Math.abs(precioSinDescuento(neto, dto) - tarifa) < 0.02, `dto ${dto}`);
    }
  });

  test("sin descuento devuelve el mismo importe", () => {
    assert.equal(precioSinDescuento(535.5, 0), 535.5);
    assert.equal(precioSinDescuento(535.5, null), 535.5);
  });

  test("no divide por cero con un descuento del 100%", () => {
    assert.equal(precioSinDescuento(535.5, 100), 535.5);
  });
});

describe("columnasTablero", () => {
  test("13 meses van 7+6, no 6+6+1 con el último suelto", () => {
    assert.equal(columnasTablero(13), 7);
  });

  test("hasta 7 caben en una sola fila", () => {
    for (let n = 1; n <= 7; n++) assert.equal(columnasTablero(n), n <= 7 ? n : 7);
  });

  test("reparte en filas equilibradas y nunca deja una fila de uno", () => {
    for (let n = 1; n <= 24; n++) {
      const cols = columnasTablero(n);
      const filas = Math.ceil(n / cols);
      const ultima = n - cols * (filas - 1);
      assert.ok(cols <= 7, `n=${n} cols=${cols}`);
      assert.ok(filas === 1 || ultima > 1, `n=${n} deja una fila de ${ultima}`);
    }
  });

  test("casos concretos", () => {
    assert.equal(columnasTablero(6), 6);
    assert.equal(columnasTablero(12), 6);
    assert.equal(columnasTablero(14), 7);
    assert.equal(columnasTablero(24), 6);
  });
});

// ─── Estado de cobro mes a mes, tal como se ve en la línea de tiempo ─────────
describe("estadoCobroMeses", () => {
  // entrega de 2.000 y tres cuotas de 104,68, como el plan real
  const cuotas = [
    { numero: 0, concepto: "entrega", mes: 1, vence_el: "2026-08-27", importe: 2000 },
    { numero: 1, concepto: "cuota",   mes: 2, vence_el: "2026-09-27", importe: 104.68 },
    { numero: 2, concepto: "cuota",   mes: 3, vence_el: "2026-10-27", importe: 104.68 },
    { numero: 3, concepto: "cuota",   mes: 4, vence_el: "2026-11-27", importe: 104.68 },
  ];
  const pagos = (...xs) => xs.map(amount => ({ amount }));
  const vista = (r) => r.meses.map(m =>
    m.estado === "pagado" ? "Pagado" : m.estado === "vencido" ? "Vencido" : m.aPagar);

  test("la cuota es fija: los meses no van subiendo", () => {
    const r = estadoCobroMeses({ cuotas, pagosPaciente: [], hoy: "2026-08-27" });
    assert.deepEqual(vista(r), [2000, 104.68, 104.68, 104.68]);
    const soloCuotas = vista(r).slice(1);
    assert.equal(new Set(soloCuotas).size, 1, "las cuotas no pueden ir subiendo");
  });

  test("sin fecha no hay vencidos: es el plan recién diseñado", () => {
    const r = estadoCobroMeses({ cuotas, pagosPaciente: [] });
    assert.deepEqual(vista(r), [2000, 104.68, 104.68, 104.68]);
  });

  test("cobrada la entrega, ese mes queda pagado y el resto no se mueve", () => {
    const r = estadoCobroMeses({ cuotas, pagosPaciente: pagos(2000), hoy: "2026-09-01" });
    assert.deepEqual(vista(r), ["Pagado", 104.68, 104.68, 104.68]);
    assert.equal(r.pendienteTotal, 314.04);
  });

  test("pagó de menos y el mes venció: se marca vencido y falta pasa al siguiente", () => {
    // 1.900 de los 2.000 → faltan 100
    const r = estadoCobroMeses({ cuotas, pagosPaciente: pagos(1900), hoy: "2026-09-01" });
    assert.deepEqual(vista(r), ["Vencido", 204.68, 104.68, 104.68]);
    assert.equal(r.meses[1].arrastre, 100);
    assert.equal(r.arrastre, 100);
  });

  test("el arrastre no se cobra dos veces: solo en el mes destino", () => {
    const r = estadoCobroMeses({ cuotas, pagosPaciente: pagos(1900), hoy: "2026-09-01" });
    assert.deepEqual(r.meses.map(m => m.arrastre), [0, 100, 0, 0]);
    // lo pendiente sigue cuadrando con el plan menos lo pagado
    assert.equal(r.pendienteTotal, 414.04);
  });

  test("varios pagos parciales se suman antes de imputarse", () => {
    const r = estadoCobroMeses({ cuotas, pagosPaciente: pagos(1000, 900), hoy: "2026-09-01" });
    assert.deepEqual(vista(r), ["Vencido", 204.68, 104.68, 104.68]);
  });

  test("pagó de más: el sobrante va descontando las cuotas siguientes", () => {
    // 2.200 → cubre la entrega, la cuota 2 entera y 95,32 de la cuota 3
    const r = estadoCobroMeses({ cuotas, pagosPaciente: pagos(2200), hoy: "2026-09-01" });
    assert.deepEqual(vista(r), ["Pagado", "Pagado", 9.36, 104.68]);
  });

  test("pagado justo el total: todo pagado", () => {
    const r = estadoCobroMeses({ cuotas, pagosPaciente: pagos(2314.04), hoy: "2026-12-01" });
    assert.deepEqual(vista(r), ["Pagado", "Pagado", "Pagado", "Pagado"]);
    assert.equal(r.todoPagado, true);
    assert.equal(r.pendienteTotal, 0);
  });

  test("faltando céntimos no se da por pagado", () => {
    const r = estadoCobroMeses({ cuotas, pagosPaciente: pagos(2313.40), hoy: "2026-12-01" });
    assert.equal(r.todoPagado, false);
    assert.equal(r.pendienteTotal, 0.64);
  });

  test("pagar de más de la cuenta no deja saldo negativo", () => {
    const r = estadoCobroMeses({ cuotas, pagosPaciente: pagos(9999), hoy: "2026-12-01" });
    assert.equal(r.pendienteTotal, 0);
    assert.equal(r.todoPagado, true);
  });

  test("con todo vencido, el último mes concentra lo que se debe", () => {
    const r = estadoCobroMeses({ cuotas, pagosPaciente: [], hoy: "2027-01-01" });
    assert.deepEqual(r.meses.map(m => m.estado),
      ["vencido", "vencido", "vencido", "vencido"]);
    // los tres primeros sin importe, el último con la suma entera
    assert.deepEqual(r.meses.map(m => m.aPagar), [0, 0, 0, 2314.04]);
    assert.equal(r.pendienteTotal, 2314.04);
  });

  test("todo vencido con algo pagado: el último concentra solo lo que falta", () => {
    const r = estadoCobroMeses({ cuotas, pagosPaciente: pagos(2000), hoy: "2027-01-01" });
    assert.deepEqual(r.meses.map(m => m.aPagar), [0, 0, 0, 314.04]);
    assert.equal(r.meses[0].estado, "pagado");
  });

  test("varias cuotas en el mismo mes se suman", () => {
    const juntas = [
      { numero: 0, mes: 1, vence_el: "2026-08-27", importe: 2000 },
      { numero: 1, mes: 1, vence_el: "2026-08-27", importe: 500 },
    ];
    const r = estadoCobroMeses({ cuotas: juntas, pagosPaciente: [] });
    assert.equal(r.meses.length, 1);
    assert.equal(r.meses[0].importe, 2500);
  });

  test("un plan sin cuotas no dice que esté todo pagado", () => {
    const r = estadoCobroMeses({ cuotas: [], pagosPaciente: [] });
    assert.equal(r.todoPagado, false);
    assert.deepEqual(r.meses, []);
  });
});

describe("cuotasDelPlan · fecha de primer cobro acordada", () => {
  const base = {
    modo: "cuotas", fecha_inicio: "2026-08-27",
    entrega: 2000, n_cuotas: 3, importe_cuota: 500, mes_inicio_cuotas: 2,
  };
  const calc = calcPlan({
    tratamientos: [], nMeses: 6, modo: "cuotas",
    entrega: 2000, nCuotas: 3, importeCuota: 500, mesInicioCuotas: 2,
  });

  test("sin fecha propia, vencen el mismo día que la de inicio", () => {
    const f = cuotasDelPlan(base, calc);
    assert.deepEqual(f.map(x => x.vence_el),
      ["2026-08-27", "2026-09-27", "2026-10-27", "2026-11-27"]);
  });

  test("con fecha propia, las cuotas salen de ahí y van de mes en mes", () => {
    const f = cuotasDelPlan({ ...base, fecha_primer_cobro: "2026-10-05" }, calc);
    assert.equal(f[0].vence_el, "2026-08-27");   // la entrega no se mueve
    assert.deepEqual(f.slice(1).map(x => x.vence_el),
      ["2026-10-05", "2026-11-05", "2026-12-05"]);
  });

  test("la fecha propia también respeta el fin de mes", () => {
    const f = cuotasDelPlan({ ...base, fecha_primer_cobro: "2026-12-31" }, calc);
    assert.deepEqual(f.slice(1).map(x => x.vence_el),
      ["2026-12-31", "2027-01-31", "2027-02-28"]);
  });

  test("los meses de las cuotas no cambian, solo las fechas", () => {
    const sin = cuotasDelPlan(base, calc);
    const con = cuotasDelPlan({ ...base, fecha_primer_cobro: "2026-10-05" }, calc);
    assert.deepEqual(sin.map(x => x.mes), con.map(x => x.mes));
    assert.deepEqual(sin.map(x => x.importe), con.map(x => x.importe));
  });
});

describe("vencimientosPorMes", () => {
  test("sin fecha propia sigue la fecha de inicio", () => {
    const v = vencimientosPorMes({ fecha_inicio: "2026-08-27", mes_inicio_cuotas: 2 }, 4);
    assert.deepEqual([...v.values()],
      ["2026-08-27", "2026-09-27", "2026-10-27", "2026-11-27"]);
  });

  test("con fecha propia, el mes 1 sigue siendo el arranque", () => {
    const v = vencimientosPorMes(
      { fecha_inicio: "2026-08-27", mes_inicio_cuotas: 2, fecha_primer_cobro: "2026-10-05" }, 4);
    assert.deepEqual([...v.values()],
      ["2026-08-27", "2026-10-05", "2026-11-05", "2026-12-05"]);
  });

  test("acepta también los nombres del estado del formulario", () => {
    const v = vencimientosPorMes({ fechaInicio: "2026-08-27", mesInicioCuotas: 2 }, 2);
    assert.deepEqual([...v.values()], ["2026-08-27", "2026-09-27"]);
  });
});

describe("cuotasDelPlan · el ancla no se arrastra", () => {
  // Encadenar addMeses sobre la fecha anterior haría que un 31 de enero,
  // capado a 28 de febrero, dejara el resto de cuotas en día 28.
  test("desde el 31 de enero, cada cuota vence el último día que corresponda", () => {
    const f = cuotasDelPlan({
      modo: "cuotas", fecha_inicio: "2026-01-31",
      entrega: 0, n_cuotas: 5, importe_cuota: 100, mes_inicio_cuotas: 2,
    }, null);
    assert.deepEqual(f.map(x => x.vence_el),
      ["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"]);
  });

  test("lo mismo con una fecha de primer cobro a fin de mes", () => {
    const f = cuotasDelPlan({
      modo: "cuotas", fecha_inicio: "2026-01-15",
      entrega: 0, n_cuotas: 4, importe_cuota: 100, mes_inicio_cuotas: 2,
      fecha_primer_cobro: "2026-01-31",
    }, null);
    assert.deepEqual(f.map(x => x.vence_el),
      ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
});

// ─── Cola de avisos: a quién escribir hoy ────────────────────────────────────
describe("avisosDelDia", () => {
  const plan = { id: "p1", patient_id: "pac1", patient_name: "CHAIMAE", estado: "activo",
                 fecha_inicio: "2026-08-27" };
  const cuotas = [
    { plan_id: "p1", numero: 0, mes: 1, vence_el: "2026-08-27", importe: 2000 },
    { plan_id: "p1", numero: 1, mes: 2, vence_el: "2026-09-27", importe: 500 },
    { plan_id: "p1", numero: 2, mes: 3, vence_el: "2026-10-27", importe: 500 },
  ];
  const entregaPagada = [{ id:"g1", patient_id:"pac1", amount:2000, date:"2026-08-27" }];
  const cola = (hoy, { pagos = entregaPagada, avisados = [] } = {}) =>
    avisosDelDia({ planes: [plan], cuotas, pagos, hoy, avisados });

  test("aparece 7 días antes, no antes", () => {
    assert.deepEqual(cola("2026-09-19"), []);
    const r = cola("2026-09-20");
    assert.equal(r.length, 1);
    assert.equal(r[0].tipo, "antelacion");
    assert.equal(r[0].dias, 7);
    assert.equal(r[0].importe, 500);
  });

  test("si nadie lo manda, NO desaparece los días siguientes", () => {
    for (const [d, dias] of [["2026-09-21",6],["2026-09-23",4],["2026-09-25",2]]) {
      const r = cola(d);
      assert.equal(r.length, 1, `deberia seguir saliendo el ${d}`);
      assert.equal(r[0].tipo, "antelacion");
      assert.equal(r[0].dias, dias);
    }
  });

  test("mandado en una etapa, desaparece hasta la siguiente", () => {
    const av = [{ clave: "aviso_p1_2_antelacion" }];
    assert.deepEqual(cola("2026-09-20", { avisados: av }), []);
    assert.deepEqual(cola("2026-09-23", { avisados: av }), []);
    // la víspera es otra etapa: vuelve a salir
    assert.equal(cola("2026-09-26", { avisados: av })[0].tipo, "vispera");
    assert.equal(cola("2026-09-27", { avisados: av })[0].tipo, "hoy");
  });

  test("pasado el vencimiento sin cobrar, queda como atrasado y no se va", () => {
    for (const d of ["2026-09-28", "2026-10-05", "2026-10-15"]) {
      const r = cola(d);
      assert.equal(r.length, 1, `deberia seguir saliendo el ${d}`);
      assert.equal(r[0].tipo, "atrasado");
      assert.ok(r[0].dias < 0);
      assert.equal(r[0].importe, 500);
    }
  });

  test("si la siguiente cuota ya está en ventana, se avisa de ella con el atraso dentro", () => {
    // el 26/10 vence la cuota de octubre mañana y la de septiembre sigue impagada:
    // una sola fila, por los dos importes, para no reclamar el mismo dinero dos veces
    const r = cola("2026-10-26");
    assert.equal(r.length, 1);
    assert.equal(r[0].tipo, "vispera");
    assert.equal(r[0].importe, 1000);
    assert.equal(r[0].arrastre, 500);
  });

  test("el atrasado sigue saliendo aunque ya se haya avisado", () => {
    const av = [{ clave: "aviso_p1_2_atrasado", enviado_por: "x@y.z" }];
    const r = cola("2026-10-05", { avisados: av });
    assert.equal(r.length, 1);
    assert.equal(r[0].tipo, "atrasado");
    assert.ok(r[0].ultimoAviso, "deberia decir que ya se aviso una vez");
  });

  test("en cuanto paga, deja de salir", () => {
    const pagos = [...entregaPagada, { id:"g2", patient_id:"pac1", amount:500, date:"2026-09-27" }];
    assert.deepEqual(cola("2026-09-28", { pagos }), []);
    assert.deepEqual(cola("2026-09-27", { pagos }), []);
  });

  test("una sola entrada por plan: el importe ya lleva el atraso dentro", () => {
    // pagó 1.800 de los 2.000: faltan 200, y la cuota son 500
    const pagos = [{ id:"g1", patient_id:"pac1", amount:1800, date:"2026-08-27" }];
    const r = cola("2026-09-20", { pagos });
    assert.equal(r.length, 1, "dos filas contarian el mismo dinero dos veces");
    assert.equal(r[0].importe, 700);
    assert.equal(r[0].arrastre, 200);
  });

  test("solo entran los planes activos", () => {
    for (const estado of ["borrador", "terminado", "cancelado"]) {
      const r = avisosDelDia({ planes: [{ ...plan, estado }], cuotas,
                               pagos: entregaPagada, hoy: "2026-09-20" });
      assert.deepEqual(r, [], `un plan ${estado} no deberia avisar`);
    }
  });

  test("no cuenta pagos anteriores al arranque del plan", () => {
    const viejo = [{ id:"g0", patient_id:"pac1", amount:5000, date:"2025-01-01" }];
    const r = cola("2026-08-27", { pagos: viejo });
    assert.equal(r.length, 1);
    assert.equal(r[0].importe, 2000);   // la entrega sigue sin pagarse
  });

  test("cada etapa tiene su clave, para no repetir el mismo aviso", () => {
    const claves = [cola("2026-09-20")[0].clave, cola("2026-09-26")[0].clave,
                    cola("2026-09-27")[0].clave, cola("2026-09-28")[0].clave];
    assert.equal(new Set(claves).size, 4);
  });

  test("los atrasados salen primero, y luego por urgencia", () => {
    // ANA solo tiene la entrega, que venció y no pagó: no hay cuota próxima
    const p2 = { ...plan, id:"p2", patient_id:"pac2", patient_name:"ANA" };
    const c2 = [{ plan_id:"p2", numero:0, mes:1, vence_el:"2026-08-27", importe:900 }];
    const r = avisosDelDia({
      planes: [plan, p2], cuotas: [...cuotas, ...c2],
      pagos: entregaPagada, hoy: "2026-09-27",
    });
    assert.equal(r.length, 2);
    assert.equal(r[0].tipo, "atrasado");
    assert.equal(r[0].plan.patient_name, "ANA");
    assert.equal(r[0].importe, 900);
    assert.equal(r[1].tipo, "hoy");
    assert.equal(r[1].plan.patient_name, "CHAIMAE");
  });

  test("sin planes no hay cola", () => {
    assert.deepEqual(avisosDelDia({ planes: [], cuotas: [], pagos: [], hoy: "2026-09-20" }), []);
  });
});

// ─── Nombre corto para la ficha de cobro ─────────────────────────────────────
describe("nombreCortoTratamiento", () => {
  test("se queda con la palabra y el número de pieza", () => {
    assert.equal(nombreCortoTratamiento("Implante Titanio 46"), "Implante 46");
    assert.equal(nombreCortoTratamiento("Gran Reconstrucción 27"), "Reconstr. 27");
    assert.equal(nombreCortoTratamiento("Exodoncia 3er Molar simple 28"), "Exodoncia 28");
    assert.equal(nombreCortoTratamiento("Perno de fibra de vidrio 24"), "Perno 24");
    assert.equal(nombreCortoTratamiento("Carilla de Composite   11"), "Carilla 11");
  });

  test("corona gana a implante: 'corona sobre implante' es una corona", () => {
    assert.equal(nombreCortoTratamiento("Corona metal cerámica sobre implante 36"), "Corona 36");
    assert.equal(nombreCortoTratamiento("Corona zirconio 21"), "Corona 21");
  });

  test("sin número de pieza deja solo la palabra", () => {
    assert.equal(nombreCortoTratamiento("Curetaje general"), "Curetaje");
    // el multi unit es una pieza distinta del implante: junto a "Implante 46"
    // en el mismo mes, verlo como "Implante" a secas confundiría
    assert.equal(nombreCortoTratamiento("MULTI UNIT"), "Multi Unit");
    assert.equal(nombreCortoTratamiento("Ataches + Sobredentadura Acrílica Inferior"), "Prótesis");
  });

  test("no se pierde con acentos ni mayúsculas", () => {
    assert.equal(nombreCortoTratamiento("TRATAMIENTO PERIODONTAL SUPERIOR"), "Periodoncia");
    assert.equal(nombreCortoTratamiento("Férula de descarga"), "Férula");
    assert.equal(nombreCortoTratamiento("RADIOGRAFIA PANORAMICA"), "Radiografía");
  });

  test("lo desconocido cae en su primera palabra con contenido", () => {
    assert.equal(nombreCortoTratamiento("Complemento braquets autoligables"), "Complemento");
    assert.equal(nombreCortoTratamiento(""), "");
    assert.equal(nombreCortoTratamiento(null), "");
  });
});

describe("tratamientosPorMes", () => {
  const colocacion = [
    { tx_id:"a", nombre:"Implante Titanio 36", mes:1 },
    { tx_id:"b", nombre:"Implante Titanio 46", mes:1 },
    { tx_id:"c", nombre:"Corona metal cerámica sobre implante 36", mes:5 },
    { tx_id:"d", nombre:"Curetaje general", mes:1 },
  ];

  test("agrupa por mes y acorta los nombres", () => {
    const r = tratamientosPorMes(colocacion);
    assert.deepEqual(r.get(1), ["Implante 36", "Implante 46", "Curetaje"]);
    assert.deepEqual(r.get(5), ["Corona 36"]);
  });

  test("no repite el mismo nombre corto dos veces", () => {
    const r = tratamientosPorMes([
      { nombre:"Curetaje arcada superior", mes:2 },
      { nombre:"Curetaje arcada inferior", mes:2 },
    ]);
    assert.deepEqual(r.get(2), ["Curetaje"]);
  });

  test("sin colocación devuelve vacío", () => {
    assert.equal(tratamientosPorMes([]).size, 0);
  });
});
