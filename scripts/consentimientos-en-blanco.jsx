/* global process */
// Los 18 consentimientos en blanco, para tener en el mostrador.
//
// Todo lo que normalmente rellena el sistema —paciente, documento, doctor,
// colegiado, fecha— se deja vacío, y la fusión lo sustituye por línea de
// puntos, que es como están los originales en papel. Así recepción puede
// coger uno y rellenarlo a mano.
//
// Se compone con el bloque de representante dentro, para que el impreso valga
// también cuando firma el padre, la madre o el tutor.
//
//   node .preview-dist/consentimientos-en-blanco.js volcado.json carpeta/
import { createElement } from "react";
import { Font, pdf, renderToFile } from "@react-pdf/renderer";
import { resolve } from "node:path";
import { readFileSync, mkdirSync } from "node:fs";
import { DocumentoPDF } from "../src/lib/consentimientos/DocumentoPDF";
import { componerDocumento } from "../src/lib/consentimientos/merge";
import { contarPaginasPdf } from "../src/lib/consentimientos/caras";

const raiz = process.cwd();
Font.register({ family: "Tinos", fonts: [
  { src: resolve(raiz, "public/fonts/Tinos-Regular.ttf") },
  { src: resolve(raiz, "public/fonts/Tinos-Bold.ttf"), fontWeight: "bold" },
  { src: resolve(raiz, "public/fonts/Tinos-Italic.ttf"), fontStyle: "italic" },
]});

const { pl, bl, cfg } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const destino = process.argv[3];
mkdirSync(destino, { recursive: true });
const bloques = new Map(bl.map(b => [b.codigo, b]));
const logo = "data:image/png;base64," +
  readFileSync(resolve(raiz, "public/logo.png")).toString("base64");

// Los datos de la clínica sí van: son suyos y no cambian de un paciente a
// otro. Lo que se rellena a mano queda vacío.
const datos = {
  paciente: { nombre: "", documento: "", telefono: "" },
  profesional: { nombre: "", colegiado: "", tratamiento: "el Dr./la Dra." },
  clinica: {
    razon_social: cfg.razon_social, cif: cfg.cif,
    registro_sanitario: cfg.registro_sanitario, direccion: cfg.direccion,
    email_dpd: cfg.email_dpd,
  },
  tratamiento: { piezas: "" },
  lugar: cfg.lugar_firma,
  fecha: "",
};

const limpio = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad("ARCHIVO", 42)}${pad("CARAS", 7)}LETRA`);
console.log("-".repeat(58));
for (const p of [...pl].sort((a, b) => a.titulo.localeCompare(b.titulo, "es"))) {
  const nodos = componerDocumento(p.composicion, bloques, datos, "representante");
  const escala = Number(p.escala) || 1;
  const relleno = !!p.relleno;
  const el = createElement(DocumentoPDF,
    { titulo: p.titulo, nodos, datos, logoUrl: logo, escala, relleno });
  const nombre = `${limpio(p.titulo)}.pdf`;
  await renderToFile(el, resolve(destino, nombre));
  const caras = contarPaginasPdf(
    new Uint8Array(await (await pdf(el).toBlob()).arrayBuffer()));
  console.log(`${pad(nombre, 42)}${pad(caras, 7)}${(9.5 * escala).toFixed(1)}pt`);
}
console.log("-".repeat(58));
console.log(`${pl.length} consentimientos en blanco en ${destino}`);
