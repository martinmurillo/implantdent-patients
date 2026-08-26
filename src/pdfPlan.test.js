import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseRows, importeFila, tipoTratamiento, colocacionInicial,
} from "./pdfPlan.js";

// Ayuda para armar filas como las que produce pdf.js: fragmentos con su
// posición horizontal ya normalizada al ancho de la página.
const fila = (...frags) => frags.map(([x, s], i) => ({ x, top: i, s }));

// Fila de tabla completa: código · nombre · pieza · precio · importe · dto · total
const filaTx = (code, nombre, pieza, bruto, dto, neto) => fila(
  [0.08, code],
  [0.20, nombre],
  [0.53, pieza],
  [0.60, `${bruto} €`],
  [0.70, `${bruto} €`],
  [0.80, `${dto}%`],
  [0.90, `${neto} €`],
);

describe("parseRows · filas normales", () => {
  test("lee código, nombre, pieza e importes de una fila", () => {
    const r = parseRows([filaTx("2301", "IMPLANTE ESTANDAR", "16", "900,00", "15", "765,00")]);
    assert.deepEqual(r, [{
      code: "2301", nombre: "IMPLANTE ESTANDAR", pieza: "16",
      bruto: 900, neto: 765, dtoPct: 15,
    }]);
  });

  test("sin columna de descuento, neto queda en null y el dto en 0", () => {
    const r = parseRows([fila([0.08, "2301"], [0.20, "LIMPIEZA"], [0.60, "61,50 €"])]);
    assert.equal(r.length, 1);
    assert.equal(r[0].bruto, 61.5);
    assert.equal(r[0].neto, null);
    assert.equal(r[0].dtoPct, 0);
  });

  test("interpreta el formato español de miles y decimales", () => {
    const r = parseRows([filaTx("2301", "REHABILITACION", "", "3.368,55", "10", "3.031,70")]);
    assert.equal(r[0].bruto, 3368.55);
    assert.equal(r[0].neto, 3031.7);
  });

  test("descarta la pieza si no es un número de una o dos cifras", () => {
    const r = parseRows([filaTx("2301", "IMPLANTE", "N/A", "900,00", "0", "900,00")]);
    assert.equal(r[0].pieza, "");
  });

  test("varias filas seguidas salen en orden", () => {
    const r = parseRows([
      filaTx("2301", "IMPLANTE ESTANDAR", "16", "764,15", "0", "764,15"),
      filaTx("2301", "IMPLANTE ESTANDAR", "26", "764,15", "0", "764,15"),
      filaTx("4102", "CORONA SOBRE IMPLANTE", "16", "828,75", "0", "828,75"),
    ]);
    assert.equal(r.length, 3);
    assert.deepEqual(r.map(x => x.nombre), [
      "IMPLANTE ESTANDAR", "IMPLANTE ESTANDAR", "CORONA SOBRE IMPLANTE",
    ]);
    // dos líneas idénticas se conservan por separado, no se fusionan
    assert.equal(r[0].pieza, "16");
    assert.equal(r[1].pieza, "26");
  });
});

describe("parseRows · nombre partido en dos líneas", () => {
  // El motivo por el que hay que agrupar por posición y no por texto corrido
  test("engancha la continuación a la fila anterior", () => {
    const r = parseRows([
      filaTx("2301", "IMPLANTE DE TITANIO", "16", "900,00", "0", "900,00"),
      fila([0.20, "CON CARGA INMEDIATA"]),
    ]);
    assert.equal(r.length, 1);
    assert.equal(r[0].nombre, "IMPLANTE DE TITANIO CON CARGA INMEDIATA");
  });

  test("no engancha si la línea trae importes (es otra fila)", () => {
    const r = parseRows([
      filaTx("2301", "IMPLANTE", "16", "900,00", "0", "900,00"),
      fila([0.20, "CORONA"], [0.60, "300,00 €"]),
    ]);
    assert.equal(r.length, 1);
    assert.equal(r[0].nombre, "IMPLANTE");
  });

  test("no engancha nada si todavía no hubo ninguna fila válida", () => {
    assert.deepEqual(parseRows([fila([0.20, "ENCABEZADO SUELTO"])]), []);
  });
});

describe("parseRows · filas que hay que ignorar", () => {
  test("corta al llegar a los totales", () => {
    const r = parseRows([
      filaTx("2301", "IMPLANTE", "16", "900,00", "0", "900,00"),
      fila([0.60, "Total"], [0.90, "900,00 €"]),
      filaTx("9999", "NO DEBERIA APARECER", "", "100,00", "0", "100,00"),
    ]);
    assert.equal(r.length, 1);
    assert.equal(r[0].nombre, "IMPLANTE");
  });

  test("corta igual con Subtotal y con Dto.", () => {
    assert.equal(parseRows([fila([0.60, "Subtotal"])]).length, 0);
    assert.equal(parseRows([fila([0.60, "Dto. general"])]).length, 0);
  });

  test("saltea el pie de página sin cortar la tabla", () => {
    const r = parseRows([
      filaTx("2301", "IMPLANTE", "16", "900,00", "0", "900,00"),
      fila([0.40, "Página 1 de 2"]),
      filaTx("4102", "CORONA", "16", "300,00", "0", "300,00"),
    ]);
    assert.equal(r.length, 2);
  });

  test("ignora filas sin código de tratamiento", () => {
    const r = parseRows([fila([0.08, "AB"], [0.20, "ALGO"], [0.60, "10,00 €"])]);
    assert.deepEqual(r, []);
  });

  test("ignora filas con código pero sin importes", () => {
    const r = parseRows([fila([0.08, "2301"], [0.20, "IMPLANTE"])]);
    assert.deepEqual(r, []);
  });
});

describe("importeFila", () => {
  test("usa el neto cuando el PDF aplicó descuento", () => {
    assert.equal(importeFila({ bruto: 900, neto: 765 }), 765);
  });

  test("usa el bruto cuando no hay descuento", () => {
    assert.equal(importeFila({ bruto: 900, neto: null }), 900);
  });

  test("un neto de 0 no se confunde con ausencia de descuento", () => {
    assert.equal(importeFila({ bruto: 900, neto: 0 }), 0);
  });
});

describe("tipoTratamiento", () => {
  test("distingue corona sobre implante de implante", () => {
    assert.equal(tipoTratamiento("CORONA SOBRE IMPLANTE"), "corona");
    assert.equal(tipoTratamiento("IMPLANTE ESTANDAR"), "implante");
    assert.equal(tipoTratamiento("Multi Unit recto"), "implante");
    assert.equal(tipoTratamiento("PILAR DE CICATRIZACION"), "implante");
  });

  test("el resto queda como otro", () => {
    assert.equal(tipoTratamiento("LIMPIEZA BUCAL"), "otro");
    assert.equal(tipoTratamiento("CORONA DE CIRCONIO"), "otro");
  });
});

describe("colocacionInicial", () => {
  test("con implantes, las coronas arrancan en el mes 5", () => {
    const r = colocacionInicial([
      { nombre: "IMPLANTE ESTANDAR" },
      { nombre: "CORONA SOBRE IMPLANTE" },
      { nombre: "LIMPIEZA BUCAL" },
    ]);
    assert.deepEqual(r.map(t => t.mes), [1, 5, 1]);
  });

  test("sin implantes, todo arranca en el mes 1", () => {
    const r = colocacionInicial([
      { nombre: "CORONA SOBRE IMPLANTE" },
      { nombre: "LIMPIEZA BUCAL" },
    ]);
    assert.deepEqual(r.map(t => t.mes), [1, 1]);
  });

  test("no pierde el resto de los campos", () => {
    const r = colocacionInicial([{ nombre: "LIMPIEZA", importe: 61.5, code: "1101" }]);
    assert.deepEqual(r[0], { nombre: "LIMPIEZA", importe: 61.5, code: "1101", mes: 1 });
  });
});
