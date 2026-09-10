// Reglas de la mutua Agrupació ("Tomamos Impulso").
//
// La mutua solo deja volver a facturar ciertos tratamientos sobre la misma
// pieza pasados 6 meses. Todo lo que decide qué se puede hacer y qué no vive
// aquí, en constantes con nombre, para que cambiar una regla sea cambiar un
// número y no salir a buscarlo por la aplicación.

import { addMeses } from "../planCalc.js";

export const MESES_BLOQUEO = 6;

// Obturación y ángulos no se bloquean entre sí: son prestaciones distintas y
// la mutua las cuenta por separado. Confirmado con la clínica.
export const BLOQUEO_CRUZADO = false;

// Una línea devuelta es una que la mutua rechazó al revisar la factura del
// mes. No bloquea: cuando la clínica la vuelve a pasar aparece una fila nueva
// sin devolver, y esa sí bloquea. Es una inferencia sobre 8 filas en 6 años,
// no está confirmado con la mutua; de ahí que sea una constante y no un if
// perdido en medio del cálculo.
export const DEVUELTOS_BLOQUEAN = false;

// Qué código es qué. Se trabaja por familia y no por código porque la serie
// 321xx es la tarifa infantil de la 323xx: el mismo paciente pasa de una a
// otra al crecer, sobre la misma pieza, y para la mutua es el mismo tratamiento.
//
// Esta tabla es el espejo del seed de mutua_familias en la migración. Si se
// tocan los códigos hay que tocar las dos: aquí para el script de
// verificación, y en la base para las vistas.
export const FAMILIAS = new Map([
  [32301, "OBTURACION"], [32102, "OBTURACION"], [32101, "OBTURACION"],
  [32302, "ANGULOS"],    [32103, "ANGULOS"],
  // Extracciones e implante: la pieza ya no está, no se ofrece nunca más.
  [32020, "PERDIDA"], [32450, "PERDIDA"], [32222, "PERDIDA"], [32452, "PERDIDA"],
  [32543, "PERDIDA"], [32878, "PERDIDA"], [32890, "PERDIDA"],
]);

const cuadrantes = (base, desde, hasta) => {
  const out = [];
  for (const q of base) for (let i = desde; i <= hasta; i++) out.push(q + i);
  return out;
};

// Numeración FDI. Permanentes 11-48, temporales 51-85.
export const PERMANENTES = cuadrantes([10, 20, 30, 40], 1, 8);   // 32 piezas
export const TEMPORALES  = cuadrantes([50, 60, 70, 80], 1, 5);   // 20 piezas

// Los ángulos son del sector anterior: posiciones 1 a 3 de cada cuadrante. En
// el historial el 96% de los ángulos está ahí (341 de 355), así que ofrecer
// molares como "por hacer" sería ruido. Lo que haya fuera del sector se
// enseña igual en la ficha con su estado, pero no suma en los conteos.
export const ANTERIORES          = cuadrantes([10, 20, 30, 40], 1, 3); // 12
export const ANTERIORES_TEMPORAL = cuadrantes([50, 60, 70, 80], 1, 3); // 12

// Los temporales solo entran en el universo si el paciente pasó por una pieza
// temporal hace poco. Si no, se le estarían ofreciendo dientes de leche a un
// adulto.
export const MESES_VENTANA_TEMPORALES = 24;

export const UNIVERSOS = {
  OBTURACION: { permanentes: PERMANENTES, temporales: TEMPORALES },
  ANGULOS:    { permanentes: ANTERIORES,  temporales: ANTERIORES_TEMPORAL },
};

export const ETIQUETAS = {
  OBTURACION: "Obturación",
  ANGULOS:    "Reconstrucción de ángulos",
};

export const esTemporal = (pieza) => pieza >= 51;

// ── Estado de cada pieza ────────────────────────────────────────────────────
//
//   disponible            nunca se hizo
//   con_historial         se hizo y ya pasaron los 6 meses
//   prevista              libre, pero ya hay trabajo planificado encima
//   bloqueada             se hizo y todavía no pasaron
//   perdida               extraída o con implante: no se ofrece nunca
//   fuera_de_sector       ángulos en un posterior; se enseña, no cuenta
//
// Lo previsto no bloquea: no se facturó nada, así que la regla de los 6 meses
// no tiene de dónde contar. Pero sale de "por hacer", porque ofrecer trabajo
// que ya está agendado es ruido. Si la pieza además está bloqueada, manda el
// bloqueo, que es el dato que impide facturar.
//
// `ultimas`, `perdidas` y `previstos` vienen de las vistas del mismo nombre, ya
// filtradas a este paciente. R es la fecha de referencia: hoy en la ficha, el
// último día del mes en la vista mensual.
export function calcularEstadoPiezas({ familia, ultimas = [], perdidas = [],
                                       previstos = [], ultimaTemporal = null, R }) {
  const universo = UNIVERSOS[familia];
  if (!universo) throw new Error(`Familia desconocida: ${familia}`);

  const incluyeTemporales = !!ultimaTemporal &&
    ultimaTemporal >= addMeses(R, -MESES_VENTANA_TEMPORALES);

  const piezasUniverso = incluyeTemporales
    ? [...universo.permanentes, ...universo.temporales]
    : [...universo.permanentes];

  const ultimaDe  = new Map();
  for (const u of ultimas) {
    if (u.familia && u.familia !== familia) continue;
    const prev = ultimaDe.get(u.pieza);
    if (!prev || u.ultima_fecha > prev.ultima_fecha) ultimaDe.set(u.pieza, u);
  }
  const perdidaDe = new Map();
  for (const p of perdidas) {
    const prev = perdidaDe.get(p.pieza);
    if (!prev || p.fecha_perdida > prev) perdidaDe.set(p.pieza, p.fecha_perdida);
  }
  const previstoDe = new Map();
  for (const p of previstos) {
    if (p.familia && p.familia !== familia) continue;
    const prev = previstoDe.get(p.pieza);
    // la fecha más cercana: es la que dice cuándo toca
    if (!prev || (p.fecha_prevista && p.fecha_prevista < prev.fecha_prevista)) {
      previstoDe.set(p.pieza, p);
    }
  }

  // Historial fuera del universo: ángulos en posteriores, o temporales de un
  // paciente que ya no los incluye. Se enseñan para no esconder lo que pasó.
  const extras = [...ultimaDe.keys()].filter(pz => !piezasUniverso.includes(pz));
  const todas  = [...piezasUniverso, ...extras.filter(pz => !piezasUniverso.includes(pz))];

  const piezas = todas.map(pieza => {
    const enUniverso = piezasUniverso.includes(pieza);
    const u = ultimaDe.get(pieza);
    const fechaPerdida = perdidaDe.get(pieza);
    const previsto = previstoDe.get(pieza);
    const comun = { pieza, enUniverso, temporal: esTemporal(pieza),
                    ...(previsto ? { previsto } : {}) };

    if (fechaPerdida && (!u || fechaPerdida >= u.ultima_fecha)) {
      return { ...comun, estado: "perdida", fechaPerdida };
    }
    if (!u) {
      if (!enUniverso) return { ...comun, estado: "fuera_de_sector" };
      return { ...comun, estado: previsto ? "prevista" : "disponible" };
    }
    const liberacion = u.fecha_liberacion || addMeses(u.ultima_fecha, MESES_BLOQUEO);
    if (liberacion > R) {
      return { ...comun, estado: "bloqueada", ultimaFecha: u.ultima_fecha,
               fechaLiberacion: liberacion, codigo: u.codigo };
    }
    return {
      ...comun,
      estado: previsto ? "prevista" : "con_historial",
      ultimaFecha: u.ultima_fecha,
      fechaLiberacion: liberacion,
      codigo: u.codigo,
    };
  }).sort((a, b) => a.pieza - b.pieza);

  // Los conteos solo miran el universo: lo de fuera se enseña pero no suma.
  const delUniverso = piezas.filter(p => p.enUniverso);
  const cuenta = (...estados) => delUniverso.filter(p => estados.includes(p.estado));

  return {
    familia, R, incluyeTemporales,
    piezas,
    total:        delUniverso.length,
    disponibles:  cuenta("disponible", "con_historial"),
    previstas:    cuenta("prevista"),
    bloqueadas:   cuenta("bloqueada"),
    perdidas:     cuenta("perdida"),
  };
}

// Las que se liberan dentro de un mes concreto. Es lo que la vista mensual
// resalta: no "tiene hueco", sino "este mes se le abre algo".
export function liberadasEnElMes(estado, anio, mes) {
  const ini = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const fin = ultimoDiaDelMes(anio, mes);
  return estado.piezas.filter(p =>
    p.enUniverso && p.estado === "con_historial" &&
    p.fechaLiberacion >= ini && p.fechaLiberacion <= fin);
}

export const ultimoDiaDelMes = (anio, mes) =>
  `${anio}-${String(mes).padStart(2, "0")}-${new Date(Date.UTC(anio, mes, 0)).getUTCDate()}`;
