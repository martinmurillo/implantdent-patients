import { test } from "node:test";
import assert from "node:assert/strict";
import { posicionPlantilla, esSuperior, agruparTratamientos, piezasDelPresupuesto, repartir, nombreDoctor, tablaTonos, textoPiezas } from "./hojaRx.js";

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

test("tabla de tonos: sin tocar, aclarada e invertida", () => {
  const igual = tablaTonos(0, false);
  assert.equal(igual[0], 0); assert.equal(igual[128], 128); assert.equal(igual[255], 255);
  const clara = tablaTonos(0.5, false);
  assert.ok(clara[0] > 50 && clara[128] > 128 && clara[255] === 255);
  for (let v = 1; v < 256; v++) assert.ok(clara[v] >= clara[v - 1]);
  const neg = tablaTonos(0, true);
  assert.equal(neg[0], 255); assert.equal(neg[255], 0);
});

test("nombre del doctor sin el artículo", () => {
  assert.equal(nombreDoctor({ name: "Sergio Molina", tratamiento: "el Dr." }), "Dr. Sergio Molina");
  assert.equal(nombreDoctor({ name: "Laura Pérez", tratamiento: "la Dra." }), "Dra. Laura Pérez");
  assert.equal(nombreDoctor({ name: "Alex Roca", tratamiento: "el Dr./la Dra." }), "Alex Roca");
  assert.equal(nombreDoctor({ name: "Alex Roca" }), "Alex Roca");
  assert.equal(nombreDoctor(null), "");
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

test("piezas de la lista en el orden de la boca, con rangos por cuadrante", () => {
  assert.equal(textoPiezas(["11", "12", "13", "14", "15", "16", "17", "21", "22", "23", "24", "25", "26", "27"]), "17–11, 21–27");
  assert.equal(textoPiezas(["26", "16"]), "16, 26");
  assert.equal(textoPiezas(["12", "11"]), "12, 11");
  assert.equal(textoPiezas(["46", "44", "42", "32", "34", "36"]), "46, 44, 42, 32, 34, 36");
  assert.equal(textoPiezas(["33", "34", "35", "36"]), "33–36");
});
