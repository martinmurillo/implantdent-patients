/* global process */
// Genera el PDF de TODAS las plantillas, para poder revisarlas de una tacada.
// Lee de un volcado de la base, así que enseña lo que produciría la app, no lo
// que dice el seed. Paciente ficticio: esto se abre muchas veces y no debe
// mover datos de salud de nadie. Andamio de revisión, no forma parte de la app.
import { createElement } from "react";
import { Font, renderToFile } from "@react-pdf/renderer";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { DocumentoPDF } from "../src/lib/consentimientos/DocumentoPDF";
import { componerDocumento, fechaLarga } from "../src/lib/consentimientos/merge";

const raiz = process.cwd();
Font.register({
  family: "Tinos",
  fonts: [
    { src: resolve(raiz, "public/fonts/Tinos-Regular.ttf") },
    { src: resolve(raiz, "public/fonts/Tinos-Bold.ttf"), fontWeight: "bold" },
    { src: resolve(raiz, "public/fonts/Tinos-Italic.ttf"), fontStyle: "italic" },
  ],
});

const { pl, bl, cfg, doc } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const destino = process.argv[3];
const bloques = new Map(bl.map(b => [b.codigo, b]));
const logo = "data:image/png;base64," +
  readFileSync(resolve(raiz, "public/logo.png")).toString("base64");

const datos = {
  paciente: { nombre: "Nombre Apellido Apellido", documento: "00000000X", telefono: "600000000" },
  profesional: { nombre: doc.name, colegiado: doc.colegiado || "" },
  clinica: {
    razon_social: cfg.razon_social, cif: cfg.cif,
    registro_sanitario: cfg.registro_sanitario, direccion: cfg.direccion,
    email_dpd: cfg.email_dpd,
  },
  tratamiento: { piezas: "16, 17" },
  lugar: cfg.lugar_firma,
  fecha: fechaLarga(),
};

// Restos de OCR: puntos suspensivos largos, o rachas de fragmentos de una o
// dos letras, que es como se ve el ruido del reconocimiento.
const sospechoso = (t) =>
  t.includes("………") || /\b[a-zA-Z]{1,2}(\s+[a-zA-Z]{1,2}){3,}\b/.test(t);

const filas = [];
for (const p of pl) {
  const nodos = componerDocumento(p.composicion, bloques, datos, "paciente");
  const nombre = `${p.activa ? "" : "inactiva-"}${p.codigo}.pdf`;
  await renderToFile(
    createElement(DocumentoPDF, { titulo: p.titulo, nodos, datos, logoUrl: logo }),
    resolve(destino, nombre),
  );
  const textos = [];
  const recoger = (ns) => ns.forEach(n => {
    if (n.texto) textos.push(n.texto);
    if (n.items) textos.push(...n.items);
    if (n.nodos) recoger(n.nodos);
    if (n.etiqueta) textos.push(n.etiqueta);
  });
  recoger(nodos);
  filas.push({
    codigo: p.codigo,
    activa: p.activa,
    nodos: nodos.length,
    marcadores: textos.filter(t => t.includes("{{")).length,
    ocr: textos.filter(sospechoso).length,
  });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad("PLANTILLA", 28)}${pad("ACTIVA", 8)}${pad("NODOS", 7)}${pad("{{}}", 6)}RESTOS OCR`);
console.log("-".repeat(62));
for (const f of filas) {
  console.log(pad(f.codigo, 28) + pad(f.activa ? "sí" : "no", 8) + pad(f.nodos, 7) +
    pad(f.marcadores || "-", 6) + (f.ocr ? `${f.ocr} ⚠` : "-"));
}
console.log("-".repeat(62));
console.log(`${filas.length} PDF en ${destino}`);
console.log(`con restos de OCR: ${filas.filter(f => f.ocr).length} · con marcadores sin resolver: ${filas.filter(f => f.marcadores).length}`);
