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
import { simboloDe, arcadaDe, alturaPorDefecto, dibujo, union, medidas, barra, partesDePack,
  piezasPorDefecto, cantidadDe, colorDe, COLORES, rgbDe } from "./hojaRxDibujos.js";

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
// Cada fila del presupuesto, partida en lo que se dibuja. Una fila normal es
// una sola parte: "Implante Titanio   16". Un pack son varias: "6 IMPLANTES +
// ARCADA CERAMICA 12 PIEZAS SUPERIOR" da los implantes y la arcada, cada una
// con su dibujo y sus piezas. Las piezas de una parte salen del nombre o, si
// no trae, de las que dicen piezasPorDefecto (una arcada completa, el reparto
// de los implantes de un pack) hasta que se eligen a mano.
export function filasDelPresupuesto(tratamientos = []) {
  return tratamientos.map((t, i) => {
    const nombre = t?.name ?? t?.nombre ?? t;
    const { base, pieza: p } = separarPieza(nombre);
    const pieza = p && posicionPlantilla(p) ? p : null;
    const arcada = arcadaDe(base);
    const pack = pieza ? null : partesDePack(base);
    const partes = pack
      ? pack.map((x, k) => ({ k, nombre: nombreParte(x.nombre, x.simbolo), simbolo: x.simbolo,
          arcada: arcadaDe(x.nombre) || arcada,
          defecto: piezasPorDefecto(x.nombre, x.simbolo, arcadaDe(x.nombre) || arcada, x.cantidad) }))
      : [{ k: 0, nombre: base, simbolo: simboloDe(base), arcada,
          defecto: pieza ? [pieza] : piezasPorDefecto(base, simboloDe(base), arcada, cantidadDe(base)) }];
    return { i, base, pieza, arcada, pack: !!pack, partes, simbolo: partes[0].simbolo };
  }).filter(f => String(f.base || "").trim());
}

// "EXOS" → "Exodoncias", "PROT. PROV. INFERIOR" → "Prótesis provisional
// inferior"; el resto, en minúsculas con la primera en mayúscula.
function nombreParte(t, simbolo) {
  const s = String(t).trim();
  if (simbolo?.tipo === "x" && /^exos?$/i.test(s)) return "Exodoncias";
  const largo = s.replace(/prot\.\s*prov\.?/i, "prótesis provisional");
  const min = largo.toLocaleLowerCase("es");
  return min.charAt(0).toLocaleUpperCase("es") + min.slice(1);
}

const clave = (f, p) => `${f.i}:${p.k}`;

// ¿Se pueden elegir las piezas de esta parte? Las que no las traen en el
// nombre y dibujan algo en una pieza (no la barra, que va entre implantes, ni
// las iniciales de algo que no se sabe qué es).
export const eligePiezas = (f, p) =>
  !f.pieza && !!p.simbolo && p.simbolo.tipo !== "barra" && !p.simbolo.generico;

// Piezas de una parte: la del nombre, las elegidas a mano, o las de por defecto.
export function piezasDeParte(f, p, elegidas = {}) {
  if (f.pieza) return [f.pieza];
  const e = elegidas[clave(f, p)];
  return (e ?? p.defecto ?? []).filter(x => posicionPlantilla(x));
}
export const piezasDeFila = (f, elegidas = {}) =>
  [...new Set(f.partes.flatMap(p => piezasDeParte(f, p, elegidas)))];

// Los símbolos de las filas, colocados donde suele caer cada cosa. Una pieza
// con varias letras (R y EN) las apila hacia la raíz. `grupo` junta los de
// una misma parte: los dientes de una prótesis se unen entre ellos.
export function simbolosIniciales(filas = [], elegidas = {}) {
  const lista = [];
  const letrasPorPieza = {};
  for (const f of filas) for (const p of f.partes) {
    if (!p.simbolo || p.simbolo.tipo === "barra") continue;
    for (const pieza of piezasDeParte(f, p, elegidas)) {
      const { generico: _g, ...simb } = p.simbolo;
      const s = { id: `${clave(f, p)}:${pieza}`, fila: f.i, grupo: clave(f, p), pieza, ...simb };
      let apilado = 0;
      if (s.tipo === "letra") { apilado = letrasPorPieza[pieza] || 0; letrasPorPieza[pieza] = apilado + 1; }
      lista.push({ ...s, x: posicionPlantilla(pieza).x, y: alturaPorDefecto(s, apilado), escala: 1, giro: 0 });
    }
  }
  return lista;
}

// Las barras a dibujar: por cada parte "barra", los implantes de su arcada.
// Si el nombre no dice la arcada, la de los implantes del mismo pack.
// Devuelve listas de símbolos de implante (ya movidos).
export function barrasDe(filas = [], simbolos = []) {
  const implantes = simbolos.filter(s => s.tipo === "implante");
  const res = [];
  for (const f of filas) for (const p of f.partes) {
    if (p.simbolo?.tipo !== "barra") continue;
    let arcadas = p.arcada ? [p.arcada] : [...new Set(implantes.filter(s => s.fila === f.i)
      .map(s => esSuperior(s.pieza) ? "superior" : "inferior"))];
    if (!arcadas.length) arcadas = [...new Set(implantes.map(s => esSuperior(s.pieza) ? "superior" : "inferior"))];
    for (const a of arcadas) {
      const suyos = implantes.filter(s => esSuperior(s.pieza) === (a === "superior"));
      if (suyos.length >= 2) res.push(suyos);
    }
  }
  return res;
}

// La lista de abajo: una línea por parte (un pack sale en varias, una por
// cosa), agrupando por nombre, con sus piezas y el símbolo que llevan en la
// radiografía. `traducir` pasa el nombre al idioma.
export function agruparFilas(filas = [], elegidas = {}, traducir = (x) => x) {
  const grupos = new Map();
  for (const f of filas) for (const p of f.partes) {
    const nom = traducir(p.nombre);
    const g = grupos.get(nom) || { nombre: nom, piezas: [], sinPieza: 0, simbolo: null };
    grupos.set(nom, g);
    const piezas = p.simbolo?.tipo === "barra" ? [] : piezasDeParte(f, p, elegidas);
    if (piezas.length) {
      for (const x of piezas) if (!g.piezas.includes(x)) g.piezas.push(x);
      g.simbolo = g.simbolo || p.simbolo;
    } else {
      g.sinPieza++;
      if (p.simbolo?.tipo === "barra") g.simbolo = p.simbolo;
    }
  }
  const lista = [...grupos.values()];
  for (const g of lista) g.piezas.sort((a, b) => a - b);
  return lista;
}

// Piezas para la lista, en el orden de la boca y con las seguidas de un mismo
// cuadrante como rango: ["11".."17","21".."27"] → "17–11, 21–27". Dos
// seguidas van sueltas.
const ORDEN_BOCA = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  55, 54, 53, 52, 51, 61, 62, 63, 64, 65,
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
  85, 84, 83, 82, 81, 71, 72, 73, 74, 75,
].map(String);
export function textoPiezas(piezas = []) {
  const pos = (p) => { const i = ORDEN_BOCA.indexOf(String(p)); return i < 0 ? 999 + Number(p) : i; };
  const orden = [...new Set(piezas.map(String))].sort((a, b) => pos(a) - pos(b));
  const trozos = [];
  let tramo = [];
  const cierra = () => {
    if (tramo.length >= 3) trozos.push(`${tramo[0]}–${tramo[tramo.length - 1]}`);
    else trozos.push(...tramo);
    tramo = [];
  };
  for (const p of orden) {
    const ant = tramo[tramo.length - 1];
    const seguida = ant && pos(p) === pos(ant) + 1 && Math.floor(p / 10) === Math.floor(ant / 10);
    if (!seguida && tramo.length) cierra();
    tramo.push(p);
  }
  if (tramo.length) cierra();
  return trozos.join(", ");
}

// Lo que une símbolos, en mm de la imagen: los dientes de cada prótesis por
// el cuello, y la barra entre implantes. Lo usan la pantalla y el PDF.
export function trazosDeUnion(simbolos = [], barras = [], mmImg, escalaGlobal = 1) {
  const enMm = (s) => ({ x: s.x * mmImg.w, y: s.y * mmImg.h, s, escala: s.escala, giro: s.giro });
  const res = [];
  const porGrupo = new Map();
  for (const s of simbolos) if (s.tipo === "protesis") {
    const l = porGrupo.get(s.grupo) || []; porGrupo.set(s.grupo, l); l.push(enMm(s));
  }
  for (const l of porGrupo.values()) for (const arriba of [true, false]) {
    const d = union(l.filter(q => esSuperior(q.s.pieza) === arriba), escalaGlobal);
    if (d) res.push({ d, fino: 0.28, color: COLORES.protesis });
  }
  for (const b of barras) {
    const d = barra(b.map(enMm), escalaGlobal);
    if (d) res.push({ d, fino: 0.7, color: COLORES.barra });
  }
  return res;
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
// barras: lo que devuelve barrasDe(). escalaGlobal: tamaño de todos los dibujos (1 = normal).
// grupos: lo que devuelve agruparTratamientos.
// clinica: fila de clinica_config. logo: bytes PNG o null (el de fondo
// blanco, arriba). logoPie: bytes PNG o null (el de fondo verde, en el pie).
export async function generarHojaRx(pdfLib, { imagen, simbolos = [], barras = [], escalaGlobal = 1, grupos = [], paciente = {},
  clinica = {}, logo = null, logoPie = null, idioma = "ES", fecha = new Date(), doctor = "" }) {
  const { PDFDocument, StandardFonts, rgb } = pdfLib;
  const T = TEXTOS[idioma] || TEXTOS.ES;
  const doc = await PDFDocument.create();
  const W = 595.28, H = 841.89;
  const p = doc.addPage([W, H]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const negro = rgb(0, 0, 0), gris = rgb(0.35, 0.35, 0.35), blanco = rgb(1, 1, 1);
  const colorPdf = (hex) => rgb(...rgbDe(hex));
  const izq = 12 * MM, der = W - 12 * MM;
  // y desde arriba en mm → coordenada pdf
  const Y = (mm) => H - mm * MM;

  // Cabecera: logo y clínica a la izquierda, paciente y doctor a la derecha.
  let xTexto = izq;
  let imgLogo = null;
  if (logo) {
    try { imgLogo = await doc.embedPng(logo); } catch { /* sin logo también sirve */ }
  }
  let imgPie = null;
  if (logoPie) {
    try { imgPie = await doc.embedPng(logoPie); } catch { /* el pie lleva el otro, o ninguno */ }
  }
  imgPie = imgPie || imgLogo;
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
  // ancho en blanco y fino en el color de su tipo, para que se vea sobre el gris.
  const mmImg = { w: anchoReal / MM, h: altoImg / MM };
  const enMm = (s) => ({ x: s.x * mmImg.w, y: s.y * mmImg.h, e: (s.escala || 1) * escalaGlobal });
  const traza = (d, fino = 0.28, relleno = false, color = negro) => {
    p.drawSvgPath(d, { x: xImg, y: topImg, scale: MM, borderColor: blanco, borderWidth: fino + 0.47, borderLineCap: 1 });
    p.drawSvgPath(d, { x: xImg, y: topImg, scale: MM, borderColor: color, borderWidth: fino, borderLineCap: 1,
      ...(relleno ? { color } : {}) });
  };
  const letra = (t, cx, cy, tam, color = negro) => {
    const s = tam * MM * 1.15;            // altura de mayúscula ≈ tam mm
    const w = negrita.widthOfTextAtSize(t, s);
    const x0 = xImg + cx * MM - w / 2, y0 = topImg - cy * MM - s * 0.36;
    const r = 0.35 * MM;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      p.drawText(t, { x: x0 + r * Math.cos(a), y: y0 + r * Math.sin(a), size: s, font: negrita, color: blanco });
    }
    p.drawText(t, { x: x0, y: y0, size: s, font: negrita, color });
  };
  // Primero las uniones de las prótesis, para que los dientes queden encima.
  for (const d of trazosDeUnion(simbolos, barras, mmImg, escalaGlobal)) traza(d.d, d.fino, false, colorPdf(d.color));
  for (const s of simbolos) {
    const m = enMm(s);
    const c = colorPdf(colorDe(s));
    const dib = dibujo(s, m.x, m.y, m.e, s.giro);
    for (const t of dib.trazos) traza(t.d, t.fino ?? (s.tipo === "x" ? 0.38 : 0.28), t.relleno, c);
    if (dib.texto) letra(dib.texto.letra, dib.texto.x, dib.texto.y, dib.texto.tam, c);
  }

  // Números de las piezas: un círculo pequeño fuera de la imagen y una raya
  // fina, del color de ese símbolo, hasta el símbolo de esa pieza más cercano.
  const radio = 2.3 * MM;
  const piezas = [...new Set(simbolos.map(s => s.pieza))];
  const numeros = (lista, arriba) => {
    if (!lista.length) return;
    const yEtq = arriba ? topImg + 5 * MM : baseImg - 5 * MM;
    const destinos = lista.map(pieza => {
      const suyos = simbolos.filter(s => s.pieza === pieza).map(s => {
        const m = enMm(s);
        const { h } = medidas(s, m.e);
        return { x: m.x, y: arriba ? m.y - h / 2 : m.y + h / 2, color: colorDe(s) };
      });
      const d = suyos.reduce((a, b) => (arriba ? b.y < a.y : b.y > a.y) ? b : a);
      return { x: xImg + d.x * MM, y: topImg - d.y * MM, color: colorPdf(d.color) };
    });
    const xs = repartir(destinos.map(d => d.x), 2 * radio + 1.5, izq + radio, der - radio);
    lista.forEach((pieza, i) => {
      for (const [grosor, color] of [[1.6, blanco], [0.6, destinos[i].color]])
        p.drawLine({ start: { x: xs[i], y: arriba ? yEtq - radio : yEtq + radio },
          end: { x: destinos[i].x, y: destinos[i].y }, thickness: grosor, color });
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
    if (g.piezas.length) partes.push(textoPiezas(g.piezas));
    if (g.sinPieza > 1) partes.push(`x${g.sinPieza}`);
    const simbolo = g.simbolo && (g.piezas.length || g.simbolo.tipo === "barra")
      ? { ...g.simbolo, pieza: g.piezas[0] || "31" } : null;
    return { nombre: limpio(g.nombre), detalle: partes.join(" · "), simbolo,
      color: simbolo ? colorPdf(colorDe(simbolo)) : negro };
  });
  // El símbolo de cada tratamiento, pequeño, al lado de su nombre: hace de
  // leyenda de lo que hay dibujado en la radiografía. Icono, nombre y piezas
  // van en el color de su dibujo.
  const icono = (s, cx, cy, altoMax, color) => {
    const e = Math.min(0.75, altoMax / medidas(s, 1).h);
    const dib = dibujo(s, 0, 0, e);
    for (const t of dib.trazos) {
      p.drawSvgPath(t.d, { x: cx, y: cy, scale: MM, borderColor: color,
        borderWidth: Math.min(t.fino ?? 0.28, 0.4), borderLineCap: 1, ...(t.relleno ? { color } : {}) });
    }
    if (dib.texto) {
      const s2 = 8, w = negrita.widthOfTextAtSize(dib.texto.letra, s2);
      p.drawText(dib.texto.letra, { x: cx - w / 2, y: cy - s2 * 0.36, size: s2, font: negrita, color });
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
    if (filas[k].simbolo) icono(filas[k].simbolo, x + lado + 4 + ANCHO_ICONO / 2, yy + tam * 0.36, (alto - 3) / MM, filas[k].color);
    const xNom = x + lado + 6 + ANCHO_ICONO;
    // Las piezas, en negrita a la derecha, sin pasar de media columna: si no
    // caben se achican y, como mucho, se cortan. El nombre ocupa el resto.
    let det = filas[k].detalle, tDet = tam;
    const maxDet = (hasta - xNom) * 0.55;
    while (det && tDet > 7 && negrita.widthOfTextAtSize(det, tDet) > maxDet) tDet -= 0.25;
    if (det && negrita.widthOfTextAtSize(det, tDet) > maxDet) {
      while (det.length > 1 && negrita.widthOfTextAtSize(det + "…", tDet) > maxDet) det = det.slice(0, -1);
      det = det.trimEnd() + "…";
    }
    const anchoDet = det ? negrita.widthOfTextAtSize(det, tDet) + 6 : 0;
    let nom = filas[k].nombre;
    if (normal.widthOfTextAtSize(nom, tam) > hasta - xNom - anchoDet) {
      while (nom.length > 1 && normal.widthOfTextAtSize(nom + "…", tam) > hasta - xNom - anchoDet) nom = nom.slice(0, -1);
      nom = nom.trimEnd() + "…";
    }
    p.drawText(nom, { x: xNom, y: yy, size: tam, font: normal, color: filas[k].color });
    if (det) p.drawText(det, { x: hasta - anchoDet + 6, y: yy, size: tDet, font: negrita, color: filas[k].color });
  }
  if (filas.length > caben) {
    p.drawText(`+ ${filas.length - caben}`, { x: der - 20, y: fin - 14, size: 9, font: normal, color: gris });
  }
  if (simbolos.length) p.drawText(T.nota, { x: izq, y: yPie + 4 * MM, size: 7, font: normal, color: gris });

  // Pie: el logo de fondo verde, pequeño, a la izquierda y los datos de la
  // clínica en una línea.
  p.drawLine({ start: { x: izq, y: yPie }, end: { x: der, y: yPie }, thickness: 0.6, color: gris });
  let xPie = izq;
  if (imgPie) {
    const alto = 9 * MM, ancho = alto * imgPie.width / imgPie.height;
    p.drawImage(imgPie, { x: izq, y: yPie - 3 * MM - alto, width: ancho, height: alto });
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
