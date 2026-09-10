// Corre los tests de aceptación de docs/spec_seccion_mutua.md contra el export
// real, usando la misma función pura que usa la aplicación.
//
// El Excel lleva DNI y datos de salud, así que no está en el repo: el script sí
// y el archivo no. Se le pasa la ruta, o busca el más reciente en docs/.
//
//   node scripts/verificar-mutua.mjs [ruta.xlsx] [YYYY-MM-DD]
//
// La fecha es el "hoy" con el que se calcula; por defecto, hoy de verdad.

import XLSX from "xlsx";
import { readdirSync } from "node:fs";
import { calcularEstadoPiezas, liberadasEnElMes, ultimoDiaDelMes } from "../src/mutua/reglas.js";
import { addMeses } from "../src/planCalc.js";

const FAMILIAS = new Map(Object.entries({
  32301: "OBTURACION", 32102: "OBTURACION", 32101: "OBTURACION",
  32302: "ANGULOS",    32103: "ANGULOS",
  32020: "PERDIDA", 32450: "PERDIDA", 32222: "PERDIDA", 32452: "PERDIDA",
  32543: "PERDIDA", 32878: "PERDIDA", 32890: "PERDIDA",
}).map(([k, v]) => [Number(k), v]));

const COLUMNAS = ["Información de Paciente", "DNI del paciente", "código", "Tratamiento",
  "Precio", "Pieza", "Producto", "Creado el", "Facturado", "Fecha Alb/Fact", "Devuelto",
  "Fecha de Realización"];

const DIACRITICOS = /[̀-ͯ]/g;

const aIso = (t) => {
  if (!t) return null;
  if (t instanceof Date) return t.toLocaleDateString("sv-SE");
  const [d, m, y] = String(t).split("/");
  return y ? `${y}-${m}-${d}` : null;
};
const normNombre = (s) => String(s || "").normalize("NFD").replace(DIACRITICOS, "")
  .trim().replace(/\s+/g, " ").toUpperCase();

const ruta = process.argv[2] || "docs/" + readdirSync("docs")
  .filter(f => /^treatments_list_.*\.xlsx$/.test(f)).sort().pop();
const HOY = process.argv[3] || new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

const wb = XLSX.readFile(ruta, { cellDates: true });
const hoja = wb.Sheets["Adeland Export"] || wb.Sheets[wb.SheetNames[0]];
const crudo = XLSX.utils.sheet_to_json(hoja, { defval: null });

const faltan = COLUMNAS.filter(c => !(c in (crudo[0] || {})));
if (faltan.length) { console.error("Faltan columnas:", faltan.join(", ")); process.exit(1); }

const filas = crudo.map(f => {
  const dni = String(f["DNI del paciente"] || "").trim().toUpperCase();
  const nombre = normNombre(f["Información de Paciente"]);
  const codigo = Number(f["código"]);
  return {
    paciente_key: dni || `NOM:${nombre}`, dni: dni || null, nombre, codigo,
    familia: FAMILIAS.get(codigo) || null,
    pieza: f["Pieza"] == null ? null : Number(f["Pieza"]),
    devuelto: aIso(f["Devuelto"]),
    fecha_realizacion: aIso(f["Fecha de Realización"]),
  };
});

// Lo que en producción hacen las vistas mutua_ultimas, mutua_perdidas y
// mutua_pacientes. Si esto y el SQL se separan, los números dejan de valer.
const pacientes = new Map();
for (const f of filas) {
  if (!pacientes.has(f.paciente_key)) {
    pacientes.set(f.paciente_key, {
      key: f.paciente_key, nombre: f.nombre, dni: f.dni,
      ultimas: new Map(), perdidas: new Map(),
      ultima_visita: null, ultima_temporal: null,
    });
  }
  const p = pacientes.get(f.paciente_key);
  if (!p.ultima_visita || f.fecha_realizacion > p.ultima_visita) p.ultima_visita = f.fecha_realizacion;
  if (f.pieza >= 51 && (!p.ultima_temporal || f.fecha_realizacion > p.ultima_temporal)) {
    p.ultima_temporal = f.fecha_realizacion;
  }
  if (f.pieza == null || f.devuelto) continue;
  if (f.familia === "PERDIDA") {
    const prev = p.perdidas.get(f.pieza);
    if (!prev || f.fecha_realizacion > prev) p.perdidas.set(f.pieza, f.fecha_realizacion);
  } else if (f.familia) {
    const k = `${f.familia}|${f.pieza}`;
    const prev = p.ultimas.get(k);
    if (!prev || f.fecha_realizacion > prev.ultima_fecha) {
      p.ultimas.set(k, {
        familia: f.familia, pieza: f.pieza, codigo: f.codigo,
        ultima_fecha: f.fecha_realizacion,
        fecha_liberacion: addMeses(f.fecha_realizacion, 6),
      });
    }
  }
}

const arg = (p) => ({
  ultimas: [...p.ultimas.values()],
  perdidas: [...p.perdidas.entries()].map(([pieza, fecha_perdida]) => ({ pieza, fecha_perdida })),
  ultimaTemporal: p.ultima_temporal,
});
const estados = (p, R) => ({
  OBTURACION: calcularEstadoPiezas({ familia: "OBTURACION", ...arg(p), R }),
  ANGULOS: calcularEstadoPiezas({ familia: "ANGULOS", ...arg(p), R }),
});

function vistaMes(anio, mes, mesesFiltro) {
  const R = ultimoDiaDelMes(anio, mes);
  const corte = mesesFiltro ? addMeses(HOY, -mesesFiltro) : "0000-00-00";
  let lista = 0, liberan = 0, todoDisponible = 0, conBloqueadas = 0;
  for (const p of pacientes.values()) {
    if (p.ultima_visita < corte) continue;
    const e = estados(p, R);
    if (e.OBTURACION.disponibles.length + e.ANGULOS.disponibles.length === 0) continue;
    lista++;
    const lib = liberadasEnElMes(e.OBTURACION, anio, mes).length
              + liberadasEnElMes(e.ANGULOS, anio, mes).length;
    if (lib) liberan++;
    if (e.OBTURACION.bloqueadas.length + e.ANGULOS.bloqueadas.length) conBloqueadas++;
    else todoDisponible++;
  }
  return { lista, liberan, todoDisponible, conBloqueadas };
}

// ── Comprobaciones ──────────────────────────────────────────────────────────
let ok = 0, mal = 0;
const chk = (nombre, real, esperado) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  bien ? ok++ : mal++;
  console.log(`  ${bien ? "OK  " : "MAL "} ${nombre}`);
  if (!bien) {
    console.log(`         esperado ${JSON.stringify(esperado)}`);
    console.log(`         obtenido ${JSON.stringify(real)}`);
  }
};
const buscar = (q) => {
  const n = normNombre(q);
  return [...pacientes.values()].filter(p => p.key.toUpperCase().includes(n) || p.nombre.includes(n));
};
const resumen = (p, fam, R) => {
  const e = estados(p, R)[fam];
  return [e.disponibles.length, e.total, e.bloqueadas.map(x => x.pieza),
          [...new Set(e.bloqueadas.map(x => x.fechaLiberacion))]];
};

console.log(`\nArchivo: ${ruta}`);
console.log(`Hoy:     ${HOY}\n`);

console.log("1 - Import");
chk("3465 filas", filas.length, 3465);
chk("233 pacientes", pacientes.size, 233);
chk("204 con DNI, 29 sin DNI",
  [[...pacientes.values()].filter(p => p.dni).length,
   [...pacientes.values()].filter(p => !p.dni).length], [204, 29]);
chk("maxima realizacion 2026-08-28", filas.map(f => f.fecha_realizacion).sort().pop(), "2026-08-28");

console.log("2 - Septiembre 2026, ambos tratamientos");
chk("24 meses -> 75/13/55/20", Object.values(vistaMes(2026, 9, 24)), [75, 13, 55, 20]);
chk("12 meses -> 50/13/30/20", Object.values(vistaMes(2026, 9, 12)), [50, 13, 30, 20]);
chk("Todos   -> 233/13/213/20", Object.values(vistaMes(2026, 9, 0)), [233, 13, 213, 20]);

console.log("3 - Liberaciones");
chk("octubre 2026 -> 4", vistaMes(2026, 10, 0).liberan, 4);
chk("noviembre 2026 -> 0", vistaMes(2026, 11, 0).liberan, 0);

console.log("4 - Ficha 41674423X (Eric)");
const eric = buscar("41674423x")[0];
chk("obturacion 26/32, bloq 14,26,34,35,44,45 hasta 2027-02-17",
  resumen(eric, "OBTURACION", HOY), [26, 32, [14, 26, 34, 35, 44, 45], ["2027-02-17"]]);
chk("angulos 9/12, bloq 11,12,41 hasta 2027-02-17",
  resumen(eric, "ANGULOS", HOY), [9, 12, [11, 12, 41], ["2027-02-17"]]);
chk("pieza 25: toma la mas reciente y queda disponible",
  estados(eric, HOY).OBTURACION.piezas.find(p => p.pieza === 25).estado, "con_historial");
chk("sin temporales", estados(eric, HOY).OBTURACION.incluyeTemporales, false);

console.log("5 - Sin DNI + temporales (Canadas)");
const mia = buscar("canadas")[0];
chk("la encuentra sin tilde", mia?.nombre, "MIA JULIETH CANADAS GALAN");
chk("incluye temporales", estados(mia, HOY).OBTURACION.incluyeTemporales, true);
chk("55 bloqueada hasta 2026-09-17", resumen(mia, "OBTURACION", HOY), [51, 52, [55], ["2026-09-17"]]);
chk("en septiembre se libera la 55",
  liberadasEnElMes(estados(mia, ultimoDiaDelMes(2026, 9)).OBTURACION, 2026, 9)
    .map(p => `${p.pieza} desde ${p.fechaLiberacion}`), ["55 desde 2026-09-17"]);

console.log("6 - Piezas perdidas (Rachid X6973651M)");
const rachid = buscar("X6973651M")[0];
chk("perdidas 24,28,36,48", estados(rachid, HOY).OBTURACION.perdidas.map(p => p.pieza), [24, 28, 36, 48]);
chk("obturacion 23/32", estados(rachid, HOY).OBTURACION.disponibles.length, 23);

console.log("7 - Devuelto (Velasquez, pieza 15)");
const ruben = buscar("VELASQUEZ URBINA")[0];
chk("la devuelta no bloquea la 15",
  estados(ruben, HOY).OBTURACION.piezas.find(p => p.pieza === 15).estado, "disponible");
chk("sigue en el historial con su devolucion",
  filas.filter(f => f.paciente_key === ruben.key && f.pieza === 15 && f.devuelto).map(f => f.devuelto),
  ["2026-08-06"]);

console.log("8 - Sin pieza (Ana 26475037J)");
chk("un unico angulo sin pieza en todo el archivo",
  filas.filter(f => (f.familia === "OBTURACION" || f.familia === "ANGULOS") && f.pieza == null)
    .map(f => `${f.paciente_key} ${f.fecha_realizacion}`), ["26475037J 2021-04-20"]);
chk("no afecta al calculo: angulos 12/12",
  estados(buscar("26475037J")[0], HOY).ANGULOS.disponibles.length, 12);

console.log("9 - Busqueda");
chk("'41674423x' en minuscula", buscar("41674423x").length, 1);
chk("'canadas' sin tilde", buscar("canadas").length, 1);

console.log("10 - Fechas");
chk("31/08/2026 + 6 meses = 28/02/2027", addMeses("2026-08-31", 6), "2027-02-28");
chk("31/08/2027 + 6 meses = 29/02/2028", addMeses("2027-08-31", 6), "2028-02-29");

console.log(`\n${ok} bien, ${mal} mal\n`);
process.exit(mal ? 1 : 0);
