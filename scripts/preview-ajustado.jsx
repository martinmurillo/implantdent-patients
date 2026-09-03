/* global process */
// Genera el PDF de una plantilla ya ajustada a caras pares, tal y como saldría
// de la app. Andamio de revisión.
import { createElement } from "react";
import { Font, pdf, renderToFile } from "@react-pdf/renderer";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { DocumentoPDF } from "../src/lib/consentimientos/DocumentoPDF";
import { componerDocumento, fechaLarga } from "../src/lib/consentimientos/merge";
import { contarPaginasPdf } from "../src/lib/consentimientos/caras";

const raiz = process.cwd();
Font.register({ family: "Tinos", fonts: [
  { src: resolve(raiz, "public/fonts/Tinos-Regular.ttf") },
  { src: resolve(raiz, "public/fonts/Tinos-Bold.ttf"), fontWeight: "bold" },
  { src: resolve(raiz, "public/fonts/Tinos-Italic.ttf"), fontStyle: "italic" },
]});

const { pl, bl, cfg, doc: profesional } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const bloques = new Map(bl.map(b => [b.codigo, b]));
const logo = "data:image/png;base64," +
  readFileSync(resolve(raiz, "public/logo.png")).toString("base64");
const datos = {
  paciente: { nombre: "Nombre Apellido Apellido", documento: "00000000X", telefono: "600000000" },
  profesional: { nombre: profesional.name, colegiado: profesional.colegiado || "",
                 tratamiento: profesional.tratamiento || "el Dr./la Dra." },
  clinica: { razon_social: cfg.razon_social, cif: cfg.cif,
             registro_sanitario: cfg.registro_sanitario, direccion: cfg.direccion,
             email_dpd: cfg.email_dpd },
  tratamiento: { piezas: "" }, lugar: cfg.lugar_firma, fecha: fechaLarga(),
};

const p = pl.find(x => x.codigo === (process.argv[4] || "ENDODONCIA")) || pl[0];
const nodos = componerDocumento(p.composicion, bloques, datos, "paciente");
// Usa la escala y el relleno ya guardados en la plantilla, que es lo que hace
// el modal: aqui no se vuelve a medir.
const escala = Number(p.escala) || 1;
const relleno = !!p.relleno;
const el = createElement(DocumentoPDF,
  { titulo: p.titulo, nodos, datos, logoUrl: logo, escala, relleno });
const paginas = contarPaginasPdf(new Uint8Array(await (await pdf(el).toBlob()).arrayBuffer()));
await renderToFile(el, process.argv[3]);
console.log(`${p.codigo}: ${paginas} caras${relleno ? " (la ultima en blanco)" : ""} a ${(9.5 * escala).toFixed(1)}pt -> ${process.argv[3]}`);
