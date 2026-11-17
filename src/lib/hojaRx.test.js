import { test } from "node:test";
import assert from "node:assert/strict";
import { posicionPlantilla, esSuperior, agruparTratamientos, piezasDelPresupuesto, repartir } from "./hojaRx.js";

test("las piezas de la derecha del paciente caen a la izquierda de la imagen", () => {
  assert.ok(posicionPlantilla(16).x < 0.5);
  assert.ok(posicionPlantilla(46).x < 0.5);
  assert.ok(posicionPlantilla(26).x > 0.5);
  assert.ok(posicionPlantilla(36).x > 0.5);
  assert.ok(posicionPlantilla(17).x < posicionPlantilla(16).x);
});

test("arriba las superiores, abajo las inferiores", () => {
  assert.ok(posicionPlantilla(21).y < posicionPlantilla(31).y);
  assert.equal(esSuperior(14), true);
  assert.equal(esSuperior(44), false);
  assert.equal(esSuperior(55), true);
  assert.equal(esSuperior(85), false);
});

test("temporales donde su permanente, y lo que no es pieza da null", () => {
  assert.deepEqual(posicionPlantilla(54), posicionPlantilla(14));
  assert.equal(posicionPlantilla(56), null);
  assert.equal(posicionPlantilla(19), null);
  assert.equal(posicionPlantilla(9), null);
  assert.equal(posicionPlantilla("x"), null);
});

test("agrupa por tratamiento con sus piezas", () => {
  const g = agruparTratamientos([
    { name: "Implante   26" }, { name: "Implante   16" }, { name: "Corona zirconio   21" },
    { name: "Limpieza" }, { name: "Limpieza" }, { name: "Implante   16" },
  ]);
  assert.deepEqual(g, [
    { nombre: "Implante", piezas: ["16", "26"], sinPieza: 0 },
    { nombre: "Corona zirconio", piezas: ["21"], sinPieza: 0 },
    { nombre: "Limpieza", piezas: [], sinPieza: 2 },
  ]);
  assert.deepEqual(piezasDelPresupuesto([{ name: "Implante   26" }, { name: "Corona   16" }, { name: "Limpieza" }, { name: "X   99" }]), ["16", "26"]);
});

test("repartir separa las que se pisan y deja quietas las que no", () => {
  assert.deepEqual(repartir([10, 50, 90], 8, 0, 100), [10, 50, 90]);
  const r = repartir([50, 51, 52], 8, 0, 100);
  assert.ok(r[1] - r[0] >= 8 - 1e-9 && r[2] - r[1] >= 8 - 1e-9);
  assert.ok(Math.abs((r[0] + r[2]) / 2 - 51) < 1e-9);   // centradas sobre su sitio
  const borde = repartir([99, 100], 8, 0, 100);
  assert.ok(borde[1] <= 100 && borde[1] - borde[0] >= 8 - 1e-9);
  const todas = repartir([5, 5, 5, 5], 50, 0, 100);
  assert.ok(Math.min(...todas) >= 0 && Math.max(...todas) <= 100);
});
