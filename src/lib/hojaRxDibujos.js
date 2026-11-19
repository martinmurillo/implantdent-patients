// Los símbolos que se dibujan sobre la radiografía de la hoja rx. Los usa la
// pantalla (SVG) y el PDF (pdf-lib, drawSvgPath), con las mismas rutas: todo
// va en milímetros del papel, con el origen arriba a la izquierda de la
// imagen y la y hacia abajo, como en SVG.
//
// Cada tratamiento con pieza da un símbolo:
//  - implante:  el dibujo de un implante, en la zona de la raíz
//  - corona:    el contorno de la corona, con la forma del diente (incisivo,
//               canino, premolar, molar). Coronas, puentes, provisionales.
//  - protesis:  el mismo contorno, y los dientes de una misma prótesis unidos
//               por una línea continua. Removibles: acrílica, esquelética,
//               completa, sobredentadura, híbrida...
//  - endo:      la raíz (dos en molares) con el conducto relleno
//  - perno:     el poste dentro de la raíz, con su cabeza hacia la corona
//  - x:         exodoncia
//  - letra:     R reconstrucción, GR gran reconstrucción, E empaste, etc.
//
// dibujo() devuelve trazos { d, fino?, relleno? }: la ruta, el grosor de la
// línea en mm si no es el normal, y si va rellena de negro.

// ── Colores ────────────────────────────────────────────────────────────────
// Uno por tipo de dibujo: el mismo en la radiografía, en el icono de la lista
// y en el nombre del tratamiento, para ver de un vistazo qué es cada cosa.
// Todos oscuros y saturados: en una impresora en blanco y negro salen como
// gris oscuro (luminancia entre 80 y 115 de 255) y se siguen viendo bien
// sobre el papel y sobre la radiografía.
export const COLORES = {
  implante: "#1a56c4",   // azul
  corona:   "#0f7a3a",   // verde
  protesis: "#7b2fa8",   // morado
  endo:     "#d35400",   // naranja
  perno:    "#8b5a2b",   // marrón
  x:        "#d01c1c",   // rojo
  barra:    "#0b7f8a",   // turquesa
  letra:    "#c2187a",   // fucsia
};
export const colorDe = (s) => COLORES[s?.tipo] || "#000000";

// "#1a56c4" → [r, g, b] de 0 a 1, para pdf-lib.
export function rgbDe(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
}

const plano = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Lo primero que casa gana. Van sobre el nombre sin la pieza, sin acentos y
// en minúsculas. Contrastado con los nombres de la base y de treatments.js.
const REGLAS = [
  // Retoques sobre algo que ya está: letra, no dibujo de una pieza nueva.
  [/recementad/, { tipo: "letra", letra: "RC" }],
  [/cambio tornillo|tornillo/, { tipo: "letra", letra: "T" }],
  [/ajuste|compostura|reparacion|rebase|desmontaje|cortar puente/, null],
  [/extraccion|exodoncia|\bexos?\b/, { tipo: "x" }],
  [/gran reconstruccion/, { tipo: "letra", letra: "GR" }],
  [/reconstruccion/, { tipo: "letra", letra: "R" }],
  [/empaste|obturacion/, { tipo: "letra", letra: "E" }],
  [/endodoncia/, { tipo: "endo" }],
  [/incrusta/, { tipo: "letra", letra: "I" }],
  [/perno/, { tipo: "perno" }],
  [/sellado/, { tipo: "letra", letra: "S" }],
  [/carilla/, { tipo: "letra", letra: "CA" }],
  [/elevacion/, { tipo: "letra", letra: "ES" }],
  [/injerto|regeneracion|hueso|membrana/, { tipo: "letra", letra: "INJ" }],
  [/gingivectom|alargamiento/, { tipo: "letra", letra: "G" }],
  [/pilar|aditamento/, { tipo: "letra", letra: "PI" }],
  [/mantenimiento|limpieza|curetaje|curetage|pulido/, null],
  // Lo que no va en una pieza aunque diga "arcada": blanqueamiento de 2
  // arcadas, ortodoncia, revisiones.
  [/blanquea|ortodoncia|brackets|revision|radiograf|fluor|tartrectom/, null],
  [/ataches?/, { tipo: "letra", letra: "AT" }],
  [/barra/, { tipo: "barra" }],
  // Prótesis antes que corona e implante: "6 IMPLANTES + ARCADA CERAMICA" o
  // "PROTESIS INMEDIATA SOBRE IMPLANTES" son prótesis.
  [/protesis|prot\.|sobredentadura|ataches|arcada|hibrida|esqueletic|acrilic|flexible/, { tipo: "protesis" }],
  [/corona|puente|diente provisional|provisional/, { tipo: "corona" }],
  [/implant/, { tipo: "implante" }],
];

// Nombre de tratamiento → { tipo, letra? }. Lo que no casa con nada lleva las
// iniciales de las dos primeras palabras.
export function simboloDe(nombre) {
  const t = plano(nombre).replace(/\s+/g, " ").trim();
  if (!t) return null;
  for (const [re, s] of REGLAS) if (re.test(t)) return s ? { ...s } : null;
  const ini = t.split(" ").filter(w => /^[a-z]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  return ini ? { tipo: "letra", letra: ini, generico: true } : null;
}

// ── Packs ──────────────────────────────────────────────────────────────────
// Un pack viene en una sola línea y sin piezas: "4 IMPLANTES + BARRA ACKERMAN
// +SOBREDENTADURA METAL ACRILICA REMOVIBLE + EXOS + PROTESIS PROVISIONAL",
// "8 IMPLANTES + ARCADA CERAMICA (14)+ EXOS + PROT. PROV. INFERIOR". Se parte
// por los "+" y cada trozo lleva su dibujo. "Barra Ackerman con
// sobredentadura" no lleva "+" pero son dos cosas.
// Devuelve [{ nombre, simbolo, cantidad }] o null si no es un pack.
export function partesDePack(nombre) {
  let trozos = String(nombre || "").split("+").map(s => s.trim()).filter(Boolean);
  trozos = trozos.flatMap(t => {
    const m = t.match(/^(barra.*?)\s+con\s+(sobredentadura.*)$/i);
    return m ? [m[1], m[2]] : [t];
  });
  if (trozos.length < 2) return null;
  const partes = trozos.map(t => ({ nombre: t, simbolo: simboloDe(t), cantidad: cantidadDe(t) }));
  // "Exodoncia 3er molar + colgajo" no es un pack: solo un trozo dibuja algo.
  const conDibujo = partes.filter(p => p.simbolo && !p.simbolo.generico);
  if (conDibujo.length < 2) return null;
  return partes.filter(p => p.simbolo);
}

// "6 IMPLANTES", "12 PIEZAS", "ARCADA CERAMICA (14)" → el número.
export function cantidadDe(t) {
  const m = plano(t).match(/(\d+)\s*(implantes|piezas)|\((\d+)\)/);
  return m ? Number(m[1] || m[3]) : null;
}

// Piezas que salen puestas sin elegirlas. Una arcada completa, sobredentadura
// o híbrida: de 7 a 7 (14), o de 6 a 6 si dice 12. Los implantes de un pack,
// en el reparto habitual para 4, 6 u 8. Lo demás (parciales, exodoncias,
// provisionales) se elige a mano.
const ARCADA = {
  superior: { 10: "15 14 13 12 11 21 22 23 24 25", 12: "16 15 14 13 12 11 21 22 23 24 25 26", 14: "17 16 15 14 13 12 11 21 22 23 24 25 26 27" },
  inferior: { 10: "45 44 43 42 41 31 32 33 34 35", 12: "46 45 44 43 42 41 31 32 33 34 35 36", 14: "47 46 45 44 43 42 41 31 32 33 34 35 36 37" },
};
const IMPLANTES = {
  superior: { 4: "15 12 22 25", 6: "16 14 12 22 24 26", 8: "16 14 13 12 22 23 24 26" },
  inferior: { 4: "45 42 32 35", 6: "46 44 42 32 34 36", 8: "46 44 43 42 32 33 34 36" },
};
export function piezasPorDefecto(nombre, simbolo, arcada, cantidad) {
  if (!arcada || !simbolo) return [];
  const t = plano(nombre);
  if (simbolo.tipo === "protesis" && !/parcial|provisional|prov\b/.test(t)) {
    const n = [10, 12, 14].includes(cantidad) ? cantidad : 14;
    return ARCADA[arcada][n].split(" ");
  }
  if (simbolo.tipo === "implante" && IMPLANTES[arcada][cantidad]) return IMPLANTES[arcada][cantidad].split(" ");
  return [];
}

// Arcada de una prótesis sin pieza, por su nombre: para ofrecer solo esas
// piezas al elegirlas.
export function arcadaDe(nombre) {
  const t = plano(nombre);
  if (/superior|\bsup\b\.?/.test(t)) return "superior";
  if (/inferior|\binf\b\.?/.test(t)) return "inferior";
  return null;
}

export const PIEZAS_SUPERIOR = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28].map(String);
export const PIEZAS_INFERIOR = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38].map(String);

const posicion = (pieza) => Number(pieza) % 10;
export const superior = (pieza) => [1, 2, 5, 6].includes(Math.floor(Number(pieza) / 10));

// Forma y tamaño (mm en el papel, a escala 1) de la corona de cada pieza.
// Las temporales (5x-8x) van como su permanente.
export function formaDiente(pieza) {
  const p = posicion(pieza);
  const temporal = Math.floor(Number(pieza) / 10) >= 5;
  const tipo = p <= 2 ? "incisivo" : p === 3 ? "canino" : (p <= 5 && !temporal) ? "premolar" : "molar";
  const medidas = {
    incisivo: p === 2 ? { w: 3.2, h: 5.2 } : { w: 3.7, h: 5.6 },
    canino: { w: 4.0, h: 6.2 },
    premolar: { w: 4.4, h: 5.2 },
    molar: { w: 6.6, h: 5.2 },
  };
  return { tipo, ...medidas[tipo] };
}

// Contornos de la corona en unidades de ancho/alto: x de -0.5 a 0.5, y de
// -0.5 (cuello, hacia la raíz) a 0.5 (borde que muerde). Para un diente de
// arriba la raíz queda arriba; los de abajo se dan la vuelta.
const CONTORNOS = {
  incisivo: [[-0.32, -0.5], [-0.46, -0.1], [-0.5, 0.3], [-0.46, 0.5], [-0.46, 0.5], [0.46, 0.5], [0.46, 0.5], [0.5, 0.3], [0.46, -0.1], [0.32, -0.5], [0, -0.6]],
  canino: [[-0.3, -0.5], [-0.48, -0.1], [-0.5, 0.25], [-0.2, 0.42], [0, 0.52], [0, 0.52], [0.2, 0.42], [0.5, 0.25], [0.48, -0.1], [0.3, -0.5], [0, -0.6]],
  premolar: [[-0.36, -0.5], [-0.5, -0.05], [-0.48, 0.35], [-0.3, 0.52], [-0.12, 0.4], [0, 0.36], [0.12, 0.4], [0.3, 0.52], [0.48, 0.35], [0.5, -0.05], [0.36, -0.5], [0, -0.56]],
  molar: [[-0.4, -0.5], [-0.5, -0.1], [-0.5, 0.35], [-0.36, 0.52], [-0.2, 0.4], [-0.06, 0.5], [0.06, 0.5], [0.2, 0.4], [0.36, 0.52], [0.5, 0.35], [0.5, -0.1], [0.4, -0.5], [0, -0.54]],
};

const n2 = (v) => (Math.round(v * 100) / 100).toString();
const pt = ([x, y]) => `${n2(x)} ${n2(y)}`;

// Ruta cerrada y suave que pasa cerca de los puntos (un punto repetido deja
// una esquina más marcada).
function cerrada(pts) {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M${pt(mid(pts[n - 1], pts[0]))}`;
  for (let i = 0; i < n; i++) d += ` Q${pt(pts[i])} ${pt(mid(pts[i], pts[(i + 1) % n]))}`;
  return d + " Z";
}
const linea = (pts, cerrar = false) => "M" + pts.map(pt).join(" L") + (cerrar ? " Z" : "");

// Tamaño a escala 1 del implante, en mm.
const IMPLANTE = { w: 3.0, l: 8.5 };
const RAIZ = 9.0;           // largo de la raíz de la endodoncia
const PERNO = { w: 1.3, l: 6.0 };
const BRAZO_X = 1.6;
const LETRA = 3.0;

// Medio alto del símbolo hacia la raíz y hacia la mordida: para saber dónde
// acaba la raya del número y dónde se une la prótesis.
export function medidas(s, escala = 1) {
  if (s.tipo === "implante") return { w: IMPLANTE.w * escala, h: (IMPLANTE.l + 1.3) * escala };
  if (s.tipo === "endo") return { w: formaDiente(s.pieza).w * 0.75 * escala, h: RAIZ * escala };
  if (s.tipo === "perno") return { w: (PERNO.w + 1) * escala, h: (PERNO.l + 1) * escala };
  if (s.tipo === "corona" || s.tipo === "protesis") {
    const f = formaDiente(s.pieza);
    return { w: f.w * escala, h: f.h * escala };
  }
  if (s.tipo === "x") return { w: 2 * BRAZO_X * escala, h: 2 * BRAZO_X * escala };
  if (s.tipo === "barra") return { w: 4.4 * escala, h: 1.5 * escala };
  return { w: LETRA * 0.7 * String(s.letra || "").length * escala, h: LETRA * escala };
}

// Un símbolo en (x, y) mm → { trazos: [{ d, fino?, relleno? }], texto? }.
// Las rutas van en mm absolutos de la imagen.
// `giro` en grados, en el sentido de las agujas del reloj, alrededor del
// centro del símbolo: un implante inclinado, un diente rotado. Las letras no
// giran.
export function dibujo(s, x, y, escala = 1, giro = 0) {
  const r = dibujoBruto(s, x, y, escala, giro);
  return { ...r, trazos: r.trazos.map(t => typeof t === "string" ? { d: t } : t) };
}

function dibujoBruto(s, x, y, escala, giro) {
  const sup = superior(s.pieza);
  const vy = sup ? 1 : -1;                 // los de abajo, dados la vuelta
  const a = (Number(giro) || 0) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const gira = (px, py) => [x + (px - x) * cos - (py - y) * sin, y + (px - x) * sin + (py - y) * cos];
  const P = (u, v, w, h) => gira(x + u * w, y + vy * v * h);
  if (s.tipo === "corona" || s.tipo === "protesis") {
    const f = formaDiente(s.pieza);
    const w = f.w * escala, h = f.h * escala;
    return { trazos: [cerrada(CONTORNOS[f.tipo].map(([u, v]) => P(u, v, w, h)))] };
  }
  if (s.tipo === "endo") {
    // Raíz de -0.5 (ápice) a 0.5 (cuello); el conducto, una línea gruesa por
    // dentro que no llega del todo al ápice. Los molares, dos raíces.
    const f = formaDiente(s.pieza);
    const w = f.w * 0.75 * escala, l = RAIZ * escala;
    const raiz = (c, ancho) => [
      cerrada([[c - ancho / 2, 0.5], [c - ancho * 0.42, 0], [c - ancho * 0.18, -0.45], [c, -0.52],
        [c + ancho * 0.18, -0.45], [c + ancho * 0.42, 0], [c + ancho / 2, 0.5], [c, 0.5]].map(([u, v]) => P(u, v, w, l))),
      { d: linea([P(c, 0.48, w, l), P(c, -0.42, w, l)]), fino: 0.55 },
    ];
    return { trazos: f.tipo === "molar" ? [...raiz(-0.26, 0.48), ...raiz(0.26, 0.48)] : raiz(0, 1) };
  }
  if (s.tipo === "perno") {
    // Poste estrecho que se afina hacia el ápice, relleno, con la cabeza
    // (más ancha) en el cuello del diente.
    const w = PERNO.w * escala, l = PERNO.l * escala;
    const poste = linea([P(-0.5, 0.42, w, l), P(-0.3, -0.5, w, l), P(0.3, -0.5, w, l), P(0.5, 0.42, w, l)], true);
    const cabeza = linea([P(-1.1, 0.42, w, l), P(-1.1, 0.58, w, l), P(1.1, 0.58, w, l), P(1.1, 0.42, w, l)], true);
    return { trazos: [{ d: poste, relleno: true }, { d: cabeza, relleno: true }] };
  }
  if (s.tipo === "implante") {
    const w = IMPLANTE.w * escala, l = IMPLANTE.l * escala;
    // El cuerpo va de -0.5 (ápice, hacia la raíz) a 0.5 (plataforma); encima
    // de la plataforma, el pilar. Todo en unidades de w y l.
    const cuerpo = linea([
      P(-0.5, 0.42, w, l), P(0.5, 0.42, w, l), P(0.5, -0.32, w, l),
      P(0.22, -0.5, w, l), P(-0.22, -0.5, w, l), P(-0.5, -0.32, w, l),
    ], true);
    const pilar = linea([
      P(-0.26, 0.42, w, l), P(-0.2, 0.58, w, l), P(0.2, 0.58, w, l), P(0.26, 0.42, w, l),
    ]);
    const roscas = [];
    for (let v = -0.3; v < 0.36; v += 0.11) roscas.push(linea([P(-0.5, v, w, l), P(0.5, v + 0.07, w, l)]));
    return { trazos: [cuerpo, pilar, ...roscas] };
  }
  if (s.tipo === "barra") {
    // Solo para la leyenda: la barra de verdad la dibuja barra() entre implantes.
    const b = 2.2 * escala;
    return { trazos: [{ d: linea([gira(x - b, y), gira(x + b, y)]), fino: 0.7 }] };
  }
  if (s.tipo === "x") {
    const b = BRAZO_X * escala;
    return { trazos: [linea([gira(x - b, y - b), gira(x + b, y + b)]), linea([gira(x - b, y + b), gira(x + b, y - b)])] };
  }
  return { trazos: [], texto: { letra: s.letra || "?", x, y, tam: LETRA * escala } };
}

// Unión de los dientes de una prótesis: una línea por el cuello de cada uno,
// de izquierda a derecha. `puntos` son los símbolos ya colocados, en mm.
export function union(puntos, escala = 1) {
  if (puntos.length < 2) return null;
  const orden = [...puntos].sort((a, b) => a.x - b.x);
  return linea(orden.map(p => {
    const { h } = medidas(p.s, escala * (p.escala || 1));
    return [p.x, p.y + (superior(p.s.pieza) ? -1 : 1) * h * 0.5];
  }));
}

// Barra (Ackerman) entre los implantes de una arcada: una línea gruesa por la
// plataforma de cada uno, de izquierda a derecha. `puntos` son los implantes
// ya colocados, en mm, con su escala y giro.
export function barra(puntos, escala = 1) {
  if (puntos.length < 2) return null;
  const orden = [...puntos].sort((a, b) => a.x - b.x);
  return linea(orden.map(p => {
    const e = escala * (p.escala || 1);
    const off = (superior(p.s.pieza) ? 1 : -1) * IMPLANTE.l * e * 0.5;
    const ang = (Number(p.giro) || 0) * Math.PI / 180;
    return [p.x - off * Math.sin(ang), p.y + off * Math.cos(ang)];
  }));
}

// Dónde sale por defecto cada símbolo, en fracción de la imagen. Medido sobre
// panorámicas del Orthophos de la clínica: el implante en la raíz, la corona y
// las letras en la corona, la X en medio del diente. Si una pieza lleva varias
// letras, se apilan hacia la raíz.
const ALTURAS = {
  sup: { corona: 0.52, protesis: 0.52, implante: 0.425, endo: 0.43, perno: 0.455, letra: 0.52, x: 0.49 },
  inf: { corona: 0.635, protesis: 0.635, implante: 0.73, endo: 0.725, perno: 0.70, letra: 0.635, x: 0.66 },
};
export function alturaPorDefecto(s, apilado = 0) {
  const a = ALTURAS[superior(s.pieza) ? "sup" : "inf"][s.tipo] ?? 0.5;
  return a + (superior(s.pieza) ? -1 : 1) * apilado * 0.05;
}
