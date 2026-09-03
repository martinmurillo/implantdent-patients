/* global process */
// Calcula, para cada plantilla, la letra más grande con la que sigue ocupando
// un número par de caras, y emite el SQL para guardarla.
//
// Va aquí y no en la app porque cuesta unos cuantos maquetados por plantilla,
// y el contenido de una plantilla solo cambia cuando alguien la edita.
//
//   node .preview-dist/ajustar-escalas.js volcado.json > escalas.sql
import { createElement } from "react";
import { Font, pdf } from "@react-pdf/renderer";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { DocumentoPDF } from "../src/lib/consentimientos/DocumentoPDF";
import { componerDocumento, fechaLarga } from "../src/lib/consentimientos/merge";
import { mejorEscala, contarPaginasPdf } from "../src/lib/consentimientos/caras";

const raiz = process.cwd();
Font.register({ family: "Tinos", fonts: [
  { src: resolve(raiz, "public/fonts/Tinos-Regular.ttf") },
  { src: resolve(raiz, "public/fonts/Tinos-Bold.ttf"), fontWeight: "bold" },
  { src: resolve(raiz, "public/fonts/Tinos-Italic.ttf"), fontStyle: "italic" },
]});

const { pl, bl, cfg } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const bloques = new Map(bl.map(b => [b.codigo, b]));
const logo = "data:image/png;base64," +
  readFileSync(resolve(raiz, "public/logo.png")).toString("base64");

// Nombres largos a propósito: la escala se calcula con el peor caso razonable,
// para que un paciente con apellidos largos no desborde la última línea.
const datos = {
  paciente: { nombre: "MARIA DEL CARMEN FERNANDEZ DE LA IGLESIA",
              documento: "00000000-X", telefono: "600000000" },
  profesional: { nombre: "Maiyelin Llanes Rodriguez", colegiado: "9391",
                 tratamiento: "la Dra." },
  clinica: { razon_social: cfg.razon_social, cif: cfg.cif,
             registro_sanitario: cfg.registro_sanitario, direccion: cfg.direccion,
             email_dpd: cfg.email_dpd },
  tratamiento: { piezas: "" }, lugar: cfg.lugar_firma, fecha: fechaLarga(),
};

const pad = (s, n) => String(s).padEnd(n);
const lineas = ["-- Generado por scripts/ajustar-escalas.jsx. No editar a mano.", "begin;"];
console.error(`\n${pad("PLANTILLA", 28)}${pad("NORMAL", 8)}${pad("CARAS", 7)}${pad("ESCALA", 8)}LETRA`);
console.error("-".repeat(60));

for (const p of [...pl].sort((a, b) => a.codigo.localeCompare(b.codigo))) {
  // El bloque de representante alarga el documento; se calcula con él dentro,
  // que es el caso que más ocupa.
  const nodos = componerDocumento(p.composicion, bloques, datos, "representante");
  const medir = async (e) => {
    const b = await pdf(createElement(DocumentoPDF,
      { titulo: p.titulo, nodos, datos, logoUrl: logo, escala: e })).toBlob();
    return contarPaginasPdf(new Uint8Array(await b.arrayBuffer()));
  };
  const normal = await medir(1);
  const r = await mejorEscala(medir);
  const caras = r.relleno ? `${r.paginas}+1` : String(r.paginas);
  const aviso = r.relleno ? "   << cara en blanco" : (r.alcanzado ? "" : "   << no llega a par");
  console.error(`${pad(p.codigo, 28)}${pad(normal, 8)}${pad(caras, 7)}` +
    `${pad(r.escala, 8)}${(9.5 * r.escala).toFixed(1)}pt${aviso}`);
  lineas.push(`update consent_plantillas set escala = ${r.escala}, relleno = ${!!r.relleno} where codigo = '${p.codigo}';`);
}
lineas.push("commit;");
console.error("-".repeat(60));
process.stdout.write(lineas.join("\n") + "\n");
