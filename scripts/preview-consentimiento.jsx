/* global process */
// Andamio de revisión: genera el PDF de una plantilla desde Node.
// Se empaqueta con `vite build --ssr`. No forma parte de la app.
import { createElement } from "react";
import { Font, renderToFile } from "@react-pdf/renderer";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { DocumentoPDF } from "../src/lib/consentimientos/DocumentoPDF";
import { componerDocumento, fechaLarga } from "../src/lib/consentimientos/merge";

const raiz = process.cwd();
const leer = (p) => JSON.parse(readFileSync(resolve(raiz, p), "utf8"));

// En el navegador las fuentes se sirven desde /fonts; aquí hay que darlas
// por ruta de disco, así que se vuelve a registrar la familia.
Font.register({
  family: "Tinos",
  fonts: [
    { src: resolve(raiz, "public/fonts/Tinos-Regular.ttf") },
    { src: resolve(raiz, "public/fonts/Tinos-Bold.ttf"), fontWeight: "bold" },
    { src: resolve(raiz, "public/fonts/Tinos-Italic.ttf"), fontStyle: "italic" },
  ],
});

const codigo = process.argv[2] || "endodoncia";
const salida = process.argv[3] || resolve(raiz, `${codigo}.pdf`);

const plantilla = leer(`docs/consentimientos/seed/plantillas/${codigo}.json`);
const bloques = new Map(
  leer("docs/consentimientos/seed/bloques-compartidos.json").bloques.map(b => [b.codigo, b]),
);

// Paciente de ejemplo mayor de 16: firma él, así que el bloque de
// representante tiene que desaparecer del documento.
const datos = {
  paciente: {
    nombre: "Nombre Apellido Apellido", documento: "00000000X",
    fecha_nacimiento: "01/01/1980", edad: 46,
    domicilio: "Carrer Exemple 1, Girona", telefono: "600000000",
    historia_clinica: "20700",
  },
  profesional: { nombre: "Sergio Molina", colegiado: "5296" },
  clinica: {
    razon_social: "CLINICA IMPLANTDENT SL",
    cif: "FALTA CIF", registro_sanitario: "FALTA REGISTRO SANITARIO",
    direccion: "Carrer de Santa Eugènia, 2", email_dpd: "info@dentalimplantdent.com",
  },
  tratamiento: { piezas: "16, 17" },
  lugar: "Girona",
  fecha: fechaLarga(),
};

const nodos = componerDocumento(plantilla.composicion, bloques, datos, "paciente");

await renderToFile(
  createElement(DocumentoPDF, {
    titulo: plantilla.titulo, nodos, datos,
    // como data URI: react-pdf trata las rutas de disco como URL y falla
    logoUrl: "data:image/png;base64," +
      readFileSync(resolve(raiz, "public/logo.png")).toString("base64"),
  }),
  salida,
);
// Comprobaciones sobre el árbol YA fusionado, que es donde se ve si la
// sustitución funcionó. En el PDF no se puede leer: react-pdf incrusta la
// fuente como subconjunto y el texto queda con codificación propia.
const plano = JSON.stringify(nodos);
const pruebas = [
  ["marcadores {{ }} sin resolver", !plano.includes("{{")],
  ["nombre del paciente",           plano.includes("Nombre Apellido")],
  ["documento del paciente",        plano.includes("00000000X")],
  ["profesional y colegiado",       plano.includes("Sergio Molina") && plano.includes("5296")],
  ["piezas del tratamiento",        plano.includes("16, 17")],
  ["lugar y fecha",                 plano.includes("Girona")],
  ["linea de puntos donde falta",   plano.includes("....")],
  ["cita la Ley 41/2002",           plano.includes("41/2002")],
  ["bloque representante fuera",    !plano.includes("bloque_representante")],
  ["bloque de firmas presente",     plano.includes('"tipo":"firmas"')],
];
console.log(`
${codigo} — ${nodos.length} nodos → ${salida}`);
for (const [nombre, ok] of pruebas) {
  console.log(`  ${ok ? "OK  " : "FALLA"} ${nombre}`);
}
const tipos = {};
for (const n of nodos) tipos[n.tipo] = (tipos[n.tipo] || 0) + 1;
console.log("  tipos:", Object.entries(tipos).map(([k,v]) => `${k}×${v}`).join(" "));
