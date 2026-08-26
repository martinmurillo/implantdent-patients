// ─── Lectura del presupuesto por posición de columnas ────────────────────────
// Portado casi literal del prototipo (docs/plan-de-pago/plan-de-pago.html),
// donde ya está validado contra los presupuestos que emite el software de la
// clínica. NO reescribir desde cero: el nombre del tratamiento se dibuja en una
// línea de texto ligeramente distinta a la de los importes de su propia fila,
// así que agrupar por texto corrido desalinea las filas. De ahí que se agrupe
// por coordenada vertical y se reparta por franjas de x.
//
// Esto es la vía de respaldo, solo para presupuestos que no estén en el
// sistema. El camino normal es cargar los tratamientos desde la base.
import { loadPdfJs } from "./pdfjs.js";
import { tipoTratamiento } from "./planCalc.js";

export { tipoTratamiento };

// Franjas horizontales de la tabla, en proporción del ancho de página
const X_CODIGO  = 0.155;
const X_NOMBRE  = [0.18, 0.52];
const X_PIEZA   = [0.52, 0.57];
const X_IMPORTE = 0.57;

// Separación vertical a partir de la cual dos fragmentos son filas distintas
const SALTO_FILA = 5;

// "1.234,56" → 1234.56 · "1,234.56" → 1234.56
const num = (s) => {
  s = String(s).trim();
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  return parseFloat(s) || 0;
};

// rows: array de filas; cada fila es un array de { x, top, s } con x
// ya normalizado al ancho de la página.
export function parseRows(rows) {
  const out = [];
  for (const r0 of rows) {
    const r = [...r0].sort((a, b) => a.x - b.x);
    const txt = r.map(w => w.s).join(" ");
    if (/^\s*(subtotal|total|dto\.)/i.test(txt)) break;
    if (/página\s+\d+\s+de/i.test(txt)) continue;

    const code  = r.filter(w => w.x <  X_CODIGO).map(w => w.s).join("");
    const name  = r.filter(w => w.x >= X_NOMBRE[0]  && w.x < X_NOMBRE[1]).map(w => w.s).join(" ").trim();
    const pz    = r.filter(w => w.x >= X_PIEZA[0]   && w.x < X_PIEZA[1]).map(w => w.s).join("").trim();
    const right = r.filter(w => w.x >= X_IMPORTE).map(w => w.s).join(" ");

    const money = [...right.matchAll(/([\d.,]+)\s*€/g)].map(m => num(m[1]));
    const pct   = right.match(/(\d+)\s*%/);

    if (/^\d{3,6}$/.test(code) && money.length) {
      out.push({
        code,
        nombre:  name,
        pieza:   /^\d{1,2}$/.test(pz) ? pz : "",
        bruto:   money[0],                                  // antes del dto.
        neto:    pct ? money[money.length - 1] : null,       // después del dto.
        dtoPct:  pct ? parseInt(pct[1]) : 0,
      });
    } else if (name && !code && out.length && !money.length) {
      // Continuación del nombre de la fila anterior
      out[out.length - 1].nombre += " " + name;
    }
  }
  return out;
}

// El importe que vale es el que quedó tras el descuento del propio PDF
export const importeFila = (fila) => (fila.neto !== null ? fila.neto : fila.bruto);

// Colocación de arranque: si hay implantes, las coronas se van al mes 5,
// que es cuando suele estar osteointegrado. El usuario mueve el resto.
export const colocacionInicial = (tratamientos) => {
  const hayImplantes = tratamientos.some(t => tipoTratamiento(t.nombre) === "implante");
  return tratamientos.map(t => ({
    ...t,
    mes: hayImplantes && tipoTratamiento(t.nombre) === "corona" ? 5 : 1,
  }));
};

// ─── Lectura del archivo ─────────────────────────────────────────────────────
export async function parsePlanPDF(file) {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;

  const rows = [];
  let meta = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const pg = await pdf.getPage(p);
    const vp = pg.getViewport({ scale: 1 });
    const items = (await pg.getTextContent()).items
      .filter(i => i.str.trim())
      .map(i => ({ x: i.transform[4] / vp.width, top: vp.height - i.transform[5], s: i.str.trim() }));
    meta += " " + items.map(i => i.s).join(" ");

    items.sort((a, b) => a.top - b.top);
    let cur = [];
    items.forEach(i => {
      if (cur.length && i.top - cur[cur.length - 1].top > SALTO_FILA) { rows.push(cur); cur = []; }
      cur.push(i);
    });
    if (cur.length) rows.push(cur);
  }

  const pm = meta.match(/Nombre\s*:\s*([A-ZÁÉÍÓÚÑ][^:]*?)\s+DNI/i);
  return { paciente: pm ? pm[1].trim() : "", filas: parseRows(rows) };
}
