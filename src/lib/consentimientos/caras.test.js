import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { elegirEscala, contarPaginasPdf, ESCALAS } from "./caras.js";

// medir simulado: se le da qué páginas salen a cada escala
const medidor = (porEscala) => {
  const vistas = [];
  const fn = async (e) => { vistas.push(e); return porEscala[e]; };
  fn.vistas = vistas;
  return fn;
};

describe("elegir escala para que las caras salgan pares", () => {
  test("si ya es par no toca nada ni maqueta de más", async () => {
    const m = medidor({ 1: 2 });
    const r = await elegirEscala(m);
    assert.equal(r.escala, 1);
    assert.equal(r.paginas, 2);
    assert.equal(r.ajustado, false);
    // una sola medición: el caso normal no puede costar cinco maquetados
    assert.deepEqual(m.vistas, [1]);
  });

  test("cuatro caras también valen: no fuerza a dos", async () => {
    const m = medidor({ 1: 4 });
    const r = await elegirEscala(m);
    assert.equal(r.escala, 1);
    assert.equal(r.paginas, 4);
    assert.deepEqual(m.vistas, [1]);
  });

  test("tres caras: aprieta hasta que caben en dos", async () => {
    // el caso que se veía: dos caras y un 25% de una tercera
    const m = medidor({ 1: 3, 0.94: 3, 0.88: 2 });
    const r = await elegirEscala(m);
    assert.equal(r.escala, 0.88);
    assert.equal(r.paginas, 2);
    assert.equal(r.ajustado, true);
    assert.deepEqual(m.vistas, [1, 0.94, 0.88]);
  });

  test("cinco caras bajan a cuatro, no a dos", async () => {
    const m = medidor({ 1: 5, 0.94: 4 });
    const r = await elegirEscala(m);
    assert.equal(r.paginas, 4);
    assert.equal(r.escala, 0.94);
  });

  test("si no hay forma de llegar a par, se queda como estaba", async () => {
    // Encoger sin ganar una hoja es empeorar el documento a cambio de nada.
    const m = medidor({ 1: 3, 0.94: 3, 0.88: 3, 0.82: 3, 0.78: 3 });
    const r = await elegirEscala(m);
    assert.equal(r.escala, 1);
    assert.equal(r.paginas, 3);
    assert.equal(r.ajustado, false);
  });

  test("no baja de la escala mínima aunque siga impar", async () => {
    const m = medidor({ 1: 7, 0.94: 7, 0.88: 7, 0.82: 7, 0.78: 7 });
    await elegirEscala(m);
    assert.equal(Math.min(...m.vistas), 0.78);
    assert.equal(m.vistas.length, ESCALAS.length);
  });
});

describe("contar páginas de un PDF", () => {
  const pdfFalso = (n) => new TextEncoder().encode(
    "%PDF-1.7\n" + Array.from({ length: n }, (_, i) =>
      `${i + 1} 0 obj\n<< /Type /Page /Parent 1 0 R >>\nendobj\n`).join("") +
    "trailer\n<< /Type /Pages /Count " + n + " >>\n");

  test("cuenta las páginas y no confunde /Pages con /Page", () => {
    assert.equal(contarPaginasPdf(pdfFalso(1)), 1);
    assert.equal(contarPaginasPdf(pdfFalso(3)), 3);
    assert.equal(contarPaginasPdf(pdfFalso(9)), 9);
  });

  test("un PDF sin páginas da cero, no revienta", () => {
    assert.equal(contarPaginasPdf(new TextEncoder().encode("%PDF-1.7\ntrailer\n")), 0);
  });
});
