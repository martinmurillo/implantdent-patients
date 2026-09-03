/* global process */
// Genera el PDF de un consentimiento con datos reales, replicando exactamente
// lo que hace el modal. Andamio de verificación: no forma parte de la app.
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

const { pac, pl, bl, cfg, doc } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const firmante = process.argv[4] || "paciente";
const plantilla = pl[0];
const bloques = new Map(bl.map(b => [b.codigo, b]));

// Misma construcción que BotonConsentimientos
const datos = {
  paciente: { nombre: pac.name || "", documento: pac.dni || "", telefono: pac.phone || "" },
  profesional: { nombre: doc.name, colegiado: doc.colegiado || "",
                 tratamiento: doc.tratamiento || "el Dr./la Dra." },
  clinica: {
    razon_social: cfg.razon_social, cif: cfg.cif,
    registro_sanitario: cfg.registro_sanitario, direccion: cfg.direccion,
    email_dpd: cfg.email_dpd,
  },
  tratamiento: { piezas: "16, 17" },
  lugar: cfg.lugar_firma,
  fecha: fechaLarga(),
};

const composicion = plantilla.composicion.map(item =>
  ("ref" in item && item.ref === "firmas_paciente" && firmante === "representante")
    ? { ref: "firmas_representante" } : item);
const nodos = componerDocumento(composicion, bloques, datos, firmante);

await renderToFile(
  createElement(DocumentoPDF, {
    titulo: plantilla.titulo, nodos, datos,
    logoUrl: "data:image/png;base64," +
      readFileSync(resolve(raiz, "public/logo.png")).toString("base64"),
  }),
  process.argv[3],
);

const plano = JSON.stringify(nodos);
const pruebas = [
  ["marcadores {{ }} sin resolver", !plano.includes("{{")],
  ["nombre real del paciente",      plano.includes(pac.name)],
  ["documento real",                plano.includes(pac.dni)],
  ["profesional y colegiado",       plano.includes(doc.name) && plano.includes(doc.colegiado)],
  ["piezas",                        plano.includes("16, 17")],
  ["cita la Ley 41/2002",           plano.includes("41/2002")],
  ["sin fecha de nacimiento",       !plano.includes("nacido/a")],
  // el domicilio de la CLINICA sigue estando, en proteccion de datos;
  // lo que no debe quedar es el del paciente
  ["sin domicilio del paciente",    !plano.includes("y con domicilio en")],
  [firmante === "representante" ? "bloque representante DENTRO" : "bloque representante fuera",
   firmante === "representante" ? plano.includes("padre, madre o tutor") : !plano.includes("bloque_representante")],
];
console.log(`\n${plantilla.codigo} · firmante: ${firmante} · ${nodos.length} nodos`);
for (const [n, ok] of pruebas) console.log(`  ${ok ? "OK   " : "FALLA"} ${n}`);
