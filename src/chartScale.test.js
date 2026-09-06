import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { escalaY, valoresDibujados } from "./chartScale.js";

const serie = (data) => [{ data }];

describe("qué valores cuentan", () => {
  test("los meses futuros, que vienen a cero, no cuentan", () => {
    // Si contaran, el mínimo sería siempre cero y el eje no se ajustaría nunca.
    assert.deepEqual(valoresDibujados(serie([60, 70, 65, 0, 0, 0])), [60, 70, 65]);
  });

  test("un mes sin actividad en medio tampoco baja el suelo", () => {
    assert.deepEqual(valoresDibujados(serie([60, 0, 65, 0, 0])), [60, 65]);
  });

  test("junta todas las series", () => {
    const v = valoresDibujados([{ data: [1, 2, 0] }, { data: [8, 9, 0] }]);
    assert.deepEqual(v.sort((a, b) => a - b), [1, 2, 8, 9]);
  });
});

describe("escala vertical", () => {
  test("el caso que se veía plano: se acerca el eje", () => {
    // Cobrado oscilando entre 58k y 76k con el objetivo en 90k. Desde cero,
    // esos 18k de recorrido eran el 20% del alto.
    const r = escalaY(serie([58000, 76000, 61000, 74000, 63000]), 90000);
    assert.equal(r.ajustado, true);
    assert.ok(r.yMin > 0, `el eje debería arrancar por encima de cero, arranca en ${r.yMin}`);
    assert.ok(r.yMin < 58000, "el mínimo tiene que quedar dentro del gráfico");
    assert.ok(r.yMax > 90000, "el objetivo tiene que seguir cabiendo");
    // La banda de datos ocupa ahora buena parte del alto
    const proporcion = (76000 - 58000) / (r.yMax - r.yMin);
    assert.ok(proporcion > 0.4, `sigue aplastada: ocupa el ${(proporcion * 100).toFixed(0)}%`);
  });

  test("si los datos ya ocupan medio gráfico, se queda en cero", () => {
    // De 20 a 100: desde cero ya se ve la forma, y arrancar en cero es lo
    // más honesto.
    const r = escalaY(serie([20, 60, 100, 40]));
    assert.equal(r.yMin, 0);
    assert.equal(r.ajustado, false);
  });

  test("valores pequeños de conteo se quedan en cero", () => {
    const r = escalaY(serie([2, 5, 3, 4]));
    assert.equal(r.yMin, 0);
  });

  test("todo el mismo valor: no hay oscilación que enseñar", () => {
    const r = escalaY(serie([70000, 70000, 70000]));
    assert.equal(r.yMin, 0);
    assert.equal(r.ajustado, false);
  });

  test("sin datos no revienta", () => {
    assert.deepEqual(escalaY([]), { yMin: 0, yMax: 1, grid: [0, 1], ajustado: false });
    assert.equal(escalaY(serie([0, 0, 0])).yMax, 1);
  });

  test("el objetivo siempre cabe dentro del eje", () => {
    for (const objetivo of [90000, 50000, 120000]) {
      const r = escalaY(serie([58000, 76000, 61000]), objetivo);
      assert.ok(r.yMax >= objetivo, `objetivo ${objetivo} fuera del eje (yMax ${r.yMax})`);
      assert.ok(r.yMin <= objetivo || objetivo < r.yMin,
        "si el objetivo queda por debajo del suelo, al menos no rompe");
    }
  });

  test("la rejilla empieza en el suelo y acaba en el techo", () => {
    const r = escalaY(serie([58000, 76000, 61000]), 90000);
    assert.equal(r.grid[0], r.yMin);
    assert.equal(r.grid[r.grid.length - 1], r.yMax);
    assert.equal(r.grid.length, 5);
  });

  test("los números de la rejilla son de leer, no decimales sueltos", () => {
    const r = escalaY(serie([58340, 76120, 61050]), 90000);
    for (const v of [r.yMin, r.yMax]) {
      assert.equal(v, Math.round(v), `${v} no es entero`);
      assert.equal(v % 100, 0, `${v} no está redondeado`);
    }
  });
});
