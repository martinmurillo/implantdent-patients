import { test } from "node:test";
import assert from "node:assert/strict";
import { simboloDe, arcadaDe, formaDiente, dibujo, union, alturaPorDefecto } from "./hojaRxDibujos.js";
import { filasDelPresupuesto, simbolosIniciales, agruparFilas } from "./hojaRx.js";

const tipo = (n) => simboloDe(n)?.tipo ?? null;
const letra = (n) => simboloDe(n)?.letra;

test("cada tratamiento del catálogo lleva su dibujo", () => {
  assert.equal(tipo("Implante Titanio"), "implante");
  assert.equal(tipo("Implante titanio BioHorizons/Zimmer (alta gama)"), "implante");
  assert.equal(tipo("Corona metal cerámica sobre implante"), "corona");
  assert.equal(tipo("Corona zirconio"), "corona");
  assert.equal(tipo("Corona o puente metal - cerámica"), "corona");
  assert.equal(tipo("Diente provisional"), "corona");
  assert.equal(tipo("CORONA PROVISIONAL"), "corona");
  assert.equal(tipo("Protesis Parcial acrilica 1 a 3 piezas superior"), "protesis");
  assert.equal(tipo("Protesis Parcial Esqueletica 4 a 6 piezas inferior"), "protesis");
  assert.equal(tipo("Protesis Completa Acrílic provisional superior"), "protesis");
  assert.equal(tipo("Ataches + Sobredentadura metal acrílica superior"), "protesis");
  assert.equal(tipo("6 IMPLANTES + ARCADA CERAMICA 12 PIEZAS SUPERIOR"), "protesis");
  assert.equal(tipo("Endodoncia (1-2-3)"), "endo");
  assert.equal(tipo("Reendodoncia (6-7)"), "endo");
  assert.equal(tipo("Perno Fibra de Vidrio"), "perno");
  assert.equal(tipo("Exodoncia simple"), "x");
  assert.equal(tipo("Exodoncia 3er Molar retenido"), "x");
  assert.equal(tipo("Extraccion de implante"), "x");
});

test("letras de reconstrucciones, empastes y demás", () => {
  assert.equal(letra("Reconstrucción"), "R");
  assert.equal(letra("Reconstrucción angular estética"), "R");
  assert.equal(letra("Gran Reconstrucción"), "GR");
  assert.equal(letra("Empaste Simple"), "E");
  assert.equal(letra("INCRUSTACION DE COMPOSITE"), "I");
  assert.equal(letra("Carilla ceràmica"), "CA");
  assert.equal(letra("Recementado de Corona por pieza"), "RC");
  assert.equal(simboloDe("Limpieza"), null);
  assert.equal(simboloDe("AJUSTE PROTESIS SOBRE IMPLANTES"), null);
});

test("arcada de las prótesis sin pieza", () => {
  assert.equal(arcadaDe("Protesis Parcial acrilica 1 a 3 piezas superior"), "superior");
  assert.equal(arcadaDe("Protesis Parcial Esqueletica mas de 10 piezas inf."), "inferior");
  assert.equal(arcadaDe("PROTESIS COMPLETA FLEXIBLE"), null);
});

test("forma del diente por pieza", () => {
  assert.equal(formaDiente("11").tipo, "incisivo");
  assert.equal(formaDiente("43").tipo, "canino");
  assert.equal(formaDiente("25").tipo, "premolar");
  assert.equal(formaDiente("36").tipo, "molar");
  assert.equal(formaDiente("75").tipo, "molar");     // temporal
  assert.ok(formaDiente("36").w > formaDiente("31").w);
});

test("los dibujos dan rutas válidas, y los de abajo van dados la vuelta", () => {
  for (const t of ["implante", "corona", "protesis", "endo", "perno", "x"]) {
    const d = dibujo({ tipo: t, pieza: "16" }, 50, 50, 1);
    assert.ok(d.trazos.length > 0, t);
    for (const tr of d.trazos) assert.match(tr.d, /^M[-\d.]+ [-\d.]+/);
  }
  // El ápice del implante de arriba queda por encima (y menor) y el de abajo por debajo.
  const ys = (d) => d.trazos[0].d.match(/-?\d+(\.\d+)?/g).map(Number).filter((_, i) => i % 2 === 1);
  assert.ok(Math.min(...ys(dibujo({ tipo: "implante", pieza: "16" }, 50, 50))) < 46);
  assert.ok(Math.max(...ys(dibujo({ tipo: "implante", pieza: "46" }, 50, 50))) > 54);
  assert.equal(dibujo({ tipo: "letra", letra: "GR", pieza: "36" }, 10, 10).texto.letra, "GR");
  assert.equal(dibujo({ tipo: "endo", pieza: "36" }, 0, 0).trazos.length, 4);   // dos raíces
});

test("implante y corona en la misma pieza salen los dos, uno en la raíz y otro en la corona", () => {
  const filas = filasDelPresupuesto([{ name: "Implante Titanio   16" }, { name: "Corona zirconio sobre implante   16" }]);
  const s = simbolosIniciales(filas);
  assert.deepEqual(s.map(x => x.tipo), ["implante", "corona"]);
  assert.ok(s[0].y < s[1].y);
  assert.equal(s[0].x, s[1].x);
});

test("varias letras en una pieza se apilan", () => {
  const s = simbolosIniciales(filasDelPresupuesto([{ name: "Reconstrucción   36" }, { name: "Empaste Simple   36" }]));
  assert.notEqual(s[0].y, s[1].y);
  assert.equal(alturaPorDefecto({ tipo: "letra", pieza: "36" }, 1), s[1].y);
});

test("las prótesis sin pieza salen con las piezas elegidas, unidas", () => {
  const filas = filasDelPresupuesto([{ name: "Protesis Parcial Esqueletica 4 a 6 piezas inferior" }, { name: "Limpieza" }]);
  assert.equal(simbolosIniciales(filas).length, 0);
  const elegidas = { 0: ["31", "41"] };
  const s = simbolosIniciales(filas, elegidas);
  assert.deepEqual(s.map(x => x.pieza), ["31", "41"]);
  assert.ok(union(s.map(x => ({ x: x.x * 186, y: x.y * 98, s: x }))).startsWith("M"));
  const g = agruparFilas(filas, elegidas);
  assert.deepEqual(g[0].piezas, ["31", "41"]);
  assert.equal(g[0].simbolo.tipo, "protesis");
  assert.equal(g[1].sinPieza, 1);
});
