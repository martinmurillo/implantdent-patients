// ─── Fragmenta ───────────────────────────────────────────────────────────────
// Financiación de la entrega inicial. La clínica cobra la entrega igual; lo que
// cambia es que el paciente no la pone de una, sino que se la paga a Fragmenta.
//
// El interés es una COMISIÓN FIJA según importe y plazo, y se cobra entera en
// la primera cuota.
//
//   ┌──────────────────────────────────────────────────────────────────────┐
//   │  TARIFAS — editar aquí cuando la financiera las cambie.              │
//   │  "hasta" es el límite superior del tramo, incluido.                  │
//   └──────────────────────────────────────────────────────────────────────┘

export const PLAZOS      = [3, 5, 10, 12];
export const IMPORTE_MIN = 59;
export const IMPORTE_MAX = 2000;

export const TARIFAS = [
  //  tramo hasta         3       5      10      12   cuotas
  { hasta:  400, comision: { 3:  0, 5:  7.5, 10: 12.5, 12:  15 } },
  { hasta:  550, comision: { 3:  0, 5: 12.5, 10: 20,   12:  30 } },
  { hasta:  750, comision: { 3:  0, 5: 17.5, 10: 30,   12:  40 } },
  { hasta:  850, comision: { 3:  0, 5: 20,   10: 35,   12:  45 } },
  { hasta: 1000, comision: { 3: 30, 5: 35,   10: 55,   12:  60 } },
  { hasta: 1250, comision: { 3: 35, 5: 45,   10: 65,   12:  75 } },
  { hasta: 1500, comision: { 3: 40, 5: 50,   10: 70,   12:  95 } },
  { hasta: 2000, comision: { 3: 45, 5: 55,   10: 75,   12: 105 } },
];

// ─────────────────────────────────────────────────────────────────────────────
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const financiable = (importe) => {
  const i = Number(importe) || 0;
  return i >= IMPORTE_MIN && i <= IMPORTE_MAX;
};

// Por qué no se puede financiar, para poder enseñarlo en pantalla
export const motivoNoFinanciable = (importe) => {
  const i = Number(importe) || 0;
  if (i < IMPORTE_MIN) return `Fragmenta financia desde ${IMPORTE_MIN} €`;
  if (i > IMPORTE_MAX) return `Fragmenta llega hasta ${IMPORTE_MAX} €`;
  return null;
};

export const comisionFragmenta = (importe, plazo) => {
  const i = Number(importe) || 0;
  const n = Number(plazo) || 0;
  if (!financiable(i) || !PLAZOS.includes(n)) return null;
  const tramo = TARIFAS.find(t => i <= t.hasta);
  return tramo ? tramo.comision[n] : null;
};

// La comisión se puede pasar a mano para respetar la que se firmó: las tarifas
// cambian y un plan viejo no puede recalcularse con las de hoy.
export function calcFragmenta({ importe, plazo, comision = null }) {
  const imp = round2(Number(importe) || 0);
  const n   = Number(plazo) || 0;
  if (!financiable(imp) || !PLAZOS.includes(n)) return null;

  const com = (comision === null || comision === undefined || comision === "")
    ? comisionFragmenta(imp, n)
    : round2(Number(comision) || 0);
  if (com === null) return null;

  // Tal cual lo presenta la financiera: la cuota base es el importe entre el
  // plazo, y la comisión entera se suma a la primera.
  const base    = round2(imp / n);
  const primera = round2(base + com);
  return {
    importe: imp, plazo: n, comision: com, base, primera,
    cuotas: Array.from({ length: n }, (_, i) => (i === 0 ? primera : base)),
    total: round2(imp + com),
  };
}

// ─── Línea de tiempo ─────────────────────────────────────────────────────────
// Fragmenta arranca en el mes 1: la primera cuota se cobra al firmar.
// La cuota de clínica arranca cuando diga el plan (normalmente el mes 2,
// porque el mes 1 es la entrega). De ahí que se solapen unos meses.
export function lineaDeTiempo({ porMesClinica = [], fragmenta = null, nMeses = 12 }) {
  const filas = [];
  for (let m = 1; m <= nMeses; m++) {
    const fr = fragmenta && m <= fragmenta.plazo ? fragmenta.cuotas[m - 1] : 0;
    const cl = round2(porMesClinica[m - 1] || 0);
    filas.push({ mes: m, fragmenta: round2(fr), clinica: cl, total: round2(fr + cl) });
  }
  return filas;
}

// Agrupa meses consecutivos con el mismo total, para poder contarlo en una frase
export function tramosDePago(filas) {
  const out = [];
  for (const f of filas) {
    const ult = out[out.length - 1];
    if (ult && Math.abs(ult.importe - f.total) < 0.005) { ult.hasta = f.mes; ult.meses++; }
    else out.push({ desde: f.mes, hasta: f.mes, meses: 1, importe: f.total });
  }
  return out;
}

const eur = (n) => `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

// "Durante los primeros 6 meses paga 593,41 € al mes, después 166,67 €
//  durante 6 meses."
export function fraseTramos(filas) {
  const tr = tramosDePago(filas).filter(t => t.importe > 0.005);
  if (!tr.length) return "";
  const trozo = (t, i) => {
    const cuanto = eur(t.importe);
    if (t.meses === 1) return i === 0 ? `El mes ${t.desde} paga ${cuanto}` : `${cuanto} el mes ${t.desde}`;
    if (i === 0) return `Durante los primeros ${t.meses} meses paga ${cuanto} al mes`;
    return `${cuanto} al mes durante ${t.meses} meses`;
  };
  const partes = tr.map(trozo);
  if (partes.length === 1) return partes[0] + ".";
  return `${partes[0]}, después ${partes.slice(1).join(", y luego ")}.`;
}

// ─── Etiquetas de mes ────────────────────────────────────────────────────────
const MESES_CORTOS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

// mes 1 = la fecha de inicio. Devuelve "Ago 26".
export function etiquetaMes(fechaInicioISO, mes) {
  if (!fechaInicioISO) return `Mes ${mes}`;
  const [y, m] = String(fechaInicioISO).split("-").map(Number);
  const total = (m - 1) + (mes - 1);
  const anio  = y + Math.floor(total / 12);
  const idx   = ((total % 12) + 12) % 12;
  return `${MESES_CORTOS[idx]} ${String(anio).slice(-2)}`;
}
