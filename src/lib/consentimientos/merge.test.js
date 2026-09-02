import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calcularEdad, determinarFirmante, requiereEscucharAlMenor,
  aplicarFusion, fusionarNodos, componerDocumento,
  EDAD_CONSENTIMIENTO_PROPIO, EDAD_ESCUCHAR_AL_MENOR,
} from "./merge.js";

const datos = {
  paciente: { nombre: "Ana Ruiz", documento: "12345678Z", domicilio: "" },
  profesional: { nombre: "Sergio Molina", colegiado: "5296" },
  tratamiento: { piezas: "16, 17" },
  lugar: "Girona",
};

describe("quién firma", () => {
  // La Llei 21/2000 no dice "menor de 18, firman los padres". Los límites son
  // 16 y 12, y equivocarlos invalida el consentimiento, así que van fijados.
  test("a los 16 firma el propio paciente", () => {
    assert.equal(determinarFirmante(16), "paciente");
    assert.equal(determinarFirmante(17), "paciente");
  });

  test("por debajo de 16 firma el representante", () => {
    assert.equal(determinarFirmante(15), "representante");
    assert.equal(determinarFirmante(8), "representante");
  });

  test("entre 12 y 15 hay que escuchar al menor", () => {
    assert.equal(requiereEscucharAlMenor(12), true);
    assert.equal(requiereEscucharAlMenor(15), true);
    assert.equal(requiereEscucharAlMenor(11), false);
    assert.equal(requiereEscucharAlMenor(16), false);
  });

  test("los límites son los de la ley", () => {
    assert.equal(EDAD_CONSENTIMIENTO_PROPIO, 16);
    assert.equal(EDAD_ESCUCHAR_AL_MENOR, 12);
  });

  test("la edad no se redondea: cuenta el cumpleaños", () => {
    // el día antes de cumplir 16 todavía firma el representante
    assert.equal(calcularEdad("2010-06-15", new Date("2026-06-14")), 15);
    assert.equal(calcularEdad("2010-06-15", new Date("2026-06-15")), 16);
  });
});

describe("fusión de campos", () => {
  test("sustituye por la ruta", () => {
    assert.equal(aplicarFusion("Don/Doña {{paciente.nombre}}", datos), "Don/Doña Ana Ruiz");
    assert.equal(aplicarFusion("col. {{profesional.colegiado}}", datos), "col. 5296");
  });

  test("un campo vacío deja línea de puntos, no un hueco", () => {
    // Un documento que parece completo y no lo está es peor que uno con
    // huecos visibles para rellenar a boli.
    const r = aplicarFusion("domicilio en {{paciente.domicilio}}", datos);
    assert.match(r, /domicilio en \.{10,}/);
  });

  test("una ruta que no existe también deja puntos", () => {
    assert.match(aplicarFusion("{{paciente.inventado}}", datos), /^\.{10,}$/);
  });
});

describe("fusión dentro de los nodos", () => {
  test("párrafos, títulos y listas", () => {
    const r = fusionarNodos([
      { tipo: "titulo", texto: "Para {{paciente.nombre}}" },
      { tipo: "parrafo", texto: "Piezas {{tratamiento.piezas}}" },
      { tipo: "lista", items: ["Dr. {{profesional.nombre}}"] },
    ], datos, "paciente");
    assert.equal(r[0].texto, "Para Ana Ruiz");
    assert.equal(r[1].texto, "Piezas 16, 17");
    assert.equal(r[2].items[0], "Dr. Sergio Molina");
  });

  test("la etiqueta de un campo_manual también se fusiona", () => {
    // Regresión: caía por el default y endodoncia imprimía literalmente
    // "Plan de tratamiento (piezas {{tratamiento.piezas}})".
    const [n] = fusionarNodos(
      [{ tipo: "campo_manual", etiqueta: "Plan (piezas {{tratamiento.piezas}}):", lineas: 3 }],
      datos, "paciente");
    assert.equal(n.etiqueta, "Plan (piezas 16, 17):");
    assert.equal(n.lineas, 3);
  });

  test("las etiquetas de las firmas también", () => {
    const [n] = fusionarNodos(
      [{ tipo: "firmas", columnas: [{ etiqueta: "Firma de {{paciente.nombre}}" }] }],
      datos, "paciente");
    assert.equal(n.columnas[0].etiqueta, "Firma de Ana Ruiz");
  });

  test("no quedan marcadores en ningún tipo de nodo", () => {
    const r = fusionarNodos([
      { tipo: "titulo", texto: "{{paciente.nombre}}" },
      { tipo: "parrafo", texto: "{{lugar}}" },
      { tipo: "lista", items: ["{{tratamiento.piezas}}"] },
      { tipo: "recuadro", nodos: [{ tipo: "parrafo", texto: "{{paciente.documento}}" }] },
      { tipo: "campo_manual", etiqueta: "{{lugar}}" },
      { tipo: "firmas", columnas: [{ etiqueta: "{{lugar}}" }] },
      { tipo: "salto_pagina" },
    ], datos, "paciente");
    assert.doesNotMatch(JSON.stringify(r), /\{\{/);
  });
});

describe("bloque del representante", () => {
  const nodos = [
    { tipo: "parrafo", texto: "algo" },
    { tipo: "bloque_representante", nodos: [{ tipo: "campo_manual", etiqueta: "Nombre del tutor" }] },
  ];

  test("desaparece entero cuando firma el paciente", () => {
    // No se imprime vacío: o hay representante o el bloque no existe.
    const r = fusionarNodos(nodos, datos, "paciente");
    assert.equal(r.length, 1);
    assert.doesNotMatch(JSON.stringify(r), /representante/);
  });

  test("se conserva cuando firma el representante", () => {
    const r = fusionarNodos(nodos, datos, "representante");
    assert.equal(r.length, 2);
    assert.equal(r[1].nodos[0].etiqueta, "Nombre del tutor");
  });
});

describe("composición", () => {
  const bloques = new Map([
    ["preambulo", { codigo: "preambulo", contenido: [{ tipo: "parrafo", texto: "Hola {{paciente.nombre}}" }] }],
  ]);

  test("resuelve referencias y contenido propio en orden", () => {
    const r = componerDocumento(
      [{ ref: "preambulo" }, { nodos: [{ tipo: "parrafo", texto: "propio" }] }],
      bloques, datos, "paciente");
    assert.equal(r[0].texto, "Hola Ana Ruiz");
    assert.equal(r[1].texto, "propio");
  });

  test("un bloque que falta se avisa, no se imprime a medias", () => {
    assert.throws(
      () => componerDocumento([{ ref: "no_existe" }], bloques, datos, "paciente"),
      /Falta el bloque compartido "no_existe"/);
  });
});
