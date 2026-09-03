import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mejorEscala, carasObjetivo, contarPaginasPdf } from "./caras.js";

// Medidor simulado: el texto ocupa `alto` a escala 1 y crece proporcional.
// Es el comportamiento real —más cuerpo, más páginas— sin maquetar nada.
const medidor = (alto, capacidad = 1) => {
  const fn = async (e) => Math.max(1, Math.ceil((alto * e) / capacidad - 1e-9));
  fn.cuenta = 0;
  return async (e) => { fn.cuenta++; return fn(e); };
};

describe("a cuántas caras aspirar", () => {
  test("par se mantiene", () => {
    assert.equal(carasObjetivo(2), 2);
    assert.equal(carasObjetivo(4), 4);
  });

  test("impar baja a la par de abajo", () => {
    assert.equal(carasObjetivo(3), 2);
    assert.equal(carasObjetivo(5), 4);
  });

  test("una sola cara sube a dos", () => {
    // Con una sola, la primera página del siguiente consentimiento acabaría
    // impresa en su reverso.
    assert.equal(carasObjetivo(1), 2);
  });
});

describe("escala más grande que sigue cabiendo", () => {
  test("tres caras: aprieta hasta dos", async () => {
    // ocupa 2,2 páginas: cabe en dos apretando poco, dentro de lo legible
    const r = await mejorEscala(medidor(2.2));
    assert.equal(r.paginas, 2);
    assert.equal(r.objetivo, 2);
    assert.ok(r.escala < 1, `esperaba encoger, escala ${r.escala}`);
    assert.ok(r.escala >= 0.88, `no debería bajar de lo legible: ${r.escala}`);
  });

  test("ya cabe en dos y sobra: agranda la letra", async () => {
    // ocupa 1,2 páginas: hay sitio de sobra hasta llenar las dos
    const r = await mejorEscala(medidor(1.2));
    assert.equal(r.paginas, 2);
    assert.ok(r.escala > 1, `esperaba agrandar, escala ${r.escala}`);
  });

  test("una sola cara se estira hasta llenar las dos", async () => {
    const r = await mejorEscala(medidor(0.8));
    assert.equal(r.objetivo, 2);
    assert.ok(r.escala > 1, `esperaba agrandar, escala ${r.escala}`);
  });

  test("no se pasa nunca del objetivo", async () => {
    for (const alto of [0.9, 1.2, 1.8, 2.4, 3.1, 4.6]) {
      const r = await mejorEscala(medidor(alto));
      assert.ok(r.paginas <= r.objetivo,
        `alto ${alto}: ${r.paginas} páginas, objetivo ${r.objetivo}`);
    }
  });

  test("respeta los límites de escala", async () => {
    const vistas = [];
    const medir = async (e) => { vistas.push(e); return Math.ceil(2.4 * e); };
    await mejorEscala(medir, { min: 0.8, max: 1.2 });
    assert.ok(Math.min(...vistas) >= 0.8, `bajó a ${Math.min(...vistas)}`);
    assert.ok(Math.max(...vistas) <= 1.2, `subió a ${Math.max(...vistas)}`);
  });

  test("si apretar deja la letra ilegible, cara en blanco y letra normal", async () => {
    // 2,9 páginas: para meterlo en dos habría que bajar a ~0,69, ilegible.
    const r = await mejorEscala(medidor(2.9));
    assert.equal(r.escala, 1);
    assert.equal(r.relleno, true);
    assert.equal(r.objetivo % 2, 0, "el total con la cara en blanco tiene que ser par");
  });

  test("si apretar poco basta, no mete cara en blanco", async () => {
    const r = await mejorEscala(medidor(2.1));
    assert.equal(r.relleno, false);
    assert.equal(r.paginas, 2);
  });

  test("si ni al mínimo cabe, letra normal y cara en blanco", async () => {
    const r = await mejorEscala(medidor(2.95), { min: 0.9 });
    assert.equal(r.escala, 1);
    assert.equal(r.relleno, true);
    assert.equal(r.objetivo, 4, "3 páginas + 1 en blanco");
  });

  test("apretar solo un poco sí sale a cuenta: 2,4 páginas no llegan a legible", async () => {
    // Para meter 2,4 en dos caras haría falta 0,83, o sea 7,9pt. No compensa.
    const r = await mejorEscala(medidor(2.4));
    assert.equal(r.escala, 1);
    assert.equal(r.relleno, true);
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
