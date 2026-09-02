/* global process */
// Comprueba el PDF conjunto: varios consentimientos en un archivo, cada uno
// en hoja nueva y numerando sus propias hojas. Andamio de revisión.
import { createElement } from "react";
import { Font, renderToFile } from "@react-pdf/renderer";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { DocumentoConjunto } from "../src/lib/consentimientos/DocumentoPDF";
import { componerDocumento, fechaLarga } from "../src/lib/consentimientos/merge";

const raiz = process.cwd();
Font.register({ family: "Tinos", fonts: [
  { src: resolve(raiz, "public/fonts/Tinos-Regular.ttf") },
  { src: resolve(raiz, "public/fonts/Tinos-Bold.ttf"), fontWeight: "bold" },
  { src: resolve(raiz, "public/fonts/Tinos-Italic.ttf"), fontStyle: "italic" },
]});

const { pl, bl, cfg, doc } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const bloques = new Map(bl.map(b => [b.codigo, b]));
const datos = {
  paciente: { nombre: "Nombre Apellido Apellido", documento: "00000000X", telefono: "600000000" },
  profesional: { nombre: doc.name, colegiado: doc.colegiado || "" },
  clinica: { razon_social: cfg.razon_social, cif: cfg.cif,
             registro_sanitario: cfg.registro_sanitario, direccion: cfg.direccion,
             email_dpd: cfg.email_dpd },
  tratamiento: { piezas: "" }, lugar: cfg.lugar_firma, fecha: fechaLarga(),
};
const cuales = process.argv[4].split(",");
const docs = cuales.map(c => {
  const p = pl.find(x => x.codigo === c);
  return { titulo: p.titulo, nodos: componerDocumento(p.composicion, bloques, datos, "paciente"), datos };
});
await renderToFile(
  createElement(DocumentoConjunto, { docs,
    logoUrl: "data:image/png;base64," + readFileSync(resolve(raiz, "public/logo.png")).toString("base64") }),
  process.argv[3]);
console.log(`${docs.length} consentimientos en un archivo: ${docs.map(d => d.titulo).join(" + ")}`);
