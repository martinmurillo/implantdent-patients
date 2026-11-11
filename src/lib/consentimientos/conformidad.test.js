import { test } from "node:test";
import assert from "node:assert/strict";
import { categoriaConformidad as cat, hojasConformidad, textoDetalle, separarPieza }
  from "./conformidad.js";

test("cada tratamiento cae en su fila de la hoja", () => {
  const casos = {
    "Corona zirconio sobre implante   36": "IMPLANTES",
    "Corona metal cerámica sobre implante": "IMPLANTES",
    "Corona sobre implante promoción   16": "IMPLANTES",
    "6 IMPLANTES + ARCADA CERAMICA 12 PIEZAS SUPERIOR": "IMPLANTES",
    "Prótesis Híbrida de Metal Noble (titanio) inferior": "IMPLANTES",
    "4 IMPLANTES + BARRA ACKERMAN +SOBREDENTADURA METAL ACRILICA REMOVIBLE + EXOS + PROTESIS PROVISIONAL": "REMOVIBLE",
    "Ataches + Sobredentadura Acrílica Inferior": "REMOVIBLE",
    "Protesis Completa acrílic superior DEFINITIVA": "REMOVIBLE",
    "Protesis Parcial Esqueletica 4 a 6 piezas inferior": "REMOVIBLE",
    "PROTESIS COMPLETA FLEXIBLE": "REMOVIBLE",
    "Corona metal ceramica   16": "CORONAS",
    "Corona o puente zirconio   11": "CORONAS",
    "Corona de disilicato de Litio": "CORONAS",
    "Puente Maryland metal - resina": "CORONAS",
    "Carilla de Composite   11": "CARILLAS",
    "Carilla Disilicato Ceràmica x tècniques de capa   21": "CARILLAS",
    "Blanqueamiento Promo 2 arcadas": "BLANQUEAMIENTO",
    "Blanqueamento interno": "BLANQUEAMIENTO",
    "PACK PROMO Rev+Rad+CURETAGE+BLANQUEAMIENTO": "BLANQUEAMIENTO",
    "Reconstrucción angular estética   21": "RECONSTRUCCION",
  };
  for (const [n, c] of Object.entries(casos)) assert.equal(cat(n), c, n);
});

test("retoques, provisionales y lo que no es estético no sacan hoja", () => {
  for (const n of [
    "Reconstrucción   16", "Gran Reconstrucción   26", "Reconstrucción pieza endodonciada   11",
    "Carilla provisional   11", "CORONA PROVISIONAL", "Corona provisional sobre implante inmediato",
    "Protesis Completa acrílic provisional inferior", "Diente provisional",
    "AJUSTE PROTESIS SOBRE IMPLANTES", "Recementado de Corona por pieza   11",
    "Gingivectomía (alargamiento coronario por pieza)   15", "COMPOSTURA PROTESIS",
    "Retenedor removible superior", "Pulido de carillas (unidad)", "Cambio Tornillo Corona sobre Implante",
    "Implante Titanio", "MULTI UNIT", "Endodoncia (6-7)", "Empaste Simple   11",
  ]) assert.equal(cat(n), null, n);
});

test("separa la pieza del final del nombre", () => {
  assert.deepEqual(separarPieza("Corona zirconio   21"), { base: "Corona zirconio", pieza: "21" });
  assert.deepEqual(separarPieza("Blanqueamiento Promo 2 arcadas"),
    { base: "Blanqueamiento Promo 2 arcadas", pieza: null });
});

test("una hoja por fila, con todas sus piezas juntas", () => {
  const hojas = hojasConformidad([
    { name: "Reconstrucción angular estética   22" },
    { name: "Protesis Completa acrílic superior DEFINITIVA" },
    { name: "Reconstrucción angular estética   21" },
    { name: "Blanqueamiento Promo 2 arcadas" },
    { name: "Reconstrucción   16" },
  ]);
  assert.deepEqual(hojas.map(h => h.categoria), ["REMOVIBLE", "BLANQUEAMIENTO", "RECONSTRUCCION"]);
  const rec = hojas.find(h => h.categoria === "RECONSTRUCCION");
  assert.equal(textoDetalle(rec.grupos).completo, "Reconstrucción angular estética 21, 22");
  assert.equal(textoDetalle(rec.grupos).corto, "21, 22");
});

test("varios tipos en la misma fila", () => {
  const [h] = hojasConformidad([
    "Corona zirconio   21", "Corona metal ceramica   16", "Corona zirconio   11",
  ]);
  assert.equal(textoDetalle(h.grupos).completo, "Corona zirconio 11, 21 · Corona metal ceramica 16");
  assert.equal(textoDetalle(h.grupos).corto, "11, 16, 21");
});
