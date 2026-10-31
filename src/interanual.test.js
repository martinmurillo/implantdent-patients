import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { comparaInteranual } from "./interanual.js";

const MAY = 4, OCT = 9;
const anio = (valores) => { const a = Array(12).fill(0); valores.forEach((v, i) => { a[MAY + i] = v; }); return a; };

describe("comparación interanual", () => {
  test("suma los meses del tramo y saca la diferencia y el porcentaje", () => {
    const r = comparaInteranual(anio([110, 120]), anio([100, 100]), MAY, MAY + 1);
    assert.deepEqual(r.meses, [MAY, MAY + 1]);
    assert.equal(r.actual, 230);
    assert.equal(r.anterior, 200);
    assert.equal(r.dif, 30);
    assert.equal(r.pct, 15);
  });

  test("lo de antes del tramo no cuenta", () => {
    const actual = anio([110]); actual[0] = 999;
    const r = comparaInteranual(actual, anio([100]), MAY, MAY);
    assert.equal(r.actual, 110);
  });

  test("un mes sin cargar en cualquiera de los dos años no entra", () => {
    // Octubre todavía sin cargar este año: compararlo con el del año pasado
    // daría una bajada que no existe.
    const r = comparaInteranual(anio([110, 0]), anio([100, 100]), MAY, MAY + 1);
    assert.deepEqual(r.meses, [MAY]);
    assert.equal(r.pct, 10);
    assert.equal(r.porMes[1].actual, null);
    assert.equal(r.porMes[1].pct, null);
  });

  test("sin datos del año anterior no hay comparación", () => {
    const r = comparaInteranual(anio([110, 120]), Array(12).fill(0), MAY, OCT);
    assert.deepEqual(r.meses, []);
    assert.equal(r.pct, null);
    assert.equal(r.dif, null);
    assert.equal(r.porMes.length, 6);
  });

  test("las bajadas salen en negativo, con un decimal", () => {
    const r = comparaInteranual(anio([90]), anio([120]), MAY, MAY);
    assert.equal(r.dif, -30);
    assert.equal(r.pct, -25);
    assert.equal(comparaInteranual(anio([101]), anio([300]), MAY, MAY).pct, -66.3);
  });
});
