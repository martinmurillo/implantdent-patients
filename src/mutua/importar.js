// Lectura del export del portal de la mutua.
//
// El archivo llega como `treatments_list_AAAAMMDDHHMM.xlsx`, una hoja llamada
// "Adeland Export" con el historial completo. No hay clave por la que casar
// filas viejas con nuevas —hay filas idénticas legítimas, como dos radiografías
// el mismo día— así que cada importación reemplaza todo.

const DIACRITICOS = /[̀-ͯ]/g;

// Los nombres de columna del portal, tal cual. Si el portal cambia el export,
// esto tiene que fallar con un mensaje claro y no importar medio archivo.
export const COLUMNAS_EXCEL = [
  "Información de Paciente", "DNI del paciente", "código", "Tratamiento",
  "Precio", "Pieza", "Producto", "Creado el", "Facturado", "Fecha Alb/Fact",
  "Devuelto", "Fecha de Realización",
];

export const HOJA_EXCEL = "Adeland Export";

// dd/mm/aaaa como texto, que es lo que manda hoy el portal, o una fecha nativa
// de Excel por si algún día la manda así. Nunca toISOString(): en Madrid, de
// madrugada, devuelve el día anterior.
export const aFecha = (v) => {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toLocaleDateString("sv-SE");
  const t = String(v).trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
};

export const normalizarNombre = (s) => String(s || "")
  .normalize("NFD").replace(DIACRITICOS, "")
  .replace(/\s+/g, " ").trim().toUpperCase();

export const normalizarDni = (s) => {
  const d = String(s || "").replace(/\s+/g, "").toUpperCase();
  return d || null;
};

// 29 de los 233 pacientes no tienen DNI, casi todos menores. Se les identifica
// por el nombre normalizado, con prefijo para que nunca se pueda confundir con
// un DNI de verdad.
export const claveDePaciente = (dni, nombre) =>
  dni || `NOM:${normalizarNombre(nombre)}`;

const aEntero = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/**
 * Convierte las filas crudas del Excel en filas listas para la base.
 * Devuelve { filas, faltan, descartadas }: `faltan` son columnas que el
 * archivo no trae —si hay alguna, no se importa nada— y `descartadas` las
 * filas sin fecha de realización, que es el dato del que cuelga todo.
 */
export function normalizarFilas(crudo = []) {
  const presentes = new Set(Object.keys(crudo[0] || {}));
  const faltan = COLUMNAS_EXCEL.filter(c => !presentes.has(c));
  if (faltan.length) return { filas: [], faltan, descartadas: 0 };

  const filas = [];
  let descartadas = 0;
  for (const f of crudo) {
    const fecha_realizacion = aFecha(f["Fecha de Realización"]);
    if (!fecha_realizacion) { descartadas++; continue; }
    const dni = normalizarDni(f["DNI del paciente"]);
    const nombre = normalizarNombre(f["Información de Paciente"]);
    filas.push({
      paciente_key: claveDePaciente(dni, nombre),
      dni, nombre,
      codigo: aEntero(f["código"]),
      tratamiento: String(f["Tratamiento"] ?? "").trim(),
      precio: Number(f["Precio"]) || 0,
      pieza: aEntero(f["Pieza"]),
      producto: String(f["Producto"] ?? "").trim() || null,
      creado_el: aFecha(f["Creado el"]),
      facturado: aFecha(f["Facturado"]),
      fecha_alb_fact: aFecha(f["Fecha Alb/Fact"]),
      devuelto: aFecha(f["Devuelto"]),
      fecha_realizacion,
    });
  }
  return { filas, faltan: [], descartadas };
}

export function resumenImportacion(filas = []) {
  const fechas = filas.map(f => f.fecha_realizacion).filter(Boolean).sort();
  return {
    filas: filas.length,
    pacientes: new Set(filas.map(f => f.paciente_key)).size,
    fechaMin: fechas[0] || null,
    fechaMax: fechas[fechas.length - 1] || null,
  };
}

/**
 * ¿Este archivo parece peor que lo que ya hay cargado? El export trae siempre
 * el historial completo, así que uno con menos filas o que empieza más tarde
 * suele ser un filtro mal puesto en el portal, y como la importación reemplaza
 * todo, se perdería historial sin avisar.
 */
export function avisoDeRetroceso(nuevo, actual) {
  if (!actual || !actual.filas) return null;
  if (nuevo.filas < actual.filas) {
    return `Este archivo parece tener menos historial que el actual: ` +
           `${nuevo.filas} filas vs ${actual.filas}. ¿Reemplazar igual?`;
  }
  if (actual.fechaMin && nuevo.fechaMin && nuevo.fechaMin > actual.fechaMin) {
    return `Este archivo empieza más tarde que el actual: ` +
           `${nuevo.fechaMin} vs ${actual.fechaMin}. ¿Reemplazar igual?`;
  }
  return null;
}
