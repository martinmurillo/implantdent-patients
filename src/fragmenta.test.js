import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  TARIFAS, PLAZOS, IMPORTE_MIN, IMPORTE_MAX,
  financiable, motivoNoFinanciable, comisionFragmenta, calcFragmenta,
  lineaDeTiempo, tramosDePago, fraseTramos, etiquetaMes,
} from "./fragmenta.js";

describe("comisionFragmenta · tabla de tarifas", () => {
  test("el caso real: 2.000 € a 12 cuotas son 105 € de comisión", () => {
    assert.equal(comisionFragmenta(2000, 12), 105);
  });

  test("los tramos cortan donde dice la tabla", () => {
    assert.equal(comisionFragmenta(400, 12), 15);      // último del primer tramo
    assert.equal(comisionFragmenta(400.01, 12), 30);   // primero del segundo
    assert.equal(comisionFragmenta(550, 10), 20);
    assert.equal(comisionFragmenta(550.01, 10), 30);
    assert.equal(comisionFragmenta(1000, 3), 30);
    assert.equal(comisionFragmenta(1000.01, 3), 35);
  });

  test("a 3 cuotas los tramos bajos no llevan comisión", () => {
    assert.equal(comisionFragmenta(400, 3), 0);
    assert.equal(comisionFragmenta(850, 3), 0);
    assert.equal(comisionFragmenta(850.01, 3), 30);
  });

  test("la tabla cubre los 8 tramos y los 4 plazos, sin huecos", () => {
    assert.equal(TARIFAS.length, 8);
    for (const t of TARIFAS) {
      for (const p of PLAZOS) {
        assert.equal(typeof t.comision[p], "number", `tramo ${t.hasta}, plazo ${p}`);
      }
    }
  });

  test("fuera de rango no hay comisión", () => {
    assert.equal(comisionFragmenta(58, 12), null);
    assert.equal(comisionFragmenta(2000.01, 12), null);
  });

  test("un plazo que Fragmenta no ofrece se rechaza", () => {
    assert.equal(comisionFragmenta(1000, 6), null);
    assert.equal(comisionFragmenta(1000, 24), null);
  });
});

describe("financiable", () => {
  test("acepta justo los extremos del rango", () => {
    assert.equal(financiable(IMPORTE_MIN), true);
    assert.equal(financiable(IMPORTE_MAX), true);
    assert.equal(financiable(58.99), false);
    assert.equal(financiable(2000.01), false);
  });

  test("dice el motivo cuando no se puede", () => {
    assert.match(motivoNoFinanciable(30), /desde 59/);
    assert.match(motivoNoFinanciable(2500), /hasta 2000/);
    assert.equal(motivoNoFinanciable(1000), null);
  });
});

describe("calcFragmenta · el ejemplo que hay que clavar", () => {
  // 2.000 € a 12 cuotas → comisión 105 → cuota 1 = 271,67 y 2 a 12 = 166,67
  const f = calcFragmenta({ importe: 2000, plazo: 12 });

  test("comisión, cuota base y primera cuota", () => {
    assert.equal(f.comision, 105);
    assert.equal(f.base, 166.67);
    assert.equal(f.primera, 271.67);
  });

  test("son 12 cuotas y solo la primera lleva la comisión", () => {
    assert.equal(f.cuotas.length, 12);
    assert.equal(f.cuotas[0], 271.67);
    assert.deepEqual([...new Set(f.cuotas.slice(1))], [166.67]);
  });

  test("el total pagado es el importe más la comisión", () => {
    assert.equal(f.total, 2105);
  });

  test("a 3 cuotas sin comisión, las tres son iguales", () => {
    const t = calcFragmenta({ importe: 600, plazo: 3 });
    assert.equal(t.comision, 0);
    assert.deepEqual(t.cuotas, [200, 200, 200]);
    assert.equal(t.total, 600);
  });

  test("respeta una comisión firmada distinta de la tarifa de hoy", () => {
    const viejo = calcFragmenta({ importe: 2000, plazo: 12, comision: 90 });
    assert.equal(viejo.comision, 90);
    assert.equal(viejo.primera, 256.67);
    assert.equal(viejo.total, 2090);
  });

  test("fuera de rango o con plazo inválido devuelve null", () => {
    assert.equal(calcFragmenta({ importe: 2500, plazo: 12 }), null);
    assert.equal(calcFragmenta({ importe: 50, plazo: 12 }), null);
    assert.equal(calcFragmenta({ importe: 1000, plazo: 7 }), null);
    assert.equal(calcFragmenta({ importe: 1000, plazo: 0 }), null);
  });
});

describe("lineaDeTiempo · el solape que hay que enseñar", () => {
  // Entrega de 2.000 financiada a 12, y 5 cuotas de 426,74 en clínica
  // desde el mes 2. Fragmenta arranca el mes 1; la clínica el 2.
  const fragmenta = calcFragmenta({ importe: 2000, plazo: 12 });
  const porMesClinica = [0, 426.74, 426.74, 426.74, 426.74, 426.74];
  const filas = lineaDeTiempo({ porMesClinica, fragmenta, nMeses: 12 });

  test("el mes 1 es solo Fragmenta, con la comisión dentro", () => {
    assert.deepEqual(filas[0], { mes: 1, fragmenta: 271.67, clinica: 0, total: 271.67 });
  });

  test("los meses 2 a 6 llevan las dos cuotas a la vez", () => {
    for (let m = 2; m <= 6; m++) {
      const f = filas[m - 1];
      assert.equal(f.fragmenta, 166.67);
      assert.equal(f.clinica, 426.74);
      assert.equal(f.total, 593.41);
    }
  });

  test("acabadas las cuotas de clínica queda solo Fragmenta", () => {
    for (let m = 7; m <= 12; m++) {
      assert.equal(filas[m - 1].clinica, 0);
      assert.equal(filas[m - 1].total, 166.67);
    }
  });

  test("pasado el plazo de Fragmenta no queda nada", () => {
    const largo = lineaDeTiempo({ porMesClinica, fragmenta, nMeses: 14 });
    assert.equal(largo[12].total, 0);
    assert.equal(largo[13].total, 0);
  });

  test("sin Fragmenta la línea es solo la clínica", () => {
    const sin = lineaDeTiempo({ porMesClinica, fragmenta: null, nMeses: 6 });
    assert.deepEqual(sin.map(f => f.total), [0, 426.74, 426.74, 426.74, 426.74, 426.74]);
  });
});

describe("tramosDePago y fraseTramos", () => {
  const fragmenta = calcFragmenta({ importe: 2000, plazo: 12 });
  const filas = lineaDeTiempo({
    porMesClinica: [0, 426.74, 426.74, 426.74, 426.74, 426.74],
    fragmenta, nMeses: 12,
  });

  test("agrupa los meses consecutivos que cuestan lo mismo", () => {
    assert.deepEqual(tramosDePago(filas), [
      { desde: 1,  hasta: 1,  meses: 1, importe: 271.67 },
      { desde: 2,  hasta: 6,  meses: 5, importe: 593.41 },
      { desde: 7,  hasta: 12, meses: 6, importe: 166.67 },
    ]);
  });

  test("lo cuenta en una frase entendible", () => {
    const f = fraseTramos(filas);
    assert.match(f, /El mes 1 paga 271,67/);
    assert.match(f, /593,41/);
    assert.match(f, /166,67/);
    assert.match(f, /durante 6 meses/);
  });

  test("un plan de una sola cuantía se dice en una frase corta", () => {
    const planos = lineaDeTiempo({ porMesClinica: [100, 100, 100], fragmenta: null, nMeses: 3 });
    assert.equal(fraseTramos(planos), "Durante los primeros 3 meses paga 100,00 € al mes.");
  });

  test("los meses a cero no se cuentan", () => {
    const conCeros = lineaDeTiempo({ porMesClinica: [100, 0, 0], fragmenta: null, nMeses: 3 });
    assert.equal(fraseTramos(conCeros), "El mes 1 paga 100,00 €.");
  });

  test("sin nada que pagar devuelve cadena vacía", () => {
    assert.equal(fraseTramos(lineaDeTiempo({ porMesClinica: [], fragmenta: null, nMeses: 3 })), "");
  });
});

describe("etiquetaMes", () => {
  test("el mes 1 es la fecha de inicio", () => {
    assert.equal(etiquetaMes("2026-08-27", 1), "Ago 26");
  });

  test("avanza y cruza el fin de año", () => {
    assert.equal(etiquetaMes("2026-08-27", 2), "Sep 26");
    assert.equal(etiquetaMes("2026-08-27", 5), "Dic 26");
    assert.equal(etiquetaMes("2026-08-27", 6), "Ene 27");
    assert.equal(etiquetaMes("2026-08-27", 18), "Ene 28");
  });

  test("24 meses seguidos sin saltos", () => {
    const et = Array.from({ length: 24 }, (_, i) => etiquetaMes("2026-08-27", i + 1));
    assert.equal(et[0],  "Ago 26");
    assert.equal(et[11], "Jul 27");
    assert.equal(et[23], "Jul 28");
    assert.equal(new Set(et).size, 24);
  });

  test("sin fecha cae al número de mes", () => {
    assert.equal(etiquetaMes(null, 3), "Mes 3");
  });
});
