// Hojas de conformidad con el resultado: qué hojas salen para un presupuesto y
// qué se escribe en cada una.
//
// La hoja trae siete filas de tratamiento (prótesis sobre implantes,
// removible, coronas sobre diente, carillas, blanqueamiento, reconstrucción
// estética y "otro"). Sale UNA hoja por cada fila que tenga el presupuesto, y
// en esa fila se escriben las piezas o el detalle de todo lo que cae en ella:
// dos reconstrucciones estéticas en 21 y 22 son una sola hoja con "21, 22". El
// doctor marca la casilla al firmar; aquí no se marca nada.
//
// Las reglas van sobre el nombre sin acentos y en minúsculas, y se
// contrastaron contra los nombres que hay en la base y contra el catálogo de
// treatments.js. El orden importa: gana la primera que casa.

export const CATEGORIAS = [
  "IMPLANTES", "REMOVIBLE", "CORONAS", "CARILLAS", "BLANQUEAMIENTO", "RECONSTRUCCION",
];

export const NOMBRES_CATEGORIA = {
  IMPLANTES: "Prótesis sobre implantes",
  REMOVIBLE: "Prótesis removible",
  CORONAS: "Corona(s) sobre diente",
  CARILLAS: "Carillas",
  BLANQUEAMIENTO: "Blanqueamiento",
  RECONSTRUCCION: "Reconstrucción estética",
};

const REGLAS = [
  // Retoques sobre algo que ya está hecho: no hay resultado nuevo que firmar.
  [/ajuste|compostura|recementad|retenedor|alargamiento|reparacion|reposicion|rebase|cambio|desmontaje|cortar|limpieza|curetaje|mantenimiento|pulido|tornillo/, null],
  // Provisionales sueltos tampoco. Los paquetes que traen un provisional
  // además del definitivo ("4 IMPLANTES + ... + PROTESIS PROVISIONAL") van
  // con "+" y siguen adelante.
  [/^(?!.*\+).*provisional/, null],
  // Sobredentaduras, barras y ataches son removibles aunque apoyen en
  // implantes: es lo que dice el punto 4 de la hoja sobre adaptación y rebases.
  // Va antes que implantes porque "4 IMPLANTES + BARRA ACKERMAN" lleva las dos.
  [/sobredentadura|ataches|barra ackerman|protesis mixta/,   "REMOVIBLE"],
  [/sobre implante|implantosoportad|arcada ceramica|arcada con implantes|hibrida/, "IMPLANTES"],
  [/protesis (completa|parcial|removible)|parcial flexible|esqueletic/, "REMOVIBLE"],
  [/\bcorona\b|puente/,                                      "CORONAS"],
  [/carilla/,                                                "CARILLAS"],
  [/blanquea/,                                               "BLANQUEAMIENTO"],
  [/reconstruccion.*estetic/,                                "RECONSTRUCCION"],
];

const plano = (t) => String(t || "").normalize("NFD")
  .replace(/[̀-ͯ]/g, "").toLowerCase();

export function categoriaConformidad(nombre) {
  const t = plano(nombre);
  if (!t) return null;
  for (const [re, cat] of REGLAS) if (re.test(t)) return cat;
  return null;
}

// "Corona zirconio   21" → { base: "Corona zirconio", pieza: "21" }. Las
// piezas vienen pegadas al final del nombre tras varios espacios, igual que
// las lee translateTreatment.
export function separarPieza(nombre) {
  const s = String(nombre || "").trim();
  const m = s.match(/^(.*?)\s{2,}(\d{1,2})$/);
  return m ? { base: m[1].trim(), pieza: m[2] } : { base: s.replace(/\s+/g, " "), pieza: null };
}

// Las hojas que pide una lista de tratamientos, en el orden de las filas de la
// hoja. `traducir` pasa el nombre al idioma de la hoja (sin la pieza).
export function hojasConformidad(tratamientos = [], traducir = (x) => x) {
  const porCat = new Map();
  for (const t of tratamientos) {
    const nombre = t?.name ?? t?.nombre ?? t;
    const cat = categoriaConformidad(nombre);
    if (!cat) continue;
    const { base, pieza } = separarPieza(nombre);
    const grupos = porCat.get(cat) || new Map();
    porCat.set(cat, grupos);
    const nom = traducir(base);
    const g = grupos.get(nom) || { nombre: nom, piezas: [], sinPieza: 0 };
    grupos.set(nom, g);
    if (pieza) { if (!g.piezas.includes(pieza)) g.piezas.push(pieza); }
    else g.sinPieza++;
  }
  return CATEGORIAS.filter(c => porCat.has(c)).map(c => {
    const grupos = [...porCat.get(c).values()];
    for (const g of grupos) g.piezas.sort((a, b) => a - b);
    return { categoria: c, fila: CATEGORIAS.indexOf(c), grupos };
  });
}

// Lo que se escribe en la línea de la fila. Dos versiones: la completa, con el
// nombre de cada tratamiento y sus piezas, y una corta solo con las piezas,
// para cuando la completa no cabe en la línea.
export function textoDetalle(grupos) {
  const parte = (g) => {
    const trozos = [];
    if (g.piezas.length) trozos.push(`${g.nombre} ${g.piezas.join(", ")}`);
    if (g.sinPieza) trozos.push(g.sinPieza > 1 ? `${g.nombre} (x${g.sinPieza})` : g.nombre);
    return trozos.join(" · ");
  };
  const completo = grupos.map(parte).join(" · ");
  const piezas = [...new Set(grupos.flatMap(g => g.piezas))].sort((a, b) => a - b);
  const sinPieza = grupos.filter(g => g.sinPieza).map(g => g.sinPieza > 1 ? `${g.nombre} (x${g.sinPieza})` : g.nombre);
  const corto = [piezas.join(", "), ...sinPieza].filter(Boolean).join(" · ");
  return { completo, corto };
}
