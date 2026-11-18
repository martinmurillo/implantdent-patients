// Hoja de radiografía: un A4 con el logo y los datos de la clínica arriba, la
// panorámica del paciente en medio con las piezas del presupuesto marcadas
// sobre ella, y abajo la lista de tratamientos. Sale entera del botón, en
// papel en blanco: la radiografía la sube quien imprime (el TIF que exporta
// Sidexis) y no se guarda en ningún sitio.
//
// No hay IA: las piezas ya vienen en el presupuesto ("Corona zirconio   21").
// Lo único que hay que saber es dónde cae cada una en la imagen. La app
// propone una posición con la plantilla de abajo y en pantalla se arrastra la
// marca encima del diente si no ha caído bien.
//
// pdf-lib llega por parámetro, con import() dinámico desde quien llama, igual
// que en hojasPaciente.js.

import { separarPieza } from "./consentimientos/conformidad.js";
import { simboloDe, arcadaDe, alturaPorDefecto, dibujo, union, medidas } from "./hojaRxDibujos.js";

// ── Dónde cae cada pieza en una panorámica ─────────────────────────────────
// Medido sobre una panorámica del aparato de la clínica (Sidexis, 2440×1292).
// Distancia horizontal desde la línea media, en fracción del ancho de la
// imagen, para las posiciones 1 (central) a 8 (cordal). El cuadrante 1 y el 4
// (derecha del paciente) caen a la izquierda de la imagen.
const DESDE_CENTRO = [0.013, 0.036, 0.062, 0.090, 0.120, 0.160, 0.205, 0.250];
// Altura del centro de la marca: entre corona y raíz de cada arcada.
const Y_SUPERIOR = 0.48;
const Y_INFERIOR = 0.68;

// Pieza FDI → { x, y } en fracción de la imagen (0..1), o null si no es una
// pieza válida. Las temporales (51-85) van donde su permanente.
export function posicionPlantilla(pieza) {
  const n = Number(pieza);
  if (!Number.isInteger(n)) return null;
  let cuadrante = Math.floor(n / 10), pos = n % 10;
  if (cuadrante >= 5 && cuadrante <= 8) {
    if (pos > 5) return null;
    cuadrante -= 4;
  }
  if (cuadrante < 1 || cuadrante > 4 || pos < 1 || pos > 8) return null;
  const lado = (cuadrante === 1 || cuadrante === 4) ? -1 : 1;
  return {
    x: 0.5 + lado * DESDE_CENTRO[pos - 1],
    y: cuadrante <= 2 ? Y_SUPERIOR : Y_INFERIOR,
  };
}

export const esSuperior = (pieza) => [1, 2, 5, 6].includes(Math.floor(Number(pieza) / 10));

// ── Tratamientos ───────────────────────────────────────────────────────────
// Agrupa los tratamientos del presupuesto por nombre, con sus piezas. Los
// repetidos sin pieza se cuentan. `traducir` pasa el nombre al idioma.
export function agruparTratamientos(tratamientos = [], traducir = (x) => x) {
  const grupos = new Map();
  for (const t of tratamientos) {
    const nombre = t?.name ?? t?.nombre ?? t;
    if (!String(nombre || "").trim()) continue;
    const { base, pieza } = separarPieza(nombre);
    const nom = traducir(base);
    const g = grupos.get(nom) || { nombre: nom, piezas: [], sinPieza: 0 };
    grupos.set(nom, g);
    if (pieza) { if (!g.piezas.includes(pieza)) g.piezas.push(pieza); }
    else g.sinPieza++;
  }
  const lista = [...grupos.values()];
  for (const g of lista) g.piezas.sort((a, b) => a - b);
  return lista;
}

// Las piezas distintas que salen en el presupuesto y se pueden marcar.
export function piezasDelPresupuesto(tratamientos = []) {
  const set = new Set();
  for (const t of tratamientos) {
    const { pieza } = separarPieza(t?.name ?? t?.nombre ?? t);
    if (pieza && posicionPlantilla(pieza)) set.add(pieza);
  }
  return [...set].sort((a, b) => a - b);
}

// ── Símbolos ───────────────────────────────────────────────────────────────
// Cada fila del presupuesto, con su pieza (si la trae en el nombre), su
// símbolo y, para las que no traen pieza, la arcada que dice el nombre.
export function filasDelPresupuesto(tratamientos = []) {
  return tratamientos.map((t, i) => {
    const nombre = t?.name ?? t?.nombre ?? t;
    const { base, pieza } = separarPieza(nombre);
    return { i, base, pieza: pieza && posicionPlantilla(pieza) ? pieza : null,
      simbolo: simboloDe(base), arcada: arcadaDe(base) };
  }).filter(f => String(f.base || "").trim());
}

// Las piezas de cada fila: la del nombre o, si no trae, las que se eligieron
// a mano (prótesis removibles, que vienen como "superior"/"inferior").
export const piezasDeFila = (f, elegidas = {}) =>
  f.pieza ? [f.pieza] : (elegidas[f.i] || []).filter(p => posicionPlantilla(p));

// Los símbolos de las filas, colocados donde suele caer cada cosa. Una pieza
// con varias letras (R y EN) las apila hacia la raíz.
export function simbolosIniciales(filas = [], elegidas = {}) {
  const lista = [];
  const letrasPorPieza = {};
  for (const f of filas) {
    if (!f.simbolo) continue;
    for (const pieza of piezasDeFila(f, elegidas)) {
      const s = { id: `${f.i}:${pieza}`, fila: f.i, pieza, ...f.simbolo };
      let apilado = 0;
      if (s.tipo === "letra") { apilado = letrasPorPieza[pieza] || 0; letrasPorPieza[pieza] = apilado + 1; }
      lista.push({ ...s, x: posicionPlantilla(pieza).x, y: alturaPorDefecto(s, apilado), escala: 1 });
    }
  }
  return lista;
}

// Agrupa las filas por nombre para la lista de abajo, con sus piezas y el
// símbolo que llevan en la radiografía. `traducir` pasa el nombre al idioma.
export function agruparFilas(filas = [], elegidas = {}, traducir = (x) => x) {
  const grupos = new Map();
  for (const f of filas) {
    const nom = traducir(f.base);
    const g = grupos.get(nom) || { nombre: nom, piezas: [], sinPieza: 0, simbolo: null };
    grupos.set(nom, g);
    const piezas = piezasDeFila(f, elegidas);
    if (piezas.length) {
      for (const p of piezas) if (!g.piezas.includes(p)) g.piezas.push(p);
      g.simbolo = g.simbolo || f.simbolo;
    } else g.sinPieza++;
  }
  const lista = [...grupos.values()];
  for (const g of lista) g.piezas.sort((a, b) => a - b);
  return lista;
}

// Medidas de la radiografía en el papel, en mm: a todo el ancho entre
// márgenes de 12 mm, y como mucho 120 mm de alto.
export function medidasImagenMm(ancho, alto) {
  const h = Math.min(186 * alto / ancho, 120);
  return { w: h * ancho / alto, h };
}

// Reparte etiquetas en una fila para que no se pisen: cada una queda lo más
// cerca posible de su x, a `sep` como mínimo de la de al lado, y dentro de
// [min, max]. Devuelve las x en el mismo orden en que llegan.
export function repartir(xs, sep, min, max) {
  const orden = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const n = orden.length;
  if (!n) return [];
  // Si no caben todas, se reparten a lo ancho.
  if ((n - 1) * sep > max - min) {
    const paso = n > 1 ? (max - min) / (n - 1) : 0;
    const r = [];
    orden.forEach((o, k) => { r[o.i] = min + k * paso; });
    return r;
  }
  const pos = orden.map(o => Math.min(max, Math.max(min, o.x)));
  // Se empuja a la derecha lo que se pisa y luego a la izquierda lo que se sale.
  for (let k = 1; k < n; k++) pos[k] = Math.max(pos[k], pos[k - 1] + sep);
  if (pos[n - 1] > max) {
    pos[n - 1] = max;
    for (let k = n - 2; k >= 0; k--) pos[k] = Math.min(pos[k], pos[k + 1] - sep);
  }
  // Y se centra cada bloque de etiquetas apiñadas sobre sus x reales, para que
  // un grupo empujado no quede todo a un lado.
  let a = 0;
  while (a < n) {
    let b = a;
    while (b + 1 < n && pos[b + 1] - pos[b] <= sep + 1e-6) b++;
    if (b > a) {
      const media = orden.slice(a, b + 1).reduce((s, o) => s + o.x, 0) / (b - a + 1);
      const centro = (pos[a] + pos[b]) / 2;
      let d = media - centro;
      const izq = a > 0 ? pos[a - 1] + sep : min;
      const der = b < n - 1 ? pos[b + 1] - sep : max;
      d = Math.max(izq - pos[a], Math.min(der - pos[b], d));
      for (let k = a; k <= b; k++) pos[k] += d;
    }
    a = b + 1;
  }
  const r = [];
  orden.forEach((o, k) => { r[o.i] = pos[k]; });
  return r;
}

// ── Aclarar para imprimir ──────────────────────────────────────────────────
// Una panorámica es casi toda gris medio, y en una impresora láser en blanco
// y negro los grises medios salen más oscuros que en pantalla. Aclarar sube
// el negro (menos tóner, menos contraste) y abre los medios; invertir pasa a
// negativo. Sidexis no guarda su inversión al exportar el TIF, por eso se
// hace aquí. Devuelve la tabla de 256 valores que se aplica a cada píxel.
export function tablaTonos(aclarar = 0, invertir = false) {
  const a = Math.min(1, Math.max(0, Number(aclarar) || 0));
  const suelo = a * 150, gamma = 1 - a * 0.45;
  const t = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const base = invertir ? 255 - v : v;
    t[v] = Math.round(suelo + (255 - suelo) * Math.pow(base / 255, gamma));
  }
  return t;
}

// "Dra. Laura Pérez" a partir de la fila de doctors. El tratamiento se guarda
// con artículo ("la Dra.") para los consentimientos; aquí sobra.
export function nombreDoctor(d) {
  if (!d?.name) return "";
  const titulo = String(d.tratamiento || "").replace(/^\s*(el|la)\s+/i, "").trim();
  return titulo && !titulo.includes("/") ? `${titulo} ${d.name}` : d.name;
}

// ── Textos ─────────────────────────────────────────────────────────────────
export const TEXTOS = {
  ES: { titulo: "PLAN DE TRATAMIENTO", paciente: "Paciente", historia: "Nº H.C.", fecha: "Fecha",
        nota: "Los números marcados sobre la radiografía son las piezas dentales (numeración FDI).", tel: "Tel." },
  CA: { titulo: "PLA DE TRACTAMENT", paciente: "Pacient", historia: "Núm. H.C.", fecha: "Data",
        nota: "Els números marcats sobre la radiografia són les peces dentals (numeració FDI).", tel: "Tel." },
  FR: { titulo: "PLAN DE TRAITEMENT", paciente: "Patient", historia: "N° dossier", fecha: "Date",
        nota: "Les numéros marqués sur la radiographie sont les dents (numérotation FDI).", tel: "Tél." },
  EN: { titulo: "TREATMENT PLAN", paciente: "Patient", historia: "Record no.", fecha: "Date",
        nota: "The numbers marked on the X-ray are the teeth (FDI numbering).", tel: "Tel." },
};

// Helvetica de pdf-lib codifica en WinAnsi: lo que no entra revienta.
const limpio = (s) => String(s || "").replace(/\s+/g, " ").replace(/[^\x20-\x7E\xA0-\xFF·]/g, "").trim();

const MM = 72 / 25.4;

// ── El PDF ─────────────────────────────────────────────────────────────────
// imagen: { bytes (JPEG), ancho, alto } en píxeles.
// simbolos: los de simbolosIniciales(), ya movidos; x, y en fracción de la imagen.
// escalaGlobal: tamaño de todos los dibujos (1 = normal).
// grupos: lo que devuelve agruparTratamientos.
// clinica: fila de clinica_config. logo: bytes PNG o null.
export async function generarHojaRx(pdfLib, { imagen, simbolos = [], escalaGlobal = 1, grupos = [], paciente = {},
  clinica = {}, logo = null, idioma = "ES", fecha = new Date(), doctor = "" }) {
  const { PDFDocument, StandardFonts, rgb } = pdfLib;
  const T = TEXTOS[idioma] || TEXTOS.ES;
  const doc = await PDFDocument.create();
  const W = 595.28, H = 841.89;
  const p = doc.addPage([W, H]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const negro = rgb(0, 0, 0), gris = rgb(0.35, 0.35, 0.35), blanco = rgb(1, 1, 1);
  const izq = 12 * MM, der = W - 12 * MM;
  // y desde arriba en mm → coordenada pdf
  const Y = (mm) => H - mm * MM;

  // Cabecera: logo y clínica a la izquierda, paciente y doctor a la derecha.
  let xTexto = izq;
  let imgLogo = null;
  if (logo) {
    try { imgLogo = await doc.embedPng(logo); } catch { /* sin logo también sirve */ }
  }
  if (imgLogo) {
    const alto = 16 * MM, ancho = alto * imgLogo.width / imgLogo.height;
    p.drawImage(imgLogo, { x: izq, y: Y(10) - alto, width: ancho, height: alto });
    xTexto = izq + ancho + 5 * MM;
  }
  const lineasClinica = [
    [limpio(clinica.nombre_comercial || clinica.razon_social), negrita, 11],
    [limpio(clinica.direccion), normal, 9],
    [limpio([clinica.poblacion].filter(Boolean).join("")), normal, 9],
    [clinica.telefono ? `${T.tel} ${limpio(clinica.telefono)}` : "", normal, 9],
  ].filter(([t]) => t);
  let yc = Y(14);
  for (const [t, f, s] of lineasClinica) { p.drawText(t, { x: xTexto, y: yc, size: s, font: f, color: negro }); yc -= s + 3.5; }

  const alDerecha = (t, y, f, s) => {
    let tam = s;
    while (tam > 7 && f.widthOfTextAtSize(t, tam) > der - W / 2) tam -= 0.25;
    p.drawText(t, { x: der - f.widthOfTextAtSize(t, tam), y, size: tam, font: f, color: negro });
  };
  const fechaTxt = `${String(fecha.getDate()).padStart(2, "0")}/${String(fecha.getMonth() + 1).padStart(2, "0")}/${fecha.getFullYear()}`;
  let yd = Y(14);
  alDerecha(limpio(paciente.nombre), yd, negrita, 12); yd -= 15;
  if (paciente.historia) { alDerecha(`${T.historia}: ${limpio(paciente.historia)}`, yd, normal, 9.5); yd -= 13; }
  alDerecha(`${T.fecha}: ${fechaTxt}`, yd, normal, 9.5); yd -= 13;
  if (doctor) alDerecha(limpio(doctor), yd, negrita, 9.5);
  p.drawLine({ start: { x: izq, y: Y(36) }, end: { x: der, y: Y(36) }, thickness: 0.6, color: gris });

  // Radiografía a todo el ancho, con una franja encima y otra debajo para los
  // números de las piezas.
  const anchoImg = der - izq;
  const altoImg = Math.min(anchoImg * imagen.alto / imagen.ancho, 120 * MM);
  const anchoReal = altoImg * imagen.ancho / imagen.alto;
  const xImg = (W - anchoReal) / 2;
  const topImg = Y(48.5);                // borde de arriba de la imagen
  const baseImg = topImg - altoImg;
  const rx = await doc.embedJpg(imagen.bytes);
  p.drawImage(rx, { x: xImg, y: baseImg, width: anchoReal, height: altoImg });

  // Símbolos sobre la radiografía. Van en mm de la imagen (origen arriba a la
  // izquierda, y hacia abajo), igual que en pantalla: drawSvgPath con escala
  // MM y origen en la esquina de la imagen. Cada trazo se pinta dos veces,
  // ancho en blanco y fino en negro, para que se vea sobre el gris.
  const mmImg = { w: anchoReal / MM, h: altoImg / MM };
  const enMm = (s) => ({ x: s.x * mmImg.w, y: s.y * mmImg.h, e: (s.escala || 1) * escalaGlobal });
  const traza = (d, fino = 0.28, relleno = false) => {
    p.drawSvgPath(d, { x: xImg, y: topImg, scale: MM, borderColor: blanco, borderWidth: fino + 0.47, borderLineCap: 1 });
    p.drawSvgPath(d, { x: xImg, y: topImg, scale: MM, borderColor: negro, borderWidth: fino, borderLineCap: 1,
      ...(relleno ? { color: negro } : {}) });
  };
  const letra = (t, cx, cy, tam) => {
    const s = tam * MM * 1.15;            // altura de mayúscula ≈ tam mm
    const w = negrita.widthOfTextAtSize(t, s);
    const x0 = xImg + cx * MM - w / 2, y0 = topImg - cy * MM - s * 0.36;
    const r = 0.35 * MM;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      p.drawText(t, { x: x0 + r * Math.cos(a), y: y0 + r * Math.sin(a), size: s, font: negrita, color: blanco });
    }
    p.drawText(t, { x: x0, y: y0, size: s, font: negrita, color: negro });
  };
  // Primero las uniones de las prótesis, para que los dientes queden encima.
  const porFila = new Map();
  for (const s of simbolos) if (s.tipo === "protesis") {
    const l = porFila.get(s.fila) || []; porFila.set(s.fila, l);
    const m = enMm(s); l.push({ x: m.x, y: m.y, s, escala: s.escala });
  }
  for (const l of porFila.values()) {
    for (const arriba of [true, false]) {
      const d = union(l.filter(q => esSuperior(q.s.pieza) === arriba), escalaGlobal);
      if (d) traza(d);
    }
  }
  for (const s of simbolos) {
    const m = enMm(s);
    const dib = dibujo(s, m.x, m.y, m.e);
    for (const t of dib.trazos) traza(t.d, t.fino ?? (s.tipo === "x" ? 0.38 : 0.28), t.relleno);
    if (dib.texto) letra(dib.texto.letra, dib.texto.x, dib.texto.y, dib.texto.tam);
  }

  // Números de las piezas: un círculo pequeño fuera de la imagen y una raya
  // fina hasta el símbolo de esa pieza más cercano.
  const radio = 2.3 * MM;
  const piezas = [...new Set(simbolos.map(s => s.pieza))];
  const numeros = (lista, arriba) => {
    if (!lista.length) return;
    const yEtq = arriba ? topImg + 5 * MM : baseImg - 5 * MM;
    const destinos = lista.map(pieza => {
      const suyos = simbolos.filter(s => s.pieza === pieza).map(s => {
        const m = enMm(s);
        const { h } = medidas(s, m.e);
        return { x: m.x, y: arriba ? m.y - h / 2 : m.y + h / 2 };
      });
      const d = suyos.reduce((a, b) => (arriba ? b.y < a.y : b.y > a.y) ? b : a);
      return { x: xImg + d.x * MM, y: topImg - d.y * MM };
    });
    const xs = repartir(destinos.map(d => d.x), 2 * radio + 1.5, izq + radio, der - radio);
    lista.forEach((pieza, i) => {
      for (const [grosor, color] of [[1.6, blanco], [0.5, negro]])
        p.drawLine({ start: { x: xs[i], y: arriba ? yEtq - radio : yEtq + radio },
          end: destinos[i], thickness: grosor, color });
      p.drawCircle({ x: xs[i], y: yEtq, size: radio, color: negro });
      const t = String(pieza), s = 6.5;
      p.drawText(t, { x: xs[i] - negrita.widthOfTextAtSize(t, s) / 2, y: yEtq - s * 0.35, size: s, font: negrita, color: blanco });
    });
  };
  numeros(piezas.filter(esSuperior), true);
  numeros(piezas.filter(q => !esSuperior(q)), false);

  // Lista de tratamientos, a dos columnas, cada uno con una casilla vacía
  // delante para escribir a mano.
  let y = baseImg - 18 * MM;
  p.drawText(T.titulo, { x: izq, y, size: 12, font: negrita, color: negro });
  y -= 6;
  p.drawLine({ start: { x: izq, y }, end: { x: der, y }, thickness: 0.6, color: gris });
  y -= 20;
  const filas = grupos.map(g => {
    const partes = [];
    if (g.piezas.length) partes.push(g.piezas.join(", "));
    if (g.sinPieza > 1) partes.push(`x${g.sinPieza}`);
    return { nombre: limpio(g.nombre), detalle: partes.join(" · "),
      simbolo: g.simbolo && g.piezas.length ? { ...g.simbolo, pieza: g.piezas[0] } : null };
  });
  // El símbolo de cada tratamiento, pequeño, al lado de su nombre: hace de
  // leyenda de lo que hay dibujado en la radiografía.
  const icono = (s, cx, cy, altoMax) => {
    const e = Math.min(0.75, altoMax / medidas(s, 1).h);
    const dib = dibujo(s, 0, 0, e);
    for (const t of dib.trazos) {
      p.drawSvgPath(t.d, { x: cx, y: cy, scale: MM, borderColor: negro,
        borderWidth: Math.min(t.fino ?? 0.28, 0.4), borderLineCap: 1, ...(t.relleno ? { color: negro } : {}) });
    }
    if (dib.texto) {
      const s2 = 8, w = negrita.widthOfTextAtSize(dib.texto.letra, s2);
      p.drawText(dib.texto.letra, { x: cx - w / 2, y: cy - s2 * 0.36, size: s2, font: negrita, color: negro });
    }
  };
  const ANCHO_ICONO = 8 * MM;
  const yPie = 20 * MM;                 // raya del pie
  const fin = yPie + 12 * MM;           // la última fila no baja de aquí
  const sepCol = 10 * MM;
  const colAncho = (der - izq - sepCol) / 2;
  let tam = 10, alto = 21;
  const porColumna = () => Math.floor((y - fin) / alto) + 1;
  while (filas.length > 2 * porColumna() && tam > 7) { tam -= 0.5; alto = tam * 2.1; }
  const caben = Math.min(filas.length, 2 * porColumna());
  const porCol = Math.ceil(caben / 2);
  for (let k = 0; k < caben; k++) {
    const x = izq + Math.floor(k / porCol) * (colAncho + sepCol);
    const yy = y - (k % porCol) * alto;
    const hasta = x + colAncho;
    const lado = Math.min(13, alto - 5);
    p.drawRectangle({ x, y: yy - (lado - tam * 0.72) / 2, width: lado, height: lado,
      borderColor: negro, borderWidth: 0.7 });
    if (filas[k].simbolo) icono(filas[k].simbolo, x + lado + 4 + ANCHO_ICONO / 2, yy + tam * 0.36, (alto - 3) / MM);
    const xNom = x + lado + 6 + ANCHO_ICONO;
    const det = filas[k].detalle;
    const anchoDet = det ? negrita.widthOfTextAtSize(det, tam) + 6 : 0;
    let nom = filas[k].nombre;
    if (normal.widthOfTextAtSize(nom, tam) > hasta - xNom - anchoDet) {
      while (nom.length > 1 && normal.widthOfTextAtSize(nom + "…", tam) > hasta - xNom - anchoDet) nom = nom.slice(0, -1);
      nom = nom.trimEnd() + "…";
    }
    p.drawText(nom, { x: xNom, y: yy, size: tam, font: normal, color: negro });
    if (det) p.drawText(det, { x: hasta - anchoDet + 6, y: yy, size: tam, font: negrita, color: negro });
  }
  if (filas.length > caben) {
    p.drawText(`+ ${filas.length - caben}`, { x: der - 20, y: fin - 14, size: 9, font: normal, color: gris });
  }
  if (simbolos.length) p.drawText(T.nota, { x: izq, y: yPie + 4 * MM, size: 7, font: normal, color: gris });

  // Pie: logo pequeño a la izquierda y los datos de la clínica en una línea.
  p.drawLine({ start: { x: izq, y: yPie }, end: { x: der, y: yPie }, thickness: 0.6, color: gris });
  let xPie = izq;
  if (imgLogo) {
    const alto = 9 * MM, ancho = alto * imgLogo.width / imgLogo.height;
    p.drawImage(imgLogo, { x: izq, y: yPie - 3 * MM - alto, width: ancho, height: alto });
    xPie = izq + ancho + 5 * MM;
  }
  const datosPie = [clinica.razon_social, clinica.direccion, clinica.poblacion,
    clinica.telefono ? `${T.tel} ${clinica.telefono}` : ""].map(limpio).filter(Boolean).join("  ·  ");
  if (datosPie) {
    let tp = 8;
    while (tp > 6 && normal.widthOfTextAtSize(datosPie, tp) > der - xPie) tp -= 0.25;
    p.drawText(datosPie, { x: der - normal.widthOfTextAtSize(datosPie, tp), y: yPie - 3 * MM - 4.5 * MM - tp * 0.35,
      size: tp, font: normal, color: gris });
  }

  return doc.save();
}
