// Hojas ya maquetadas que se pegan al final del PDF de consentimientos: la de
// recomendaciones postoperatorias de implantes y la de conformidad con el
// resultado. Vienen en cuatro idiomas y están en public/postoperatorio y
// public/conformidad.
//
// pdf-lib se importa desde quien llama, con import() dinámico, por lo mismo
// que @react-pdf: solo lo descarga quien imprime.

import { textoDetalle } from "./conformidad.js";

export const IDIOMAS_HOJAS = [["ES", "Español"], ["CA", "Català"], ["FR", "Français"], ["EN", "English"]];

const cargarPorUrl = async (ruta) => {
  const r = await fetch(ruta);
  if (!r.ok) throw new Error(`no se encuentra ${ruta}`);
  return r.arrayBuffer();
};

// Dónde va cada cosa en la hoja de conformidad, en puntos PDF (origen abajo a
// la izquierda). Sacado de la posición del texto de cada rótulo con pdfjs: el
// nombre y la historia empiezan donde acaba su rótulo, porque cambia de largo
// con el idioma. En la inglesa todo el bloque de tratamientos está 4,5 pt más
// arriba por el título, que ocupa más.
const FILAS = [633.4, 616.2, 598.9, 582.4, 565.2, 547.9];
const POS_CONFORMIDAD = {
  ES: { nombre: 113.6, historia: 481.8, filas: FILAS },
  CA: { nombre: 94.5,  historia: 488.5, filas: FILAS },
  FR: { nombre: 94.4,  historia: 481.9, filas: FILAS },
  EN: { nombre: 73.4,  historia: 470.2, filas: FILAS.map(y => y - 4.5) },
};
const Y_DATOS = 721.2;          // línea de nombre y nº de historia
const FIN_NOMBRE = 376;         // la línea del nombre acaba antes del rótulo de la historia
const FIN_HISTORIA = 564;
const X_DETALLE = 220;          // columna "Nº de piezas / detalles"
const FIN_DETALLE = 553;

// Casillas de la declaración del paciente. No se marcan: el paciente la lee y
// firma. Se tapan con blanco, y también el "Marque cada casilla" del rótulo.
// Son las líneas base de los números 1 a 7 de cada punto; la casilla queda a
// su izquierda, de x 31 a 43 y de 4 pt por debajo a 7 por encima.
const DECLARACION = {
  ES: { puntos: [433.9, 405.4, 376.9, 348.4, 309.4, 269.7, 241.2], aviso: [499.3, 470.7] },
  CA: { puntos: [433.9, 405.4, 376.9, 348.4, 309.4, 269.7, 241.2], aviso: [499.3, 470.7] },
  FR: { puntos: [433.9, 405.4, 376.9, 348.4, 298.2, 269.7, 241.2], aviso: [496.1, 470.7] },
  EN: { puntos: [424.9, 406.2, 377.7, 349.2, 310.2, 270.4, 242.7], aviso: [518.8, 462.4] },
};
const FIN_AVISO = 566;

function quitarCasillas(pagina, idioma, rgb) {
  const d = DECLARACION[idioma] || DECLARACION.ES;
  const blanco = rgb(1, 1, 1);
  for (const y of d.puntos)
    pagina.drawRectangle({ x: 29.5, y: y - 6, width: 15.5, height: 15, color: blanco });
  const [x, y] = d.aviso;
  pagina.drawRectangle({ x: x - 3, y: y - 3, width: FIN_AVISO - x + 3, height: 11, color: blanco });
  // La raya del rótulo acababa donde empezaba el aviso: se alarga hasta el margen.
  pagina.drawLine({ start: { x: x - 14, y: y + 2.4 }, end: { x: 564.1, y: y + 2.4 },
    thickness: 0.6, color: rgb(0.85, 0.87, 0.91) });
}

// Helvetica de pdf-lib codifica en WinAnsi: lo que no está ahí revienta al
// escribir. Los nombres son castellano/catalán/francés, que sí entran; esto
// es por si acaso llega algo raro de la base.
const limpio = (s) => String(s || "").replace(/\s+/g, " ").replace(/[^\x20-\x7E\xA0-\xFF·]/g, "").trim();

// Escribe el texto en la línea, bajando la letra hasta que quepa.
// Con `cortar`, si ni así cabe se recorta con puntos suspensivos; sin él,
// devuelve false y no escribe nada.
function escribir(pagina, fuente, texto, { x, y, hasta, tam = 10, min = 6.5, color, cortar = false }) {
  let t = tam;
  while (t > min && fuente.widthOfTextAtSize(texto, t) > hasta - x) t -= 0.25;
  if (fuente.widthOfTextAtSize(texto, t) > hasta - x) {
    if (!cortar) return false;
    while (texto.length > 1 && fuente.widthOfTextAtSize(texto + "…", t) > hasta - x) texto = texto.slice(0, -1);
    texto = texto.trimEnd() + "…";
  }
  pagina.drawText(texto, { x, y, size: t, font: fuente, color });
  return true;
}

// Para imprimir a doble cara: cada hoja en papel aparte, no en el reverso de
// la anterior.
function aPar(doc) {
  if (doc.getPageCount() % 2 === 1) {
    const { width, height } = doc.getPage(0).getSize();
    doc.addPage([width, height]);
  }
}

export async function anadirPostop(pdfLib, doc, idioma, cargar = cargarPorUrl) {
  const extra = await pdfLib.PDFDocument.load(await cargar(`/postoperatorio/implantes_${idioma}.pdf`));
  aPar(doc);
  (await doc.copyPages(extra, extra.getPageIndices())).forEach(p => doc.addPage(p));
}

// Una hoja por fila del presupuesto, con nombre, historia y el detalle de esa
// fila ya escritos. `hojas` es lo que devuelve hojasConformidad().
//
// Cada una sale dos veces: se firma por duplicado, un ejemplar para el
// paciente y otro para la clínica.
export async function anadirConformidad(pdfLib, doc, idioma, hojas, paciente, cargar = cargarPorUrl) {
  const { PDFDocument, StandardFonts, rgb } = pdfLib;
  const plantilla = await PDFDocument.load(await cargar(`/conformidad/conformidad_${idioma}.pdf`));
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const color = rgb(0.10, 0.16, 0.36);
  const pos = POS_CONFORMIDAD[idioma] || POS_CONFORMIDAD.ES;
  const nombre = limpio(paciente.nombre);
  const historia = limpio(paciente.historia);

  for (const h of hojas) for (let copia = 0; copia < 2; copia++) {
    aPar(doc);
    const [pagina] = await doc.copyPages(plantilla, [0]);
    doc.addPage(pagina);
    quitarCasillas(pagina, idioma, rgb);
    if (nombre) escribir(pagina, fuente, nombre,
      { x: pos.nombre + 8, y: Y_DATOS + 1.5, hasta: FIN_NOMBRE, tam: 10.5, color, cortar: true });
    if (historia) escribir(pagina, fuente, historia,
      { x: pos.historia + 8, y: Y_DATOS + 1.5, hasta: FIN_HISTORIA, tam: 10.5, color, cortar: true });

    const { completo, corto } = textoDetalle(h.grupos);
    const y = pos.filas[h.fila] - 1.5;
    const datos = { x: X_DETALLE, y, hasta: FIN_DETALLE, tam: 9, color };
    // Si con todos los nombres no cabe ni con letra pequeña, solo las piezas.
    if (!escribir(pagina, fuente, limpio(completo), datos))
      escribir(pagina, fuente, limpio(corto), { ...datos, min: 5, cortar: true });
  }
}
