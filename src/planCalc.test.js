import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  addMeses, cuotaSugerida, totalTratamientos,
  calcPlan, cuotasDelPlan, estadoCuota,
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
