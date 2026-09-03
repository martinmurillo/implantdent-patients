/* global process */
// Comprueba que cada consentimiento acaba en un número par de caras.
// Andamio de revisión: maqueta cada plantilla, cuenta páginas y, si sale
// impar, aplica el mismo ajuste que el modal.
import { createElement } from "react";
import { Font, pdf } from "@react-pdf/renderer";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { DocumentoPDF } from "../src/lib/consentimientos/DocumentoPDF";
import { componerDocumento, fechaLarga } from "../src/lib/consentimientos/merge";
import { elegirEscala, contarPaginasPdf } from "../src/lib/consentimientos/caras";

const raiz = process.cwd();
Font.register({ family: "Tinos", fonts: [
  { src: resolve(raiz, "public/fonts/Tinos-Regular.ttf") },
  { src: resolve(raiz, "public/fonts/Tinos-Bold.ttf"), fontWeight: "bold" },
  { src: resolve(raiz, "public/fonts/Tinos-Italic.ttf"), fontStyle: "italic" },
]});

const { pl, bl, cfg, doc } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const bloques = new Map(bl.map(b => [b.codigo, b]));
const logo = "data:image/png;base64," +
  readFileSync(resolve(raiz, "public/logo.png")).toString("base64");
const datos = {
  paciente: { nombre: "Nombre Apellido Apellido", documento: "00000000X", telefono: "600000000" },
  profesional: { nombre: doc.name, colegiado: doc.colegiado || "",
                 tratamiento: doc.tratamiento || "el Dr./la Dra." },
  clinica: { razon_social: cfg.razon_social, cif: cfg.cif,
             registro_sanitario: cfg.registro_sanitario, direccion: cfg.direccion,
             email_dpd: cfg.email_dpd },
  tratamiento: { piezas: "" }, lugar: cfg.lugar_firma, fecha: fechaLarga(),
};

const paginasA = async (nodos, titulo, e) => {
  const b = await pdf(createElement(DocumentoPDF,
    { titulo, nodos, datos, logoUrl: logo, escala: e })).toBlob();
  return contarPaginasPdf(new Uint8Array(await b.arrayBuffer()));
};

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad("PLANTILLA", 28)}${pad("ANTES", 7)}${pad("DESPUES", 9)}ESCALA`);
console.log("-".repeat(56));
let impares = 0, arreglados = 0, sinArreglo = [];
for (const p of [...pl].sort((a, b) => a.codigo.localeCompare(b.codigo))) {
  const nodos = componerDocumento(p.composicion, bloques, datos, "paciente");
  const antes = await paginasA(nodos, p.titulo, 1);
  if (antes % 2 === 0) {
    console.log(`${pad(p.codigo, 28)}${pad(antes, 7)}${pad(antes, 9)}—`);
    continue;
  }
  impares++;
  const r = await elegirEscala((e) => paginasA(nodos, p.titulo, e));
  if (r.paginas % 2 === 0) arreglados++; else sinArreglo.push(p.codigo);
  const marca = r.paginas % 2 === 0 ? "" : "   << sigue impar";
  console.log(`${pad(p.codigo, 28)}${pad(antes, 7)}${pad(r.paginas, 9)}${r.escala}${marca}`);
}
console.log("-".repeat(56));
console.log(`${impares} salian impares · ${arreglados} arreglados` +
  (sinArreglo.length ? ` · sin arreglo: ${sinArreglo.join(", ")}` : ""));
